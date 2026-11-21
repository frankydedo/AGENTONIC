"""Ingestione (F2): da una minuta in markdown a un `Documento` con segmenti numerati.

Codice deterministico, nessun modello. Formato della minuta (vedi `dati/riunioni/riu-001.md`):
front matter tra due righe `---` con `chiave: valore`, poi un turno di parola per paragrafo,
nella forma `**Nome Cognome:** testo`. Le righe senza `**Nome:**` continuano il turno precedente.
"""

import re

from backend.modelli import Citazione, Documento, Segmento

MAX_CARATTERI = 200_000          # oltre, il documento si rifiuta (limite di resilienza)
_TURNO = re.compile(r"^\*\*(?P<chi>[^*:]{1,80}):\*\*\s*(?P<testo>.*)$")
_DELIMITATORE = re.compile(r"</?\s*(documento|segmento|system|istruzioni)[^>]*>", re.IGNORECASE)


class DocumentoNonValido(ValueError):
    pass


def _front_matter(righe: list[str]) -> tuple[dict, list[str]]:
    if not righe or righe[0].strip() != "---":
        raise DocumentoNonValido("Manca l'intestazione (front matter tra due righe ---).")
    try:
        fine = next(i for i, r in enumerate(righe[1:], 1) if r.strip() == "---")
    except StopIteration:
        raise DocumentoNonValido("Intestazione non chiusa.") from None
    meta = {}
    for r in righe[1:fine]:
        if ":" in r:
            k, v = r.split(":", 1)
            v = v.strip().strip('"')
            if v.startswith("[") and v.endswith("]"):
                v = [x.strip() for x in v[1:-1].split(",") if x.strip()]
            meta[k.strip()] = v
    return meta, righe[fine + 1:]


def neutralizza(testo: str) -> str:
    """Toglie dal testo i finti delimitatori che proverebbero a uscire dalla sezione «dati» del prompt."""
    return _DELIMITATORE.sub("", testo)


def segmenta(testo: str, progetto_id: str | None = None) -> Documento:
    """Minuta markdown -> `Documento` con segmenti `riu-001#s001`, `#s002`, ... (orari vuoti)."""
    if len(testo) > MAX_CARATTERI:
        raise DocumentoNonValido(f"Documento troppo grande ({len(testo)} caratteri, massimo {MAX_CARATTERI}).")
    meta, corpo = _front_matter(testo.splitlines())
    for campo in ("id", "titolo", "data"):
        if not meta.get(campo):
            raise DocumentoNonValido(f"Manca il campo «{campo}» nell'intestazione.")
    doc_id = meta["id"]

    turni: list[tuple[str, str]] = []
    for riga in corpo:
        riga = riga.strip()
        if not riga:
            continue
        m = _TURNO.match(riga)
        if m:
            turni.append((m["chi"].strip(), m["testo"].strip()))
        elif turni:
            chi, t = turni[-1]
            turni[-1] = (chi, f"{t} {riga}")
    if not turni:
        raise DocumentoNonValido("Nessun turno di parola trovato (formato «**Nome:** testo»).")

    segmenti = [
        Segmento(id=f"{doc_id}#s{n:03d}", documento_id=doc_id, speaker=chi, testo=neutralizza(t))
        for n, (chi, t) in enumerate(turni, 1)
    ]
    partecipanti = meta.get("partecipanti", [])
    return Documento(
        id=doc_id,
        progetto_id=progetto_id or meta.get("progetto", ""),
        tipo="riunione",
        formato=meta.get("tipo", "minuta") if meta.get("tipo") in ("minuta", "trascrizione") else "minuta",
        titolo=meta["titolo"],
        data=meta["data"],
        ora_inizio=meta.get("ora_inizio") or None,
        partecipanti=partecipanti if isinstance(partecipanti, list) else [partecipanti],
        segmenti=segmenti,
    )


def citazione(doc: Documento, segmento_id: str) -> Citazione:
    """Costruisce la citazione dal segmento vero. Solleva KeyError se l'id non esiste."""
    seg = next((s for s in doc.segmenti if s.id == segmento_id), None)
    if seg is None:
        raise KeyError(segmento_id)
    return Citazione(segmento_id=seg.id, documento_id=doc.id, titolo=doc.titolo, data=doc.data,
                     orario=doc.ora_inizio, speaker=seg.speaker, frase=seg.testo)
