"""CRUD dei progetti: chi può fare cosa, regole sui dati, cancellazione a cascata."""
from datetime import date, timedelta

from backend import db
from conftest import GIULIA, MARCO_B, PAOLA, SARA, carica

DOMANI = (date.today() + timedelta(days=1)).isoformat()


def nuovo(**diversi):
    return {"nome": "Revamping linea 4", "cliente": "Pastificio Valsangone S.p.A.", "manager_id": "p-01",
            "membri": ["p-04"], "scadenza": DOMANI, "descrizione": "", **diversi}


def test_crea_solo_il_project_manager(client):
    r = client.post("/progetti", json=nuovo(), headers=GIULIA)
    assert r.status_code == 201
    prj = r.json()
    assert prj["id"].startswith("prj-") and prj["manager_id"] == "p-01"
    assert set(prj["membri"]) == {"p-01", "p-04"}           # il manager è sempre tra i membri
    for altri in (MARCO_B, SARA, PAOLA):                       # manager di un progetto, ma non «project manager»
        assert client.post("/progetti", json=nuovo(), headers=altri).status_code == 403


def test_il_nuovo_progetto_lo_vedono_solo_i_membri(client):
    pid = client.post("/progetti", json=nuovo(), headers=GIULIA).json()["id"]
    assert pid in [p["id"] for p in client.get("/progetti", headers=SARA).json()]
    assert pid not in [p["id"] for p in client.get("/progetti", headers=MARCO_B).json()]
    assert client.get(f"/progetti/{pid}", headers=MARCO_B).status_code == 403


def test_regole_sui_dati(client):
    ieri = (date.today() - timedelta(days=1)).isoformat()
    for corpo in (nuovo(nome="  "), nuovo(cliente=""), nuovo(scadenza=ieri), nuovo(scadenza="31/12/2027"),
                  nuovo(membri=["p-99"]), nuovo(manager_id="p-99")):
        assert client.post("/progetti", json=corpo, headers=GIULIA).status_code == 422, corpo


def test_modifica_solo_il_manager_del_progetto(client):
    assert client.patch("/progetti/prj-01", json=nuovo(nome="Linea 3 bis"), headers=SARA).status_code == 403
    assert client.patch("/progetti/prj-01", json=nuovo(nome="Linea 3 bis"), headers=PAOLA).status_code == 403
    r = client.patch("/progetti/prj-01", json=nuovo(nome="Linea 3 bis", membri=["p-02", "p-04"]), headers=GIULIA)
    assert r.status_code == 200
    assert r.json()["nome"] == "Linea 3 bis" and set(r.json()["membri"]) == {"p-01", "p-02", "p-04"}
    # chi è stato tolto non vede più il progetto
    assert client.get("/progetti/prj-01", headers={"X-Persona": "p-05"}).status_code == 403


def test_elimina_il_progetto_e_tutti_i_suoi_dati(client):
    assert carica(client).status_code == 200
    assert client.delete("/progetti/prj-01", headers=SARA).status_code == 403
    assert client.delete("/progetti/prj-01", headers=GIULIA).status_code == 204
    assert client.get("/progetti/prj-01", headers=GIULIA).status_code == 403
    conn = db.connetti()
    for tabella in ("documenti", "proposte", "avvisi", "membri"):
        assert conn.execute(f"SELECT COUNT(*) FROM {tabella} WHERE progetto_id = 'prj-01'").fetchone()[0] == 0, tabella
    assert conn.execute("SELECT COUNT(*) FROM segmenti WHERE documento_id = 'riu-001'").fetchone()[0] == 0
    # gli altri progetti restano
    assert conn.execute("SELECT COUNT(*) FROM progetti").fetchone()[0] == 2


def test_ogni_operazione_va_nel_registro(client):
    pid = client.post("/progetti", json=nuovo(), headers=GIULIA).json()["id"]
    client.patch(f"/progetti/{pid}", json=nuovo(nome="Altro nome"), headers=GIULIA)
    passi = [p["step"] for p in client.get(f"/registro?progetto_id={pid}", headers=GIULIA).json()]
    assert {"crea_progetto", "modifica_progetto"} <= set(passi)


def test_svuota_lascia_solo_le_persone(client):
    carica(client)
    conn = db.connetti()
    db.svuota(conn)
    conn.commit()
    assert conn.execute("SELECT COUNT(*) FROM persone").fetchone()[0] == 8
    for tabella in ("progetti", "membri", "documenti", "segmenti", "proposte", "task", "avvisi", "registro"):
        assert conn.execute(f"SELECT COUNT(*) FROM {tabella}").fetchone()[0] == 0, tabella
