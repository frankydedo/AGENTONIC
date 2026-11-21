import clsx from 'clsx'
import { format, parseISO } from 'date-fns'
import { enGB } from 'date-fns/locale'
import { Check, X, type LucideIcon } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router'
import { coloreDi, iniziali, scadenzaRelativa, type Tono } from '../lib'
import type { Area, Citazione, Persona, StatoTask } from '../tipi'

// --- Agentonic -----------------------------------------------------------------------------------

/** Agentonic è una sfera di luce: ruota piano quando ha qualcosa da dire, è ferma quando tace. */
export function MarchioBrain({ size = 32, parla = false, className }: { size?: number; parla?: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className={clsx('sfera inline-block shrink-0 rounded-full', parla && 'sfera-viva shadow-[0_4px_16px_rgba(94,92,230,0.35)]', className)}
    />
  )
}

// --- Contenitori --------------------------------------------------------------------------------

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={clsx('rounded-scheda bg-superficie shadow-card', className)}>{children}</section>
}

export function IntestazioneCard({ icona: Icona, titolo, sottotitolo, azioni }: {
  icona?: LucideIcon; titolo: string; sottotitolo?: ReactNode; azioni?: ReactNode
}) {
  return (
    <header className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
      <div className="flex min-w-0 items-start gap-3">
        {Icona && (
          <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accento-tenue text-accento-testo">
            <Icona size={15} strokeWidth={2.2} />
          </span>
        )}
        <div className="min-w-0">
          <h2 className="text-[19px] leading-tight font-bold tracking-[-0.015em]">{titolo}</h2>
          {sottotitolo && <p className="mt-1 max-w-prose text-sm text-testo-2">{sottotitolo}</p>}
        </div>
      </div>
      {azioni && <div className="flex shrink-0 items-center gap-2 pt-0.5">{azioni}</div>}
    </header>
  )
}

export function TitoloPagina({ titolo, sottotitolo, azioni }: { titolo: ReactNode; sottotitolo?: ReactNode; azioni?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="titolo-grande text-[34px] sm:text-[40px]">{titolo}</h1>
        {sottotitolo && <p className="mt-2 max-w-2xl text-[17px] text-testo-2">{sottotitolo}</p>}
      </div>
      {azioni && <div className="flex items-center gap-2">{azioni}</div>}
    </div>
  )
}

export function Vuoto({ icona: Icona, titolo, testo, azione }: { icona: LucideIcon; titolo: string; testo?: string; azione?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-riempimento text-testo-3"><Icona size={22} /></span>
      <p className="mt-3 font-semibold">{titolo}</p>
      {testo && <p className="mt-1 max-w-sm text-sm text-testo-2">{testo}</p>}
      {azione && <div className="mt-4">{azione}</div>}
    </div>
  )
}

export function Scheletro({ righe = 3 }: { righe?: number }) {
  return (
    <div className="space-y-3 p-5">
      {Array.from({ length: righe }, (_, i) => <div key={i} className="h-14 animate-pulse rounded-2xl bg-riempimento" />)}
    </div>
  )
}

/** Il link di testo delle intestazioni, nel colore delle azioni. */
export function LinkSobrio({ a, children }: { a: string; children: ReactNode }) {
  return <Link to={a} className="text-[15px] text-accento-testo hover:underline">{children}</Link>
}

/** Controllo segmentato: una scelta tra poche opzioni, sempre visibili. */
export function Segmentato<T extends string>({ valore, opzioni, onCambia, etichetta, piccolo }: {
  valore: T; opzioni: readonly (readonly [T, string, LucideIcon?])[]; onCambia: (v: T) => void; etichetta: string; piccolo?: boolean
}) {
  return (
    <div role="group" aria-label={etichetta} className="inline-flex rounded-[10px] bg-riempimento-2/80 p-0.5">
      {opzioni.map(([k, testo, Icona]) => (
        <button key={k} type="button" onClick={() => onCambia(k)} aria-pressed={valore === k}
          className={clsx(
            'inline-flex items-center justify-center gap-1.5 rounded-[8px] font-medium whitespace-nowrap transition',
            piccolo ? 'h-7 px-2.5 text-[13px]' : 'h-8 px-3.5 text-sm',
            valore === k ? 'bg-superficie text-testo shadow-[0_1px_3px_rgba(0,0,0,0.12)] dark:bg-riempimento-2' : 'text-testo-2 hover:text-testo',
          )}>
          {Icona && <Icona size={piccolo ? 13 : 15} />}
          {testo}
        </button>
      ))}
    </div>
  )
}

// --- Etichette ----------------------------------------------------------------------------------

const TONI: Record<Tono, string> = {
  grigio: 'bg-riempimento text-testo-2',
  rosso: 'bg-rosso-tenue text-rosso-testo',
  giallo: 'bg-arancio-tenue text-arancio-testo',
  verde: 'bg-verde-tenue text-verde-testo',
  blu: 'bg-accento-tenue text-accento-testo',
  viola: 'bg-viola-tenue text-viola-testo',
}

export function Badge({ tono = 'grigio', icona: Icona, children, className }: { tono?: Tono; icona?: LucideIcon; children: ReactNode; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded-[7px] px-2 py-0.5 text-xs font-semibold whitespace-nowrap', TONI[tono], className)}>
      {Icona && <Icona size={12} strokeWidth={2.5} />}
      {children}
    </span>
  )
}

const COLORI_AREA: Record<Area, string> = {
  sviluppo: '#0a84ff',
  budget: '#ff9f0a',
  commerciale: '#bf5af2',
  fornitori: '#30b0c7',
  personale: '#ff375f',
  generale: '#8e8e93',
}

// Le aree restano i valori del contratto (sviluppo, budget, …): qui solo come si leggono.
export const ETICHETTE_AREA: Record<Area, string> = {
  sviluppo: 'engineering', budget: 'budget', commerciale: 'sales', fornitori: 'suppliers', personale: 'HR', generale: 'general',
}

/** Un'area di competenza. Cliccabile (chi può vedere una voce): piena se scelta. */
export function ChipArea({ area, attiva = true, onClick }: { area: Area; attiva?: boolean; onClick?: () => void }) {
  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-pressed={attiva}
        className={clsx('inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium transition',
          attiva ? 'bg-accento text-su-accento' : 'bg-riempimento text-testo-2 hover:text-testo')}>
        {ETICHETTE_AREA[area]}
      </button>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-riempimento px-2.5 py-0.5 text-xs font-medium text-testo">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: COLORI_AREA[area] }} />
      {ETICHETTE_AREA[area]}
    </span>
  )
}

const STATI: Record<StatoTask, [string, Tono]> = {
  da_fare: ['To do', 'grigio'],
  in_corso: ['In progress', 'blu'],
  bloccato: ['Blocked', 'rosso'],
  fatto: ['Done', 'verde'],
  annullato: ['Cancelled', 'grigio'],
}
export const etichettaStato = (s: StatoTask) => STATI[s][0]
export const StatoBadge = ({ stato }: { stato: StatoTask }) => <Badge tono={STATI[stato][1]}>{STATI[stato][0]}</Badge>

export function Scadenza({ iso, stato }: { iso: string | null; stato?: StatoTask }) {
  const { testo, tono } = scadenzaRelativa(iso, stato)
  return <Badge tono={tono}>{testo}</Badge>
}

/** Una data come un foglio di calendario: mese in alto, giorno sotto. */
export function FoglioCalendario({ iso, urgente }: { iso: string | null; urgente?: boolean }) {
  const d = iso ? parseISO(iso) : null
  const mese = d ? format(d, 'MMM', { locale: enGB }).replace('.', '').toUpperCase() : '—'
  return (
    <span aria-hidden className="w-11 shrink-0 overflow-hidden rounded-[10px] bg-superficie text-center shadow-[0_0_0_1px_var(--separatore)]">
      <span className={clsx('block py-0.5 text-[10px] font-bold text-white', urgente ? 'bg-rosso' : 'bg-testo-3')}>{mese}</span>
      <span className="cifre block py-0.5 text-lg font-semibold">{d ? d.getDate() : '?'}</span>
    </span>
  )
}

export function Avatar({ persona, nome, size = 28 }: { persona?: Persona | null; nome?: string; size?: number }) {
  const n = persona?.nome ?? nome ?? '?'
  const k = persona ? coloreDi(persona.id) : null
  return (
    <span
      title={n}
      style={{
        width: size, height: size, fontSize: Math.max(9, size * 0.36),
        background: k == null ? 'var(--riempimento-2)' : `var(--av${k}-bg)`,
        color: k == null ? 'var(--testo-2)' : `var(--av${k}-fg)`,
      }}
      className="inline-grid shrink-0 place-items-center rounded-full font-semibold ring-2 ring-superficie"
    >
      {persona || nome ? iniziali(n) : '?'}
    </span>
  )
}

// --- Decisione ----------------------------------------------------------------------------------

/**
 * La decisione di una persona. Quando arriva in questa sessione, il segno compare con una molla:
 * è l'unico momento in cui l'interfaccia festeggia, perché a decidere è sempre una persona.
 */
export function Esito({ esito, nuovo = false, size = 22 }: { esito: 'approvata' | 'rifiutata'; nuovo?: boolean; size?: number }) {
  const approvata = esito === 'approvata'
  return (
    <motion.span
      aria-hidden
      initial={nuovo ? { scale: 0.2, opacity: 0 } : false}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 520, damping: 18 }}
      style={{ width: size, height: size }}
      className={clsx('grid shrink-0 place-items-center rounded-full text-white',
        approvata ? 'bg-verde shadow-[0_4px_12px_color-mix(in_oklab,var(--verde)_45%,transparent)]' : 'bg-testo-3')}
    >
      {approvata ? <Check size={size * 0.6} strokeWidth={3.2} /> : <X size={size * 0.55} strokeWidth={3.2} />}
    </motion.span>
  )
}

// --- Citazioni ----------------------------------------------------------------------------------

export const linkCitazione = (c: Citazione) => `/documents/${c.documento_id}?seg=${c.segmento_id.split('#')[1] ?? ''}`

/** Riferimento a una fonte: porta al punto esatto del documento, con la frase in anteprima. */
export function TagCitazione({ c }: { c: Citazione }) {
  const seg = c.segmento_id.split('#')[1] ?? c.segmento_id
  return (
    <span className="group relative inline-flex">
      <Link
        to={linkCitazione(c)}
        aria-label={`Fonte: ${c.titolo}, ${seg}`}
        className="inline-flex items-center gap-1 rounded-md bg-riempimento px-1.5 py-0.5 text-[11px] font-medium text-testo-2 transition-colors hover:bg-riempimento-2 hover:text-testo"
      >
        <span aria-hidden className="text-testo-3">❝</span>
        <span className="cifre">{c.documento_id} · {seg}</span>
      </Link>
      <span className="pointer-events-none absolute bottom-full left-0 z-30 mb-2 hidden w-72 rounded-2xl bg-superficie p-3.5 text-[13px] leading-relaxed text-testo shadow-alta group-hover:block group-focus-within:block">
        <span className="block text-xs font-semibold text-testo-2">{c.titolo}{c.orario ? `, ${c.orario}` : ''} · {c.speaker}</span>
        «{c.frase}»
        <span className="mt-1.5 block text-xs text-accento-testo">Open the document at this point</span>
      </span>
    </span>
  )
}

/** Le fonti occupano poco: le prime due sempre, le altre dietro «+N». */
export function Citazioni({ citazioni, className, max = 2 }: { citazioni: Citazione[]; className?: string; max?: number }) {
  const [tutte, setTutte] = useState(false)
  if (!citazioni.length) return null
  const visibili = tutte ? citazioni : citazioni.slice(0, max)
  return (
    <div className={clsx('flex flex-wrap items-center gap-1', className)}>
      {visibili.map((c) => <TagCitazione key={c.segmento_id} c={c} />)}
      {citazioni.length > max && (
        <button type="button" onClick={() => setTutte((t) => !t)}
          className="rounded-md px-1.5 py-0.5 text-[11px] font-medium text-testo-2 hover:bg-riempimento hover:text-testo">
          {tutte ? 'less' : `+${citazioni.length - max} ${citazioni.length - max === 1 ? 'source' : 'sources'}`}
        </button>
      )}
    </div>
  )
}

// --- Azioni -------------------------------------------------------------------------------------

type Variante = 'primario' | 'secondario' | 'fantasma' | 'successo' | 'pericolo' | 'attenzione'
const VARIANTI: Record<Variante, string> = {
  primario: 'bg-accento text-su-accento hover:bg-accento-premuto',
  successo: 'bg-accento text-su-accento hover:bg-accento-premuto',
  secondario: 'bg-riempimento text-testo hover:bg-riempimento-2',
  fantasma: 'text-accento-testo hover:bg-riempimento',
  pericolo: 'text-rosso-testo hover:bg-rosso-tenue',
  attenzione: 'bg-arancio text-[#1d1d1f] hover:brightness-105',
}

export function Bottone({ variante = 'secondario', icona: Icona, piccolo, className, children, ...props }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; icona?: LucideIcon; piccolo?: boolean }) {
  return (
    <button
      {...props}
      className={clsx(
        'inline-flex items-center justify-center gap-1.5 rounded-full font-medium whitespace-nowrap transition active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40',
        piccolo ? 'h-7 px-3 text-[13px]' : 'h-9 px-4 text-[15px]',
        VARIANTI[variante], className,
      )}
    >
      {Icona && <Icona size={piccolo ? 14 : 16} strokeWidth={2.2} />}
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

  // nel body: un antenato con backdrop-filter (l'header) farebbe da riferimento al position: fixed
  return createPortal(
    <AnimatePresence>
      {aperto && (
        <motion.div
          className="fixed inset-0 z-40 grid place-items-center bg-black/30 p-4 backdrop-blur-[2px] dark:bg-black/55"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onChiudi}
        >
          <motion.div
            role="dialog" aria-modal="true" aria-label={titolo}
            className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-[22px] bg-superficie shadow-alta"
            initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ type: 'spring', duration: 0.4, bounce: 0.18 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 pt-5 pb-2">
              <h2 className="text-[19px] font-bold tracking-[-0.015em]">{titolo}</h2>
              <button onClick={onChiudi} aria-label="Close"
                className="grid h-7 w-7 place-items-center rounded-full bg-riempimento text-testo-2 hover:text-testo"><X size={15} strokeWidth={2.5} /></button>
            </div>
            <div className="px-6 pt-2 pb-6">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
