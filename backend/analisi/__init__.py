"""Workflow di analisi dei documenti (I2, F5 + F12). Owner: Franky. Flusso in `docs/analisi.md`.

ingestione (conteggio) -> persone.abbina_speaker -> tre estrattori IN PARALLELO (task, fatti,
lacune) -> estrazione.unisci -> proposte.in_proposte -> incongruenze.trova_incongruenze.

Il workflow propone soltanto: non scrive nulla e non assegna id (li assegna il backend).
Fail closed per agente: se un estrattore fallisce, gli altri proseguono e il manager riceve un
punto oscuro «l'analisi di ... non è riuscita». Nessuna eccezione esce per errori del modello.
Nei passi del registro solo id e conteggi, mai testo dei documenti.
"""

from __future__ import annotations

import os
import re
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

from backend.analisi import estrazione, incongruenze, persone, proposte
from backend.llm import Config
from backend.modelli import (
    Avviso, ContestoProgetto, Documento, EstrazioneRiunione, PassoRegistro, RisultatoAnalisi,
)

_ESTRATTORI = ("task", "fatti", "lacune")       # ordine fisso: estrazione.estrai_<nome>

# Temi dei punti oscuri generati dal codice: (frasi fisse scritte da `proposte.in_proposte`, parole
# che in un punto oscuro del modello dicono che parla della stessa cosa). Vedi `_togli_doppi`.
_TEMI = (
    (("non ha un responsabile", "è ambiguo", "non è un membro del progetto"),          # responsabile
     re.compile(r"\b(chi|responsabil\w*|assegnat\w*|incaric\w*|ambigu\w*|omonim\w*|occup\w*)\b")),
    (("non è una data chiara",),                                                        # data
     re.compile(r"\b(data|date|scadenz\w*|quando|entro|termine)\b")),
)


def _parallelo() -> int:
    """Estrazioni insieme: `LLM_PARALLELO` (default 3; con LM Studio 1). Un valore sbagliato non
    ferma il workflow: vuoto -> 3; non numerico o <= 0 -> 1 (una alla volta va bene con ogni provider)."""
    grezzo = os.environ.get("LLM_PARALLELO", "").strip()
    if not grezzo:
        return 3
    try:
        return max(1, int(grezzo))
    except ValueError:
        return 1


def _passo(step: str, doc: Documento, **campi) -> PassoRegistro:
    return PassoRegistro(quando=datetime.now(), tipo="workflow", attore="brain", step=step,
                         documento_id=doc.id, **campi)


def _estrai(funzione, nome: str, doc: Documento, contesto: ContestoProgetto, config: Config):
    """Un estrattore; un errore inatteso diventa un passo `errore` (fail closed), mai un'eccezione."""
    try:
        return funzione(doc, contesto, config)
    except Exception as e:  # noqa: BLE001 - il workflow non deve mai cadere per un agente
        return None, [_passo(f"estrazione_{nome}", doc, provider=config.provider, esito="errore",
                             input={"documento_id": doc.id},
                             motivo=f"Errore inatteso nell'agente ({type(e).__name__}).")]


def _togli_doppi(avvisi: list[Avviso], estr: EstrazioneRiunione) -> tuple[list[Avviso], int]:
    """Toglie i punti oscuri del modello che ripetono un punto oscuro generato dal codice.

    È un doppione solo se cita gli stessi segmenti E parla della stessa cosa (responsabile ambiguo o
    mancante, data non chiara: `_TEMI`). Citare gli stessi segmenti non basta: sullo stesso paragrafo
    il modello può segnalare altro (doc-001 p01s05, la «velocità nominale»). Nel dubbio si tiene.
    Quelli del codice vengono prima in `in_proposte` e si tengono sempre; del modello si toglie anche
    la ripetizione identica (stesso testo, stessi segmenti)."""
    dal_modello = {po.descrizione.strip() for po in estr.punti_oscuri}
    temi_del_codice: dict[frozenset[str], set[int]] = {}      # segmenti -> temi già segnalati dal codice
    visti: set[tuple[str, frozenset[str]]] = set()
    tenuti: list[Avviso] = []
    for a in avvisi:
        if a.tipo == "punto_oscuro":
            chiave = frozenset(c.segmento_id for c in a.citazioni)
            if a.testo in dal_modello:
                testo = persone.normalizza(a.testo)
                if (a.testo, chiave) in visti or any(_TEMI[i][1].search(testo)
                                                     for i in temi_del_codice.get(chiave, ())):
                    continue
                visti.add((a.testo, chiave))
            else:
                temi_del_codice.setdefault(chiave, set()).update(
                    i for i, (frasi, _) in enumerate(_TEMI) if any(f in a.testo for f in frasi))
        tenuti.append(a)
    return tenuti, len(avvisi) - len(tenuti)


def analizza_documento(doc: Documento, contesto: ContestoProgetto,
                       config: Config | None = None) -> RisultatoAnalisi:
    """Documento già segmentato + contesto del progetto -> proposte, avvisi e passi del registro."""
    cfg = config or Config.da_ambiente()
    passi: list[PassoRegistro] = [
        _passo("ingestione", doc, input={"documento_id": doc.id, "tipo": doc.tipo, "formato": doc.formato},
               output={"segmenti": len(doc.segmenti)}),
    ]

    # 1. persone (codice): speaker -> persona_id
    doc = persone.abbina_speaker(doc, contesto.persone)
    abbinati = sum(1 for s in doc.segmenti if s.persona_id)
    passi.append(_passo("persone", doc, input={"documento_id": doc.id, "segmenti": len(doc.segmenti)},
                        output={"speaker_abbinati": abbinati, "speaker_non_abbinati": len(doc.segmenti) - abbinati}))

    # 2. tre agenti di estrazione in parallelo; risultati raccolti in ordine fisso
    with ThreadPoolExecutor(max_workers=_parallelo()) as pool:
        futuri = [pool.submit(_estrai, getattr(estrazione, f"estrai_{nome}"), nome, doc, contesto, cfg)
                  for nome in _ESTRATTORI]
        risultati = [f.result() for f in futuri]
    estratti = {}
    falliti: list[str] = []
    for nome, (dati, passi_agente) in zip(_ESTRATTORI, risultati):
        estratti[nome] = dati
        passi += passi_agente
        if dati is None:
            falliti.append(nome)
    estr = estrazione.unisci(estratti["task"], estratti["fatti"], estratti["lacune"])
    titolati = persone.sconosciuti_con_titolo(doc, contesto.persone, estr.sconosciuti)   # regola, non modello
    if titolati:
        estr = estr.model_copy(update={"sconosciuti": estr.sconosciuti + titolati})

    # 3. proposte e avvisi (codice)
    lista_proposte, avvisi, passo = proposte.in_proposte(estr, doc, contesto)
    passi.append(passo)
    avvisi, doppi = _togli_doppi(avvisi, estr)

    # 4. incongruenze (regole + modello)
    try:
        nuovi, passi_inc = incongruenze.trova_incongruenze(lista_proposte, doc, contesto, cfg)
    except Exception as e:  # noqa: BLE001 - fail closed: nessuna incongruenza, ma il passo lo dice
        nuovi, passi_inc = [], [_passo("incongruenze", doc, provider=cfg.provider, esito="errore",
                                       input={"documento_id": doc.id},
                                       motivo=f"Errore inatteso ({type(e).__name__}).")]
    avvisi += nuovi
    passi += passi_inc
    if any(pa.esito == "errore" for pa in passi_inc):
        falliti.append("incongruenze")   # il manager deve sapere che il controllo non è completo

    # Il manager deve sapere che il risultato è incompleto
    for nome in falliti:
        avvisi.append(Avviso(progetto_id=contesto.progetto.id, documento_id=doc.id, tipo="punto_oscuro",
                             testo=f"L'analisi di {nome} non è riuscita: il documento va ricontrollato a mano.",
                             solo_manager=True))

    passi.append(_passo("risultato", doc, input={"documento_id": doc.id},
                        output={"proposte": dict(Counter(p.tipo for p in lista_proposte)),
                                "avvisi": dict(Counter(a.tipo for a in avvisi)),
                                "punti_oscuri_doppi_tolti": doppi, "analisi_non_riuscite": falliti},
                        esito="errore" if falliti else "ok",
                        motivo=f"Analisi non riuscita: {', '.join(falliti)}." if falliti else None))
    return RisultatoAnalisi(proposte=lista_proposte, avvisi=avvisi, passi=passi)
