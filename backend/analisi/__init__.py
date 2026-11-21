"""Workflow di analisi dei documenti (I2). Owner: Franky.

FASE 0, STUB: restituisce le proposte e gli avvisi di esempio di riu-001 (senza id) e la traccia
dei passi, così Pietro può collegare `POST /riunioni` prima del workflow vero (F5, entro M1).
La firma è il contratto e non cambia.
"""

from datetime import datetime

from backend import esempi
from backend.modelli import ContestoProgetto, Documento, PassoRegistro, RisultatoAnalisi


def analizza_documento(doc: Documento, contesto: ContestoProgetto) -> RisultatoAnalisi:
    """Documento già segmentato + contesto del progetto -> proposte, avvisi e passi del registro.

    Il workflow non scrive nulla: propone soltanto. Gli id li assegna il backend al salvataggio.
    """
    ora = datetime.now()
    passi = [
        PassoRegistro(quando=ora, tipo="workflow", attore="brain", step="ingestione", documento_id=doc.id,
                      input={"documento_id": doc.id}, output={"segmenti": len(doc.segmenti)}),
        PassoRegistro(quando=ora, tipo="workflow", attore="brain", step="estrazione", documento_id=doc.id,
                      provider="mock", modello="stub-fase-0", versione_prompt="stub",
                      input={"documento_id": doc.id, "parte": "1/1"},
                      output={"proposte": len(esempi.PROPOSTE), "avvisi": len(esempi.AVVISI)}),
    ]
    if doc.id != "riu-001":   # lo stub conosce solo la riunione di esempio
        passi[-1] = passi[-1].model_copy(update={"output": {}, "motivo": "stub: nessun dato di esempio"})
        return RisultatoAnalisi(passi=passi)

    proposte = [p.model_copy(update={"id": None, "creata_il": None}) for p in esempi.PROPOSTE]
    avvisi = [a.model_copy(update={"id": None, "creato_il": None}) for a in esempi.AVVISI]
    return RisultatoAnalisi(proposte=proposte, avvisi=avvisi, passi=passi)
