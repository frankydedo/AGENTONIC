"""Cervello finto per i test del backend: nessun modello, nessuna rete, risultati fissi.

Sostituisce `analizza_documento` (I2) e `rispondi` (I3) di Franky nei test di `tests/`, così il
backend si prova da solo anche mentre il workflow vero cambia. La segmentazione è quella vera.
"""

from datetime import datetime

from backend.analisi.ingestione import citazione
from backend.modelli import (Avviso, Citazione, ContestoProgetto, Documento, PassoRegistro, Persona, Proposta,
                             RisultatoAnalisi, Risposta, Voce)

# (titolo, assegnatario_id, scadenza, aree, segmenti, sicurezza, dipende_da) — da dati/attese/riu-001.md
_TASK_RIU_001 = [
    ("Preparare il primo SAL per il cliente", "p-05", "2026-12-15", ["commerciale"], [2], "alta", []),
    ("Quadro elettrico cablato e pronto per il collaudo in officina", "p-03", "2026-12-10", ["sviluppo"], [5, 6], "alta", []),
    ("Ordinare gli inverter a Elettrotecnica Piemonte", "p-06", "2026-11-18", ["fornitori"], [7], "alta", []),
    ("Preparare la lista dei tag del PLC", None, "2026-11-25", ["sviluppo"], [9, 10], "bassa", []),
    ("Schermate della nuova HMI", "p-04", "2026-12-04", ["sviluppo"], [11, 12], "alta", ["Preparare la lista dei tag del PLC"]),
    ("Sopralluogo sulla linea dal cliente", "p-07", "2026-11-19", ["sviluppo"], [13], "alta", []),
    ("Aggiornare il manuale d'uso per gli operatori", None, "2027-01-20", ["generale"], [14, 15], "bassa", []),
]
# (soggetto, attributo, valore, aree, segmenti)
_FATTI_RIU_001 = [
    ("progetto", "scadenza", "collaudo presso il cliente entro il 2027-01-20", ["generale"], [1]),
    ("progetto", "budget", "48.000 € di budget interno approvato, 12.500 € già impegnati per la progettazione", ["budget"], [3]),
    ("PLC", "decisione", "Siemens S7-1500 al posto del vecchio S7-300; il programma si riscrive", ["sviluppo"], [4, 5]),
    ("inverter", "fornitore", "Elettrotecnica Piemonte, preventivo 6.200 €, consegna in tre settimane dall'ordine", ["fornitori", "budget"], [7]),
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
                 contenuto={"titolo": titolo, "assegnatario_id": chi, "scadenza": scad, "dipende_da": dip},
                 citazioni=cita(numeri))
        for titolo, chi, scad, aree, numeri, sic, dip in _TASK_RIU_001
    ] + [
        Proposta(progetto_id=prj, documento_id=doc.id, tipo="nuovo_fatto", aree_proposte=aree,
                 contenuto={"soggetto": sogg, "attributo": attr, "valore": val}, citazioni=cita(numeri))
        for sogg, attr, val, aree, numeri in _FATTI_RIU_001
    ]
    avvisi = [
        Avviso(progetto_id=prj, documento_id=doc.id, tipo="punto_oscuro", citazioni=cita([9, 10]), aree=["sviluppo"],
               testo="«Marco» è ambiguo: nel progetto ci sono Marco Bianchi e Marco Rinaldi. "
                     "Chi prepara la lista dei tag del PLC?"),
        Avviso(progetto_id=prj, documento_id=doc.id, tipo="punto_oscuro", citazioni=cita([14]), aree=["generale"],
               testo="L'aggiornamento del manuale d'uso per gli operatori non ha un responsabile."),
    ]
    passi = [PassoRegistro(quando=datetime.now(), tipo="workflow", attore="brain", step="estrazione",
                           provider="mock", modello="finto-dei-test", input={"parte": "1/1"},
                           output={"proposte": len(proposte), "avvisi": len(avvisi)})]
    return RisultatoAnalisi(proposte=proposte, avvisi=avvisi, passi=passi)


def rispondi(domanda: str, persona: Persona, voci: list[Voce], manager_nome: str) -> Risposta:
    """Finto di I3: nessun modello, riporta le prime voci trovate con le loro citazioni."""
    if not voci:
        return Risposta(esito="non_lo_so", testo="")
    scelte = voci[:3]
    return Risposta(esito="risposta", testo=" ".join(v.testo for v in scelte),
                    citazioni=[c for v in scelte for c in v.citazioni])
