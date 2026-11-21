"""Lista del progetto e to-do del giorno. Qui si calcola `bloccato` (mai il modello)."""

import json
import sqlite3
from datetime import date

from backend import db
from backend.modelli import Persona, Task

APERTI = ("da_fare", "in_corso", "bloccato")
CHIUSI = ("fatto", "annullato")


def task_del_progetto(conn: sqlite3.Connection, progetto_id: str) -> list[Task]:
    """Tutti i task approvati, con le dipendenze risolte e lo stato `bloccato` calcolato.

    `dipende_da` contiene id di task (`task-004`) o rif di proposte (`riu-001:t4`). Un rif diventa
    l'id del task quando la sua proposta è approvata; se la proposta aspetta ancora il manager il rif
    resta e il task è bloccato; se è stata rifiutata o non esiste, la dipendenza cade.
    """
    righe = conn.execute("SELECT * FROM task WHERE progetto_id = ? ORDER BY id", (progetto_id,)).fetchall()
    tutti = [db.task(r) for r in righe]
    per_id = {t.id: t for t in tutti}
    per_rif = {r["rif"]: per_id[r["id"]] for r in righe if r["rif"]}
    in_attesa = set()
    for r in conn.execute("SELECT contenuto FROM proposte WHERE progetto_id = ? AND tipo = 'nuovo_task' "
                          "AND stato = 'in_attesa'", (progetto_id,)):
        in_attesa.add(json.loads(r["contenuto"]).get("rif"))
    chiuso_in_origine = {t.id: t.stato in CHIUSI for t in tutti}
    for t in tutti:
        dipendenze, in_sospeso = [], False
        for d in t.dipende_da:
            richiesto = per_id.get(d) or per_rif.get(d)
            if richiesto is not None and richiesto.id != t.id:
                dipendenze.append(richiesto.id)
                in_sospeso |= not chiuso_in_origine[richiesto.id]
            elif richiesto is None and d in in_attesa:
                dipendenze.append(d)          # il task richiesto aspetta ancora l'approvazione
                in_sospeso = True
        t.dipende_da = list(dict.fromkeys(dipendenze))
        if in_sospeso and t.stato in ("da_fare", "in_corso"):
            t.stato = "bloccato"
    return tutti


def todo_oggi(conn: sqlite3.Connection, persona: Persona, progetti: list[str] | None = None) -> dict:
    """I task aperti della persona, per scadenza; se li ha già accettati oggi, nel suo ordine.

    `progetti`: limita ai progetti indicati (il manager vede solo quelli che dirige)."""
    oggi = date.today().isoformat()
    suoi = [r[0] for r in conn.execute("SELECT progetto_id FROM membri WHERE persona_id = ?", (persona.id,))]
    if progetti is not None:
        suoi = [p for p in suoi if p in progetti]
    miei = [t for prj in suoi for t in task_del_progetto(conn, prj)
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
