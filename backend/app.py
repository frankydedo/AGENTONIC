"""API del Company Brain. Fase 0: scheletro con risposte di esempio (backend/esempi.py).

L'identità (I5) è già vera: arriva dall'header `X-Persona` o dal cookie `persona`
(impostato da `POST /sessione`), mai dal testo di una richiesta.
"""

import asyncio
import json
from pathlib import Path

from fastapi import Cookie, Depends, FastAPI, Header, HTTPException, Response, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from backend import esempi
from backend.modelli import Area, Avviso, Citazione, Persona, Progetto, Proposta, Risposta, Task, puo_vedere

DATI = Path(__file__).resolve().parent.parent / "dati"
_azienda = json.loads((DATI / "azienda.json").read_text(encoding="utf-8"))
PERSONE: dict[str, Persona] = {p["id"]: Persona(**p) for p in _azienda["persone"]}
PROGETTI: dict[str, Progetto] = {p["id"]: Progetto(**p) for p in _azienda["progetti"]}

app = FastAPI(title="Company Brain · Automazioni Dora", version="0.1.0")


# --- Identità (I5) ------------------------------------------------------------------------------

def persona_corrente(
    x_persona: str | None = Header(default=None),
    persona: str | None = Cookie(default=None),
) -> Persona:
    pid = x_persona or persona
    if pid is None or pid not in PERSONE:
        raise HTTPException(401, "Sessione mancante: scegli una persona.")
    return PERSONE[pid]


def progetto_del_membro(progetto_id: str, chi: Persona) -> Progetto:
    prj = PROGETTI.get(progetto_id)
    if prj is None or chi.id not in prj.membri:
        raise HTTPException(403, "Non fai parte di questo progetto.")
    return prj


def solo_manager(progetto_id: str, chi: Persona) -> Progetto:
    prj = progetto_del_membro(progetto_id, chi)
    if chi.id != prj.manager_id:
        raise HTTPException(403, "Solo il manager del progetto può farlo.")
    return prj


# --- Sessione e anagrafica ----------------------------------------------------------------------

class RichiestaSessione(BaseModel):
    persona_id: str


@app.post("/sessione")
def apri_sessione(body: RichiestaSessione, response: Response) -> Persona:
    if body.persona_id not in PERSONE:
        raise HTTPException(404, "Persona sconosciuta.")
    response.set_cookie("persona", body.persona_id, httponly=True, samesite="lax")
    return PERSONE[body.persona_id]


@app.get("/persone")
def elenco_persone() -> list[Persona]:
    return list(PERSONE.values())


@app.get("/progetti/{progetto_id}")
def dettaglio_progetto(progetto_id: str, chi: Persona = Depends(persona_corrente)) -> Progetto:
    return progetto_del_membro(progetto_id, chi)


# --- Documenti ----------------------------------------------------------------------------------

class EsitoCaricamento(BaseModel):
    documento_id: str
    proposte: int
    avvisi: int


@app.post("/riunioni")
def carica_riunione(progetto_id: str, file: UploadFile,
                    chi: Persona = Depends(persona_corrente)) -> EsitoCaricamento:
    solo_manager(progetto_id, chi)
    return EsitoCaricamento(documento_id="riu-001", proposte=len(esempi.PROPOSTE), avvisi=len(esempi.AVVISI))


@app.post("/documenti")
def carica_documento(progetto_id: str, file: UploadFile,
                     chi: Persona = Depends(persona_corrente)) -> EsitoCaricamento:
    solo_manager(progetto_id, chi)
    return EsitoCaricamento(documento_id="doc-001", proposte=0, avvisi=0)


@app.get("/segmenti/{segmento_id}")
def dettaglio_segmento(segmento_id: str, chi: Persona = Depends(persona_corrente)) -> Citazione:
    for c in (esempi.C_SAL, esempi.C_BUDGET, esempi.C_TAG, esempi.C_HMI):
        if c.segmento_id == segmento_id:
            return c
    raise HTTPException(404, "Segmento non trovato.")


# --- Proposte -----------------------------------------------------------------------------------

class Decisione(BaseModel):
    aree: list[Area] | None = None   # il manager conferma o modifica le aree all'approvazione
    nota: str | None = None


@app.get("/proposte")
def elenco_proposte(progetto_id: str, stato: str = "in_attesa",
                    chi: Persona = Depends(persona_corrente)) -> list[Proposta]:
    solo_manager(progetto_id, chi)
    return [p for p in esempi.PROPOSTE if p.stato == stato]


def _proposta(proposta_id: str) -> Proposta:
    for p in esempi.PROPOSTE:
        if p.id == proposta_id:
            return p
    raise HTTPException(404, "Proposta non trovata.")


@app.post("/proposte/{proposta_id}/approva")
def approva(proposta_id: str, body: Decisione, chi: Persona = Depends(persona_corrente)) -> Proposta:
    p = _proposta(proposta_id)
    solo_manager(p.progetto_id, chi)
    return p.model_copy(update={"stato": "approvata", "decisa_da": chi.id, "decisa_il": esempi.ORA,
                                "aree_confermate": body.aree or p.aree_proposte})


@app.post("/proposte/{proposta_id}/rifiuta")
def rifiuta(proposta_id: str, body: Decisione, chi: Persona = Depends(persona_corrente)) -> Proposta:
    p = _proposta(proposta_id)
    solo_manager(p.progetto_id, chi)
    return p.model_copy(update={"stato": "rifiutata", "decisa_da": chi.id, "decisa_il": esempi.ORA})


# --- Avvisi (SSE) -------------------------------------------------------------------------------

@app.get("/avvisi")
async def flusso_avvisi(progetto_id: str, chi: Persona = Depends(persona_corrente)) -> StreamingResponse:
    """Server-Sent Events: un evento `avviso` per ogni avviso visibile a chi è connesso."""
    prj = progetto_del_membro(progetto_id, chi)
    visibili = [a for a in esempi.AVVISI if not a.solo_manager or chi.id == prj.manager_id]

    async def eventi():
        for a in visibili:
            yield f"event: avviso\ndata: {a.model_dump_json()}\n\n"
        while True:  # tiene viva la connessione
            await asyncio.sleep(15)
            yield ": ping\n\n"

    return StreamingResponse(eventi(), media_type="text/event-stream")


@app.post("/avvisi/{avviso_id}/risolvi")
def risolvi_avviso(avviso_id: str, chi: Persona = Depends(persona_corrente)) -> Avviso:
    for a in esempi.AVVISI:
        if a.id == avviso_id:
            solo_manager(a.progetto_id, chi)
            return a.model_copy(update={"risolto": True})
    raise HTTPException(404, "Avviso non trovato.")


# --- To-do --------------------------------------------------------------------------------------

class TodoOggi(BaseModel):
    persona_id: str
    data: str
    accettata: bool
    task: list[Task]


class AccettaTodo(BaseModel):
    task_ids: list[str]   # l'ordine scelto dalla persona; può togliere voci per oggi


@app.get("/progetti/{progetto_id}/todo")
def todo_progetto(progetto_id: str, chi: Persona = Depends(persona_corrente)) -> list[Task]:
    prj = progetto_del_membro(progetto_id, chi)
    return [t for t in (esempi.TASK_SAL, esempi.TASK_TAG, esempi.TASK_HMI) if puo_vedere(chi, prj, t.aree)]


@app.get("/persone/{persona_id}/todo-oggi")
def todo_oggi(persona_id: str, chi: Persona = Depends(persona_corrente)) -> TodoOggi:
    if persona_id != chi.id:
        raise HTTPException(403, "Puoi vedere solo la tua to-do.")
    task = [t for t in (esempi.TASK_SAL, esempi.TASK_TAG, esempi.TASK_HMI) if t.assegnatario_id == chi.id]
    return TodoOggi(persona_id=chi.id, data="2026-11-21", accettata=False, task=task)


@app.post("/todo-oggi/accetta")
def accetta_todo(body: AccettaTodo, chi: Persona = Depends(persona_corrente)) -> TodoOggi:
    oggi = todo_oggi(chi.id, chi)
    scelti = [t for tid in body.task_ids for t in oggi.task if t.id == tid]
    return oggi.model_copy(update={"accettata": True, "task": scelti})


# --- Domande ------------------------------------------------------------------------------------

class Domanda(BaseModel):
    progetto_id: str
    testo: str


@app.post("/domande")
def chiedi(body: Domanda, chi: Persona = Depends(persona_corrente)) -> Risposta:
    prj = progetto_del_membro(body.progetto_id, chi)
    if "budget" in body.testo.lower() and puo_vedere(chi, prj, ["budget"]):
        return esempi.RISPOSTA_OK
    return esempi.RISPOSTA_NEUTRA


# --- Eventi e registro --------------------------------------------------------------------------

class EventoSimulato(BaseModel):
    progetto_id: str
    tipo: str        # "errore_codice", "fine_giornata", ...
    descrizione: str


@app.post("/eventi/simula")
def simula_evento(body: EventoSimulato, chi: Persona = Depends(persona_corrente)) -> Avviso:
    solo_manager(body.progetto_id, chi)
    return Avviso(id="avv-099", progetto_id=body.progetto_id, tipo="evento_esterno",
                  testo=body.descrizione, creato_il=esempi.ORA)


@app.get("/registro")
def registro(progetto_id: str, chi: Persona = Depends(persona_corrente)) -> list[dict]:
    solo_manager(progetto_id, chi)
    return esempi.REGISTRO
