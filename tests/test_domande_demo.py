"""Domande della demo (controlli 2, 3, 4, 5) con i mock veri di `dati/mock_llm` e la memoria
approvata ricostruita come da `dati/attese/README.md` §2. Provider mock: niente rete."""

import json
from pathlib import Path

import pytest

from backend.analisi.ingestione import citazione, segmenta
from backend.domande import rispondi, voce_da_fatto, voce_da_task, voci_visibili
from backend.llm import CARTELLA_MOCK, Config
from backend.modelli import TESTO_NEUTRO, Fatto, Persona, Progetto, Task

RADICE = Path(__file__).resolve().parent.parent
AZIENDA = json.loads((RADICE / "dati" / "azienda.json").read_text(encoding="utf-8"))
PERSONE = {p["id"]: Persona(**{k: v for k, v in p.items() if not k.startswith("_")}) for p in AZIENDA["persone"]}
PROGETTO = Progetto(**AZIENDA["progetti"][0])
MANAGER = PERSONE[PROGETTO.manager_id]
NEUTRO = TESTO_NEUTRO.format(manager=MANAGER.nome)
CONFIG = Config(provider="mock", cartella_mock=CARTELLA_MOCK)

# Assegnatari risolti dopo l'approvazione di riu-001 (tabella del README): task-004 e task-007 senza.
ASSEGNATARI_RIU001 = ["p-05", "p-03", "p-06", None, "p-04", "p-07", None]


def documento(doc_id: str):
    return segmenta((RADICE / "dati" / "riunioni" / f"{doc_id}.md").read_text(encoding="utf-8"), "prj-01")


def mock(nome: str) -> dict:
    return json.loads((CARTELLA_MOCK / f"{nome}.json").read_text(encoding="utf-8"))


def fatti_da_mock(doc_id: str, primo_id: int, indici=None) -> list[Fatto]:
    doc = documento(doc_id)
    estratti = mock(f"fatti_{doc_id}_1di1")["fatti"]
    scelti = [estratti[i] for i in indici] if indici is not None else estratti
    return [Fatto(id=f"fat-{primo_id + n:03d}", progetto_id="prj-01", soggetto=f["soggetto"],
                  attributo=f["attributo"], valore=f["valore"], aree=f["aree"],
                  citazioni=[citazione(doc, s) for s in f["segmenti"]])
            for n, f in enumerate(scelti)]


def task_riu001() -> list[Task]:
    doc = documento("riu-001")
    out = []
    for n, (t, ass) in enumerate(zip(mock("task_riu-001_1di1")["task"], ASSEGNATARI_RIU001), start=1):
        dip = [f"task-{int(r[1:]):03d}" for r in t["dipende_da"]]
        out.append(Task(id=f"task-{n:03d}", progetto_id="prj-01", titolo=t["titolo"], assegnatario_id=ass,
                        scadenza=t["scadenza"], aree=t["aree"], dipende_da=dip,
                        citazioni=[citazione(doc, s) for s in t["segmenti"]]))
    return out


# Stato 1: riu-001 approvata (controlli 3, 4, 5).
TASK_1 = task_riu001()
FATTI_1 = fatti_da_mock("riu-001", 1)
# Stato 2 (controllo 2): riu-001 e riu-002 approvate, di riu-003 solo il 7,400 (fat-009).
# Il fatto rifiutato sul secondo pannello (indice 3 del mock di riu-003) non entra in memoria.
FATTI_2 = FATTI_1 + fatti_da_mock("riu-002", 7) + fatti_da_mock("riu-003", 9, indici=[0])


def chiedi(persona_id: str, testo: str, task=TASK_1, fatti=FATTI_1):
    persona = PERSONE[persona_id]
    voci = voci_visibili(persona, PROGETTO, task, fatti, PERSONE)
    return rispondi(testo, persona, voci, MANAGER.nome, CONFIG), voci


def segmenti(r) -> list[str]:
    return [c.segmento_id for c in r.citazioni]


def test_memoria_ricostruita_come_da_readme():
    assert [f.id for f in FATTI_2][-1] == "fat-009" and "7,400" in FATTI_2[-1].valore
    assert not any("second HMI panel" in f.valore for f in FATTI_2)
    assert TASK_1[4].dipende_da == ["task-004"]


# --- voci ---------------------------------------------------------------------------------------

def test_voce_da_task_compatta():
    v = voce_da_task(TASK_1[0], PERSONE)
    assert v.id == "task-001" and v.tipo == "task"
    assert "Prepare the first progress report" in v.testo and "Luca Gallo" in v.testo and "15/12/2026" in v.testo
    assert "to do" in v.testo
    assert v.citazioni[0].segmento_id == "riu-001#s002"
    assert "no owner" in voce_da_task(TASK_1[6], PERSONE).testo
    assert "task-004" in voce_da_task(TASK_1[4], PERSONE).testo


def test_voce_da_fatto():
    v = voce_da_fatto(FATTI_1[4])
    assert v.testo.startswith("inverter — costo: €6,200 (Elettrotecnica Piemonte quote)")
    assert v.aree == ["fornitori", "budget"]


def test_voci_visibili_per_persona():
    sara = voci_visibili(PERSONE["p-04"], PROGETTO, TASK_1, FATTI_1, PERSONE)
    assert sara and not any("budget" in v.aree for v in sara)
    assert voci_visibili(PERSONE["p-08"], PROGETTO, TASK_1, FATTI_1, PERSONE) == []   # fuori progetto
    tutte = voci_visibili(MANAGER, PROGETTO, list(reversed(TASK_1)), list(reversed(FATTI_1)), PERSONE)
    assert [v.id for v in tutte] == [f.id for f in FATTI_1] + [t.id for t in TASK_1]   # fatti, poi task, per id


# --- controlli ----------------------------------------------------------------------------------

def test_controllo_2_solo_la_voce_approvata():
    r, _ = chiedi("p-01", "What is the latest inverter quote?", fatti=FATTI_2)
    assert r.esito == "risposta" and "7,400" in r.testo
    assert segmenti(r) == ["riu-003#s002"]
    assert "riu-003#s008" not in segmenti(r)
    r, _ = chiedi("p-01", "Does the client want a second HMI panel?", fatti=FATTI_2)
    assert r.esito == "non_lo_so" and r.testo == NEUTRO


@pytest.mark.parametrize("persona,domanda,atteso,seg", [
    ("p-02", "How much budget is left?", "35,500", "riu-001#s003"),
    ("p-06", "How much do the inverters cost?", "6,200", "riu-001#s007"),
])
def test_controllo_3_chi_ha_i_permessi(persona, domanda, atteso, seg):
    r, _ = chiedi(persona, domanda)
    assert r.esito == "risposta" and atteso in r.testo and seg in segmenti(r)


@pytest.mark.parametrize("domanda,vietati", [
    ("How much budget is left?", ["35,500", "48,000", "12,500"]),
    ("How much do the inverters cost?", ["6,200"]),
])
def test_controllo_3_sara_riceve_il_testo_neutro(domanda, vietati):
    r, voci = chiedi("p-04", domanda)
    assert voci   # il modello (mock) viene chiamato con altre voci: l'id citato non c'è e viene scartato
    assert r.esito == "non_lo_so" and r.testo == NEUTRO and r.citazioni == []
    assert not any(x in r.testo for x in vietati)
    # identico al «dato mancante»
    assert r.testo == chiedi("p-01", "Which PLC does the client use on line 2?")[0].testo


def test_paola_fuori_progetto_testo_neutro():
    r, voci = chiedi("p-08", "How much budget is left?")
    assert voci == [] and r.testo == NEUTRO


def test_controllo_4_cita():
    r, _ = chiedi("p-01", "Who is preparing the first progress report for the client?")
    assert r.esito == "risposta" and "Luca" in r.testo
    c = r.citazioni[0]
    assert (c.segmento_id, c.documento_id, c.titolo, c.data, c.orario, c.speaker) == (
        "riu-001#s002", "riu-001", "Line 3 revamping kick-off", "2026-11-16", "09:30", "Luca Gallo")


def test_controllo_5_lacune():
    r, _ = chiedi("p-01", "Which PLC does the client use on line 2?")
    assert r.esito == "non_lo_so" and r.testo == NEUTRO
    r, _ = chiedi("p-01", "Who is updating the operating manual for the operators?")
    assert r.esito == "risposta" and "owner" in r.testo and "riu-001#s014" in segmenti(r)
