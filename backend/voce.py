"""Voce (P10): dalla risposta di ElevenLabs Speech-to-Text a un `Documento` con segmenti a orari.

Codice deterministico: nessun modello e nessuna rete. Legge una risposta già ottenuta, vera o finta
(`scripts/finta_trascrizione.py`). Il file caricato è un JSON con tre parti:
- `meta`: id, progetto, titolo, data, ora_inizio, partecipanti (come l'intestazione di una minuta);
- `parlanti`: chi è chi, es. {"speaker_0": "Giulia Ferraris"}. ElevenLabs riconosce le voci ma non i
  nomi; uno speaker che manca resta «speaker_N» e il Brain lo tratta come una persona sconosciuta;
- `stt`: la risposta di ElevenLabs così com'è (chiamata con `diarize=true`): `words` con `text`,
  `type` (word / spacing / audio_event), `start` e `end` in secondi, `speaker_id`.

Un segmento è un turno di parola: le parole consecutive dello stesso speaker. Gli eventi audio
(«(risate)») e gli spazi si saltano: le parole si uniscono con uno spazio. Tutto il testo, speaker compresi, è un dato:
passa da `neutralizza` come nelle minute.
"""

import json
import math

from backend.analisi.ingestione import (MAX_CARATTERI, DocumentoNonValido, neutralizza, titolo_pulito,
                                        valida_id_e_data)
from backend.modelli import Documento, Segmento


def _riga(testo: object, massimo: int) -> str:
    """Campo corto come dato: neutralizzato, su una riga, troncato."""
    return " ".join(neutralizza(testo).split())[:massimo] if isinstance(testo, str) else ""


def _secondi(valore: object) -> float | None:
    if isinstance(valore, (int, float)) and not isinstance(valore, bool) and math.isfinite(valore) and valore >= 0:
        return float(valore)
    return None


def _turni(parole: list, parlanti: dict) -> list[tuple[str, str, float | None, float | None]]:
    """Parole -> turni (speaker, testo, inizio, fine): si cambia turno quando cambia lo speaker."""
    turni: list[list] = []
    for p in parole:
        if not isinstance(p, dict) or p.get("type", "word") != "word":   # spacing e audio_event no
            continue
        testo = p.get("text") if isinstance(p.get("text"), str) else ""
        sid = p.get("speaker_id") if isinstance(p.get("speaker_id"), str) else "speaker_?"
        if not turni or turni[-1][0] != sid:
            turni.append([sid, [], _secondi(p.get("start")), None])
        turni[-1][1].append(testo)
        turni[-1][3] = _secondi(p.get("end"))
    risultato = []
    for sid, pezzi, inizio, fine in turni:
        testo = " ".join(neutralizza(" ".join(pezzi)).split())   # la punteggiatura è attaccata alle parole
        if testo:
            nome = _riga(parlanti.get(sid), 80) or _riga(sid, 40) or "speaker_?"
            risultato.append((nome, testo, inizio, fine if fine is None or inizio is None or fine >= inizio else None))
    return risultato


def da_elevenlabs(dati: bytes | str) -> Documento:
    """JSON (meta + parlanti + risposta di ElevenLabs) -> `Documento` con segmenti `riu-006#s001`, ..."""
    try:
        radice = json.loads(dati)
    except (ValueError, UnicodeDecodeError):
        raise DocumentoNonValido("Il file non è un JSON valido.") from None
    if not isinstance(radice, dict):
        raise DocumentoNonValido("La trascrizione deve essere un oggetto JSON con «meta», «parlanti» e «stt».")
    meta, parlanti, stt = (radice.get(k) for k in ("meta", "parlanti", "stt"))
    parlanti = parlanti if isinstance(parlanti, dict) else {}
    if not isinstance(meta, dict):
        raise DocumentoNonValido("Manca «meta» con id, titolo e data della riunione.")
    if not isinstance(stt, dict) or not isinstance(stt.get("words"), list):
        raise DocumentoNonValido("Manca «stt» con l'elenco «words» della risposta di ElevenLabs.")
    for campo in ("id", "titolo", "data"):
        if not meta.get(campo):
            raise DocumentoNonValido(f"Manca il campo «{campo}» in «meta».")
    doc_id = meta["id"]
    valida_id_e_data(doc_id, meta["data"])
    titolo = titolo_pulito(meta["titolo"])

    turni = _turni(stt["words"], parlanti)
    if not turni:
        raise DocumentoNonValido("Nessuna parola trovata nella trascrizione.")
    segmenti = [
        Segmento(id=f"{doc_id}#s{n:03d}", documento_id=doc_id, speaker=chi, testo=testo, inizio=inizio, fine=fine)
        for n, (chi, testo, inizio, fine) in enumerate(turni, 1)
    ]
    if sum(len(s.testo) for s in segmenti) > MAX_CARATTERI:
        raise DocumentoNonValido(f"Trascrizione troppo grande (massimo {MAX_CARATTERI} caratteri di testo).")
    partecipanti = meta.get("partecipanti")
    if not isinstance(partecipanti, list):
        partecipanti = list(parlanti.values())
    return Documento(
        id=doc_id,
        progetto_id=_riga(meta.get("progetto"), 40),
        tipo="riunione",
        formato="trascrizione",   # diventa «audio» quando c'è anche il file da ascoltare
        titolo=titolo,
        data=meta["data"],
        ora_inizio=_riga(meta.get("ora_inizio"), 20) or None,
        partecipanti=[p for p in (_riga(x, 80) for x in partecipanti) if p],
        segmenti=segmenti,
    )
