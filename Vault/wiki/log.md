# Log

## [2026-11-20 12:47] ingest | Pagina Luma dell'evento e note sullo sponsor
- Fonti: `raw/2026-11-20-luma-evento.md`, `raw/2026-11-20-arietetech.md`.
- Create: `overview.md`, `index.md`, `entities/agenthon.md`, `entities/ariete-tech-solutions.md`.
- Ingest volutamente minimo prima del kick-off: niente analisi su possibili casi d'uso.

## [2026-11-20 12:52] decisione | LLM locale per lo sviluppo
- Modello `qwen/qwen3-30b-a3b-2507` su LM Studio nel MacBook Air (24 GB), usato come server;
  si lavora dal MacBook Pro (16 GB) via Wi-Fi con l'API compatibile OpenAI.
- Verificati: `/v1/models`, tool calling con un client compatibile OpenAI, streaming SSE con curl.
- Cavo Thunderbolt Bridge scartato (cavo non adatto); riserva: hotspot del telefono, poi provider finto.
- Creata `analyses/llm-locale.md`.

## [2026-11-20 13:00] decisione | Impostazioni di LM Studio per Qwen3-30B-A3B
- Context 16k (non 262k: limite di memoria dell'Air), GPU offload massimo, flash attention,
  auto-unload disattivato, nessun system prompt nel preset, temperature 0.3.
- Il token di LM Studio resta fuori dalla wiki (regola di `CLAUDE.md` §5 sui segreti).

## [2026-11-21 10:08] ingest | Regolamento ufficiale
- Fonte: `raw/regulation.pdf` (versione del 20/11/2026); aggiunta la trascrizione `raw/regulation.md`.
- Creata: `concepts/consegna-e-valutazione.md`. Aggiornate: `entities/agenthon.md`, `overview.md`, `index.md`.
- Nuovi fatti: pesi dei criteri, consegna via portale (repo + README + 1.000 caratteri), ultimo
  commit registrato alla scadenza, finalisti scelti senza pitch, pitch di ~3 minuti, premi 1.250/500 €.
- Aperto: orario di consegna, branch letto dal portale.

## [2026-11-21 10:58] ingest | Brief del track
- Fonte: `raw/2026-11-21-brief.md` (testo incollato dal team, formattato in markdown).
- Creata: `concepts/brief-del-track.md`. Aggiornate: `overview.md`, `index.md`,
  `entities/agenthon.md`, `entities/ariete-tech-solutions.md`, `concepts/consegna-e-valutazione.md`.
- Nuovi fatti: due challenge, una giuria e una classifica; challenge A "Company Brain" con sette
  controlli sì/no; demo attaccata anche dalle squadre rivali.
- Possibili contraddizioni con il regolamento: "una giuria, una classifica" (art. 8.1, 10.1) e
  attacco delle squadre rivali (art. 7.4); annotate in "Da verificare".

## [2026-11-21 12:20] decisione | Scelta la challenge A, Company Brain
- Il team ha scelto la challenge A; la B non ci riguarda e per questo il suo testo non è in `raw/`.
- Compilato il caso d'uso in `CLAUDE.md` §2.

## [2026-11-21 12:35] decisione | Ripartenza da zero nella cartella AGENTONIC
- Nuova cartella `AGENTONIC` sul Desktop, **senza repository git** (lo crea il prossimo agente,
  su richiesta). Nessun codice preesistente.
- Portati: `CLAUDE.md`, `HANDOFF.md`, `.gitignore`, le fonti in `raw/` e la wiki, ripulita dai
  riferimenti al codice precedente.
- Aperto: repository git e remote GitHub, stack, struttura delle cartelle.

## [2026-11-21 13:00] decisione | Allineamento su solution.md (sessione di domande con Franky)
- Si riparte da zero: nessuno starter kit, niente componenti preesistenti da dichiarare.
- Modello in demo: Qwen3-30B-A3B su LM Studio nell'Air, con riserva cloud ancora da scegliere (non Ollama).
- Due tipi di documento in ingresso (di riunione e integrativi, per esempio PDF); all'arrivo parte
  l'ingestion, con divisione in blocchi «parte x/X» se il documento è troppo grande; poi un
  workflow a step fissi con agenti specializzati in parallelo.
- «Chiedi al Brain» cerca solo tra le voci approvate. Le incongruenze: il codice raggruppa per
  attributo, il modello decide se due fatti parlano della stessa cosa.
- Accesso negato: risposta neutra, identica a quella per un dato mancante, con il rimando al manager.
- Prima dell'approvazione gli avvisi li vede solo il manager.
- Niente batteria di attacchi separata: sicurezza per costruzione.
- Aperto: unità di citazione dei PDF e quali agenti girano sui documenti integrativi.

## [2026-11-21 13:15] ingest | La nostra soluzione (solution.md)
- Fonte: `raw/2026-11-21-solution.md` (spostata dalla root dopo le correzioni concordate con Franky).
- Create: `concepts/soluzione-company-brain.md`, `analyses/architettura-e-piano.md`.
- Aggiornate: `overview.md`, `index.md`, `concepts/consegna-e-valutazione.md` (consegna alle 17:00),
  `entities/agenthon.md`, `concepts/brief-del-track.md`, `analyses/llm-locale.md` (modello della demo).
- Superato: le proposte di `HANDOFF.md` §3-4 (batteria di attacchi, mock-up Slack, stack da decidere).
- Aperto: branch letto dal portale, unità di citazione dei PDF, cloud di riserva, crediti ElevenLabs.

## [2026-11-21 13:25] decisione | Repo git pubblica
- Creata la repo pubblica https://github.com/frankydedo/AGENTONIC con i branch `main` (default) e `develop`.
- Risolto l'accesso della giuria alla repo: il link si apre senza login.

## [2026-11-21 13:05] query | WBS per la divisione del lavoro
- Creata `analyses/wbs.md` (proposta): interfacce I1-I5 da fissare entro le 13:30, pacchetti di
  Franky (F1-F11), Pietro (P1-P11) e Mauro (M1.1-M1.10), percorso critico verso M1 e M2.
- Aperto: chi possiede la ricerca tra le voci approvate (Pietro in P6 o Franky in F6).

## [2026-11-21 13:40] decisione | Security by design e tracciabilità
- Principi concordati con Franky, in `concepts/security-by-design.md`: località, HITL dopo
  l'ingestion (gli agenti propongono, il manager approva), minimo privilegio per il modello,
  documenti come dati, validazione che fallisce chiusa, tracciabilità, limiti, testo semplice in UI,
  invarianti testate.
- WBS aggiornata: interfaccia I6 (`PassoRegistro`) e pacchetto F12 (traccia del workflow); P8 ampliato.
- Da discutere con Pietro: `GET /segmenti/{id}`, `generale` combinata con altre aree, `Citazione.frase`, modello del registro.

## [2026-11-21 13:50] decisione | Interfaccia senza fixture, direttamente sullo stub di Pietro
- `web/` (React 19 + TS + Vite 6 + Tailwind v4) chiama il backend tramite il proxy di Vite (`/api/*` → `BACKEND_URL`, default `:8000`); le risposte d'esempio di `backend/esempi.py` sostituiscono i JSON in `web/src/fixtures/` previsti da I4.
- Tipi TS in `web/src/tipi.ts`, specchio di `backend/modelli.py`: se cambia il contratto, vanno aggiornati insieme.
- Viste: manager (carica minuta, proposte con aree modificabili, avvisi SSE, registro), membro (to-do del giorno, lista del progetto), «Chiedi al Brain» con citazioni cliccabili per tutti.

## [2026-11-21 13:55] decisione | Sei modifiche al contratto (Franky, da rivedere con Pietro)
- `segmenta()` è di Franky (F2). `TaskEstratto.rif` + `dipende_da` con rif temporanei o id approvati.
- `id` e data di creazione opzionali in `Proposta` e `Avviso` (li assegna il backend).
- `ContestoProgetto.proposte_in_attesa` per le incongruenze, con l'avviso marcato `basato_su_proposte`.
- Sconosciuto = non membro del progetto; `persone_azienda` nel contesto e `Sconosciuto.persona_id`.
- Inoltro degli avvisi: `POST /avvisi/{id}/inoltra`, regola `puo_vedere_avviso()`. Dettagli in `docs/api.md`.

## [2026-11-21 14:00] decisione | Interfaccia a pagine e proposte di contratto per il backend
- `web/` diventa un'app a pagine (react-router): Panoramica, Documenti, documento con fonte evidenziata, Team e scadenze (Gantt + per persona), Chiedi al Brain, Registro. Librerie: lucide-react, motion, sonner, date-fns, Inter.
- Le citazioni aprono `/documenti/{id}?seg=sNNN` con il segmento evidenziato; il manager corregge una proposta (assegnatario, scadenza, titolo, aree) prima di approvarla, anche dal punto oscuro.
- Servono aggiunte al contratto, **da concordare con Pietro**: `docs/proposte-contratto-ui.md` (`GET /documenti`, `GET /documenti/{id}`, `Documento.url_file`, `Decisione.modifiche`, `Avviso.proposta_id`, to-do del giorno leggibile dal manager). Finché mancano, la UI usa dati d'esempio dichiarati a schermo.
- Corretto: lo stream SSE si chiude su `pagehide`; prima ogni ricaricamento lasciava una connessione aperta e dopo 6 Chrome bloccava le chiamate al backend.

## [2026-11-21 14:45] decisione | Progetti multipli, Brain al lavoro e file d'esempio (Mauro)
- Il team ha deciso: l'azienda è divisa in aree (reparti) che lavorano sugli stessi progetti; la UI deve far scegliere il progetto.
- UI: selettore del progetto (solo quelli di cui si è membri), pulsante «Carica riunione» con i passi del Brain, Registro riscritto in frasi italiane (i dati grezzi in «Dettagli tecnici»), inoltro degli avvisi.
- Proposte al backend in `docs/proposte-contratto-ui.md` §6-7: `GET /progetti`, `Persona.reparto`, `prj-02` (manager Marco Bianchi) e `prj-03` (manager Paola Greco) in `azienda.json`, evento SSE `passo`.
- File d'esempio fuori dalla repo in `~/Desktop/File esempio` (3 progetti + casi limite, con `LEGGIMI.md`): da `segmenta()` emergono due casi da gestire, l'id duplicato (riu-001) e il progetto dell'intestazione diverso da quello del caricamento.
