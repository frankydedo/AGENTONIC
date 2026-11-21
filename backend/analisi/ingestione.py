"""Ingestione (F2): da una minuta in markdown a un `Documento` con segmenti numerati.

Codice deterministico, nessun modello. Formato della minuta (vedi `dati/riunioni/riu-001.md`):
front matter tra due righe `---` con `chiave: valore`, poi un turno di parola per paragrafo,
nella forma `**Nome Cognome:** testo`. Le righe senza `**Nome:**` continuano il turno precedente.
"""

import re
import unicodedata
from datetime import date

from backend.modelli import Citazione, Documento, Segmento

MAX_CARATTERI = 200_000          # oltre, il documento si rifiuta (limite di resilienza)
_TURNO = re.compile(r"^\*\*(?P<chi>[^*:]{1,80}):\*\*\s*(?P<testo>.*)$")


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


_INVISIBILI = dict.fromkeys(map(ord, "\u200b\u200c\u200d\u2060\ufeff"), None)
ID_VALIDO = re.compile(r"^[a-z0-9][a-z0-9-]{0,39}$")
DATA_VALIDA = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def neutralizza(testo: str) -> str:
    """Rende il testo incapace di aprire o chiudere un delimitatore del prompt.

    NFKC (`＜` diventa `<`), via i caratteri invisibili, poi `<`, `>` e le entità `&lt;`/`&gt;`
    diventano `‹`/`›`: dopo la pulizia nel testo non esiste più nessun `<` o `>`."""
    testo = unicodedata.normalize("NFKC", testo).translate(_INVISIBILI)
    testo = re.sub(r"&(lt|#0*60|#x0*3c);", "‹", testo, flags=re.IGNORECASE)
    testo = re.sub(r"&(gt|#0*62|#x0*3e);", "›", testo, flags=re.IGNORECASE)
    return testo.replace("<", "‹").replace(">", "›")


def valida_id_e_data(doc_id: str, data: str) -> None:
    """Id minuscolo e corto (es. «riu-001») e data AAAA-MM-GG reale, altrimenti DocumentoNonValido."""
    if not ID_VALIDO.match(doc_id or ""):
        raise DocumentoNonValido(f"Id del documento non valido: «{doc_id}» (solo a-z, 0-9 e -, massimo 40).")
    try:
        if not DATA_VALIDA.match(data or ""):
            raise ValueError
        date.fromisoformat(data)
    except ValueError:
        raise DocumentoNonValido(f"Data del documento non valida: «{data}» (formato AAAA-MM-GG).") from None


def segmenta(testo: str, progetto_id: str | None = None) -> Documento:
    """Minuta markdown -> `Documento` con segmenti `riu-001#s001`, `#s002`, ... (orari vuoti)."""
    if len(testo) > MAX_CARATTERI:
        raise DocumentoNonValido(f"Documento troppo grande ({len(testo)} caratteri, massimo {MAX_CARATTERI}).")
    meta, corpo = _front_matter(testo.splitlines())
    for campo in ("id", "titolo", "data"):
        if not meta.get(campo):
            raise DocumentoNonValido(f"Manca il campo «{campo}» nell'intestazione.")
    doc_id = meta["id"]
    valida_id_e_data(doc_id, meta["data"])

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
                     orario=doc.ora_inizio, speaker=seg.speaker, frase=seg.testo, pagina=seg.pagina)
