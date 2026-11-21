// Selettori che reggono elenchi lunghi: menu a tendina con ricerca e scorrimento, cassetti apribili.
import clsx from 'clsx'
import { Check, ChevronDown, Search } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { AREE, type Area, type Persona } from '../tipi'
import { Avatar, ChipArea, ETICHETTE_AREA } from './ui'

/** Chiude un menu con un clic fuori (dal bottone e dal menu) o con Esc. */
function useChiudiFuori(aperto: boolean, chiudi: () => void, rifs: RefObject<HTMLElement | null>[]) {
  useEffect(() => {
    if (!aperto) return
    const fuori = (e: MouseEvent) => { if (!rifs.some((r) => r.current?.contains(e.target as Node))) chiudi() }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') chiudi() }
    document.addEventListener('mousedown', fuori)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fuori); document.removeEventListener('keydown', esc) }
  }, [aperto, chiudi, rifs])
}

const normalizza = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
export const corrisponde = (testo: string, cerca: string) => normalizza(testo).includes(normalizza(cerca.trim()))

function CampoRicerca({ valore, onCambia, segnaposto }: { valore: string; onCambia: (v: string) => void; segnaposto: string }) {
  return (
    <label className="flex items-center gap-2 border-b border-separatore px-3 py-2">
      <Search size={14} className="shrink-0 text-testo-3" />
      <input autoFocus value={valore} onChange={(e) => onCambia(e.target.value)} placeholder={segnaposto}
        className="w-full bg-transparent text-sm text-testo placeholder:text-testo-3 focus:outline-none" />
    </label>
  )
}

/**
 * Menu a tendina generico. Si disegna in un portale sopra tutta la pagina (nessun contenitore lo taglia),
 * si apre verso l'alto se sotto non c'è spazio e ha sempre lo scorrimento interno.
 */
function Tendina({ etichetta, riassunto, aperto, setAperto, children, larghezza = 288 }: {
  etichetta: string; riassunto: ReactNode; aperto: boolean; setAperto: (a: boolean) => void; children: ReactNode; larghezza?: number
}) {
  const bottone = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; maxH: number } | null>(null)
  const rifs = useMemo(() => [bottone, menu], [])
  useChiudiFuori(aperto, () => setAperto(false), rifs)

  useLayoutEffect(() => {
    if (!aperto) return
    const calcola = () => {
      const r = bottone.current?.getBoundingClientRect()
      if (!r) return
      const sotto = window.innerHeight - r.bottom - 12
      const sopra = r.top - 12
      const left = Math.max(8, Math.min(r.left, window.innerWidth - larghezza - 8))
      setPos(sotto >= 260 || sotto >= sopra
        ? { left, top: r.bottom + 6, maxH: Math.max(160, Math.min(420, sotto)) }
        : { left, bottom: window.innerHeight - r.top + 6, maxH: Math.max(160, Math.min(420, sopra)) })
    }
    calcola()
    window.addEventListener('resize', calcola)
    window.addEventListener('scroll', calcola, true)
    return () => { window.removeEventListener('resize', calcola); window.removeEventListener('scroll', calcola, true) }
  }, [aperto, larghezza])

  return (
    <div className="relative inline-block">
      <button ref={bottone} type="button" onClick={() => setAperto(!aperto)} aria-expanded={aperto} aria-label={etichetta}
        className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-separatore-forte bg-superficie px-2 py-1 text-left text-xs transition hover:border-testo-3">
        <span className="flex min-w-0 flex-wrap items-center gap-1">{riassunto}</span>
        <ChevronDown size={13} className={clsx('shrink-0 text-testo-3 transition', aperto && 'rotate-180')} />
      </button>
      {createPortal(
        <AnimatePresence>
          {aperto && pos && (
            <motion.div ref={menu} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.12 }}
              style={{ position: 'fixed', left: pos.left, top: pos.top, bottom: pos.bottom, width: larghezza, maxHeight: pos.maxH }}
              className="z-[1000] flex flex-col overflow-hidden rounded-xl border border-separatore bg-superficie shadow-alta">
              {children}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  )
}

function Voce({ attiva, onClick, children }: { attiva: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <li>
      <button type="button" role="menuitemcheckbox" aria-checked={attiva} onClick={onClick}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-riempimento">
        <span className={clsx('grid h-4 w-4 shrink-0 place-items-center rounded border', attiva ? 'border-accento bg-accento text-su-accento' : 'border-separatore-forte')}>
          {attiva && <Check size={11} strokeWidth={3} />}
        </span>
        {children}
      </button>
    </li>
  )
}

/** Aree di visibilità: mostra le scelte in poco spazio, le altre si cercano nel menu. */
export function SelettoreAree({ valore, onCambia, etichetta = 'Visible to' }: { valore: Area[]; onCambia: (a: Area[]) => void; etichetta?: string }) {
  const [aperto, setAperto] = useState(false)
  const [cerca, setCerca] = useState('')
  const alterna = (a: Area) => onCambia(valore.includes(a) ? valore.filter((x) => x !== a) : [...valore, a])
  const riassunto = valore.length === 0
    ? <span className="text-rosso-testo">no areas</span>
    : <>{valore.slice(0, 2).map((a) => <ChipArea key={a} area={a} />)}{valore.length > 2 && <span className="text-testo-2">+{valore.length - 2}</span>}</>
  return (
    <Tendina etichetta={etichetta} riassunto={riassunto} aperto={aperto} setAperto={(a) => { setAperto(a); if (!a) setCerca('') }}>
      <CampoRicerca valore={cerca} onCambia={setCerca} segnaposto="Search for an area…" />
      <ul role="menu" className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1">
        {AREE.filter((a) => corrisponde(`${ETICHETTE_AREA[a]} ${a}`, cerca)).map((a) => (
          <Voce key={a} attiva={valore.includes(a)} onClick={() => alterna(a)}><ChipArea area={a} /></Voce>
        ))}
      </ul>
    </Tendina>
  )
}

/**
 * Persone: menu a tendina con ricerca (`inline` = elenco con ricerca e scorrimento dentro un modulo).
 * Regge anche centinaia di persone.
 */
export function SelettorePersone({ persone, valore, onCambia, bloccate = [], etichetta, inline }: {
  persone: Persona[]; valore: string[]; onCambia: (ids: string[]) => void; bloccate?: string[]; etichetta: string; inline?: boolean
}) {
  const [aperto, setAperto] = useState(false)
  const [cerca, setCerca] = useState('')
  const alterna = (id: string) => {
    if (bloccate.includes(id)) return
    onCambia(valore.includes(id) ? valore.filter((x) => x !== id) : [...valore, id])
  }
  const filtrate = persone.filter((p) => corrisponde(`${p.nome} ${p.ruolo} ${p.reparto ?? ''}`, cerca))
  const elenco = (
    <>
      <CampoRicerca valore={cerca} onCambia={setCerca} segnaposto={`Search ${persone.length} people…`} />
      <ul role="menu" className={clsx('overflow-y-auto overscroll-contain py-1', inline ? 'max-h-64' : 'min-h-0 flex-1')}>
        {filtrate.length === 0 && <li className="px-3 py-3 text-sm text-testo-2">Nobody found.</li>}
        {filtrate.map((p) => (
          <Voce key={p.id} attiva={valore.includes(p.id)} onClick={() => alterna(p.id)}>
            <Avatar persona={p} size={22} />
            <span className="min-w-0">
              <span className="block truncate">{p.nome}</span>
              <span className="block truncate text-[11px] text-testo-2">{bloccate.includes(p.id) ? 'obbligatorio' : (p.reparto ?? p.ruolo)}</span>
            </span>
          </Voce>
        ))}
      </ul>
    </>
  )
  if (inline) return <div className="overflow-hidden rounded-xl border border-separatore" aria-label={etichetta}>{elenco}</div>
  const scelti = persone.filter((p) => valore.includes(p.id))
  const riassunto = scelti.length === 0
    ? <span className="text-testo-2">Choose…</span>
    : <><span className="flex -space-x-1">{scelti.slice(0, 4).map((p) => <Avatar key={p.id} persona={p} size={18} />)}</span><span className="text-testo-2">{scelti.length} {scelti.length === 1 ? 'person' : 'people'}</span></>
  return (
    <Tendina etichetta={etichetta} riassunto={riassunto} aperto={aperto} setAperto={(a) => { setAperto(a); if (!a) setCerca('') }} larghezza={320}>
      {elenco}
    </Tendina>
  )
}

/** Cassetto: si apre e si chiude con un'animazione; il titolo dice quante voci contiene. */
export function Cassetto({ titolo, conteggio, apertoIniziale = false, tono, children }: {
  titolo: string; conteggio: number; apertoIniziale?: boolean; tono?: 'accento' | 'verde' | 'neutro'; children: ReactNode
}) {
  const [aperto, setAperto] = useState(apertoIniziale)
  return (
    <section className="border-b border-separatore last:border-b-0">
      <button type="button" onClick={() => setAperto((a) => !a)} aria-expanded={aperto}
        className="flex w-full items-center gap-2 px-5 py-3 text-left text-sm font-semibold hover:bg-riempimento">
        <ChevronDown size={16} className={clsx('text-testo-3 transition-transform duration-200', !aperto && '-rotate-90')} />
        <span className="flex-1">{titolo}</span>
        <span className={clsx('cifre rounded-full px-2 py-0.5 text-xs',
          tono === 'accento' && conteggio ? 'bg-accento text-su-accento' : tono === 'verde' ? 'bg-verde-tenue text-verde-testo' : 'bg-riempimento text-testo-2')}>
          {conteggio}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {aperto && (
          <motion.div key="contenuto" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }} className="overflow-hidden">
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}

/**
 * Pannello sovrapposto a tutto (portale nel body, posizione fissa sotto o sopra l'ancora),
 * con scorrimento interno. Si chiude con un clic fuori o con Esc.
 */
export function Sovrapposto({ ancora, aperto, onChiudi, larghezza = 320, allineaDestra, children }: {
  ancora: RefObject<HTMLElement | null>; aperto: boolean; onChiudi: () => void; larghezza?: number; allineaDestra?: boolean; children: ReactNode
}) {
  const pannello = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; maxH: number } | null>(null)
  const rifs = useMemo(() => [ancora, pannello], [ancora])
  useChiudiFuori(aperto, onChiudi, rifs)
  useLayoutEffect(() => {
    if (!aperto) return
    const calcola = () => {
      const r = ancora.current?.getBoundingClientRect()
      if (!r) return
      const sotto = window.innerHeight - r.bottom - 12
      const sopra = r.top - 12
      const base = allineaDestra ? r.right - larghezza : r.left
      const left = Math.max(8, Math.min(base, window.innerWidth - larghezza - 8))
      setPos(sotto >= 240 || sotto >= sopra
        ? { left, top: r.bottom + 6, maxH: Math.max(160, Math.min(480, sotto)) }
        : { left, bottom: window.innerHeight - r.top + 6, maxH: Math.max(160, Math.min(480, sopra)) })
    }
    calcola()
    window.addEventListener('resize', calcola)
    window.addEventListener('scroll', calcola, true)
    return () => { window.removeEventListener('resize', calcola); window.removeEventListener('scroll', calcola, true) }
  }, [aperto, ancora, larghezza, allineaDestra])
  return createPortal(
    <AnimatePresence>
      {aperto && pos && (
        <motion.div ref={pannello} initial={{ opacity: 0, y: -4, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.98 }}
          transition={{ duration: 0.15 }}
          style={{ position: 'fixed', left: pos.left, top: pos.top, bottom: pos.bottom, width: larghezza, maxHeight: pos.maxH }}
          className="z-[1000] overflow-y-auto overscroll-contain rounded-2xl bg-superficie p-1.5 shadow-alta">
          {children}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
