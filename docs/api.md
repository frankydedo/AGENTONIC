# API di Agentonic (contratto I4 + I5)

Owner: Pietro. Si cambia solo dopo averne parlato (CLAUDE.md §3). Modelli in `backend/modelli.py`.
Il backend (FastAPI + SQLite) chiama il cervello di Franky: `backend/analisi` (workflow, I2) e
`backend/domande.py` (I3). I test del backend (`tests/test_flusso.py`, `test_caricamento.py`,
`test_api_ui.py`) usano il cervello finto di `tests/finti.py`; `tests/test_percorso_api.py` fa tutto il
percorso della demo con il cervello vero e il provider mock.

```
python3.12 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python scripts/crea_db.py                     # db da zero: azienda caricata, memoria vuota
LLM_PROVIDER=mock .venv/bin/uvicorn backend.app:app     # risposte registrate, nessuna rete
.venv/bin/uvicorn backend.app:app                       # il modello di .env (Qwen su LM Studio); senza .env: mock
.venv/bin/pytest                                        # tutti i test, senza rete
.venv/bin/python scripts/demo_check.py                  # i 7 controlli del brief via API -> «7/7»
```
- Schema completo e prove dal browser: `http://127.0.0.1:8000/docs`.
- All'avvio il server legge `.env` (mai stampato; ciò che è già nell'ambiente vince) e scrive quale
  provider del modello sta usando. Il db è `brain.db` nella root, oppure il percorso in `BRAIN_DB`.
- Il db parte **vuoto**: proposte e avvisi nascono caricando un documento. Con il mock funzionano i
  documenti della demo (`dati/riunioni/riu-001.md` ... `riu-005.md`, poi `dati/documenti/doc-001.pdf`
  con `id=doc-001`), caricati in quest'ordine e approvati in ordine (`dati/attese/README.md`).
- Se cambia lo schema (`backend/schema.sql`) il db va ricreato con `scripts/crea_db.py`.

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
| `GET /persone` | tutti | - | `Persona[]` (per il selettore), con `reparto` |
| `GET /progetti` | sessione | - | `Progetto[]` di cui la persona è membro |
| `GET /progetti/{id}` | membri | - | `Progetto` |
| `POST /riunioni?progetto_id=prj-01` | manager | multipart `file`: minuta `.md` | `EsitoCaricamento` |
| `POST /documenti?progetto_id=prj-01` | manager | multipart `file`: PDF o `.md` integrativo; per i PDF anche `id`, `titolo`, `data` (opzionali) | `EsitoCaricamento` |
| `GET /documenti?progetto_id=prj-01` | membri | - | `Documento[]` senza segmenti |
| `GET /documenti/{id}` | membri | - | `Documento` con i segmenti che la persona può leggere; `404` se non è del suo progetto |
| `DELETE /documenti/{id}` | manager | - | `{documento_id, segmenti, proposte, avvisi}` tolti. Solo se nessuna proposta del documento è approvata, altrimenti `409`; il registro resta |
| `GET /segmenti/{id}` | vedi sotto | id tipo `riu-001%23s003` (`#` codificato) | `Citazione`, oppure `404` |
| `GET /proposte?progetto_id=prj-01&stato=in_attesa` | manager | `stato`: `in_attesa` (default), `approvata`, `rifiutata`, `tutte` | `Proposta[]` |
| `POST /proposte/{id}/approva` | manager | `{"aree": [...] \| null, "modifiche": {...} \| null, "nota": null}` | `Proposta` approvata; `409` se già decisa; `422` se la correzione non è valida |
| `POST /proposte/{id}/rifiuta` | manager | `{"nota": null}` | `Proposta` rifiutata |
| `GET /avvisi?progetto_id=prj-01` | membri | SSE | evento `avviso` (un `Avviso`) per ogni avviso aperto, poi per ogni nuovo o inoltrato; **solo al manager** anche l'evento `passo` (un `PassoRegistro`) per ogni nuovo passo del registro |
| `GET /avvisi?progetto_id=prj-01&flusso=false` | membri | - | `Avviso[]` aperti, in JSON (senza restare in ascolto) |
| `POST /avvisi/{id}/inoltra` | manager | `{"persona_ids": ["p-04"], "aree": ["sviluppo"]}` | `Avviso` con `solo_manager: false` |
| `POST /avvisi/{id}/risolvi` | manager | - | `Avviso` |
| `GET /progetti/{id}/todo` | membri | - | `Task[]` visibili alla persona |
| `GET /persone/{id}/todo-oggi` | la persona; il manager per i membri dei progetti che dirige | - | `{persona_id, data, accettata, task: Task[]}` |
| `POST /todo-oggi/accetta` | la persona | `{"task_ids": ["task-002"]}` (ordine scelto) | to-do del giorno |
| `POST /domande` | membri | `{"progetto_id": "prj-01", "testo": "..."}` | `Risposta` |
| `POST /eventi/simula` | manager | `{"progetto_id", "tipo", "descrizione"}` | `Avviso` di tipo `evento_esterno` |
| `GET /registro?progetto_id=prj-01` | manager | - | `PassoRegistro[]`, dal più recente |

`EsitoCaricamento` = `{documento_id, segmenti, proposte, avvisi, scartate, analisi_non_riuscite}`.

## Caricamento dei documenti
- **Minuta** (`.md`): `id`, `titolo` e `data` stanno nell'intestazione. Se l'intestazione ha anche
  `progetto:` deve essere il progetto in cui si carica: **un progetto diverso si rifiuta con `422`**
  e non si salva nulla (mai un cambio di progetto in silenzio). Senza `progetto:` vale quello scelto.
- **PDF**: non ha intestazione. `id` (default: il prossimo `doc-NNN`), `titolo` (default: il nome del
  file) e `data` (default: oggi) arrivano dalla query. Un PDF vale sempre come documento integrativo,
  anche se caricato su `POST /riunioni`.
- **Un id già usato si rifiuta con `409`**, in qualunque progetto e da qualunque endpoint: il
  documento esistente, i suoi segmenti e le sue proposte non vengono toccati.
- `422` «Documento non valido. …» con il motivo: intestazione mancante, id fuori formato
  (`^[a-z0-9][a-z0-9-]{0,39}$`), data non reale, nessun intervento, file non UTF-8, PDF cifrato o
  senza testo. `413` oltre i 10 MB.
- Se il workflow va in errore in modo inatteso: `502`, e del documento non resta nulla (si può riprovare).

## Forma di `Proposta.contenuto`
| `tipo` | `contenuto` |
|---|---|
| `nuovo_task` | `{"titolo", "assegnatario_id" \| null, "scadenza" \| null, "stato", "rif": "riu-001:t5", "dipende_da": ["task-004", "riu-001:t4"]}` |
| `nuovo_fatto` | `{"soggetto", "attributo", "valore"}` (`attributo` dalla lista chiusa) |
| `aggiorna_task` | `{"task_id", "campo": stato \| scadenza \| assegnatario \| titolo, "valore"}` |
| `chiudi_task` | `{"task_id", "campo": "stato", "valore": "fatto" \| "annullato"}` |

- `assegnatario_id: null` è un **punto oscuro** («quale Marco?», nessun responsabile): l'avviso
  corrispondente ha `proposta_id` (la proposta da correggere) e il manager lo scioglie con `modifiche`.
- **`modifiche`** in `approva`: per un `nuovo_task` le chiavi `titolo`, `assegnatario_id`, `scadenza`
  (data `AAAA-MM-GG`); per un `nuovo_fatto` la chiave `valore`. Si mandano solo i campi cambiati:
  `assegnatario_id` o `scadenza` a `null` vuol dire «tolto». Una chiave non ammessa o un valore non
  valido → `422` e la proposta resta in attesa. Le
  correzioni finiscono nel `contenuto` della proposta approvata e nel registro (chi ha corretto cosa).
- **`rif` e `dipende_da`**: all'approvazione il task prende il `rif` della proposta. Un `dipende_da`
  che è un `rif` (`"riu-001:t4"`) diventa l'id del task quando quella proposta viene approvata; finché
  è in attesa il task risulta `bloccato`; se viene rifiutata la dipendenza cade.
- **Id di task e fatti**: progressivi dentro il progetto, in ordine di approvazione (`task-001`,
  `fat-001`; il secondo progetto parte da `1001`, il terzo da `2001`).

## Regole che il backend fa rispettare
- **Memoria**: task e fatti contengono solo ciò che il manager ha approvato.
- **Domande**: al modello arrivano solo le voci approvate che la persona può vedere
  (`domande.voci_visibili`, cioè `puo_vedere()` **prima** del modello). Dato mancante e dato riservato
  danno la **stessa** risposta: `esito: "non_lo_so"` e il testo «Non ho informazioni che puoi vedere
  su questo. Puoi chiedere a Giulia Ferraris.». L'API non restituisce mai `non_autorizzato`: il
  motivo vero è solo nel registro (`non_autorizzato: …` se nella memoria c'erano voci pertinenti che
  la persona non può vedere, `non_lo_so: …` altrimenti). Se `esito == "risposta"` le `citazioni` non
  sono mai vuote. Nel registro non finisce mai il testo della domanda.
- **Citazioni**: le ricostruisce il backend dai segmenti salvati. Una proposta che non cita un
  segmento vero viene scartata (`scartate`); una risposta che cita segmenti non ricevuti diventa neutra.
- **Segmenti e documenti**: il manager li legge tutti; gli altri solo i segmenti citati da una voce
  che possono vedere o da un avviso inoltrato loro. Altrimenti `404`, come per ciò che non esiste.
- **Avvisi**: li riceve solo il manager finché non li inoltra (`POST /avvisi/{id}/inoltra`); poi vale
  `puo_vedere_avviso()`.
- **Task `bloccato`**: lo calcola il backend dalle dipendenze non ancora chiuse; può anche essere
  dichiarato in riunione e approvato dal manager (`aggiorna_task` con `stato: bloccato`).
- **Registro** (I6): ogni caricamento, passo del workflow, domanda e decisione, senza testo dei
  documenti; lo legge solo il manager.

## Esempi
```
B=localhost:8000; J='content-type: application/json'
curl -s -X POST "$B/riunioni?progetto_id=prj-01" -H 'X-Persona: p-01' -F file=@dati/riunioni/riu-001.md
curl -s "$B/proposte?progetto_id=prj-01" -H 'X-Persona: p-01'
curl -s -X POST $B/proposte/prop-001/approva -H 'X-Persona: p-01' -H "$J" -d '{}'
curl -s -X POST $B/proposte/prop-004/approva -H 'X-Persona: p-01' -H "$J" -d '{"modifiche": {"assegnatario_id": "p-02"}}'
curl -s -X POST $B/domande -H 'X-Persona: p-06' -H "$J" -d '{"progetto_id":"prj-01","testo":"Quanto budget resta?"}'
# stessa domanda con X-Persona: p-04 -> risposta neutra
curl -s -X POST "$B/documenti?progetto_id=prj-01&id=doc-001&data=2026-11-18" -H 'X-Persona: p-01' -F file=@dati/documenti/doc-001.pdf
```
Persone utili in demo: `p-01` Giulia (manager di prj-01), `p-06` Elena Russo (acquisti: fornitori +
budget), `p-02` Marco Bianchi (sviluppo + budget, manager di prj-02), `p-04` Sara Colombo (solo
sviluppo), `p-08` Paola Greco (fuori da prj-01, manager di prj-03).

## Allineato con Franky (21/11)
Modifiche di Franky al contratto, ora implementate nel backend:
- **Segmentazione**: `segmenta(testo) -> Documento` la scrive Franky (F2, `backend/analisi/`) e la
  chiama `POST /riunioni`.
- Firme (il backend usa `segmenta`, `segmenta_pdf`, `analizza_documento`, `voci_visibili` e
  `rispondi_tracciato`):
  - `backend.analisi.ingestione.segmenta(testo, progetto_id=None) -> Documento`: solleva
    `DocumentoNonValido` (→ `422`) se manca l'intestazione, non ci sono turni o il testo è troppo grande;
  - `backend.analisi.analizza_documento(doc, contesto) -> RisultatoAnalisi` (I2);
  - `backend.domande.rispondi(domanda, persona, voci, manager_nome) -> Risposta` (I3). `voci` già
    filtrate; con `voci` vuota restituisce il testo neutro senza chiamare il modello. Il motivo vero
    (`non_autorizzato` o dato mancante) lo scrive nel registro chi chiama.
- **PDF (F11)**: `Segmento.pagina` e `Citazione.pagina` (opzionali, solo PDF). Id dei segmenti PDF:
  `doc-001#p02s03` (pagina 2, paragrafo 3). La UI mostra «pag. N» nella citazione.
- **Workflow interno**: come si compongono i moduli di `backend/analisi/` è in `docs/analisi.md`.
- **`puo_vedere()` e `generale`**: `generale` apre a tutti i membri solo se è l'**unica** area.
  `[budget, generale]` vale come `[budget]`, anche se il manager lo conferma così all'approvazione.
- **Segmenti e documenti, sicurezza (fatto)**: `GET /segmenti/{id}` e `GET /documenti/{id}` non
  restituiscono le trascrizioni grezze senza filtro: un segmento si vede solo se si è manager oppure
  se lo cita almeno una voce approvata (o un avviso inoltrato) che la persona può vedere.
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
- Il percorso della demo via API dà la stessa memoria del simulatore di Franky
  (`tests/test_percorso_api.py`).
