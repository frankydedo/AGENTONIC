"""DELETE /documenti/{id}: il manager annulla un caricamento sbagliato, solo se nulla è approvato."""

from conftest import GIULIA, MARCO_B, approva, carica, proposte


def test_annulla_toglie_documento_proposte_e_avvisi(client_vero):
    c = client_vero
    assert carica(c).status_code == 200
    assert proposte(c) and c.get("/avvisi?progetto_id=prj-01&flusso=false", headers=GIULIA).json()
    r = c.delete("/documenti/riu-001", headers=GIULIA)
    assert r.status_code == 200 and r.json()["segmenti"] == 16 and r.json()["proposte"] > 0
    assert proposte(c) == []
    assert c.get("/avvisi?progetto_id=prj-01&flusso=false", headers=GIULIA).json() == []
    assert c.get("/documenti/riu-001", headers=GIULIA).status_code == 404
    assert carica(c).status_code == 200          # si può ricaricare con lo stesso id
    passi = c.get("/registro?progetto_id=prj-01", headers=GIULIA).json()
    assert any(p["step"] == "annulla_caricamento" for p in passi)   # resta tracciato


def test_annulla_rifiutato_se_qualcosa_e_approvato(client_vero):
    c = client_vero
    carica(c)
    approva(c, proposte(c)[0])
    r = c.delete("/documenti/riu-001", headers=GIULIA)
    assert r.status_code == 409 and "have already been approved" in r.json()["detail"]
    assert c.get("/documenti/riu-001", headers=GIULIA).status_code == 200


def test_annulla_solo_il_manager(client_vero):
    c = client_vero
    carica(c)
    assert c.delete("/documenti/riu-001", headers=MARCO_B).status_code == 403
    assert c.delete("/documenti/riu-999", headers=GIULIA).status_code == 404
