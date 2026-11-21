import clsx from 'clsx'
import { X, type LucideIcon } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router'
import { coloreDi, iniziali, scadenzaRelativa, type Tono } from '../lib'
import type { Area, Citazione, Persona, StatoTask } from '../tipi'

// --- Il Brain -----------------------------------------------------------------------------------

/**
 * Il marchio del Brain: una spia su un quadro. Accesa e lampeggiante quando ha
 * qualcosa da dire, spenta quando tace.
 */
export function MarchioBrain({ size = 32, parla = false, className }: { size?: number; parla?: boolean; className?: string }) {
  const led = Math.round(size * 0.3)
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, borderRadius: Math.max(3, size * 0.14) }}
      className={clsx('relative inline-grid shrink-0 place-items-center bg-inchiostro', className)}
    >
      <span
        style={{ width: led, height: led }}
        className={clsx('rounded-full', parla ? 'animate-spia bg-segnale shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-segnale)_30%,transparent)]' : 'bg-foglio/80')}
      />
    </span>
  )
}

// --- Contenitori --------------------------------------------------------------------------------

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={clsx('rounded-md border border-linea bg-foglio', className)}>{children}</section>
}

export function IntestazioneCard({ icona: Icona, titolo, sottotitolo, azioni }: {
  icona?: LucideIcon; titolo: string; sottotitolo?: ReactNode; azioni?: ReactNode
}) {
  return (
    <header className="flex items-start justify-between gap-3 border-b border-linea px-5 pt-4 pb-3.5">
      <div className="flex min-w-0 items-start gap-2.5">
        {Icona && <Icona size={17} strokeWidth={2.2} className="mt-[3px] shrink-0 text-grafite" />}
        <div className="min-w-0">
          <h2 className="text-[17px] leading-tight font-bold [font-stretch:108%]">{titolo}</h2>
          {sottotitolo && <p className="mt-1 max-w-prose text-sm text-grafite">{sottotitolo}</p>}
        </div>
      </div>
      {azioni && <div className="flex shrink-0 items-center gap-2">{azioni}</div>}
    </header>
  )
}

export function TitoloPagina({ titolo, sottotitolo, azioni }: { titolo: ReactNode; sottotitolo?: ReactNode; azioni?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4 border-b-2 border-inchiostro pb-4">
      <div className="min-w-0">
        <h1 className="titolo-tavola text-[2.1rem] sm:text-[2.6rem]">{titolo}</h1>
        {sottotitolo && <p className="mt-2 max-w-2xl text-grafite">{sottotitolo}</p>}
      </div>
      {azioni && <div className="flex items-center gap-2">{azioni}</div>}
    </div>
  )
}

export function Vuoto({ icona: Icona, titolo, testo, azione }: { icona: LucideIcon; titolo: string; testo?: string; azione?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <span className="grid h-11 w-11 place-items-center rounded-full border border-dashed border-linea-forte text-traccia"><Icona size={20} /></span>
      <p className="mt-3 font-semibold">{titolo}</p>
      {testo && <p className="mt-1 max-w-sm text-sm text-grafite">{testo}</p>}
      {azione && <div className="mt-4">{azione}</div>}
    </div>
  )
}

export function Scheletro({ righe = 3 }: { righe?: number }) {
  return (
    <div className="space-y-3 p-5">
      {Array.from({ length: righe }, (_, i) => <div key={i} className="h-14 animate-pulse rounded-[4px] bg-velina" />)}
    </div>
  )
}

/** Il link di testo delle intestazioni: sottolineato, mai decorato da frecce. */
export function LinkSobrio({ a, children }: { a: string; children: ReactNode }) {
  return (
    <Link to={a} className="text-sm font-semibold underline decoration-linea-forte decoration-1 underline-offset-4 hover:decoration-inchiostro">
      {children}
    </Link>
  )
}

// --- Etichette ----------------------------------------------------------------------------------

const TONI: Record<Tono, string> = {
  grigio: 'bg-velina text-grafite border-linea',
  rosso: 'bg-allarme-chiaro text-allarme border-allarme/30',
  giallo: 'bg-segnale-chiaro text-segnale-scuro border-segnale/50',
  verde: 'bg-timbro-chiaro text-timbro border-timbro/30',
  blu: 'bg-cavo-chiaro text-cavo border-cavo/30',
  viola: 'bg-viola-chiaro text-viola border-viola/30',
}

export function Badge({ tono = 'grigio', icona: Icona, children, className }: { tono?: Tono; icona?: LucideIcon; children: ReactNode; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded-[3px] border px-1.5 py-px text-xs font-semibold whitespace-nowrap', TONI[tono], className)}>
      {Icona && <Icona size={12} strokeWidth={2.5} />}
      {children}
    </span>
  )
}

/** Le aree sono come i colori dei cavi in un quadro: un segno colorato e il nome. */
const COLORI_AREA: Record<Area, string> = {
  sviluppo: '#2d64a8',
  budget: '#c79300',
  commerciale: '#6a4c93',
  fornitori: '#2a7d77',
  personale: '#a8456b',
  generale: '#80858f',
}

export function ChipArea({ area, attiva = true, onClick }: { area: Area; attiva?: boolean; onClick?: () => void }) {
  const stile = clsx(
    'inline-flex items-center gap-1.5 rounded-[3px] border py-px pr-1.5 pl-1 text-[12px] font-medium condensato',
    attiva ? 'border-linea bg-foglio text-inchiostro' : 'border-dashed border-linea-forte bg-transparent pl-1.5 text-traccia',
  )
  const segno = attiva ? <span className="h-2.5 w-[5px] rounded-[1px]" style={{ background: COLORI_AREA[area] }} /> : null
  return onClick
    ? <button type="button" onClick={onClick} className={clsx(stile, 'cursor-pointer hover:border-inchiostro')} aria-pressed={attiva}>{segno}{area}</button>
    : <span className={stile}>{segno}{area}</span>
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
  return (
    <span
      title={n}
      style={{ width: size, height: size, fontSize: size * 0.4, borderRadius: Math.max(3, size * 0.18), background: persona ? coloreDi(persona.id) : 'var(--color-linea-forte)' }}
      className="inline-grid shrink-0 place-items-center font-bold text-foglio ring-2 ring-foglio [font-stretch:90%]"
    >
      {persona || nome ? iniziali(n) : '?'}
    </span>
  )
}

// --- Timbro -------------------------------------------------------------------------------------

/**
 * La decisione di una persona, come un timbro su una pratica. È l'unico gesto forte
 * dell'interfaccia: tutto il resto propone, solo una persona timbra.
 */
export function Timbro({ esito, nuovo = false, className }: { esito: 'approvata' | 'rifiutata'; nuovo?: boolean; className?: string }) {
  const approvata = esito === 'approvata'
  return (
    <motion.span
      initial={nuovo ? { scale: 1.9, opacity: 0, rotate: -14 } : false}
      animate={{ scale: 1, opacity: 1, rotate: -5 }}
      transition={{ type: 'spring', stiffness: 520, damping: 22, mass: 0.9 }}
      className={clsx(
        'pointer-events-none inline-block rounded-[4px] border-[2.5px] px-2 py-0.5 text-[13px] font-extrabold tracking-[0.06em] uppercase [font-stretch:115%]',
        approvata ? 'border-timbro text-timbro' : 'border-allarme/80 text-allarme/90',
        'mix-blend-multiply',
        className,
      )}
      style={{ maskImage: 'radial-gradient(circle at 30% 40%, #000 60%, rgba(0,0,0,.82) 75%, #000 90%)' }}
    >
      {approvata ? 'Approvata' : 'Rifiutata'}
    </motion.span>
  )
}

// --- Citazioni ----------------------------------------------------------------------------------

export const linkCitazione = (c: Citazione) => `/documenti/${c.documento_id}?seg=${c.segmento_id.split('#')[1] ?? ''}`

/** Riferimento a una fonte, come il rimando a un'altra tavola: porta al punto esatto del documento. */
export function TagCitazione({ c }: { c: Citazione }) {
  const seg = c.segmento_id.split('#')[1] ?? c.segmento_id
  return (
    <span className="group relative inline-flex">
      <Link
        to={linkCitazione(c)}
        className="inline-flex items-stretch overflow-hidden rounded-[3px] border border-inchiostro/25 bg-foglio text-[12px] leading-none font-medium text-inchiostro transition-colors hover:border-inchiostro hover:bg-segnale-chiaro"
      >
        <span className="max-w-[16rem] truncate px-1.5 py-1">{c.titolo}</span>
        <span className="condensato border-l border-inchiostro/25 bg-velina px-1.5 py-1 font-semibold group-hover:bg-segnale/60">
          {seg}{c.orario ? ` ${c.orario}` : ''}
        </span>
      </Link>
      <span className="pointer-events-none absolute bottom-full left-0 z-30 mb-2 hidden w-72 rounded-md bg-inchiostro p-3 text-xs leading-relaxed text-foglio group-hover:block group-focus-within:block">
        <span className="block font-semibold text-segnale">{c.speaker}</span>
        «{c.frase}»
        <span className="mt-1.5 block text-foglio/60">Apri il documento a questo punto</span>
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
  primario: 'bg-inchiostro text-foglio hover:bg-inchiostro-2',
  secondario: 'bg-foglio text-inchiostro border border-linea-forte hover:border-inchiostro',
  fantasma: 'text-grafite hover:bg-velina hover:text-inchiostro',
  successo: 'bg-timbro text-foglio hover:brightness-110',
  pericolo: 'bg-foglio text-allarme border border-allarme/40 hover:border-allarme hover:bg-allarme-chiaro',
  attenzione: 'bg-segnale text-inchiostro hover:brightness-105',
}

export function Bottone({ variante = 'secondario', icona: Icona, piccolo, className, children, ...props }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; icona?: LucideIcon; piccolo?: boolean }) {
  return (
    <button
      {...props}
      className={clsx(
        'inline-flex items-center justify-center gap-1.5 rounded-[4px] font-semibold transition active:translate-y-px disabled:pointer-events-none disabled:opacity-45',
        piccolo ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-2 text-sm',
        VARIANTI[variante], className,
      )}
    >
      {Icona && <Icona size={piccolo ? 13 : 15} strokeWidth={2.3} />}
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
          className="fixed inset-0 z-40 grid place-items-center bg-inchiostro/35 p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onChiudi}
        >
          <motion.div
            role="dialog" aria-modal="true" aria-label={titolo}
            className="sopra max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-md border border-inchiostro bg-foglio"
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
            transition={{ type: 'spring', duration: 0.3, bounce: 0.1 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-linea px-5 py-3.5">
              <h2 className="font-bold [font-stretch:108%]">{titolo}</h2>
              <button onClick={onChiudi} className="rounded-[4px] p-1 text-grafite hover:bg-velina hover:text-inchiostro" aria-label="Chiudi"><X size={18} /></button>
            </div>
            <div className="p-5">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
