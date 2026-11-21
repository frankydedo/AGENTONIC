"""Casella finta per la demo: mail sintetiche in `dati/posta/caselle.json`, una casella per persona.

Lo stato «letta» vive in memoria (si azzera al riavvio del server): basta per una demo.
"""
from __future__ import annotations

import json
from pathlib import Path

from backend.posta.casella import CARTELLE, Cartella, IdCartella, Mail, MailBreve, anteprima

FILE = Path(__file__).resolve().parent.parent.parent / "dati" / "posta" / "caselle.json"


class CasellaFinta:
    def __init__(self, percorso: Path = FILE):
        grezzo = json.loads(percorso.read_text(encoding="utf-8"))
        self._mail: dict[str, list[Mail]] = {
            persona: [Mail(**m, anteprima=anteprima(m["testo"])) for m in elenco]
            for persona, elenco in grezzo.items() if not persona.startswith("_")
        }
        self._lette: dict[str, set[str]] = {p: {m.id for m in ms if m.letta} for p, ms in self._mail.items()}

    def _sue(self, persona_id: str) -> list[Mail]:
        lette = self._lette.get(persona_id, set())
        return [m.model_copy(update={"letta": m.id in lette}) for m in self._mail.get(persona_id, [])]

    def cartelle(self, persona_id: str) -> list[Cartella]:
        sue = self._sue(persona_id)
        return [Cartella(id=c, nome=nome, totale=sum(m.cartella == c for m in sue),
                         non_lette=sum(m.cartella == c and not m.letta for m in sue))
                for c, nome in CARTELLE.items()]

    def messaggi(self, persona_id: str, cartella: IdCartella) -> list[MailBreve]:
        sue = [m for m in self._sue(persona_id) if m.cartella == cartella]
        return [MailBreve(**m.model_dump(exclude={"testo"})) for m in sorted(sue, key=lambda m: m.data, reverse=True)]

    def messaggio(self, persona_id: str, mail_id: str) -> Mail | None:
        return next((m for m in self._sue(persona_id) if m.id == mail_id), None)

    def segna_letta(self, persona_id: str, mail_id: str) -> None:
        self._lette.setdefault(persona_id, set()).add(mail_id)
