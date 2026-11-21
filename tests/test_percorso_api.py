"""Il percorso della demo passando dall'API, con il cervello vero di Franky e il provider mock.

Stessi documenti e stesse decisioni del simulatore di Franky (`backend/analisi/simulatore.py`):
la memoria che resta nel db deve essere identica alla sua. Poi i sette controlli del brief.
"""

import json

import pytest

from backend import db
from backend.analisi import simulatore
from backend.llm import Config
from backend.modelli import Proposta
from conftest import GIULIA, MARCO_B, PAOLA, SARA

ELENA = {"X-Persona": "p-06"}
NEUTRO = "I don't have any information you can see about this. You can ask Giulia Ferraris."


def carica_demo(client, doc_id: str):
    if doc_id.startswith("riu-"):
        contenuto = (db.RADICE / "dati" / "riunioni" / f"{doc_id}.md").read_bytes()
        return client.post("/riunioni", params={"progetto_id": "prj-01"}, headers=GIULIA,
                           files={"file": (f"{doc_id}.md", contenuto)})
    contenuto = (db.RADICE / "dati" / "documenti" / f"{doc_id}.pdf").read_bytes()
    return client.post("/documenti", headers=GIULIA, files={"file": (f"{doc_id}.pdf", contenuto)},
                       params={"progetto_id": "prj-01", "id": doc_id, "titolo": simulatore.TITOLO_PDF,
                               "data": simulatore.DATA_PDF})


def decidi_come_il_simulatore(client) -> list[str]:
    """Il manager decide le proposte in attesa in ordine, come `Simulatore.approva_tutto`."""
    esiti = []
    for p in client.get("/proposte?progetto_id=prj-01", headers=GIULIA).json():
        azione = "rifiuta" if simulatore._rifiutata(Proposta(**p)) else "approva"
        r = client.post(f"/proposte/{p['id']}/{azione}", headers=GIULIA, json={})
        assert r.status_code == 200, (p["id"], p["tipo"], r.text)
        esiti.append(r.json()["stato"])
    return esiti


def chiedi(client, chi, testo):
    return client.post("/domande", headers=chi, json={"progetto_id": "prj-01", "testo": testo}).json()


def avvisi(client, chi=GIULIA):
    return client.get("/avvisi?progetto_id=prj-01&flusso=false", headers=chi).json()


@pytest.fixture
def percorso(client_vero):
    """Tutto il percorso via API. -> (client, [(doc_id, esito del caricamento, decisioni)])."""
    passi = []
    for doc in simulatore.documenti_demo():
        r = carica_demo(client_vero, doc.id)
        assert r.status_code == 200, (doc.id, r.text)
        passi.append((doc.id, r.json(), decidi_come_il_simulatore(client_vero)))
    return client_vero, passi


def test_la_memoria_via_api_e_quella_del_simulatore(percorso):
    client, passi = percorso
    sim, uscita = simulatore.esegui_percorso(Config(provider="mock"))

    # per ogni documento: stesse proposte e stessi avvisi, nessuna scartata, nessuna analisi fallita
    for (doc_id, esito, decisioni), (doc, risultato, attese) in zip(passi, uscita, strict=True):
        assert doc_id == doc.id
        assert (esito["proposte"], esito["avvisi"], esito["scartate"], esito["analisi_non_riuscite"]) == \
               (len(risultato.proposte), len(risultato.avvisi), 0, []), doc_id
        assert decisioni.count("rifiutata") == len(attese["rifiutate"]), doc_id

    conn = db.connetti()
    task = {r["id"]: db.task(r) for r in conn.execute("SELECT * FROM task")}
    fatti = {f.id: f for f in db.fatti(conn, "prj-01")}
    conn.close()
    campi = lambda v, nomi: {n: getattr(v, n) for n in nomi}
    seg = lambda v: [c.segmento_id for c in v.citazioni]

    assert list(task) == list(sim.task) and list(fatti) == list(sim.fatti)
    for tid, atteso in sim.task.items():
        nomi = ("titolo", "assegnatario_id", "scadenza", "stato", "aree")
        assert campi(task[tid], nomi) == campi(atteso, nomi), tid
        assert seg(task[tid]) == list(dict.fromkeys(seg(atteso))), tid
    for fid, atteso in sim.fatti.items():
        nomi = ("soggetto", "attributo", "valore", "aree")
        assert campi(fatti[fid], nomi) == campi(atteso, nomi), fid
        assert seg(fatti[fid]) == seg(atteso), fid

    # le dipendenze: i rif delle proposte sono diventati id di task, come nel simulatore
    lista = {t["id"]: t for t in client.get("/progetti/prj-01/todo", headers=GIULIA).json()}
    for tid, atteso in sim.task.items():
        assert lista[tid]["dipende_da"] == atteso.dipende_da, tid
    assert any(t["dipende_da"] for t in lista.values())


def test_i_sette_controlli(client_vero):
    client = client_vero

    # 6. Propone soltanto: dopo il caricamento ci sono proposte in attesa e la memoria è vuota.
    assert carica_demo(client, "riu-001").status_code == 200
    in_attesa = client.get("/proposte?progetto_id=prj-01", headers=GIULIA).json()
    assert in_attesa and all(p["stato"] == "in_attesa" for p in in_attesa)
    assert client.get("/progetti/prj-01/todo", headers=GIULIA).json() == []
    assert chiedi(client, MARCO_B, "How much budget is left?")["esito"] == "non_lo_so"

    # 1. Parla per primo: gli avvisi sono nati dal caricamento, nessuno li ha chiesti; solo al manager.
    assert {a["tipo"] for a in avvisi(client)} == {"punto_oscuro"} and avvisi(client, SARA) == []
    assert any("Marco" in a["testo"] for a in avvisi(client))

    # 2. Memoria curata: si approva il budget e si rifiuta il costo degli inverter.
    per_attributo = {p["contenuto"].get("attributo"): p for p in in_attesa if p["tipo"] == "nuovo_fatto"}
    budget, inverter = per_attributo["budget"], next(
        p for p in in_attesa if p["tipo"] == "nuovo_fatto" and "inverter" in json.dumps(p["contenuto"]).lower())
    assert client.post(f"/proposte/{budget['id']}/approva", headers=GIULIA, json={}).json()["stato"] == "approvata"
    assert client.post(f"/proposte/{inverter['id']}/rifiuta", headers=GIULIA, json={}).json()["stato"] == "rifiutata"

    # 3. Sa chi chiede: stessa domanda, chi ha la competenza budget riceve la risposta, la sviluppatrice no.
    # 4. Cita: la risposta porta il segmento della riunione, con la frase vera.
    # (il mock della risposta cita fat-002: in questo test il budget è il primo fatto approvato, fat-001,
    #  quindi qui si controlla il filtro; la risposta con il testo sta nel test del percorso completo)
    assert chiedi(client, SARA, "How much budget is left?") == {"esito": "non_lo_so", "testo": NEUTRO, "citazioni": []}
    assert client.get("/persone/p-04/todo-oggi", headers=SARA).json()["task"] == []

    # 5. Ammette le lacune: stessa identica risposta per ciò che non c'è e per ciò che è stato rifiutato.
    assert chiedi(client, GIULIA, "Which PLC does the client use on line 2?") == {"esito": "non_lo_so", "testo": NEUTRO, "citazioni": []}
    assert chiedi(client, ELENA, "How much do the inverters cost?")["esito"] == "non_lo_so"   # rifiutato: non esiste


def test_domande_dopo_il_percorso_completo(percorso):
    client, _ = percorso

    # 3 e 4: budget al senior e agli acquisti con la citazione, non alla sviluppatrice
    marco = chiedi(client, MARCO_B, "How much budget is left?")
    assert marco["esito"] == "risposta" and "35,500" in marco["testo"]
    assert [c["segmento_id"] for c in marco["citazioni"]] == ["riu-001#s003"]
    assert "48,000 euro" in marco["citazioni"][0]["frase"] and marco["citazioni"][0]["titolo"] == "Line 3 revamping kick-off"
    sara = chiedi(client, SARA, "How much budget is left?")
    assert sara == {"esito": "non_lo_so", "testo": NEUTRO, "citazioni": []}
    assert chiedi(client, PAOLA, "How much budget is left?").get("detail")           # fuori dal progetto: 403

    # 5: fuori dai dati -> identica alla risposta per un dato riservato
    assert chiedi(client, GIULIA, "Which PLC does the client use on line 2?") == sara

    # 2: dopo riu-003 vale il preventivo nuovo; il secondo pannello HMI è stato rifiutato dal manager
    ultimo = chiedi(client, GIULIA, "What is the latest inverter quote?")
    assert ultimo["esito"] == "risposta" and "7,400" in ultimo["testo"]
    assert chiedi(client, GIULIA, "Does the client want a second HMI panel?")["esito"] == "non_lo_so"

    # il registro dice il motivo vero, la risposta no
    domande = [p for p in client.get("/registro?progetto_id=prj-01", headers=GIULIA).json() if p["tipo"] == "domanda"]
    assert any((p["motivo"] or "").startswith("non_autorizzato") and p["attore"] == "p-04" for p in domande)
    assert "budget" not in json.dumps([p["input"] for p in domande]).lower()    # mai il testo della domanda

    # 1: le incongruenze fra riunioni sono arrivate da sole al manager
    tipi = [a["tipo"] for a in avvisi(client)]
    assert "incongruenza" in tipi and "sconosciuto" in tipi
    # 7: la giornata di ognuno
    oggi = client.get("/persone/p-04/todo-oggi", headers=SARA).json()
    assert oggi["task"] and all(t["assegnatario_id"] == "p-04" for t in oggi["task"])
