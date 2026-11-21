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


# Caratteri che non si vedono ma spezzano o nascondono testo: larghezza zero, trattino morbido,
# controlli bidirezionali, selettori di variante, riempitivi e «tag» Unicode (ASCII invisibile).
_INVISIBILI = dict.fromkeys(
    [0x00AD, 0x034F, 0x061C, 0x115F, 0x1160, 0x17B4, 0x17B5, 0x3164, 0xFEFF, 0xFFA0]
    + [c for a, b in ((0x180B, 0x180F), (0x200B, 0x200F), (0x202A, 0x202E), (0x2060, 0x206F),
                      (0xFE00, 0xFE0F), (0xFFF9, 0xFFFB), (0x1BCA0, 0x1BCA3), (0x1D173, 0x1D17A),
                      (0xE0000, 0xE0FFF)) for c in range(a, b + 1)])
ID_VALIDO = re.compile(r"^[a-z0-9][a-z0-9-]{0,39}\Z")           # \Z: neanche un a capo in coda
DATA_VALIDA = re.compile(r"^[0-9]{4}-[0-9]{2}-[0-9]{2}\Z")
MAX_TITOLO = 200
_MAX_GIRI = 8                    # livelli di codifica annidata che si sciolgono; oltre è un attacco
# Riferimenti a carattere dell'HTML, con o senza «;»: tutti i numerici e i soli nomi che valgono & < > "
_RIFERIMENTO = re.compile(r"&(?:#(?:x0*([0-9a-f]{1,6})|0*([0-9]{1,7}))|(amp|lt|gt|nvlt|nvgt|quot));?",
                          re.IGNORECASE | re.ASCII)
_NOMI = {"amp": "&", "lt": "<", "gt": ">", "nvlt": "<", "nvgt": ">", "quot": '"'}


def _carattere(m: re.Match) -> str:
    if m[3]:
        return _NOMI[m[3].lower()]
    codice = int(m[1], 16) if m[1] else int(m[2])
    c = chr(codice) if codice <= 0x10FFFF else " "
    return c if c.isprintable() else " "     # controlli, surrogati e invisibili non si ricreano


def _senza_invisibili(testo: str) -> str:
    return unicodedata.normalize("NFKC", testo).translate(_INVISIBILI)


def neutralizza(testo: str) -> str:
    """Rende il testo incapace di aprire o chiudere un delimitatore del prompt.

    NFKC (`＜` diventa `<`), via i caratteri invisibili, poi si sciolgono le entità (`&lt;`, `&lt`,
    `&#60;`, `&#x3c;`, anche codificate più volte: `&amp;lt;`) finché il testo non cambia più; alla
    fine `<` e `>` diventano `‹` e `›`. Dopo la pulizia nel testo non esiste più nessun `<` o `>`,
    e ripulire di nuovo non cambia nulla."""
    for _ in range(_MAX_GIRI):
        pulito = _RIFERIMENTO.sub(_carattere, _senza_invisibili(testo))
        if pulito == testo:
            break
        testo = pulito
    else:   # ancora instabile: codifica annidata apposta. Senza «&» non resta nessuna entità.
        testo = _senza_invisibili(testo).replace("&", "+")
    return testo.replace("<", "‹").replace(">", "›")


def _pulito(testo: str) -> str:
    """Campo dell'intestazione come dato: neutralizzato e su una riga sola."""
    return " ".join(neutralizza(testo).split())


def titolo_pulito(titolo: str) -> str:
    """Titolo neutralizzato, su una riga, non vuoto e corto; altrimenti DocumentoNonValido."""
    if not isinstance(titolo, str):
        raise DocumentoNonValido("Il titolo del documento deve essere un testo.")
    titolo = _pulito(titolo)
    if not titolo or len(titolo) > MAX_TITOLO:
        raise DocumentoNonValido(f"Titolo del documento mancante o troppo lungo (massimo {MAX_TITOLO} caratteri).")
    return titolo


def valida_id_e_data(doc_id: str, data: str) -> None:
    """Id minuscolo e corto (es. «riu-001») e data AAAA-MM-GG reale, altrimenti DocumentoNonValido."""
    if not isinstance(doc_id, str) or not ID_VALIDO.match(doc_id):
        raise DocumentoNonValido(f"Id del documento non valido: «{_pulito(str(doc_id or ''))[:60]}» "
                                 "(solo a-z, 0-9 e -, massimo 40).")
    try:
        if not isinstance(data, str) or not DATA_VALIDA.match(data):
            raise ValueError
        date.fromisoformat(data)
    except ValueError:
        raise DocumentoNonValido(f"Data del documento non valida: «{_pulito(str(data or ''))[:60]}» "
                                 "(formato AAAA-MM-GG).") from None


def segmenta(testo: str, progetto_id: str | None = None) -> Documento:
    """Minuta markdown -> `Documento` con segmenti `riu-001#s001`, `#s002`, ... (orari vuoti)."""
    if len(testo) > MAX_CARATTERI:
        raise DocumentoNonValido(f"Documento troppo grande ({len(testo)} caratteri, massimo {MAX_CARATTERI}).")
    meta, corpo = _front_matter(testo.lstrip("\ufeff").splitlines())   # il BOM di Windows non è un errore
    for campo in ("id", "titolo", "data"):
        if not meta.get(campo):
            raise DocumentoNonValido(f"Manca il campo «{campo}» nell'intestazione.")
    for campo in ("id", "titolo", "data", "ora_inizio", "progetto"):
        if not isinstance(meta.get(campo, ""), str):   # «id: [a, b]» è un elenco, non un testo
            raise DocumentoNonValido(f"Il campo «{campo}» dell'intestazione deve essere un testo, non un elenco.")
    doc_id = meta["id"]
    valida_id_e_data(doc_id, meta["data"])
    titolo = titolo_pulito(meta["titolo"])

    turni: list[tuple[str, str]] = []
    for riga in corpo:
        riga = neutralizza(riga).strip()   # prima di leggere il turno: anche lo speaker è un dato
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
    if sum(len(s.testo) for s in segmenti) > MAX_CARATTERI:   # NFKC può allungare: il limite vale sul testo pulito
        raise DocumentoNonValido(f"Documento troppo grande dopo la pulizia (massimo {MAX_CARATTERI} caratteri).")
    partecipanti = meta.get("partecipanti", [])
    partecipanti = partecipanti if isinstance(partecipanti, list) else [partecipanti]
    return Documento(
        id=doc_id,
        progetto_id=progetto_id or _pulito(meta.get("progetto", ""))[:40],
        tipo="riunione",
        formato=meta.get("tipo", "minuta") if meta.get("tipo") in ("minuta", "trascrizione") else "minuta",
        titolo=titolo,
        data=meta["data"],
        ora_inizio=_pulito(meta.get("ora_inizio", ""))[:20] or None,
        partecipanti=[p for p in (_pulito(x)[:80] for x in partecipanti) if p],
        segmenti=segmenti,
    )


def citazione(doc: Documento, segmento_id: str) -> Citazione:
    """Costruisce la citazione dal segmento vero. Solleva KeyError se l'id non esiste."""
    seg = next((s for s in doc.segmenti if s.id == segmento_id), None)
    if seg is None:
        raise KeyError(segmento_id)
    return Citazione(segmento_id=seg.id, documento_id=doc.id, titolo=doc.titolo, data=doc.data,
                     orario=doc.ora_inizio, speaker=seg.speaker, frase=seg.testo, pagina=seg.pagina)
