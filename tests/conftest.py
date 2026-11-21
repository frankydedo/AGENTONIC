import pytest
from fastapi.testclient import TestClient

from backend import app as modulo_app
from backend import db

import finti

MINUTA = (db.RADICE / "dati" / "riunioni" / "riu-001.md").read_bytes()
GIULIA, MARCO_B, SARA, PAOLA = ({"X-Persona": p} for p in ("p-01", "p-02", "p-04", "p-08"))


@pytest.fixture
def client(tmp_path, monkeypatch):
    """Db nuovo per ogni test e cervello finto (nessun modello, nessuna rete)."""
    monkeypatch.setenv("BRAIN_DB", str(tmp_path / "test.db"))
    db.ricrea()
    for nome in ("analizza_documento", "rispondi"):
        monkeypatch.setattr(modulo_app, nome, getattr(finti, nome))
    return TestClient(modulo_app.app)


def carica(client, chi=GIULIA, contenuto=MINUTA):
    return client.post("/riunioni?progetto_id=prj-01", headers=chi, files={"file": ("riu-001.md", contenuto)})


def proposte(client):
    return client.get("/proposte?progetto_id=prj-01", headers=GIULIA).json()


def trova(client, **campi):
    """La proposta in attesa il cui contenuto ha questi campi (es. attributo='budget')."""
    return next(p for p in proposte(client) if all(p["contenuto"].get(k) == v for k, v in campi.items()))


def approva(client, proposta, **corpo):
    return client.post(f"/proposte/{proposta['id']}/approva", headers=GIULIA, json=corpo)


def chiedi(client, chi, testo):
    return client.post("/domande", headers=chi, json={"progetto_id": "prj-01", "testo": testo}).json()
