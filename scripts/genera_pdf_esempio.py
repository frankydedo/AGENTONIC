"""Genera `dati/documenti/doc-001.pdf` dal testo sorgente `dati/documenti/doc-001.md`.

Scrive a mano un PDF minimale (Helvetica, codifica WinAnsi): nessuna libreria in più.
Formato del sorgente: front matter tra due righe `---`, poi un paragrafo per blocco separato da
righe vuote; `# Titolo` è un titolo in grassetto; la riga `<!-- nuova pagina -->` va a pagina nuova.

Uso: .venv/bin/python scripts/genera_pdf_esempio.py
"""

import sys
import textwrap
from pathlib import Path

RADICE = Path(__file__).resolve().parent.parent
SORGENTE = RADICE / "dati" / "documenti" / "doc-001.md"
DESTINAZIONE = RADICE / "dati" / "documenti" / "doc-001.pdf"
NUOVA_PAGINA = "<!-- nuova pagina -->"


def _escape(riga: str) -> str:
    return riga.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _contenuto_pagina(paragrafi: list[str]) -> bytes:
    """Content stream di una pagina A4: un paragrafo dopo l'altro, con uno spazio tra i paragrafi."""
    righe = ["BT", "72 770 Td"]
    for par in paragrafi:
        if par.startswith("# "):
            font, corpo, interlinea, larghezza, par = "/F2", 13, 17, 70, par[2:]
        else:
            font, corpo, interlinea, larghezza = "/F1", 10.5, 14, 92
        righe.append(f"{font} {corpo} Tf")
        for riga in textwrap.wrap(par, larghezza):
            righe.append(f"({_escape(riga)}) Tj")
            righe.append(f"0 -{interlinea} Td")
        righe.append("0 -10 Td")  # spazio tra i paragrafi
    righe.append("ET")
    return "\n".join(righe).encode("cp1252")


def pdf_da_pagine(pagine: list[list[str]]) -> bytes:
    """Un PDF con una pagina per elemento di `pagine`, ogni pagina una lista di paragrafi."""
    n = len(pagine)
    id_pagine = [5 + 2 * i for i in range(n)]
    oggetti = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        f"<< /Type /Pages /Kids [{' '.join(f'{i} 0 R' for i in id_pagine)}] /Count {n} >>".encode(),
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    ]
    for i, paragrafi in enumerate(pagine):
        stream = _contenuto_pagina(paragrafi)
        oggetti.append(
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
            f"/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents {id_pagine[i] + 1} 0 R >>".encode()
        )
        oggetti.append(b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream")

    out = bytearray(b"%PDF-1.4\n")
    posizioni = []
    for num, corpo in enumerate(oggetti, 1):
        posizioni.append(len(out))
        out += b"%d 0 obj\n" % num + corpo + b"\nendobj\n"
    inizio_xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(oggetti) + 1)
    for p in posizioni:
        out += b"%010d 00000 n \n" % p
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(oggetti) + 1, inizio_xref)
    return bytes(out)


def pagine_da_markdown(testo: str) -> list[list[str]]:
    """Toglie il front matter e divide il corpo in pagine e paragrafi."""
    corpo = testo.split("---", 2)[2] if testo.startswith("---") else testo
    pagine = []
    for blocco in corpo.split(NUOVA_PAGINA):
        paragrafi = [" ".join(p.split()) for p in blocco.split("\n\n") if p.strip()]
        pagine.append(paragrafi)
    return pagine


def main() -> int:
    DESTINAZIONE.write_bytes(pdf_da_pagine(pagine_da_markdown(SORGENTE.read_text(encoding="utf-8"))))
    print(f"Scritto {DESTINAZIONE.relative_to(RADICE)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
