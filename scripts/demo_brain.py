"""Demo del Company Brain da terminale: il percorso completo riu-001 … riu-005 + PDF doc-001.

Uso:
    .venv/bin/python scripts/demo_brain.py                 # provider dell'ambiente (di default: mock)
    LLM_PROVIDER=locale LLM_REGISTRA=1 .venv/bin/python scripts/demo_brain.py
        # F9: chiama il modello vero (Qwen su LM Studio, impostato in .env) e REGISTRA ogni risposta
        # come mock in dati/mock_llm/<chiave>.json (sovrascrive i mock esistenti con le stesse chiavi:
        # controlla il diff prima di tenerli).

Legge `.env` senza stamparlo (come scripts/prova_llm.py). Per ogni documento stampa le proposte, gli
avvisi per il manager e la traccia dei passi (step, provider, esito, durata). Fra un documento e
l'altro il manager «approva tutto» come in dati/attese/README.md (strumento: backend/analisi/simulatore.py).
"""

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from backend.analisi.simulatore import esegui_percorso  # noqa: E402
from backend.llm import Config  # noqa: E402

ENV = Path(__file__).resolve().parent.parent / ".env"
if ENV.exists():
    for riga in ENV.read_text().splitlines():
        riga = riga.split("#", 1)[0].strip()
        if "=" in riga:
            k, v = riga.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())


def descrivi(p) -> str:
    c = p.contenuto
    if p.tipo == "nuovo_task":
        chi = c.get("assegnatario_id") or "nessuno"
        return f'{c["titolo"]} · {chi} · {c.get("scadenza") or "senza scadenza"} · {", ".join(p.aree_proposte) or "-"}'
    if p.tipo == "nuovo_fatto":
        return f'{c["soggetto"]} · {c["attributo"]}: {c["valore"]} · {", ".join(p.aree_proposte) or "-"}'
    if p.tipo == "chiudi_task":
        return f'{c["task_id"]} → {c["stato"]}'
    return f'{c["task_id"]} · {c["campo"]} → {c["valore"]}'


def main() -> None:
    cfg = Config.da_ambiente()
    print(f"provider={cfg.provider} modello={cfg.modello or '-'} registra={'sì' if cfg.registra else 'no'}")
    _, percorso = esegui_percorso(cfg)
    for doc, r, decisioni in percorso:
        print(f"\n{'=' * 90}\n{doc.id} · {doc.titolo} · {doc.data} · {len(doc.segmenti)} segmenti")
        print(f"\nProposte ({len(r.proposte)}):")
        for p in r.proposte:
            print(f"  [{p.tipo}] ({p.sicurezza}) {descrivi(p)}")
        print(f"\nAvvisi per il manager ({len(r.avvisi)}):")
        for a in r.avvisi:
            fonti = ", ".join(c.segmento_id for c in a.citazioni) or "-"
            print(f"  [{a.tipo}] {a.testo}\n      fonti: {fonti}")
        print("\nTraccia:")
        for p in r.passi:
            durata = f"{p.durata_ms} ms" if p.durata_ms is not None else "-"
            motivo = f" · {p.motivo}" if p.motivo else ""
            print(f"  {p.step:<20} {p.provider or 'codice':<7} {p.esito:<9} {durata:>8}{motivo}")
        print(f"\nDecisioni del manager: approvate {len(decisioni['approvate'])}, "
              f"rifiutate {decisioni['rifiutate'] or 'nessuna'}")


if __name__ == "__main__":
    main()
