import { differenceInCalendarDays, format, parseISO, startOfDay } from 'date-fns'
import { it } from 'date-fns/locale'
import type { Proposta, StatoTask, Task } from './tipi'

// --- Tempo --------------------------------------------------------------------------------------

export const oggi = () => startOfDay(new Date())
export const giorniA = (iso: string) => differenceInCalendarDays(parseISO(iso), oggi())
export const dataBreve = (iso: string | null | undefined) => (iso ? format(parseISO(iso), 'd MMM', { locale: it }) : '—')
export const dataMedia = (iso: string | null | undefined) => (iso ? format(parseISO(iso), 'd MMM yyyy', { locale: it }) : '—')
export const dataLunga = (d: Date) => format(d, 'EEEE d MMMM', { locale: it })
export const oraDi = (iso: string | null | undefined) => (iso ? format(parseISO(iso), 'HH:mm') : '')

export type Tono = 'grigio' | 'rosso' | 'giallo' | 'verde' | 'blu' | 'viola'

/** Testo e colore di una scadenza rispetto a oggi; i task chiusi non sono mai "in ritardo". */
export function scadenzaRelativa(iso: string | null, stato?: StatoTask): { testo: string; tono: Tono } {
  if (!iso) return { testo: 'senza scadenza', tono: 'grigio' }
  if (stato === 'fatto' || stato === 'annullato') return { testo: dataBreve(iso), tono: 'grigio' }
  const d = giorniA(iso)
  if (d < 0) return { testo: `in ritardo di ${-d} g`, tono: 'rosso' }
  if (d === 0) return { testo: 'scade oggi', tono: 'rosso' }
  if (d === 1) return { testo: 'scade domani', tono: 'giallo' }
  if (d <= 7) return { testo: `tra ${d} giorni`, tono: 'giallo' }
  return { testo: `tra ${d} giorni`, tono: 'grigio' }
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

const PALETTE = ['bg-indigo-500', 'bg-sky-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-violet-500', 'bg-teal-500', 'bg-fuchsia-500']
export const coloreDi = (id: string) => PALETTE[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length]
export const iniziali = (nome: string) => nome.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()
