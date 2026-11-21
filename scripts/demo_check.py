"""I sette controlli del brief, eseguiti passando dall'API del backend (P9).

Uso:
    .venv/bin/python scripts/demo_check.py                  # provider mock: risposte registrate, nessuna rete
    .venv/bin/python scripts/demo_check.py --modello-vero   # il modello di .env (Qwen su LM Studio)

Avvia l'app in-process su un db temporaneo (non tocca `brain.db`), carica i documenti della demo
nell'ordine di `dati/attese/README.md` (riu-001 ... riu-005, poi il PDF doc-001), fa decidere il manager
come nel percorso della demo e verifica ogni controllo. Esce con 0 solo se i controlli sono 7 su 7.

Con il mock si verificano anche i testi delle risposte; con il modello vero solo ciò che il codice
garantisce (esiti, permessi, citazioni), perché le parole del modello possono cambiare.
"""

import argparse
import json
import os
import sys
import tempfile
from pathlib import Path

RADICE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RADICE))

GIULIA, MARCO_B, SARA, ELENA = ({"X-Persona": p} for p in ("p-01", "p-02", "p-04", "p-06"))
PRJ = "prj-01"


def prepara_ambiente(modello_vero: bool) -> None:
    if modello_vero:
        env = RADICE / ".env"   # come scripts/demo_brain.py: si legge senza stamparlo
        if env.exists():
            for riga in env.read_text().splitlines():
                riga = riga.split("#", 1)[0].strip()
                if "=" in riga:
                    chiave, valore = riga.split("=", 1)
                    os.environ.setdefault(chiave.strip(), valore.strip())
    else:
        os.environ["LLM_PROVIDER"] = "mock"
    os.environ.pop("LLM_REGISTRA", None)   # un controllo non deve mai riscrivere i mock
    os.environ["BRAIN_DB"] = str(Path(tempfile.mkdtemp(prefix="demo_check_")) / "demo_check.db")


class Demo:
    """Il percorso della demo, un passo alla volta, sempre attraverso l'API."""

    def __init__(self, client, simulatore):
        self.c, self.sim = client, simulatore

    def carica(self, doc_id: str) -> dict:
        if doc_id.startswith("riu-"):
            contenuto = (RADICE / "dati" / "riunioni" / f"{doc_id}.md").read_bytes()
            r = self.c.post("/riunioni", params={"progetto_id": PRJ}, headers=GIULIA,
                            files={"file": (f"{doc_id}.md", contenuto)})
        else:
            contenuto = (RADICE / "dati" / "documenti" / f"{doc_id}.pdf").read_bytes()
            r = self.c.post("/documenti", headers=GIULIA, files={"file": (f"{doc_id}.pdf", contenuto)},
                            params={"progetto_id": PRJ, "id": doc_id, "titolo": self.sim.TITOLO_PDF,
                                    "data": self.sim.DATA_PDF})
        assert r.status_code == 200, f"caricamento di {doc_id}: {r.status_code} {r.text}"
        return r.json()

    def in_attesa(self) -> list[dict]:
        return self.c.get("/proposte", params={"progetto_id": PRJ}, headers=GIULIA).json()

    def decidi(self, proposta: dict, azione: str) -> dict:
        r = self.c.post(f"/proposte/{proposta['id']}/{azione}", headers=GIULIA, json={})
        assert r.status_code == 200, f"{azione} {proposta['id']}: {r.status_code} {r.text}"
        return r.json()

    def decidi_tutto(self) -> dict[str, int]:
        """Il manager decide in ordine come nel percorso della demo (rifiuta il secondo pannello HMI)."""
        from backend.modelli import Proposta
        conta = {"approva": 0, "rifiuta": 0}
        for p in self.in_attesa():
            azione = "rifiuta" if self.sim._rifiutata(Proposta(**p)) else "approva"
            self.decidi(p, azione)
            conta[azione] += 1
        return conta

    def avvisi(self, chi=GIULIA) -> list[dict]:
        return self.c.get("/avvisi", params={"progetto_id": PRJ, "flusso": "false"}, headers=chi).json()

    def lista(self, chi=GIULIA) -> list[dict]:
        return self.c.get(f"/progetti/{PRJ}/todo", headers=chi).json()

    def oggi(self, persona_id: str, chi: dict) -> dict:
        return self.c.get(f"/persone/{persona_id}/todo-oggi", headers=chi).json()

    def chiedi(self, chi: dict, testo: str) -> dict:
        r = self.c.post("/domande", headers=chi, json={"progetto_id": PRJ, "testo": testo})
        assert r.status_code == 200, f"domanda «{testo}»: {r.status_code} {r.text}"
        return r.json()

    def registro(self) -> list[dict]:
        return self.c.get("/registro", params={"progetto_id": PRJ}, headers=GIULIA).json()


def esegui(demo: Demo, mock: bool) -> list[tuple[int, str, bool, str]]:
    esiti: dict[int, tuple[str, bool, str]] = {}

    def controllo(numero: int, titolo: str, verifica) -> None:
        try:
            esiti[numero] = (titolo, True, verifica())
        except AssertionError as errore:
            esiti[numero] = (titolo, False, str(errore) or "condizione non verificata")
        except Exception as errore:  # noqa: BLE001 - un errore inatteso è un controllo fallito, non un crash
            esiti[numero] = (titolo, False, f"{type(errore).__name__}: {errore}")

    # ------------------------------------------------------------------ riu-001: il kick-off
    stato = {}

    def propone_soltanto() -> str:
        esito = demo.carica("riu-001")
        proposte = demo.in_attesa()
        assert proposte and all(p["stato"] == "in_attesa" for p in proposte), "non ci sono proposte in attesa"
        assert demo.lista() == [], "la lista del progetto non è vuota prima dell'approvazione"
        assert demo.oggi("p-04", SARA)["task"] == [], "Sara ha già dei task prima dell'approvazione"
        assert demo.chiedi(ELENA, "Quanto budget resta?")["esito"] == "non_lo_so", \
            "una proposta non approvata ha già risposto a una domanda"
        stato["avvisi_1"] = demo.avvisi()
        stato["avvisi_1_sara"] = demo.avvisi(SARA)
        decise = demo.decidi_tutto()
        assert demo.lista() and demo.oggi("p-04", SARA)["task"], "dopo l'approvazione i task non compaiono"
        return (f"{esito['proposte']} proposte in attesa dopo riu-001, memoria vuota e to-do di Sara vuota; "
                f"dopo {decise['approva']} approvazioni del manager i task compaiono")

    controllo(6, "Propone soltanto", propone_soltanto)

    # ------------------------------------------------------------------ riu-002 e riu-003
    def parla_per_primo() -> str:
        primi = stato.get("avvisi_1") or []
        assert primi, "nessun avviso dopo riu-001"
        assert stato.get("avvisi_1_sara") == [], "un avviso non inoltrato è arrivato a chi non è il manager"
        demo.carica("riu-002")
        tipi = [a["tipo"] for a in demo.avvisi()]
        assert "incongruenza" in tipi, "nessuna incongruenza dopo riu-002"
        incongruenza = next(a for a in demo.avvisi() if a["tipo"] == "incongruenza")
        assert incongruenza["citazioni"], "l'incongruenza non cita le riunioni"
        demo.decidi_tutto()
        return (f"{len(primi)} avvisi dopo riu-001 e {len(tipi) - len(primi)} dopo riu-002, nati dal caricamento "
                f"senza che nessuno li chiedesse (es. «{incongruenza['testo'][:90]}»); solo al manager")

    controllo(1, "Parla per primo", parla_per_primo)

    def memoria_curata() -> str:
        from backend.modelli import Proposta
        demo.carica("riu-003")
        proposte = demo.in_attesa()
        rifiutata = next((p for p in proposte if demo.sim._rifiutata(Proposta(**p))), None)
        approvata = next((p for p in proposte if p["tipo"] == "nuovo_fatto" and p is not rifiutata
                          and "inverter" in json.dumps(p["contenuto"], ensure_ascii=False).lower()), None)
        assert rifiutata and approvata, "non trovo le due proposte da decidere (preventivo inverter, secondo pannello)"
        demo.decidi_tutto()
        stati = {p["id"]: p["stato"] for p in demo.c.get(
            "/proposte", params={"progetto_id": PRJ, "stato": "tutte"}, headers=GIULIA).json()}
        assert stati[approvata["id"]] == "approvata" and stati[rifiutata["id"]] == "rifiutata"
        si = demo.chiedi(GIULIA, "Qual è l'ultimo preventivo degli inverter?")
        no = demo.chiedi(GIULIA, "Il cliente vuole un secondo pannello HMI?")
        assert si["esito"] == "risposta" and any(c["documento_id"] == "riu-003" for c in si["citazioni"]), \
            "la voce approvata non risponde con la sua citazione"
        assert not mock or "7.400" in si["testo"], "la risposta non riporta il preventivo approvato"
        assert no["esito"] == "non_lo_so" and no["citazioni"] == [], "la voce rifiutata ha risposto"
        return (f"approvato il fatto «{approvata['contenuto']['valore'][:60]}», rifiutato il secondo pannello HMI; "
                "alla prima domanda risponde la voce approvata, alla seconda «non lo so»")

    controllo(2, "Le persone curano la memoria", memoria_curata)

    # ------------------------------------------------------------------ il resto del percorso
    for doc_id in ("riu-004", "riu-005", "doc-001"):
        try:
            demo.carica(doc_id)
            demo.decidi_tutto()
        except AssertionError as errore:
            stato["errore_percorso"] = str(errore)

    def sa_chi_chiede() -> str:
        assert "errore_percorso" not in stato, stato.get("errore_percorso")
        domanda = "Quanto budget resta?"
        elena, marco, sara = (demo.chiedi(chi, domanda) for chi in (ELENA, MARCO_B, SARA))
        assert elena["esito"] == "risposta" and marco["esito"] == "risposta", "chi ha la competenza budget non riceve risposta"
        assert not mock or "35.500" in elena["testo"]
        assert sara["esito"] == "non_lo_so" and sara["citazioni"] == [], "la sviluppatrice ha ricevuto il budget"
        assert "budget" not in sara["testo"].lower() and "48" not in sara["testo"], "la risposta neutra rivela il dato"
        motivi = [p["motivo"] or "" for p in demo.registro() if p["tipo"] == "domanda" and p["attore"] == "p-04"]
        assert any(m.startswith("non_autorizzato") for m in motivi), "il registro non dice il motivo vero"
        stato["neutra"], stato["risposta"] = sara, elena
        return (f"«{domanda}»: Elena Russo (acquisti, competenza budget) e Marco Bianchi ricevono la risposta, "
                "Sara Colombo (sviluppo) no; il motivo vero è solo nel registro del manager")

    controllo(3, "Sa chi chiede", sa_chi_chiede)

    def cita() -> str:
        risposta = stato.get("risposta")
        assert risposta and risposta["citazioni"], "la risposta non ha citazioni"
        for citazione in risposta["citazioni"]:
            vera = demo.c.get("/segmenti/" + citazione["segmento_id"].replace("#", "%23"), headers=GIULIA)
            assert vera.status_code == 200, f"il segmento citato {citazione['segmento_id']} non esiste"
            assert vera.json()["frase"] == citazione["frase"], "la frase citata non è quella del documento"
        prima = risposta["citazioni"][0]
        assert not mock or "48.000" in prima["frase"]
        riservato = demo.c.get("/segmenti/" + prima["segmento_id"].replace("#", "%23"), headers=SARA)
        assert riservato.status_code == 404, "chi non può vedere la voce apre comunque il segmento citato"
        con_pagina = [c for t in demo.lista() + demo.c.get(f"/documenti/doc-001", headers=GIULIA).json()["segmenti"]
                      for c in (t.get("citazioni") or [t]) if c.get("pagina")]
        assert con_pagina, "il PDF non porta il numero di pagina"
        return (f"la risposta cita {prima['segmento_id']} ({prima['titolo']}, {prima['speaker']}: "
                f"«{prima['frase'][:70]}…»); la frase è quella del documento, costruita dal codice")

    controllo(4, "Cita", cita)

    def ammette_le_lacune() -> str:
        domanda = "Che PLC usa il cliente nella linea 2?"
        risposta = demo.chiedi(GIULIA, domanda)
        assert risposta["esito"] == "non_lo_so" and risposta["citazioni"] == [], "ha risposto a una domanda fuori dai dati"
        assert stato.get("neutra") and risposta["testo"] == stato["neutra"]["testo"], \
            "dato mancante e dato riservato non hanno la stessa risposta"
        return f"«{domanda}» → «{risposta['testo']}» (identica alla risposta per un dato riservato)"

    controllo(5, "Ammette le lacune", ammette_le_lacune)

    def nella_giornata() -> str:
        oggi = demo.oggi("p-04", SARA)
        assert oggi["task"] and all(t["assegnatario_id"] == "p-04" for t in oggi["task"]), "Sara non ha la sua to-do"
        assert not oggi["accettata"]
        accettata = demo.c.post("/todo-oggi/accetta", headers=SARA, json={"task_ids": [t["id"] for t in oggi["task"]]}).json()
        assert accettata["accettata"] and len(accettata["task"]) == len(oggi["task"]), "la to-do non risulta accettata"
        assert demo.oggi("p-04", GIULIA)["task"], "il manager non vede la to-do del suo team"
        assert demo.c.get("/persone/p-04/todo-oggi", headers=MARCO_B).status_code == 403, "un collega legge la to-do di Sara"
        con_dipendenze = [t for t in demo.lista() if t["dipende_da"]]
        assert con_dipendenze, "nessuna dipendenza fra task di persone diverse"
        return (f"to-do del giorno di Sara: {len(oggi['task'])} task, accettata da lei; "
                f"{len(con_dipendenze)} task dipendono da quelli di un collega; il manager vede il quadro del team")

    controllo(7, "Si inserisce nella giornata", nella_giornata)
    return [(n, *esiti[n]) for n in sorted(esiti)]


def main() -> int:
    parser = argparse.ArgumentParser(description="I sette controlli del brief, via API.")
    parser.add_argument("--modello-vero", action="store_true", help="usa il modello di .env invece del mock")
    args = parser.parse_args()
    prepara_ambiente(args.modello_vero)

    from fastapi.testclient import TestClient

    from backend import app as modulo_app
    from backend import db
    from backend.analisi import simulatore
    from backend.llm import Config

    db.ricrea()
    provider = Config.da_ambiente().provider
    esiti = esegui(Demo(TestClient(modulo_app.app), simulatore), mock=provider == "mock")

    print(f"\nCompany Brain · i sette controlli del brief (provider del modello: {provider})\n")
    for numero, titolo, ok, dettaglio in esiti:
        print(f" {numero}. {titolo:<30} {'✓' if ok else '✗'}  {dettaglio}")
    superati = sum(1 for _, _, ok, _ in esiti if ok)
    print(f"\n{superati}/7 controlli superati\n")
    return 0 if superati == 7 else 1


if __name__ == "__main__":
    sys.exit(main())
