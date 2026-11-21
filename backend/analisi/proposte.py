"""Proposte (F4): dall'estrazione del modello a proposte e avvisi per il manager.

Codice deterministico, nessun modello. Qui si applicano le regole che non si lasciano al prompt:
- le citazioni si costruiscono solo con `ingestione.citazione`; un id di segmento che non
  esiste nel documento fa scartare l'elemento (anche un elemento senza segmenti);
- le persone si risolvono con `persone.abbina_nome`; se il nome è ambiguo o manca, il manager
  riceve un punto oscuro invece di un'assegnazione silenziosa;
- sicurezza `bassa` -> solo un punto oscuro, nessuna proposta;
- una scadenza che non è una data AAAA-MM-GG valida -> task proposto con `scadenza=None` più un
  punto oscuro; per un aggiornamento di scadenza, solo il punto oscuro;
- regole sulle aree (vedi `regola_aree`).
Nessun id: proposte e avvisi li salva il backend. Nel passo del registro solo conteggi.
"""

from collections import Counter
from datetime import datetime

from backend.analisi import ingestione
from backend.analisi.persone import abbina_nome, classifica_sconosciuto
from backend.modelli import (
    Avviso, Citazione, ContestoProgetto, Documento, EstrazioneRiunione, PassoRegistro, Proposta,
)

STATI_CHIUSI = ("fatto", "annullato")
STATI_APERTI = ("da_fare", "in_corso", "bloccato")


def regola_aree(aree: list[str], attributo: str | None = None) -> list[str]:
    """Vuote -> vuote (solo il manager); budget/costo -> +budget; `generale` solo se da sola."""
    risultato = list(dict.fromkeys(aree))
    if attributo in ("budget", "costo") and "budget" not in risultato:
        risultato = ["budget"]   # area sbagliata dal modello: solo budget, non «budget + quella sbagliata»
    if "generale" in risultato and len(risultato) > 1:
        risultato.remove("generale")
    return risultato


def data_valida(testo: str | None) -> bool:
    """Vero per una data reale nel formato AAAA-MM-GG («2026-12-10»)."""
    if not testo or len(testo) != 10:
        return False
    try:
        datetime.strptime(testo, "%Y-%m-%d")
        return True
    except ValueError:
        return False


def _citazioni(doc: Documento, segmenti: list[str]) -> list[Citazione] | None:
    """Citazioni dai segmenti veri; None se la lista è vuota o un id non esiste nel documento."""
    if not segmenti:
        return None
    try:
        return [ingestione.citazione(doc, sid) for sid in dict.fromkeys(segmenti)]
    except KeyError:
        return None


def in_proposte(estr: EstrazioneRiunione, doc: Documento, contesto: ContestoProgetto,
                ) -> tuple[list[Proposta], list[Avviso], PassoRegistro]:
    progetto_id = contesto.progetto.id
    task_esistenti = {t.id: t for t in contesto.task}
    proposte: list[Proposta] = []
    avvisi: list[Avviso] = []
    scarti: Counter = Counter()
    dipendenze_tolte = 0
    date_non_chiare = 0

    def proponi(tipo, contenuto, aree, sicurezza, citazioni):
        proposte.append(Proposta(progetto_id=progetto_id, documento_id=doc.id, tipo=tipo, stato="in_attesa",
                                 contenuto=contenuto, aree_proposte=list(aree), sicurezza=sicurezza,
                                 citazioni=citazioni))

    def avvisa(tipo, testo, citazioni, aree=()):
        avvisi.append(Avviso(progetto_id=progetto_id, documento_id=doc.id, tipo=tipo, testo=testo,
                             citazioni=citazioni, aree=list(aree), solo_manager=True))

    # --- Task nuovi ------------------------------------------------------------------------------
    # Prima si decide quali task diventano proposte: solo i loro `rif` valgono come dipendenze.
    validi = []
    for t in estr.task:
        cit = _citazioni(doc, t.segmenti)
        if cit is None:
            scarti["segmento_inesistente"] += 1
        else:
            validi.append((t, cit))
    rif_proposti = {t.rif for t, _ in validi if t.sicurezza != "bassa"}

    for t, cit in validi:
        aree = regola_aree(t.aree)
        ab = abbina_nome(t.assegnatario_detto, contesto.persone)
        if not (t.assegnatario_detto or "").strip():
            dubbio = f'The task "{t.titolo}" has no owner. Who will take care of it?'
        elif ab.persona_id is None and ab.candidati:
            dubbio = f'{ab.motivo}. Who is taking care of "{t.titolo}"?'
        elif ab.persona_id is None:
            dubbio = (f'The task "{t.titolo}" names "{t.assegnatario_detto.strip()}", who is not a '
                      f'project member. Who will take care of it?')
        else:
            dubbio = None

        if t.sicurezza == "bassa":
            testo = f'It\'s not clear whether "{t.titolo}" is a decided task: it wasn\'t proposed and needs checking.'
            avvisa("punto_oscuro", f"{testo} {dubbio}" if dubbio else testo, cit, aree)
            continue

        dipende_da = []
        for d in t.dipende_da:
            locale = d.removeprefix(f"{doc.id}:")
            if d in task_esistenti:
                dipende_da.append(d)
            elif locale in rif_proposti and locale != t.rif:
                dipende_da.append(f"{doc.id}:{locale}")
            else:
                dipendenze_tolte += 1
        scadenza = t.scadenza
        if scadenza is not None and not data_valida(scadenza.strip()):
            date_non_chiare += 1
            avvisa("punto_oscuro", f'The deadline "{scadenza.strip()}" of "{t.titolo}" is not a clear date.',
                   cit, aree)
            scadenza = None
        elif scadenza is not None:
            scadenza = scadenza.strip()
        contenuto = {"progetto_id": progetto_id, "titolo": t.titolo, "assegnatario_id": ab.persona_id,
                     "scadenza": scadenza, "stato": "da_fare", "aree": list(aree),
                     "dipende_da": list(dict.fromkeys(dipende_da)), "rif": f"{doc.id}:{t.rif}"}
        proponi("nuovo_task", contenuto, aree, t.sicurezza, cit)
        if dubbio:
            avvisa("punto_oscuro", dubbio, cit, aree)

    # --- Aggiornamenti di task approvati ---------------------------------------------------------
    for a in estr.aggiornamenti:
        task = task_esistenti.get(a.task_id)
        if task is None:
            scarti["task_inesistente"] += 1
            continue
        cit = _citazioni(doc, a.segmenti)
        if cit is None:
            scarti["segmento_inesistente"] += 1
            continue
        aree = list(task.aree)
        valore = a.valore.strip()
        if a.sicurezza == "bassa":
            avvisa("punto_oscuro", f'Forse cambia il campo "{a.campo}" del task "{task.titolo}" '
                   f'(nuovo valore: {valore}), ma non è chiaro: va verificato.', cit, aree)
            continue
        if a.campo == "stato":
            valore = valore.lower()
            if valore in STATI_CHIUSI:
                proponi("chiudi_task", {"task_id": task.id, "campo": "stato", "valore": valore}, aree, a.sicurezza, cit)
                continue
            if valore not in STATI_APERTI:
                scarti["stato_non_valido"] += 1
                continue
        elif a.campo == "scadenza" and not data_valida(valore):
            date_non_chiare += 1
            avvisa("punto_oscuro", f'The deadline "{valore}" of "{task.titolo}" is not a clear date.', cit, aree)
            continue
        elif a.campo == "assegnatario":
            ab = abbina_nome(valore, contesto.persone)
            if ab.persona_id is None:
                motivo = ab.motivo if ab.candidati else f'"{valore}" non è un membro del progetto'
                avvisa("punto_oscuro", f'{motivo}. Chi deve occuparsi di "{task.titolo}"?', cit, aree)
                continue
            valore = ab.persona_id
        proponi("aggiorna_task", {"task_id": task.id, "campo": a.campo, "valore": valore}, aree, a.sicurezza, cit)

    # --- Fatti -----------------------------------------------------------------------------------
    for f in estr.fatti:
        cit = _citazioni(doc, f.segmenti)
        if cit is None:
            scarti["segmento_inesistente"] += 1
            continue
        aree = regola_aree(f.aree, f.attributo)
        if f.sicurezza == "bassa":
            avvisa("punto_oscuro", f"Uncertain information, not proposed: {f.soggetto}, {f.attributo}: "
                   f"{f.valore}. It needs checking.", cit, aree)
            continue
        contenuto = {"progetto_id": progetto_id, "soggetto": f.soggetto, "attributo": f.attributo,
                     "valore": f.valore, "aree": list(aree)}
        proponi("nuovo_fatto", contenuto, aree, f.sicurezza, cit)

    # --- Punti oscuri e sconosciuti --------------------------------------------------------------
    for po in estr.punti_oscuri:
        cit = _citazioni(doc, po.segmenti)
        if cit is None:
            scarti["segmento_inesistente"] += 1
            continue
        avvisa("punto_oscuro", po.descrizione.strip(), cit)

    for s in estr.sconosciuti:
        cit = _citazioni(doc, s.segmenti)
        if cit is None:
            scarti["segmento_inesistente"] += 1
            continue
        if abbina_nome(s.nome, contesto.persone).persona_id:   # è un membro: non è uno sconosciuto
            scarti["membro_del_progetto"] += 1
            continue
        s = classifica_sconosciuto(s, contesto.persone_azienda)
        if s.persona_id:
            nome = next(p.nome for p in contesto.persone_azienda if p.id == s.persona_id)
            testo = f"The document mentions {nome}, who is not part of the project."
        else:
            testo = f'"{s.nome.strip()}" is not among the project\'s known people or contexts.'
        if s.descrizione.strip():
            testo += f" Context: {s.descrizione.strip()}"
        avvisa("sconosciuto", testo, cit)

    # --- Passo del registro (solo conteggi, mai testo del documento) -----------------------------
    n_ingresso = (len(estr.task) + len(estr.aggiornamenti) + len(estr.fatti)
                  + len(estr.punti_oscuri) + len(estr.sconosciuti))
    n_scartati = sum(scarti.values())
    passo = PassoRegistro(
        quando=datetime.now(), tipo="workflow", attore="brain", step="proposte", documento_id=doc.id,
        input={"documento_id": doc.id, "task": len(estr.task), "aggiornamenti": len(estr.aggiornamenti),
               "fatti": len(estr.fatti), "punti_oscuri": len(estr.punti_oscuri),
               "sconosciuti": len(estr.sconosciuti)},
        output={"proposte": dict(Counter(p.tipo for p in proposte)),
                "avvisi": dict(Counter(a.tipo for a in avvisi)),
                "scartati": n_scartati, "motivi_scarto": dict(scarti), "dipendenze_tolte": dipendenze_tolte, "date_non_chiare": date_non_chiare},
        esito="scartato" if n_ingresso and n_scartati == n_ingresso else "ok",
        motivo=", ".join(f"{n} {m.replace('_', ' ')}" for m, n in scarti.items()) or None,
    )
    return proposte, avvisi, passo
