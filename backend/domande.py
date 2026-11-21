"""«Chiedi al Brain» (I3). Owner: Franky.

`voci` arriva GIÀ filtrata dal backend (solo approvate, solo quelle che `puo_vedere()` concede).
Qui non si decide chi può vedere cosa: lo garantisce chi chiama.

FASE 0, STUB: la parte senza modello è già quella vera (voci vuote -> testo neutro, senza chiamare
il modello); con delle voci restituisce la prima, con le sue citazioni. Il modello arriva in F6.
"""

from backend.modelli import TESTO_NEUTRO, Persona, Risposta, Voce


def risposta_neutra(manager_nome: str) -> Risposta:
    """Stesso testo per «non lo so» e «non autorizzato»: il motivo vero va solo nel registro."""
    return Risposta(esito="non_lo_so", testo=TESTO_NEUTRO.format(manager=manager_nome))


def rispondi(domanda: str, persona: Persona, voci: list[Voce], manager_nome: str) -> Risposta:
    """Domanda + voci visibili alla persona -> `Risposta` con citazioni costruite dal codice."""
    if not voci:
        return risposta_neutra(manager_nome)          # nessuna chiamata al modello
    voce = voci[0]                                    # STUB: in F6 sceglie e scrive il modello
    if not voce.citazioni:
        return risposta_neutra(manager_nome)          # una risposta senza fonti non si mostra
    return Risposta(esito="risposta", testo=voce.testo, citazioni=voce.citazioni)
