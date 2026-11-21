"""Lista del progetto e to-do del giorno. Qui si calcola `bloccato` (mai il modello)."""

import json
import sqlite3
from datetime import date

from backend import db
from backend.modelli import Persona, Task

APERTI = ("da_fare", "in_corso", "bloccato")


def task_del_progetto(conn: sqlite3.Connection, progetto_id: str) -> list[Task]:
    """Tutti i task approvati, con le dipendenze risolte e lo stato `bloccato` calcolato.

    `dipende_da` può contenere un id o il titolo di un task: se il task richiesto non è (ancora)
    nella lista del progetto, resta il titolo e il task risulta bloccato.
    """
    tutti = [db.task(r) for r in conn.execute("SELECT * FROM task WHERE progetto_id = ? ORDER BY id", (progetto_id,))]
    per_id = {t.id: t for t in tutti}
    per_titolo = {t.titolo.lower(): t for t in tutti}
    for t in tutti:
        risolte = [per_id.get(d) or per_titolo.get(d.lower()) for d in t.dipende_da]
        in_sospeso = any(r is None or r.stato not in ("fatto", "annullato") for r in risolte)
        t.dipende_da = [r.id if r else d for r, d in zip(risolte, t.dipende_da)]
        if in_sospeso and t.stato in ("da_fare", "in_corso"):
            t.stato = "bloccato"
    return tutti


def todo_oggi(conn: sqlite3.Connection, persona: Persona) -> dict:
    """I task aperti della persona (in tutti i suoi progetti), per scadenza; se li ha già
    accettati oggi, nel suo ordine."""
    oggi = date.today().isoformat()
    progetti = [r[0] for r in conn.execute("SELECT progetto_id FROM membri WHERE persona_id = ?", (persona.id,))]
    miei = [t for prj in progetti for t in task_del_progetto(conn, prj)
            if t.assegnatario_id == persona.id and t.stato in APERTI]
    miei.sort(key=lambda t: (t.scadenza or "9999", t.id))
    r = conn.execute("SELECT task_ids FROM todo_oggi WHERE persona_id = ? AND data = ?",
                     (persona.id, oggi)).fetchone()
    if r:
        miei = [t for tid in json.loads(r["task_ids"]) for t in miei if t.id == tid]
    return {"persona_id": persona.id, "data": oggi, "accettata": r is not None, "task": miei}


def accetta(conn: sqlite3.Connection, persona: Persona, task_ids: list[str]) -> dict:
    """La persona accetta la propria to-do del giorno: solo task suoi e aperti, nell'ordine scelto."""
    oggi = date.today().isoformat()
    conn.execute("DELETE FROM todo_oggi WHERE persona_id = ? AND data = ?", (persona.id, oggi))
    miei = {t.id for t in todo_oggi(conn, persona)["task"]}
    scelti = [tid for tid in dict.fromkeys(task_ids) if tid in miei]
    conn.execute("INSERT INTO todo_oggi VALUES (?, ?, ?, ?)", (persona.id, oggi, json.dumps(scelti), db.ora()))
    db.registra(conn, "decisione", persona.id, "accetta_todo", input={"task_ids": scelti})
    return todo_oggi(conn, persona)
