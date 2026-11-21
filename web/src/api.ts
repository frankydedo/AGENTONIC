// Client del backend (docs/api.md). L'identità viaggia SOLO nell'header X-Persona
// (e nel cookie di sessione per l'SSE), mai nel corpo delle richieste.
import docRiu001 from './finti/riu-001.json'
import type {
  Area, Avviso, Citazione, Documento, EsitoCaricamento, Modifiche, PassoRegistro, Persona,
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

async function chiama<T>(percorso: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (personaAttiva) headers.set('X-Persona', personaAttiva)
  if (init.body && !(init.body instanceof FormData)) headers.set('content-type', 'application/json')
  const res = await fetch(BASE + percorso, { ...init, headers, credentials: 'same-origin' })
  if (!res.ok) {
    let dettaglio = res.statusText
    try { dettaglio = (await res.json()).detail ?? dettaglio } catch { /* corpo non JSON */ }
    throw new ErroreApi(res.status, typeof dettaglio === 'string' ? dettaglio : JSON.stringify(dettaglio))
  }
  return res.json() as Promise<T>
}

const json = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) })

// --- Dati d'esempio per gli endpoint non ancora nel backend -------------------------------------
// Si usano SOLO se la rotta non esiste (404 "Not Found" generico di FastAPI o 405), mai per
// nascondere un errore vero. La UI mostra un'etichetta finché almeno uno è in uso.

const DOC_FINTI: Documento[] = [docRiu001 as Documento]
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

// --- Endpoint -----------------------------------------------------------------------------------

export const api = {
  /** Imposta la persona attiva: header per le fetch, cookie per l'EventSource. */
  async apriSessione(personaId: string): Promise<Persona> {
    personaAttiva = personaId
    return chiama<Persona>('/sessione', json({ persona_id: personaId }))
  },
  persone: () => chiama<Persona[]>('/persone'),
  progetto: (id: string) => chiama<Progetto>(`/progetti/${id}`),

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
  rifiuta: (id: string, nota: string | null = null) =>
    chiama<Proposta>(`/proposte/${id}/rifiuta`, json({ nota })),

  /** URL per EventSource (usa il cookie impostato da apriSessione). */
  urlAvvisi: (progettoId: string) => `${BASE}/avvisi?progetto_id=${progettoId}`,
  risolviAvviso: (id: string) => chiama<Avviso>(`/avvisi/${id}/risolvi`, { method: 'POST' }),

  todoProgetto: (progettoId: string) => chiama<Task[]>(`/progetti/${progettoId}/todo`),
  todoOggi: (personaId: string) => chiama<TodoOggi>(`/persone/${personaId}/todo-oggi`),
  accettaTodo: (taskIds: string[]) => chiama<TodoOggi>('/todo-oggi/accetta', json({ task_ids: taskIds })),

  domanda: (progettoId: string, testo: string) =>
    chiama<Risposta>('/domande', json({ progetto_id: progettoId, testo })),

  registro: (progettoId: string) => chiama<PassoRegistro[]>(`/registro?progetto_id=${progettoId}`),
}
