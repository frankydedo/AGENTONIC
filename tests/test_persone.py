"""F4, persone: abbinamento deterministico dei nomi detti alle persone."""

import json
from pathlib import Path

from backend.analisi.ingestione import segmenta
from backend.analisi.persone import abbina_nome, abbina_speaker, classifica_sconosciuto, normalizza
from backend.modelli import Persona, Sconosciuto

RADICE = Path(__file__).parent.parent
DATI = json.loads((RADICE / "dati" / "azienda.json").read_text())
PRJ = DATI["progetti"][0]
TUTTE = [Persona(**p) for p in DATI["persone"]]
MEMBRI = [p for p in TUTTE if p.id in PRJ["membri"]]
FUORI = [p for p in TUTTE if p.id not in PRJ["membri"]]


def test_normalizza():
    assert normalizza("  Marco   B. ") == "marco b"
    assert normalizza("NICCOLÒ Ferrè") == "niccolo ferre"


def test_marco_ambiguo():
    ab = abbina_nome("Marco", MEMBRI)
    assert ab.persona_id is None
    assert ab.candidati == ["p-02", "p-03"]
    assert ab.motivo == '"Marco" è ambiguo: Marco Bianchi o Marco Rinaldi'


def test_alias_con_punto_e_cognome():
    assert abbina_nome("Marco B.", MEMBRI).persona_id == "p-02"
    assert abbina_nome("marco b", MEMBRI).persona_id == "p-02"
    assert abbina_nome("Rinaldi", MEMBRI).persona_id == "p-03"
    assert abbina_nome("Marco Rinaldi", MEMBRI).persona_id == "p-03"
    assert abbina_nome("sara", MEMBRI).persona_id == "p-04"


def test_nome_con_accento():
    persone = [Persona(id="p-90", nome="Niccolò Ferrè", ruolo="test"), Persona(id="p-91", nome="Anna Neri", ruolo="t")]
    assert abbina_nome("Niccolo Ferre", persone).persona_id == "p-90"
    assert abbina_nome("ferrè", persone).persona_id == "p-90"
    assert abbina_nome("Ànna", persone).persona_id == "p-91"


def test_non_membro_e_nome_vuoto():
    ab = abbina_nome("Paola Greco", MEMBRI)
    assert ab.persona_id is None and ab.candidati == []
    assert ab.motivo == '"Paola Greco" non è un membro del progetto'
    assert abbina_nome(None, MEMBRI).persona_id is None
    assert abbina_nome("  ", MEMBRI).candidati == []


def test_abbina_speaker_copia_il_documento():
    doc = segmenta((RADICE / "dati" / "riunioni" / "riu-001.md").read_text())
    nuovo = abbina_speaker(doc, MEMBRI)
    assert all(s.persona_id is None for s in doc.segmenti)          # l'originale non cambia
    assert nuovo is not doc
    assert nuovo.segmenti[0].persona_id == "p-01"                    # Giulia Ferraris
    assert nuovo.segmenti[3].persona_id == "p-02"                    # Marco Bianchi
    assert nuovo.segmenti[5].persona_id == "p-03"                    # Marco Rinaldi
    assert all(s.persona_id for s in nuovo.segmenti)


def test_abbina_speaker_sconosciuto_resta_none():
    doc = segmenta("---\nid: riu-099\ntitolo: T\ndata: 2026-11-20\n---\n\n**Ing. Venturi:** Buongiorno.\n")
    assert abbina_speaker(doc, MEMBRI).segmenti[0].persona_id is None


def test_paola_greco_fuori_progetto():
    s = Sconosciuto(nome="Paola Greco", descrizione="citata per le ferie", segmenti=["riu-002#s004"])
    assert classifica_sconosciuto(s, FUORI).persona_id == "p-08"
    assert s.persona_id is None                                      # nessuna modifica in place


def test_sconosciuto_vero_e_persona_id_del_modello_ignorato():
    s = Sconosciuto(nome="Ing. Venturi", descrizione="referente", segmenti=["riu-002#s001"], persona_id="p-01")
    assert classifica_sconosciuto(s, FUORI).persona_id is None
