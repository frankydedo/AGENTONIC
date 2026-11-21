"""Demo del Company Brain da terminale: il percorso completo riu-001 … riu-005 + PDF doc-001.

Uso:
    LLM_PROVIDER=mock .venv/bin/python scripts/demo_brain.py   # risposte registrate, senza rete
    .venv/bin/python scripts/demo_brain.py                 # provider di .env (se manca: mock)
    LLM_PROVIDER=locale LLM_REGISTRA=1 .venv/bin/python scripts/demo_brain.py
        # F9: chiama il modello vero (Qwen su LM Studio, impostato in .env) e REGISTRA ogni risposta
        # come mock in dati/mock_llm/<chiave>.json (sovrascrive i mock esistenti con le stesse chiavi:
        # controlla il diff prima di tenerli).

Legge `.env` senza stamparlo (come scripts/prova_llm.py). Per ogni documento stampa le proposte, gli
avvisi per il manager e la traccia dei passi (step, provider, esito, durata). Fra un documento e
l'altro il manager «approva tutto» come in dati/attese/README.md (strumento: backend/analisi/simulatore.py).

Con un modello vero controlla prima che risponda: se non è raggiungibile si ferma subito con un
messaggio (niente traceback, niente attese dei timeout) che dice di rilanciarlo con LLM_PROVIDER=mock.
"""

import os
import sys
from pathlib import Path

import httpx

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
        return f'{c["task_id"]} → {c["valore"]}'
    return f'{c["task_id"]} · {c["campo"]} → {c["valore"]}'


CON_IL_MOCK = ("Per la demo con le risposte registrate lancia:\n"
               "    LLM_PROVIDER=mock .venv/bin/python scripts/demo_brain.py")


def controlla_modello(cfg: Config) -> None:
    """Con un modello vero: se non risponde, lo script si ferma qui con un messaggio chiaro.

    Senza questo controllo ogni chiamata aspetterebbe il suo timeout e il percorso uscirebbe vuoto.
    Nel messaggio solo il tipo dell'errore: mai l'indirizzo né la chiave."""
    if cfg.provider == "mock":
        return
    if not cfg.base_url or not cfg.modello:
        motivo = "LLM_BASE_URL o LLM_MODEL non impostati"
    else:
        intestazioni = {"Authorization": f"Bearer {cfg.api_key}"} if cfg.api_key else {}
        try:
            r = httpx.get(f"{cfg.base_url}/models", headers=intestazioni, timeout=min(cfg.timeout_s, 5.0))
            motivo = f"HTTP {r.status_code}" if r.status_code >= 500 else None
        except Exception as e:  # noqa: BLE001 - rete, URL sbagliato, timeout: per chi lancia è lo stesso
            motivo = type(e).__name__
    if motivo:
        sys.exit(f"Il modello non è raggiungibile (provider {cfg.provider}: {motivo}).\n"
                 f"Controlla LLM_BASE_URL e LLM_MODEL in .env e che il modello sia acceso.\n{CON_IL_MOCK}")


def main() -> None:
    try:
        cfg = Config.da_ambiente()
    except ValueError as e:
        sys.exit(f"Configurazione del modello non valida: {e}\n{CON_IL_MOCK}")
    print(f"provider={cfg.provider} modello={cfg.modello or '-'} registra={'sì' if cfg.registra else 'no'}")
    controlla_modello(cfg)
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
