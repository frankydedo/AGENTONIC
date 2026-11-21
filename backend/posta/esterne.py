"""Adattatori per le caselle vere. Scritti contro la stessa interfaccia, non ancora collegati.

Per attivarli serve un'autorizzazione dell'utente (OAuth) che in demo non c'è, e i dati personali
veri che arriverebbero al modello vanno valutati per GDPR e hosting in UE prima di accenderli:
- Gmail: progetto Google Cloud, schermata di consenso, scope `gmail.readonly`;
  `users.messages.list` / `users.messages.get` (formato `full`, solo la parte text/plain).
- Outlook: app registrata in Microsoft Entra, permesso delegato `Mail.Read`;
  Microsoft Graph `GET /me/mailFolders/{cartella}/messages` e `GET /me/messages/{id}`
  con `Prefer: outlook.body-content-type="text"`.
Finché non sono configurati rispondono `CasellaNonConfigurata`: mai mail inventate.
"""
from __future__ import annotations

from backend.posta.casella import Cartella, CasellaNonConfigurata, IdCartella, Mail, MailBreve


class _CasellaEsterna:
    nome = "esterna"

    def _errore(self) -> CasellaNonConfigurata:
        return CasellaNonConfigurata(f"La casella {self.nome} non è ancora collegata: serve l'autorizzazione dell'utente.")

    def cartelle(self, persona_id: str) -> list[Cartella]:
        raise self._errore()

    def messaggi(self, persona_id: str, cartella: IdCartella) -> list[MailBreve]:
        raise self._errore()

    def messaggio(self, persona_id: str, mail_id: str) -> Mail | None:
        raise self._errore()

    def segna_letta(self, persona_id: str, mail_id: str) -> None:
        raise self._errore()


class CasellaGmail(_CasellaEsterna):
    nome = "Gmail"


class CasellaOutlook(_CasellaEsterna):
    nome = "Outlook"
