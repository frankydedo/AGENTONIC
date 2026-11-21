"""Risposte di esempio dello scheletro (Fase 0), coerenti con riu-001.

Servono a Mauro per lavorare prima del backend vero (I4). Spariscono a M1.
"""

from datetime import datetime

from backend.modelli import Avviso, Citazione, Fatto, Proposta, Risposta, Task

ORA = datetime(2026, 11, 21, 13, 30)


def cit(n: int, speaker: str, frase: str) -> Citazione:
    return Citazione(
        segmento_id=f"riu-001#s{n:03d}", documento_id="riu-001",
        titolo="Kick-off revamping linea 3", data="2026-11-16", orario="09:30",
        speaker=speaker, frase=frase,
    )


C_SAL = cit(2, "Luca Gallo", "Chiedono un SAL ogni mese, il primo entro il 15 dicembre. Lo preparo io, come al solito.")
C_BUDGET = cit(3, "Giulia Ferraris", "l'ordine vale 48.000 euro di budget interno approvato, a oggi ne abbiamo già impegnati 12.500 per la progettazione.")
C_TAG = cit(9, "Giulia Ferraris", "Marco, la lista dei tag la prepari tu entro il 25 novembre?")
C_HMI = cit(11, "Giulia Ferraris", "Sara, allora le schermate della HMI pronte entro il 4 dicembre, appena hai i tag.")

TASK_SAL = Task(id="task-001", progetto_id="prj-01", titolo="Preparare il primo SAL per il cliente",
                assegnatario_id="p-05", scadenza="2026-12-15", aree=["commerciale"], citazioni=[C_SAL])
TASK_TAG = Task(id="task-002", progetto_id="prj-01", titolo="Preparare la lista dei tag del PLC",
                assegnatario_id="p-02", scadenza="2026-11-25", aree=["sviluppo"], citazioni=[C_TAG])
TASK_HMI = Task(id="task-003", progetto_id="prj-01", titolo="Schermate della nuova HMI",
                assegnatario_id="p-04", scadenza="2026-12-04", stato="bloccato", aree=["sviluppo"],
                dipende_da=["task-002"], citazioni=[C_HMI])
FATTO_BUDGET = Fatto(id="fat-001", progetto_id="prj-01", soggetto="progetto", attributo="budget",
                     valore="48.000 € approvati, 12.500 € impegnati", aree=["budget"], citazioni=[C_BUDGET])

PROPOSTE = [
    Proposta(id="prop-001", progetto_id="prj-01", documento_id="riu-001", tipo="nuovo_task",
             contenuto=TASK_SAL.model_dump(exclude={"id", "citazioni"}), aree_proposte=["commerciale"],
             citazioni=[C_SAL], creata_il=ORA),
    Proposta(id="prop-002", progetto_id="prj-01", documento_id="riu-001", tipo="nuovo_task",
             contenuto={**TASK_TAG.model_dump(exclude={"id", "citazioni"}), "assegnatario_id": None},
             aree_proposte=["sviluppo"], sicurezza="bassa", citazioni=[C_TAG], creata_il=ORA),
    Proposta(id="prop-003", progetto_id="prj-01", documento_id="riu-001", tipo="nuovo_fatto",
             contenuto=FATTO_BUDGET.model_dump(exclude={"id", "citazioni"}), aree_proposte=["budget"],
             citazioni=[C_BUDGET], creata_il=ORA),
]

AVVISI = [
    Avviso(id="avv-001", progetto_id="prj-01", documento_id="riu-001", tipo="punto_oscuro",
           testo="«Marco» è ambiguo: nel progetto ci sono Marco Bianchi e Marco Rinaldi. "
                 "Chi prepara la lista dei tag?", citazioni=[C_TAG], creato_il=ORA),
    Avviso(id="avv-002", progetto_id="prj-01", documento_id="riu-001", tipo="punto_oscuro",
           testo="L'aggiornamento del manuale d'uso operatori non ha un responsabile.",
           citazioni=[cit(14, "Giulia Ferraris", "bisogna aggiornare il manuale d'uso per gli operatori del cliente")],
           creato_il=ORA),
]

RISPOSTA_OK = Risposta(esito="risposta",
                       testo="Restano 35.500 € di budget: 48.000 € approvati, 12.500 € già impegnati.",
                       citazioni=[C_BUDGET])
RISPOSTA_NEUTRA = Risposta(esito="non_lo_so",
                           testo="Non ho informazioni che puoi vedere su questo. Puoi chiedere a Giulia Ferraris.")

REGISTRO = [
    {"id": 1, "quando": "2026-11-21T13:30:00", "tipo": "workflow", "attore": "brain", "step": "ingestion",
     "input": {"documento_id": "riu-001"}, "output": {"segmenti": 16}, "motivo": None},
    {"id": 2, "quando": "2026-11-21T13:30:02", "tipo": "workflow", "attore": "brain", "step": "estrazione",
     "input": {"documento_id": "riu-001", "parte": "1/1"}, "output": {"task": 7, "fatti": 5}, "motivo": None},
    {"id": 3, "quando": "2026-11-21T13:31:00", "tipo": "decisione", "attore": "p-01", "step": "approva",
     "input": {"proposta_id": "prop-001"}, "output": {"task_id": "task-001"}, "motivo": None},
]
