-- Schema di Agentonic (SQLite + FTS5). Le liste (aree, alias, citazioni) sono JSON in colonne di testo.
-- Si ricrea da zero con `python scripts/crea_db.py`.

CREATE TABLE persone (
    id TEXT PRIMARY KEY, nome TEXT NOT NULL, ruolo TEXT NOT NULL, reparto TEXT,
    alias TEXT NOT NULL DEFAULT '[]', competenze TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE progetti (
    id TEXT PRIMARY KEY, nome TEXT NOT NULL, cliente TEXT NOT NULL,
    manager_id TEXT NOT NULL REFERENCES persone(id),
    scadenza TEXT NOT NULL, descrizione TEXT NOT NULL DEFAULT ''
);

CREATE TABLE membri (
    progetto_id TEXT NOT NULL REFERENCES progetti(id),
    persona_id TEXT NOT NULL REFERENCES persone(id),
    PRIMARY KEY (progetto_id, persona_id)
);

-- L'id del documento è unico in tutta l'azienda: un secondo documento con lo stesso id si rifiuta (409),
-- non sostituisce mai quello già caricato.
CREATE TABLE documenti (
    id TEXT PRIMARY KEY, progetto_id TEXT NOT NULL REFERENCES progetti(id),
    tipo TEXT NOT NULL, formato TEXT NOT NULL, titolo TEXT NOT NULL, data TEXT NOT NULL,
    ora_inizio TEXT, partecipanti TEXT NOT NULL DEFAULT '[]', caricato_il TEXT NOT NULL, caricato_da TEXT
);

CREATE TABLE segmenti (
    id TEXT PRIMARY KEY,                       -- "riu-001#s001"; PDF: "doc-001#p02s03"
    documento_id TEXT NOT NULL REFERENCES documenti(id),
    n INTEGER NOT NULL, speaker TEXT NOT NULL, persona_id TEXT,
    inizio REAL, fine REAL, pagina INTEGER, testo TEXT NOT NULL
);

CREATE TABLE proposte (
    id TEXT PRIMARY KEY, progetto_id TEXT NOT NULL REFERENCES progetti(id), documento_id TEXT,
    tipo TEXT NOT NULL, stato TEXT NOT NULL DEFAULT 'in_attesa',
    contenuto TEXT NOT NULL, aree_proposte TEXT NOT NULL, aree_confermate TEXT,
    sicurezza TEXT NOT NULL DEFAULT 'alta', citazioni TEXT NOT NULL DEFAULT '[]',
    creata_il TEXT NOT NULL, decisa_da TEXT, decisa_il TEXT
);

-- Memoria del progetto: esiste SOLO ciò che il manager ha approvato.
CREATE TABLE task (
    id TEXT PRIMARY KEY, progetto_id TEXT NOT NULL REFERENCES progetti(id),
    titolo TEXT NOT NULL, assegnatario_id TEXT, scadenza TEXT,
    stato TEXT NOT NULL DEFAULT 'da_fare',     -- "bloccato" può essere dichiarato; in più si calcola dalle dipendenze
    aree TEXT NOT NULL,
    dipende_da TEXT NOT NULL DEFAULT '[]',     -- id di task ("task-004") o rif di proposte ("riu-001:t4")
    rif TEXT,                                  -- rif della proposta da cui nasce ("riu-001:t5")
    citazioni TEXT NOT NULL DEFAULT '[]', proposta_id TEXT
);

CREATE TABLE fatti (
    id TEXT PRIMARY KEY, progetto_id TEXT NOT NULL REFERENCES progetti(id),
    soggetto TEXT NOT NULL, attributo TEXT NOT NULL, valore TEXT NOT NULL,
    aree TEXT NOT NULL, citazioni TEXT NOT NULL DEFAULT '[]', proposta_id TEXT
);

CREATE TABLE avvisi (
    id TEXT PRIMARY KEY, progetto_id TEXT NOT NULL REFERENCES progetti(id), documento_id TEXT,
    tipo TEXT NOT NULL, testo TEXT NOT NULL, citazioni TEXT NOT NULL DEFAULT '[]',
    aree TEXT NOT NULL DEFAULT '[]', basato_su_proposte TEXT NOT NULL DEFAULT '[]',
    solo_manager INTEGER NOT NULL DEFAULT 1,   -- finché il manager non lo inoltra
    inoltrato_a TEXT NOT NULL DEFAULT '[]', proposta_id TEXT,
    risolto INTEGER NOT NULL DEFAULT 0, creato_il TEXT NOT NULL
);

CREATE TABLE todo_oggi (
    persona_id TEXT NOT NULL, data TEXT NOT NULL, task_ids TEXT NOT NULL, accettata_il TEXT NOT NULL,
    PRIMARY KEY (persona_id, data)
);

CREATE TABLE registro (
    id INTEGER PRIMARY KEY AUTOINCREMENT, quando TEXT NOT NULL, progetto_id TEXT,
    tipo TEXT NOT NULL, attore TEXT NOT NULL, step TEXT NOT NULL, documento_id TEXT,
    provider TEXT, modello TEXT, versione_prompt TEXT,
    input TEXT NOT NULL DEFAULT '{}', output TEXT NOT NULL DEFAULT '{}',
    esito TEXT NOT NULL DEFAULT 'ok', motivo TEXT, tentativi INTEGER NOT NULL DEFAULT 1, durata_ms INTEGER
);

-- Indice di ricerca sulle voci APPROVATE (task-xxx o fat-xxx). Le domande passano dal filtro dei
-- permessi, non da qui: l'indice serve al registro, per dire se una risposta neutra nasconde un dato
-- riservato («non autorizzato») o un dato che non c'è («non lo so»).
CREATE VIRTUAL TABLE voci_fts USING fts5(
    voce_id UNINDEXED, progetto_id UNINDEXED, testo,
    tokenize = 'unicode61 remove_diacritics 2'
);
