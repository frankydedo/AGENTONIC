"""Le modifiche al contratto concordate il 21/11 (Franky): id dal backend, rif/dipende_da,
sconosciuti, proposte in attesa, inoltro degli avvisi."""

import json
from pathlib import Path

from fastapi.testclient import TestClient

from backend.app import app
from backend.modelli import (
    Avviso, ContestoProgetto, Persona, Progetto, Proposta, Sconosciuto, TaskEstratto, puo_vedere_avviso,
)

DATI = json.loads((Path(__file__).parent.parent / "dati" / "azienda.json").read_text())
PERSONE = {p["id"]: Persona(**p) for p in DATI["persone"]}
PRJ = Progetto(**DATI["progetti"][0])
client = TestClient(app)


def avviso(**campi) -> Avviso:
    return Avviso(progetto_id="prj-01", tipo="incongruenza", testo="La scadenza del quadro cambia.", **campi)


def test_workflow_crea_proposte_e_avvisi_senza_id():
    p = Proposta(progetto_id="prj-01", tipo="nuovo_fatto", contenuto={}, aree_proposte=["budget"])
    assert p.id is None and p.creata_il is None
    assert avviso().id is None


def test_dipende_da_con_rif_temporanei():
    t = TaskEstratto(rif="t2", titolo="Schermate HMI", aree=["sviluppo"], segmenti=["riu-001#s011"],
                     sicurezza="alta", dipende_da=["t1", "task-004"])
    assert t.dipende_da == ["t1", "task-004"]


def test_contesto_con_azienda_e_proposte_in_attesa():
    fuori = [p for pid, p in PERSONE.items() if pid not in PRJ.membri]
    ctx = ContestoProgetto(progetto=PRJ, persone=[PERSONE[m] for m in PRJ.membri], persone_azienda=fuori)
    assert [p.id for p in ctx.persone_azienda] == ["p-08"] and ctx.proposte_in_attesa == []
    s = Sconosciuto(nome="Paola", descrizione="citata per le ferie", segmenti=["riu-002#s004"], persona_id="p-08")
    assert s.persona_id == "p-08"


def test_avviso_solo_manager_finche_non_inoltrato():
    a = avviso(aree=["sviluppo"])
    assert puo_vedere_avviso(PERSONE["p-01"], PRJ, a)          # manager
    assert not puo_vedere_avviso(PERSONE["p-04"], PRJ, a)      # Sara, non ancora inoltrato


def test_avviso_inoltrato_per_nome_o_per_area():
    per_nome = avviso(solo_manager=False, inoltrato_a=["p-05"], aree=["budget"])
    assert puo_vedere_avviso(PERSONE["p-05"], PRJ, per_nome)       # Luca, per nome
    assert not puo_vedere_avviso(PERSONE["p-04"], PRJ, per_nome)   # Sara: né nome né budget
    per_area = avviso(solo_manager=False, aree=["sviluppo"])
    assert puo_vedere_avviso(PERSONE["p-04"], PRJ, per_area)
    assert not puo_vedere_avviso(PERSONE["p-08"], PRJ, per_area)   # fuori dal progetto


def test_inoltra_solo_manager_e_solo_membri():
    url = "/avvisi/avv-001/inoltra"
    assert client.post(url, json={"persona_ids": ["p-03"]}, headers={"X-Persona": "p-04"}).status_code == 403
    assert client.post(url, json={"persona_ids": ["p-08"]}, headers={"X-Persona": "p-01"}).status_code == 422
    r = client.post(url, json={"persona_ids": ["p-02", "p-03"]}, headers={"X-Persona": "p-01"})
    assert r.status_code == 200
    assert r.json()["solo_manager"] is False and r.json()["inoltrato_a"] == ["p-02", "p-03"]
