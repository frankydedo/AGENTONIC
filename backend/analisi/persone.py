"""Persone (F4): dal nome detto o scritto nel documento all'id della persona.

Codice deterministico, nessun modello: il modello non imposta mai un `persona_id`.
Il confronto è normalizzato (minuscole, senza accenti, spazi compattati, punti ignorati) su
nome completo, alias, nome e cognome. Se il nome corrisponde a più persone non si sceglie:
l'ambiguità diventa un punto oscuro per il manager.
"""

import unicodedata

from pydantic import BaseModel

from backend.modelli import Documento, Persona, Sconosciuto


class Abbinamento(BaseModel):
    persona_id: str | None = None      # impostato solo se il nome corrisponde a una sola persona
    candidati: list[str] = []          # id delle persone che corrispondono
    motivo: str | None = None          # perché non c'è un abbinamento (testo per il manager)


def normalizza(testo: str) -> str:
    """«  Marco B. » -> «marco b»; «Niccolò» -> «niccolo»."""
    senza_accenti = "".join(c for c in unicodedata.normalize("NFKD", testo.replace("’", "'").replace("‘", "'")) if not unicodedata.combining(c))
    return " ".join(senza_accenti.lower().replace(".", " ").split())


def _chiavi(p: Persona) -> set[str]:
    completo = normalizza(p.nome)
    parole = completo.split()
    chiavi = {completo, *(normalizza(a) for a in p.alias)}
    if parole:
        chiavi.add(parole[0])                      # nome
    if len(parole) > 1:
        chiavi.add(" ".join(parole[1:]))           # cognome (anche di più parole)
    return chiavi - {""}


def _elenco(nomi: list[str]) -> str:
    return nomi[0] if len(nomi) == 1 else f"{', '.join(nomi[:-1])} o {nomi[-1]}"


def abbina_nome(nome: str | None, persone: list[Persona]) -> Abbinamento:
    """Nome detto -> persona. Univoco -> id; più candidati -> None + motivo; nessuno -> None + motivo."""
    chiave = normalizza(nome or "")
    if not chiave:
        return Abbinamento(motivo="nessun nome indicato")
    trovate: dict[str, Persona] = {}
    for p in persone:
        if chiave in _chiavi(p):
            trovate.setdefault(p.id, p)
    detto = (nome or "").strip()
    if len(trovate) == 1:
        return Abbinamento(persona_id=next(iter(trovate)), candidati=list(trovate))
    if len(trovate) > 1:
        nomi = [p.nome for p in trovate.values()]
        return Abbinamento(candidati=list(trovate), motivo=f'"{detto}" è ambiguo: {_elenco(nomi)}')
    return Abbinamento(motivo=f'"{detto}" non è un membro del progetto')


def abbina_speaker(doc: Documento, persone: list[Persona]) -> Documento:
    """Copia del documento con `Segmento.persona_id` impostato dove lo speaker è univoco."""
    segmenti = [s.model_copy(update={"persona_id": abbina_nome(s.speaker, persone).persona_id})
                for s in doc.segmenti]
    return doc.model_copy(update={"segmenti": segmenti}, deep=True)


def classifica_sconosciuto(s: Sconosciuto, persone_azienda: list[Persona]) -> Sconosciuto:
    """Imposta `persona_id` se lo sconosciuto è un dipendente fuori dal progetto (altrimenti None)."""
    return s.model_copy(update={"persona_id": abbina_nome(s.nome, persone_azienda).persona_id})
