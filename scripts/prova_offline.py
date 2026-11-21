"""Prove con il modello vero (F9), da lanciare da soli, senza Claude e senza internet.

Serve solo la rete locale verso LM Studio sull'Air (anche via hotspot): nessun'altra connessione.
Tutto finisce in `prove/<data-ora>/` (esclusa da git), da far analizzare dopo:
  report.md       riepilogo: raggiungibilità, errori, confronto con le attese, domande, 7 controlli
  risposte/       le risposte vere di Qwen, una per chiamata (stessi nomi dei mock: diventano mock)
  passi.json      la traccia completa del workflow (solo id e conteggi)
  risultati.json  proposte e avvisi prodotti con il modello vero
  demo_check.txt  uscita di `scripts/demo_check.py --modello-vero`

Uso (dalla root del repo, con .env che punta all'Air):
  .venv/bin/python scripts/prova_offline.py                # tutto: prova minima, percorso, domande, 7 controlli
  .venv/bin/python scripts/prova_offline.py --senza-check  # salta demo_check (circa metà delle chiamate)
  .venv/bin/python scripts/prova_offline.py --solo-check   # solo i 7 controlli
  .venv/bin/python scripts/prova_offline.py --mock         # prova a secco con i mock, nessuna rete

Di default una chiamata alla volta (`LLM_PARALLELO=1`) e timeout di 300 s per chiamata.
Il .env si legge senza stamparlo; nel report non finiscono né la chiave né l'indirizzo completo.
"""

import argparse
import json
import os
import subprocess
import sys
import threading
import time
from collections import Counter
from dataclasses import replace
from datetime import datetime
from pathlib import Path

RADICE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RADICE))


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
    ap.add_argument("--senza-check", action="store_true", help="non lancia demo_check")
    ap.add_argument("--solo-check", action="store_true", help="lancia solo demo_check")
    ap.add_argument("--timeout", type=float, default=300.0, help="secondi per chiamata (default 300)")
    args = ap.parse_args()

    leggi_env()
    os.environ.setdefault("LLM_PARALLELO", "1")
    os.environ["LLM_TIMEOUT"] = str(args.timeout)
    os.environ.pop("LLM_REGISTRA", None)        # i mock della demo non si toccano mai
    if args.mock:
        os.environ["LLM_PROVIDER"] = "mock"

    # import dopo l'ambiente: i moduli leggono le variabili alla chiamata, ma così è esplicito
    import httpx
    from pydantic import BaseModel

    from backend.analisi.simulatore import Simulatore, documenti_demo
    from backend.domande import rispondi_tracciato, voci_visibili
    from backend.llm import CARTELLA_MOCK, Config, chat

    uscita = RADICE / "prove" / datetime.now().strftime("%Y%m%d-%H%M%S")
    risposte = uscita / "risposte"
    risposte.mkdir(parents=True, exist_ok=True)
    report: list[str] = []

    def scrivi(riga: str = "") -> None:
        print(riga, flush=True)
        report.append(riga)

    def salva_report() -> None:
        (uscita / "report.md").write_text("\n".join(report) + "\n", encoding="utf-8")

    base = Config.da_ambiente()
    if args.mock:
        cfg = replace(base, provider="mock", cartella_mock=CARTELLA_MOCK, registra=False)
    else:
        cfg = replace(base, registra=True, cartella_mock=risposte, timeout_s=args.timeout)
    rif = Config(provider="mock", cartella_mock=CARTELLA_MOCK)   # le attese: i mock della demo

    scrivi(f"# Prova offline di Agentonic ({datetime.now():%d/%m/%Y %H:%M})")
    scrivi()
    scrivi(f"- provider: **{cfg.provider}**, modello: `{cfg.modello or '-'}`, "
           f"URL: {'impostato' if cfg.base_url else 'mancante'}, chiave: {'impostata' if cfg.api_key else 'assente'}")
    scrivi(f"- LLM_PARALLELO={os.environ['LLM_PARALLELO']}, timeout {args.timeout:.0f} s per chiamata")
    scrivi()
    salva_report()

    # 1. Raggiungibilità ---------------------------------------------------------------------------
    if cfg.provider != "mock":
        scrivi("## 1. Raggiungibilità del modello")
        try:
            h = {"Authorization": f"Bearer {cfg.api_key}"} if cfg.api_key else {}
            r = httpx.get(f"{cfg.base_url}/models", headers=h, timeout=10)
            modelli = [m.get("id") for m in r.json().get("data", [])] if r.status_code == 200 else []
            scrivi(f"- `GET /models`: HTTP {r.status_code}; modello configurato presente: "
                   f"{'sì' if cfg.modello in modelli else 'NO'} ({len(modelli)} modelli caricati)")
            if r.status_code != 200:
                raise RuntimeError(f"HTTP {r.status_code}")
            salva_report()
        except Exception as e:  # noqa: BLE001
            scrivi(f"- **NON raggiungibile** ({type(e).__name__}). Controlla hotspot, IP dell'Air in .env, "
                   "server di LM Studio acceso. Mi fermo qui.")
            salva_report()
            return 2
        scrivi()

    passi_tutti: list[dict] = []
    risultati: list[dict] = []

    if not args.solo_check:
        # 2. Prova minima --------------------------------------------------------------------------
        class Saluto(BaseModel):
            risposta: str
            lingua: str

        scrivi("## 2. Prova minima (JSON con schema)")
        try:
            r = chat([{"role": "system", "content": "Rispondi solo in JSON."},
                      {"role": "user", "content": "Saluta in una frase e indica la lingua usata."}],
                     Saluto, chiave="prova_llm", config=cfg)
            scrivi(f"- ok in {r.durata_ms} ms, tentativi {r.tentativi}: {r.dati}")
        except Exception as e:  # noqa: BLE001
            scrivi(f"- **errore**: {type(e).__name__}: {str(e)[:200]}")
        scrivi()

        # 3. Percorso della demo con il modello vero, confrontato con le attese (i mock) -------------
        scrivi("## 3. Percorso della demo (riu-001 … riu-005, poi il PDF doc-001)")
        scrivi()
        scrivi("| documento | durata | proposte (vero / atteso) | avvisi (vero / atteso) | passi in errore o scartati |")
        scrivi("|---|---|---|---|---|")
        vero, atteso = Simulatore(), Simulatore()
        trappole: dict[str, list[str]] = {}
        dettagli: list[str] = []
        for doc in documenti_demo():
            t0 = time.monotonic()
            rv = vero.analizza(doc, cfg)
            vero.approva_tutto(rv)
            durata = time.monotonic() - t0
            ra = atteso.analizza(doc, rif)
            atteso.approva_tutto(ra)

            def conta(xs):
                return ", ".join(f"{k} {v}" for k, v in sorted(Counter(x.tipo for x in xs).items())) or "-"

            problemi = [p for p in rv.passi if p.esito != "ok"]
            scrivi(f"| {doc.id} | {durata:.0f} s | {conta(rv.proposte)} / {conta(ra.proposte)} | "
                   f"{conta(rv.avvisi)} / {conta(ra.avvisi)} | {len(problemi)} |")
            for p in problemi:
                dettagli.append(f"- {doc.id} · {p.step}: **{p.esito}**, {p.motivo or ''} "
                                f"(tentativi {p.tentativi}, {p.durata_ms or 0} ms)")
            testi = " ".join(a.testo for a in rv.avvisi)
            trappole[doc.id] = [a.tipo for a in rv.avvisi]
            trappole[doc.id + "_testi"] = [testi]
            passi_tutti += [p.model_dump(mode="json") for p in rv.passi]
            risultati.append({"documento": doc.id,
                              "proposte": [p.model_dump(mode="json") for p in rv.proposte],
                              "avvisi": [a.model_dump(mode="json") for a in rv.avvisi]})
            (uscita / "passi.json").write_text(json.dumps(passi_tutti, ensure_ascii=False, indent=1), encoding="utf-8")
            (uscita / "risultati.json").write_text(json.dumps(risultati, ensure_ascii=False, indent=1), encoding="utf-8")
            salva_report()
        scrivi()
        if dettagli:
            scrivi("Passi non ok:")
            scrivi("\n".join(dettagli))
            scrivi()

        # Trappole della demo: le cose che la giuria deve vedere
        def c_e(doc_id: str, tipo: str, *parole: str) -> str:
            testi = trappole.get(doc_id + "_testi", [""])[0].lower()
            ok = tipo in trappole.get(doc_id, []) and all(w.lower() in testi for w in parole)
            return "✓" if ok else "✗"

        scrivi("Trappole della demo:")
        scrivi(f"- {c_e('riu-001', 'punto_oscuro', 'Marco')} riu-001: «Marco» ambiguo (punto oscuro)")
        scrivi(f"- {c_e('riu-002', 'incongruenza')} riu-002: incongruenza sulla scadenza del quadro")
        scrivi(f"- {c_e('riu-002', 'sconosciuto', 'Paola')} riu-002: Paola Greco riconosciuta fuori dal progetto")
        scrivi(f"- {c_e('riu-002', 'sconosciuto', 'Venturi')} riu-002: ing. Venturi sconosciuto")
        scrivi(f"- {c_e('riu-003', 'incongruenza', '7.400')} riu-003: costo inverter 6.200 → 7.400")
        scrivi(f"- {c_e('doc-001', 'incongruenza')} doc-001: collaudo 15/01 contro 20/01")
        scrivi()

        # Estrazioni a confronto con i mock (stessi nomi file)
        scrivi("Estrazioni (elementi vero / atteso, e segmenti citati in comune):")
        for f in sorted(risposte.glob("*_1di1.json")):
            atteso_f = CARTELLA_MOCK / f.name
            if not atteso_f.exists():
                continue
            try:
                v, a = json.loads(f.read_text()), json.loads(atteso_f.read_text())
            except ValueError:
                scrivi(f"- {f.stem}: risposta non JSON")
                continue
            for campo in v:
                lv, la = v.get(campo) or [], a.get(campo) or []
                sv = {s for x in lv for s in x.get("segmenti", [])}
                sa = {s for x in la for s in x.get("segmenti", [])}
                comuni = f"{len(sv & sa)}/{len(sa)}" if sa else "-"
                scrivi(f"- {f.stem} · {campo}: {len(lv)} / {len(la)}, segmenti in comune {comuni}")
        scrivi()

        # 4. Domande (sulla memoria finale del percorso) --------------------------------------------
        scrivi("## 4. Domande dei controlli (sulla memoria alla fine del percorso)")
        scrivi()
        controlli = json.loads((RADICE / "dati" / "attese" / "controlli.json").read_text())
        domande = []
        for c in controlli["controlli"]:
            for p in c["passi"]:
                if p.get("azione") == "domanda" and (p["persona"], p["testo"]) not in [(d["persona"], d["testo"]) for d in domande]:
                    domande.append(p)
        persone = {p.id: p for p in vero.membri}
        manager = persone[vero.progetto.manager_id].nome
        scrivi("| persona | domanda | esito (atteso) | durata | citazioni | testo |")
        scrivi("|---|---|---|---|---|---|")
        for d in domande:
            chi = persone[d["persona"]]
            voci = voci_visibili(chi, vero.progetto, list(vero.task.values()), list(vero.fatti.values()), persone)
            risp, passo = rispondi_tracciato(d["testo"], chi, voci, manager, cfg)
            passi_tutti.append(passo.model_dump(mode="json"))
            scrivi(f"| {chi.nome} | {d['testo']} | {risp.esito} ({d.get('esito_atteso', '?')}) | "
                   f"{(passo.durata_ms or 0) / 1000:.0f} s | {', '.join(x.segmento_id for x in risp.citazioni) or '-'} | "
                   f"{risp.testo[:120].replace('|', '/')} |")
            salva_report()
        (uscita / "passi.json").write_text(json.dumps(passi_tutti, ensure_ascii=False, indent=1), encoding="utf-8")
        scrivi()
        scrivi("Nota: le domande qui si fanno tutte sulla memoria finale; i controlli veri (sotto) le fanno "
               "nel momento giusto del percorso.")
        scrivi()

    # 5. I sette controlli passando dall'API --------------------------------------------------------
    if not args.senza_check:
        scrivi("## 5. I sette controlli (`demo_check.py`)")
        comando = [sys.executable, str(RADICE / "scripts" / "demo_check.py")]
        if cfg.provider != "mock":
            comando.append("--modello-vero")
        scrivi("(l'uscita compare qui sotto mentre gira; con il modello vero ci vogliono diversi minuti)")
        salva_report()
        t0 = time.monotonic()
        righe: list[str] = []
        env = {**os.environ, "PYTHONUNBUFFERED": "1"}
        with open(uscita / "demo_check.txt", "w", encoding="utf-8") as log:
            p = subprocess.Popen(comando, cwd=RADICE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                 text=True, env=env, bufsize=1)

            def battito() -> None:   # demo_check stampa solo alla fine: segnale di vita ogni 30 s
                while p.poll() is None:
                    time.sleep(30)
                    if p.poll() is None:
                        print(f"    … demo_check ancora in corso ({time.monotonic() - t0:.0f} s)", flush=True)

            threading.Thread(target=battito, daemon=True).start()
            for riga in p.stdout:                       # a schermo e su file, riga per riga
                print("    " + riga, end="", flush=True)
                log.write(riga)
                log.flush()
                if riga.strip():
                    righe.append(riga.rstrip())
            p.wait()
        scrivi(f"- uscita {p.returncode} in {time.monotonic() - t0:.0f} s")
        scrivi("```")
        scrivi("\n".join(righe[-10:]))
        scrivi("```")
        scrivi()

    totale = sum(x.get("durata_ms") or 0 for x in passi_tutti if x.get("provider") not in (None, "mock"))
    chiamate = sum(1 for x in passi_tutti if x.get("provider") not in (None, "mock"))
    if chiamate:
        scrivi(f"Chiamate al modello (percorso + domande): {chiamate}, tempo totale {totale / 1000:.0f} s, "
               f"media {totale / chiamate / 1000:.1f} s")
    scrivi(f"\nFile salvati in `{uscita.relative_to(RADICE)}/`.")
    salva_report()
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\nInterrotto: quello che è già stato fatto è in prove/<data-ora>/ (report.md parziale).")
        sys.exit(130)
