// Client del backend (docs/api.md). L'identità viaggia SOLO nell'header X-Persona
// (e nel cookie di sessione per l'SSE), mai nel corpo delle richieste.
import docRiu001 from './finti/riu-001.json'
import type {
  Area, Avviso, Citazione, DatiProgetto, Documento, EsitoCaricamento, Modifiche, PassoRegistro, Persona,
  Progetto, Proposta, Risposta, Task, TodoOggi,
} from './tipi'

const BASE = '/api'
let personaAttiva: string | null = null

export class ErroreApi extends Error {
  status: number
  constructor(status: number, messaggio: string) {
    super(messaggio)
    this.status = status
  }
}

export async function chiama<T>(percorso: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (personaAttiva) headers.set('X-Persona', personaAttiva)
  if (init.body && !(init.body instanceof FormData)) headers.set('content-type', 'application/json')
  const res = await fetch(BASE + percorso, { ...init, headers, credentials: 'same-origin' })
  if (!res.ok) {
    let dettaglio = res.statusText
    try { dettaglio = (await res.json()).detail ?? dettaglio } catch { /* corpo non JSON */ }
    throw new ErroreApi(res.status, typeof dettaglio === 'string' ? dettaglio : JSON.stringify(dettaglio))
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

const json = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) })

// --- Dati d'esempio per gli endpoint non ancora nel backend -------------------------------------
// Si usano SOLO se la rotta non esiste (404 "Not Found" generico di FastAPI o 405), mai per
// nascondere un errore vero. La UI mostra un'etichetta finché almeno uno è in uso.

const DOC_FINTI: Documento[] = [docRiu001 as Documento]
// Progetti da provare finché non c'è `GET /progetti` (dati/azienda.json + proposta prj-02, prj-03).
const PROGETTI_NOTI = ['prj-01', 'prj-02', 'prj-03']
const fintiInUso = new Set<string>()
const ascoltatori = new Set<() => void>()

export const finti = {
  elenco: () => [...fintiInUso].sort().join(', '),
  iscrivi: (cb: () => void) => { ascoltatori.add(cb); return () => { ascoltatori.delete(cb) } },
}

const rottaMancante = (e: unknown) =>
  e instanceof ErroreApi && (e.status === 405 || (e.status === 404 && e.message === 'Not Found'))

async function conRiserva<T>(nome: string, chiamata: () => Promise<T>, riserva: () => T): Promise<T> {
  try {
    return await chiamata()
  } catch (e) {
    if (!rottaMancante(e)) throw e
    if (!fintiInUso.has(nome)) { fintiInUso.add(nome); ascoltatori.forEach((cb) => cb()) }
    return riserva()
  }
}

/** Per le azioni che scrivono: niente dati d'esempio, ma un errore che dice cosa manca. */
async function senzaRiserva<T>(azione: string, chiamata: () => Promise<T>): Promise<T> {
  try {
    return await chiamata()
  } catch (e) {
    if (rottaMancante(e)) throw new ErroreApi(501, `Il backend non permette ancora di ${azione}: endpoint da aggiungere (docs/proposte-contratto-ui.md §8).`)
    throw e
  }
}

// --- Endpoint -----------------------------------------------------------------------------------

export const api = {
  /** Imposta la persona attiva: header per le fetch, cookie per l'EventSource. */
  async apriSessione(personaId: string): Promise<Persona> {
    personaAttiva = personaId
    return chiama<Persona>('/sessione', json({ persona_id: personaId }))
  },
  persone: () => chiama<Persona[]>('/persone'),
  progetto: (id: string) => chiama<Progetto>(`/progetti/${id}`),
  /**
   * I progetti di cui la persona attiva è membro. Se `GET /progetti` non esiste ancora (PROPOSTA),
   * chiede al backend i progetti noti uno per uno: i permessi li decide comunque il backend (403).
   */
  async progetti(): Promise<Progetto[]> {
    try {
      return await chiama<Progetto[]>('/progetti')
    } catch (e) {
      if (!rottaMancante(e)) throw e
      const esiti = await Promise.allSettled(PROGETTI_NOTI.map((id) => chiama<Progetto>(`/progetti/${id}`)))
      return esiti.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
    }
  },

  /** Solo chi ha ruolo «project manager» (lo controlla il backend). */
  creaProgetto: (dati: DatiProgetto) =>
    senzaRiserva('creare progetti', () => chiama<Progetto>('/progetti', json(dati))),
  /** Solo il manager del progetto (lo controlla il backend). */
  modificaProgetto: (id: string, dati: DatiProgetto) =>
    senzaRiserva('modificare i progetti', () => chiama<Progetto>(`/progetti/${id}`, { method: 'PATCH', body: JSON.stringify(dati) })),

  /** Solo il manager del progetto: toglie il progetto con tutti i suoi dati. */
  eliminaProgetto: (id: string) => chiama<void>(`/progetti/${id}`, { method: 'DELETE' }),

  documenti: (progettoId: string) =>
    conRiserva('documenti', () => chiama<Documento[]>(`/documenti?progetto_id=${progettoId}`),
      () => DOC_FINTI.filter((d) => d.progetto_id === progettoId)),
  documento: (id: string) =>
    conRiserva('documenti', () => chiama<Documento>(`/documenti/${encodeURIComponent(id)}`), () => {
      const d = DOC_FINTI.find((x) => x.id === id)
      if (!d) throw new ErroreApi(404, 'Documento non trovato.')
      return d
    }),
  caricaRiunione(progettoId: string, file: File) {
    const fd = new FormData()
    fd.append('file', file)
    return chiama<EsitoCaricamento>(`/riunioni?progetto_id=${progettoId}`, { method: 'POST', body: fd })
  },
  segmento: (id: string) => chiama<Citazione>(`/segmenti/${encodeURIComponent(id)}`),

  proposte: (progettoId: string, stato: Proposta['stato']) =>
    chiama<Proposta[]>(`/proposte?progetto_id=${progettoId}&stato=${stato}`),
  /** `modifiche`: correzioni del manager (PROPOSTA di contratto; il backend attuale le ignora). */
  approva: (id: string, aree: Area[] | null, modifiche: Modifiche | null = null, nota: string | null = null) =>
    chiama<Proposta>(`/proposte/${id}/approva`, json({ aree, modifiche, nota })),
  /** Riporta una proposta rifiutata «in attesa» (PROPOSTA: POST /proposte/{id}/riapri, solo il manager). */
  riapriProposta: (id: string) =>
    senzaRiserva('recuperare le proposte rifiutate', () => chiama<Proposta>(`/proposte/${id}/riapri`, { method: 'POST' })),
  rifiuta: (id: string, nota: string | null = null) =>
    chiama<Proposta>(`/proposte/${id}/rifiuta`, json({ nota })),

  /** URL per EventSource (usa il cookie impostato da apriSessione). */
  urlAvvisi: (progettoId: string) => `${BASE}/avvisi?progetto_id=${progettoId}`,
  risolviAvviso: (id: string) => chiama<Avviso>(`/avvisi/${id}/risolvi`, { method: 'POST' }),
  inoltraAvviso: (id: string, personaIds: string[], aree: Area[]) =>
    chiama<Avviso>(`/avvisi/${id}/inoltra`, json({ persona_ids: personaIds, aree })),

  todoProgetto: (progettoId: string) => chiama<Task[]>(`/progetti/${progettoId}/todo`),
  todoOggi: (personaId: string) => chiama<TodoOggi>(`/persone/${personaId}/todo-oggi`),
  accettaTodo: (taskIds: string[]) => chiama<TodoOggi>('/todo-oggi/accetta', json({ task_ids: taskIds })),

  domanda: (progettoId: string, testo: string) =>
    chiama<Risposta>('/domande', json({ progetto_id: progettoId, testo })),

  registro: (progettoId: string) => chiama<PassoRegistro[]>(`/registro?progetto_id=${progettoId}`),
}
