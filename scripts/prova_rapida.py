"""Prova end-to-end RAPIDA con il modello locale: circa 10 chiamate, 1-2 minuti.

Passa dall'API vera (db temporaneo, non tocca `brain.db`), con due minute brevissime in
`dati/prova_rapida/` e tre domande. Stampa ogni passo appena finisce e si ferma da sola se supera
il limite di tempo. Copre i controlli 1, 3, 4, 5, 6 e le incongruenze; i 7 controlli completi
restano in `scripts/demo_check.py` (più lungo).

Uso (dalla root, con .env che punta all'Air):
  .venv/bin/python scripts/prova_rapida.py            # modello di .env
  .venv/bin/python scripts/prova_rapida.py --mock     # prova a secco, nessuna rete
Opzioni: --timeout 90 (secondi per chiamata), --limite 240 (secondi in tutto).
Report in `prove/rapida-<data-ora>.md` (escluso da git), scritto passo per passo.
"""

import argparse
import os
import sys
import tempfile
import time
from datetime import datetime
from pathlib import Path

RADICE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RADICE))
PRJ = "prj-01"
GIULIA, MARCO_B, SARA = ({"X-Persona": p} for p in ("p-01", "p-02", "p-04"))


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
    ap.add_argument("--limite", type=float, default=240.0, help="secondi in tutto, poi si ferma")
    args = ap.parse_args()

    leggi_env()
    if args.mock:
        os.environ["LLM_PROVIDER"] = "mock"
    os.environ.pop("LLM_REGISTRA", None)                 # i mock non si toccano
    os.environ.setdefault("LLM_PARALLELO", "1")
    os.environ["LLM_TIMEOUT"] = str(args.timeout)
    os.environ["BRAIN_DB"] = str(Path(tempfile.mkdtemp(prefix="prova_rapida_")) / "prova.db")

    import httpx
    from fastapi.testclient import TestClient

    from backend import app as modulo_app
    from backend import db
    from backend.llm import Config

    cfg = Config.da_ambiente()
    (RADICE / "prove").mkdir(exist_ok=True)
    file_report = RADICE / "prove" / f"rapida-{datetime.now():%Y%m%d-%H%M%S}.md"
    righe: list[str] = []
    inizio = time.monotonic()
    esiti: list[tuple[str, bool, str]] = []

    def scrivi(r: str = "") -> None:
        print(r, flush=True)
        righe.append(r)
        file_report.write_text("\n".join(righe) + "\n", encoding="utf-8")

    def tempo() -> str:
        return f"[{time.monotonic() - inizio:5.0f} s]"

    def verifica(nome: str, ok: bool, dettaglio: str) -> None:
        esiti.append((nome, ok, dettaglio))
        scrivi(f"{tempo()} {'✓' if ok else '✗'} {nome}: {dettaglio}")

    def oltre_limite() -> bool:
        if time.monotonic() - inizio > args.limite:
            scrivi(f"{tempo()} ⏱ superato il limite di {args.limite:.0f} s: mi fermo qui.")
            return True
        return False

    scrivi(f"# Prova rapida del Company Brain ({datetime.now():%d/%m/%Y %H:%M})")
    scrivi(f"provider: {cfg.provider} · modello: {cfg.modello or '-'} · LLM_PARALLELO={os.environ['LLM_PARALLELO']} "
           f"· timeout {args.timeout:.0f} s per chiamata · limite {args.limite:.0f} s")
    scrivi()

    if cfg.provider != "mock":
        try:
            h = {"Authorization": f"Bearer {cfg.api_key}"} if cfg.api_key else {}
            r = httpx.get(f"{cfg.base_url}/models", headers=h, timeout=5)
            presente = cfg.modello in [m.get("id") for m in r.json().get("data", [])] if r.status_code == 200 else False
            scrivi(f"{tempo()} modello raggiungibile: HTTP {r.status_code}, «{cfg.modello}» caricato: {'sì' if presente else 'NO'}")
            if r.status_code != 200:
                return 2
        except Exception as e:  # noqa: BLE001
            scrivi(f"{tempo()} ✗ modello NON raggiungibile ({type(e).__name__}): controlla IP dell'Air in .env, "
                   "hotspot e server di LM Studio.")
            return 2

    db.ricrea()
    c = TestClient(modulo_app.app)

    def carica(doc_id: str) -> dict:
        t0 = time.monotonic()
        contenuto = (RADICE / "dati" / "prova_rapida" / f"{doc_id}.md").read_bytes()
        r = c.post("/riunioni", params={"progetto_id": PRJ}, headers=GIULIA, files={"file": (f"{doc_id}.md", contenuto)})
        esito = r.json() if r.status_code == 200 else {"errore": f"HTTP {r.status_code}: {r.text[:200]}"}
        scrivi(f"{tempo()} caricata {doc_id} in {time.monotonic() - t0:.0f} s → {esito}")
        return esito

    def avvisi() -> list[dict]:
        return c.get("/avvisi", params={"progetto_id": PRJ, "flusso": "false"}, headers=GIULIA).json()

    def approva_tutto() -> int:
        proposte = c.get("/proposte", params={"progetto_id": PRJ}, headers=GIULIA).json()
        for p in proposte:
            c.post(f"/proposte/{p['id']}/approva", headers=GIULIA, json={})
        return len(proposte)

    def chiedi(chi: dict, testo: str) -> dict:
        t0 = time.monotonic()
        r = c.post("/domande", headers=chi, json={"progetto_id": PRJ, "testo": testo}).json()
        scrivi(f"{tempo()} domanda di {chi['X-Persona']} «{testo}» in {time.monotonic() - t0:.0f} s → "
               f"{r.get('esito')}: {str(r.get('testo'))[:100]}")
        return r

    # 1. Prima minuta -------------------------------------------------------------------------------
    e1 = carica("rap-001")
    ok_caricata = "errore" not in e1 and not e1.get("analisi_non_riuscite")
    verifica("analisi di rap-001 completa", ok_caricata, f"analisi non riuscite: {e1.get('analisi_non_riuscite', '?')}")
    lista = c.get(f"/progetti/{PRJ}/todo", headers=GIULIA).json()
    verifica("6. propone soltanto", e1.get("proposte", 0) > 0 and lista == [],
             f"{e1.get('proposte', 0)} proposte in attesa, memoria vuota prima dell'approvazione: {lista == []}")
    a1 = avvisi()
    verifica("1. parla per primo", len(a1) > 0, f"{len(a1)} avvisi nati dal caricamento: "
             + "; ".join(f"[{a['tipo']}] {a['testo'][:70]}" for a in a1[:3]))
    verifica("«Marco» ambiguo", any("Marco" in a["testo"] and a["tipo"] == "punto_oscuro" for a in a1),
             "punto oscuro sul nome ambiguo")
    scrivi(f"{tempo()} il manager approva {approva_tutto()} proposte")
    if oltre_limite():
        return 1

    # 2. Seconda minuta: la scadenza del quadro cambia --------------------------------------------
    e2 = carica("rap-002")
    verifica("analisi di rap-002 completa", "errore" not in e2 and not e2.get("analisi_non_riuscite"),
             f"analisi non riuscite: {e2.get('analisi_non_riuscite', '?')}")
    a2 = [a for a in avvisi() if a.get("documento_id") == "rap-002"]
    verifica("incongruenza sulla scadenza", any(a["tipo"] == "incongruenza" for a in a2),
             "; ".join(f"[{a['tipo']}] {a['testo'][:90]}" for a in a2) or "nessun avviso")
    verifica("persona mai vista (Venturi)", any(a["tipo"] == "sconosciuto" and "Venturi" in a["testo"] for a in a2),
             "avviso «sconosciuto»")
    if oltre_limite():
        return 1

    # 3. Domande ----------------------------------------------------------------------------------
    r_marco = chiedi(MARCO_B, "How much budget do we have left?")
    cit = [x["segmento_id"] for x in r_marco.get("citazioni", [])]
    verifica("3. sa chi chiede (Marco Bianchi, budget)", r_marco.get("esito") == "risposta", f"esito {r_marco.get('esito')}")
    verifica("4. cita", "rap-001#s001" in cit, f"citazioni: {cit or 'nessuna'}")
    r_sara = chiedi(SARA, "How much budget do we have left?")
    verifica("3. sa chi chiede (Sara, solo sviluppo)", r_sara.get("esito") == "non_lo_so" and not r_sara.get("citazioni"),
             f"esito {r_sara.get('esito')}")
    r_plc = chiedi(GIULIA, "Which PLC does the client use on line 2?")
    verifica("5. ammette le lacune", r_plc.get("esito") == "non_lo_so", f"esito {r_plc.get('esito')}")

    # 4. Registro: tempi e errori del modello ------------------------------------------------------
    passi = c.get("/registro", params={"progetto_id": PRJ}, headers=GIULIA).json()
    modello = [p for p in passi if p.get("provider") not in (None, "mock")] if cfg.provider != "mock" else \
              [p for p in passi if p.get("provider") == "mock"]
    non_ok = [p for p in passi if p.get("esito") != "ok"]
    durata = sum(p.get("durata_ms") or 0 for p in modello) / 1000
    scrivi()
    scrivi(f"{tempo()} chiamate al modello: {len(modello)}, tempo nel modello {durata:.0f} s; passi non ok: {len(non_ok)}")
    for p in non_ok:
        scrivi(f"    - {p.get('documento_id')} · {p.get('step')}: {p.get('esito')} · {p.get('motivo')}")
    superati = sum(1 for _, ok, _ in esiti if ok)
    scrivi(f"\n**{superati}/{len(esiti)} verifiche superate** in {time.monotonic() - inizio:.0f} s. "
           f"Report: `{file_report.relative_to(RADICE)}`")
    return 0 if superati == len(esiti) else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\nInterrotto: il report parziale è in prove/rapida-<data-ora>.md")
        sys.exit(130)
