"""Ricrea il db da zero con l'azienda di dati/azienda.json. Uso: python scripts/crea_db.py"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend import db  # noqa: E402

db.ricrea()
conn = db.connetti()
print(f"db creato in {db.percorso_db()}: {len(db.persone(conn))} persone, "
      f"{conn.execute('SELECT COUNT(*) FROM progetti').fetchone()[0]} progetto")
