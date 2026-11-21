---
type: analysis
updated: 2026-11-21
sources: [raw/2026-11-21-solution.md]
confidence: media
tags: [wbs, divisione-del-lavoro, tappe, interfacce]
---
# WBS: divisione del lavoro (Franky, Pietro, Mauro)

Work breakdown structure **[PROPOSTO]**, scritta alle 13:02. Parte dalla divisione della
[soluzione](../../raw/2026-11-21-solution.md) (§7) e dalle tappe di
[Architettura e piano](architettura-e-piano.md). Ogni pacchetto ha:
- un proprietario, che decide;
- un risultato verificabile;
- le dipendenze;
- la tappa entro cui chiuderlo: **M1 alle 14:15** (tutto collegato con dati finti), **M2 alle
  15:30** (i 7 controlli con il modello vero), **blocco delle funzionalità alle 16:15**, **ultimo
  commit alle 16:50**.

Tutti i pacchetti seguono la [security by design](../concepts/security-by-design.md):
l'ingestion acquisisce, gli agenti propongono, il manager approva; ogni passo è tracciato.

Regola per lavorare in parallelo: **ognuno lavora contro un finto** dell'altro (mock del modello,
stub del backend, JSON di esempio per la UI). Così nessuno aspetta nessuno. I finti spariscono a M1.

## 0. Fase 0, tutti insieme (13:05-13:30): le interfacce

Dopo le 13:30 queste interfacce si cambiano solo parlandone (`CLAUDE.md` §3).

| # | Interfaccia | File | Chi la scrive | Chi la usa |
|---|---|---|---|---|
| I1 | Modelli dei dati (Pydantic) e `puo_vedere()` | `backend/modelli.py` | **Pietro**, con Franky per `EstrazioneRiunione` e `Risposta` | tutti |
| I2 | `analizza_documento(doc: Documento, contesto: ContestoProgetto) -> RisultatoAnalisi` (proposte + avvisi) | `backend/analisi/__init__.py` | **Franky** (firma e stub) | Pietro, da `POST /riunioni` e `POST /documenti` |
| I3 | `rispondi(domanda: str, persona: Persona, voci: list[Voce], manager_nome: str) -> Risposta`, con `voci` **già filtrate** per stato e permessi | `backend/domande.py` | **Franky** (firma e stub) | Pietro, da `POST /domande` |
| I4 | Endpoint e JSON di esempio di ogni risposta | `docs/api.md` + `web/src/fixtures/*.json` | **Pietro** gli endpoint, **Mauro** i JSON che gli servono | Mauro |
| I6 | `PassoRegistro` (riga del registro) e campo `passi` in `RisultatoAnalisi`, così il workflow consegna la sua traccia al backend | `backend/modelli.py` | **Franky** propone, **Pietro** approva | Pietro (P8), Mauro (M1.6) |
| I5 | Identità: la persona attiva arriva da un header di sessione (es. `X-Persona`) scelto dal selettore, **mai dal testo** | `docs/api.md` | **Pietro** | Mauro, Franky |

Uscita della Fase 0: repo con lo scheletro di `backend/` (Pietro) e `web/` (Mauro),
`.env.example` senza valori, il contratto I1-I5 committato su `develop`.

## 1. Franky: il cervello AI

| # | Pacchetto | Risultato verificabile | Dipende da | Entro |
|---|---|---|---|---|
| F1 | Provider del modello `chat(messaggi, schema)`: compatibile OpenAI (LM Studio) + **mock** a risposte registrate | test che gira con il mock senza rete | - | 13:45 |
| F2 | Ingestion: minuta o trascrizione → segmenti numerati (`riu-001#s001`); divisione in blocchi «parte x/X» se il documento supera il budget di token | test su `riu-001.md`: 16 segmenti | I1 | 14:00 |
| F3 | Step **estrazione**: prompt + schema `EstrazioneRiunione`; il modello cita solo id di segmenti ricevuti | con il mock: `riu-001` → task e fatti di `dati/attese/riu-001.md` | F1, F2 | M1 (mock) |
| F4 | Step **abbinamento persone** (codice, via alias) + **punti oscuri** (sicurezza bassa, nome ambiguo, nessun responsabile) | «Marco» → punto oscuro; manuale → senza responsabile | F3, `azienda.json` | M1 |
| F5 | **Workflow** a step fissi: ingestion → agenti in parallelo (task, incongruenze, lacune/sconosciuti) → `RisultatoAnalisi` | I2 restituisce proposte e avvisi veri (con il mock) | F2-F4 | M1 |
| F6 | **Domande** (I3): «non lo so» senza modello se `voci` è vuota; citazioni validate dal codice; testo **neutro** identico per `non_lo_so` e `non_autorizzato` | test dei controlli 3, 4, 5 su `riu-001` | F1, I1 | M1 |
| F7 | **Riunioni sintetiche 2-5** + attese: riu-002 con la **scadenza del quadro che cambia** e una **persona mai vista**; poi costi, fine giornata, evento esterno | file in `dati/riunioni/` e `dati/attese/` | - | riu-002 alle 14:00, il resto entro 15:00 |
| F8 | Agente **incongruenze**: il codice raggruppa i fatti per attributo, il modello decide se parlano della stessa cosa | riu-001 + riu-002 → un avviso di incongruenza sulla scadenza | F5, F7 | 15:00 |
| F9 | **Passaggio a Qwen vero**: prompt adattati, 16k rispettati, temperatura dal codice | le attese di riu-001 e riu-002 passano con Qwen | F3-F8, LM Studio raggiungibile | **M2** |
| F10 | **Casi di verifica** dei 7 controlli (domande, persone, esito atteso) per `demo_check.py` | `dati/attese/controlli.json` | F6 | 15:00 |
| F12 | **Tracciabilità del workflow**: ogni step o agente produce un `PassoRegistro` (provider e modello, versione del prompt, id in ingresso, output validato o motivo dello scarto, tentativi, durata); nessun segreto | ogni chiamata di `analizza_documento` restituisce i suoi passi | I6, F5 | M1 |
| F11 *(P1)* | Documenti integrativi (PDF): estrazione dei fatti, citazione per pagina *(da decidere)* | un PDF → fatti con citazione | F5, P7 | dopo M2 |

## 2. Pietro: backend, dati, to-do

| # | Pacchetto | Risultato verificabile | Dipende da | Entro |
|---|---|---|---|---|
| P1 | Contratto I1, I4, I5 e scheletro FastAPI | `uvicorn` parte, `/docs` mostra gli endpoint | - | 13:30 |
| P2 | `schema.sql` + `db.py` (SQLite + FTS5); caricamento di `dati/azienda.json` (rivedere la bozza di Franky, competenze definitive) | db creato da zero con uno script | I1 | 14:00 |
| P3 | `POST /riunioni` (e `/documenti`): salva il documento, chiama `analizza_documento` (stub finché F5 non c'è), salva proposte e avvisi | caricare `riu-001.md` crea proposte nel db | P2, I2 | M1 |
| P4 | **Proposte**: lista, approva/rifiuta voce per voce, il manager conferma o modifica le **aree**; all'approvazione nasce il task o il fatto nella lista del progetto | approva/rifiuta via API, stato registrato | P3 | M1 |
| P5 | **Avvisi** via SSE: prima dell'approvazione li vede **solo il manager**; `risolvi` | un avviso arriva al manager e non agli altri | P3, I5 | M1 |
| P6 | `POST /domande`: ricerca FTS5 **solo tra le voci approvate**, filtro con `puo_vedere()` **prima** di chiamare `rispondi` | lo sviluppatore non ottiene il budget, il senior sì | P4, I3 | M1 |
| P7 | `todo.py`: smistamento dopo l'approvazione, to-do del giorno (accetta, modifica), dipendenze e `bloccato`, modifiche che toccano il progetto → proposta al manager | la HMI di Sara risulta bloccata dalla lista dei tag | P4 | 15:00 |
| P8 | **Registro**: salva i `passi` del workflow (F12) e registra caricamenti, approvazioni e rifiuti, domande (con il motivo vero di `non_autorizzato`) + `GET /registro`, solo per il manager | ogni chiamata del workflow e ogni approvazione compaiono | P3 | 15:00 |
| P9 | `scripts/demo_check.py`: esegue i 7 controlli via API con i casi di F10 | `7/7` stampato a terminale | P3-P7, F10 | **M2** |
| P10 *(P1)* | `voce.py`: ElevenLabs STT (`diarize=true`) → segmenti; TTS del brief del mattino. Solo con un sì per le API a pagamento | audio della riu-001 → segmenti | M2 chiuso | 16:15 |
| P11 *(P1)* | `POST /eventi/simula` (evento esterno, fine giornata) | un evento ricalcola la to-do | P7 | 16:15 |

## 3. Mauro: interfaccia, documentazione, pitch

| # | Pacchetto | Risultato verificabile | Dipende da | Entro |
|---|---|---|---|---|
| M1.1 | Scheletro React 19 + TS + Vite + Tailwind; client API che legge i **JSON di esempio** (I4) finché il backend non è pronto | `npm run dev` mostra la home | I4 | 13:45 |
| M1.2 | **Selettore della persona** (imposta la sessione, I5) e layout fisso per ruolo | cambio persona → cambia la vista | I5 | 14:00 |
| M1.3 | **Vista manager**: carica documento, proposte con approva/rifiuta e modifica delle aree, avvisi in tempo reale | controlli 2 e 6 visibili sui JSON di esempio | M1.2 | M1 |
| M1.4 | **Chiedi al Brain**: chat con le **citazioni cliccabili** che aprono il segmento della riunione | controlli 3, 4, 5 visibili | M1.2 | M1 |
| M1.5 | **Vista membro**: to-do del giorno (accetta al mattino, modifica), task bloccati | controllo 7 | P7 | 15:00 |
| M1.6 | **Traccia dei passi** dal registro (trasparenza) | ogni passo del workflow visibile | P8 | 15:30 |
| M1.7 | **Email del mattino** (mock) con il brief per persona | controllo 1 e 7 | P5 | 15:30 |
| M1.8 | Passaggio dai JSON di esempio al **backend vero** | demo intera senza finti | P3-P6 | **M1** |
| M1.9 | **README** (cosa fa, avvio in locale, avvio con il mock senza modello) + **descrizione da 1.000 caratteri** | un estraneo avvia la demo dal README | P1, F1 | 16:30 |
| M1.10 | **Pitch** di 3 minuti (copione cronometrato, ordine dei 7 controlli) + **video di riserva** | video registrato | M2 | 16:45 |

## Percorso critico

`I1-I5` (13:30) → `F2/F3` + `P2/P3` → **M1 14:15** (riu-001 caricata → proposte → approvazione →
domanda filtrata, con il mock) → `F7/F8` (incongruenza su riu-002) + `P7` → `F9` Qwen vero + `P9`
→ **M2 15:30** (`demo_check` 7/7).

Se M2 non è chiuso alle 15:30, si saltano **P10, P11 e F11** (voce, eventi, PDF) e si lavora solo
sui 7 controlli ([soluzione](../../raw/2026-11-21-solution.md) §8).

## Punti di sincronizzazione
- **13:30**: interfacce committate su `develop`.
- **14:15 (M1)**: prova end-to-end insieme, 10 minuti.
- **15:30 (M2)**: `demo_check.py` e decisione su P1.
- **16:15**: blocco delle funzionalità; merge su `main`; prova del pitch.
- **16:50**: ultimo commit. Si guarda il link della repo da un browser non loggato.

## Da verificare
- Chi possiede la ricerca: qui sta in P6 (Pietro, FTS5 nel db) e passa a `rispondi` le voci già
  filtrate. In alternativa la può fare Franky in F6. Da confermare in Fase 0.
- Unità di citazione dei PDF (F11) e branch letto dal portale.

## Collegamenti
- [Security by design](../concepts/security-by-design.md)
- [Architettura e piano](architettura-e-piano.md)
- [Soluzione Company Brain](../concepts/soluzione-company-brain.md)
- [Overview](../overview.md)
