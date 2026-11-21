"""Ingestione dei PDF integrativi (F11): da un PDF a un `Documento` con un segmento per paragrafo.

Codice deterministico, nessun modello e niente OCR. Il testo di ogni pagina si estrae con pypdf
in modalità «layout», che conserva come righe vuote gli spazi verticali tra i paragrafi (la
modalità normale li perde). Euristica, se una pagina non ha righe vuote: il paragrafo finisce
alla riga che termina con . : ; ! ?
Le righe di un paragrafo si uniscono con uno spazio. Id dei segmenti: `doc-001#p02s03`
(pagina 2, paragrafo 3), entrambi da 1.
"""

import io
import re

from pypdf import PdfReader

from backend.analisi import ingestione
from backend.analisi.ingestione import DocumentoNonValido, valida_id_e_data
from backend.modelli import Documento, Segmento

MAX_BYTE = 10 * 1024 * 1024      # 10 MB
MAX_PAGINE = 50
SPEAKER = "(documento)"
_RIGA_VUOTA = re.compile(r"\n[ \t\f\r]*\n")
_FINE_FRASE = (".", ":", ";", "!", "?")
_CONTROLLO = re.compile(r"[\x00-\x08\x0b-\x1f\x7f]")


def _testo_pagina(pagina) -> str:
    try:
        return pagina.extract_text(extraction_mode="layout")
    except Exception:  # alcuni PDF non reggono la modalità layout: si prova quella normale
        return pagina.extract_text()


def _paragrafi(testo: str) -> list[str]:
    """Divide il testo di una pagina in paragrafi (vedi l'euristica nella docstring del modulo)."""
    testo = _CONTROLLO.sub(" ", testo.replace("\r\n", "\n"))
    if _RIGA_VUOTA.search(testo):
        blocchi = _RIGA_VUOTA.split(testo)
    else:
        blocchi, corrente = [], []
        for riga in testo.split("\n"):
            corrente.append(riga)
            if riga.strip().endswith(_FINE_FRASE):
                blocchi.append("\n".join(corrente))
                corrente = []
        blocchi.append("\n".join(corrente))
    paragrafi = [" ".join(_neutralizza(b).split()) for b in blocchi]
    return [p for p in paragrafi if p]


def _neutralizza(testo: str) -> str:
    """`ingestione.neutralizza` ripetuta finché il testo non cambia: «</docu</documento>mento>»
    non deve ricomporre un delimitatore dopo la prima pulizia."""
    while (pulito := ingestione.neutralizza(testo)) != testo:
        testo = pulito
    return testo


def segmenta_pdf(dati: bytes, doc_id: str, titolo: str, data: str, progetto_id: str) -> Documento:
    """PDF -> `Documento` integrativo con segmenti `doc-001#p01s01`, ... e `pagina` da 1.

    Solleva `DocumentoNonValido` se il file non è un PDF, è cifrato, non ha testo estraibile
    (scansione) o supera i limiti di dimensione, pagine o caratteri.
    """
    valida_id_e_data(doc_id, data)
    if len(dati) > MAX_BYTE:
        raise DocumentoNonValido(f"PDF troppo grande ({len(dati) // (1024 * 1024)} MB, massimo {MAX_BYTE // (1024 * 1024)} MB).")
    if b"%PDF-" not in dati[:1024]:
        raise DocumentoNonValido("Il file non è un PDF.")
    try:
        lettore = PdfReader(io.BytesIO(dati))
        cifrato = lettore.is_encrypted
    except Exception:
        raise DocumentoNonValido("Il PDF è danneggiato o non leggibile.") from None
    if cifrato:
        raise DocumentoNonValido("Il PDF è protetto da password: caricane una copia senza protezione.")
    try:
        pagine = lettore.pages
        n_pagine = len(pagine)
    except Exception:
        raise DocumentoNonValido("Il PDF è danneggiato o non leggibile.") from None
    if n_pagine > MAX_PAGINE:
        raise DocumentoNonValido(f"Il PDF ha troppe pagine ({n_pagine}, massimo {MAX_PAGINE}).")

    segmenti: list[Segmento] = []
    caratteri = 0
    for num_pagina, pagina in enumerate(pagine, 1):
        try:
            testo = _testo_pagina(pagina)
        except Exception:
            raise DocumentoNonValido(f"Non riesco a leggere il testo della pagina {num_pagina}.") from None
        for n, paragrafo in enumerate(_paragrafi(testo), 1):
            caratteri += len(paragrafo)
            if caratteri > ingestione.MAX_CARATTERI:
                raise DocumentoNonValido(f"Documento troppo lungo (oltre {ingestione.MAX_CARATTERI} caratteri).")
            segmenti.append(Segmento(
                id=f"{doc_id}#p{num_pagina:02d}s{n:02d}", documento_id=doc_id, speaker=SPEAKER,
                pagina=num_pagina, testo=paragrafo,  # già neutralizzato e senza paragrafi vuoti
            ))
    if not segmenti:
        raise DocumentoNonValido("Il PDF non contiene testo estraibile (forse è una scansione: l'OCR non è supportato).")

    return Documento(
        id=doc_id, progetto_id=progetto_id, tipo="integrativo", formato="pdf",
        titolo=titolo, data=data, segmenti=segmenti,
    )
