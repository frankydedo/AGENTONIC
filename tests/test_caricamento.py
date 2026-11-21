"""Caricamento dei documenti: un documento non ne sostituisce mai un altro e non cambia progetto in silenzio."""

import json

from backend import db
from conftest import GIULIA, MARCO_B, MINUTA, approva, carica, proposte, trova

PDF = (db.RADICE / "dati" / "documenti" / "doc-001.pdf").read_bytes()
TESTO = MINUTA.decode("utf-8")
PAOLA = {"X-Persona": "p-08"}


def minuta(**intestazione) -> bytes:
    """La minuta di riu-001 con alcune righe dell'intestazione cambiate (None = riga tolta)."""
    righe = []
    for riga in TESTO.splitlines():
        chiave = riga.split(":", 1)[0]
        if riga and not riga.startswith("**") and chiave in intestazione:
            if intestazione[chiave] is not None:
                righe.append(f"{chiave}: {intestazione[chiave]}")
            continue
        righe.append(riga)
    return "\n".join(righe).encode("utf-8")


def stato_db() -> dict:
    conn = db.connetti()
    try:
        return {t: [tuple(r) for r in conn.execute(f"SELECT * FROM {t} ORDER BY 1")]
                for t in ("documenti", "segmenti", "proposte", "avvisi", "task", "fatti")}
    finally:
        conn.close()


# --- Problema 1: un id già usato non si accetta e non sovrascrive ------------------------------------

def test_id_duplicato_rifiutato_e_kick_off_intatto(client):
    assert carica(client).status_code == 200
    approva(client, trova(client, attributo="budget"))
    prima = stato_db()

    altro = TESTO.replace("Kick-off revamping linea 3", "Riunione che vuole sostituire il kick-off") \
                 .replace("Buongiorno a tutti.", "Testo completamente diverso.").encode("utf-8")
    r = carica(client, contenuto=altro, nome="un-altro-file.md")
    assert r.status_code == 409
    assert "riu-001" in r.json()["detail"] and "Kick-off revamping linea 3" in r.json()["detail"]
    assert carica(client).status_code == 409                       # anche lo stesso identico file
    assert carica(client, percorso="/documenti").status_code == 409   # e anche dall'altro endpoint

    assert stato_db() == prima                                     # nulla è stato toccato
    doc = client.get("/documenti/riu-001", headers=GIULIA).json()
    assert doc["titolo"] == "Kick-off revamping linea 3" and doc["segmenti"][0]["testo"].startswith("Buongiorno")


def test_id_duplicato_in_un_altro_progetto_rifiutato_senza_rivelare_nulla(client):
    carica(client)
    r = carica(client, chi=MARCO_B, progetto="prj-02", contenuto=minuta(progetto=None))   # Marco B. dirige prj-02
    assert r.status_code == 409 and "Kick-off" not in r.json()["detail"]
    assert client.get("/documenti?progetto_id=prj-02", headers=MARCO_B).json() == []


def test_il_rifiuto_di_un_doppione_resta_nel_db_pulito_e_si_puo_caricare_un_id_nuovo(client):
    carica(client)
    assert carica(client).status_code == 409
    r = carica(client, contenuto=minuta(id="riu-002", titolo="Avanzamento", data="2026-11-23"), nome="riu-002.md")
    assert r.status_code == 200 and r.json()["documento_id"] == "riu-002"
    assert [d["id"] for d in client.get("/documenti?progetto_id=prj-01", headers=GIULIA).json()] == ["riu-001", "riu-002"]


# --- Problema 2: il progetto dell'intestazione non si cambia in silenzio ------------------------------

def test_intestazione_di_un_altro_progetto_rifiutata(client):
    r = carica(client, contenuto=minuta(progetto="prj-02"))        # intestazione prj-02, caricata in prj-01
    assert r.status_code == 422
    assert "prj-02" in r.json()["detail"] and "prj-01" in r.json()["detail"]
    assert all(v == [] for v in stato_db().values())               # non è stato salvato nulla
    assert client.get("/documenti?progetto_id=prj-01", headers=GIULIA).json() == []
    assert carica(client).status_code == 200                       # con l'intestazione giusta si carica


def test_intestazione_di_prj_02_si_carica_solo_in_prj_02(client):
    di_prj02 = minuta(progetto="prj-02")
    assert carica(client, chi=GIULIA, progetto="prj-02", contenuto=di_prj02).status_code == 403   # Giulia non è in prj-02
    r = carica(client, chi=MARCO_B, progetto="prj-02", contenuto=di_prj02)
    assert r.status_code == 200
    assert [d["progetto_id"] for d in client.get("/documenti?progetto_id=prj-02", headers=MARCO_B).json()] == ["prj-02"]
    assert client.get("/documenti?progetto_id=prj-01", headers=GIULIA).json() == []


def test_intestazione_senza_progetto_va_nel_progetto_scelto(client):
    r = carica(client, contenuto=minuta(progetto=None))
    assert r.status_code == 200
    assert client.get("/documenti/riu-001", headers=GIULIA).json()["progetto_id"] == "prj-01"


# --- Documenti non validi ------------------------------------------------------------------------------

def test_documenti_non_validi_rifiutati_senza_salvare(client):
    casi = [b"solo testo, niente intestazione", minuta(id="RIU-009"), minuta(data="domani"),
            minuta(id="riu 001"), b"\xff\xfe\x00binario", b""]
    for contenuto in casi:
        r = carica(client, contenuto=contenuto)
        assert r.status_code == 422 and r.json()["detail"].startswith("Documento non valido"), contenuto[:30]
    assert all(v == [] for v in stato_db().values())


def test_file_troppo_grande(client):
    assert carica(client, contenuto=b"x" * (10 * 1024 * 1024 + 1)).status_code == 413


# --- PDF ------------------------------------------------------------------------------------------------

def test_pdf_integrativo(client):
    r = carica(client, contenuto=PDF, nome="Capitolato tecnico.pdf", percorso="/documenti")
    assert r.status_code == 200 and r.json()["documento_id"] == "doc-001" and r.json()["segmenti"] > 5
    doc = client.get("/documenti/doc-001", headers=GIULIA).json()
    assert (doc["tipo"], doc["formato"], doc["titolo"]) == ("integrativo", "pdf", "Capitolato tecnico")
    assert doc["segmenti"][0]["id"].startswith("doc-001#p01s") and doc["segmenti"][0]["pagina"] == 1
    assert client.get("/segmenti/" + doc["segmenti"][0]["id"].replace("#", "%23"), headers=GIULIA).json()["pagina"] == 1

    # il secondo PDF prende l'id successivo; un id esplicito già usato si rifiuta
    assert carica(client, contenuto=PDF, nome="altro.pdf", percorso="/documenti").json()["documento_id"] == "doc-002"
    assert carica(client, contenuto=PDF, nome="altro.pdf", percorso="/documenti", id="doc-001").status_code == 409
    assert carica(client, contenuto=PDF, nome="x.pdf", percorso="/documenti", id="Doc 9").status_code == 422
    assert carica(client, contenuto=PDF, nome="x.pdf", percorso="/documenti", data="domani").status_code == 422
    con_dati = carica(client, contenuto=PDF, nome="x.pdf", percorso="/documenti", id="cap-01",
                      titolo="Capitolato <b>cliente</b>", data="2026-11-18")
    assert con_dati.status_code == 200
    cap = client.get("/documenti/cap-01", headers=GIULIA).json()
    assert cap["data"] == "2026-11-18" and "<" not in cap["titolo"]


def test_finto_pdf_rifiutato(client):
    assert carica(client, contenuto=b"%PDF-1.7 non sono un pdf", nome="x.pdf", percorso="/documenti").status_code == 422
    assert carica(client, contenuto=MINUTA, nome="minuta.pdf", percorso="/documenti").status_code == 422


def test_registro_del_caricamento(client):
    carica(client)
    passi = client.get("/registro?progetto_id=prj-01", headers=GIULIA).json()
    primo = passi[-1]
    assert (primo["tipo"], primo["attore"], primo["step"], primo["documento_id"]) == ("caricamento", "p-01", "caricamento", "riu-001")
    assert "Buongiorno" not in json.dumps(passi)                   # nel registro mai il testo dei documenti
