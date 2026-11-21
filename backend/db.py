"""Accesso al db SQLite: connessione, creazione, caricamento dell'azienda, registro, letture."""

import json
import os
import sqlite3
from datetime import datetime
from pathlib import Path

from pydantic import BaseModel

from backend.modelli import Avviso, Citazione, Fatto, PassoRegistro, Persona, Progetto, Proposta, Task

RADICE = Path(__file__).resolve().parent.parent


def percorso_db() -> str:
    return os.environ.get("BRAIN_DB", str(RADICE / "brain.db"))


def connetti() -> sqlite3.Connection:
    conn = sqlite3.connect(percorso_db(), check_same_thread=False, timeout=30)
    conn.row_factory = sqlite3.Row
    return conn


def ora() -> str:
    return datetime.now().isoformat(timespec="seconds")


# --- Creazione ----------------------------------------------------------------------------------

def ricrea() -> None:
    """Cancella il db e lo ricrea da zero con l'azienda di `dati/azienda.json`."""
    for suffisso in ("", "-wal", "-shm"):
        Path(percorso_db() + suffisso).unlink(missing_ok=True)
    conn = connetti()
    conn.execute("PRAGMA journal_mode = WAL")   # lettori (SSE) e scrittori insieme
    conn.executescript((Path(__file__).parent / "schema.sql").read_text(encoding="utf-8"))
    carica_azienda(conn)
    conn.commit()
    conn.close()


def inizializza() -> None:
    if not Path(percorso_db()).exists():
        ricrea()


def carica_azienda(conn: sqlite3.Connection, percorso: Path = RADICE / "dati" / "azienda.json") -> None:
    dati = json.loads(percorso.read_text(encoding="utf-8"))
    for p in dati["persone"]:
        persona = Persona(**p)   # i campi "_nota" vengono ignorati
        conn.execute("INSERT INTO persone VALUES (?, ?, ?, ?, ?)",
                     (persona.id, persona.nome, persona.ruolo, _j(persona.alias), _j(persona.competenze)))
    for p in dati["progetti"]:
        prj = Progetto(**p)
        conn.execute("INSERT INTO progetti VALUES (?, ?, ?, ?, ?, ?)",
                     (prj.id, prj.nome, prj.cliente, prj.manager_id, prj.scadenza, prj.descrizione))
        conn.executemany("INSERT INTO membri VALUES (?, ?)", [(prj.id, m) for m in prj.membri])


# --- Utilità ------------------------------------------------------------------------------------

def _j(valore) -> str:
    """JSON per le colonne di testo; i modelli Pydantic (es. le citazioni) diventano dizionari."""
    return json.dumps(valore, ensure_ascii=False,
                      default=lambda o: o.model_dump(mode="json") if isinstance(o, BaseModel) else str(o))


def nuovo_id(conn: sqlite3.Connection, tabella: str, prefisso: str) -> str:
    n = conn.execute(f"SELECT COUNT(*) FROM {tabella}").fetchone()[0] + 1
    return f"{prefisso}-{n:03d}"


def registra(conn: sqlite3.Connection, tipo: str, attore: str, step: str, *, progetto_id: str | None = None,
             documento_id: str | None = None, input: dict | None = None, output: dict | None = None,
             esito: str = "ok", motivo: str | None = None) -> None:
    """Caricamenti, domande e decisioni: ogni passo del backend finisce nel registro (I6)."""
    registra_passo(conn, progetto_id, PassoRegistro(
        quando=datetime.now(), tipo=tipo, attore=attore, step=step, documento_id=documento_id,
        input=input or {}, output=output or {}, esito=esito, motivo=motivo))


def registra_passo(conn: sqlite3.Connection, progetto_id: str | None, p: PassoRegistro) -> None:
    """Salva un passo così com'è: anche quelli del workflow (`RisultatoAnalisi.passi`)."""
    conn.execute(
        "INSERT INTO registro (quando, progetto_id, tipo, attore, step, documento_id, provider, modello, "
        "versione_prompt, input, output, esito, motivo, tentativi, durata_ms) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (p.quando.isoformat(timespec="seconds"), progetto_id, p.tipo, p.attore, p.step, p.documento_id,
         p.provider, p.modello, p.versione_prompt, _j(p.input), _j(p.output), p.esito, p.motivo,
         p.tentativi, p.durata_ms))


# --- Letture ------------------------------------------------------------------------------------

def persona(conn: sqlite3.Connection, persona_id: str) -> Persona | None:
    r = conn.execute("SELECT * FROM persone WHERE id = ?", (persona_id,)).fetchone()
    return _persona(r) if r else None


def persone(conn: sqlite3.Connection, progetto_id: str | None = None) -> list[Persona]:
    if progetto_id is None:
        righe = conn.execute("SELECT * FROM persone ORDER BY id")
    else:
        righe = conn.execute("SELECT p.* FROM persone p JOIN membri m ON m.persona_id = p.id "
                             "WHERE m.progetto_id = ? ORDER BY p.id", (progetto_id,))
    return [_persona(r) for r in righe]


def _persona(r: sqlite3.Row) -> Persona:
    return Persona(id=r["id"], nome=r["nome"], ruolo=r["ruolo"],
                   alias=json.loads(r["alias"]), competenze=json.loads(r["competenze"]))


def progetto(conn: sqlite3.Connection, progetto_id: str) -> Progetto | None:
    r = conn.execute("SELECT * FROM progetti WHERE id = ?", (progetto_id,)).fetchone()
    if r is None:
        return None
    membri = [m[0] for m in conn.execute(
        "SELECT persona_id FROM membri WHERE progetto_id = ? ORDER BY persona_id", (progetto_id,))]
    return Progetto(id=r["id"], nome=r["nome"], cliente=r["cliente"], manager_id=r["manager_id"],
                    membri=membri, scadenza=r["scadenza"], descrizione=r["descrizione"])


def citazione(conn: sqlite3.Connection, segmento_id: str, progetto_id: str) -> Citazione | None:
    """Costruisce la citazione dal segmento salvato. None se il segmento non è di questo progetto."""
    r = conn.execute(
        "SELECT s.id, s.speaker, s.testo, d.id AS doc, d.titolo, d.data, d.ora_inizio "
        "FROM segmenti s JOIN documenti d ON d.id = s.documento_id WHERE s.id = ? AND d.progetto_id = ?",
        (segmento_id, progetto_id)).fetchone()
    if r is None:
        return None
    return Citazione(segmento_id=r["id"], documento_id=r["doc"], titolo=r["titolo"], data=r["data"],
                     orario=r["ora_inizio"], speaker=r["speaker"], frase=r["testo"])


def task(r: sqlite3.Row) -> Task:
    return Task(id=r["id"], progetto_id=r["progetto_id"], titolo=r["titolo"],
                assegnatario_id=r["assegnatario_id"], scadenza=r["scadenza"], stato=r["stato"],
                aree=json.loads(r["aree"]), dipende_da=json.loads(r["dipende_da"]),
                citazioni=json.loads(r["citazioni"]))


def fatto(r: sqlite3.Row) -> Fatto:
    return Fatto(id=r["id"], progetto_id=r["progetto_id"], soggetto=r["soggetto"], attributo=r["attributo"],
                 valore=r["valore"], aree=json.loads(r["aree"]), citazioni=json.loads(r["citazioni"]))


def proposta(r: sqlite3.Row) -> Proposta:
    return Proposta(
        id=r["id"], progetto_id=r["progetto_id"], documento_id=r["documento_id"], tipo=r["tipo"],
        stato=r["stato"], contenuto=json.loads(r["contenuto"]), aree_proposte=json.loads(r["aree_proposte"]),
        aree_confermate=json.loads(r["aree_confermate"]) if r["aree_confermate"] else None,
        sicurezza=r["sicurezza"], citazioni=json.loads(r["citazioni"]), creata_il=r["creata_il"],
        decisa_da=r["decisa_da"], decisa_il=r["decisa_il"])


def avviso(r: sqlite3.Row) -> Avviso:
    return Avviso(id=r["id"], progetto_id=r["progetto_id"], documento_id=r["documento_id"], tipo=r["tipo"],
                  testo=r["testo"], citazioni=json.loads(r["citazioni"]), aree=json.loads(r["aree"]),
                  basato_su_proposte=json.loads(r["basato_su_proposte"]), solo_manager=bool(r["solo_manager"]),
                  inoltrato_a=json.loads(r["inoltrato_a"]), risolto=bool(r["risolto"]), creato_il=r["creato_il"])


def passo(r: sqlite3.Row) -> PassoRegistro:
    return PassoRegistro(
        id=r["id"], quando=r["quando"], tipo=r["tipo"], attore=r["attore"], step=r["step"],
        documento_id=r["documento_id"], provider=r["provider"], modello=r["modello"],
        versione_prompt=r["versione_prompt"], input=json.loads(r["input"]), output=json.loads(r["output"]),
        esito=r["esito"], motivo=r["motivo"], tentativi=r["tentativi"], durata_ms=r["durata_ms"])
