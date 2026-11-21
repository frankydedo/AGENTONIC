"""Ricerca di «Chiedi al Brain»: solo voci approvate, filtrate per permessi PRIMA del modello."""

import re
import sqlite3

from backend import db
from backend.modelli import Fatto, Persona, Progetto, Task, Voce, puo_vedere

STOP = {"che", "chi", "cosa", "come", "con", "del", "della", "delle", "dei", "degli", "dove", "per", "non",
        "una", "uno", "gli", "nel", "nella", "sono", "quando", "quanto", "quanta", "quanti", "quale", "quali",
        "abbiamo", "siamo", "questo", "questa", "sul", "sulla", "dal", "dalla", "tra", "fra", "più", "the"}
MAX_VOCI = 8


def testo_task(t: Task, nome_assegnatario: str | None) -> str:
    return (f"Task: {t.titolo}. Responsabile: {nome_assegnatario or 'nessuno'}. "
            f"Scadenza: {t.scadenza or 'non definita'}. Stato: {t.stato}.")


def testo_fatto(f: Fatto) -> str:
    return f"{f.soggetto}, {f.attributo}: {f.valore}"


def indicizza(conn: sqlite3.Connection, voce_id: str, progetto_id: str, testo: str) -> None:
    """Chiamata solo all'approvazione: ciò che non è approvato non entra nell'indice."""
    conn.execute("DELETE FROM voci_fts WHERE voce_id = ?", (voce_id,))
    conn.execute("INSERT INTO voci_fts (voce_id, progetto_id, testo) VALUES (?, ?, ?)", (voce_id, progetto_id, testo))


def query_fts(domanda: str) -> str | None:
    """Dalla domanda si tengono solo parole (lettere e cifre): nessuna sintassi FTS arriva dall'utente.

    Ogni parola è tra virgolette; quelle lunghe diventano un prefisso per reggere plurali e verbi.
    """
    parole = [p for p in re.findall(r"[^\W_]{3,}", domanda.lower()) if p not in STOP]
    termini = [f'"{p[:max(4, len(p) - 3)]}"*' if len(p) >= 5 else f'"{p}"' for p in dict.fromkeys(parole)]
    return " OR ".join(termini[:20]) or None


def cerca(conn: sqlite3.Connection, domanda: str, chi: Persona, prj: Progetto) -> tuple[list[Voce], int]:
    """Restituisce (voci che `chi` può vedere, quante ne erano state trovate prima del filtro)."""
    q = query_fts(domanda)
    if q is None:
        return [], 0
    righe = conn.execute(
        "SELECT voce_id, testo FROM voci_fts WHERE voci_fts MATCH ? AND progetto_id = ? ORDER BY bm25(voci_fts)",
        (q, prj.id)).fetchall()
    visibili = []
    for r in righe:
        tabella = "task" if r["voce_id"].startswith("task-") else "fatti"
        riga = conn.execute(f"SELECT * FROM {tabella} WHERE id = ?", (r["voce_id"],)).fetchone()
        elemento = db.task(riga) if tabella == "task" else db.fatto(riga)
        if puo_vedere(chi, prj, elemento.aree):
            visibili.append(Voce(id=elemento.id, tipo="task" if tabella == "task" else "fatto",
                                 testo=r["testo"], aree=elemento.aree, citazioni=elemento.citazioni))
    return visibili[:MAX_VOCI], len(righe)
