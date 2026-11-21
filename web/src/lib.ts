import { differenceInCalendarDays, format, parseISO, startOfDay } from 'date-fns'
import { it } from 'date-fns/locale'
import type { DatiProgetto, PassoRegistro, Persona, Progetto, Proposta, StatoTask, Task } from './tipi'

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

// Otto coppie fondo/iniziali (--av0…--av7 in index.css), diverse per tema chiaro e scuro.
export const coloreDi = (id: string) => [...id].reduce((a, c) => a + c.charCodeAt(0), 0) % 8
export const iniziali = (nome: string) => nome.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()

// --- Registro: passi in italiano semplice ---------------------------------------------------------

const leggibile = (k: string) => k.replace(/_/g, ' ')

/** `{segmenti: 16, task: 7}` → `["16 segmenti", "7 task"]`; ignora oggetti e liste. */
export function riassuntoOutput(o: Record<string, unknown>): string[] {
  return Object.entries(o).flatMap(([k, v]) =>
    typeof v === 'number' ? [`${v} ${leggibile(k)}`] : typeof v === 'string' ? [`${leggibile(k)}: ${v}`] : [])
}

/** Una frase per il manager, senza gergo: chi ha fatto cosa, su quale documento. */
export function descriviPasso(p: PassoRegistro, nomePersona: (id: string) => string, titoloDoc: (id: string) => string | null): string {
  const chi = p.attore === 'brain' ? 'Il Brain' : nomePersona(p.attore)
  const docId = p.documento_id ?? (typeof p.input.documento_id === 'string' ? p.input.documento_id : null)
  const doc = docId ? `«${titoloDoc(docId) ?? docId}»` : 'il documento'
  const proposta = typeof p.input.proposta_id === 'string' ? ` ${p.input.proposta_id}` : ''
  const step = p.step.toLowerCase()
  if (step.startsWith('ingestion')) return `${chi} ha letto ${doc} e l'ha diviso in interventi`
  if (step.startsWith('estrazion')) return `${chi} ha estratto task, fatti e punti oscuri da ${doc}`
  if (step.includes('abbin')) return `${chi} ha abbinato i nomi detti alle persone del progetto`
  if (step.includes('lacun') || step.includes('sconosc')) return `${chi} ha cercato persone e contesti che non conosce`
  if (step.includes('incongru')) return `${chi} ha confrontato ${doc} con le riunioni precedenti`
  if (step.includes('differenz')) return `${chi} ha confrontato ${doc} con la lista del progetto`
  if (step === 'approva') return `${chi} ha approvato la proposta${proposta}`
  if (step === 'rifiuta') return `${chi} ha rifiutato la proposta${proposta}`
  if (step.includes('inoltr')) return `${chi} ha inoltrato un avviso`
  if (p.tipo === 'caricamento') return `${chi} ha caricato ${doc}`
  if (p.tipo === 'domanda') return `${chi} ha fatto una domanda al Brain`
  return `${chi}: ${leggibile(p.step)}`
}

export const durata = (ms: number | null | undefined) =>
  ms == null ? null : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1).replace('.', ',')} s`

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
  if (!d.nome.trim()) errori.push('Dai un nome al progetto.')
  if (!d.cliente.trim()) errori.push('Indica il cliente (o «interno»).')
  if (!d.scadenza) errori.push('Indica la scadenza.')
  else if (d.scadenza < oggiIso) errori.push('La scadenza non può essere nel passato.')
  if (!d.manager_id) errori.push('Scegli il manager.')
  else if (!d.membri.includes(d.manager_id)) errori.push('Il manager deve essere tra i membri.')
  return errori
}
