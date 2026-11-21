import clsx from 'clsx'
import { CornerDownLeft, Search, X } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { SceltaTema } from '../componenti/Tema'
import { Avatar, MarchioBrain } from '../componenti/ui'
import { cercaPersone, personeRecenti, segnaPersona } from '../persone'
import type { Persona } from '../tipi'

/** Fino a questo numero di persone si mostrano tutte le schede; oltre, si cerca. */
const POCHE = 12
const MAX_RISULTATI = 50

/**
 * Ingresso della demo: chi sei? L'identità decide cosa Agentonic ti mostra,
 * e arriva da qui, mai dal testo di una domanda. Pensato per migliaia di persone:
 * ricerca sempre pronta (anche con ⌘K o «/»), risultati per pertinenza, frecce e Invio.
 */
export function SceltaPersona({ persone, managerId, membri, onScegli }: {
  persone: Persona[]; managerId?: string; membri?: string[]; onScegli: (id: string) => void
}) {
  const [cerca, setCerca] = useState('')
  const [indice, setIndice] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const elenco = useRef<HTMLUListElement>(null)
  const cercando = cerca.trim().length > 0
  const { risultati, totale } = useMemo(() => cercaPersone(persone, cerca, MAX_RISULTATI), [persone, cerca])
  const recenti = useMemo(() => personeRecenti().map((id) => persone.find((p) => p.id === id)).filter((p): p is Persona => !!p), [persone])

  const entra = (id: string) => { segnaPersona(id); onScegli(id) }
  const etichette = (p: Persona) => ({ manager: p.id === managerId, fuori: !!membri && !membri.includes(p.id) })

  // ⌘K / Ctrl+K o «/» portano alla ricerca da qualunque punto della pagina
  useEffect(() => {
    const tasto = (e: globalThis.KeyboardEvent) => {
      if ((e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && document.activeElement !== input.current)) {
        e.preventDefault()
        input.current?.focus()
      }
    }
    window.addEventListener('keydown', tasto)
    return () => window.removeEventListener('keydown', tasto)
  }, [])

  useEffect(() => { setIndice(0) }, [cerca])
  useEffect(() => { elenco.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }) }, [indice])

  const tasti = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') { setCerca(''); return }
    if (!cercando || risultati.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setIndice((i) => Math.min(i + 1, risultati.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setIndice((i) => Math.max(i - 1, 0)) }
    if (e.key === 'Enter') { e.preventDefault(); entra(risultati[indice].id) }
  }

  return (
    <div className="relative min-h-screen px-4 pt-20 pb-16 sm:px-8 sm:pt-24">
      <div className="absolute top-4 right-4"><SceltaTema piccolo /></div>
      <div className="mx-auto flex max-w-5xl flex-col items-center text-center">
        <MarchioBrain size={72} parla className="shadow-[0_14px_44px_rgba(94,92,230,0.38)]" />
        <h1 className="titolo-grande mt-7 text-[44px] sm:text-[60px]">Agentonic</h1>
        <p className="mt-4 max-w-xl text-[19px] leading-snug text-testo-2 sm:text-[21px]">
          The team member who reads the meetings, keeps the project’s memory and tells you what needs your attention.
          It always asks before acting.
        </p>

        <h2 className="mt-16 text-[22px] font-semibold tracking-[-0.01em]">Who are you?</h2>
        <p className="mt-1.5 text-[15px] text-testo-2">Everyone only sees what falls within their areas.</p>

        {/* ricerca: sempre pronta */}
        <div className="mt-8 w-full max-w-xl">
          <label className="flex items-center gap-3 rounded-2xl bg-superficie px-4 py-3 shadow-alta ring-1 ring-separatore focus-within:ring-2 focus-within:ring-accento">
            <Search size={20} className="shrink-0 text-testo-3" />
            <input ref={input} autoFocus value={cerca} onChange={(e) => setCerca(e.target.value)} onKeyDown={tasti}
              role="combobox" aria-expanded={cercando} aria-controls="risultati-persone" aria-label="Find yourself"
              aria-activedescendant={cercando && risultati[indice] ? `persona-${risultati[indice].id}` : undefined}
              placeholder="Search by name, role, department or area"
              className="min-w-0 flex-1 bg-transparent text-[17px] text-testo placeholder:text-testo-3 focus:outline-none focus-visible:outline-none" />
            {cercando
              ? <button type="button" onClick={() => { setCerca(''); input.current?.focus() }} aria-label="Clear the search"
                  className="rounded-full p-1 text-testo-3 hover:bg-riempimento hover:text-testo"><X size={16} /></button>
              : <kbd className="hidden rounded-md bg-riempimento px-1.5 py-0.5 text-xs text-testo-2 sm:block">⌘K</kbd>}
          </label>
          <p className="mt-2 h-5 truncate text-left text-[13px] text-testo-2" aria-live="polite">
            {cercando
              ? totale === 0 ? `Nobody found for “${cerca.trim()}”.` : `${totale} ${totale === 1 ? 'person' : 'people'}${totale > MAX_RISULTATI ? `: showing the first ${MAX_RISULTATI}, add a word (e.g. department) to narrow it down` : ''}`
              : `${persone.length} people in the company. The first letters of a name are enough; arrow keys and Enter to sign in.`}
          </p>
        </div>

        {cercando ? (
          // riquadro ad altezza fissa: con molti, pochi o zero risultati la pagina non si sposta
          <div className="mt-4 h-[min(420px,50vh)] w-full max-w-xl overflow-hidden rounded-2xl bg-superficie text-left shadow-alta">
            {risultati.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
                <Search size={26} className="text-testo-3" />
                <p className="font-semibold">Nobody found</p>
                <p className="text-sm text-testo-2">Try fewer letters, or the role or department.</p>
              </div>
            ) : (
              <ul ref={elenco} id="risultati-persone" role="listbox" aria-label="People found"
                className="h-full overflow-y-auto overscroll-contain p-1.5">
                {risultati.map((p, i) => (
                  <RigaPersona key={p.id} p={p} cerca={cerca} attiva={i === indice} {...etichette(p)}
                    onEntra={() => entra(p.id)} onSopra={() => setIndice(i)} />
                ))}
              </ul>
            )}
          </div>
        ) : persone.length <= POCHE ? (
          <GrigliaSchede persone={persone} etichette={etichette} onEntra={entra} />
        ) : recenti.length > 0 ? (
          <>
            <p className="mt-10 text-[13px] font-semibold text-testo-2">Recently used on this device</p>
            <GrigliaSchede persone={recenti} etichette={etichette} onEntra={entra} />
          </>
        ) : null}
      </div>
    </div>
  )
}

/** Evidenzia nel nome la parte che corrisponde alla prima parola cercata. */
function Evidenziato({ testo, cerca }: { testo: string; cerca: string }) {
  const q = cerca.trim().split(/\s+/)[0]?.toLowerCase()
  const i = q ? testo.toLowerCase().indexOf(q) : -1
  if (!q || i < 0) return <>{testo}</>
  return <>{testo.slice(0, i)}<mark className="rounded-sm bg-accento-tenue px-px text-testo">{testo.slice(i, i + q.length)}</mark>{testo.slice(i + q.length)}</>
}

function RigaPersona({ p, cerca, attiva, manager, fuori, onEntra, onSopra }: {
  p: Persona; cerca: string; attiva: boolean; manager: boolean; fuori: boolean; onEntra: () => void; onSopra: () => void
}) {
  return (
    <li id={`persona-${p.id}`} role="option" aria-selected={attiva}>
      <button type="button" onClick={onEntra} onMouseMove={onSopra} tabIndex={-1}
        className={clsx('flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors', attiva ? 'bg-riempimento' : 'hover:bg-riempimento/60')}>
        <Avatar persona={p} size={38} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold"><Evidenziato testo={p.nome} cerca={cerca} /></span>
          <span className="block truncate text-[13px] text-testo-2 first-letter:uppercase">{p.ruolo}{p.reparto ? ` · ${p.reparto}` : ''}</span>
        </span>
        {manager && <span className="rounded-[7px] bg-viola-tenue px-2 py-0.5 text-xs font-semibold text-viola-testo">Manager</span>}
        {fuori && <span className="rounded-[7px] bg-riempimento px-2 py-0.5 text-xs font-semibold text-testo-2">Not on a project</span>}
        {attiva && <CornerDownLeft size={15} className="shrink-0 text-testo-3" aria-hidden />}
      </button>
    </li>
  )
}

function GrigliaSchede({ persone, etichette, onEntra }: {
  persone: Persona[]; etichette: (p: Persona) => { manager: boolean; fuori: boolean }; onEntra: (id: string) => void
}) {
  return (
    <ul className="mt-9 grid w-full grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
      {persone.map((p, i) => {
        const { manager, fuori } = etichette(p)
        return (
          <motion.li key={p.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 + i * 0.04, type: 'spring', stiffness: 260, damping: 26 }}>
            <button onClick={() => onEntra(p.id)}
              className="group flex w-full flex-col items-center gap-2 rounded-[22px] px-2 py-5 transition hover:bg-superficie hover:shadow-alta focus-visible:bg-superficie">
              <span className="rounded-full transition group-hover:shadow-[0_0_0_3px_var(--superficie),0_0_0_6px_var(--accento)]">
                <Avatar persona={p} size={84} />
              </span>
              <span className="mt-1 text-[17px] font-semibold">{p.nome}</span>
              <span className="-mt-1.5 text-[13px] text-testo-2 first-letter:uppercase">{p.ruolo}</span>
              {manager && <span className="rounded-[7px] bg-viola-tenue px-2 py-0.5 text-xs font-semibold text-viola-testo">Manager</span>}
              {fuori && <span className="rounded-[7px] bg-riempimento px-2 py-0.5 text-xs font-semibold text-testo-2">Not on a project</span>}
            </button>
          </motion.li>
        )
      })}
    </ul>
  )
}
