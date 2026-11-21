import json
from pathlib import Path

from backend.modelli import Persona, Progetto, puo_vedere

DATI = json.loads((Path(__file__).parent.parent / "dati" / "azienda.json").read_text())
PERSONE = {p["id"]: Persona(**p) for p in DATI["persone"]}
PRJ = Progetto(**DATI["progetti"][0])


def test_budget_al_senior_non_alla_sviluppatrice():
    assert puo_vedere(PERSONE["p-02"], PRJ, ["budget"])        # Marco Bianchi
    assert not puo_vedere(PERSONE["p-04"], PRJ, ["budget"])    # Sara Colombo


def test_due_aree_basta_una():
    assert puo_vedere(PERSONE["p-06"], PRJ, ["fornitori", "budget"])  # Elena
    assert puo_vedere(PERSONE["p-02"], PRJ, ["fornitori", "budget"])  # Marco B. via budget
    assert not puo_vedere(PERSONE["p-04"], PRJ, ["fornitori", "budget"])


def test_manager_vede_tutto_generale_a_tutti():
    assert puo_vedere(PERSONE["p-01"], PRJ, ["personale"])
    assert puo_vedere(PERSONE["p-04"], PRJ, ["generale"])


def test_non_membro_non_vede_nulla():
    assert not puo_vedere(PERSONE["p-08"], PRJ, ["generale"])  # Paola, fuori dal progetto


def test_senza_aree_restrittivo():
    assert not puo_vedere(PERSONE["p-04"], PRJ, [])
