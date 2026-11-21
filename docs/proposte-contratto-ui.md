# Proposte di contratto dalla UI (da concordare con Pietro)

Autore: Mauro, 21/11 14:00. **Niente di questo è ancora nel backend**: la UI è già pronta e, finché
un endpoint manca, usa dati d'esempio (etichetta gialla «Dati d'esempio» in alto) oppure ignora il
campo in più. Quando il backend li implementa, la UI li usa da sola, senza modifiche.

Tutte le proposte sono **aggiunte**: nessun campo esistente cambia nome o significato.

## 1. Documenti caricati (pagina Documenti + citazioni che aprono la fonte)

| Metodo e percorso | Chi | Risposta |
|---|---|---|
| `GET /documenti?progetto_id=prj-01` | membri | `Documento[]` (anche senza `segmenti`, per alleggerire) |
| `GET /documenti/{id}` | membri | `Documento` **con** `segmenti` |
| `GET /documenti/{id}/file` | membri | il file originale (audio, video, pdf), se c'è |

Campo nuovo in `Documento`:
- `url_file: str | None = None`: l'URL del file originale, ad esempio `/documenti/riu-001/file`.
  Con `formato` audio/video la UI mostra un lettore sincronizzato con i segmenti (`inizio`/`fine`).

Valore nuovo in `Documento.formato`: `"video"` (accanto ad `"audio"`).

Oggi la UI ripiega sul documento `riu-001` generato da `dati/riunioni/riu-001.md`
(`web/src/finti/riu-001.json`, 16 segmenti, id `riu-001#s001`…). Segmenti con gli stessi id delle citazioni
di `backend/esempi.py`.

Una citazione apre `/documenti/{documento_id}?seg=s009` ed evidenzia quel segmento.

## 2. Il manager corregge una proposta prima di approvarla (punti oscuri)

`POST /proposte/{id}/approva`, campo nuovo nel corpo (`Decisione`):
```json
{ "aree": ["sviluppo"], "nota": null,
  "modifiche": { "assegnatario_id": "p-02", "scadenza": "2026-11-26", "titolo": "…", "valore": "…" } }
```
- `modifiche: dict | None = None`, con chiavi ammesse `titolo`, `assegnatario_id`, `scadenza` (per i
  task) e `valore` (per i fatti). Il backend le applica al `contenuto` prima di creare il task o il
  fatto, e le scrive nel registro (chi ha corretto cosa).
- Oggi Pydantic ignora il campo; la UI mostra comunque le correzioni nella sessione.

## 3. Collegare un avviso alla proposta da correggere

Campo nuovo in `Avviso`: `proposta_id: str | None = None`. Serve per il pulsante «Correggi» su un punto
oscuro. Oggi la UI li collega quando citano lo stesso segmento (prop-002 e avv-001 su `s009`).

Consiglio per `esempi.py`: aggiungere la proposta del manuale senza responsabile (s014), così anche
avv-002 diventa correggibile in demo.

## 4. Il manager vede la to-do del giorno di ognuno (vista Team)

`GET /persone/{id}/todo-oggi`: oggi risponde 403 se `id` non è la persona stessa. Proposta: lo può
leggere **anche il manager del progetto**. Finché è 403, la UI la stima dai task del progetto (etichetta
«stimata dai task»).

## 5. Tempo dei task (Gantt)

Nessuna modifica obbligatoria: la UI fa partire la barra dalla data della riunione citata e la fa finire
alla scadenza. Un task che dipende da un altro parte quando scade quello. Se servisse una data di inizio
esplicita, basta un campo opzionale `Task.inizio: str | None`.
