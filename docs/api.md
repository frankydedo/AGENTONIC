# API del Company Brain (contratto I4 + I5)

Owner: Pietro. Si cambia solo dopo averne parlato (CLAUDE.md §3). Modelli in `backend/modelli.py`.
Fase 0: le risposte arrivano da `backend/esempi.py` (dati di riu-001); dopo M1 dal db.

Avvio: `python3.12 -m venv .venv && .venv/bin/pip install -r requirements.txt && .venv/bin/uvicorn backend.app:app --reload`
Schema completo e prove dal browser: `http://127.0.0.1:8000/docs`.

## Identità (I5)
- La persona attiva arriva **solo** dalla sessione: header `X-Persona: p-04` **oppure** cookie
  `persona` impostato da `POST /sessione`. Mai dal testo di una domanda o dal corpo di una richiesta.
- `EventSource` non manda header: per gli avvisi la UI chiama prima `POST /sessione` (cookie) e
  usa la stessa origine (proxy di Vite verso `:8000`).
- Senza sessione → `401`. Non membro del progetto o azione da manager fatta da altri → `403`.

## Endpoint

| Metodo e percorso | Chi | Corpo / parametri | Risposta |
|---|---|---|---|
| `POST /sessione` | tutti | `{"persona_id": "p-01"}` | `Persona`, imposta il cookie |
| `GET /persone` | tutti | - | `Persona[]` (per il selettore) |
| `GET /progetti/{id}` | membri | - | `Progetto` |
| `POST /riunioni?progetto_id=prj-01` | manager | multipart `file` (minuta `.md`) | `{documento_id, proposte, avvisi}` |
| `POST /documenti?progetto_id=prj-01` | manager | multipart `file` (integrativo) | come sopra |
| `GET /segmenti/{id}` | membri | id tipo `riu-001%23s003` (`#` codificato) | `Citazione` |
| `GET /proposte?progetto_id=prj-01&stato=in_attesa` | manager | - | `Proposta[]` |
| `POST /proposte/{id}/approva` | manager | `{"aree": ["budget"] \| null, "nota": null}` | `Proposta` approvata |
| `POST /proposte/{id}/rifiuta` | manager | `{"nota": null}` | `Proposta` rifiutata |
| `GET /avvisi?progetto_id=prj-01` | membri | SSE | eventi `avviso` con un `Avviso` JSON |
| `POST /avvisi/{id}/risolvi` | manager | - | `Avviso` |
| `GET /progetti/{id}/todo` | membri | - | `Task[]` visibili alla persona |
| `GET /persone/{id}/todo-oggi` | la persona stessa | - | `{persona_id, data, accettata, task: Task[]}` |
| `POST /todo-oggi/accetta` | la persona | `{"task_ids": ["task-002"]}` (ordine scelto) | to-do del giorno |
| `POST /domande` | membri | `{"progetto_id": "prj-01", "testo": "..."}` | `Risposta` |
| `POST /eventi/simula` | manager | `{"progetto_id", "tipo", "descrizione"}` | `Avviso` |
| `GET /registro?progetto_id=prj-01` | manager | - | passi del registro |

## Regole che valgono per tutti gli endpoint
- Avvisi: prima dell'approvazione (`solo_manager: true`) li riceve solo il manager.
- Domande: si cerca solo tra task e fatti **approvati**, filtrati con `puo_vedere()` **prima** del
  modello. `non_lo_so` e `non_autorizzato` hanno lo **stesso testo neutro**
  («Non ho informazioni che puoi vedere su questo. Puoi chiedere a Giulia Ferraris.»).
  Se `esito == "risposta"` le `citazioni` non sono mai vuote.
- Le citazioni le costruisce il codice dagli id dei segmenti; la UI le rende cliccabili con
  `GET /segmenti/{id}`.

## Esempi
Per i JSON di esempio (fixtures di `web/`), con il server acceso:
```
curl -s localhost:8000/proposte?progetto_id=prj-01 -H 'X-Persona: p-01'
curl -s -X POST localhost:8000/domande -H 'X-Persona: p-02' -H 'content-type: application/json' \
     -d '{"progetto_id":"prj-01","testo":"Quanto budget resta?"}'   # risposta con citazione
# stessa domanda con X-Persona: p-04 -> risposta neutra
```
Persone utili in demo: `p-01` Giulia (manager), `p-02` Marco Bianchi (sviluppo + budget),
`p-04` Sara Colombo (solo sviluppo), `p-08` Paola Greco (fuori dal progetto).

## Da allineare con Franky
- Chi trasforma il `.md` in `Documento` (proposta: `segmenta(testo) -> Documento` di F2, chiamata
  da `POST /riunioni`).
- Firme: `analizza_documento(doc: Documento, contesto: ContestoProgetto) -> RisultatoAnalisi` (I2),
  `rispondi(domanda: str, persona: Persona, voci: list[Voce]) -> Risposta` (I3).
- Formato di `TaskEstratto.dipende_da` (titoli o id).
