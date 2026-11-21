"""Svuota il db dell'app: toglie progetti e tutti i dati di lavoro, lascia le persone.
Uso: python scripts/svuota_db.py            (anche i progetti)
     python scripts/svuota_db.py --tieni-progetti
Per ripartire dai progetti d'esempio di dati/azienda.json: python scripts/crea_db.py"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend import db  # noqa: E402

conn = db.connetti()
db.svuota(conn, anche_progetti="--tieni-progetti" not in sys.argv)
conn.commit()
conta = lambda t: conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]  # noqa: E731
print(f"db svuotato ({db.percorso_db()}): {conta('persone')} persone, {conta('progetti')} progetti, "
      f"{conta('documenti')} documenti, {conta('proposte')} proposte")
