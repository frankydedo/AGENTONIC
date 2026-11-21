"""Contratto condiviso (I1): modelli dei dati e regola dei permessi.

Si cambia solo dopo averne parlato nel team (CLAUDE.md §3). Chi lo cambia aggiorna anche
`docs/api.md` e i dati in `dati/`.
Id stringa con prefisso: p-01, prj-01, riu-001, riu-001#s001, task-001, fat-001, prop-001, avv-001.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

# --- Liste chiuse -------------------------------------------------------------------------------

Area = Literal["sviluppo", "budget", "commerciale", "fornitori", "personale", "generale"]
Sicurezza = Literal["alta", "media", "bassa"]
Attributo = Literal[
    "scadenza", "responsabile", "budget", "costo", "stato",
    "fornitore", "decisione", "requisito", "rischio", "altro",
]
StatoTask = Literal["da_fare", "in_corso", "bloccato", "fatto", "annullato"]
TipoProposta = Literal["nuovo_task", "aggiorna_task", "chiudi_task", "nuovo_fatto"]
StatoProposta = Literal["in_attesa", "approvata", "rifiutata"]
TipoAvviso = Literal[
    "incongruenza", "punto_oscuro", "sconosciuto",
    "dipendenza_a_rischio", "evento_esterno", "brief",
]
EsitoRisposta = Literal["risposta", "non_lo_so", "non_autorizzato"]


# --- Azienda e progetto (specchio di dati/azienda.json) ----------------------------------------

class Persona(BaseModel):
    id: str
    nome: str
    ruolo: str
    alias: list[str] = []
    competenze: list[Area] = []


class Progetto(BaseModel):
    id: str
    nome: str
    cliente: str
    manager_id: str
    membri: list[str]
    scadenza: str  # AAAA-MM-GG
    descrizione: str = ""


# --- Documenti in ingresso ----------------------------------------------------------------------

class Segmento(BaseModel):
    """Un turno di parola: l'unità che si cita."""
    id: str                      # "riu-001#s001"
    documento_id: str
    speaker: str                 # nome grezzo detto o scritto nel documento
    persona_id: str | None = None  # abbinato dal codice, mai dal modello
    inizio: float | None = None  # secondi dall'inizio (solo da audio)
    fine: float | None = None
    testo: str


class Documento(BaseModel):
    id: str                      # "riu-001"
    progetto_id: str
    tipo: Literal["riunione", "integrativo"]
    formato: Literal["minuta", "trascrizione", "audio", "pdf"]
    titolo: str
    data: str                    # AAAA-MM-GG
    ora_inizio: str | None = None
    partecipanti: list[str] = []
    segmenti: list[Segmento] = []


class Citazione(BaseModel):
    """Costruita SOLO dal codice a partire da un id di segmento esistente."""
    segmento_id: str
    documento_id: str
    titolo: str                  # titolo della riunione/documento
    data: str
    orario: str | None = None    # "09:30" o offset del segmento, se noto
    speaker: str
    frase: str


# --- Output del modello (step di estrazione, Franky) -------------------------------------------
# Il modello cita solo id di segmenti/task ricevuti; non risolve persone e non scrive citazioni.

class TaskEstratto(BaseModel):
    rif: str                                # id temporaneo dentro questa estrazione: "t1", "t2", ...
    titolo: str
    assegnatario_detto: str | None = None   # il nome come è stato detto ("Marco")
    scadenza: str | None = None
    aree: list[Area]
    segmenti: list[str]
    sicurezza: Sicurezza
    # "t2" per un task nuovo di questa estrazione, "task-004" per un task già approvato.
    # Li risolve il codice; quelli che non esistono vengono scartati.
    dipende_da: list[str] = []


class AggiornamentoTask(BaseModel):
    task_id: str
    campo: Literal["stato", "scadenza", "assegnatario", "titolo"]
    valore: str
    segmenti: list[str]
    sicurezza: Sicurezza


class FattoEstratto(BaseModel):
    soggetto: str
    attributo: Attributo
    valore: str
    aree: list[Area]
    segmenti: list[str]
    sicurezza: Sicurezza


class PuntoOscuro(BaseModel):
    descrizione: str
    segmenti: list[str]


class Sconosciuto(BaseModel):
    """Persona o contesto che non appartiene al progetto.

    Conta solo chi è membro del progetto: una persona dell'azienda fuori dal progetto è
    «sconosciuta», ma il codice la riconosce e imposta `persona_id` (mai il modello), così
    l'avviso dice «non fa parte del progetto» invece di «persona mai vista».
    """
    nome: str
    descrizione: str
    segmenti: list[str]
    persona_id: str | None = None           # impostato dal codice se è in azienda ma fuori dal progetto


class EstrazioneRiunione(BaseModel):
    task: list[TaskEstratto] = []
    aggiornamenti: list[AggiornamentoTask] = []
    fatti: list[FattoEstratto] = []
    punti_oscuri: list[PuntoOscuro] = []
    sconosciuti: list[Sconosciuto] = []


# --- Memoria del progetto (solo voci approvate) ------------------------------------------------

class Task(BaseModel):
    id: str
    progetto_id: str
    titolo: str
    assegnatario_id: str | None = None
    scadenza: str | None = None
    stato: StatoTask = "da_fare"
    aree: list[Area]
    dipende_da: list[str] = []              # id di task
    citazioni: list[Citazione] = []


class Fatto(BaseModel):
    id: str
    progetto_id: str
    soggetto: str
    attributo: Attributo
    valore: str
    aree: list[Area]
    citazioni: list[Citazione] = []


class Voce(BaseModel):
    """Una voce approvata della memoria, come la riceve `rispondi()` (già filtrata)."""
    id: str                                 # task-xxx o fat-xxx
    tipo: Literal["task", "fatto"]
    testo: str
    aree: list[Area]
    citazioni: list[Citazione]


# --- Proposte e avvisi --------------------------------------------------------------------------

class Proposta(BaseModel):
    id: str | None = None                   # assegnato dal backend al salvataggio; None se esce dal workflow
    progetto_id: str
    documento_id: str | None = None
    tipo: TipoProposta
    stato: StatoProposta = "in_attesa"
    # nuovo_task -> Task; nuovo_fatto -> Fatto; aggiorna/chiudi -> {"task_id", "campo", "valore"}
    contenuto: dict
    aree_proposte: list[Area]
    aree_confermate: list[Area] | None = None
    sicurezza: Sicurezza = "alta"
    citazioni: list[Citazione] = []
    creata_il: datetime | None = None       # assegnato dal backend al salvataggio
    decisa_da: str | None = None
    decisa_il: datetime | None = None


class Avviso(BaseModel):
    id: str | None = None                   # assegnato dal backend al salvataggio
    progetto_id: str
    documento_id: str | None = None
    tipo: TipoAvviso
    testo: str
    citazioni: list[Citazione] = []
    aree: list[Area] = []                   # aree delle informazioni da cui nasce l'avviso
    # Id delle proposte ancora in attesa su cui si basa (es. un'incongruenza con una riunione
    # non ancora approvata). Se non è vuoto, la UI lo marca «da proposte non ancora approvate».
    basato_su_proposte: list[str] = []
    solo_manager: bool = True               # finché il manager non lo inoltra, lo vede solo lui
    inoltrato_a: list[str] = []             # id di persone a cui il manager l'ha inoltrato
    risolto: bool = False
    creato_il: datetime | None = None       # assegnato dal backend al salvataggio


class RisultatoAnalisi(BaseModel):
    """Uscita di `analizza_documento` (I2). Gli id li assegna il backend al salvataggio."""
    proposte: list[Proposta] = []
    avvisi: list[Avviso] = []


class ContestoProgetto(BaseModel):
    """Ciò che `analizza_documento` sa del progetto prima del nuovo documento."""
    progetto: Progetto
    persone: list[Persona]                  # solo i membri del progetto
    persone_azienda: list[Persona] = []     # dipendenti NON membri: per riconoscere gli «sconosciuti»
    task: list[Task] = []                   # approvati
    fatti: list[Fatto] = []                 # approvati
    # Proposte in attesa dei documenti precedenti: le usa solo l'agente delle incongruenze,
    # che marca l'avviso con `basato_su_proposte`. Mai la memoria, mai le domande.
    proposte_in_attesa: list[Proposta] = []
    documenti_precedenti: list[str] = []    # id


# --- Domande ------------------------------------------------------------------------------------

class Risposta(BaseModel):
    esito: EsitoRisposta
    testo: str
    citazioni: list[Citazione] = Field(default_factory=list)  # obbligatorie se esito == "risposta"


TESTO_NEUTRO = "Non ho informazioni che puoi vedere su questo. Puoi chiedere a {manager}."


# --- Permessi (unica regola per tutti) ----------------------------------------------------------

def puo_vedere(persona: Persona, progetto: Progetto, aree: list[str]) -> bool:
    """Vero se `persona` può vedere un elemento del `progetto` con queste `aree`.

    - deve essere membro del progetto;
    - il manager del progetto vede tutto;
    - `generale` è visibile a tutti i membri;
    - altrimenti basta un'area in comune con le competenze della persona.
    Un elemento senza aree non è visibile (default restrittivo), salvo al manager.
    """
    if persona.id not in progetto.membri:
        return False
    if persona.id == progetto.manager_id:
        return True
    if "generale" in aree:
        return True
    return bool(set(aree) & set(persona.competenze))


def puo_vedere_avviso(persona: Persona, progetto: Progetto, avviso: Avviso) -> bool:
    """Il manager vede tutti gli avvisi del progetto. Gli altri solo quelli che il manager ha
    inoltrato: a loro per nome, oppure a chi ha una delle aree dell'avviso (`puo_vedere`)."""
    if persona.id not in progetto.membri:
        return False
    if persona.id == progetto.manager_id:
        return True
    if avviso.solo_manager:
        return False
    return persona.id in avviso.inoltrato_a or puo_vedere(persona, progetto, avviso.aree)
