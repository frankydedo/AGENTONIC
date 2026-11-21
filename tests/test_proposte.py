"""F4, proposte: dall'estrazione (costruita a mano) a proposte e avvisi, con le regole deterministiche."""

import json
from pathlib import Path

from backend.analisi.ingestione import segmenta
from backend.analisi.proposte import in_proposte, regola_aree
from backend.modelli import (
    AggiornamentoTask, ContestoProgetto, EstrazioneRiunione, FattoEstratto, Persona, Progetto, PuntoOscuro,
    Sconosciuto, Task, TaskEstratto,
)

RADICE = Path(__file__).parent.parent
DATI = json.loads((RADICE / "dati" / "azienda.json").read_text())
PRJ = Progetto(**DATI["progetti"][0])
TUTTE = [Persona(**p) for p in DATI["persone"]]
DOC = segmenta((RADICE / "dati" / "riunioni" / "riu-001.md").read_text())
TASK_QUADRO = Task(id="task-002", progetto_id="prj-01", titolo="Quadro elettrico pronto al collaudo",
                   assegnatario_id="p-03", scadenza="2026-12-10", aree=["sviluppo"])
CTX = ContestoProgetto(progetto=PRJ, persone=[p for p in TUTTE if p.id in PRJ.membri],
                       persone_azienda=[p for p in TUTTE if p.id not in PRJ.membri], task=[TASK_QUADRO])


def s(*n: int) -> list[str]:
    return [f"riu-001#s{x:03d}" for x in n]


def task(rif, titolo, chi, scadenza, aree, segmenti, sicurezza="alta", dipende_da=()):
    return TaskEstratto(rif=rif, titolo=titolo, assegnatario_detto=chi, scadenza=scadenza, aree=aree,
                        segmenti=segmenti, sicurezza=sicurezza, dipende_da=list(dipende_da))


def fatto(soggetto, attributo, valore, aree, segmenti, sicurezza="alta"):
    return FattoEstratto(soggetto=soggetto, attributo=attributo, valore=valore, aree=aree,
                         segmenti=segmenti, sicurezza=sicurezza)


# Estrazione attesa per riu-001 (dati/attese/riu-001.md), come la restituirebbe il modello.
ESTR_RIU_001 = EstrazioneRiunione(
    task=[
        task("t1", "Preparare il primo SAL per il cliente", "Luca Gallo", "2026-12-15", ["commerciale"], s(2)),
        task("t2", "Quadro elettrico cablato, pronto al collaudo in officina", "Rinaldi", "2026-12-10",
             ["sviluppo"], s(5, 6)),
        task("t3", "Ordinare gli inverter a Elettrotecnica Piemonte", "Elena Russo", "2026-11-18",
             ["fornitori"], s(7)),
        task("t4", "Preparare la lista dei tag del PLC", "Marco", "2026-11-25", ["sviluppo"], s(9, 10), "media"),
        task("t5", "Schermate della nuova HMI", "Sara", "2026-12-04", ["sviluppo"], s(11, 12),
             dipende_da=["t4"]),
        task("t6", "Sopralluogo sulla linea dal cliente", "Davide Conti", "2026-11-19", ["sviluppo"], s(13)),
        task("t7", "Aggiornare il manuale d'uso per gli operatori", None, "2027-01-20", ["generale"],
             s(14, 15), "media"),
    ],
    fatti=[
        fatto("progetto", "scadenza", "collaudo presso il cliente entro il 2027-01-20", ["generale"], s(1)),
        fatto("progetto", "budget", "48.000 euro approvati, 12.500 già impegnati", ["budget"], s(3)),
        fatto("PLC", "decisione", "Siemens S7-1500 al posto dell'S7-300, programma riscritto", ["sviluppo"], s(4, 5)),
        fatto("inverter", "costo", "Elettrotecnica Piemonte, 6.200 euro, consegna in 3 settimane",
              ["fornitori"], s(7)),
        fatto("cliente", "requisito", "un SAL ogni mese", ["commerciale"], s(2)),
    ],
)


def analizza(estr: EstrazioneRiunione):
    return in_proposte(estr, DOC, CTX)


def per_titolo(proposte, titolo):
    return next(p for p in proposte if p.tipo == "nuovo_task" and p.contenuto["titolo"] == titolo)


def test_riu_001_sette_task_e_cinque_fatti():
    proposte, avvisi, passo = analizza(ESTR_RIU_001)
    nuovi = [p for p in proposte if p.tipo == "nuovo_task"]
    assert len(nuovi) == 7 and len([p for p in proposte if p.tipo == "nuovo_fatto"]) == 5
    assert [p.contenuto["assegnatario_id"] for p in nuovi] == ["p-05", "p-03", "p-06", None, "p-04", "p-07", None]
    sal = nuovi[0]
    assert sal.contenuto == {"progetto_id": "prj-01", "titolo": "Preparare il primo SAL per il cliente",
                             "assegnatario_id": "p-05", "scadenza": "2026-12-15", "stato": "da_fare",
                             "aree": ["commerciale"], "dipende_da": [], "rif": "riu-001:t1"}
    for p in proposte:
        assert p.id is None and p.creata_il is None and p.stato == "in_attesa" and p.documento_id == "riu-001"
        assert p.progetto_id == "prj-01" and p.citazioni
    assert sal.citazioni[0].speaker == "Luca Gallo" and sal.citazioni[0].orario == "09:30"
    assert passo.output["proposte"] == {"nuovo_task": 7, "nuovo_fatto": 5}
    assert passo.output["scartati"] == 0 and passo.esito == "ok" and passo.provider is None
    assert passo.tipo == "workflow" and passo.attore == "brain" and passo.step == "proposte"


def test_riu_001_punto_oscuro_su_marco():
    proposte, avvisi, _ = analizza(ESTR_RIU_001)
    assert per_titolo(proposte, "Preparare la lista dei tag del PLC").contenuto["assegnatario_id"] is None
    marco = [a for a in avvisi if '"Marco" è ambiguo' in a.testo]
    assert len(marco) == 1 and marco[0].tipo == "punto_oscuro"
    assert "Marco Bianchi o Marco Rinaldi" in marco[0].testo and "lista dei tag" in marco[0].testo
    assert [c.segmento_id for c in marco[0].citazioni] == s(9, 10)


def test_riu_001_manuale_senza_responsabile():
    proposte, avvisi, _ = analizza(ESTR_RIU_001)
    manuale = per_titolo(proposte, "Aggiornare il manuale d'uso per gli operatori")
    assert manuale.contenuto["assegnatario_id"] is None and manuale.aree_proposte == ["generale"]
    testi = [a.testo for a in avvisi]
    assert "Il task \"Aggiornare il manuale d'uso per gli operatori\" non ha un responsabile. Chi se ne occupa?" in testi
    assert len(avvisi) == 2
    for a in avvisi:
        assert a.solo_manager and a.id is None and a.creato_il is None and a.citazioni


def test_riu_001_fatti_e_inverter_con_budget():
    proposte, _, _ = analizza(ESTR_RIU_001)
    fatti = {p.contenuto["soggetto"]: p for p in proposte if p.tipo == "nuovo_fatto"}
    inverter = fatti["inverter"]
    assert inverter.aree_proposte == ["fornitori", "budget"] and inverter.contenuto["aree"] == ["fornitori", "budget"]
    assert inverter.contenuto == {"progetto_id": "prj-01", "soggetto": "inverter", "attributo": "costo",
                                  "valore": "Elettrotecnica Piemonte, 6.200 euro, consegna in 3 settimane",
                                  "aree": ["fornitori", "budget"]}
    assert fatti["cliente"].aree_proposte == ["commerciale"]
    assert [c.segmento_id for c in fatti["PLC"].citazioni] == s(4, 5)


def test_riu_001_dipendenza_hmi_dalla_lista_dei_tag():
    proposte, _, _ = analizza(ESTR_RIU_001)
    assert per_titolo(proposte, "Schermate della nuova HMI").contenuto["dipende_da"] == ["riu-001:t4"]
    assert per_titolo(proposte, "Preparare la lista dei tag del PLC").contenuto["rif"] == "riu-001:t4"


def test_dipendenze_esistenti_tenute_inventate_tolte():
    estr = EstrazioneRiunione(task=[
        task("t1", "Collaudo in officina", "Davide", "2026-12-11", ["sviluppo"], s(6),
             dipende_da=["task-002", "task-999", "t9", "t1"]),
    ])
    proposte, _, passo = analizza(estr)
    assert proposte[0].contenuto["dipende_da"] == ["task-002"]
    assert passo.output["dipendenze_tolte"] == 3


def test_regole_sulle_aree():
    assert regola_aree([]) == []
    assert regola_aree(["generale"]) == ["generale"]
    assert regola_aree(["budget", "generale"]) == ["budget"]
    assert regola_aree(["generale", "sviluppo"]) == ["sviluppo"]
    assert regola_aree(["sviluppo"], "costo") == ["sviluppo", "budget"]
    assert regola_aree(["generale"], "budget") == ["budget"]
    assert regola_aree([], "costo") == ["budget"]


def test_aree_applicate_a_proposta_e_contenuto():
    estr = EstrazioneRiunione(
        fatti=[fatto("progetto", "budget", "48.000 euro", ["budget", "generale"], s(3)),
               fatto("progetto", "rischio", "margine stretto", [], s(3))],
        task=[task("t1", "Preparare il SAL", "Luca", "2026-12-15", ["generale", "commerciale"], s(2))],
    )
    proposte, _, _ = analizza(estr)
    budget, rischio = [p for p in proposte if p.tipo == "nuovo_fatto"]
    assert budget.aree_proposte == ["budget"] and budget.contenuto["aree"] == ["budget"]
    assert rischio.aree_proposte == [] and rischio.contenuto["aree"] == []     # le sceglie il manager
    sal = next(p for p in proposte if p.tipo == "nuovo_task")
    assert sal.aree_proposte == ["commerciale"] and sal.contenuto["aree"] == ["commerciale"]


def test_sicurezza_bassa_solo_avviso():
    estr = EstrazioneRiunione(
        task=[task("t1", "Forse un secondo sopralluogo", "Davide", None, ["sviluppo"], s(13), "bassa")],
        fatti=[fatto("cliente", "requisito", "forse un corso agli operatori", ["commerciale"], s(15), "bassa")],
    )
    proposte, avvisi, passo = analizza(estr)
    assert proposte == []
    assert [a.tipo for a in avvisi] == ["punto_oscuro", "punto_oscuro"]
    assert "Forse un secondo sopralluogo" in avvisi[0].testo
    assert passo.output["avvisi"] == {"punto_oscuro": 2} and passo.esito == "ok"


def test_dipendenza_da_task_a_sicurezza_bassa_tolta():
    estr = EstrazioneRiunione(task=[
        task("t1", "Lista dei tag", "Marco Bianchi", "2026-11-25", ["sviluppo"], s(9), "bassa"),
        task("t2", "Schermate HMI", "Sara", "2026-12-04", ["sviluppo"], s(11), dipende_da=["t1"]),
    ])
    proposte, _, _ = analizza(estr)
    assert len(proposte) == 1 and proposte[0].contenuto["dipende_da"] == []


def test_id_di_segmento_inventato_scartato():
    estr = EstrazioneRiunione(
        task=[task("t1", "Task inventato", "Sara", None, ["sviluppo"], ["riu-001#s999"]),
              task("t2", "Task con segmento di un altro documento", "Sara", None, ["sviluppo"], ["riu-002#s001"]),
              task("t3", "Task senza segmenti", "Sara", None, ["sviluppo"], [])],
        fatti=[fatto("PLC", "decisione", "S7-1500", ["sviluppo"], ["riu-001#s004", "riu-001#s404"])],
        punti_oscuri=[PuntoOscuro(descrizione="Chi paga?", segmenti=["x"])],
    )
    proposte, avvisi, passo = analizza(estr)
    assert proposte == [] and avvisi == []
    assert passo.output["scartati"] == 5 and passo.output["motivi_scarto"] == {"segmento_inesistente": 5}
    assert passo.esito == "scartato" and passo.motivo == "5 segmento inesistente"


def test_aggiornamento_di_task_inesistente_scartato():
    estr = EstrazioneRiunione(aggiornamenti=[
        AggiornamentoTask(task_id="task-404", campo="scadenza", valore="2026-12-18", segmenti=s(6), sicurezza="alta"),
    ])
    proposte, avvisi, passo = analizza(estr)
    assert proposte == [] and avvisi == []
    assert passo.output["motivi_scarto"] == {"task_inesistente": 1} and passo.esito == "scartato"


def test_aggiorna_task_scadenza_e_assegnatario():
    estr = EstrazioneRiunione(aggiornamenti=[
        AggiornamentoTask(task_id="task-002", campo="scadenza", valore="2026-12-18", segmenti=s(6), sicurezza="alta"),
        AggiornamentoTask(task_id="task-002", campo="assegnatario", valore="Davide", segmenti=s(13), sicurezza="media"),
        AggiornamentoTask(task_id="task-002", campo="assegnatario", valore="Marco", segmenti=s(9), sicurezza="alta"),
    ])
    proposte, avvisi, _ = analizza(estr)
    assert [p.tipo for p in proposte] == ["aggiorna_task", "aggiorna_task"]
    assert proposte[0].contenuto == {"task_id": "task-002", "campo": "scadenza", "valore": "2026-12-18"}
    assert proposte[1].contenuto == {"task_id": "task-002", "campo": "assegnatario", "valore": "p-07"}
    assert proposte[1].sicurezza == "media"
    assert all(p.aree_proposte == ["sviluppo"] for p in proposte)        # aree del task esistente
    assert len(avvisi) == 1 and avvisi[0].tipo == "punto_oscuro" and '"Marco" è ambiguo' in avvisi[0].testo


def test_chiudi_task():
    estr = EstrazioneRiunione(aggiornamenti=[
        AggiornamentoTask(task_id="task-002", campo="stato", valore="fatto", segmenti=s(6), sicurezza="alta"),
        AggiornamentoTask(task_id="task-002", campo="stato", valore="in_corso", segmenti=s(6), sicurezza="alta"),
    ])
    proposte, _, passo = analizza(estr)
    assert proposte[0].tipo == "chiudi_task" and proposte[0].contenuto == {"task_id": "task-002", "stato": "fatto"}
    assert proposte[1].tipo == "aggiorna_task" and proposte[1].contenuto["valore"] == "in_corso"
    assert passo.output["proposte"] == {"chiudi_task": 1, "aggiorna_task": 1}


def test_assegnatario_non_membro():
    estr = EstrazioneRiunione(task=[task("t1", "Aggiornare le ferie", "Paola Greco", None, ["personale"], s(13))])
    proposte, avvisi, _ = analizza(estr)
    assert proposte[0].contenuto["assegnatario_id"] is None
    assert "non è un membro del progetto" in avvisi[0].testo and avvisi[0].tipo == "punto_oscuro"


def test_sconosciuti_e_punti_oscuri():
    estr = EstrazioneRiunione(
        punti_oscuri=[PuntoOscuro(descrizione="Non è chiaro chi approva il SAL lato cliente.", segmenti=s(2))],
        sconosciuti=[
            Sconosciuto(nome="Paola Greco", descrizione="citata per le ferie del team", segmenti=s(13)),
            Sconosciuto(nome="Ing. Venturi", descrizione="referente del cliente", segmenti=s(15)),
            Sconosciuto(nome="Sara Colombo", descrizione="", segmenti=s(8)),        # è un membro: niente avviso
        ],
    )
    _, avvisi, passo = analizza(estr)
    assert [a.tipo for a in avvisi] == ["punto_oscuro", "sconosciuto", "sconosciuto"]
    assert avvisi[0].testo == "Non è chiaro chi approva il SAL lato cliente."
    assert "Paola Greco" in avvisi[1].testo and "non fa parte del progetto" in avvisi[1].testo
    assert avvisi[2].testo.startswith('"Ing. Venturi" non è tra le persone o i contesti noti del progetto.')
    assert all(a.solo_manager and a.aree == [] for a in avvisi)
    assert passo.output["motivi_scarto"] == {"membro_del_progetto": 1}
