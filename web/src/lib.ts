import { differenceInCalendarDays, format, parseISO, startOfDay } from 'date-fns'
import { enGB } from 'date-fns/locale'
import type { DatiProgetto, PassoRegistro, Persona, Progetto, Proposta, StatoTask, Task } from './tipi'

// --- Tempo --------------------------------------------------------------------------------------

export const oggi = () => startOfDay(new Date())
export const giorniA = (iso: string) => differenceInCalendarDays(parseISO(iso), oggi())
export const dataBreve = (iso: string | null | undefined) => (iso ? format(parseISO(iso), 'd MMM', { locale: enGB }) : '—')
export const dataMedia = (iso: string | null | undefined) => (iso ? format(parseISO(iso), 'd MMM yyyy', { locale: enGB }) : '—')
export const dataLunga = (d: Date) => format(d, 'EEEE d MMMM', { locale: enGB })
export const oraDi = (iso: string | null | undefined) => (iso ? format(parseISO(iso), 'HH:mm') : '')

export type Tono = 'grigio' | 'rosso' | 'giallo' | 'verde' | 'blu' | 'viola'

/** Testo e colore di una scadenza rispetto a oggi; i task chiusi non sono mai "in ritardo". */
export function scadenzaRelativa(iso: string | null, stato?: StatoTask): { testo: string; tono: Tono } {
  if (!iso) return { testo: 'no deadline', tono: 'grigio' }
  if (stato === 'fatto' || stato === 'annullato') return { testo: dataBreve(iso), tono: 'grigio' }
  const d = giorniA(iso)
  if (d < 0) return { testo: `${-d} d overdue`, tono: 'rosso' }
  if (d === 0) return { testo: 'due today', tono: 'rosso' }
  if (d === 1) return { testo: 'due tomorrow', tono: 'giallo' }
  if (d <= 7) return { testo: `in ${d} days`, tono: 'giallo' }
  return { testo: `in ${d} days`, tono: 'grigio' }
}

/** Il primo giorno noto di un task: la data della riunione da cui nasce. */
export const inizioTask = (t: Task): string | null =>
  t.citazioni.map((c) => c.data).sort()[0] ?? null

export const secondi = (s: number | null) =>
  s == null ? '' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

// --- Proposte -----------------------------------------------------------------------------------

export const campo = (p: Proposta, k: string): string | null => {
  const v = p.contenuto[k]
  return v == null || v === '' ? null : String(v)
}

export function titoloProposta(p: Proposta): string {
  if (p.tipo === 'nuovo_fatto') return `${campo(p, 'soggetto') ?? ''} · ${campo(p, 'attributo') ?? ''}: ${campo(p, 'valore') ?? ''}`
  return campo(p, 'titolo') ?? campo(p, 'task_id') ?? p.id
}

export const daChiarire = (p: Proposta) =>
  p.stato === 'in_attesa' && (p.sicurezza === 'bassa' || (p.tipo === 'nuovo_task' && !campo(p, 'assegnatario_id')))

// --- Persone ------------------------------------------------------------------------------------

// Ruoli e reparti arrivano dai dati (in italiano): qui solo il nome mostrato. I permessi usano l'originale.
const RUOLI: Record<string, string> = {
  'project manager': 'project manager',
  'senior software engineer PLC': 'senior PLC software engineer',
  'tecnico quadri elettrici': 'electrical panel technician',
  'sviluppatrice HMI/SCADA': 'HMI/SCADA developer',
  'account commerciale': 'sales account manager',
  'responsabile acquisti': 'purchasing manager',
  'tecnico di messa in servizio': 'commissioning technician',
  'amministrazione e personale': 'administration and HR',
  'Direzione progetti': 'Project management',
  'Ufficio tecnico software': 'Software engineering',
  'Ufficio tecnico elettrico': 'Electrical engineering',
  'Commerciale': 'Sales',
  'Acquisti': 'Purchasing',
  'Service e messa in servizio': 'Service and commissioning',
  'Amministrazione': 'Administration',
}
export const inInglese = (s: string) => RUOLI[s] ?? s

// Otto coppie fondo/iniziali (--av0…--av7 in index.css), diverse per tema chiaro e scuro.
export const coloreDi = (id: string) => [...id].reduce((a, c) => a + c.charCodeAt(0), 0) % 8
export const iniziali = (nome: string) => nome.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()

// --- Registro: passi in italiano semplice ---------------------------------------------------------

// Le chiavi dei conteggi arrivano dal backend in italiano: qui il nome per l'utente.
const CHIAVI: Record<string, string> = {
  segmenti: 'segments', speaker_abbinati: 'speakers matched', speaker_non_abbinati: 'speakers not matched',
  proposte: 'proposals', avvisi: 'alerts', scartate: 'discarded', scartati: 'discarded',
  incongruenze: 'inconsistencies', giudizi_scartati: 'judgements discarded', citazioni: 'citations',
  task: 'tasks', aggiornamenti: 'updates', fatti: 'facts', punti_oscuri: 'unclear points', sconosciuti: 'unknowns',
  esito: 'outcome', risposta: 'answer', non_lo_so: "don't know", non_autorizzato: 'not authorised',
}
const leggibile = (k: string) => CHIAVI[k] ?? k.replace(/_/g, ' ')

/** `{segmenti: 16, task: 7}` → `["16 segmenti", "7 task"]`; ignora oggetti e liste. */
export function riassuntoOutput(o: Record<string, unknown>): string[] {
  return Object.entries(o).flatMap(([k, v]) =>
    typeof v === 'number' ? [`${v} ${leggibile(k)}`] : typeof v === 'string' ? [`${leggibile(k)}: ${leggibile(v)}`] : [])
}

/** Una frase per il manager, senza gergo: chi ha fatto cosa, su quale documento. */
export function descriviPasso(p: PassoRegistro, nomePersona: (id: string) => string, titoloDoc: (id: string) => string | null): string {
  const chi = p.attore === 'brain' ? 'Agentonic' : nomePersona(p.attore)
  const docId = p.documento_id ?? (typeof p.input.documento_id === 'string' ? p.input.documento_id : null)
  const doc = docId ? `“${titoloDoc(docId) ?? docId}”` : 'the document'
  const proposta = typeof p.input.proposta_id === 'string' ? ` ${p.input.proposta_id}` : ''
  const step = p.step.toLowerCase()
  if (step.startsWith('ingestion')) return `${chi} read ${doc} and split it into contributions`
  if (step.startsWith('estrazion')) return `${chi} extracted tasks, facts and unclear points from ${doc}`
  if (step.includes('abbin')) return `${chi} matched the names mentioned to the project's people`
  if (step.includes('lacun') || step.includes('sconosc')) return `${chi} looked for people and contexts it does not know`
  if (step.includes('incongru')) return `${chi} compared ${doc} with earlier meetings`
  if (step.includes('differenz')) return `${chi} compared ${doc} with the project's task list`
  if (step === 'approva') return `${chi} approved proposal${proposta}`
  if (step === 'rifiuta') return `${chi} rejected proposal${proposta}`
  if (step.includes('inoltr')) return `${chi} forwarded an alert`
  if (p.tipo === 'caricamento') return `${chi} uploaded ${doc}`
  if (p.tipo === 'domanda') return `${chi} asked Agentonic a question`
  return `${chi}: ${leggibile(p.step)}`
}

export const durata = (ms: number | null | undefined) =>
  ms == null ? null : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`

// --- Progetti --------------------------------------------------------------------------------------

/**
 * Chi può creare un progetto: solo chi ha ruolo «project manager» (decisione del team, 21/11).
 * Nella UI decide solo cosa mostrare: il permesso vero lo deve controllare il backend.
 */
export const puoCreareProgetti = (p: Persona) => p.ruolo.trim().toLowerCase() === 'project manager'

/** Modificare un progetto spetta al suo manager. */
export const puoModificare = (p: Persona, prj: Progetto) => prj.manager_id === p.id

/** Errori del modulo, in italiano; lista vuota se va bene. `oggiIso` = AAAA-MM-GG. */
export function validaProgetto(d: DatiProgetto, oggiIso: string): string[] {
  const errori: string[] = []
  if (!d.nome.trim()) errori.push('Give the project a name.')
  if (!d.cliente.trim()) errori.push('Enter the client (or “internal”).')
  if (!d.scadenza) errori.push('Enter the deadline.')
  else if (d.scadenza < oggiIso) errori.push('The deadline cannot be in the past.')
  if (!d.manager_id) errori.push('Choose the manager.')
  else if (!d.membri.includes(d.manager_id)) errori.push('The manager must be one of the members.')
  return errori
}
