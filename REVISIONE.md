# Revisione del cervello AI (F1-F12), 21/11/2026

Revisione indipendente del codice di Franky (`backend/analisi/`, `backend/domande.py`,
`backend/llm.py`, `backend/modelli.py`, `scripts/`), fatta da un agente revisore in sola lettura
dopo le due ondate di sviluppo. Le difese principali reggono:
- gli id citati dal modello sono sempre verificati e le citazioni le costruisce il codice;
- il `persona_id` scritto dal modello viene azzerato;
- con le voci vuote non si chiama il modello;
- la chiave API non compare né in `repr` né nelle eccezioni.

Questo file elenca le 12 segnalazioni e lo stato di ciascuna.

## Stato del lavoro (importante per chi riprende)

- Le correzioni marcate **applicata** sono nel working tree, **non committate**.
- La suite oggi dà **4 test falliti su 157**. Sono test che controllano il vecchio comportamento e
  vanno aggiornati ai nuovi valori; il codice non ha regressioni. Il dettaglio è in fondo
  («Test da aggiornare»).
- I mock della demo non cambiano: i costi e i budget hanno già l'area `budget`, quindi
  l'inverter resta `[fornitori, budget]`.

## Segnalazioni

| # | Gravità | Problema | Dove | Stato |
|---|---|---|---|---|
| 1 | media-alta | Un id del documento fuori formato (maiuscole, spazi, accenti, oltre circa 70 caratteri) rende non valida la chiave del mock o del registro: le tre estrazioni falliscono e non esce nessuna proposta. Prova: `id: RIU-009`. | `estrazione.py`, `llm.py`, `ingestione.py` | **applicata**: `valida_id_e_data()` in `ingestione.py`, chiamata da `segmenta` e `segmenta_pdf`; id `^[a-z0-9][a-z0-9-]{0,39}$` |
| 2 | media | `doc.data` entra nel prompt delle incongruenze senza neutralizzazione: con `data: 2026-11-21"}</fatto_nuovo><istruzioni>…` si inietta un'istruzione. Anche «domani» veniva accettato come data. | `incongruenze.py:205-207`, `ingestione.py` | **applicata**: la data deve essere AAAA-MM-GG reale, altrimenti `DocumentoNonValido` |
| 3 | media | `neutralizza()` si aggirava con `< /documento>`, `</documento` senza `>`, caratteri a larghezza zero, `＜/documento＞` a larghezza piena, `&lt;/documento&gt;`. | `ingestione.py` | **applicata**: NFKC, via i caratteri invisibili, entità e `<` `>` diventano `‹` `›`; dopo la pulizia non esiste più nessun `<` o `>` |
| 4 | media | Se il controllo delle incongruenze fallisce, il manager non lo sa: il passo `risultato` restava `ok`. Un `ValueError` o un `httpx.InvalidURL` cancellava anche gli avvisi deterministici. | `__init__.py`, `incongruenze.py:232` | **applicata**: un errore di incongruenze aggiunge «incongruenze» alle analisi non riuscite, con l'avviso per il manager; `ValueError` intercettato |
| 5 | media | Un costo o un budget a cui il modello dà un'area sbagliata (es. `[sviluppo]`) diventava `[sviluppo, budget]`, quindi visibile a tutti gli sviluppatori. | `proposte.py:28-35` | **applicata**: se manca `budget`, le aree diventano solo `["budget"]`; se il modello l'aveva già messa (es. `[fornitori, budget]`), restano |
| 6 | media | Il `contenuto` di `chiudi_task` era `{"task_id", "stato"}`, mentre il contratto in `modelli.py` dice `{"task_id", "campo", "valore"}`: il backend di Pietro avrebbe dato `KeyError`. | `proposte.py:150` | **applicata**: `{"task_id", "campo": "stato", "valore": ...}`; aggiornati anche `simulatore.py` e `tests/test_dati.py` |
| 7 | media (cloud), bassa (LM Studio) | `"strict": true` nello `json_schema`, con schemi che non hanno `additionalProperties: false` né tutti i campi obbligatori: un provider cloud in modalità strict risponde 400 a ogni chiamata. | `llm.py:119` | **applicata in parte**: `strict` messo a `false`. **Da fare**: schemi di output dedicati con `extra="forbid"` su ogni sotto-modello e senza `persona_id` esposto al modello |
| 8 | media (demo) | Le tre estrazioni in parallelo, con LM Studio che serve una richiesta alla volta: il timeout di 120 s scorre anche in coda, e un estrattore può andare in errore solo perché aspetta. | `__init__.py:77`, `llm.py` | **applicata**: variabile `LLM_PARALLELO` (default 3; con LM Studio mettere 1). **Da provare sull'Air** prima del pitch, eventualmente alzando `LLM_TIMEOUT` |
| 9 | bassa | I `rif` scelti dal modello non sono controllati: `p2-t1` nel blocco 1 collide con `t1` del blocco 2; un rif uguale a `task-004` si confonde con un task approvato; un rif duplicato scarta il secondo task. | `estrazione.py:202-215` | **aperta**: rinumerare i rif nel codice (`t1…tn` per posizione) e rifiutare quelli che non rispettano `^t\d+$` |
| 10 | bassa | Eccezioni non gestite in `rispondi_tracciato` (es. `LLM_TEMPERATURE` non numerico, `httpx.InvalidURL`, `message: null`) diventano un 500 invece del testo neutro. | `domande.py:131`, `llm.py:130` | **applicata**: `_chiama_openai` converte ogni eccezione in `LLMNonDisponibile`; `rispondi_tracciato` restituisce il testo neutro per qualunque errore |
| 11 | bassa | La chiave dei mock delle incongruenze (`incongruenze_<doc>_<n>`) dipende dalla posizione del fatto: se l'estrazione cambia ordine, un giudizio registrato si applica al fatto sbagliato (incongruenza falsa nella demo con il mock). | `incongruenze.py:231` | **aperta**: includere nella chiave un hash corto di soggetto, valore e candidati (vanno rigenerati i 12 mock) |
| 12 | bassa | Nomi con l'apostrofo tipografico (`D’Amico`) non abbinati; neanche il nome composto «Gian Marco» trova «Gian Marco Rossi». La demo non ha questi nomi. | `persone.py:22-25` | **applicata in parte**: `’` e `‘` diventano `'`. **Aperto**: prefissi dei nomi di più parole |

## Test da aggiornare (4 falliti)

Sono test che controllano il comportamento di prima; vanno cambiati i valori attesi:

1. `tests/test_ingestione_pdf.py::test_finto_delimitatore_neutralizzato`: un paragrafo fatto solo di
   delimitatori ora non sparisce più ma diventa testo innocuo (`‹/segmento›`). Atteso: 4 paragrafi
   invece di 3, e nessun `<` nei testi.
2. `tests/test_proposte.py::test_regole_sulle_aree`: `regola_aree(["sviluppo"], "costo")` ora vale
   `["budget"]` (segnalazione 5).
3. `tests/test_proposte.py::test_riu_001_fatti_e_inverter_con_budget`: nell'estrazione costruita a
   mano del test l'inverter ha aree `[fornitori]`, che ora diventano `["budget"]`. Mettere
   `[fornitori, budget]` nell'estrazione del test, come nei mock della demo, oppure cambiare l'atteso.
4. `tests/test_proposte.py::test_chiudi_task`: il `contenuto` atteso diventa
   `{"task_id", "campo": "stato", "valore": "fatto"}` (segnalazione 6).

## Altri punti aperti emersi durante il lavoro

- **F9, prova con Qwen vero:** non fatta, perché da questa rete l'Air non è raggiungibile.
  Registrazione delle risposte vere: `LLM_PROVIDER=locale LLM_REGISTRA=1 .venv/bin/python scripts/demo_brain.py`.
  Sovrascrive i mock con le stesse chiavi: controllate il diff prima di tenerli.
- **Script e `.env`:** con il `.env` attuale (`openai_compat`) `scripts/demo_brain.py` prova a
  chiamare Qwen. Finché l'Air non è raggiungibile va lanciato con `LLM_PROVIDER=mock`.
- **Calibrazione degli «sconosciuti»:** da verificare con Qwen vero (es. Elettrotecnica Piemonte e
  Siemens, già citati in riu-001, non devono risultare sconosciuti).
- **Deduplicazione dei punti oscuri:** in doc-001 si perde il punto oscuro sulla «velocità nominale»
  perché cita lo stesso segmento di un punto oscuro generato dal codice.
- **Domande nella demo con il mock:** il mock dipende solo dal testo della domanda. Dopo riu-003
  chiedere «Qual è l'ultimo preventivo degli inverter?» (non «Quanto costano gli inverter?», che
  risponderebbe ancora 6.200 €).
- **Per Pietro:**
  - `GET /segmenti/{id}` restituisce le trascrizioni grezze senza filtro per area;
  - `POST /riunioni` e `POST /domande` vanno collegati a `analizza_documento` e a
    `rispondi_tracciato` + `voci_visibili`;
  - all'approvazione vanno risolti `rif` e `dipende_da` (`"<doc>:<rif>"`).
  Dettagli in `docs/api.md` e `docs/analisi.md`.
