"""Trascrizione finta nel formato di ElevenLabs Speech-to-Text, senza chiamare nessuna API.

Uso:
    .venv/bin/python scripts/finta_trascrizione.py dati/audio/riu-006.copione.md

Legge un copione scritto come una minuta (`**Nome:** testo`; `[laughter]` nel testo è un evento audio)
e scrive accanto `riu-006.json`, il file che Agentonic accetta al caricamento (vedi `backend/voce.py`):
- `stt`: la risposta come la darebbe ElevenLabs con `diarize=true`: parole con orari in secondi e
  `speaker_0`, `speaker_1`, ... al posto dei nomi. Gli orari sono stimati, sempre uguali a ogni esecuzione.
- `parlanti`: chi è chi, solo per i nomi che esistono in `dati/azienda.json`. Gli altri restano
  `speaker_N`, come quando chi prepara la riunione non sa chi è un partecipante esterno.
Quando ci sono i crediti, si mette in `stt` la risposta vera e il resto non cambia.
"""

import json
import re
import sys
from pathlib import Path

RADICE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RADICE))

from backend.analisi.ingestione import segmenta  # noqa: E402

_PEZZI = re.compile(r"\[([^\]]+)\]|\S+")   # «[laughter]» è un evento audio, il resto sono parole
PAUSA_TRA_TURNI = 0.7


def trascrizione(copione: str, nomi_noti: set[str]) -> dict:
    doc = segmenta(copione)
    speaker: dict[str, str] = {}   # nome -> speaker_N, in ordine di prima apparizione
    parole, testi, t = [], [], 0.4
    for seg in doc.segmenti:
        sid = speaker.setdefault(seg.speaker, f"speaker_{len(speaker)}")
        for m in _PEZZI.finditer(seg.testo):
            if m[1]:
                parole.append({"text": f"({m[1]})", "start": round(t, 2), "end": round(t + 1.2, 2),
                               "type": "audio_event", "speaker_id": sid, "logprob": 0.0})
                t += 1.2
                continue
            durata = 0.12 + 0.06 * len(m[0])
            parole.append({"text": m[0], "start": round(t, 2), "end": round(t + durata, 2),
                           "type": "word", "speaker_id": sid, "logprob": 0.0})
            t += durata
            parole.append({"text": " ", "start": round(t, 2), "end": round(t + 0.08, 2),
                           "type": "spacing", "speaker_id": sid, "logprob": 0.0})
            t += 0.08
        parole.pop()   # niente spazio dopo l'ultima parola del turno
        t += PAUSA_TRA_TURNI
        testi.append(seg.testo)
    return {
        "meta": {"id": doc.id, "progetto": doc.progetto_id, "titolo": doc.titolo, "data": doc.data,
                 "ora_inizio": doc.ora_inizio, "partecipanti": doc.partecipanti},
        "parlanti": {sid: nome for nome, sid in speaker.items() if nome in nomi_noti},
        "stt": {"language_code": "eng", "language_probability": 0.99,
                "text": " ".join(testi), "words": parole},
    }


def main() -> None:
    copione = Path(sys.argv[1])
    azienda = json.loads((RADICE / "dati" / "azienda.json").read_text(encoding="utf-8"))
    dati = trascrizione(copione.read_text(encoding="utf-8"), {p["nome"] for p in azienda["persone"]})
    uscita = copione.with_name(f"{dati['meta']['id']}.json")
    uscita.write_text(json.dumps(dati, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{uscita}: {len(dati['stt']['words'])} elementi, parlanti {dati['parlanti']}")


if __name__ == "__main__":
    main()
