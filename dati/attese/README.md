# Attese della demo: formato dei controlli, percorso, id

Owner: Franky (dati sintetici, F7 e F10). Lo leggono `scripts/demo_check.py` (Pietro) e chi scrive i
mock di domande e incongruenze. Tutto è sintetico: Automazioni Dora S.r.l., progetto `prj-01`.

## 1. Formato di `controlli.json`

```json
{"progetto_id": "prj-01",
 "controlli": [{"controllo": 1, "nome": "...", "descrizione": "...", "passi": [ {...}, ... ]}]}
```

- **Ogni controllo parte da un database vuoto** (solo `dati/azienda.json`): lo script ne crea uno
  nuovo per controllo ed esegue i `passi` in ordine. Il primo passo che non dà l'esito atteso fa
  fallire il controllo.
- Ogni passo ha `azione` e `persona` (l'id con cui lo script chiama l'API, cioè la sessione).
- `stato_http` (facoltativo, in ogni passo): codice atteso. Se manca: 2xx.
- **Selettore di proposta** `{"tipo": "nuovo_fatto", "contiene": "7.400"}`: la prima proposta (per id
  crescente) di quel tipo in cui un valore di `contenuto` contiene il testo, senza distinguere
  maiuscole e minuscole. Per `approva` e `rifiuta` si cerca tra le proposte `in_attesa`; lo script le
  legge sempre come manager (`p-01`) e poi chiama l'endpoint come `persona`.
- `contiene` / `deve_contenere` / `non_deve_contenere`: sottostringhe, senza distinguere maiuscole.

| azione | campi | cosa fa e cosa verifica |
|---|---|---|
| `carica_riunione` | `file` | `POST /riunioni?progetto_id=prj-01` con il file |
| `approva_tutte` | `documento`, `tranne` (selettori, facoltativo) | approva in ordine di id tutte le proposte `in_attesa` del documento; quelle che corrispondono a `tranne` le **rifiuta** |
| `approva` | `proposta` (selettore), `aree` (facoltativo) | `POST /proposte/{id}/approva` |
| `rifiuta` | `proposta` (selettore) | `POST /proposte/{id}/rifiuta` |
| `proposte` | `stato`, `deve_esserci`, `non_deve_esserci` (selettori) | `GET /proposte?progetto_id=prj-01&stato=...` |
| `domanda` | `testo`, `esito_atteso`, `deve_contenere`, `non_deve_contenere`, `cita` | `POST /domande`; `esito_atteso` `risposta` o `non_lo_so` (per `non_lo_so` va bene anche `non_autorizzato`: stesso testo neutro); `cita` = id di segmenti che devono stare tra le `citazioni` |
| `avvisi` | `tipo_atteso` + `contiene`, oppure `tipo_assente` | avvisi visibili alla persona: almeno uno del tipo con `contiene` nel testo, oppure nessuno del tipo |
| `todo` | `task` (`{"task-002": {"scadenza": "2026-12-10"}}`), `task_assenti` | `GET /progetti/prj-01/todo`: i task sono visibili con quei valori; quelli assenti non sono visibili |
| `todo_oggi` | `deve_contenere` (id di task) | `GET /persone/{persona}/todo-oggi` |
| `accetta_todo` | `task_ids` | `POST /todo-oggi/accetta` |
| `segmento` | `id`, `campi` | `GET /segmenti/{id}` (`#` codificato): la `Citazione` ha quei valori |

## 2. Percorso della demo (assunzioni sugli id)

- Le riunioni si caricano in ordine, `riu-001` … `riu-005`, e il manager decide le proposte di
  ognuna **prima** di caricare la successiva.
- Il manager **approva tutto, in ordine di id della proposta**, tranne in `riu-003` la proposta
  `nuovo_fatto` sul secondo pannello HMI, che **rifiuta** (controllo 2).
- Le proposte si creano nell'ordine dei mock (prima i task nell'ordine dei `rif`, poi gli
  aggiornamenti, poi i fatti); il backend assegna `task-001`, `task-002`, … e `fat-001`, `fat-002`, …
  in ordine di approvazione, con contatori separati e senza buchi (le rifiutate non prendono id).
- `dipende_da` con `riu-001:t4` diventa `task-004` all'approvazione.
- Gli aggiornamenti delle riunioni 2-5 citano questi id. La tabella è anche in `tests/test_dati.py`.

### Task

| id | titolo | riunione | assegnatario | scadenza (poi) | aree | dipende da |
|---|---|---|---|---|---|---|
| task-001 | Preparare il primo SAL per il cliente | riu-001 | p-05 Luca Gallo | 2026-12-15 | commerciale | |
| task-002 | Cablare il quadro elettrico e prepararlo per il collaudo in officina | riu-001 | p-03 Marco Rinaldi | 2026-12-10 → 2026-12-18 (riu-002) | sviluppo | |
| task-003 | Ordinare gli inverter a Elettrotecnica Piemonte | riu-001 | p-06 Elena Russo | 2026-11-18 → 2026-11-27 (riu-003) | fornitori | |
| task-004 | Preparare la lista dei tag del PLC | riu-001 | nessuno («Marco» ambiguo) → p-02 Marco Bianchi (riu-002) | 2026-11-25 → 2026-11-27 (riu-003) | sviluppo | |
| task-005 | Preparare le schermate della nuova HMI | riu-001 | p-04 Sara Colombo | 2026-12-04 → 2026-12-09 (riu-005) | sviluppo | task-004 |
| task-006 | Fare il sopralluogo sulla linea dal cliente | riu-001 | p-07 Davide Conti | 2026-11-19 | sviluppo | |
| task-007 | Aggiornare il manuale d'uso per gli operatori del cliente | riu-001 | nessuno (resta aperto) | 2027-01-20 | generale | |
| task-008 | Inviare a Giulia i contatti dell'ingegner Venturi | riu-002 | p-07 Davide Conti | 2026-11-23 | sviluppo | |
| task-009 | Chiedere al cliente una conferma scritta sul secondo pannello HMI | riu-003 | p-05 Luca Gallo | 2026-11-27 | commerciale | |
| task-010 | Correggere l'interblocco dell'arresto d'emergenza nel programma PLC | riu-005 | p-02 Marco Bianchi | 2026-12-02 | sviluppo | |
| task-011 | Ripetere la prova al banco del programma PLC corretto | riu-005 | p-07 Davide Conti | 2026-12-03 | sviluppo | task-010 |

Stati alla fine: task-006 `fatto` (riu-002), task-005 `bloccato` (riu-002) → `in_corso` (riu-004),
task-004 e task-003 `fatto` (riu-004), task-002 e task-009 `in_corso` (riu-004); gli altri `da_fare`.

### Fatti

| id | soggetto · attributo | valore (breve) | riunione | aree |
|---|---|---|---|---|
| fat-001 | progetto · scadenza | collaudo presso il cliente entro il 2027-01-20 | riu-001 s001 | generale |
| fat-002 | progetto · budget | 48.000 € approvati, 12.500 € impegnati | riu-001 s003 | budget |
| fat-003 | PLC · decisione | Siemens S7-1500, programma riscritto | riu-001 s004-s005 | sviluppo |
| fat-004 | inverter · fornitore | Elettrotecnica Piemonte, tre settimane | riu-001 s007 | fornitori |
| fat-005 | inverter · costo | 6.200 € | riu-001 s007 | fornitori, budget |
| fat-006 | cliente · requisito | un SAL al mese, il primo entro il 2026-12-15 | riu-001 s002 | commerciale |
| fat-007 | cablaggi esistenti verso i motori · altro | riutilizzabili | riu-002 s004 | sviluppo |
| fat-008 | Davide Conti · altro | ferie dal 2026-12-22 al 2027-01-06 | riu-002 s012 | personale |
| fat-009 | inverter · costo | 7.400 € (prima 6.200 €) | riu-003 s002 | fornitori, budget |
| fat-010 | inverter · decisione | si resta su Elettrotecnica Piemonte | riu-003 s003-s004 | fornitori, budget |
| fat-011 | progetto · budget | 19.900 € impegnati, restano 28.100 € | riu-003 s006 | budget |
| fat-012 | inverter · scadenza | consegna confermata per il 2026-12-11 | riu-004 s006 | fornitori |
| fat-013 | programma PLC · rischio | l'arresto d'emergenza non ferma il nastro | riu-005 s002-s003 | sviluppo |
| fat-014 | banco di prova · altro | libero solo il 2026-12-03 | riu-005 s006 | sviluppo |

Rifiutato (nessun id): `cliente · requisito` «secondo pannello HMI, solo accennato» (riu-003 s008).

## 3. Dove stanno le trappole

| trappola | dove |
|---|---|
| task chiaro e assegnato | riu-001 s002 (SAL, Luca) |
| task senza responsabile | riu-001 s014-s016 (manuale, task-007) |
| nome ambiguo (due «Marco») | riu-001 s009-s010; **chiarito** in riu-002 s008-s010 (è Marco Bianchi) |
| persona e sistema mai visti | riu-002 s005 (ingegner Venturi, MES del cliente) |
| persona dell'azienda fuori dal progetto | riu-002 s012 (Paola Greco, ferie di Davide) |
| scadenza che cambia tra riunioni | riu-002 s002-s003 (quadro 10 → 18 dic); anche riu-003 s005 (ordine inverter), riu-003 s007 (tag), riu-005 s008-s009 (HMI) |
| fatto in conflitto | riu-003 s002 (inverter 6.200 → 7.400 €), riu-003 s006 (budget impegnato) |
| dato con due aree `fornitori` + `budget` | riu-001 s007, riu-003 s002, riu-003 s003-s004 |
| dato visibile solo con `budget` | riu-001 s003, riu-003 s006 |
| dato solo `personale` | riu-002 s012 (lo vede solo Giulia) |
| dipendenza tra persone diverse | riu-001 s008-s012 (HMI di Sara ← tag di Marco), riu-005 s006-s007 (prova di Davide ← correzione di Marco Bianchi) |
| «ho fatto questo» a fine giornata | riu-004 s002 (tag finiti), s003 (HMI sbloccata), s006, s007, s010 |
| evento esterno che rimescola le priorità | riu-005 s002-s009 (errore nel codice PLC) |
| proposta da rifiutare | riu-003 s008 (secondo pannello HMI solo accennato) |

Regola di scrittura: in riu-002 … riu-005 ogni turno parla di una sola area, perché la citazione
mostra il turno intero. Eccezione voluta: riu-003 s004 (decisione sul fornitore e differenza di
prezzo), citata solo da un fatto `fornitori` + `budget`.

## 4. Mock che servono agli altri (non in questa cartella)

**Domande** (`domanda_<...>`, F6). Ogni domanda di `controlli.json` è fatta in un solo stato del
percorso; il mock deve citare queste voci:

| domanda | stato | esito | voci_usate | testo (deve contenere) |
|---|---|---|---|---|
| Quanto budget resta? | riu-001 approvata | risposta | fat-002 | 35.500 € (48.000 − 12.500) |
| Quanto costano gli inverter? | riu-001 approvata | risposta | fat-005 | 6.200 € |
| Chi prepara il primo SAL per il cliente? | riu-001 approvata | risposta | task-001 | Luca Gallo, entro il 15 dicembre |
| Chi aggiorna il manuale d'uso per gli operatori? | riu-001 approvata | risposta | task-007 | non ha ancora un responsabile |
| Che PLC usa il cliente nella linea 2? | riu-001 approvata | non_lo_so | - | - |
| Qual è l'ultimo preventivo degli inverter? | riu-001, riu-002 approvate; riu-003 solo 7.400 approvato | risposta | fat-009 | 7.400 € (prima 6.200 €) |
| Il cliente vuole un secondo pannello HMI? | come sopra, pannello rifiutato | non_lo_so | - | - |

Per Sara (`p-04`) le stesse domande su budget e inverter danno il testo neutro: il codice scarta
`fat-002` e `fat-005`, che lei non riceve.

**Incongruenze** (`incongruenze_<doc>_<n>`, F8; n = indice del fatto nel mock): in conflitto
`riu-003` n=1 (7.400 contro fat-005 6.200) e n=3 (budget contro fat-002); non in conflitto gli altri
candidati con lo stesso attributo (riu-003 n=2 contro fat-003, n=4 contro fat-006; riu-004 n=1
contro fat-001; riu-005 n=2 contro fat-007 e fat-008). Le incongruenze sui task (scadenze,
assegnatario di task-004) sono deterministiche.
