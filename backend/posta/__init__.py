"""Posta: le mail di ciascuno dentro il Company Brain, qualunque sia il provider (Owner: Mauro).

- `casella.py`: l'interfaccia unica `CasellaPosta` e i modelli;
- `finta.py`: la casella della demo (dati sintetici); `esterne.py`: Gmail e Outlook, non ancora collegati;
- `chiedi.py`: «Chiedi al Brain su questa mail»;
- `api.py`: le rotte `/posta/...`.

Il provider si sceglie con `POSTA_PROVIDER` = `finta` (predefinito) | `gmail` | `outlook`.
"""
from __future__ import annotations

import os
from functools import lru_cache

from backend.posta.casella import CasellaPosta


@lru_cache(maxsize=4)
def _casella(provider: str) -> CasellaPosta:
    if provider == "gmail":
        from backend.posta.esterne import CasellaGmail
        return CasellaGmail()
    if provider == "outlook":
        from backend.posta.esterne import CasellaOutlook
        return CasellaOutlook()
    from backend.posta.finta import CasellaFinta
    return CasellaFinta()


def casella() -> CasellaPosta:
    return _casella(os.environ.get("POSTA_PROVIDER", "finta").strip().lower())
