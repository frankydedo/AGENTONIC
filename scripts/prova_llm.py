"""Prova il provider del modello configurato in .env con una domanda minima.

Uso: .venv/bin/python scripts/prova_llm.py
Legge .env senza stamparlo; stampa solo provider, modello, durata, tentativi e risposta.
"""

import os
import sys
from pathlib import Path

from pydantic import BaseModel

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from backend.llm import Config, chat  # noqa: E402

ENV = Path(__file__).resolve().parent.parent / ".env"
if ENV.exists():
    for riga in ENV.read_text().splitlines():
        riga = riga.split("#", 1)[0].strip()
        if "=" in riga:
            k, v = riga.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())


class Saluto(BaseModel):
    risposta: str
    lingua: str


cfg = Config.da_ambiente()
print(f"provider={cfg.provider} modello={cfg.modello or '-'} url={'impostato' if cfg.base_url else 'mancante'}")
r = chat([{"role": "system", "content": "Rispondi solo in JSON."},
          {"role": "user", "content": "Saluta in una frase e indica la lingua usata."}],
         Saluto, chiave="prova_llm", config=cfg)
print(f"ok in {r.durata_ms} ms, tentativi={r.tentativi}: {r.dati}")
