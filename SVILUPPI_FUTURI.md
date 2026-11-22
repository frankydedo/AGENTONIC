# Sviluppi futuri

Cosa manca ad Agentonic per passare dal prototipo dell'hackathon a un prodotto. Le voci sono raggruppate
per tema, senza un ordine di priorità.

## Integrazioni
- Provider di posta reali (Gmail, Outlook) dietro l'interfaccia già esistente
- Strumenti ElevenLabs reali (oggi la trascrizione è simulata nel formato della loro API)
- Sezione calendario
- Widget per altre app di lavoro: Teams, Gmail, Outlook…

## Posta e documenti
- Inviare ad Agentonic una o più mail selezionate, indicando a quale contesto (progetto) appartengono
- Gestione dei documenti caricati: consultare, scaricare e riascoltare i file originali (audio, video, PDF)

## Esperienza d'uso
- Bacheca personalizzabile con widget trascinabili (drag & drop)
- To-do list più leggibile
- Categorie delle task: assegnarle, crearle e gestirle
- Filtri creati al momento chiedendoli all'agente
- Notifiche: email ricevute, avvisi inoltrati, nuove proposte
- Riepilogo giornaliero o settimanale generato da Agentonic

## Manager e supervisori
- Gestione e monitoraggio migliori delle persone e delle loro task
- Riaprire una proposta rifiutata

## Memoria
- Storico delle versioni di ogni fatto, per seguire come cambia nel tempo
- Contesto più ampio per il modello (oggi 16k token, al massimo 30 voci per domanda)

## Affidabilità e infrastruttura
- Un modello sempre raggiungibile, con un modello di riserva automatico se il principale non risponde
- Database più robusto (backup, migrazioni dello schema, più utenti e più aziende)
- Monitoraggio del sistema (uso, errori, qualità delle risposte)

## Sicurezza e conformità
- Login con SSO (per esempio Keycloak) al posto della scelta della persona
- Gestione degli abusi: limite alle richieste e controllo dei costi del modello
- Regole di conservazione e cancellazione dei dati (GDPR)
- Rafforzamento generale della sicurezza
