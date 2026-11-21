"""Gli endpoint che usa l'interfaccia: progetti, documenti filtrati, correzioni, to-do vista dal manager."""

from conftest import GIULIA, MARCO_B, PAOLA, SARA, approva, carica, proposte, trova

LUCA = {"X-Persona": "p-05"}


def test_progetti_della_persona(client):
    assert [p["id"] for p in client.get("/progetti", headers=GIULIA).json()] == ["prj-01", "prj-03"]
    assert [p["id"] for p in client.get("/progetti", headers=MARCO_B).json()] == ["prj-01", "prj-02"]
    assert [p["id"] for p in client.get("/progetti", headers=PAOLA).json()] == ["prj-03"]
    assert client.get("/progetti").status_code == 401
    assert client.get("/progetti/prj-02", headers=GIULIA).status_code == 403
    assert client.get("/persone").json()[0]["reparto"] == "Project management"


def test_documento_solo_i_segmenti_che_la_persona_puo_vedere(client):
    carica(client)
    approva(client, trova(client, attributo="budget"))                       # s003, area budget
    approva(client, trova(client, titolo="Schermate della nuova HMI"))       # s011 e s012, area sviluppo
    seg = lambda chi: [s["id"][-4:] for s in client.get("/documenti/riu-001", headers=chi).json()["segmenti"]]
    assert len(seg(GIULIA)) == 16                                            # il manager legge tutto
    assert seg(SARA) == ["s011", "s012"]                                     # la frase sul budget non c'è
    assert seg(MARCO_B) == ["s003", "s011", "s012"]
    assert seg(LUCA) == []                                                   # commerciale: nessuna voce sua
    assert client.get("/documenti/riu-001", headers=PAOLA).status_code == 404   # fuori dal progetto
    assert client.get("/documenti/riu-999", headers=GIULIA).status_code == 404
    elenco = client.get("/documenti?progetto_id=prj-01", headers=SARA).json()
    assert [(d["id"], d["segmenti"]) for d in elenco] == [("riu-001", [])]
    assert client.get("/documenti?progetto_id=prj-01", headers=PAOLA).status_code == 403


def test_avviso_inoltrato_apre_i_suoi_segmenti(client):
    carica(client)
    assert client.get("/segmenti/riu-001%23s009", headers=SARA).status_code == 404
    client.post("/avvisi/avv-001/inoltra", headers=GIULIA, json={"persona_ids": ["p-04"]})
    assert client.get("/segmenti/riu-001%23s009", headers=SARA).status_code == 200
    assert client.get("/segmenti/riu-001%23s009", headers=LUCA).status_code == 404


def test_il_manager_corregge_prima_di_approvare(client):
    carica(client)
    tag = trova(client, titolo="Prepare the PLC tag list")
    assert approva(client, tag, modifiche={"assegnatario_id": "p-08"}).status_code == 422      # non è nel progetto
    assert approva(client, tag, modifiche={"scadenza": "fra un po'"}).status_code == 422
    assert approva(client, tag, modifiche={"valore": "x"}).status_code == 422                  # non è un fatto
    assert approva(client, tag, modifiche={"titolo": "  "}).status_code == 422
    assert len(proposte(client)) == 12                                                         # nessuna decisa a metà
    ok = approva(client, tag, modifiche={"assegnatario_id": "p-02", "scadenza": "2026-11-26",
                                         "titolo": "Lista dei tag <PLC>", "valore": None}).json()
    assert ok["stato"] == "approvata"
    assert ok["contenuto"]["assegnatario_id"] == "p-02" and ok["contenuto"]["scadenza"] == "2026-11-26"
    task = client.get("/progetti/prj-01/todo", headers=GIULIA).json()[0]
    assert (task["titolo"], task["assegnatario_id"], task["scadenza"]) == ("Lista dei tag ‹PLC›", "p-02", "2026-11-26")

    # un campo tolto dal manager (null) resta tolto: il sopralluogo perde responsabile e scadenza
    sopralluogo = approva(client, trova(client, titolo="Sopralluogo sulla linea dal cliente"),
                          modifiche={"assegnatario_id": None, "scadenza": None}).json()
    assert sopralluogo["contenuto"]["assegnatario_id"] is None and sopralluogo["contenuto"]["scadenza"] is None

    fatto = trova(client, attributo="fornitore")
    approva(client, fatto, modifiche={"valore": "Elettrotecnica Piemonte, preventivo 7,400 €"})
    risposta = client.post("/domande", headers=GIULIA, json={"progetto_id": "prj-01", "testo": "preventivo inverter"}).json()
    assert "7,400" in risposta["testo"]

    registro = client.get("/registro?progetto_id=prj-01", headers=GIULIA).json()
    corretta = next(p for p in registro if p["step"] == "approva" and p["input"]["proposta_id"] == tag["id"])
    assert corretta["attore"] == "p-01" and set(corretta["input"]["modifiche"]) == {"assegnatario_id", "scadenza", "titolo"}


def test_punto_oscuro_collegato_alla_proposta_da_correggere(client):
    carica(client)
    avvisi = client.get("/avvisi?progetto_id=prj-01&flusso=false", headers=GIULIA).json()
    tag = trova(client, titolo="Prepare the PLC tag list")
    assert [a["tipo"] for a in avvisi] == ["punto_oscuro", "punto_oscuro"]
    assert avvisi[0]["proposta_id"] == tag["id"]
    assert client.get("/avvisi?progetto_id=prj-01&flusso=false", headers=SARA).json() == []


def test_il_manager_vede_la_todo_dei_suoi(client):
    carica(client)
    approva(client, trova(client, titolo="Prepare the PLC tag list"), assegnatario_id="p-02")
    approva(client, trova(client, titolo="Schermate della nuova HMI"))
    di_sara = client.get("/persone/p-04/todo-oggi", headers=GIULIA)
    assert di_sara.status_code == 200 and [t["titolo"] for t in di_sara.json()["task"]] == ["Schermate della nuova HMI"]
    assert client.get("/persone/p-04/todo-oggi", headers=MARCO_B).status_code == 403    # collega, non manager di Sara
    assert client.get("/persone/p-04/todo-oggi", headers=PAOLA).json()["task"] == []    # dirige prj-03: lì Sara non ha task
    assert client.get("/persone/p-99/todo-oggi", headers=GIULIA).status_code == 403


def test_dipendenza_da_una_proposta_in_attesa_o_rifiutata(client):
    carica(client)
    approva(client, trova(client, titolo="Schermate della nuova HMI"))                  # dipende da riu-001:t4, non ancora deciso
    hmi = lambda: client.get("/progetti/prj-01/todo", headers=GIULIA).json()[0]
    assert (hmi()["stato"], hmi()["dipende_da"]) == ("bloccato", ["riu-001:t4"])
    tag = trova(client, titolo="Prepare the PLC tag list")
    client.post(f"/proposte/{tag['id']}/rifiuta", headers=GIULIA, json={})
    assert (hmi()["stato"], hmi()["dipende_da"]) == ("da_fare", [])                    # rifiutata: la dipendenza cade


def test_chiudi_e_aggiorna_task(client, monkeypatch):
    from backend import app as modulo_app
    from backend.modelli import Proposta, RisultatoAnalisi
    import finti

    carica(client)
    approva(client, trova(client, titolo="Prepare the first progress report for the client"))      # task-001
    approva(client, trova(client, titolo="Sopralluogo sulla linea dal cliente"))        # task-002

    def seconda(doc, contesto):
        cita = finti.citazione(doc, f"{doc.id}#s001")
        nuova = lambda tipo, contenuto: Proposta(progetto_id="prj-01", documento_id=doc.id, tipo=tipo,
                                                 contenuto=contenuto, aree_proposte=["commerciale"], citazioni=[cita])
        return RisultatoAnalisi(proposte=[
            nuova("chiudi_task", {"task_id": "task-002", "campo": "stato", "valore": "annullato"}),
            nuova("aggiorna_task", {"task_id": "task-001", "campo": "scadenza", "valore": "2026-12-22"}),
            nuova("aggiorna_task", {"task_id": "task-001", "campo": "assegnatario", "valore": "p-08"}),
            nuova("aggiorna_task", {"task_id": "task-999", "campo": "stato", "valore": "fatto"}),
        ])
    monkeypatch.setattr(modulo_app, "analizza_documento", seconda)
    from test_caricamento import minuta
    assert carica(client, contenuto=minuta(id="riu-002", titolo="Avanzamento", data="2026-11-23")).status_code == 200
    chiudi, scadenza, fuori, inesistente = proposte(client)[-4:]
    assert approva(client, chiudi).status_code == 200
    assert approva(client, scadenza).status_code == 200
    assert approva(client, fuori).status_code == 422                                    # assegnatario fuori dal progetto
    assert approva(client, inesistente).status_code == 409
    per_id = {t["id"]: t for t in client.get("/progetti/prj-01/todo", headers=GIULIA).json()}
    assert per_id["task-002"]["stato"] == "annullato" and per_id["task-001"]["scadenza"] == "2026-12-22"
    assert {c["documento_id"] for c in per_id["task-001"]["citazioni"]} == {"riu-001", "riu-002"}
