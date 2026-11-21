# API del Company Brain (contratto I4 + I5)

Owner: Pietro. Si cambia solo dopo averne parlato (CLAUDE.md §3). Modelli in `backend/modelli.py`.
Il backend è vero (db SQLite) e chiama il cervello di Franky: `backend/analisi` (I2, oggi stub) e
`backend/domande.py` (I3, oggi stub). I test del backend usano il cervello finto di `tests/finti.py`.

```
python3.12 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python scripts/crea_db.py          # db da zero: azienda caricata, memoria vuota
.venv/bin/uvicorn backend.app:app --reload   # http://127.0.0.1:8000/docs
.venv/bin/pytest
```
Il db parte **vuoto**: proposte e avvisi nascono caricando `dati/riunioni/riu-001.md` con `POST /riunioni`.

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
| `POST /riunioni?progetto_id=prj-01` | manager | multipart `file` (minuta `.md`) | `{documento_id, proposte, avvisi, scartate}`; `409` se già caricata, `422` se non è una minuta valida |
| `POST /documenti?progetto_id=prj-01` | manager | multipart `file` (integrativo) | come sopra |
| `GET /segmenti/{id}` | vedi sotto | id tipo `riu-001%23s003` (`#` codificato) | `Citazione`, oppure `404` |
| `GET /proposte?progetto_id=prj-01&stato=in_attesa` | manager | `stato`: `in_attesa` (default), `approvata`, `rifiutata`, `tutte` | `Proposta[]` |
| `POST /proposte/{id}/approva` | manager | `{"aree": [...] \| null, "assegnatario_id": "p-02" \| null, "nota": null}` | `Proposta` approvata; `409` se già decisa |
| `POST /proposte/{id}/rifiuta` | manager | `{"nota": null}` | `Proposta` rifiutata |
| `GET /avvisi?progetto_id=prj-01` | membri | SSE | evento `avviso` (un `Avviso` JSON) per ogni avviso aperto, poi per ogni nuovo o inoltrato |
| `POST /avvisi/{id}/inoltra` | manager | `{"persona_ids": ["p-04"], "aree": ["sviluppo"]}` | `Avviso` con `solo_manager: false` |
| `POST /avvisi/{id}/risolvi` | manager | - | `Avviso` |
| `GET /progetti/{id}/todo` | membri | - | `Task[]` visibili alla persona |
| `GET /persone/{id}/todo-oggi` | la persona stessa | - | `{persona_id, data, accettata, task: Task[]}` |
| `POST /todo-oggi/accetta` | la persona | `{"task_ids": ["task-002"]}` (ordine scelto) | to-do del giorno |
| `POST /domande` | membri | `{"progetto_id": "prj-01", "testo": "..."}` | `Risposta` |
| `POST /eventi/simula` | manager | `{"progetto_id", "tipo", "descrizione"}` | `Avviso` |
| `GET /registro?progetto_id=prj-01` | manager | - | `PassoRegistro[]`, dal più recente |

## Forma di `Proposta.contenuto`
| `tipo` | `contenuto` |
|---|---|
| `nuovo_task` | `{"titolo", "assegnatario_id" \| null, "scadenza" \| null, "dipende_da": [id o titoli di task]}` |
| `nuovo_fatto` | `{"soggetto", "attributo", "valore"}` (`attributo` dalla lista chiusa) |
| `aggiorna_task` | `{"task_id", "campo": stato \| scadenza \| assegnatario \| titolo, "valore"}` |
| `chiudi_task` | `{"task_id"}` |

`assegnatario_id: null` con `sicurezza: "bassa"` è un **punto oscuro** (es. «quale Marco?»): il
manager lo scioglie passando `assegnatario_id` ad `approva`.

## Regole che il backend fa rispettare
- **Memoria**: task, fatti e ricerca contengono solo ciò che il manager ha approvato.
- **Domande**: ricerca tra le voci approvate, filtro `puo_vedere()` **prima** del modello. Dato
  mancante e dato riservato danno la **stessa** risposta: `esito: "non_lo_so"` e il testo
  «Non ho informazioni che puoi vedere su questo. Puoi chiedere a Giulia Ferraris.». L'API non
  restituisce mai `non_autorizzato`: il motivo vero è solo nel registro. Se `esito == "risposta"`
  le `citazioni` non sono mai vuote.
- **Citazioni**: le ricostruisce il backend dai segmenti salvati. Una proposta che non cita un
  segmento vero viene scartata (`scartate`); una risposta che cita segmenti non ricevuti diventa neutra.
- **Segmenti**: il manager li apre tutti; gli altri solo quelli citati da una voce che possono
  vedere. Altrimenti `404`, come per un segmento che non esiste.
- **Avvisi**: li riceve solo il manager finché non li inoltra (`POST /avvisi/{id}/inoltra`); poi vale
  `puo_vedere_avviso()`.
- **Task `bloccato`**: lo calcola il backend dalle dipendenze, non si salva e non lo decide il modello.
- **Registro** (I6): ogni caricamento, passo del workflow, domanda e decisione; lo legge solo il manager.

## Esempi
```
B=localhost:8000; J='content-type: application/json'
curl -s -X POST "$B/riunioni?progetto_id=prj-01" -H 'X-Persona: p-01' -F file=@dati/riunioni/riu-001.md
curl -s "$B/proposte?progetto_id=prj-01" -H 'X-Persona: p-01'
curl -s -X POST $B/proposte/prop-009/approva -H 'X-Persona: p-01' -H "$J" -d '{}'      # il fatto sul budget
curl -s -X POST $B/domande -H 'X-Persona: p-02' -H "$J" -d '{"progetto_id":"prj-01","testo":"Quanto budget resta?"}'
# stessa domanda con X-Persona: p-04 -> risposta neutra
```
Persone utili in demo: `p-01` Giulia (manager), `p-02` Marco Bianchi (sviluppo + budget),
`p-04` Sara Colombo (solo sviluppo), `p-08` Paola Greco (fuori dal progetto).

## Allineato con Franky (21/11)
Modifiche di Franky al contratto, ora implementate nel backend:
- **Segmentazione**: `segmenta(testo) -> Documento` la scrive Franky (F2, `backend/analisi/`) e la
  chiama `POST /riunioni`.
- Firme (stub pronti, Fase 0):
  - `backend.analisi.ingestione.segmenta(testo, progetto_id=None) -> Documento`: solleva
    `DocumentoNonValido` (→ `422`) se manca l'intestazione, non ci sono turni o il testo è troppo grande;
  - `backend.analisi.analizza_documento(doc, contesto) -> RisultatoAnalisi` (I2);
  - `backend.domande.rispondi(domanda, persona, voci, manager_nome) -> Risposta` (I3). `voci` già
    filtrate; con `voci` vuota restituisce il testo neutro senza chiamare il modello. Il motivo vero
    (`non_autorizzato` o dato mancante) lo scrive nel registro chi chiama.
- **Registro (I6)**: `PassoRegistro` in `modelli.py`. `RisultatoAnalisi.passi` contiene la traccia del
  workflow da salvare; caricamenti, decisioni e domande li registra il backend con lo stesso modello.
  `GET /registro` restituisce `PassoRegistro[]`.
- **`TaskEstratto.dipende_da`**: ogni task estratto ha un `rif` temporaneo (`t1`, `t2`);
  `dipende_da` contiene `rif` di questa estrazione o id di task già approvati (`task-004`). Li
  risolve il codice e scarta quelli inesistenti.
- **Id assegnati dal backend**: in `Proposta` e `Avviso` i campi `id` e `creata_il`/`creato_il` sono
  opzionali. Il workflow li lascia `None` e il backend li riempie al salvataggio.
- **Incongruenze con proposte in attesa**: `ContestoProgetto.proposte_in_attesa` (le usa solo
  l'agente delle incongruenze); l'avviso che ne deriva ha `basato_su_proposte` non vuoto e la UI lo
  marca «da proposte non ancora approvate».
- **Sconosciuti**: conta solo chi è membro del progetto. `ContestoProgetto.persone_azienda` contiene
  i dipendenti fuori dal progetto; se il nome è uno di loro, il codice imposta
  `Sconosciuto.persona_id` e l'avviso dice «non fa parte del progetto».
- **Inoltro degli avvisi**: `POST /avvisi/{id}/inoltra` (solo il manager), corpo
  `{"persona_ids": ["p-04"], "aree": ["sviluppo"]}`. Mette `solo_manager: false`; da lì l'avviso lo
  vede chi è in `inoltrato_a` oppure chi ha una delle sue `aree`. La regola è
  `puo_vedere_avviso()` in `modelli.py`, ed è quella che usa `GET /avvisi`.

Note del backend:
- Delle citazioni di proposte, avvisi e risposte conta solo `segmento_id`: il resto lo riscrive il
  backend dai segmenti salvati.
- I passi di `RisultatoAnalisi.passi` finiscono nel registro così come sono; il backend aggiunge
  `caricamento` (chi ha caricato) e `salvataggio` (proposte, avvisi, scartate).
- **Aperto**: come i `rif` temporanei (`t1`, `t2`) arrivano in `Proposta.contenuto.dipende_da`. Oggi
  il backend risolve `dipende_da` per **id o titolo** di un task approvato; ciò che non trova lo
  tiene come testo e il task risulta bloccato.
