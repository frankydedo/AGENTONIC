# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# AGENTHON (GDG Torino) · track "Agentic AI for business"

> File condiviso dal team. Le sezioni marcate **[DA COMPILARE]** non sono ancora decise:
> finché restano così, chiedi invece di assumere.
> **Prima di scrivere codice leggi la soluzione del team**: `Vault/raw/2026-11-21-solution.md`
> (sintesi in `Vault/wiki/concepts/soluzione-company-brain.md` e
> `Vault/wiki/analyses/architettura-e-piano.md`). Per il prodotto vale quella; questo file vale
> per il modo di lavorare. `HANDOFF.md` è il contesto precedente: le sue proposte (§3-4) sono superate.

## 1. Contesto

- Hackathon AGENTHON del GDG Torino (Feat. House, Torino), 21/11/2026, il weekend prima di DevFest Alps.
- Team di 3: Franky (AI engineer), Mauro e Pietro (software, backend, interfaccia). Tempo molto limitato.
- Track: **Agentic AI for business**, sponsor **Ariete Tech Solutions**.
- Punteggio su 100 (regolamento, art. 9.1): innovatività 25, esecuzione 25, fattibilità 20,
  aderenza 15, presentazione 15. In caso di parità contano prima l'esecuzione, poi l'innovatività.
- **I finalisti (8-12) si scelgono senza pitch**: repo e README devono reggersi da soli.

### Chi è lo sponsor (da arietetech.com)
- Braccio tecnologico di Ariete Capital Group (Torino). Crea automazioni e strumenti AI per
  studi professionali, advisor e wealth manager, e PMI.
- Principi: le persone restano in controllo delle decisioni che contano; AI solo dove serve;
  infrastruttura del cliente ospitata in UE, senza SaaS di terzi.
- Tra i prodotti annunciati c'è proprio **Company Brain** (base di conoscenza unica dell'azienda).

## 2. Il brief (`Vault/raw/2026-11-21-brief.md`)

- **"Build an AI your team would trust."** Un'AI che lavora in background e **chiede prima di
  agire**, da difendere dal vivo davanti alla giuria e alle **squadre rivali che provano a romperla**.
- Challenge scelta: **A, Company Brain**. Osserva il lavoro del team (email, chat, task,
  documenti), tiene una memoria condivisa curata dalle persone e dice a ciascuno cosa richiede
  la sua attenzione prima che lo chieda. "Un chatbot sui documenti non conta."
- **I sette controlli sì/no** da superare nella demo (dettagli in
  `Vault/wiki/concepts/brief-del-track.md`): parla per primo · memoria curata (approva/rifiuta
  dal vivo) · sa chi chiede (finanza vs tecnico) · cita · ammette i vuoti ("non lo so") · propone
  e basta · si inserisce nella giornata del team (va bene un mock-up).
- Dati: **non ne vengono forniti**. Si usano dati sintetici di una PMI italiana inventata.
- Consegna (art. 7.3): link al repo con README e istruzioni di avvio, più una descrizione da
  1.000 caratteri che dichiara i componenti preesistenti. All'orario di consegna conta l'ultimo
  commit. **Consegna alle 17:00, ultimo commit alle 16:50.** Finale: pitch di ~3 minuti con demo
  dal vivo. **[DA COMPILARE: branch letto dal portale]**
- Metrica per il pitch *(proposta)*: "7/7 controlli", da `scripts/demo_check.py`.

## 3. Team e responsabilità **[DA COMPILARE con le cartelle]**

| Ruolo | Cosa possiede |
|---|---|
| AI engineer (Franky) | logica dell'agente: prompt, tool, orchestrazione, output strutturati, valutazione |
| SWE 1 - integrazioni | connettori e feed di eventi finti, dati di prova, API backend |
| SWE 2 - prodotto e demo | interfaccia, traccia visibile dei passi dell'agente, deploy, video di riserva, pitch |

Regole:
- Modifica solo la parte che appartiene a chi ti sta usando. Se serve cambiare un'interfaccia
  condivisa (formato dei dati, endpoint, schema di un tool), fermati e dillo: va concordata.
- Le interfacce condivise vanno in un file di contratto (`Evento`, `Memoria`, `Utente` con
  ruolo, `Proposta`), da scrivere **prima** del codice.

## 4. Principi di prodotto

1. **Le garanzie stanno nel codice, non nel prompt.** Le squadre rivali proveranno injection,
   ruoli falsi e domande fuori dai dati. In particolare:
   - la ricerca legge solo la memoria con stato `approvata`;
   - il filtro per ruolo si applica **prima** del modello, e l'identità arriva dalla sessione,
     mai dal testo della domanda;
   - le citazioni sono validate dal codice: una risposta senza fonti valide diventa "non lo so";
   - le azioni restano proposte finché una persona non approva, e ogni decisione si registra;
   - il contenuto delle fonti nel prompt è marcato come dato, non come istruzione.
2. **Una demo end-to-end che funziona** batte dieci funzioni a metà.
3. **Trasparenza**: ogni passo dell'agente (cosa ha letto, quale tool, con che input, quale
   risultato) deve essere visibile e registrato.
4. **Modello sostituibile**: un'unica interfaccia `chat(messaggi, tools)` con un'implementazione
   compatibile OpenAI e una **finta** con risposte registrate (per i test e come riserva della demo).
   Dati personali minimi e sintetici; pensare a GDPR e hosting UE.
5. **AI dove serve**: se basta una regola deterministica, usa la regola. Il dataset è piccolo:
   filtro + tutto nel contesto, o BM25. Niente database vettoriale, salvo necessità reale.
6. **Testi per l'utente in italiano.**

## 5. Come lavorare (per l'agente di coding)

- Task piccoli e verificabili. Dopo ogni modifica, esegui il test o lo script che la dimostra.
- Codice semplice e leggibile; niente astrazioni per esigenze future.
- Se il brief, un contratto o un requisito è ambiguo, chiedi invece di inventare.
- Non chiamare API a pagamento (LLM o altro) senza che l'umano lo chieda; usa il provider finto
  o il modello locale.
- Mai leggere, stampare o committare segreti (`.env`, chiavi, token).
- Risparmia contesto: leggi solo i file necessari, non lanciare subagent se non richiesto,
  risposte brevi.
- Alla fine di ogni task scrivi in 3 righe: cosa è cambiato, come si prova, cosa resta aperto.

## 6. Stack e comandi **[DA COMPILARE]**

- Linguaggi e framework *(proposti nella soluzione, §5)*: Python 3.12 + FastAPI + Pydantic + SSE,
  SQLite + FTS5, React 19 + TypeScript + Vite + Tailwind v4.
- LLM per lo sviluppo: **Qwen3-30B-A3B** (`qwen/qwen3-30b-a3b-2507`) su LM Studio, nel MacBook Air,
  con API compatibile OpenAI su `http://<IP-dell-Air>:1234/v1`. Context **16k**: tutto il prompt,
  fonti comprese, deve starci. Passa `temperature` dal codice. Variabili `.env` proposte e piani di
  riserva (hotspot, poi provider finto) in `Vault/wiki/analyses/llm-locale.md`. Riserva cloud UE: da decidere.
- Avvio in locale, test, valutazione (sette controlli + batteria di attacchi, con il modello
  finto e con Qwen), URL della demo: da definire quando c'è il codice.

## 7. Git

- Repo pubblica: https://github.com/frankydedo/AGENTONIC. Si lavora su `develop`; `main` è il default.
- **Commit, push, merge, creazione o cancellazione di branch e del remote solo con un sì esplicito
  di Franky, ogni volta.** Puoi proporli (cosa, su quale branch, con quale messaggio).
- Un solo repo condiviso. Branch brevi `<nome>/<cosa>`, merge su `main` frequenti e piccoli.
- Prima del merge: i test passano e la demo parte. Mai push forzati né riscrittura della history di `main`.
- Prima della scadenza: `main` testato, repo accessibile alla giuria (prova il link da un browser non loggato).

## 8. Fasi della giornata

1. ~~Scegliere il caso d'uso~~ (fatto: A). Poi stack, cartelle, contratti (§3, §6).
2. Dati sintetici e scheletro end-to-end grezzo: evento → brief proattivo → domanda con
   citazioni → proposta di azione → approvazione.
3. Modello vero il prima possibile, poi lo script dei sette controlli e degli attacchi.
4. Blocco delle funzionalità: solo bug, stabilità, README, descrizione da 1.000 caratteri, video di riserva.
5. Pitch (~3 min): problema → demo → come funziona → risultati → impatto per i clienti dello sponsor.

## 9. Base di conoscenza (`Vault/`)

- È una LLM Wiki: le fonti originali stanno in `Vault/raw/` (**immutabili**), la sintesi
  scritta dall'agente in `Vault/wiki/`. Le regole (formato delle pagine, ingest) sono in `Vault/CLAUDE.md`.
- L'ingest di brief, regolamento, pagina dell'evento e note sullo sponsor è già stato fatto.
- Prima di decisioni di prodotto o tecniche, leggi `Vault/wiki/index.md` e le pagine rilevanti.
  Ogni decisione del team va aggiunta a `Vault/wiki/log.md`
  (`## [AAAA-MM-GG HH:MM] decisione | <titolo>`).
