"""Il contratto della posta: un'unica interfaccia, qualunque sia il provider dietro.

La UI e le API vedono solo `CasellaPosta`: Gmail, Outlook o la casella finta della demo si
scambiano cambiando `POSTA_PROVIDER` nel `.env`, senza toccare nient'altro.
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal, Protocol

from pydantic import BaseModel

IdCartella = Literal["in_arrivo", "inviata", "archivio"]
CARTELLE: dict[IdCartella, str] = {"in_arrivo": "Inbox", "inviata": "Sent", "archivio": "Archive"}


class CasellaNonConfigurata(RuntimeError):
    """Il provider scelto non è collegato (manca l'autorizzazione o la configurazione)."""


class Indirizzo(BaseModel):
    nome: str
    email: str


class MailBreve(BaseModel):
    """Una riga dell'elenco: senza il corpo."""
    id: str
    cartella: IdCartella
    da: Indirizzo
    a: list[Indirizzo]
    oggetto: str
    data: datetime
    anteprima: str
    letta: bool
    progetto_id: str | None = None


class Mail(MailBreve):
    testo: str          # sempre testo semplice: la UI non interpreta mai HTML delle mail


class Cartella(BaseModel):
    id: IdCartella
    nome: str
    totale: int
    non_lette: int


class CasellaPosta(Protocol):
    """Ciò che serve alla UI. L'identità (`persona_id`) la decide il backend dalla sessione."""

    def cartelle(self, persona_id: str) -> list[Cartella]: ...
    def messaggi(self, persona_id: str, cartella: IdCartella) -> list[MailBreve]: ...
    def messaggio(self, persona_id: str, mail_id: str) -> Mail | None: ...
    def segna_letta(self, persona_id: str, mail_id: str) -> None: ...


def anteprima(testo: str, massimo: int = 140) -> str:
    riga = " ".join(testo.split())
    return riga if len(riga) <= massimo else riga[: massimo - 1].rstrip() + "…"
