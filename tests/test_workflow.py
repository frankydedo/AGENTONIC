"""Workflow completo (F5 + F12): `analizza_documento` sul percorso della demo, solo provider mock."""

import json

import pytest

from backend.analisi import analizza_documento, estrazione
from backend.analisi.proposte import data_valida, in_proposte
from backend.analisi.simulatore import Simulatore, documenti_demo, esegui_percorso
from backend.llm import Config
from backend.modelli import AggiornamentoTask, EstrazioneRiunione, Task, TaskEstratto

MOCK = Config(provider="mock")
STEP = ["ingestione", "persone", "estrazione_task", "estrazione_fatti", "estrazione_lacune", "proposte",
        "incongruenze_regole"]

# Cosa vede il manager, documento per documento (dati/attese/riu-00x.md, doc-001 dopo riu-005)
ATTESE = {
    "riu-001": ({"nuovo_task": 7, "nuovo_fatto": 6}, {"punto_oscuro": 2}),
    "riu-002": ({"nuovo_task": 1, "aggiorna_task": 3, "chiudi_task": 1, "nuovo_fatto": 2},
                {"punto_oscuro": 1, "sconosciuto": 3, "incongruenza": 1}),
    "riu-003": ({"nuovo_task": 1, "aggiorna_task": 2, "nuovo_fatto": 4}, {"punto_oscuro": 1, "incongruenza": 4}),
    "riu-004": ({"chiudi_task": 2, "aggiorna_task": 3, "nuovo_fatto": 1}, {}),
    "riu-005": ({"nuovo_task": 2, "aggiorna_task": 1, "nuovo_fatto": 2}, {"punto_oscuro": 1, "incongruenza": 1}),
    "doc-001": ({"nuovo_task": 2, "nuovo_fatto": 7}, {"punto_oscuro": 3, "sconosciuto": 1, "incongruenza": 1}),
}


def conta(elementi) -> dict:
    out: dict = {}
    for e in elementi:
        out[e.tipo] = out.get(e.tipo, 0) + 1
    return out


@pytest.fixture(scope="module")
def percorso():
    return esegui_percorso(MOCK)


def _per_doc(percorso):
    return {doc.id: (doc, r) for doc, r, _ in percorso[1]}


def test_ogni_documento_proposte_e_avvisi_attesi(percorso):
    per_doc = _per_doc(percorso)
    assert list(per_doc) == list(ATTESE)
    for did, (proposte, avvisi) in ATTESE.items():
        _, r = per_doc[did]
        assert conta(r.proposte) == proposte, did
        assert conta(r.avvisi) == avvisi, did
        assert all(p.id is None and p.stato == "in_attesa" for p in r.proposte)
        assert all(a.id is None and a.solo_manager for a in r.avvisi)


def test_passi_nell_ordine_del_flusso_con_esito_noto(percorso):
    for doc, r in _per_doc(percorso).values():
        step = [p.step for p in r.passi]
        assert step[:7] == STEP and step[-1] == "risultato", doc.id
        assert set(step[7:-1]) <= {"incongruenze"}
        assert all(p.esito == "ok" for p in r.passi), [(p.step, p.motivo) for p in r.passi if p.esito != "ok"]
        assert all(p.documento_id == doc.id and p.attore == "brain" for p in r.passi)


def test_incongruenze_della_demo(percorso):
    per_doc = _per_doc(percorso)
    def testi(did):
        return [a.testo for a in per_doc[did][1].avvisi if a.tipo == "incongruenza"]
    assert any("quadro elettrico" in t and "18/12/2026" in t for t in testi("riu-002"))
    assert any("7.400" in t and "6.200" in t for t in testi("riu-003"))
    assert any("2027-01-15" in t and "2027-01-20" in t for t in testi("doc-001"))
    collaudo = next(a for a in per_doc["doc-001"][1].avvisi if a.tipo == "incongruenza")
    assert {c.documento_id for c in collaudo.citazioni} == {"doc-001", "riu-001"}


def test_paola_greco_fuori_progetto(percorso):
    _, r = _per_doc(percorso)["riu-002"]
    assert any("Paola Greco" in a.testo and "non fa parte del progetto" in a.testo
               for a in r.avvisi if a.tipo == "sconosciuto")


def test_punti_oscuri_non_doppi(percorso):
    _, r = _per_doc(percorso)["riu-001"]
    testi = [a.testo for a in r.avvisi]
    assert any('"Marco" è ambiguo' in t for t in testi) and any("non ha un responsabile" in t for t in testi)
    assert len(testi) == 2


def test_citazioni_solo_da_segmenti_esistenti(percorso):
    segmenti = {s.id: s for doc in documenti_demo() for s in doc.segmenti}
    for _, r in _per_doc(percorso).values():
        for el in [*r.proposte, *r.avvisi]:
            for c in el.citazioni:
                assert c.segmento_id in segmenti and c.frase == segmenti[c.segmento_id].testo


def test_nessun_testo_dei_documenti_nei_passi(percorso):
    frasi = {f.strip() for doc in documenti_demo() for s in doc.segmenti
             for f in s.testo.replace("?", ".").split(".") if len(f.strip()) >= 20}
    assert frasi
    for _, r in _per_doc(percorso).values():
        for p in r.passi:
            registro = json.dumps([p.input, p.output, p.motivo], ensure_ascii=False)
            assert not [f for f in frasi if f in registro], p.step


def test_memoria_finale_coerente_con_il_readme(percorso):
    sim = percorso[0]
    assert len(sim.task) == 13 and len(sim.fatti) == 21
    assert sim.task["task-009"].titolo.startswith("Chiedere al cliente una conferma scritta")
    assert (sim.task["task-004"].assegnatario_id, sim.task["task-004"].stato) == ("p-02", "fatto")
    assert sim.task["task-005"].dipende_da == ["task-004"] and sim.task["task-011"].dipende_da == ["task-010"]
    assert sim.fatti["fat-009"].valore.startswith("7.400")
    rifiutate = {d.id: e["rifiutate"] for d, _, e in percorso[1]}
    assert rifiutate["riu-003"] == ["cliente"]


def test_mock_mancanti_nessuna_eccezione_e_avvisi_di_analisi_non_riuscita(tmp_path):
    sim = Simulatore()
    r = sim.analizza(documenti_demo()[0], Config(provider="mock", cartella_mock=tmp_path))
    assert r.proposte == []
    assert [a.testo for a in r.avvisi] == [
        f"L'analisi di {n} non è riuscita: il documento va ricontrollato a mano." for n in ("task", "fatti", "lacune")]
    assert all(a.tipo == "punto_oscuro" and a.solo_manager and not a.citazioni for a in r.avvisi)
    esiti = {p.step: p.esito for p in r.passi}
    assert esiti["estrazione_task"] == esiti["estrazione_fatti"] == esiti["estrazione_lacune"] == "errore"
    assert esiti["risultato"] == "errore"


def test_un_estrattore_fallisce_gli_altri_proseguono(monkeypatch):
    def rotto(doc, contesto, config=None):
        raise RuntimeError("boom")
    monkeypatch.setattr(estrazione, "estrai_fatti", rotto)
    r = Simulatore().analizza(documenti_demo()[0], MOCK)
    assert conta(r.proposte) == {"nuovo_task": 7}
    assert sum("L'analisi di fatti non è riuscita" in a.testo for a in r.avvisi) == 1
    passo = next(p for p in r.passi if p.step == "estrazione_fatti")
    assert passo.esito == "errore" and "boom" not in (passo.motivo or "")


def test_deduplica_punti_oscuri_del_modello(tmp_path):
    doc = documenti_demo()[0]
    for agente, dati in {
        "task": {"task": [{"rif": "t1", "titolo": "Preparare la lista dei tag del PLC", "assegnatario_detto": "Marco",
                           "scadenza": "fine mese", "aree": ["sviluppo"], "segmenti": ["riu-001#s009"],
                           "sicurezza": "alta"}], "aggiornamenti": []},
        "fatti": {"fatti": []},
        "lacune": {"punti_oscuri": [{"descrizione": "Marco chi?", "segmenti": ["riu-001#s009"]},
                                    {"descrizione": "Altro dubbio.", "segmenti": ["riu-001#s003"]}],
                   "sconosciuti": []},
    }.items():
        (tmp_path / f"{agente}_riu-001_1di1.json").write_text(json.dumps(dati), encoding="utf-8")
    r = Simulatore().analizza(doc, Config(provider="mock", cartella_mock=tmp_path))
    testi = [a.testo for a in r.avvisi]
    # i due del codice (nome ambiguo, data non chiara) restano anche se citano lo stesso segmento
    assert any("ambiguo" in t for t in testi) and any("non è una data chiara" in t for t in testi)
    assert "Marco chi?" not in testi and "Altro dubbio." in testi
    assert r.passi[-1].output["punti_oscuri_doppi_tolti"] == 1
    assert r.proposte[0].contenuto["scadenza"] is None


def test_date_non_chiare():
    sim = Simulatore()
    doc = documenti_demo()[0]
    ctx = sim.contesto()
    s = ["riu-001#s002"]
    estr = EstrazioneRiunione(task=[
        TaskEstratto(rif="t1", titolo="Fare il SAL", assegnatario_detto="Luca", scadenza="2026-02-30",
                     aree=["commerciale"], segmenti=s, sicurezza="alta"),
        TaskEstratto(rif="t2", titolo="Fare il SAL 2", assegnatario_detto="Luca", scadenza=" 2026-12-15 ",
                     aree=["commerciale"], segmenti=s, sicurezza="alta")])
    proposte, avvisi, passo = in_proposte(estr, doc, ctx)
    assert [p.contenuto["scadenza"] for p in proposte] == [None, "2026-12-15"]
    assert [a.testo for a in avvisi] == ['La scadenza "2026-02-30" di "Fare il SAL" non è una data chiara.']
    assert passo.output["date_non_chiare"] == 1

    # aggiornamento con una data non chiara: solo l'avviso
    ctx = ctx.model_copy(update={"task": [Task(id="task-001", progetto_id="prj-01", titolo="SAL", aree=["commerciale"])]})
    estr = EstrazioneRiunione(aggiornamenti=[
        AggiornamentoTask(task_id="task-001", campo="scadenza", valore="dopo Natale", segmenti=s, sicurezza="alta")])
    proposte, avvisi, passo = in_proposte(estr, doc, ctx)
    assert proposte == [] and avvisi[0].testo == 'La scadenza "dopo Natale" di "SAL" non è una data chiara.'
    assert passo.output["date_non_chiare"] == 1
    assert data_valida("2026-12-15") and not data_valida("15/12/2026") and not data_valida(None)
