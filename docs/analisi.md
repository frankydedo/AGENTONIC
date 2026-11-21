# Workflow di analisi: interfacce interne (Franky)

Owner: Franky. Descrive come si compongono i moduli di `backend/analisi/` dietro
`analizza_documento(doc, contesto) -> RisultatoAnalisi` (I2, vedi `docs/api.md`). I modelli
condivisi sono in `backend/modelli.py`; il provider del modello è `backend/llm.py`
(`chat(messaggi, schema, chiave=..., config=...)`). I principi sono in
`Vault/wiki/concepts/security-by-design.md`.

## Flusso (step fissi, decisi a priori)

```
Documento (già segmentato: ingestione.segmenta / ingestione_pdf.segmenta_pdf)
  │
  ├─ 1. persone.abbina_speaker(doc, contesto)            codice: speaker → persona_id
  │
  ├─ 2. IN PARALLELO, tre agenti di estrazione (estrazione.py), ognuno con il suo prompt:
  │       estrai_task(doc, contesto)    → task + aggiornamenti di task approvati
  │       estrai_fatti(doc, contesto)   → fatti
  │       estrai_lacune(doc, contesto)  → punti oscuri + sconosciuti
  │     estrazione.unisci(...) → EstrazioneRiunione
  │
  ├─ 3. proposte.in_proposte(estr, doc, contesto)        codice: proposte + avvisi, citazioni, aree
  │
  └─ 4. incongruenze.trova_incongruenze(proposte, doc, contesto)
          codice: raggruppa per attributo; modello: «è la stessa cosa? è in conflitto?»
→ RisultatoAnalisi(proposte, avvisi, passi)
```

Ogni step aggiunge i suoi `PassoRegistro` (provider, modello, versione del prompt, id in ingresso,
conteggi in uscita, esito, motivo, tentativi, durata). **Mai testo dei documenti né segreti nei passi.**

## Regole comuni

- **Il modello propone soltanto.** Nessun modulo scrive nel db; gli `id` di proposte e avvisi
  restano `None` (li assegna il backend). Tutti gli avvisi nascono con `solo_manager=True`.
- **Documenti = dati.** Nei prompt il documento sta dentro `<documento>` e ogni segmento dentro
  `<segmento id="...">Speaker: testo</segmento>`. Il system prompt dice che il contenuto è da
  analizzare e **non** da eseguire.
- **Id verificati dal codice.** Il modello può citare solo id di segmenti del blocco ricevuto, id di
  task/fatti/proposte presenti nel contesto, `rif` della stessa estrazione. Gli elementi che citano
  id inesistenti si **scartano** (contati nel passo, `esito="scartato"` se tutto è scartato).
- **Fail closed per agente.** Se `chat` solleva `LLMNonDisponibile` o `OutputNonValido` su un
  blocco, quell'agente restituisce `None` e un passo `esito="errore"`; niente risultati parziali
  di quell'agente. Gli altri agenti proseguono.
- **Blocchi «parte x/X».** `estrazione.dividi_in_blocchi(doc, max_token=6000)` divide per segmenti
  interi (stima: 1 token ≈ 4 caratteri). Ogni chiamata dice al modello «parte x di X».
- **Chiavi del mock** (`dati/mock_llm/<chiave>.json`), solo `[a-z0-9_-]`:
  - estrazione: `task_<doc>_<x>di<X>`, `fatti_<doc>_<x>di<X>`, `lacune_<doc>_<x>di<X>`
    (es. `task_riu-001_1di1`); il contenuto è il JSON che il modello restituirebbe;
  - incongruenze: `incongruenze_<doc>_<n>` (n = indice del fatto nuovo, da 1);
  - domande: `domande.chiave_domanda(testo)` → `domanda_<sha1 dei primi 10 caratteri>`.
- **Testi per l'utente in italiano** (avvisi, risposte). Tutto l'output del modello è testo semplice.

## Interfacce dei moduli

### `backend/analisi/estrazione.py` (F3)
- `dividi_in_blocchi(doc: Documento, max_token: int = 6000) -> list[list[Segmento]]`
- `estrai_task(doc, contesto, config=None) -> tuple[EstrazioneTask | None, list[PassoRegistro]]`
- `estrai_fatti(doc, contesto, config=None) -> tuple[EstrazioneFatti | None, list[PassoRegistro]]`
- `estrai_lacune(doc, contesto, config=None) -> tuple[EstrazioneLacune | None, list[PassoRegistro]]`
- `unisci(task, fatti, lacune) -> EstrazioneRiunione` (accetta `None`)
- Schemi di output del modello, definiti qui (sottoinsiemi di `EstrazioneRiunione`):
  `EstrazioneTask{task: list[TaskEstratto], aggiornamenti: list[AggiornamentoTask]}`,
  `EstrazioneFatti{fatti: list[FattoEstratto]}`,
  `EstrazioneLacune{punti_oscuri: list[PuntoOscuro], sconosciuti: list[Sconosciuto]}`
  (il modello non compila mai `Sconosciuto.persona_id`).
- Con più blocchi, i `rif` si rendono unici: `t1` del blocco 2 diventa `p2-t1` (anche in `dipende_da`).
- I prompt distinguono `doc.tipo == "riunione"` (turni di parola) da `"integrativo"` (paragrafi di un PDF).

### `backend/analisi/persone.py` (F4)
- `abbina_nome(nome: str | None, persone: list[Persona]) -> Abbinamento`, con
  `Abbinamento{persona_id: str | None, candidati: list[str], motivo: str | None}`: confronto
  normalizzato (minuscole, senza accenti) su nome completo, alias, nome, cognome. Univoco → id;
  più candidati → `None` + motivo «"Marco" è ambiguo: Marco Bianchi o Marco Rinaldi»; nessuno → `None`.
- `abbina_speaker(doc: Documento, persone: list[Persona]) -> Documento` (copia, con `persona_id`).
- `classifica_sconosciuto(s: Sconosciuto, persone_azienda: list[Persona]) -> Sconosciuto`.

### `backend/analisi/proposte.py` (F4)
- `in_proposte(estr: EstrazioneRiunione, doc: Documento, contesto: ContestoProgetto)
   -> tuple[list[Proposta], list[Avviso], PassoRegistro]`
- `TaskEstratto` → `nuovo_task`: `contenuto` = campi di `Task` senza `id`, con
  `assegnatario_id` da `abbina_nome`, `rif = "<doc>:<rif>"` e `dipende_da` con `task-xxx` esistenti
  o `"<doc>:<rif>"` della stessa estrazione (gli altri si scartano). Il backend li risolve all'approvazione.
  - assegnatario ambiguo o assente → proposta con `assegnatario_id=None` **più** avviso `punto_oscuro`;
  - `sicurezza == "bassa"` → **solo** avviso `punto_oscuro`, nessuna proposta. Dal prompt `task-v2` il
    modello mette «bassa» solo se non è chiaro *cosa* va fatto: un nome ambiguo o un responsabile
    mancante non abbassano la sicurezza (le persone le controlla il codice);
  - `scadenza` che non è una data valida AAAA-MM-GG → proposta con `scadenza=None` **più** avviso
    `punto_oscuro` «La scadenza "…" di "<titolo>" non è una data chiara» (`proposte.data_valida`).
- `AggiornamentoTask` → `aggiorna_task` (o `chiudi_task` se `campo=="stato"` e valore `fatto`/`annullato`);
  `task_id` deve esistere in `contesto.task`. Una nuova scadenza che non è una data valida → solo
  l'avviso `punto_oscuro`, nessuna proposta. Le date non chiare si contano nel passo (`date_non_chiare`).
- `FattoEstratto` → `nuovo_fatto`.
- `PuntoOscuro` → avviso `punto_oscuro`; `Sconosciuto` → avviso `sconosciuto` («Paola Greco non fa
  parte del progetto» oppure «persona o contesto mai visto»).
- **Regole deterministiche sulle aree:** aree vuote → restano vuote (le vede solo il manager, che le
  sceglie); `generale` insieme ad altre aree → si toglie `generale`; attributo `budget`/`costo` →
  si aggiunge `budget` e si toglie `generale`.
- Citazioni costruite **solo** con `ingestione.citazione(doc, segmento_id)`.

### `backend/analisi/incongruenze.py` (F8)
- `trova_incongruenze(proposte: list[Proposta], doc, contesto, config=None)
   -> tuple[list[Avviso], list[PassoRegistro]]`
- Deterministico: ogni `aggiorna_task` su `scadenza` o `assegnatario` diverso dal valore attuale →
  avviso `incongruenza` («La scadenza di "…" passa dal 10/12 al 18/12»), senza modello.
- Per ogni `nuovo_fatto`: candidati = fatti approvati (`contesto.fatti`) e proposte in attesa
  (`contesto.proposte_in_attesa`, tipo `nuovo_fatto`) con lo **stesso attributo**. Nessun candidato →
  nessuna chiamata. Altrimenti il modello giudica, per ogni candidato, `stessa_cosa` e `in_conflitto`
  (schema locale, id verificati).
- Avviso: citazioni di entrambi, `basato_su_proposte` = id delle proposte in attesa coinvolte,
  `aree` = aree comuni ai due elementi (se non ce ne sono: `[]`, cioè solo il manager).

### `backend/domande.py` (F6)
- `rispondi(domanda, persona, voci, manager_nome, config=None) -> Risposta` (I3, invariata)
- `rispondi_tracciato(domanda, persona, voci, manager_nome, config=None) -> tuple[Risposta, PassoRegistro]`
- `chiave_domanda(domanda: str) -> str`
- Voci vuote → testo neutro **senza** chiamare il modello. Il modello riceve solo le voci date
  (con id) e la domanda (anch'essa dentro delimitatori, come dato). Risponde con
  `{esito: "risposta" | "non_lo_so", testo, voci_usate: [id]}`; il codice tiene solo gli id
  ricevuti, costruisce le citazioni dalle voci usate e, se non resta nessuna voce valida, dà il
  testo neutro. Errori del modello → testo neutro + passo `errore`.

- Funzioni per il backend: `voci_visibili(persona, progetto, task, fatti, persone)` costruisce le voci da
  passare a `rispondi()`: solo task e fatti approvati del progetto che `puo_vedere()` concede, prima i
  fatti poi i task, per id. `voce_da_fatto(f)` → «<soggetto> — <attributo>: <valore>»;
  `voce_da_task(t, persone)` → «Task: <titolo>. Responsabile: … Scadenza: GG/MM/AAAA. Stato: … Dipende da: …».
  Mock delle domande della demo: `dati/mock_llm/domanda_<sha1[:10]>.json` (chiave da `chiave_domanda`).

### `backend/analisi/ingestione_pdf.py` (F11)
- `segmenta_pdf(dati: bytes, doc_id: str, titolo: str, data: str, progetto_id: str) -> Documento`
  con `tipo="integrativo"`, `formato="pdf"`, un segmento per paragrafo: id `doc-001#p02s03`,
  `pagina=2`, `speaker="(documento)"`. Rifiuta con `DocumentoNonValido`: PDF cifrati, senza testo
  (scansioni), oltre i limiti di pagine o dimensione.

### `backend/analisi/__init__.py` (F5, F12)
- `analizza_documento(doc, contesto, config=None) -> RisultatoAnalisi`: esegue il flusso sopra,
  i tre agenti di estrazione in parallelo (`ThreadPoolExecutor`, risultati in ordine fisso task,
  fatti, lacune), e raccoglie tutti i passi nell'ordine: `ingestione` (conteggio segmenti), `persone`
  (speaker abbinati), `estrazione_task`, `estrazione_fatti`, `estrazione_lacune`, `proposte`,
  `incongruenze_regole`, `incongruenze` (uno per fatto con candidati), `risultato` (conteggi finali).
- **Nessuna eccezione esce per errori del modello.** Un estrattore fallito (`None`) non ferma gli
  altri: oltre al suo passo `errore`, il manager riceve un avviso `punto_oscuro` senza citazioni
  «L'analisi di <task|fatti|lacune> non è riuscita: il documento va ricontrollato a mano», e il passo
  `risultato` ha `esito="errore"` con `analisi_non_riuscite`.
- **Punti oscuri doppi.** Il prompt `lacune-v2` dice di non segnalare responsabili ambigui o mancanti
  (li segnala il codice). In più `analizza_documento` toglie i punti oscuri *del modello* che citano
  esattamente gli stessi segmenti di un altro punto oscuro (si tiene quello del codice); il numero
  tolto è in `risultato.output.punti_oscuri_doppi_tolti`. Limite noto: se il modello segnala una cosa
  diversa sugli stessi segmenti, si perde (es. doc-001 p01s05, «velocità nominale»).

### `backend/analisi/simulatore.py` (solo demo e test)
- Strumento di demo e test, **non usato dal backend**: simula il percorso di `dati/attese/README.md`
  (il manager approva tutto in ordine, rifiuta il secondo pannello HMI in riu-003; id `task-xxx` e
  `fat-xxx` in ordine di approvazione; aggiorna/chiudi applicati ai task; citazioni e aree confermate
  copiate nelle voci).
- `documenti_demo() -> list[Documento]`: riu-001 … riu-005, poi `doc-001` (PDF, data 2026-11-18).
  Il PDF si carica **dopo riu-005**: caricato prima prenderebbe task-009/010 e fat-009…, e gli
  aggiornamenti registrati delle riunioni successive (task-009) punterebbero al task sbagliato.
- `Simulatore().contesto()`, `.analizza(doc, config)`, `.approva_tutto(risultato)`;
  `esegui_percorso(config) -> (simulatore, [(doc, risultato, decisioni)])`.
- Lo usano `tests/test_workflow.py` e `scripts/demo_brain.py` (con `LLM_PROVIDER=locale LLM_REGISTRA=1`
  registra le risposte vere come mock, F9).

### Versioni dei prompt
`task-v2`, `fatti-v1`, `lacune-v2`, `incongruenze-v1`.
