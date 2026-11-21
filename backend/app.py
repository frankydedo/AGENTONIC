"""API del Company Brain (contratto in docs/api.md).

Le garanzie stanno qui, non nel prompt:
- l'identità arriva dall'header `X-Persona` o dal cookie `persona`, mai dal testo di una richiesta;
- la memoria (task, fatti) contiene solo ciò che il manager ha approvato;
- i permessi (`puo_vedere`) si applicano prima di passare qualunque cosa al modello;
- le citazioni si ricostruiscono dai segmenti salvati: ciò che non cita un segmento vero si scarta;
- un documento non ne sostituisce mai un altro: un id già usato si rifiuta, e si rifiuta anche un
  documento la cui intestazione indica un progetto diverso da quello in cui lo si carica;
- ogni passo finisce nel registro.
"""

import asyncio
import json
import os
import sqlite3
from contextlib import asynccontextmanager
from datetime import date
from pathlib import PurePath

from fastapi import Cookie, Depends, FastAPI, Header, HTTPException, Query, Response, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ValidationError

from backend import db, ricerca, todo
from backend.analisi import analizza_documento                                    # I2, di Franky
from backend.analisi.ingestione import DocumentoNonValido, neutralizza, segmenta  # F2, di Franky
from backend.analisi.ingestione_pdf import segmenta_pdf                           # F11, di Franky
from backend.analisi.persone import abbina_speaker                                # F4, di Franky
from backend.analisi.proposte import data_valida
from backend.domande import (risposta_neutra, rispondi_tracciato, voce_da_fatto,  # I3, di Franky
                             voce_da_task, voci_visibili)
from backend.llm import Config
from backend.modelli import (Area, Avviso, Citazione, ContestoProgetto, Documento, Fatto, PassoRegistro, Persona,
                             Progetto, Proposta, RisultatoAnalisi, Risposta, Task, puo_vedere, puo_vedere_avviso)

MAX_BYTE = 10 * 1024 * 1024          # dimensione massima di un file caricato
# `bloccato` si può anche dichiarare («sono ferma finché non ho i tag»): resta finché un altro aggiornamento
# non lo cambia. In più lo calcola `todo.py` dalle dipendenze non ancora chiuse.
STATI_TASK = ("da_fare", "in_corso", "bloccato", "fatto", "annullato")


def carica_env() -> None:
    """Legge `.env` (mai stampato) come gli script di Franky: ciò che è già nell'ambiente vince.

    Così il server usa il modello configurato dal team; `LLM_PROVIDER=mock uvicorn ...` forza il mock."""
    env = db.RADICE / ".env"
    if env.exists():
        for riga in env.read_text(encoding="utf-8").splitlines():
            riga = riga.split("#", 1)[0].strip()
            if "=" in riga:
                chiave, valore = riga.split("=", 1)
                os.environ.setdefault(chiave.strip(), valore.strip())


@asynccontextmanager
async def avvio(app: FastAPI):
    # Solo all'avvio vero del server (non all'import): i test non leggono mai `.env`.
    carica_env()
    db.inizializza()
    cfg = Config.da_ambiente()
    print(f"Company Brain: modello «{cfg.modello or '-'}» con il provider «{cfg.provider}»; db {db.percorso_db()}", flush=True)
    yield


app = FastAPI(title="Company Brain · Automazioni Dora", version="0.3.0", lifespan=avvio)


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


def segmenti_visibili(conn: sqlite3.Connection, prj: Progetto, chi: Persona) -> set[str] | None:
    """I segmenti che `chi` può leggere. None = tutti (il manager).

    Gli altri leggono solo i segmenti citati da una voce approvata che possono vedere, o da un avviso
    che il manager ha inoltrato loro: la trascrizione grezza non aggira il filtro per area."""
    if chi.id == prj.manager_id:
        return None
    voci = todo.task_del_progetto(conn, prj.id) + db.fatti(conn, prj.id)
    visibili = {c.segmento_id for v in voci if puo_vedere(chi, prj, v.aree) for c in v.citazioni}
    return visibili | {c.segmento_id for a in avvisi_visibili(conn, prj, chi) for c in a.citazioni}


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


@app.get("/progetti")
def elenco_progetti(chi: Persona = Depends(persona_corrente),
                    conn: sqlite3.Connection = Depends(get_db)) -> list[Progetto]:
    """I progetti di cui la persona attiva è membro."""
    return db.progetti_di(conn, chi.id)


@app.get("/progetti/{progetto_id}")
def dettaglio_progetto(progetto_id: str, chi: Persona = Depends(persona_corrente),
                       conn: sqlite3.Connection = Depends(get_db)) -> Progetto:
    return membro(conn, progetto_id, chi)


# --- Documenti: ingestion -> analisi -> proposte e avvisi ---------------------------------------

class EsitoCaricamento(BaseModel):
    documento_id: str
    segmenti: int = 0
    proposte: int
    avvisi: int
    scartate: int = 0                     # proposte senza una citazione valida
    analisi_non_riuscite: list[str] = []  # agenti del workflow andati in errore (es. ["fatti"])


def _prossimo_id_pdf(conn: sqlite3.Connection) -> str:
    n = conn.execute("SELECT COUNT(*) FROM documenti WHERE id LIKE 'doc-%'").fetchone()[0] + 1
    while conn.execute("SELECT 1 FROM documenti WHERE id = ?", (f"doc-{n:03d}",)).fetchone():
        n += 1
    return f"doc-{n:03d}"


def _leggi_documento(conn: sqlite3.Connection, file: UploadFile, prj: Progetto, tipo: str,
                     doc_id: str | None, titolo: str | None, data: str | None) -> Documento:
    """File caricato -> `Documento` segmentato. Minuta in markdown oppure PDF (che non ha intestazione:
    id, titolo e data arrivano dalla richiesta o si ricavano)."""
    dati = file.file.read(MAX_BYTE + 1)
    if len(dati) > MAX_BYTE:
        raise HTTPException(413, "File troppo grande (massimo 10 MB).")
    nome = PurePath(file.filename or "").name
    try:
        if dati[:1024].lstrip().startswith(b"%PDF") or nome.lower().endswith(".pdf"):
            titolo_pdf = neutralizza(" ".join((titolo or PurePath(nome).stem or "Documento").split()))[:200]
            return segmenta_pdf(dati, doc_id or _prossimo_id_pdf(conn), titolo_pdf,
                                data or date.today().isoformat(), prj.id)
        doc = segmenta(dati.decode("utf-8"))   # senza progetto: resta quello scritto nell'intestazione
    except DocumentoNonValido as errore:
        raise HTTPException(422, f"Documento non valido. {errore}")
    except UnicodeDecodeError:
        raise HTTPException(422, "Documento non valido. Il file non è un testo UTF-8 né un PDF.")
    if doc.progetto_id and doc.progetto_id != prj.id:
        # Mai cambiare progetto in silenzio: chi carica deve accorgersene e decidere.
        raise HTTPException(422, f"L'intestazione del documento indica il progetto «{doc.progetto_id}», ma lo stai "
                                 f"caricando nel progetto «{prj.id}». Non è stato caricato nulla: scegli il "
                                 "progetto giusto oppure correggi l'intestazione.")
    doc.progetto_id, doc.tipo = prj.id, tipo
    return doc


def _rifiuta_doppione(conn: sqlite3.Connection, doc: Documento, prj: Progetto) -> None:
    """Un id già usato non si accetta mai: il documento esistente non viene toccato."""
    r = conn.execute("SELECT progetto_id, titolo, data FROM documenti WHERE id = ?", (doc.id,)).fetchone()
    if r is None:
        return
    quale = f"«{r['titolo']}» del {r['data']}" if r["progetto_id"] == prj.id else "in un altro progetto"
    raise HTTPException(409, f"Esiste già un documento con id «{doc.id}» ({quale}). Non è stato sostituito né "
                             "modificato: se questo è un documento nuovo, dagli un id diverso.")


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
    nuove: list[tuple[str, frozenset[str], dict]] = []   # (id, segmenti citati, contenuto) dei nuovi task
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
        proposta_id = db.nuovo_id(conn, "proposte", "prop")
        conn.execute(
            "INSERT INTO proposte (id, progetto_id, documento_id, tipo, contenuto, aree_proposte, sicurezza, "
            "citazioni, creata_il) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (proposta_id, prj.id, documento_id, p.tipo, db._j(contenuto), db._j(p.aree_proposte), p.sicurezza,
             db._j(citazioni), db.ora()))
        if p.tipo == "nuovo_task":
            nuove.append((proposta_id, frozenset(c["segmento_id"] for c in citazioni), contenuto))
        salvate += 1

    in_attesa = {r[0] for r in conn.execute(
        "SELECT id FROM proposte WHERE progetto_id = ? AND stato = 'in_attesa'", (prj.id,))}
    for a in risultato.avvisi:
        citazioni = _citazioni_vere(conn, a.citazioni, prj.id)
        conn.execute(   # solo_manager = 1: finché il manager non lo inoltra, l'avviso lo vede solo lui
            "INSERT INTO avvisi (id, progetto_id, documento_id, tipo, testo, citazioni, aree, basato_su_proposte, "
            "solo_manager, proposta_id, creato_il) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)",
            (db.nuovo_id(conn, "avvisi", "avv"), prj.id, documento_id, a.tipo, a.testo, db._j(citazioni),
             db._j(a.aree), db._j([p for p in a.basato_su_proposte if p in in_attesa]),
             _proposta_da_correggere(a, citazioni, nuove), db.ora()))
    return salvate, len(risultato.avvisi), scartate


def _proposta_da_correggere(a: Avviso, citazioni: list[dict], nuove: list[tuple[str, frozenset[str], dict]]) -> str | None:
    """Un punto oscuro si collega al nuovo task che cita gli stessi segmenti, se è uno solo
    (o uno solo ha ancora un campo da completare)."""
    segmenti = frozenset(c["segmento_id"] for c in citazioni)
    if a.tipo != "punto_oscuro" or not segmenti:
        return None
    stesse = [(pid, c) for pid, seg, c in nuove if seg == segmenti]
    if len(stesse) > 1:
        stesse = [(pid, c) for pid, c in stesse if not c.get("assegnatario_id") or not c.get("scadenza")]
    return stesse[0][0] if len(stesse) == 1 else None


def _contesto(conn: sqlite3.Connection, prj: Progetto, escluso: str) -> ContestoProgetto:
    return ContestoProgetto(
        progetto=prj, persone=db.persone(conn, prj.id),
        persone_azienda=[p for p in db.persone(conn) if p.id not in prj.membri],
        proposte_in_attesa=[db.proposta(r) for r in conn.execute(
            "SELECT * FROM proposte WHERE progetto_id = ? AND stato = 'in_attesa' ORDER BY id", (prj.id,))],
        task=todo.task_del_progetto(conn, prj.id), fatti=db.fatti(conn, prj.id),
        documenti_precedenti=[r[0] for r in conn.execute(
            "SELECT id FROM documenti WHERE progetto_id = ? AND id != ? ORDER BY data, caricato_il",
            (prj.id, escluso))])


def _carica(conn: sqlite3.Connection, progetto_id: str, file: UploadFile, chi: Persona, tipo: str,
            doc_id: str | None, titolo: str | None, data: str | None) -> EsitoCaricamento:
    prj = manager(conn, progetto_id, chi)
    doc = _leggi_documento(conn, file, prj, tipo, doc_id, titolo, data)
    _rifiuta_doppione(conn, doc, prj)
    doc = abbina_speaker(doc, db.persone(conn, prj.id))   # codice, non modello: speaker -> persona

    try:
        conn.execute(
            "INSERT INTO documenti (id, progetto_id, tipo, formato, titolo, data, ora_inizio, partecipanti, "
            "caricato_il, caricato_da) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (doc.id, prj.id, doc.tipo, doc.formato, doc.titolo, doc.data, doc.ora_inizio,
             db._j(doc.partecipanti), db.ora(), chi.id))
    except sqlite3.IntegrityError:   # due caricamenti dello stesso id nello stesso istante
        conn.rollback()
        _rifiuta_doppione(conn, doc, prj)
        raise HTTPException(409, f"Esiste già un documento con id «{doc.id}».")
    conn.executemany(
        "INSERT INTO segmenti (id, documento_id, n, speaker, persona_id, inizio, fine, pagina, testo) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [(s.id, doc.id, n, s.speaker, s.persona_id, s.inizio, s.fine, s.pagina, s.testo)
         for n, s in enumerate(doc.segmenti, 1)])
    db.registra(conn, "caricamento", chi.id, "caricamento", progetto_id=prj.id, documento_id=doc.id,
                input={"tipo": doc.tipo, "formato": doc.formato}, output={"segmenti": len(doc.segmenti)})
    contesto = _contesto(conn, prj, doc.id)
    conn.commit()   # l'analisi può durare: non si tiene il db bloccato mentre il modello lavora

    try:
        risultato = analizza_documento(doc, contesto)
    except Exception as errore:   # il workflow non dovrebbe mai sollevare: se succede non resta un documento a metà
        conn.execute("DELETE FROM segmenti WHERE documento_id = ?", (doc.id,))
        conn.execute("DELETE FROM documenti WHERE id = ?", (doc.id,))
        db.registra(conn, "workflow", "brain", "analisi", progetto_id=prj.id, documento_id=doc.id,
                    esito="errore", motivo=f"{type(errore).__name__}: {errore}"[:300])
        conn.commit()
        raise HTTPException(502, "L'analisi non è riuscita. Il documento non è stato salvato: riprova.")

    falliti: list[str] = []
    for passo in risultato.passi:   # la traccia del workflow, così come la scrive il cervello
        db.registra_passo(conn, prj.id, passo.model_copy(update={"documento_id": passo.documento_id or doc.id}))
        if passo.step == "risultato":
            falliti = list(passo.output.get("analisi_non_riuscite", []))
    proposte, avvisi, scartate = _salva_risultato(conn, prj, doc.id, risultato)
    db.registra(conn, "workflow", "brain", "salvataggio", progetto_id=prj.id, documento_id=doc.id,
                output={"proposte": proposte, "avvisi": avvisi, "scartate": scartate})
    return EsitoCaricamento(documento_id=doc.id, segmenti=len(doc.segmenti), proposte=proposte, avvisi=avvisi,
                            scartate=scartate, analisi_non_riuscite=falliti)


@app.post("/riunioni")
def carica_riunione(progetto_id: str, file: UploadFile, doc_id: str | None = Query(None, alias="id"),
                    titolo: str | None = None, data: str | None = None,
                    chi: Persona = Depends(persona_corrente),
                    conn: sqlite3.Connection = Depends(get_db)) -> EsitoCaricamento:
    """Minuta in markdown (id, titolo e data nell'intestazione). Un PDF vale come documento integrativo."""
    return _carica(conn, progetto_id, file, chi, "riunione", doc_id, titolo, data)


@app.post("/documenti")
def carica_documento(progetto_id: str, file: UploadFile, doc_id: str | None = Query(None, alias="id"),
                     titolo: str | None = None, data: str | None = None,
                     chi: Persona = Depends(persona_corrente),
                     conn: sqlite3.Connection = Depends(get_db)) -> EsitoCaricamento:
    """Documento integrativo: PDF (`id`, `titolo`, `data` opzionali nella query) oppure markdown."""
    return _carica(conn, progetto_id, file, chi, "integrativo", doc_id, titolo, data)


@app.get("/documenti")
def elenco_documenti(progetto_id: str, chi: Persona = Depends(persona_corrente),
                     conn: sqlite3.Connection = Depends(get_db)) -> list[Documento]:
    """I documenti del progetto, senza segmenti (quelli stanno in `GET /documenti/{id}`)."""
    prj = membro(conn, progetto_id, chi)
    righe = conn.execute("SELECT * FROM documenti WHERE progetto_id = ? ORDER BY data, caricato_il", (prj.id,))
    return [db.documento(r) for r in righe]


@app.get("/documenti/{documento_id}")
def dettaglio_documento(documento_id: str, chi: Persona = Depends(persona_corrente),
                        conn: sqlite3.Connection = Depends(get_db)) -> Documento:
    """Il documento con i segmenti che la persona può leggere (tutti solo per il manager)."""
    r = conn.execute("SELECT * FROM documenti WHERE id = ?", (documento_id,)).fetchone()
    prj = db.progetto(conn, r["progetto_id"]) if r else None
    if prj is None or chi.id not in prj.membri:
        raise HTTPException(404, "Documento non trovato.")   # stessa risposta se esiste in un altro progetto
    visibili = segmenti_visibili(conn, prj, chi)
    righe = conn.execute("SELECT * FROM segmenti WHERE documento_id = ? ORDER BY n", (documento_id,))
    return db.documento(r, [db.segmento(s) for s in righe if visibili is None or s["id"] in visibili])


class EsitoAnnullamento(BaseModel):
    documento_id: str
    segmenti: int
    proposte: int
    avvisi: int


@app.delete("/documenti/{documento_id}")
def annulla_caricamento(documento_id: str, chi: Persona = Depends(persona_corrente),
                        conn: sqlite3.Connection = Depends(get_db)) -> EsitoAnnullamento:
    """Annulla il caricamento di un documento sbagliato. Solo il manager, e solo se NESSUNA proposta
    del documento è stata approvata: niente di suo è entrato nella memoria, quindi togliere documento,
    segmenti, proposte (in attesa o rifiutate) e avvisi non lascia buchi. Se qualcosa è già approvato
    -> 409. Il registro non si cancella: l'annullamento resta tracciato."""
    r = conn.execute("SELECT progetto_id FROM documenti WHERE id = ?", (documento_id,)).fetchone()
    prj = db.progetto(conn, r["progetto_id"]) if r else None
    if prj is None or chi.id not in prj.membri:
        raise HTTPException(404, "Documento non trovato.")
    manager(conn, prj.id, chi)
    approvate = [x[0] for x in conn.execute(
        "SELECT id FROM proposte WHERE documento_id = ? AND stato = 'approvata' ORDER BY id", (documento_id,))]
    if approvate:
        raise HTTPException(409, f"Non si può annullare il caricamento: {len(approvate)} proposte di questo documento "
                                 f"sono già state approvate ({', '.join(approvate)}) e sono entrate nella memoria "
                                 "del progetto. Il documento resta com'è.")
    tolte = [x[0] for x in conn.execute("SELECT id FROM proposte WHERE documento_id = ?", (documento_id,))]
    avvisi = conn.execute("DELETE FROM avvisi WHERE documento_id = ?", (documento_id,)).rowcount
    for a in conn.execute("SELECT id, basato_su_proposte FROM avvisi WHERE progetto_id = ?", (prj.id,)).fetchall():
        if set(json.loads(a["basato_su_proposte"] or "[]")) & set(tolte):   # avvisi nati da quelle proposte
            conn.execute("DELETE FROM avvisi WHERE id = ?", (a["id"],))
            avvisi += 1
    conn.execute("DELETE FROM proposte WHERE documento_id = ?", (documento_id,))
    segmenti = conn.execute("DELETE FROM segmenti WHERE documento_id = ?", (documento_id,)).rowcount
    conn.execute("DELETE FROM documenti WHERE id = ?", (documento_id,))
    db.registra(conn, "decisione", chi.id, "annulla_caricamento", progetto_id=prj.id, documento_id=documento_id,
                output={"segmenti": segmenti, "proposte": len(tolte), "avvisi": avvisi})
    conn.commit()
    return EsitoAnnullamento(documento_id=documento_id, segmenti=segmenti, proposte=len(tolte), avvisi=avvisi)


@app.get("/segmenti/{segmento_id}")
def dettaglio_segmento(segmento_id: str, chi: Persona = Depends(persona_corrente),
                       conn: sqlite3.Connection = Depends(get_db)) -> Citazione:
    """Il manager apre qualunque segmento; gli altri solo quelli citati da una voce che possono vedere."""
    r = conn.execute("SELECT d.progetto_id FROM segmenti s JOIN documenti d ON d.id = s.documento_id "
                     "WHERE s.id = ?", (segmento_id,)).fetchone()
    prj = db.progetto(conn, r["progetto_id"]) if r else None
    if prj and chi.id in prj.membri:
        visibili = segmenti_visibili(conn, prj, chi)
        if visibili is None or segmento_id in visibili:
            return db.citazione(conn, segmento_id, prj.id)
    raise HTTPException(404, "Segmento non trovato.")   # stessa risposta se esiste ma non è visibile


# --- Proposte: il manager cura la memoria -------------------------------------------------------

class Decisione(BaseModel):
    aree: list[Area] | None = None        # il manager conferma (null) o modifica le aree
    # Correzioni del manager prima di approvare, solo i campi cambiati: `titolo`, `assegnatario_id`,
    # `scadenza` per un nuovo task (gli ultimi due a null = tolti); `valore` per un nuovo fatto.
    modifiche: dict | None = None
    assegnatario_id: str | None = None    # scorciatoia per modifiche.assegnatario_id («quale Marco?»)
    nota: str | None = None


MODIFICABILI = {"nuovo_task": ("titolo", "assegnatario_id", "scadenza"), "nuovo_fatto": ("valore",)}


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


def _correggi(p: Proposta, prj: Progetto, contenuto: dict, modifiche: dict) -> dict:
    """Applica al contenuto le correzioni del manager. Restituisce solo ciò che è davvero cambiato.

    La UI manda solo i campi cambiati: `assegnatario_id` o `scadenza` a null vuol dire «tolto»."""
    cambiate = {}
    for campo, valore in modifiche.items():
        if campo not in MODIFICABILI.get(p.tipo, ()):
            if valore is None:
                continue   # un campo che non riguarda questa proposta, lasciato vuoto
            raise HTTPException(422, f"In una proposta «{p.tipo}» il campo «{campo}» non si può modificare.")
        if campo in ("assegnatario_id", "scadenza"):
            if valore is not None and not isinstance(valore, str):
                raise HTTPException(422, f"Il campo «{campo}» non è valido.")
            if campo == "assegnatario_id" and valore is not None and valore not in prj.membri:
                raise HTTPException(422, "L'assegnatario deve essere un membro del progetto.")
            if campo == "scadenza" and valore is not None and not data_valida(valore):
                raise HTTPException(422, "La scadenza deve essere una data nel formato AAAA-MM-GG.")
        else:   # titolo, valore: testo scritto a mano, che poi entra nei prompt come dato
            if valore is None:
                continue
            if not isinstance(valore, str) or not valore.strip():
                raise HTTPException(422, f"Il campo «{campo}» non può essere vuoto.")
            valore = neutralizza(" ".join(valore.split()))[:500]
        if contenuto.get(campo) != valore:
            contenuto[campo] = cambiate[campo] = valore
    return cambiate


def _indicizza_task(conn: sqlite3.Connection, task_id: str) -> None:
    t = db.task(conn.execute("SELECT * FROM task WHERE id = ?", (task_id,)).fetchone())
    persone = {p.id: p for p in db.persone(conn)}
    ricerca.indicizza(conn, t.id, t.progetto_id, voce_da_task(t, persone).testo)


def _applica(conn: sqlite3.Connection, p: Proposta, prj: Progetto, aree: list[str], contenuto: dict) -> str:
    """Porta una proposta approvata nella memoria del progetto. Restituisce l'id della voce toccata."""
    if p.tipo == "nuovo_task":
        if contenuto.get("assegnatario_id") not in (None, *prj.membri):
            raise HTTPException(422, "L'assegnatario deve essere un membro del progetto.")
        stato = contenuto.get("stato") if contenuto.get("stato") in STATI_TASK else "da_fare"
        t = Task(id=db.nuovo_id_voce(conn, "task", "task", prj.id), progetto_id=prj.id, aree=aree,
                 titolo=contenuto.get("titolo"), assegnatario_id=contenuto.get("assegnatario_id"),
                 scadenza=contenuto.get("scadenza"), stato=stato, citazioni=p.citazioni,
                 dipende_da=[d for d in contenuto.get("dipende_da") or [] if isinstance(d, str)])
        conn.execute(
            "INSERT INTO task (id, progetto_id, titolo, assegnatario_id, scadenza, stato, aree, dipende_da, rif, "
            "citazioni, proposta_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (t.id, prj.id, t.titolo, t.assegnatario_id, t.scadenza, t.stato, db._j(aree), db._j(t.dipende_da),
             contenuto.get("rif"), db._j(t.citazioni), p.id))
        _indicizza_task(conn, t.id)
        return t.id
    if p.tipo == "nuovo_fatto":
        f = Fatto(id=db.nuovo_id_voce(conn, "fatti", "fat", prj.id), progetto_id=prj.id, aree=aree,
                  citazioni=p.citazioni, **{k: contenuto.get(k) for k in ("soggetto", "attributo", "valore")})
        conn.execute("INSERT INTO fatti VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                     (f.id, prj.id, f.soggetto, f.attributo, f.valore, db._j(aree), db._j(f.citazioni), p.id))
        ricerca.indicizza(conn, f.id, prj.id, voce_da_fatto(f).testo)
        return f.id

    # aggiorna_task / chiudi_task: {"task_id", "campo", "valore"}
    r = conn.execute("SELECT * FROM task WHERE id = ? AND progetto_id = ?",
                     (contenuto.get("task_id"), prj.id)).fetchone()
    if r is None:
        raise HTTPException(409, "Il task da aggiornare non è nella lista del progetto.")
    campo = contenuto.get("campo") or ("stato" if p.tipo == "chiudi_task" else None)
    valore = contenuto.get("valore")
    if p.tipo == "chiudi_task":
        valore = valore or contenuto.get("stato") or "fatto"
        valido = campo == "stato" and valore in ("fatto", "annullato")
    else:
        valido = ((campo == "stato" and valore in STATI_TASK)
                  or (campo == "assegnatario" and valore in prj.membri)
                  or (campo == "scadenza" and data_valida(valore))
                  or (campo == "titolo" and isinstance(valore, str) and bool(valore.strip())))
    if not valido:
        raise HTTPException(422, "Aggiornamento non valido: la proposta va rifiutata.")
    colonna = {"stato": "stato", "scadenza": "scadenza", "assegnatario": "assegnatario_id", "titolo": "titolo"}[campo]
    citazioni = {c["segmento_id"]: c for c in json.loads(r["citazioni"]) + [c.model_dump() for c in p.citazioni]}
    conn.execute(f"UPDATE task SET {colonna} = ?, citazioni = ? WHERE id = ?",
                 (valore, db._j(list(citazioni.values())), r["id"]))
    _indicizza_task(conn, r["id"])
    return r["id"]


@app.post("/proposte/{proposta_id}/approva")
def approva(proposta_id: str, body: Decisione, chi: Persona = Depends(persona_corrente),
            conn: sqlite3.Connection = Depends(get_db)) -> Proposta:
    p, prj = _proposta_in_attesa(conn, proposta_id, chi)
    aree = body.aree or p.aree_proposte
    contenuto = dict(p.contenuto)
    modifiche = dict(body.modifiche or {})
    if body.assegnatario_id is not None:
        modifiche.setdefault("assegnatario_id", body.assegnatario_id)
    cambiate = _correggi(p, prj, contenuto, modifiche)
    try:
        voce_id = _applica(conn, p, prj, aree, contenuto)
    except ValidationError:
        raise HTTPException(422, "La proposta non è valida e non può essere approvata: rifiutala.")
    conn.execute("UPDATE proposte SET stato = 'approvata', contenuto = ?, aree_confermate = ?, decisa_da = ?, "
                 "decisa_il = ? WHERE id = ?", (db._j(contenuto), db._j(aree), chi.id, db.ora(), p.id))
    db.registra(conn, "decisione", chi.id, "approva", progetto_id=prj.id, documento_id=p.documento_id,
                input={"proposta_id": p.id, "aree": aree, "modifiche": cambiate, "nota": body.nota},
                output={"voce_id": voce_id})
    return db.proposta(conn.execute("SELECT * FROM proposte WHERE id = ?", (p.id,)).fetchone())


@app.post("/proposte/{proposta_id}/rifiuta")
def rifiuta(proposta_id: str, body: Decisione, chi: Persona = Depends(persona_corrente),
            conn: sqlite3.Connection = Depends(get_db)) -> Proposta:
    p, prj = _proposta_in_attesa(conn, proposta_id, chi)
    conn.execute("UPDATE proposte SET stato = 'rifiutata', decisa_da = ?, decisa_il = ? WHERE id = ?",
                 (chi.id, db.ora(), p.id))
    db.registra(conn, "decisione", chi.id, "rifiuta", progetto_id=prj.id, documento_id=p.documento_id,
                input={"proposta_id": p.id, "nota": body.nota})
    return db.proposta(conn.execute("SELECT * FROM proposte WHERE id = ?", (p.id,)).fetchone())


# --- Avvisi (SSE): il Brain parla per primo -----------------------------------------------------

def avvisi_visibili(conn: sqlite3.Connection, prj: Progetto, chi: Persona) -> list[Avviso]:
    """Avvisi aperti che `chi` può ricevere: tutti per il manager, per gli altri solo quelli inoltrati."""
    righe = conn.execute("SELECT * FROM avvisi WHERE progetto_id = ? AND risolto = 0 ORDER BY rowid", (prj.id,))
    return [a for a in map(db.avviso, righe) if puo_vedere_avviso(chi, prj, a)]


@app.get("/avvisi")
async def flusso_avvisi(progetto_id: str, flusso: bool = True, chi: Persona = Depends(persona_corrente),
                        conn: sqlite3.Connection = Depends(get_db)):
    """Server-Sent Events. Evento `avviso` per ogni avviso aperto, poi per ogni avviso nuovo o inoltrato;
    solo al manager anche l'evento `passo` (un `PassoRegistro`) per ogni nuovo passo del registro.
    Con `flusso=false` restituisce l'elenco degli avvisi aperti in JSON, senza restare in ascolto."""
    prj = membro(conn, progetto_id, chi)
    if not flusso:
        return avvisi_visibili(conn, prj, chi)

    async def eventi():
        mia = db.connetti()   # la connessione della richiesta si chiude: il flusso ne usa una sua
        try:
            inviati, giri = set(), 0
            ultimo_passo = mia.execute("SELECT COALESCE(MAX(id), 0) FROM registro").fetchone()[0]
            while True:
                for a in avvisi_visibili(mia, prj, chi):
                    if a.id not in inviati:   # anche quelli vecchi, se il manager li inoltra adesso
                        inviati.add(a.id)
                        yield f"event: avviso\ndata: {a.model_dump_json()}\n\n"
                if chi.id == prj.manager_id:   # il registro lo legge solo il manager
                    for r in mia.execute("SELECT * FROM registro WHERE progetto_id = ? AND id > ? ORDER BY id",
                                         (prj.id, ultimo_passo)).fetchall():
                        ultimo_passo = r["id"]
                        yield f"event: passo\ndata: {db.passo(r).model_dump_json()}\n\n"
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
    db.registra(conn, "decisione", chi.id, "inoltra_avviso", progetto_id=prj.id, documento_id=r["documento_id"],
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
    db.registra(conn, "decisione", chi.id, "risolvi_avviso", progetto_id=prj.id, documento_id=r["documento_id"],
                input={"avviso_id": avviso_id})
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
    """La propria to-do del giorno. Il manager legge quella dei membri, limitata ai progetti che dirige."""
    if persona_id == chi.id:
        return TodoOggi(**todo.todo_oggi(conn, chi))
    persona = db.persona(conn, persona_id)
    diretti = [p.id for p in db.progetti_di(conn, chi.id)
               if p.manager_id == chi.id and persona is not None and persona.id in p.membri]
    if not diretti:
        raise HTTPException(403, "Puoi vedere solo la tua to-do, o quella delle persone dei progetti che dirigi.")
    return TodoOggi(**todo.todo_oggi(conn, persona, diretti))


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
    manager_nome = db.persona(conn, prj.manager_id).nome
    persone = {p.id: p for p in db.persone(conn)}
    # Il filtro dei permessi è qui, nel codice, PRIMA del modello: al cervello arrivano solo le voci
    # approvate che la persona può vedere.
    voci = voci_visibili(chi, prj, todo.task_del_progetto(conn, prj.id), db.fatti(conn, prj.id), persone)
    risposta, passo = rispondi_tracciato(body.testo, chi, voci, manager_nome)

    # Al confine si ricontrolla: una risposta vale solo se cita segmenti delle voci passate al modello.
    ammessi = {c.segmento_id for v in voci for c in v.citazioni}
    if risposta.esito == "risposta" and (not risposta.testo.strip() or not risposta.citazioni
                                         or any(c.segmento_id not in ammessi for c in risposta.citazioni)):
        risposta = risposta_neutra(manager_nome)
        passo = passo.model_copy(update={"esito": "scartato", "motivo": "risposta senza citazioni valide"})

    if risposta.esito != "risposta":
        # Dato mancante e dato riservato hanno la stessa risposta: il motivo vero resta nel registro.
        risposta = risposta_neutra(manager_nome)
        nascoste = [v for v in ricerca.pertinenti(conn, body.testo, prj.id) if v not in {x.id for x in voci}]
        vero = (f"non_autorizzato: ci sono voci pertinenti che la persona non può vedere ({', '.join(nascoste[:5])})"
                if nascoste else "non_lo_so: nessuna voce pertinente oltre a quelle visibili")
        passo = passo.model_copy(update={"motivo": f"{vero}. {passo.motivo}" if passo.motivo else vero})
    db.registra_passo(conn, prj.id, passo)
    return risposta


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
    testo = neutralizza(" ".join(body.descrizione.split()))[:500]
    if not testo:
        raise HTTPException(422, "Descrivi l'evento.")
    conn.execute("INSERT INTO avvisi (id, progetto_id, tipo, testo, solo_manager, creato_il) VALUES (?, ?, ?, ?, 1, ?)",
                 (avviso_id, prj.id, "evento_esterno", testo, db.ora()))
    db.registra(conn, "caricamento", chi.id, "simula_evento", progetto_id=prj.id,
                input={"tipo": body.tipo[:60]}, output={"avviso_id": avviso_id})
    return db.avviso(conn.execute("SELECT * FROM avvisi WHERE id = ?", (avviso_id,)).fetchone())


@app.get("/registro")
def registro(progetto_id: str, chi: Persona = Depends(persona_corrente),
             conn: sqlite3.Connection = Depends(get_db)) -> list[PassoRegistro]:
    """Solo il manager: qui c'è anche il motivo vero delle risposte neutre."""
    manager(conn, progetto_id, chi)
    righe = conn.execute("SELECT * FROM registro WHERE progetto_id = ? ORDER BY id DESC LIMIT 500", (progetto_id,))
    return [db.passo(r) for r in righe]
