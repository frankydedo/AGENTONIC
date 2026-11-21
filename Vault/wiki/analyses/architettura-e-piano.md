---
type: analysis
updated: 2026-11-21
sources: [raw/2026-11-21-solution.md]
confidence: media
tags: [architettura, stack, contratti, divisione-del-lavoro, tappe]
---
# Architettura e piano di lavoro

Come costruiamo la [soluzione](../concepts/soluzione-company-brain.md): architettura, stack,
contratti, chi fa cosa, tappe ([fonte](../../raw/2026-11-21-solution.md)). Quasi tutto è
**[PROPOSTO]**, cioè una base adottata che si può aggiustare parlandone. Fanno eccezione la
consegna e la divisione dei ruoli, che sono decise.

## Architettura [PROPOSTO]
- Documento → (voce: ElevenLabs | faster-whisper | mock) → **segmenti** `{chi, inizio, fine, testo}`.
- Step: blocchi (codice) → estrazione (modello) → abbinamento persone (codice) → lacune
  (codice + modello) → incongruenze (codice + modello) → differenze rispetto alla lista (codice).
  Dopo l'ingestion gli agenti specializzati girano in parallelo ([decisione](../log.md)).
- Proposte → **approvazione del manager** → lista del progetto → to-do giornaliere.
- Trasversali: «Chiedi al Brain» con filtro per competenza, avvisi proattivi via SSE, registro di tutto.
- **Contesto**: un'ora di riunione ≈ 15-20k token, più dei 16k di Qwen locale → blocchi «parte x/X».
- **Memoria scalabile**: partizione per ruolo e stato → ricerca FTS5 → collegamenti tra elementi;
  embedding e grafi solo dopo.
- Modello e voce sostituibili, con una modalità **mock** a risposte registrate (sviluppo e piano B).

## Stack [PROPOSTO]
| Livello | Scelta |
|---|---|
| Backend | Python 3.12, FastAPI, SSE, Pydantic |
| Dati | SQLite + FTS5 |
| Modello | API compatibile OpenAI; in demo Qwen3-30B-A3B su LM Studio nell'Air ([LLM locale](llm-locale.md)), cloud di riserva da scegliere; mock per sviluppo e test |
| Voce | ElevenLabs (STT con `diarize=true`, TTS); alternativa locale faster-whisper |
| Frontend | React 19, TypeScript, Vite, Tailwind v4, Motion, React Flow, lettore audio sincronizzato |
| Dati di prova | riunioni sintetiche in italiano, audio con voci ElevenLabs; azienda di automazione industriale, ~8 persone |

## Contratti [PROPOSTO, bozza]
- Contratto in `backend/modelli.py` (Pydantic v2), **ancora da scrivere**: la bozza della fonte
  conta poco. Si cambia solo dopo averne parlato.
- Scelte di partenza:
  - id leggibili con prefisso (`riu-001#s012`, `task-001`, ...) e campi in italiano;
  - il segmento (un turno di parola) è l'unità che si cita;
  - output del modello `EstrazioneRiunione` (task, aggiornamenti, fatti, punti oscuri, sconosciuti);
  - sicurezza alta/media/bassa, con `bassa` → punto oscuro;
  - attributi dei fatti da lista chiusa;
  - proposte e avvisi tipizzati;
  - 5 stati dei task;
  - esiti `risposta | non_lo_so | non_autorizzato`, con lo stesso testo neutro per gli ultimi due;
  - una sola funzione `puo_vedere()` per tutti i permessi.
- API iniziali: `POST /riunioni`, proposte (lista/approva/rifiuta), `GET /avvisi` (SSE), to-do di
  progetto e del giorno, `POST /domande`, `POST /eventi/simula`, `GET /registro`.

## Divisione del lavoro
| Persona | Area | File |
|---|---|---|
| Franky (AI) | prompt, estrazione, abbinamento, lacune, incongruenze, domande, valutazione; le 5 riunioni sintetiche con trappole e risultati attesi | `backend/analisi/`, `backend/domande.py`, `backend/llm.py`, `dati/riunioni/`, `dati/attese/` |
| Pietro | backend, database, dati dell'azienda, to-do e dipendenze, simulatore di eventi, ElevenLabs, verifica automatica | `backend/app.py`, `db.py`, `schema.sql`, `todo.py`, `eventi.py`, `voce.py`, `dati/azienda.json`, `scripts/demo_check.py` |
| Mauro | interfaccia, README, descrizione, pitch | `web/`, `docs/`, `README.md` |

**Trappole nelle riunioni sintetiche**:
- un task chiaro e assegnato, e uno senza responsabile;
- due «Marco»;
- una persona o un sistema mai citati prima;
- una scadenza che cambia tra due riunioni;
- un dato di budget riservato, e uno con due aree (`fornitori` + `budget`);
- una dipendenza tra persone diverse;
- un «ho fatto questo» nella riunione di fine giornata;
- un evento esterno.

Stato: bozza di `dati/azienda.json` (8 persone, progetto `prj-01`) e `dati/riunioni/riu-001.md`
(kick-off) scritte da Franky il 21/11, da rivedere con Pietro.

## Priorità e tappe (consegna alle **17:00**, ultimo commit alle **16:50**)
- **P0** = i sette controlli: minuta di testo → estrazione con citazioni e punti oscuri →
  approvazione → to-do smistate; un'incongruenza; domande filtrate e «non lo so».
- **P1**: audio ElevenLabs, to-do del mattino, riunione di fine giornata, brief a voce.
- **P2**: ascolto dal vivo, eventi esterni, ricadute a catena, widget trascinabili.

| Ora | Tappa |
|---|---|
| 14:15 | **M1**: tutto collegato con dati finti |
| 15:30 | **M2**: P0 con il modello vero, i 7 controlli passano; altrimenti la voce si salta |
| 16:15-16:50 | blocco delle funzionalità: bug, prova del pitch, video, README, descrizione, merge su `main` |

## Da verificare
- Accesso della giuria alla repo; competenze definitive delle persone; modello cloud di riserva;
  crediti ElevenLabs; raggiungibilità di LM Studio dalla rete della sede.
- Quale branch registra il portale: la fonte prevede `develop` con merge su `main` prima della
  consegna, ma il regolamento non lo dice ([Consegna e valutazione](../concepts/consegna-e-valutazione.md)).

## Collegamenti
- [Soluzione Company Brain](../concepts/soluzione-company-brain.md)
- [LLM locale](llm-locale.md)
- [Consegna e valutazione](../concepts/consegna-e-valutazione.md)
- [Overview](../overview.md)
