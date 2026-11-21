"""Cervello finto per i test del backend: nessun modello, nessuna rete, risultati fissi.

Sostituisce `analizza_documento` (I2) e `rispondi_tracciato` (I3) di Franky nei test di `tests/`, così il
backend si prova da solo anche mentre il workflow vero cambia. La segmentazione è quella vera.
"""

import re
from datetime import datetime

from backend.analisi.ingestione import citazione
from backend.domande import risposta_neutra
from backend.ricerca import STOP
from backend.modelli import (Avviso, Citazione, ContestoProgetto, Documento, PassoRegistro, Persona, Proposta,
                             RisultatoAnalisi, Risposta, Voce)

# (titolo, assegnatario_id, scadenza, aree, segmenti, sicurezza, dipende_da); il rif è «riu-001:t<posizione>»
_TASK_RIU_001 = [
    ("Prepare the first progress report for the client", "p-05", "2026-12-15", ["commerciale"], [2], "alta", []),
    ("Quadro elettrico cablato e pronto per il collaudo in officina", "p-03", "2026-12-10", ["sviluppo"], [5, 6], "alta", []),
    ("Order the inverters from Elettrotecnica Piemonte", "p-06", "2026-11-18", ["fornitori"], [7], "alta", []),
    ("Prepare the PLC tag list", None, "2026-11-25", ["sviluppo"], [9, 10], "bassa", []),
    ("Schermate della nuova HMI", "p-04", "2026-12-04", ["sviluppo"], [11, 12], "alta", ["riu-001:t4"]),
    ("Sopralluogo sulla linea dal cliente", "p-07", "2026-11-19", ["sviluppo"], [13], "alta", []),
    ("Aggiornare il manuale d'uso per gli operatori", None, "2027-01-20", ["generale"], [14, 15], "bassa", []),
]
# (soggetto, attributo, valore, aree, segmenti)
_FATTI_RIU_001 = [
    ("progetto", "scadenza", "acceptance test at the client's site by 2027-01-20", ["generale"], [1]),
    ("progetto", "budget", "€48,000 of approved internal budget, €12,500 already committed for the design", ["budget"], [3]),
    ("PLC", "decisione", "Siemens S7-1500 al posto del vecchio S7-300; il programma si riscrive", ["sviluppo"], [4, 5]),
    ("inverter", "fornitore", "Elettrotecnica Piemonte, preventivo 6,200 €, consegna in tre settimane dall'ordine", ["fornitori", "budget"], [7]),
    ("cliente", "requisito", "un SAL ogni mese, il primo entro il 15 dicembre", ["commerciale"], [2]),
]


def analizza_documento(doc: Documento, contesto: ContestoProgetto) -> RisultatoAnalisi:
    """Finto di I2: per riu-001 restituisce le attese scritte a mano; per altri documenti nulla."""
    if doc.id != "riu-001":
        return RisultatoAnalisi()
    def cita(numeri: list[int]) -> list[Citazione]:
        return [citazione(doc, f"{doc.id}#s{n:03d}") for n in numeri]

    prj = contesto.progetto.id
    proposte = [
        Proposta(progetto_id=prj, documento_id=doc.id, tipo="nuovo_task", aree_proposte=aree, sicurezza=sic,
                 contenuto={"progetto_id": prj, "titolo": titolo, "assegnatario_id": chi, "scadenza": scad,
                            "dipende_da": dip, "rif": f"{doc.id}:t{n}"},
                 citazioni=cita(numeri))
        for n, (titolo, chi, scad, aree, numeri, sic, dip) in enumerate(_TASK_RIU_001, 1)
    ] + [
        Proposta(progetto_id=prj, documento_id=doc.id, tipo="nuovo_fatto", aree_proposte=aree,
                 contenuto={"soggetto": sogg, "attributo": attr, "valore": val}, citazioni=cita(numeri))
        for sogg, attr, val, aree, numeri in _FATTI_RIU_001
    ]
    avvisi = [
        Avviso(progetto_id=prj, documento_id=doc.id, tipo="punto_oscuro", citazioni=cita([9, 10]), aree=["sviluppo"],
               testo="«Marco» è ambiguo: nel progetto ci sono Marco Bianchi e Marco Rinaldi. "
                     "Who is preparing the PLC tag list?"),
        Avviso(progetto_id=prj, documento_id=doc.id, tipo="punto_oscuro", citazioni=cita([14]), aree=["generale"],
               testo="L'aggiornamento del manuale d'uso per gli operatori has no owner."),
    ]
    passi = [PassoRegistro(quando=datetime.now(), tipo="workflow", attore="brain", step="estrazione",
                           provider="mock", modello="finto-dei-test", input={"parte": "1/1"},
                           output={"proposte": len(proposte), "avvisi": len(avvisi)})]
    return RisultatoAnalisi(proposte=proposte, avvisi=avvisi, passi=passi)


def _parole(testo: str) -> set[str]:
    return set(re.findall(r"[^\W\d_]{3,}", testo.lower())) - STOP


def rispondi_tracciato(domanda: str, persona: Persona, voci: list[Voce], manager_nome: str,
                       config=None) -> tuple[Risposta, PassoRegistro]:
    """Finto di `domande.rispondi_tracciato`: nessun modello. Risponde con le voci che hanno parole in
    comune con la domanda; se non ce ne sono, testo neutro (come un modello che dice «non lo so»)."""
    passo = PassoRegistro(quando=datetime.now(), tipo="domanda", attore=persona.id, step="domanda",
                          provider="mock", modello="finto-dei-test", input={"voci": len(voci)})
    scelte = [v for v in voci if _parole(domanda) & _parole(v.testo)][:3]
    if not scelte:
        return risposta_neutra(manager_nome), passo
    return (Risposta(esito="risposta", testo=" ".join(v.testo for v in scelte),
                     citazioni=[c for v in scelte for c in v.citazioni]), passo)
