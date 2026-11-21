"""Rotte `/posta/...`. Le dipendenze di sessione e db arrivano da `app.py` (niente import circolari).

Garanzie: ognuno vede solo la propria casella (identità dalla sessione, mai dalla richiesta);
una mail di un altro risponde 404, come una che non esiste.
"""
from __future__ import annotations

import sqlite3
from typing import Callable

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend import db, todo
from backend.domande import voci_visibili
from backend.modelli import Persona, Progetto
from backend.posta import casella
from backend.posta.casella import Cartella, CasellaNonConfigurata, IdCartella, Mail, MailBreve
from backend.posta.chiedi import RispostaPosta, rispondi_su_mail


class DomandaSuMail(BaseModel):
    progetto_id: str
    testo: str


def crea_router(get_db: Callable, persona_corrente: Callable,
                membro: Callable[[sqlite3.Connection, str, Persona], Progetto]) -> APIRouter:
    r = APIRouter(prefix="/posta", tags=["posta"])

    def _casella():
        return casella()

    def _non_collegata(e: CasellaNonConfigurata) -> HTTPException:
        return HTTPException(503, str(e))

    @r.get("/cartelle")
    def cartelle(chi: Persona = Depends(persona_corrente)) -> list[Cartella]:
        try:
            return _casella().cartelle(chi.id)
        except CasellaNonConfigurata as e:
            raise _non_collegata(e) from None

    @r.get("/messaggi")
    def messaggi(cartella: IdCartella = "in_arrivo", chi: Persona = Depends(persona_corrente)) -> list[MailBreve]:
        try:
            return _casella().messaggi(chi.id, cartella)
        except CasellaNonConfigurata as e:
            raise _non_collegata(e) from None

    def _mail(chi: Persona, mail_id: str) -> Mail:
        try:
            m = _casella().messaggio(chi.id, mail_id)
        except CasellaNonConfigurata as e:
            raise _non_collegata(e) from None
        if m is None:
            raise HTTPException(404, "Email not found.")
        return m

    @r.get("/messaggi/{mail_id}")
    def messaggio(mail_id: str, chi: Persona = Depends(persona_corrente)) -> Mail:
        m = _mail(chi, mail_id)
        _casella().segna_letta(chi.id, mail_id)
        return m.model_copy(update={"letta": True})

    @r.post("/messaggi/{mail_id}/chiedi")
    def chiedi(mail_id: str, body: DomandaSuMail, chi: Persona = Depends(persona_corrente),
               conn: sqlite3.Connection = Depends(get_db)) -> RispostaPosta:
        m = _mail(chi, mail_id)
        prj = membro(conn, body.progetto_id, chi)
        persone = {p.id: p for p in db.persone(conn)}
        # Come per le domande normali: al modello arrivano solo le voci approvate che la persona può vedere.
        voci = voci_visibili(chi, prj, todo.task_del_progetto(conn, prj.id), db.fatti(conn, prj.id), persone)
        risposta, passo = rispondi_su_mail(m, body.testo, voci)
        db.registra_passo(conn, prj.id, passo.model_copy(update={"input": {**passo.input, "chi": chi.id}}))
        return risposta

    return r
