"""Indice FTS5 sulle voci approvate.

Le domande non passano di qui: a `rispondi` arrivano le voci che la persona può vedere
(`domande.voci_visibili`, filtro dei permessi nel codice). L'indice serve al registro: quando la
risposta è neutra dice se nella memoria c'erano voci pertinenti che chi chiede non può vedere
(«non autorizzato») oppure nessuna («non lo so»). All'utente il testo resta identico.
"""

import re
import sqlite3

STOP = {"che", "chi", "cosa", "come", "con", "del", "della", "delle", "dei", "degli", "dove", "per", "non",
        "una", "uno", "gli", "nel", "nella", "sono", "quando", "quanto", "quanta", "quanti", "quale", "quali",
        "abbiamo", "siamo", "questo", "questa", "sul", "sulla", "dal", "dalla", "tra", "fra", "più", "the",
        "dello", "alla", "allo", "agli", "alle", "nei", "nelle", "negli", "suo", "sua", "loro", "anche"}


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


def pertinenti(conn: sqlite3.Connection, domanda: str, progetto_id: str) -> list[str]:
    """Id delle voci approvate del progetto che hanno parole in comune con la domanda (per rilevanza)."""
    q = query_fts(domanda)
    if q is None:
        return []
    righe = conn.execute(
        "SELECT voce_id FROM voci_fts WHERE voci_fts MATCH ? AND progetto_id = ? ORDER BY bm25(voci_fts)",
        (q, progetto_id))
    return [r["voce_id"] for r in righe]
