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
    assert ab.motivo == '"Marco" is ambiguous: Marco Bianchi or Marco Rinaldi'


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


def test_nome_composto_di_piu_parole():
    """Segnalazione 12: «Gian Marco» trova «Gian Marco Rossi» (prefisso di parole intere)."""
    gian = Persona(id="p-90", nome="Gian Marco Rossi", ruolo="test")
    persone = MEMBRI + [gian]
    for detto in ("Gian Marco", "gian  marco", "Gian Marco Rossi", "Gian"):
        ab = abbina_nome(detto, persone)
        assert (ab.persona_id, ab.candidati) == ("p-90", ["p-90"]), detto
    # l'ambiguità non cambia: «Marco» resta fra i due Marco e non include Gian Marco Rossi
    ab = abbina_nome("Marco", persone)
    assert ab.persona_id is None and ab.candidati == ["p-02", "p-03"]
    assert ab.motivo == '"Marco" is ambiguous: Marco Bianchi or Marco Rinaldi'
    assert abbina_nome("Marco Bianchi", persone).persona_id == "p-02"
    # «Gian Marco» non si abbina a «Marco Bianchi», né un pezzo di parola a un nome
    senza_gian = abbina_nome("Gian Marco", MEMBRI)
    assert senza_gian.persona_id is None and senza_gian.candidati == []
    assert abbina_nome("Gian Mar", persone).candidati == [] and abbina_nome("Gia", persone).candidati == []
    # due persone con lo stesso nome composto: ambiguo, non si sceglie
    doppio = abbina_nome("Gian Marco", persone + [Persona(id="p-91", nome="Gian Marco Bruni", ruolo="test")])
    assert doppio.persona_id is None and doppio.candidati == ["p-90", "p-91"]
    assert doppio.motivo == '"Gian Marco" is ambiguous: Gian Marco Rossi or Gian Marco Bruni'


def test_apostrofo_tipografico():
    """Segnalazione 12: «D’Amico» (apostrofo tipografico) è la stessa persona di «D'Amico»."""
    persone = [Persona(id="p-90", nome="Luca D'Amico", ruolo="test"),
               Persona(id="p-91", nome="Anna D’Angelo", ruolo="test", alias=["Dell‘Orto"])]
    for detto in ("D’Amico", "D‘Amico", "d'amico", "D`Amico", "Luca D’Amico"):
        assert abbina_nome(detto, persone).persona_id == "p-90", detto
    for detto in ("D'Angelo", "Anna D’Angelo", "Dell'Orto"):
        assert abbina_nome(detto, persone).persona_id == "p-91", detto
    assert normalizza("D’Amico") == normalizza("D'Amico") == "d'amico"


def test_non_membro_e_nome_vuoto():
    ab = abbina_nome("Paola Greco", MEMBRI)
    assert ab.persona_id is None and ab.candidati == []
    assert ab.motivo == '"Paola Greco" is not a project member'
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


def test_sconosciuti_con_titolo_regola_deterministica():
    from backend.analisi.ingestione import segmenta
    from backend.analisi.persone import sconosciuti_con_titolo
    doc = segmenta("---\nid: riu-099\ntitolo: t\ndata: 2026-11-23\n---\n"
                   "**Giulia Ferraris:** L'ingegner Venturi del cliente vuole le schermate.\n\n"
                   "**Giulia Ferraris:** Ne parlo con l'ing. Rinaldi e con il dott. Rossi.")
    nomi = [s.nome for s in sconosciuti_con_titolo(doc, MEMBRI, [])]
    assert nomi == ["ingegner Venturi", "dott. Rossi"]          # Rinaldi è un membro
    gia = [s for s in sconosciuti_con_titolo(doc, MEMBRI, [])][:1]
    assert [s.nome for s in sconosciuti_con_titolo(doc, MEMBRI, gia)] == ["dott. Rossi"]   # niente doppioni
