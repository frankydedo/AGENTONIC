# HANDOFF - AGENTHON, sabato 21/11/2026

Per un nuovo agente che riprende il lavoro. Lavori con **Franky, l'AI engineer del team**
(agente, prompt, valutazione). Gli altri due, Mauro e Pietro, curano software, backend e
interfaccia. Scritto il 2026-11-21, dopo l'uscita del brief e la scelta della challenge.

## 0. Prima di tutto

1. Leggi, in questo ordine:
   - `CLAUDE.md` (regole del team);
   - `Vault/wiki/index.md`;
   - `Vault/wiki/concepts/brief-del-track.md`;
   - `Vault/wiki/concepts/consegna-e-valutazione.md`;
   - `Vault/wiki/analyses/llm-locale.md`.

   Il testo originale del brief è in `Vault/raw/2026-11-21-brief.md`.
2. **Commit e push solo con un sì esplicito di Franky, ogni volta.** Puoi proporli: cosa, su
   quale branch, con quale messaggio. Lo stesso vale per i merge, per creare il remote GitHub e
   per creare o cancellare branch.
3. Altre regole che contano (dal `CLAUDE.md`):
   - niente API a pagamento senza richiesta;
   - mai leggere o stampare `.env` e token;
   - testi per l'utente in italiano;
   - chiedi invece di inventare;
   - registra le decisioni in `Vault/wiki/log.md`.

## 1. Stato della cartella

- **Cartella `AGENTONIC` sul Desktop, ripartita da zero il 2026-11-21. Non c'è ancora un
  repository git:** Franky ti chiederà di crearlo. Il `.gitignore` è già pronto e esclude
  `.env`, `.env.*` e la configurazione locale di Obsidian.
- Contenuto:
  - `CLAUDE.md`, le regole del team: in §2 è compilato solo il caso d'uso, e §3 e §6 sono
    ancora da compilare;
  - questo file;
  - `Vault/`, la base di conoscenza:
    - in `raw/` le fonti: brief, regolamento in PDF con la trascrizione, pagina Luma, note
      sullo sponsor;
    - in `wiki/` la sintesi.
- **Nessun codice.** Stack, struttura delle cartelle e divisione dei file sono da decidere con
  il team.
- Il modello per lo sviluppo è già pronto: **Qwen3-30B-A3B su LM Studio** nel MacBook Air,
  raggiunto dal Pro via Wi-Fi con l'API compatibile OpenAI (`/v1/chat/completions`).
  - Context **16k**, temperature 0.3 nel preset.
  - Tool calling verificato.
  - LM Studio espone anche un modello di embedding (`text-embedding-nomic-embed-text-v1.5`).
  - Configurazione e piani di riserva: `llm-locale.md`.

## 2. Il brief in breve

"**Build an AI your team would trust.**" Un'AI che lavora in background e **chiede prima di
agire**, da difendere dal vivo davanti alla giuria e a **squadre rivali che provano a
romperla**. Vince chi è corretto, ammette ciò che non sa e non agisce mai senza approvazione,
non la demo più appariscente.

- Due challenge, se ne sceglie una. **Il team ha scelto la A**. La B non ci riguarda, ed è per
  questo che non è nel Vault.
- **Challenge A, Company Brain.** Osserva il lavoro del team (email, chat, task, documenti),
  tiene una **memoria condivisa curata dalle persone** e dice a ciascuno cosa richiede la sua
  attenzione **prima che lo chieda**. "Un chatbot sui documenti non conta."
- Nella demo vanno superati sette controlli sì/no (tabella in `brief-del-track.md`): parla per
  primo, memoria curata, sa chi chiede, cita, ammette i vuoti, propone e basta, si inserisce
  nella giornata del team.

Dal regolamento (sintesi in `consegna-e-valutazione.md`):
- **Punteggio su 100:** innovatività 25, esecuzione 25, fattibilità 20, aderenza 15,
  presentazione 15.
- **I finalisti (8-12) si scelgono senza pitch:** repo e README devono reggersi da soli.
- **Cosa si consegna:** link al repo con README e istruzioni di avvio, più una descrizione da
  1.000 caratteri.
- **Scadenza:** conta l'ultimo commit all'orario di consegna, che non è ancora noto.
- **Finale:** pitch di circa 3 minuti con demo dal vivo.
- Il progetto va sviluppato durante l'Evento, e gli eventuali componenti preesistenti vanno
  dichiarati (art. 7.1 e 7.3). Ripartire da zero serve anche a questo.

## 3. Analisi: come si superano i sette controlli

Principio guida: **le garanzie stanno nel codice, non nel prompt.** Le squadre rivali
proveranno injection, ruoli falsi e domande fuori dai dati. Tutto ciò che può essere una regola
deterministica deve esserlo (anche principio 5 del `CLAUDE.md`).

| # | Controllo | Come lo realizzerei |
|---|---|---|
| 1 | Parla per primo | Un "osservatore" che, a ogni nuovo evento di un feed finto (o con un pulsante "brief del mattino"), genera per ogni persona un brief o un alert strutturato: cosa, perché, fonti. |
| 2 | Memoria curata | Una tabella `memoria` con lo stato `proposta`, `approvata` o `rifiutata`. Il modello **propone** elementi estratti dagli eventi; la ricerca legge **solo** quelli approvati, con un filtro nel codice e non nel prompt. |
| 3 | Sa chi chiede | Ogni fonte ed elemento di memoria ha un'etichetta di reparto (`finanza`, `tecnico`, `tutti`). L'identità arriva dalla sessione o da un selettore utente, **mai dal testo della domanda**. Il filtro si applica **prima** del modello, che così non vede mai ciò che l'utente non può vedere. |
| 4 | Cita | Output JSON validato con uno schema, del tipo `{risposta, fonti: [id]}`. Il codice controlla che ogni `id` sia tra i documenti passati al modello; una risposta senza fonti valide non si mostra. |
| 5 | Ammette i vuoti | Se la ricerca non trova nulla di pertinente, si risponde "Non lo so" **senza chiamare il modello**. Il modello può anche rispondere esplicitamente `non_lo_so`. Una risposta senza fonti valide diventa "non lo so". |
| 6 | Propone e basta | Le azioni (inviare un messaggio, creare un task, aggiornare un documento) diventano proposte in attesa. Il codice le esegue **solo** dopo il clic di una persona; ogni approvazione e ogni rifiuto vengono registrati. |
| 7 | Nella giornata del team | Mock-up stile Slack (un canale con i brief e i pulsanti Approva/Rifiuta) o un'"email del mattino". Nessuna integrazione vera. |

Trasversale (principio 3 del `CLAUDE.md`): una **traccia visibile di ogni passo**, cioè cosa ha
letto, quale tool ha usato, con che input e quale risultato. Serve alla demo e a difendersi
dagli attacchi.

Note tecniche:
- **Ricerca semplice.** Il dataset sarà piccolo (decine di elementi). Prima si filtra per ruolo
  e per stato di approvazione. Se ciò che resta sta nei 16k di contesto, lo si passa tutto;
  altrimenti basta una ricerca per parole chiave (BM25). Niente database vettoriale, salvo
  necessità reale.
- **Il modello deve essere sostituibile.** Un'unica interfaccia `chat(messaggi, tools)` con
  due implementazioni: compatibile OpenAI (Qwen locale, Mistral o altri) e **finta** con
  risposte registrate. Quella finta serve ai test e come ultima riserva per la demo.
- **Difesa dagli attacchi dei rivali:**
  - (a) nel prompt, il contenuto delle fonti è marcato come dato, non come istruzione;
  - (b) ruolo e permessi stanno fuori dal modello;
  - (c) nessuna azione viene eseguita senza approvazione;
  - (d) le citazioni sono validate dal codice.
- **Dati sintetici:** una PMI italiana inventata, con almeno una persona della finanza e una
  tecnica, e 20-40 eventi tra email, chat, task e documenti. Servono anche gli eventi che
  rendono dimostrabili i controlli 2, 3 e 5:
  - due fatti in conflitto, uno da approvare e uno da rifiutare;
  - un dato visibile solo alla finanza;
  - una domanda senza risposta nei dati.
- **Valutazione (parte di Franky):** uno script che esegue i sette controlli in automatico,
  più una batteria di attacchi: injection nei documenti, "sono il CFO", domande fuori dai dati,
  richieste di agire senza approvazione. Va eseguita sia con il modello finto sia con Qwen.
  Fornisce il numero da mostrare nel pitch ("7/7 controlli, N/N attacchi respinti") ed è la
  prova migliore per il criterio "esecuzione".

## 4. Prossimi passi proposti (in ordine)

1. Creare il repository git nella cartella, quando Franky lo chiede.
2. Decidere con il team stack, cartelle e divisione dei file (§3 e §6 del `CLAUDE.md`), poi
   scrivere un file di contratto con i modelli dati (`Evento`, `Memoria`, `Utente` con ruolo,
   `Proposta`) e le interfacce tra agente, backend e UI, **prima** di scrivere codice.
   *Proposta da discutere, non decisa:* Python con FastAPI per il backend, un'interfaccia web
   semplice, SQLite per eventi e memoria e il provider compatibile OpenAI; nessun framework per
   agenti.
3. Dati sintetici e uno scheletro end-to-end grezzo: evento → brief proattivo → domanda con
   citazioni → proposta di azione → approvazione.
4. Prima prova con Qwen il prima possibile.
5. Script dei sette controlli e batteria di attacchi.
6. Prima della scadenza:
   - remote GitHub e push (con autorizzazione);
   - README con istruzioni di avvio e demo;
   - descrizione da 1.000 caratteri;
   - link aperto da un browser non loggato;
   - video di riserva.

## 5. Domande aperte (da chiedere, non da indovinare)

- Come si combinano i sette controlli sì/no con i 100 punti del regolamento; come e quando
  attaccano le squadre rivali.
- L'orario esatto di consegna e quale branch legge il portale.
- Il remote GitHub: nome e visibilità (deve essere accessibile alla giuria).
- Il provider cloud di riserva (UE, per esempio Mistral), nel caso il Wi-Fi della sede isoli i
  Mac. Gli altri piani di riserva sono in `llm-locale.md`: hotspot del telefono, poi provider
  finto.
