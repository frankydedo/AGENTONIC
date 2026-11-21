"""Persone (F4): dal nome detto o scritto nel documento all'id della persona.

Codice deterministico, nessun modello: il modello non imposta mai un `persona_id`.
Il confronto è normalizzato (minuscole, senza accenti, spazi compattati, punti ignorati, apostrofi
tipografici come quello dritto) su nome completo, alias, nome (anche composto: «Gian Marco» per
«Gian Marco Rossi») e cognome. Se il nome corrisponde a più persone non si sceglie: l'ambiguità
diventa un punto oscuro per il manager.
"""

import re
import unicodedata

from pydantic import BaseModel

from backend.modelli import Documento, Persona, Sconosciuto


class Abbinamento(BaseModel):
    persona_id: str | None = None      # impostato solo se il nome corrisponde a una sola persona
    candidati: list[str] = []          # id delle persone che corrispondono
    motivo: str | None = None          # perché non c'è un abbinamento (testo per il manager)


_APOSTROFI = str.maketrans({c: "'" for c in "’‘ʼ`´"})   # «D’Amico», «D`Amico» -> «D'Amico»


def normalizza(testo: str) -> str:
    """«  Marco B. » -> «marco b»; «Niccolò» -> «niccolo»; «D’Amico» -> «d'amico»."""
    senza_accenti = "".join(c for c in unicodedata.normalize("NFKD", testo.translate(_APOSTROFI))
                            if not unicodedata.combining(c))
    return " ".join(senza_accenti.lower().replace(".", " ").split())


def _chiavi(p: Persona) -> set[str]:
    completo = normalizza(p.nome)
    parole = completo.split()
    chiavi = {completo, *(normalizza(a) for a in p.alias)}
    # nome, anche composto: i prefissi di parole intere («gian», «gian marco» per «Gian Marco Rossi»).
    # Solo prefissi: «marco» da solo NON è una chiave di «Gian Marco Rossi».
    chiavi.update(" ".join(parole[:n]) for n in range(1, len(parole)))
    if len(parole) > 1:
        chiavi.add(" ".join(parole[1:]))           # cognome (anche di più parole)
    return chiavi - {""}


def _elenco(nomi: list[str]) -> str:
    return nomi[0] if len(nomi) == 1 else f"{', '.join(nomi[:-1])} or {nomi[-1]}"


def abbina_nome(nome: str | None, persone: list[Persona]) -> Abbinamento:
    """Nome detto -> persona. Univoco -> id; più candidati -> None + motivo; nessuno -> None + motivo."""
    chiave = normalizza(nome or "")
    if not chiave:
        return Abbinamento(motivo="no name given")
    trovate: dict[str, Persona] = {}
    for p in persone:
        if chiave in _chiavi(p):
            trovate.setdefault(p.id, p)
    detto = (nome or "").strip()
    if len(trovate) == 1:
        return Abbinamento(persona_id=next(iter(trovate)), candidati=list(trovate))
    if len(trovate) > 1:
        nomi = [p.nome for p in trovate.values()]
        return Abbinamento(candidati=list(trovate), motivo=f'"{detto}" is ambiguous: {_elenco(nomi)}')
    return Abbinamento(motivo=f'"{detto}" is not a project member')


def abbina_speaker(doc: Documento, persone: list[Persona]) -> Documento:
    """Copia del documento con `Segmento.persona_id` impostato dove lo speaker è univoco."""
    segmenti = [s.model_copy(update={"persona_id": abbina_nome(s.speaker, persone).persona_id})
                for s in doc.segmenti]
    return doc.model_copy(update={"segmenti": segmenti}, deep=True)


def classifica_sconosciuto(s: Sconosciuto, persone_azienda: list[Persona]) -> Sconosciuto:
    """Imposta `persona_id` se lo sconosciuto è un dipendente fuori dal progetto (altrimenti None)."""
    return s.model_copy(update={"persona_id": abbina_nome(s.nome, persone_azienda).persona_id})


# Persone con un titolo ("l'ingegner Venturi", "il dott. Rossi"): regola deterministica, così uno
# sconosciuto non dipende solo dal modello. Il nome che segue il titolo deve iniziare con la maiuscola.
_TITOLO = re.compile(
    r"\b((?i:mr\.?|mrs\.?|ms\.?|dr\.?|eng\.|ing\.|ingegner[ea]?|dott\.(?:ssa)?|dottor(?:essa)?|sig\.(?:ra)?|signor[a]?|avv\.|avvocat[oa]|"
    r"geom\.|geometra|arch\.|architett[oa]))\s+([A-ZÀ-Ý][a-zà-ÿ']+(?:\s+[A-ZÀ-Ý][a-zà-ÿ']+)?)")


def sconosciuti_con_titolo(doc: Documento, membri: list[Persona], gia: list[Sconosciuto]) -> list[Sconosciuto]:
    """Persone citate con un titolo che non sono membri del progetto né già tra gli sconosciuti."""
    noti = {normalizza(s.nome) for s in gia}
    nuovi: list[Sconosciuto] = []
    for seg in doc.segmenti:
        for m in _TITOLO.finditer(seg.testo):
            nome = re.sub(r"['’]s$", "", m.group(2))     # genitivo inglese: «Mr Venturi's» è Venturi
            a = abbina_nome(nome, membri)
            if a.persona_id or a.candidati:    # è (o può essere) un membro: non è uno sconosciuto
                continue
            chiave = normalizza(nome)
            if any(chiave in n for n in noti):
                continue
            noti.add(chiave)
            nuovi.append(Sconosciuto(nome=f"{m.group(1)} {nome}", segmenti=[seg.id],
                                     descrizione="A person mentioned in the document who is not a project member."))
    return nuovi
