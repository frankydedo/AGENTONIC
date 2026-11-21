"""Prova rapida 2: tre minute più ricche, quasi tutte le trappole della demo, circa 2 minuti con Qwen.

Passa dall'API vera su un db temporaneo (non tocca `brain.db`). Minute in `dati/prova_rapida_2/`:
  rap-101 kick-off      budget, costo inverter (fornitori+budget), «Marco» ambiguo, dipendenza HMI ← tag,
                        manuale senza responsabile
  rap-102 avanzamento   Marco Bianchi chiarisce chi fa i tag, il quadro slitta 10/12 → 18/12, inverter
                        6.200 → 7.400 €, ingegner Venturi (sconosciuto), Paola Greco (fuori progetto),
                        ferie di Davide (il manager RIFIUTA questa proposta: controllo 2)
  rap-103 fine giornata «ho finito la lista dei tag» (chiudi_task), HMI in corso
poi 8 domande da persone diverse. Stampa ogni passo appena finisce; si ferma oltre il limite di tempo.

Uso (dalla root, con .env che punta all'Air):
  .venv/bin/python scripts/prova_rapida_2.py           # modello di .env
  .venv/bin/python scripts/prova_rapida_2.py --mock    # prova a secco, nessuna rete
Opzioni: --timeout 90 (secondi per chiamata), --limite 300 (secondi in tutto).
Report in `prove/rapida2-<data-ora>.md` (escluso da git).
"""

import argparse
import json
import os
import sys
import tempfile
import time
from datetime import datetime
from pathlib import Path

RADICE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RADICE))
PRJ = "prj-01"
GIULIA, MARCO_B, SARA, ELENA = ({"X-Persona": p} for p in ("p-01", "p-02", "p-04", "p-06"))


def leggi_env() -> None:
    env = RADICE / ".env"
    if env.exists():
        for riga in env.read_text().splitlines():
            riga = riga.split("#", 1)[0].strip()
            if "=" in riga:
                k, v = riga.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--mock", action="store_true", help="prova a secco con i mock, nessuna rete")
    ap.add_argument("--timeout", type=float, default=90.0, help="secondi per chiamata al modello")
    ap.add_argument("--limite", type=float, default=300.0, help="secondi in tutto, poi si ferma")
    args = ap.parse_args()

    leggi_env()
    if args.mock:
        os.environ["LLM_PROVIDER"] = "mock"
    os.environ.pop("LLM_REGISTRA", None)
    os.environ.setdefault("LLM_PARALLELO", "1")
    os.environ["LLM_TIMEOUT"] = str(args.timeout)
    os.environ["BRAIN_DB"] = str(Path(tempfile.mkdtemp(prefix="prova_rapida2_")) / "prova.db")

    import httpx
    from fastapi.testclient import TestClient

    from backend import app as modulo_app
    from backend import db
    from backend.llm import Config

    cfg = Config.da_ambiente()
    (RADICE / "prove").mkdir(exist_ok=True)
    file_report = RADICE / "prove" / f"rapida2-{datetime.now():%Y%m%d-%H%M%S}.md"
    righe: list[str] = []
    inizio = time.monotonic()
    esiti: list[tuple[str, bool]] = []

    def scrivi(r: str = "") -> None:
        print(r, flush=True)
        righe.append(r)
        file_report.write_text("\n".join(righe) + "\n", encoding="utf-8")

    def t() -> str:
        return f"[{time.monotonic() - inizio:5.0f} s]"

    def verifica(nome: str, ok: bool, dettaglio: str = "") -> None:
        esiti.append((nome, ok))
        scrivi(f"{t()} {'✓' if ok else '✗'} {nome}{': ' + dettaglio if dettaglio else ''}")

    def oltre() -> bool:
        if time.monotonic() - inizio > args.limite:
            scrivi(f"{t()} ⏱ superato il limite di {args.limite:.0f} s: mi fermo qui.")
            return True
        return False

    scrivi(f"# Prova rapida 2 del Company Brain ({datetime.now():%d/%m/%Y %H:%M})")
    scrivi(f"provider: {cfg.provider} · modello: {cfg.modello or '-'} · LLM_PARALLELO={os.environ['LLM_PARALLELO']} "
           f"· timeout {args.timeout:.0f} s · limite {args.limite:.0f} s")
    scrivi()
    if cfg.provider != "mock":
        try:
            h = {"Authorization": f"Bearer {cfg.api_key}"} if cfg.api_key else {}
            r = httpx.get(f"{cfg.base_url}/models", headers=h, timeout=5)
            scrivi(f"{t()} modello raggiungibile: HTTP {r.status_code}")
            if r.status_code != 200:
                return 2
        except Exception as e:  # noqa: BLE001
            scrivi(f"{t()} ✗ modello NON raggiungibile ({type(e).__name__}): controlla IP dell'Air in .env e LM Studio.")
            return 2

    db.ricrea()
    c = TestClient(modulo_app.app)

    def carica(doc_id: str) -> dict:
        t0 = time.monotonic()
        contenuto = (RADICE / "dati" / "prova_rapida_2" / f"{doc_id}.md").read_bytes()
        r = c.post("/riunioni", params={"progetto_id": PRJ}, headers=GIULIA, files={"file": (f"{doc_id}.md", contenuto)})
        e = r.json() if r.status_code == 200 else {"errore": f"HTTP {r.status_code}: {r.text[:200]}"}
        scrivi(f"{t()} caricata {doc_id} in {time.monotonic() - t0:.0f} s → proposte {e.get('proposte')}, "
               f"avvisi {e.get('avvisi')}, analisi non riuscite {e.get('analisi_non_riuscite')}")
        verifica(f"analisi di {doc_id} completa", "errore" not in e and not e.get("analisi_non_riuscite"),
                 e.get("errore", ""))
        return e

    def avvisi_di(doc_id: str) -> list[dict]:
        tutti = c.get("/avvisi", params={"progetto_id": PRJ, "flusso": "false"}, headers=GIULIA).json()
        mie = [a for a in tutti if a.get("documento_id") == doc_id]
        for a in mie:
            scrivi(f"        [{a['tipo']}] {a['testo'][:130]}")
        return mie

    def decidi(rifiuta_se: str | None = None) -> None:
        proposte = c.get("/proposte", params={"progetto_id": PRJ}, headers=GIULIA).json()
        rifiutate = []
        for p in proposte:
            testo = json.dumps(p["contenuto"], ensure_ascii=False).lower()
            azione = "rifiuta" if rifiuta_se and rifiuta_se in testo else "approva"
            c.post(f"/proposte/{p['id']}/{azione}", headers=GIULIA, json={})
            if azione == "rifiuta":
                rifiutate.append(p["id"])
        scrivi(f"{t()} il manager decide {len(proposte)} proposte: rifiutate {rifiutate or 'nessuna'}")

    def lista() -> list[dict]:
        return c.get(f"/progetti/{PRJ}/todo", headers=GIULIA).json()

    def task_con(parola: str) -> dict | None:
        return next((x for x in lista() if parola in x["titolo"].lower()), None)

    def chiedi(chi: dict, testo: str, esito: str, segmento: str | None = None) -> None:
        t0 = time.monotonic()
        r = c.post("/domande", headers=chi, json={"progetto_id": PRJ, "testo": testo}).json()
        cit = [x["segmento_id"] for x in r.get("citazioni", [])]
        ok = r.get("esito") == esito and (segmento is None or segmento in cit) and (esito == "risposta" or not cit)
        verifica(f"domanda di {chi['X-Persona']} «{testo}»", ok,
                 f"{r.get('esito')} (atteso {esito}) in {time.monotonic() - t0:.0f} s, citazioni {cit or '-'}: "
                 f"{str(r.get('testo'))[:90]}")

    # rap-101 ---------------------------------------------------------------------------------------
    e1 = carica("rap-101")
    verifica("6. propone soltanto", e1.get("proposte", 0) > 0 and lista() == [],
             f"{e1.get('proposte')} proposte in attesa, memoria vuota")
    a1 = avvisi_di("rap-101")
    verifica("1. parla per primo", len(a1) > 0, f"{len(a1)} avvisi senza che nessuno li chiedesse")
    verifica("«Marco» ambiguo", any(a["tipo"] == "punto_oscuro" and "Marco" in a["testo"] for a in a1))
    verifica("manuale senza responsabile", any(a["tipo"] == "punto_oscuro" and "manual" in a["testo"].lower() for a in a1))
    decidi()
    hmi = task_con("hmi")
    verifica("dipendenza HMI ← lista dei tag", bool(hmi and hmi.get("dipende_da")),
             f"HMI dipende da {hmi.get('dipende_da') if hmi else 'task HMI non trovato'}")
    if oltre():
        return 1

    # rap-102 ---------------------------------------------------------------------------------------
    carica("rap-102")
    a2 = avvisi_di("rap-102")
    incongr = [a for a in a2 if a["tipo"] == "incongruenza"]
    verifica("incongruenza: il quadro slitta al 18/12", any("18" in a["testo"] and "panel" in a["testo"].lower() for a in incongr))
    verifica("incongruenza: inverter 6.200 → 7.400", any(any(x in a["testo"] for x in ("7,400", "7.400", "7400")) for a in incongr))
    verifica("sconosciuto: ingegner Venturi", any(a["tipo"] == "sconosciuto" and "Venturi" in a["testo"] for a in a2))
    verifica("Paola Greco fuori dal progetto", any(a["tipo"] == "sconosciuto" and "Paola" in a["testo"] for a in a2))
    decidi(rifiuta_se="vacation")      # controllo 2: il manager rifiuta un elemento
    tag = task_con("tag")
    verifica("assegnatario dei tag chiarito: Marco Bianchi", bool(tag and tag.get("assegnatario_id") == "p-02"),
             f"assegnatario {tag.get('assegnatario_id') if tag else 'task non trovato'}")
    if oltre():
        return 1

    # rap-103 ---------------------------------------------------------------------------------------
    carica("rap-103")
    avvisi_di("rap-103")
    decidi()
    tag, hmi = task_con("tag"), task_con("hmi")
    verifica("«ho finito la lista dei tag» → fatto", bool(tag and tag.get("stato") == "fatto"),
             f"stato {tag.get('stato') if tag else '-'}")
    verifica("HMI in corso", bool(hmi and hmi.get("stato") == "in_corso"), f"stato {hmi.get('stato') if hmi else '-'}")
    if oltre():
        return 1

    # Domande ---------------------------------------------------------------------------------------
    scrivi()
    chiedi(MARCO_B, "How much budget is left for the project?", "risposta", "rap-101#s002")      # 3, 4
    chiedi(SARA, "How much budget is left for the project?", "non_lo_so")                        # 3
    chiedi(ELENA, "How much do the inverters cost now?", "risposta", "rap-102#s003")     # 3, 4, memoria aggiornata
    chiedi(SARA, "How much do the inverters cost now?", "non_lo_so")                     # 3
    chiedi(GIULIA, "Who is in charge of the operators' manual?", "risposta", "rap-101#s008")
    chiedi(GIULIA, "Is Davide on vacation next week?", "non_lo_so")              # 2: voce rifiutata
    chiedi(GIULIA, "Which PLC does the client use on line 2?", "non_lo_so")                 # 5

    passi = c.get("/registro", params={"progetto_id": PRJ}, headers=GIULIA).json()
    chiamate = [p for p in passi if p.get("provider") == cfg.provider and cfg.provider is not None]
    errori = [p for p in passi if p.get("esito") == "errore"]
    scrivi()
    scrivi(f"{t()} chiamate al modello: {len(chiamate)}, tempo nel modello "
           f"{sum(p.get('durata_ms') or 0 for p in chiamate) / 1000:.0f} s; passi in errore: {len(errori)}")
    for p in errori:
        scrivi(f"    - {p.get('documento_id')} · {p.get('step')}: {p.get('motivo')}")
    superati = sum(1 for _, ok in esiti if ok)
    scrivi(f"\n**{superati}/{len(esiti)} verifiche superate** in {time.monotonic() - inizio:.0f} s. "
           f"Report: `{file_report.relative_to(RADICE)}`")
    return 0 if superati == len(esiti) else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\nInterrotto: il report parziale è in prove/rapida2-<data-ora>.md")
        sys.exit(130)
