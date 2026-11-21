"""API del Company Brain (contratto in docs/api.md).

Le garanzie stanno qui, non nel prompt:
- l'identità arriva dall'header `X-Persona` o dal cookie `persona`, mai dal testo di una richiesta;
- la memoria (task, fatti, indice di ricerca) contiene solo ciò che il manager ha approvato;
- i permessi (`puo_vedere`) si applicano prima di passare qualunque cosa al modello;
- le citazioni si ricostruiscono dai segmenti salvati: ciò che non cita un segmento vero si scarta;
- ogni passo finisce nel registro.
"""

import asyncio
import json
import sqlite3
from contextlib import asynccontextmanager

from fastapi import Cookie, Depends, FastAPI, Header, HTTPException, Response, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ValidationError

from backend import db, ricerca, todo
from backend.analisi import analizza_documento                      # I2, di Franky
from backend.analisi.ingestione import DocumentoNonValido, segmenta  # F2, di Franky
from backend.domande import rispondi                                 # I3, di Franky
from backend.modelli import (TESTO_NEUTRO, Area, Avviso, Citazione, ContestoProgetto, Fatto, PassoRegistro,
                             Persona, Progetto, Proposta, RisultatoAnalisi, Risposta, Task, puo_vedere,
                             puo_vedere_avviso)


@asynccontextmanager
async def avvio(app: FastAPI):
    db.inizializza()
    yield


app = FastAPI(title="Company Brain · Automazioni Dora", version="0.2.0", lifespan=avvio)


def get_db():
    conn = db.connetti()
    try:
        yield conn
        conn.commit()
    except BaseException:
        conn.rollback()
        raise
    finally:
        conn.close()


# --- Identità (I5) e permessi -------------------------------------------------------------------

def persona_corrente(conn: sqlite3.Connection = Depends(get_db),
                     x_persona: str | None = Header(default=None),
                     persona: str | None = Cookie(default=None)) -> Persona:
    chi = db.persona(conn, x_persona or persona or "")
    if chi is None:
        raise HTTPException(401, "Sessione mancante: scegli una persona.")
    return chi


def membro(conn: sqlite3.Connection, progetto_id: str, chi: Persona) -> Progetto:
    prj = db.progetto(conn, progetto_id)
    if prj is None or chi.id not in prj.membri:
        raise HTTPException(403, "Non fai parte di questo progetto.")
    return prj


def manager(conn: sqlite3.Connection, progetto_id: str, chi: Persona) -> Progetto:
    prj = membro(conn, progetto_id, chi)
    if chi.id != prj.manager_id:
        raise HTTPException(403, "Solo il manager del progetto può farlo.")
    return prj


# --- Sessione e anagrafica ----------------------------------------------------------------------

class RichiestaSessione(BaseModel):
    persona_id: str


@app.post("/sessione")
def apri_sessione(body: RichiestaSessione, response: Response,
                  conn: sqlite3.Connection = Depends(get_db)) -> Persona:
    chi = db.persona(conn, body.persona_id)
    if chi is None:
        raise HTTPException(404, "Persona sconosciuta.")
    response.set_cookie("persona", chi.id, httponly=True, samesite="lax")
    return chi


@app.get("/persone")
def elenco_persone(conn: sqlite3.Connection = Depends(get_db)) -> list[Persona]:
    return db.persone(conn)


@app.get("/progetti/{progetto_id}")
def dettaglio_progetto(progetto_id: str, chi: Persona = Depends(persona_corrente),
                       conn: sqlite3.Connection = Depends(get_db)) -> Progetto:
    return membro(conn, progetto_id, chi)


# --- Documenti: ingestion -> analisi -> proposte e avvisi ---------------------------------------

class EsitoCaricamento(BaseModel):
    documento_id: str
    proposte: int
    avvisi: int
    scartate: int = 0   # proposte senza una citazione valida


def _citazioni_vere(conn: sqlite3.Connection, citazioni: list[Citazione], progetto_id: str) -> list[dict]:
    """Tiene solo le citazioni di segmenti che esistono nel progetto, riscritte dal db."""
    vere = {}
    for c in citazioni:
        vera = db.citazione(conn, c.segmento_id, progetto_id)
        if vera:
            vere[vera.segmento_id] = vera.model_dump()
    return list(vere.values())


def _salva_risultato(conn: sqlite3.Connection, prj: Progetto, documento_id: str,
                     risultato: RisultatoAnalisi) -> tuple[int, int, int]:
    salvate = scartate = 0
    for p in risultato.proposte:
        citazioni = _citazioni_vere(conn, p.citazioni, prj.id)
        if not citazioni:
            scartate += 1
            db.registra(conn, "workflow", "brain", "proposta_scartata", progetto_id=prj.id,
                        documento_id=documento_id, input={"tipo": p.tipo}, esito="scartato",
                        motivo="nessuna citazione valida")
            continue
        contenuto = dict(p.contenuto)
        if p.tipo == "nuovo_task" and contenuto.get("assegnatario_id") not in prj.membri:
            contenuto["assegnatario_id"] = None   # mai un assegnatario fuori dal progetto
        conn.execute(
            "INSERT INTO proposte (id, progetto_id, documento_id, tipo, contenuto, aree_proposte, sicurezza, "
            "citazioni, creata_il) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (db.nuovo_id(conn, "proposte", "prop"), prj.id, documento_id, p.tipo, db._j(contenuto),
             db._j(p.aree_proposte), p.sicurezza, db._j(citazioni), db.ora()))
        salvate += 1
    in_attesa = {r[0] for r in conn.execute(
        "SELECT id FROM proposte WHERE progetto_id = ? AND stato = 'in_attesa'", (prj.id,))}
    for a in risultato.avvisi:
        conn.execute(   # solo_manager = 1: finché il manager non lo inoltra, l'avviso lo vede solo lui
            "INSERT INTO avvisi (id, progetto_id, documento_id, tipo, testo, citazioni, aree, basato_su_proposte, "
            "solo_manager, creato_il) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)",
            (db.nuovo_id(conn, "avvisi", "avv"), prj.id, documento_id, a.tipo, a.testo,
             db._j(_citazioni_vere(conn, a.citazioni, prj.id)), db._j(a.aree),
             db._j([p for p in a.basato_su_proposte if p in in_attesa]), db.ora()))
    return salvate, len(risultato.avvisi), scartate


def _contesto(conn: sqlite3.Connection, prj: Progetto, escluso: str) -> ContestoProgetto:
    return ContestoProgetto(
        progetto=prj, persone=db.persone(conn, prj.id),
        persone_azienda=[p for p in db.persone(conn) if p.id not in prj.membri],
        proposte_in_attesa=[db.proposta(r) for r in conn.execute(
            "SELECT * FROM proposte WHERE progetto_id = ? AND stato = 'in_attesa' ORDER BY id", (prj.id,))],
        task=todo.task_del_progetto(conn, prj.id),
        fatti=[db.fatto(r) for r in conn.execute("SELECT * FROM fatti WHERE progetto_id = ?", (prj.id,))],
        documenti_precedenti=[r[0] for r in conn.execute(
            "SELECT id FROM documenti WHERE progetto_id = ? AND id != ? ORDER BY data", (prj.id, escluso))])


def _carica(conn: sqlite3.Connection, progetto_id: str, file: UploadFile, chi: Persona, tipo: str) -> EsitoCaricamento:
    prj = manager(conn, progetto_id, chi)
    try:
        doc = segmenta(file.file.read().decode("utf-8"), prj.id)
    except (DocumentoNonValido, UnicodeDecodeError):
        raise HTTPException(422, "Documento non valido: serve una minuta in markdown con intestazione e interventi.")
    doc.progetto_id, doc.tipo = prj.id, tipo   # il progetto arriva dalla richiesta, non dal file
    if conn.execute("SELECT 1 FROM documenti WHERE id = ?", (doc.id,)).fetchone():
        raise HTTPException(409, f"Il documento {doc.id} è già stato caricato.")

    conn.execute("INSERT INTO documenti VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                 (doc.id, prj.id, doc.tipo, doc.formato, doc.titolo, doc.data, doc.ora_inizio,
                  db._j(doc.partecipanti), db.ora()))
    conn.executemany("INSERT INTO segmenti VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                     [(s.id, doc.id, n, s.speaker, s.persona_id, s.inizio, s.fine, s.testo)
                      for n, s in enumerate(doc.segmenti, 1)])
    db.registra(conn, "caricamento", chi.id, "caricamento", progetto_id=prj.id, documento_id=doc.id,
                input={"tipo": tipo, "formato": doc.formato}, output={"segmenti": len(doc.segmenti)})
    contesto = _contesto(conn, prj, doc.id)
    conn.commit()   # l'analisi può durare: non si tiene il db bloccato mentre il modello lavora

    try:
        risultato = analizza_documento(doc, contesto)
    except Exception as errore:
        conn.execute("DELETE FROM segmenti WHERE documento_id = ?", (doc.id,))
        conn.execute("DELETE FROM documenti WHERE id = ?", (doc.id,))
        db.registra(conn, "workflow", "brain", "analisi", progetto_id=prj.id, documento_id=doc.id,
                    esito="errore", motivo=f"{type(errore).__name__}: {errore}")
        conn.commit()
        raise HTTPException(502, "L'analisi non è riuscita. Il documento non è stato salvato: riprova.")

    for passo in risultato.passi:   # la traccia del workflow, così come la scrive il cervello
        db.registra_passo(conn, prj.id, passo.model_copy(update={"documento_id": passo.documento_id or doc.id}))
    proposte, avvisi, scartate = _salva_risultato(conn, prj, doc.id, risultato)
    db.registra(conn, "workflow", "brain", "salvataggio", progetto_id=prj.id, documento_id=doc.id,
                output={"proposte": proposte, "avvisi": avvisi, "scartate": scartate})
    return EsitoCaricamento(documento_id=doc.id, proposte=proposte, avvisi=avvisi, scartate=scartate)


@app.post("/riunioni")
def carica_riunione(progetto_id: str, file: UploadFile, chi: Persona = Depends(persona_corrente),
                    conn: sqlite3.Connection = Depends(get_db)) -> EsitoCaricamento:
    return _carica(conn, progetto_id, file, chi, "riunione")


@app.post("/documenti")
def carica_documento(progetto_id: str, file: UploadFile, chi: Persona = Depends(persona_corrente),
                     conn: sqlite3.Connection = Depends(get_db)) -> EsitoCaricamento:
    return _carica(conn, progetto_id, file, chi, "integrativo")


@app.get("/segmenti/{segmento_id}")
def dettaglio_segmento(segmento_id: str, chi: Persona = Depends(persona_corrente),
                       conn: sqlite3.Connection = Depends(get_db)) -> Citazione:
    """Il manager apre qualunque segmento; gli altri solo quelli citati da una voce che possono vedere."""
    r = conn.execute("SELECT d.progetto_id FROM segmenti s JOIN documenti d ON d.id = s.documento_id "
                     "WHERE s.id = ?", (segmento_id,)).fetchone()
    prj = db.progetto(conn, r["progetto_id"]) if r else None
    if prj and chi.id in prj.membri:
        voci = todo.task_del_progetto(conn, prj.id) + [
            db.fatto(f) for f in conn.execute("SELECT * FROM fatti WHERE progetto_id = ?", (prj.id,))]
        citato = any(puo_vedere(chi, prj, v.aree) and any(c.segmento_id == segmento_id for c in v.citazioni)
                     for v in voci)
        if chi.id == prj.manager_id or citato:
            return db.citazione(conn, segmento_id, prj.id)
    raise HTTPException(404, "Segmento non trovato.")   # stessa risposta se esiste ma non è visibile


# --- Proposte: il manager cura la memoria -------------------------------------------------------

class Decisione(BaseModel):
    aree: list[Area] | None = None        # il manager conferma (null) o modifica le aree
    assegnatario_id: str | None = None    # solo per i task: scioglie un punto oscuro («quale Marco?»)
    nota: str | None = None


@app.get("/proposte")
def elenco_proposte(progetto_id: str, stato: str = "in_attesa", chi: Persona = Depends(persona_corrente),
                    conn: sqlite3.Connection = Depends(get_db)) -> list[Proposta]:
    """`stato`: in_attesa (default), approvata, rifiutata oppure tutte."""
    manager(conn, progetto_id, chi)
    righe = conn.execute("SELECT * FROM proposte WHERE progetto_id = ? AND (stato = ? OR ? = 'tutte') ORDER BY id",
                         (progetto_id, stato, stato))
    return [db.proposta(r) for r in righe]


def _proposta_in_attesa(conn: sqlite3.Connection, proposta_id: str, chi: Persona) -> tuple[Proposta, Progetto]:
    r = conn.execute("SELECT * FROM proposte WHERE id = ?", (proposta_id,)).fetchone()
    if r is None:
        raise HTTPException(404, "Proposta non trovata.")
    p = db.proposta(r)
    prj = manager(conn, p.progetto_id, chi)
    if p.stato != "in_attesa":
        raise HTTPException(409, f"Proposta già {p.stato}.")
    return p, prj


def _indicizza_task(conn: sqlite3.Connection, t: Task) -> None:
    assegnatario = db.persona(conn, t.assegnatario_id or "")
    ricerca.indicizza(conn, t.id, t.progetto_id, ricerca.testo_task(t, assegnatario.nome if assegnatario else None))


def _applica(conn: sqlite3.Connection, p: Proposta, prj: Progetto, aree: list[str], contenuto: dict) -> str:
    """Porta una proposta approvata nella memoria del progetto. Restituisce l'id della voce toccata."""
    if p.tipo == "nuovo_task":
        t = Task(id=db.nuovo_id(conn, "task", "task"), progetto_id=prj.id, aree=aree, citazioni=p.citazioni,
                 **{k: contenuto.get(k) for k in ("titolo", "assegnatario_id", "scadenza")},
                 dipende_da=contenuto.get("dipende_da") or [])
        conn.execute("INSERT INTO task VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                     (t.id, prj.id, t.titolo, t.assegnatario_id, t.scadenza, t.stato, db._j(aree),
                      db._j(t.dipende_da), db._j(t.citazioni), p.id))
        _indicizza_task(conn, t)
        return t.id
    if p.tipo == "nuovo_fatto":
        f = Fatto(id=db.nuovo_id(conn, "fatti", "fat"), progetto_id=prj.id, aree=aree, citazioni=p.citazioni,
                  **{k: contenuto.get(k) for k in ("soggetto", "attributo", "valore")})
        conn.execute("INSERT INTO fatti VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                     (f.id, prj.id, f.soggetto, f.attributo, f.valore, db._j(aree), db._j(f.citazioni), p.id))
        ricerca.indicizza(conn, f.id, prj.id, ricerca.testo_fatto(f))
        return f.id

    # aggiorna_task / chiudi_task: {"task_id", "campo", "valore"}
    r = conn.execute("SELECT * FROM task WHERE id = ? AND progetto_id = ?",
                     (contenuto.get("task_id"), prj.id)).fetchone()
    if r is None:
        raise HTTPException(409, "Il task da aggiornare non è nella lista del progetto.")
    campo, valore = ("stato", "fatto") if p.tipo == "chiudi_task" else (contenuto.get("campo"), contenuto.get("valore"))
    colonna = {"stato": "stato", "scadenza": "scadenza", "assegnatario": "assegnatario_id", "titolo": "titolo"}.get(campo)
    if (colonna is None or (campo == "stato" and valore not in ("da_fare", "in_corso", "fatto", "annullato"))
            or (campo == "assegnatario" and valore not in prj.membri)):
        raise HTTPException(422, "Aggiornamento non valido.")
    citazioni = {c["segmento_id"]: c for c in json.loads(r["citazioni"]) + [c.model_dump() for c in p.citazioni]}
    conn.execute(f"UPDATE task SET {colonna} = ?, citazioni = ? WHERE id = ?",
                 (valore, db._j(list(citazioni.values())), r["id"]))
    _indicizza_task(conn, db.task(conn.execute("SELECT * FROM task WHERE id = ?", (r["id"],)).fetchone()))
    return r["id"]


@app.post("/proposte/{proposta_id}/approva")
def approva(proposta_id: str, body: Decisione, chi: Persona = Depends(persona_corrente),
            conn: sqlite3.Connection = Depends(get_db)) -> Proposta:
    p, prj = _proposta_in_attesa(conn, proposta_id, chi)
    aree = body.aree or p.aree_proposte
    contenuto = dict(p.contenuto)
    if body.assegnatario_id is not None:
        if p.tipo != "nuovo_task" or body.assegnatario_id not in prj.membri:
            raise HTTPException(422, "L'assegnatario deve essere un membro del progetto.")
        contenuto["assegnatario_id"] = body.assegnatario_id
    try:
        voce_id = _applica(conn, p, prj, aree, contenuto)
    except ValidationError:
        raise HTTPException(422, "La proposta non è valida e non può essere approvata: rifiutala.")
    conn.execute("UPDATE proposte SET stato = 'approvata', contenuto = ?, aree_confermate = ?, decisa_da = ?, "
                 "decisa_il = ? WHERE id = ?", (db._j(contenuto), db._j(aree), chi.id, db.ora(), p.id))
    db.registra(conn, "decisione", chi.id, "approva", progetto_id=prj.id,
                input={"proposta_id": p.id, "aree": aree, "nota": body.nota}, output={"voce_id": voce_id})
    return db.proposta(conn.execute("SELECT * FROM proposte WHERE id = ?", (p.id,)).fetchone())


@app.post("/proposte/{proposta_id}/rifiuta")
def rifiuta(proposta_id: str, body: Decisione, chi: Persona = Depends(persona_corrente),
            conn: sqlite3.Connection = Depends(get_db)) -> Proposta:
    p, prj = _proposta_in_attesa(conn, proposta_id, chi)
    conn.execute("UPDATE proposte SET stato = 'rifiutata', decisa_da = ?, decisa_il = ? WHERE id = ?",
                 (chi.id, db.ora(), p.id))
    db.registra(conn, "decisione", chi.id, "rifiuta", progetto_id=prj.id,
                input={"proposta_id": p.id, "nota": body.nota})
    return db.proposta(conn.execute("SELECT * FROM proposte WHERE id = ?", (p.id,)).fetchone())


# --- Avvisi (SSE): il Brain parla per primo -----------------------------------------------------

def avvisi_visibili(conn: sqlite3.Connection, prj: Progetto, chi: Persona) -> list[Avviso]:
    """Avvisi aperti che `chi` può ricevere: tutti per il manager, per gli altri solo quelli inoltrati."""
    righe = conn.execute("SELECT * FROM avvisi WHERE progetto_id = ? AND risolto = 0 ORDER BY rowid", (prj.id,))
    return [a for a in map(db.avviso, righe) if puo_vedere_avviso(chi, prj, a)]


@app.get("/avvisi")
async def flusso_avvisi(progetto_id: str, chi: Persona = Depends(persona_corrente),
                        conn: sqlite3.Connection = Depends(get_db)) -> StreamingResponse:
    """Server-Sent Events: evento `avviso` per ogni avviso aperto, poi per ogni avviso nuovo o inoltrato."""
    prj = membro(conn, progetto_id, chi)

    async def eventi():
        mia = db.connetti()   # la connessione della richiesta si chiude: il flusso ne usa una sua
        try:
            inviati, giri = set(), 0
            while True:
                for a in avvisi_visibili(mia, prj, chi):
                    if a.id not in inviati:   # anche quelli vecchi, se il manager li inoltra adesso
                        inviati.add(a.id)
                        yield f"event: avviso\ndata: {a.model_dump_json()}\n\n"
                giri += 1
                if giri % 15 == 0:
                    yield ": ping\n\n"
                await asyncio.sleep(1)
        finally:
            mia.close()

    return StreamingResponse(eventi(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})


class Inoltro(BaseModel):
    persona_ids: list[str] = []   # a chi, per nome
    aree: list[Area] = []         # oppure a chi ha una di queste aree


@app.post("/avvisi/{avviso_id}/inoltra")
def inoltra_avviso(avviso_id: str, body: Inoltro, chi: Persona = Depends(persona_corrente),
                   conn: sqlite3.Connection = Depends(get_db)) -> Avviso:
    """Il manager decide chi vede l'avviso: da qui vale `puo_vedere_avviso()`."""
    r = conn.execute("SELECT * FROM avvisi WHERE id = ?", (avviso_id,)).fetchone()
    if r is None:
        raise HTTPException(404, "Avviso non trovato.")
    prj = manager(conn, r["progetto_id"], chi)
    ignoti = [pid for pid in body.persona_ids if pid not in prj.membri]
    if ignoti:
        raise HTTPException(422, f"Non sono membri del progetto: {', '.join(ignoti)}")
    aree = body.aree or json.loads(r["aree"])
    conn.execute("UPDATE avvisi SET solo_manager = 0, inoltrato_a = ?, aree = ? WHERE id = ?",
                 (db._j(body.persona_ids), db._j(aree), avviso_id))
    db.registra(conn, "decisione", chi.id, "inoltra_avviso", progetto_id=prj.id,
                input={"avviso_id": avviso_id, "persona_ids": body.persona_ids, "aree": aree})
    return db.avviso(conn.execute("SELECT * FROM avvisi WHERE id = ?", (avviso_id,)).fetchone())


@app.post("/avvisi/{avviso_id}/risolvi")
def risolvi_avviso(avviso_id: str, chi: Persona = Depends(persona_corrente),
                   conn: sqlite3.Connection = Depends(get_db)) -> Avviso:
    r = conn.execute("SELECT * FROM avvisi WHERE id = ?", (avviso_id,)).fetchone()
    if r is None:
        raise HTTPException(404, "Avviso non trovato.")
    prj = manager(conn, r["progetto_id"], chi)
    conn.execute("UPDATE avvisi SET risolto = 1 WHERE id = ?", (avviso_id,))
    db.registra(conn, "decisione", chi.id, "risolvi_avviso", progetto_id=prj.id, input={"avviso_id": avviso_id})
    return db.avviso(conn.execute("SELECT * FROM avvisi WHERE id = ?", (avviso_id,)).fetchone())


# --- To-do --------------------------------------------------------------------------------------

class TodoOggi(BaseModel):
    persona_id: str
    data: str
    accettata: bool
    task: list[Task]


class AccettaTodo(BaseModel):
    task_ids: list[str]   # l'ordine scelto dalla persona; può togliere voci per oggi


@app.get("/progetti/{progetto_id}/todo")
def todo_progetto(progetto_id: str, chi: Persona = Depends(persona_corrente),
                  conn: sqlite3.Connection = Depends(get_db)) -> list[Task]:
    prj = membro(conn, progetto_id, chi)
    return [t for t in todo.task_del_progetto(conn, prj.id) if puo_vedere(chi, prj, t.aree)]


@app.get("/persone/{persona_id}/todo-oggi")
def todo_oggi(persona_id: str, chi: Persona = Depends(persona_corrente),
              conn: sqlite3.Connection = Depends(get_db)) -> TodoOggi:
    if persona_id != chi.id:
        raise HTTPException(403, "Puoi vedere solo la tua to-do.")
    return TodoOggi(**todo.todo_oggi(conn, chi))


@app.post("/todo-oggi/accetta")
def accetta_todo(body: AccettaTodo, chi: Persona = Depends(persona_corrente),
                 conn: sqlite3.Connection = Depends(get_db)) -> TodoOggi:
    return TodoOggi(**todo.accetta(conn, chi, body.task_ids))


# --- Domande: «Chiedi al Brain» -----------------------------------------------------------------

class Domanda(BaseModel):
    progetto_id: str
    testo: str


@app.post("/domande")
def chiedi(body: Domanda, chi: Persona = Depends(persona_corrente),
           conn: sqlite3.Connection = Depends(get_db)) -> Risposta:
    prj = membro(conn, body.progetto_id, chi)
    # Dato mancante e dato riservato hanno la stessa risposta: il motivo vero resta nel registro.
    manager_nome = db.persona(conn, prj.manager_id).nome
    neutra = Risposta(esito="non_lo_so", testo=TESTO_NEUTRO.format(manager=manager_nome))

    def chiudi(risposta: Risposta, motivo: str | None, voci: list, trovate: int, esito: str = "ok") -> Risposta:
        db.registra(conn, "domanda", chi.id, "chiedi", progetto_id=prj.id, motivo=motivo, esito=esito,
                    input={"domanda": body.testo, "voci_passate_al_modello": [v.id for v in voci]},
                    output={"esito": risposta.esito, "trovate": trovate, "visibili": len(voci),
                            "citazioni": [c.segmento_id for c in risposta.citazioni]})
        return risposta

    voci, trovate = ricerca.cerca(conn, body.testo, chi, prj)
    if not voci:   # nessuna chiamata al modello
        return chiudi(neutra, "non_autorizzato" if trovate else "non_lo_so", voci, trovate)
    try:
        r = rispondi(body.testo, chi, voci, manager_nome)
    except Exception as errore:
        chiudi(neutra, f"{type(errore).__name__}: {errore}", voci, trovate, esito="errore")
        conn.commit()
        raise HTTPException(503, "Il Brain non riesce a rispondere in questo momento. Riprova.")

    # Valgono solo le citazioni di segmenti che stavano nelle voci passate al modello.
    ammesse = {c.segmento_id: c for v in voci for c in v.citazioni}
    citazioni = list({c.segmento_id: ammesse[c.segmento_id] for c in r.citazioni if c.segmento_id in ammesse}.values())
    if r.esito != "risposta":
        return chiudi(neutra, "non_lo_so", voci, trovate)
    if not citazioni or not r.testo.strip():
        return chiudi(neutra, "risposta senza citazioni valide", voci, trovate)
    return chiudi(Risposta(esito="risposta", testo=r.testo, citazioni=citazioni), None, voci, trovate)


# --- Eventi e registro --------------------------------------------------------------------------

class EventoSimulato(BaseModel):
    progetto_id: str
    tipo: str        # "errore_codice", "fine_giornata", ...
    descrizione: str


@app.post("/eventi/simula")
def simula_evento(body: EventoSimulato, chi: Persona = Depends(persona_corrente),
                  conn: sqlite3.Connection = Depends(get_db)) -> Avviso:
    prj = manager(conn, body.progetto_id, chi)
    avviso_id = db.nuovo_id(conn, "avvisi", "avv")
    conn.execute("INSERT INTO avvisi (id, progetto_id, tipo, testo, solo_manager, creato_il) VALUES (?, ?, ?, ?, 1, ?)",
                 (avviso_id, prj.id, "evento_esterno", body.descrizione, db.ora()))
    db.registra(conn, "caricamento", chi.id, "simula_evento", progetto_id=prj.id,
                input={"tipo": body.tipo, "descrizione": body.descrizione}, output={"avviso_id": avviso_id})
    return db.avviso(conn.execute("SELECT * FROM avvisi WHERE id = ?", (avviso_id,)).fetchone())


@app.get("/registro")
def registro(progetto_id: str, chi: Persona = Depends(persona_corrente),
             conn: sqlite3.Connection = Depends(get_db)) -> list[PassoRegistro]:
    """Solo il manager: qui c'è anche il motivo vero delle risposte neutre."""
    manager(conn, progetto_id, chi)
    righe = conn.execute("SELECT * FROM registro WHERE progetto_id = ? ORDER BY id DESC LIMIT 300", (progetto_id,))
    return [db.passo(r) for r in righe]
