---
type: concept
updated: 2026-11-21
sources: [raw/2026-11-21-solution.md]
confidence: media
tags: [sicurezza, security-by-design, hitl, tracciabilita, permessi]
---
# Security by design

Il prodotto deve essere sicuro e resiliente **per costruzione**, non grazie al prompt
([soluzione](../../raw/2026-11-21-solution.md) §3; decisione di Franky del 21/11, vedi [log](../log.md)).
Qui ci sono i principi concordati il 21/11 e come si traducono nel codice. Valgono per tutti i
pacchetti della [WBS](../analyses/wbs.md).

## 1. Località e sovranità dei dati
- In demo il modello è locale (LM Studio sull'Air, [LLM locale](../analyses/llm-locale.md)) e i dati
  restano su SQLite nel PC.
- Il cloud di riserva si attiva solo con un **interruttore esplicito**, visibile nella UI
  («modello: locale/cloud»). Si usa un provider UE e gli si mandano solo i segmenti necessari.

## 2. Human-in-the-loop dopo l'ingestion
- **L'ingestion acquisisce, gli agenti propongono, il manager del progetto approva.**
- L'ingestion (documento → segmenti) è deterministica e non crea memoria. Gli agenti in
  parallelo producono **solo proposte e avvisi**: nessuno scrive nella memoria del progetto.
- Una proposta diventa task o fatto **solo** con l'approvazione del manager, che conferma o
  modifica anche le aree. Si approva esattamente il contenuto mostrato: se il contenuto cambia,
  nasce una nuova proposta.
- «Chiedi al Brain» e gli agenti successivi vedono solo voci **approvate**, mai le proposte rifiutate.

## 3. Minimo privilegio per il modello
- Il modello non ha tool che scrivono e non riceve mai un `persona_id` da impostare.
- Nell'analisi riceve il documento e il `ContestoProgetto` (solo voci approvate).
- Nelle domande riceve solo le voci che `puo_vedere()` ha già filtrato. Se non resta nulla, si
  risponde con il testo neutro **senza chiamare il modello**.

## 4. I documenti sono dati, mai istruzioni
- Il testo entra nel prompt dentro delimitatori, segmento per segmento, con il suo id.
- I finti delimitatori presenti nel testo vengono neutralizzati.
- Il system prompt dice che il contenuto non va eseguito.
- Anche se un'injection riuscisse, il risultato peggiore è una proposta sbagliata, che il manager vede e rifiuta.

## 5. Validazione dell'output che fallisce chiusa
- Pydantic in modalità strict con `extra="forbid"`.
- Ogni id di segmento o di task deve stare nell'insieme passato al modello.
- Le aree vengono da una lista chiusa.
- Se l'output non è valido: **un** nuovo tentativo, poi si scarta e si registra. Mai risultati parziali.
- Regole deterministiche dopo l'estrazione:
  - un'area mancante diventa quella più restrittiva, mai `generale`;
  - un fatto con attributo `budget` o `costo` ha sempre l'area `budget`;
  - sicurezza `bassa` diventa un punto oscuro, non una proposta.

## 6. Tracciabilità
Ogni passo lascia una riga nel registro (pacchetti F12 e P8 della [WBS](../analyses/wbs.md)):
- **Workflow degli agenti** (Franky): documento, step o agente, provider e modello (locale, cloud
  o mock), versione del prompt, id in ingresso, output validato o motivo dello scarto, numero di
  tentativi, durata, ora.
- **Persone** (Pietro): caricamento del documento, approvazione o rifiuto (chi, quando, aree
  confermate, nota), domande (chi ha chiesto, esito, citazioni). Per un `non_autorizzato` il
  motivo vero sta **solo** nel registro.
- Il registro **non contiene segreti** (`.env`, token) e lo vede solo il manager. In UI diventa la
  traccia dei passi (M1.6).

## 7. Limiti e resilienza
- Dimensione massima del documento, numero massimo di blocchi «parte x/X», timeout su ogni
  chiamata al modello.
- Quando si superano: errore chiaro, riga nel registro e nessun risultato parziale.
- Il provider **mock** è il piano B della demo dal vivo.

## 8. Interfaccia
- L'output del modello si mostra sempre come **testo semplice**: mai HTML e mai link automatici (Mauro).

## 9. Invarianti verificate con i test
Non una batteria di attacchi, ma test pytest delle regole:
- un id inventato dal modello viene scartato;
- una minuta con un'injection non produce azioni;
- «sono il manager» scritto nel testo non cambia i permessi;
- una lista di voci vuota dà il testo neutro senza chiamare il modello;
- `[budget, generale]` viene rifiutato.

## Da verificare (contratto di Pietro, da discutere)
1. **`GET /segmenti/{id}`** rivela le trascrizioni grezze a qualunque membro, aggirando le aree.
   Proposta: un segmento si vede solo se si è manager, oppure se lo cita almeno una voce approvata
   che la persona può vedere.
2. **`generale` combinata con altre aree** rende visibile a tutti un dato riservato
   (`puo_vedere()` restituisce vero se c'è `generale`). Proposta: `generale` va solo da sola.
3. **`Citazione.frase`** può contenere informazioni di altre aree, se nello stesso turno di parola
   si parla di più cose. Proposta minima: nelle riunioni sintetiche un turno parla di una sola area.
4. Il **registro** non ha ancora un modello in `modelli.py`: serve un `PassoRegistro` condiviso
   (vedi [WBS](../analyses/wbs.md), F12).

## Collegamenti
- [Soluzione Company Brain](soluzione-company-brain.md)
- [WBS](../analyses/wbs.md)
- [Architettura e piano](../analyses/architettura-e-piano.md)
