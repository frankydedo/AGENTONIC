import clsx from 'clsx'
import {
  BrainCircuit, CalendarClock, ChartGantt, ChevronDown, FileText, FlaskConical, LayoutDashboard, LogOut, MessageSquare, ScrollText,
  type LucideIcon,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { finti } from '../api'
import { useApp } from '../contesto'
import { useDati } from '../dati'
import { giorniA } from '../lib'
import { Protezione } from './Protezione'
import { Avatar, ChipArea } from './ui'

interface Voce { a: string; etichetta: string; icona: LucideIcon; conteggio?: number; soloManager?: boolean }

export function Layout() {
  const { progetto, sonoManager } = useApp()
  const { proposte, avvisi } = useDati()
  const inAttesa = proposte.filter((p) => p.stato === 'in_attesa').length
  const segnalazioni = avvisi.filter((a) => !a.risolto).length
  const { pathname } = useLocation()

  const voci: Voce[] = [
    { a: '/', etichetta: 'Panoramica', icona: LayoutDashboard, conteggio: sonoManager ? segnalazioni : undefined },
    { a: '/documenti', etichetta: 'Documenti', icona: FileText, conteggio: sonoManager ? inAttesa : undefined },
    { a: '/team', etichetta: 'Team e scadenze', icona: ChartGantt },
    { a: '/chiedi', etichetta: 'Chiedi al Brain', icona: MessageSquare },
    { a: '/registro', etichetta: 'Registro', icona: ScrollText, soloManager: true },
  ].filter((v) => !v.soloManager || sonoManager)

  const giorni = giorniA(progetto.scadenza)
  return (
    <div className="flex min-h-screen">
      {/* barra laterale */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/30">
            <BrainCircuit size={20} />
          </span>
          <div>
            <p className="leading-tight font-semibold">Company Brain</p>
            <p className="text-xs text-slate-500">Automazioni Dora</p>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 px-3">
          {voci.map((v) => <VoceNav key={v.a} v={v} />)}
        </nav>
        <div className="m-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-[11px] font-medium tracking-wide text-slate-400 uppercase">Progetto</p>
          <p className="mt-1 text-sm leading-snug font-medium text-slate-800">{progetto.nome}</p>
          <p className="text-xs text-slate-500">{progetto.cliente}</p>
          <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-rose-600">
            <CalendarClock size={13} /> Collaudo tra {giorni} giorni
          </p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/80 backdrop-blur-xl">
          <div className="flex items-center gap-3 px-4 py-3 lg:px-8">
            <div className="flex items-center gap-2 lg:hidden">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white"><BrainCircuit size={17} /></span>
            </div>
            <FintiInUso />
            <div className="ml-auto"><MenuPersona /></div>
          </div>
          {/* navigazione su schermi piccoli */}
          <nav className="flex gap-1 overflow-x-auto px-3 pb-2 lg:hidden">
            {voci.map((v) => <VoceNav key={v.a} v={v} compatta />)}
          </nav>
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 lg:px-8 lg:py-8">
          <Protezione nome={pathname} key={pathname}>
            <motion.div key={pathname} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
              <Outlet />
            </motion.div>
          </Protezione>
        </main>
      </div>
    </div>
  )
}

function VoceNav({ v, compatta }: { v: Voce; compatta?: boolean }) {
  const Icona = v.icona
  return (
    <NavLink
      to={v.a}
      end={v.a === '/'}
      className={({ isActive }) => clsx(
        'flex items-center gap-3 rounded-lg text-sm font-medium whitespace-nowrap transition',
        compatta ? 'px-3 py-1.5' : 'px-3 py-2',
        isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
      )}
    >
      <Icona size={17} />
      <span className="flex-1">{v.etichetta}</span>
      {!!v.conteggio && <span className="rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] leading-none font-semibold text-white">{v.conteggio}</span>}
    </NavLink>
  )
}

/** Trasparenza: dice quando una parte della UI usa dati d'esempio perché il backend non ha ancora l'endpoint. */
function FintiInUso() {
  const elenco = useSyncExternalStore(finti.iscrivi, finti.elenco)
  if (!elenco) return null
  return (
    <span title="Endpoint non ancora presenti nel backend: la UI mostra dati d'esempio (docs/proposte-contratto-ui.md)"
      className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-200 ring-inset">
      <FlaskConical size={13} /> Dati d'esempio: {elenco}
    </span>
  )
}

function MenuPersona() {
  const { io, membri, persone, scegliPersona, esci, progetto } = useApp()
  const [aperto, setAperto] = useState(false)
  const rif = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aperto) return
    const fuori = (e: MouseEvent) => { if (!rif.current?.contains(e.target as Node)) setAperto(false) }
    document.addEventListener('mousedown', fuori)
    return () => document.removeEventListener('mousedown', fuori)
  }, [aperto])

  const altri = Object.values(persone).filter((p) => !membri.some((m) => m.id === p.id))
  return (
    <div ref={rif} className="relative">
      <button onClick={() => setAperto((a) => !a)}
        className="flex items-center gap-2.5 rounded-xl py-1 pr-2 pl-1 transition hover:bg-slate-100" aria-expanded={aperto}>
        <Avatar persona={io} size={34} />
        <span className="hidden text-left sm:block">
          <span className="block text-sm leading-tight font-medium">{io.nome}</span>
          <span className="block text-xs text-slate-500">{io.id === progetto.manager_id ? 'Manager del progetto' : io.ruolo}</span>
        </span>
        <ChevronDown size={16} className="text-slate-400" />
      </button>
      <AnimatePresence>
        {aperto && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
            className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="border-b border-slate-100 p-4">
              <p className="text-xs text-slate-500">Le tue competenze: vedi solo ciò che rientra qui</p>
              <div className="mt-2 flex flex-wrap gap-1">{io.competenze.map((a) => <ChipArea key={a} area={a} />)}</div>
            </div>
            <p className="px-4 pt-3 text-[11px] font-medium tracking-wide text-slate-400 uppercase">Entra come (demo)</p>
            <ul className="max-h-80 overflow-y-auto p-2">
              {[...membri, ...altri].map((p) => (
                <li key={p.id}>
                  <button onClick={() => { setAperto(false); scegliPersona(p.id) }}
                    className={clsx('flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-slate-50', p.id === io.id && 'bg-indigo-50')}>
                    <Avatar persona={p} size={30} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{p.nome}</span>
                      <span className="block truncate text-xs text-slate-500">
                        {p.id === progetto.manager_id ? 'Manager' : p.ruolo}{!membri.some((m) => m.id === p.id) && ' · fuori progetto'}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <button onClick={esci} className="flex w-full items-center gap-2 border-t border-slate-100 px-4 py-3 text-sm text-slate-600 hover:bg-slate-50">
              <LogOut size={15} /> Torna alla scelta della persona
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
