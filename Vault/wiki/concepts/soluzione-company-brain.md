---
type: concept
updated: 2026-11-21
sources: [raw/2026-11-21-solution.md]
confidence: alta
tags: [soluzione, prodotto, company-brain, permessi, sicurezza]
---
# La nostra soluzione: Company Brain sulle riunioni di progetto

La challenge A ([Brief del track](brief-del-track.md)) declinata sulle **riunioni di progetto**
([fonte](../../raw/2026-11-21-solution.md)). Il Brain è un membro attivo del team: legge riunioni e
documenti di progetto, estrae task e fatti, trova incongruenze tra riunioni diverse, ammette ciò
che non sa e prepara le to-do di ciascuno. **Non agisce mai senza l'approvazione di una persona.**

## Flusso del prodotto [DECISO]
1. Il **manager crea il progetto** (dati, persone anche di reparti diversi, cliente, scadenza).
   Tutto è **per progetto**.
2. **Arriva un documento**, di due tipi:
   - **di riunione**: minuta, trascrizione, audio;
   - **integrativo**: PDF e altri documenti del progetto.
3. **Ingestion**: qualunque documento viene acquisito; se è troppo grande si divide in blocchi
   «parte x/X».
4. **Workflow a step fissi decisi a priori**: dopo l'ingestion partono **in parallelo** agenti
   specializzati (incongruenze, task/to-do, ...). Nessun agente libero sceglie il percorso.
5. Il Brain propone l'aggiornamento della **lista del progetto** (fatto, da fare, criticità); il
   **manager approva voce per voce**. Solo dopo la lista si smista alle persone.
6. **To-do personale giornaliera**: la persona la accetta al mattino e la modifica in giornata
   senza il manager. Se una modifica tocca la lista del progetto, diventa una proposta per il manager.
   Si aggiorna con eventi esterni e con la riunione di fine giornata. Tra persone ci sono dipendenze.
7. **Citazioni**: ogni task, fatto o risposta cita la riunione da cui viene (orario e frase esatta).

## Come superiamo i sette controlli
| # | Controllo | Come |
|---|---|---|
| 1 | Parla per primo | avvisi proattivi (incongruenze, persone o contesti sconosciuti, dipendenze a rischio) che partono **all'arrivo di un documento**, alla fine del workflow |
| 2 | Memoria curata | il manager approva una proposta e ne rifiuta un'altra dal vivo; poi «Chiedi al Brain», che cerca **solo tra le voci approvate** |
| 3 | Sa chi chiede | stessa domanda (es. budget residuo) da uno sviluppatore e da un senior con la competenza `budget` |
| 4 | Cita | tag della riunione (orario e frase), cliccabili |
| 5 | Ammette le lacune | «non lo so»; «non conosco questa persona o questo contesto» |
| 6 | Propone soltanto | proposte e azioni in attesa finché il manager non approva |
| 7 | Nella giornata | to-do del mattino, riunione di fine giornata, email del mattino (mock), brief letto a voce |

I controlli 2 e 3 sono i più a rischio per un prodotto centrato sui task: le domande con filtro
per competenza sono obbligatorie.

## Regola d'oro: il codice fa rispettare le regole [DECISO]
Il modello **capisce il testo e scrive**; il codice decide. Sempre nel codice:
- ruolo e permessi (il ruolo arriva dalla sessione, mai dal modello);
- abbinamento dei nomi ai membri del progetto tramite alias; se non è univoco → **punto oscuro**;
- tag e citazioni, generati dagli id dei segmenti; il modello indica solo quali ha usato e il
  codice verifica che siano tra quelli forniti;
- «non lo so» quando la ricerca non trova nulla, senza chiamare il modello;
- stati delle proposte, approvazioni, dipendenze e task bloccati;
- raggruppamento dei fatti per attributo; **il modello decide** se due fatti parlano della stessa
  cosa e sono in conflitto.

Niente batteria di attacchi separata: il prodotto deve essere **sicuro e resiliente per
costruzione** (scelta di Franky, 21/11, vedi [log](../log.md)).

## Permessi per competenza [DECISO]
- Aree, lista chiusa: `sviluppo`, `budget`, `commerciale`, `fornitori`, `personale`, `generale`
  (visibile a tutti i membri).
- Ogni persona ha le competenze del ruolo più eventuali aggiunte personali; il manager le ha tutte.
- Ogni fatto, task o voce di memoria ha una o più aree: basta **un'area in comune** per vederlo.
- Il modello **propone** l'area, il manager la **conferma** approvando. In dubbio: l'area più
  restrittiva, mai `generale`. Il filtro lo applica il codice **prima** del modello.
- **Accesso negato**: risposta **neutra**, identica a quella per un dato mancante («non ho
  informazioni che puoi vedere, puoi chiedere a [nome del manager]»). Non si rivela che il dato
  esiste; il motivo vero resta nel registro.
- **Avvisi**: prima dell'approvazione li vede **solo il manager**.

## Voce e interfaccia
- **ElevenLabs** (trascrizione con chi parla, sintesi vocale) è un bonus in P1, per il premio
  "Best use of ElevenLabs" ([AGENTHON](../entities/agenthon.md), art. 10.7).
- Interfaccia a widget: una sola app React con un registro di widget e **layout fisso** per ruolo;
  trascinamento e ridimensionamento in P2.

## Da verificare
- Documenti integrativi (PDF): unità di citazione (pagina? paragrafo?) e quali agenti girano su
  di essi. La fonte parla solo di citazioni di riunioni.
- Il `HANDOFF.md` proponeva una batteria di attacchi e un mock-up stile Slack: superati da questa
  fonte (niente batteria; il controllo 7 passa da to-do, email del mattino e voce).

## Collegamenti
- [Architettura e piano di lavoro](../analyses/architettura-e-piano.md)
- [Brief del track](brief-del-track.md)
- [Consegna e valutazione](consegna-e-valutazione.md)
- [Overview](../overview.md)
