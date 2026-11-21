"""Simulatore del percorso della demo. STRUMENTO DI DEMO E TEST: il backend non lo usa.

Simula ciò che fa il backend fra un documento e l'altro (vedi `dati/attese/README.md` §2):
il manager approva tutte le proposte in ordine (tranne in riu-003 il secondo pannello HMI, che
rifiuta); gli id `task-001…` e `fat-001…` si assegnano in ordine di approvazione; aggiorna/chiudi
si applicano ai task; citazioni e aree confermate passano dalla proposta alla voce approvata.
Lo usano `tests/test_workflow.py` e `scripts/demo_brain.py`.

Il PDF `doc-001` si carica DOPO riu-005: caricato prima, prenderebbe gli id task-009/010 e
fat-009… e gli aggiornamenti registrati di riu-003…riu-005 (che citano task-009) punterebbero
al task sbagliato.
"""

from __future__ import annotations

import json
from pathlib import Path

from backend.analisi import analizza_documento
from backend.analisi.ingestione import segmenta
from backend.analisi.ingestione_pdf import segmenta_pdf
from backend.llm import Config
from backend.modelli import ContestoProgetto, Documento, Fatto, Persona, Progetto, Proposta, RisultatoAnalisi, Task

DATI = Path(__file__).resolve().parent.parent.parent / "dati"
RIUNIONI = ["riu-001", "riu-002", "riu-003", "riu-004", "riu-005"]
TITOLO_PDF = "Capitolato tecnico del cliente Pastificio Valsangone per il revamping della linea 3"
DATA_PDF = "2026-11-18"          # data del capitolato (inviato dal cliente), caricato dopo riu-005
# (documento, tipo di proposta, testo nel contenuto): proposte che il manager rifiuta
RIFIUTATE = [("riu-003", "nuovo_fatto", "second hmi panel")]


def carica_azienda() -> tuple[Progetto, list[Persona], list[Persona]]:
    """-> progetto prj-01, membri, persone dell'azienda fuori dal progetto."""
    az = json.loads((DATI / "azienda.json").read_text(encoding="utf-8"))
    tutte = [Persona(**p) for p in az["persone"]]
    prj = Progetto(**az["progetti"][0])
    return prj, [p for p in tutte if p.id in prj.membri], [p for p in tutte if p.id not in prj.membri]


def documenti_demo() -> list[Documento]:
    """riu-001 … riu-005 (minute) e poi il PDF doc-001."""
    docs = [segmenta((DATI / "riunioni" / f"{r}.md").read_text(encoding="utf-8")) for r in RIUNIONI]
    pdf = (DATI / "documenti" / "doc-001.pdf").read_bytes()
    docs.append(segmenta_pdf(pdf, "doc-001", TITOLO_PDF, DATA_PDF, "prj-01"))
    return docs


def _rifiutata(p: Proposta) -> bool:
    testo = json.dumps(p.contenuto, ensure_ascii=False).lower()
    return any(p.documento_id == d and p.tipo == t and s in testo for d, t, s in RIFIUTATE)


class Simulatore:
    """La memoria del progetto (solo voci approvate) come la terrebbe il backend."""

    def __init__(self) -> None:
        self.progetto, self.membri, self.altri = carica_azienda()
        self.task: dict[str, Task] = {}
        self.fatti: dict[str, Fatto] = {}
        self.rif_a_id: dict[str, str] = {}
        self.documenti: list[str] = []

    def contesto(self) -> ContestoProgetto:
        return ContestoProgetto(progetto=self.progetto, persone=self.membri, persone_azienda=self.altri,
                                task=list(self.task.values()), fatti=list(self.fatti.values()),
                                documenti_precedenti=list(self.documenti))

    def approva_tutto(self, risultato: RisultatoAnalisi) -> dict[str, list[str]]:
        """Il manager decide le proposte in ordine. -> {"approvate": [id voce], "rifiutate": [titoli]}."""
        esito: dict[str, list[str]] = {"approvate": [], "rifiutate": []}
        for p in risultato.proposte:
            c = p.contenuto
            if _rifiutata(p):
                esito["rifiutate"].append(str(c.get("soggetto") or c.get("titolo")))
                continue
            aree = list(p.aree_confermate if p.aree_confermate is not None else p.aree_proposte)
            if p.tipo == "nuovo_task":
                tid = f"task-{len(self.task) + 1:03d}"
                self.rif_a_id[c["rif"]] = tid
                campi = {k: v for k, v in c.items() if k not in ("rif", "aree", "dipende_da")}
                self.task[tid] = Task(id=tid, **campi, aree=aree, citazioni=p.citazioni,
                                      dipende_da=[self.rif_a_id.get(d, d) for d in c.get("dipende_da", [])])
                esito["approvate"].append(tid)
            elif p.tipo == "nuovo_fatto":
                fid = f"fat-{len(self.fatti) + 1:03d}"
                campi = {k: v for k, v in c.items() if k != "aree"}
                self.fatti[fid] = Fatto(id=fid, **campi, aree=aree, citazioni=p.citazioni)
                esito["approvate"].append(fid)
            else:
                task = self.task[c["task_id"]]
                if p.tipo == "chiudi_task":
                    task.stato = c["valore"]
                else:
                    campo = "assegnatario_id" if c["campo"] == "assegnatario" else c["campo"]
                    setattr(task, campo, c["valore"])
                task.citazioni = task.citazioni + p.citazioni
                esito["approvate"].append(task.id)
        return esito

    def analizza(self, doc: Documento, config: Config) -> RisultatoAnalisi:
        risultato = analizza_documento(doc, self.contesto(), config)
        self.documenti.append(doc.id)
        return risultato


def esegui_percorso(config: Config) -> tuple[Simulatore, list[tuple[Documento, RisultatoAnalisi, dict]]]:
    """Tutto il percorso: per ogni documento analisi e poi decisioni del manager.
    -> (simulatore con la memoria finale, [(documento, risultato, esito delle decisioni)])."""
    sim = Simulatore()
    uscita = []
    for doc in documenti_demo():
        r = sim.analizza(doc, config)
        uscita.append((doc, r, sim.approva_tutto(r)))
    return sim, uscita
