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
