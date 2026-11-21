import clsx from 'clsx'
import { Quote, X, type LucideIcon } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link } from 'react-router'
import { coloreDi, iniziali, scadenzaRelativa, type Tono } from '../lib'
import type { Area, Citazione, Persona, StatoTask } from '../tipi'

// --- Contenitori --------------------------------------------------------------------------------

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <section className={clsx('rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_32px_-16px_rgba(15,23,42,0.10)]', className)}>
      {children}
    </section>
  )
}

export function IntestazioneCard({ icona: Icona, titolo, sottotitolo, azioni }: {
  icona?: LucideIcon; titolo: string; sottotitolo?: ReactNode; azioni?: ReactNode
}) {
  return (
    <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
      <div className="flex min-w-0 items-start gap-3">
        {Icona && (
          <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">
            <Icona size={16} />
          </span>
        )}
        <div className="min-w-0">
          <h2 className="font-semibold text-slate-900">{titolo}</h2>
          {sottotitolo && <p className="mt-0.5 text-sm text-slate-500">{sottotitolo}</p>}
        </div>
      </div>
      {azioni && <div className="flex shrink-0 items-center gap-2">{azioni}</div>}
    </header>
  )
}

export function TitoloPagina({ titolo, sottotitolo, azioni }: { titolo: ReactNode; sottotitolo?: ReactNode; azioni?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{titolo}</h1>
        {sottotitolo && <p className="mt-1 text-slate-500">{sottotitolo}</p>}
      </div>
      {azioni && <div className="flex items-center gap-2">{azioni}</div>}
    </div>
  )
}

export function Vuoto({ icona: Icona, titolo, testo, azione }: { icona: LucideIcon; titolo: string; testo?: string; azione?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400"><Icona size={22} /></span>
      <p className="mt-3 font-medium text-slate-700">{titolo}</p>
      {testo && <p className="mt-1 max-w-sm text-sm text-slate-500">{testo}</p>}
      {azione && <div className="mt-4">{azione}</div>}
    </div>
  )
}

export function Scheletro({ righe = 3 }: { righe?: number }) {
  return (
    <div className="space-y-3 p-5">
      {Array.from({ length: righe }, (_, i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-100" />)}
    </div>
  )
}

// --- Etichette ----------------------------------------------------------------------------------

const TONI: Record<Tono, string> = {
  grigio: 'bg-slate-100 text-slate-600 ring-slate-200',
  rosso: 'bg-red-50 text-red-700 ring-red-200',
  giallo: 'bg-amber-50 text-amber-800 ring-amber-200',
  verde: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  blu: 'bg-blue-50 text-blue-700 ring-blue-200',
  viola: 'bg-violet-50 text-violet-700 ring-violet-200',
}

export function Badge({ tono = 'grigio', icona: Icona, children, className }: { tono?: Tono; icona?: LucideIcon; children: ReactNode; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset', TONI[tono], className)}>
      {Icona && <Icona size={12} strokeWidth={2.5} />}
      {children}
    </span>
  )
}

const COLORI_AREA: Record<Area, string> = {
  sviluppo: 'bg-sky-50 text-sky-700 ring-sky-200',
  budget: 'bg-amber-50 text-amber-800 ring-amber-200',
  commerciale: 'bg-violet-50 text-violet-700 ring-violet-200',
  fornitori: 'bg-teal-50 text-teal-700 ring-teal-200',
  personale: 'bg-rose-50 text-rose-700 ring-rose-200',
  generale: 'bg-slate-100 text-slate-600 ring-slate-200',
}

export function ChipArea({ area, attiva = true, onClick }: { area: Area; attiva?: boolean; onClick?: () => void }) {
  const stile = clsx(
    'inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset',
    attiva ? COLORI_AREA[area] : 'bg-white text-slate-400 ring-slate-200',
  )
  return onClick
    ? <button type="button" onClick={onClick} className={clsx(stile, 'cursor-pointer transition hover:scale-105')} aria-pressed={attiva}>{area}</button>
    : <span className={stile}>{area}</span>
}

const STATI: Record<StatoTask, [string, Tono]> = {
  da_fare: ['Da fare', 'grigio'],
  in_corso: ['In corso', 'blu'],
  bloccato: ['Bloccato', 'rosso'],
  fatto: ['Fatto', 'verde'],
  annullato: ['Annullato', 'grigio'],
}
export const etichettaStato = (s: StatoTask) => STATI[s][0]
export const StatoBadge = ({ stato }: { stato: StatoTask }) => <Badge tono={STATI[stato][1]}>{STATI[stato][0]}</Badge>

export function Scadenza({ iso, stato }: { iso: string | null; stato?: StatoTask }) {
  const { testo, tono } = scadenzaRelativa(iso, stato)
  return <Badge tono={tono}>{testo}</Badge>
}

export function Avatar({ persona, nome, size = 28 }: { persona?: Persona | null; nome?: string; size?: number }) {
  const n = persona?.nome ?? nome ?? '?'
  const colore = persona ? coloreDi(persona.id) : 'bg-slate-300'
  return (
    <span
      title={n}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      className={clsx('inline-grid shrink-0 place-items-center rounded-full font-semibold text-white ring-2 ring-white', colore)}
    >
      {persona || nome ? iniziali(n) : '?'}
    </span>
  )
}

// --- Citazioni ----------------------------------------------------------------------------------

export const linkCitazione = (c: Citazione) => `/documenti/${c.documento_id}?seg=${c.segmento_id.split('#')[1] ?? ''}`

/** Tag di una fonte: porta al documento originale con il punto evidenziato. */
export function TagCitazione({ c }: { c: Citazione }) {
  const seg = c.segmento_id.split('#')[1] ?? c.segmento_id
  return (
    <span className="group relative inline-flex">
      <Link
        to={linkCitazione(c)}
        className="inline-flex items-center gap-1 rounded-md border border-indigo-200/80 bg-indigo-50/70 px-1.5 py-0.5 text-[11px] font-medium text-indigo-700 transition hover:border-indigo-300 hover:bg-indigo-100"
      >
        <Quote size={11} />
        {c.titolo} · {seg}{c.orario ? ` · ${c.orario}` : ''}
      </Link>
      <span className="pointer-events-none absolute bottom-full left-0 z-30 mb-2 hidden w-72 rounded-xl bg-slate-900 p-3 text-xs leading-relaxed text-slate-100 shadow-xl group-hover:block">
        <span className="block text-slate-400">{c.speaker}</span>
        «{c.frase}»
        <span className="mt-1.5 block text-indigo-300">Clic per aprire il documento →</span>
      </span>
    </span>
  )
}

export function Citazioni({ citazioni, className }: { citazioni: Citazione[]; className?: string }) {
  if (!citazioni.length) return null
  return <div className={clsx('flex flex-wrap gap-1.5', className)}>{citazioni.map((c) => <TagCitazione key={c.segmento_id} c={c} />)}</div>
}

// --- Azioni -------------------------------------------------------------------------------------

type Variante = 'primario' | 'secondario' | 'fantasma' | 'successo' | 'pericolo' | 'attenzione'
const VARIANTI: Record<Variante, string> = {
  primario: 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/20 hover:bg-indigo-500',
  secondario: 'bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50',
  fantasma: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
  successo: 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/20 hover:bg-emerald-500',
  pericolo: 'bg-white text-red-600 ring-1 ring-inset ring-red-200 hover:bg-red-50',
  attenzione: 'bg-amber-500 text-white shadow-sm shadow-amber-500/20 hover:bg-amber-400',
}

export function Bottone({ variante = 'secondario', icona: Icona, piccolo, className, children, ...props }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; icona?: LucideIcon; piccolo?: boolean }) {
  return (
    <button
      {...props}
      className={clsx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50',
        piccolo ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-2 text-sm',
        VARIANTI[variante], className,
      )}
    >
      {Icona && <Icona size={piccolo ? 13 : 15} />}
      {children}
    </button>
  )
}

export function Modale({ aperto, onChiudi, titolo, children }: { aperto: boolean; onChiudi: () => void; titolo: string; children: ReactNode }) {
  useEffect(() => {
    if (!aperto) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onChiudi() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [aperto, onChiudi])

  return (
    <AnimatePresence>
      {aperto && (
        <motion.div
          className="fixed inset-0 z-40 grid place-items-center bg-slate-900/40 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onChiudi}
        >
          <motion.div
            role="dialog" aria-modal="true" aria-label={titolo}
            className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
            initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ type: 'spring', duration: 0.35, bounce: 0.15 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="font-semibold">{titolo}</h2>
              <button onClick={onChiudi} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Chiudi"><X size={18} /></button>
            </div>
            <div className="p-5">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
