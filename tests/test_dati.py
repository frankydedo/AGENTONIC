"""Dati della demo (F7, F10): riunioni sintetiche, mock dell'estrazione, id attesi, controlli.

Niente rete né modello: si usano solo `segmenta()` e il codice deterministico delle proposte.
Gli id attesi (TASK, FATTI) sono gli stessi della tabella in `dati/attese/README.md`.
"""

import json
import re
from pathlib import Path

import pytest

from backend.analisi.ingestione import segmenta
from backend.modelli import (
    AggiornamentoTask, ContestoProgetto, EstrazioneRiunione, Fatto, FattoEstratto, Persona, Progetto,
    PuntoOscuro, Sconosciuto, Task, TaskEstratto,
)

RADICE = Path(__file__).parent.parent
DATI = RADICE / "dati"
RIUNIONI = [f"riu-00{n}" for n in range(1, 6)]
DATA = re.compile(r"^\d{4}-\d{2}-\d{2}$")

# Id che il backend assegna seguendo il percorso della demo (README): task -> (riunione, rif, titolo).
TASK = {
    "task-001": ("riu-001", "t1", "Prepare the first progress report for the client"),
    "task-002": ("riu-001", "t2", "Wire the control panel and prepare it for the factory acceptance test"),
    "task-003": ("riu-001", "t3", "Order the inverters from Elettrotecnica Piemonte"),
    "task-004": ("riu-001", "t4", "Prepare the PLC tag list"),
    "task-005": ("riu-001", "t5", "Prepare the new HMI screens"),
    "task-006": ("riu-001", "t6", "Do the site survey on the client's line"),
    "task-007": ("riu-001", "t7", "Update the operating manual for the client's operators"),
    "task-008": ("riu-002", "t1", "Send Giulia Mr Venturi's contact details"),
    "task-009": ("riu-003", "t1", "Ask the client for written confirmation about the second HMI panel"),
    "task-010": ("riu-005", "t1", "Fix the emergency stop interlock in the PLC program"),
    "task-011": ("riu-005", "t2", "Repeat the bench test of the fixed PLC program"),
}
# fatto -> (riunione, indice nel mock da 1, soggetto, attributo)
FATTI = {
    "fat-001": ("riu-001", 1, "project", "scadenza"),
    "fat-002": ("riu-001", 2, "project", "budget"),
    "fat-003": ("riu-001", 3, "PLC", "decisione"),
    "fat-004": ("riu-001", 4, "inverter", "fornitore"),
    "fat-005": ("riu-001", 5, "inverter", "costo"),
    "fat-006": ("riu-001", 6, "client", "requisito"),
    "fat-007": ("riu-002", 1, "existing wiring to the motors", "altro"),
    "fat-008": ("riu-002", 2, "Davide Conti", "altro"),
    "fat-009": ("riu-003", 1, "inverter", "costo"),
    "fat-010": ("riu-003", 2, "inverter", "decisione"),
    "fat-011": ("riu-003", 3, "project", "budget"),
    "fat-012": ("riu-004", 1, "inverter", "scadenza"),
    "fat-013": ("riu-005", 1, "PLC program", "rischio"),
    "fat-014": ("riu-005", 2, "test bench", "altro"),
}
RIFIUTATI = {("riu-003", "nuovo_fatto", "second HMI panel")}     # proposte che il manager rifiuta nel percorso della demo


def _json(nome: str) -> dict:
    return json.loads((DATI / "mock_llm" / f"{nome}.json").read_text(encoding="utf-8"))


def _doc(rid: str):
    return segmenta((DATI / "riunioni" / f"{rid}.md").read_text(encoding="utf-8"))


def _mock(rid: str) -> dict:
    return {**_json(f"task_{rid}_1di1"), **_json(f"fatti_{rid}_1di1"), **_json(f"lacune_{rid}_1di1")}


def _segmenti_citati(m: dict) -> list[str]:
    return [sid for chiave in ("task", "aggiornamenti", "fatti", "punti_oscuri", "sconosciuti")
            for el in m[chiave] for sid in el["segmenti"]]


# --- Riunioni ---------------------------------------------------------------------------------

@pytest.mark.parametrize("rid", RIUNIONI)
def test_riunione_si_segmenta(rid):
    doc = _doc(rid)
    assert doc.id == rid and doc.progetto_id == "prj-01" and doc.tipo == "riunione"
    assert DATA.match(doc.data) and doc.ora_inizio
    assert [s.id for s in doc.segmenti] == [f"{rid}#s{n:03d}" for n in range(1, len(doc.segmenti) + 1)]
    if rid != "riu-001":
        assert 10 <= len(doc.segmenti) <= 18
    azienda = {p["nome"] for p in json.loads((DATI / "azienda.json").read_text())["persone"]}
    assert {s.speaker for s in doc.segmenti} <= azienda
    assert set(doc.partecipanti) <= azienda


def test_riunioni_in_ordine_di_data():
    date = [_doc(r).data for r in RIUNIONI]
    assert date == sorted(date) and len(set(date)) == len(date)


# --- Mock dell'estrazione ---------------------------------------------------------------------

@pytest.mark.parametrize("rid", RIUNIONI)
def test_mock_validi_per_il_contratto(rid):
    t, f, l = _json(f"task_{rid}_1di1"), _json(f"fatti_{rid}_1di1"), _json(f"lacune_{rid}_1di1")
    assert set(t) == {"task", "aggiornamenti"} and set(f) == {"fatti"} and set(l) == {"punti_oscuri", "sconosciuti"}
    task = [TaskEstratto(**x) for x in t["task"]]
    agg = [AggiornamentoTask(**x) for x in t["aggiornamenti"]]
    [FattoEstratto(**x) for x in f["fatti"]]
    [PuntoOscuro(**x) for x in l["punti_oscuri"]]
    assert all("persona_id" not in x for x in l["sconosciuti"])
    [Sconosciuto(**x) for x in l["sconosciuti"]]

    rif = [x.rif for x in task]
    assert rif == [f"t{n}" for n in range(1, len(rif) + 1)]
    for x in task:
        assert x.scadenza is None or DATA.match(x.scadenza)
        assert all(d in rif and d != x.rif for d in x.dipende_da)
    for a in agg:
        if a.campo == "scadenza":
            assert DATA.match(a.valore)
        if a.campo == "stato":
            assert a.valore in ("da_fare", "in_corso", "bloccato", "fatto", "annullato")


@pytest.mark.parametrize("rid", RIUNIONI)
def test_segmenti_citati_esistono(rid):
    ids = {s.id for s in _doc(rid).segmenti}
    citati = _segmenti_citati(_mock(rid))
    assert citati and set(citati) <= ids


@pytest.mark.parametrize("rid", RIUNIONI)
def test_aggiornamenti_su_task_di_riunioni_precedenti(rid):
    for a in _json(f"task_{rid}_1di1")["aggiornamenti"]:
        assert a["task_id"] in TASK, a["task_id"]
        assert TASK[a["task_id"]][0] < rid          # il task esiste (approvato) prima di questa riunione


# --- Tabelle degli id: test == README == mock ---------------------------------------------------

def test_tabella_id_del_readme_uguale_al_test():
    testo = (DATI / "attese" / "README.md").read_text(encoding="utf-8")
    righe_task = dict(re.findall(r"^\| (task-\d{3}) \| ([^|]+?) \|", testo, re.MULTILINE))
    righe_fatti = dict(re.findall(r"^\| (fat-\d{3}) \| ([^|]+?) \|", testo, re.MULTILINE))
    assert righe_task == {tid: v[2] for tid, v in TASK.items()}
    assert set(righe_fatti) == set(FATTI)


def test_tabella_id_coerente_con_i_mock():
    for tid, (rid, rif, titolo) in TASK.items():
        t = next(x for x in _json(f"task_{rid}_1di1")["task"] if x["rif"] == rif)
        assert t["titolo"] == titolo, tid
    for fid, (rid, i, soggetto, attributo) in FATTI.items():
        f = _json(f"fatti_{rid}_1di1")["fatti"][i - 1]
        assert (f["soggetto"], f["attributo"]) == (soggetto, attributo), fid


def test_percorso_della_demo_produce_gli_id_attesi():
    """Simula il backend: proposte (codice vero) -> approvazione in ordine -> id sequenziali."""
    from backend.analisi.proposte import in_proposte

    az = json.loads((DATI / "azienda.json").read_text())
    persone = {p["id"]: Persona(**p) for p in az["persone"]}
    prj = Progetto(**az["progetti"][0])
    task: dict[str, Task] = {}
    fatti: dict[str, Fatto] = {}
    rif_a_id: dict[str, str] = {}
    for rid in RIUNIONI:
        doc = _doc(rid)
        ctx = ContestoProgetto(progetto=prj, persone=[persone[m] for m in prj.membri],
                               persone_azienda=[p for i, p in persone.items() if i not in prj.membri],
                               task=list(task.values()), fatti=list(fatti.values()))
        proposte, avvisi, passo = in_proposte(EstrazioneRiunione(**_mock(rid)), doc, ctx)
        assert passo.output["scartati"] == 0, (rid, passo.output)
        for p in proposte:
            c = p.contenuto
            if any((rid, p.tipo) == (r, tipo) and testo in json.dumps(c, ensure_ascii=False)
                   for r, tipo, testo in RIFIUTATI):
                continue
            if p.tipo == "nuovo_task":
                tid = f"task-{len(task) + 1:03d}"
                rif_a_id[c["rif"]] = tid
                dip = [rif_a_id.get(d, d) for d in c["dipende_da"]]
                task[tid] = Task(id=tid, **{**{k: v for k, v in c.items() if k != "rif"}, "dipende_da": dip})
            elif p.tipo == "nuovo_fatto":
                fid = f"fat-{len(fatti) + 1:03d}"
                fatti[fid] = Fatto(id=fid, **c)
            elif p.tipo == "chiudi_task":
                task[c["task_id"]].stato = c["valore"]
            else:
                campo = "assegnatario_id" if c["campo"] == "assegnatario" else c["campo"]
                setattr(task[c["task_id"]], campo, c["valore"])
        if rid == "riu-002":
            testi = [a.testo for a in avvisi if a.tipo == "sconosciuto"]
            assert any("Paola Greco" in t and "is not part of the project" in t for t in testi)
            assert any("Venturi" in t for t in testi) and any("MES" in t for t in testi)

    assert {tid: t.titolo for tid, t in task.items()} == {tid: v[2] for tid, v in TASK.items()}
    assert {fid: (f.soggetto, f.attributo) for fid, f in fatti.items()} == {k: v[2:] for k, v in FATTI.items()}
    assert task["task-005"].dipende_da == ["task-004"] and task["task-011"].dipende_da == ["task-010"]
    assert (task["task-004"].assegnatario_id, task["task-004"].stato) == ("p-02", "fatto")
    assert (task["task-002"].scadenza, task["task-002"].stato) == ("2026-12-18", "in_corso")
    assert (task["task-005"].scadenza, task["task-005"].stato) == ("2026-12-09", "in_corso")
    assert task["task-007"].assegnatario_id is None and task["task-006"].stato == "fatto"
    assert fatti["fat-005"].aree == ["fornitori", "budget"] and fatti["fat-008"].aree == ["personale"]


# --- Controlli del brief (F10) ----------------------------------------------------------------

AZIONI = {"carica_riunione", "approva_tutte", "approva", "rifiuta", "proposte", "domanda", "avvisi",
          "todo", "todo_oggi", "accetta_todo", "segmento"}


def test_controlli_coprono_i_sette_del_brief():
    dati = json.loads((DATI / "attese" / "controlli.json").read_text(encoding="utf-8"))
    controlli = dati["controlli"]
    assert sorted(c["controllo"] for c in controlli) == list(range(1, 8))
    persone = {p["id"] for p in json.loads((DATI / "azienda.json").read_text())["persone"]}
    for c in controlli:
        assert c["nome"] and c["descrizione"] and c["passi"]
        for p in c["passi"]:
            assert p["azione"] in AZIONI, p
            assert p["persona"] in persone, p
            if p["azione"] == "carica_riunione":
                assert (RADICE / p["file"]).is_file()
            if p["azione"] == "domanda":
                assert p["esito_atteso"] in ("risposta", "non_lo_so")
                if p["esito_atteso"] == "risposta":
                    assert p.get("deve_contenere") and p.get("cita")
            for sid in p.get("cita", []) + ([p["id"]] if p["azione"] == "segmento" else []):
                assert sid in {s.id for s in _doc(sid.split("#")[0]).segmenti}, sid
    per_numero = {c["controllo"]: [p["azione"] for p in c["passi"]] for c in controlli}
    assert {"approva", "rifiuta", "domanda"} <= set(per_numero[2])
    domande_3 = [p for p in controlli[2]["passi"] if p["azione"] == "domanda"]
    assert {p["persona"] for p in domande_3} >= {"p-02", "p-04"}
    assert any(p["esito_atteso"] == "non_lo_so" for p in controlli[4]["passi"] if p["azione"] == "domanda")
    assert "proposte" in per_numero[6] and "approva" in per_numero[6]
