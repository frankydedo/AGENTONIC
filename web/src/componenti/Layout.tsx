import clsx from 'clsx'
import {
  ChartGantt, Check, Mail, ChevronDown, ChevronRight, ChevronsUpDown, FileText, Folder, FolderKanban, LayoutGrid, LogOut, MessageCircle, History, Upload, Settings, type LucideIcon,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState, type RefObject } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { useApp } from '../contesto'
import { useDati } from '../dati'
import { useNonLette } from '../posta'
import { dataMedia, giorniA, progettiRecenti, segnaAperto, ultimiAperti } from '../lib'
import { PannelloAnalisi } from './Analisi'
import { Protezione } from './Protezione'
import { corrisponde, Sovrapposto } from './Selettori'
import { SceltaTema } from './Tema'
import { Avatar, Bottone, ChipArea, MarchioBrain, Modale } from './ui'

interface Voce { a: string; etichetta: string; breve: string; icona: LucideIcon; conteggio?: number; attenzione?: boolean; soloManager?: boolean }

export function Layout() {
  const { sonoManager, progetti, io } = useApp()
  const nonLette = useNonLette(io.id)
  const { proposte, avvisi } = useDati()
  const inAttesa = proposte.filter((p) => p.stato === 'in_attesa').length
  const segnalazioni = avvisi.filter((a) => !a.risolto).length
  const { pathname } = useLocation()

  const voci: Voce[] = [
    { a: '/projects', etichetta: 'Projects', breve: 'Projects', icona: FolderKanban, conteggio: progetti.length > 1 ? progetti.length : undefined },
    { a: '/', etichetta: 'Overview', breve: 'Today', icona: LayoutGrid, conteggio: sonoManager ? segnalazioni : undefined },
    { a: '/mail', etichetta: 'Mail', breve: 'Mail', icona: Mail, conteggio: nonLette || undefined },
    { a: '/documents', etichetta: 'Documents', breve: 'Docs', icona: FileText, conteggio: sonoManager ? inAttesa : undefined, attenzione: true },
    { a: '/team', etichetta: 'Team & deadlines', breve: 'Team', icona: ChartGantt },
    { a: '/ask', etichetta: 'Ask Agentonic', breve: 'Ask', icona: MessageCircle },
    { a: '/log', etichetta: 'Activity log', breve: 'Log', icona: History, soloManager: true },
    { a: '/settings', etichetta: 'Settings', breve: 'Settings', icona: Settings },
  ].filter((v) => !v.soloManager || sonoManager)
  // su telefono la barra resta corta: i progetti si cambiano dal selettore in alto, il registro dal computer
  const schede = voci.filter((v) => v.a !== '/projects' && v.a !== '/log')

  return (
    <div className="flex min-h-screen">
      {/* barra laterale */}
      <aside className="vetro sticky top-0 hidden h-screen w-[264px] shrink-0 flex-col gap-6 border-r border-separatore px-3.5 py-5 lg:flex">
        <div className="flex items-center gap-2.5 px-2">
          <MarchioBrain size={30} parla={segnalazioni + inAttesa > 0} />
          <div>
            <p className="text-[15px] leading-tight font-semibold tracking-[-0.01em]">Agentonic</p>
            <p className="text-xs text-testo-2">Automazioni Dora</p>
          </div>
        </div>
        <SelettoreProgetto />
        <nav aria-label="Sections" className="flex-1 space-y-0.5">
          {voci.map((v) => <VoceNav key={v.a} v={v} />)}
        </nav>
        <Scadenza />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-separatore bg-fondo/80 backdrop-blur-xl backdrop-saturate-150 lg:border-transparent">
          <div className="flex items-center gap-3 px-4 py-2.5 lg:px-10 lg:py-3.5">
            <div className="flex min-w-0 items-center gap-2.5 lg:hidden">
              <MarchioBrain size={26} parla={segnalazioni + inAttesa > 0} />
              <SelettoreProgetto compatto />
            </div>
            <div className="ml-auto flex items-center gap-2">
              {sonoManager && <CaricaRiunione />}
              <MenuPersona />
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 pt-3 pb-28 lg:px-10 lg:pb-14">
          <Protezione nome={pathname} key={pathname}>
            <Outlet />
          </Protezione>
        </main>
      </div>

      {/* su telefono: barra delle schede in basso */}
      <nav aria-label="Sections" className="vetro fixed inset-x-0 bottom-0 z-30 grid border-t border-separatore px-2 pt-1.5 pb-[max(env(safe-area-inset-bottom),10px)] lg:hidden"
        style={{ gridTemplateColumns: `repeat(${schede.length}, minmax(0, 1fr))` }}>
        {schede.map((v) => <VoceScheda key={v.a} v={v} />)}
      </nav>
    </div>
  )
}

/** Chiude un menu a comparsa con un clic fuori o con Esc. */
function useChiudiFuori(aperto: boolean, chiudi: () => void, rif: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!aperto) return
    const fuori = (e: MouseEvent) => { if (!rif.current?.contains(e.target as Node)) chiudi() }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') chiudi() }
    document.addEventListener('mousedown', fuori)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fuori); document.removeEventListener('keydown', esc) }
  }, [aperto, chiudi, rif])
}

const POPOVER = 'absolute z-[1000] max-h-[min(70vh,32rem)] overflow-y-auto overscroll-contain rounded-2xl bg-superficie p-1.5 shadow-alta'

/** Il progetto in cui stai lavorando: ognuno vede solo quelli di cui è membro (lo decide il backend). */
function SelettoreProgetto({ compatto }: { compatto?: boolean }) {
  const { progetto, progetti, scegliProgetto, io } = useApp()
  const [aperto, setAperto] = useState(false)
  const ancora = useRef<HTMLDivElement>(null)
  // il progetto aperto diventa il più recente
  useEffect(() => { segnaAperto(io.id, progetto.id) }, [io.id, progetto.id])
  const recenti = aperto ? ultimiAperti(progetti, progettiRecenti(io.id), 3) : []

  return (
    <div ref={ancora} className="relative min-w-0">
      {compatto ? (
        <button onClick={() => setAperto((a) => !a)} aria-expanded={aperto}
          className="flex max-w-[12rem] items-center gap-1 text-left text-[15px] font-semibold text-accento-testo sm:max-w-xs">
          <span className="truncate">{progetto.nome}</span>
          <ChevronDown size={14} strokeWidth={2.6} className="shrink-0" />
        </button>
      ) : (
        <button onClick={() => setAperto((a) => !a)} aria-expanded={aperto}
          className="flex w-full items-center gap-2.5 rounded-[14px] bg-superficie p-2.5 text-left shadow-card transition hover:bg-riempimento/60">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-accento-tenue text-accento-testo"><Folder size={18} /></span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold">{progetto.nome}</span>
            <span className="block truncate text-xs text-testo-2">{progetto.cliente}</span>
          </span>
          <ChevronsUpDown size={14} className="shrink-0 text-testo-3" />
        </button>
      )}
      <Sovrapposto ancora={ancora} aperto={aperto} onChiudi={() => setAperto(false)} larghezza={320}>
          <ul>
            <li className="px-2.5 pt-1.5 pb-1 text-xs font-semibold text-testo-2">Recently opened</li>
            {recenti.map((p) => {
              const attuale = p.id === progetto.id
              return (
                <li key={p.id}>
                  <button onClick={() => { setAperto(false); if (!attuale) scegliProgetto(p.id) }}
                    className="flex w-full items-start gap-3 rounded-[10px] px-2.5 py-2 text-left hover:bg-riempimento">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{p.nome}</span>
                      <span className="block truncate text-xs text-testo-2">{p.cliente}, {p.membri.length} people</span>
                      {p.manager_id === io.id && <span className="mt-1 inline-block text-xs font-medium text-viola-testo">You’re the manager</span>}
                    </span>
                    {attuale && <Check size={16} strokeWidth={2.6} className="mt-0.5 shrink-0 text-accento-testo" />}
                  </button>
                </li>
              )
            })}
            <li className="mt-1 border-t border-separatore pt-1">
              <Link to="/projects" onClick={() => setAperto(false)}
                className="flex items-center justify-between rounded-[10px] px-2.5 py-2 text-sm text-accento-testo hover:bg-riempimento">
                All projects ({progetti.length}) <ChevronRight size={15} />
              </Link>
            </li>
          </ul>
      </Sovrapposto>
    </div>
  )
}

/** In fondo alla barra: quanto manca alla scadenza del progetto. */
function Scadenza() {
  const { progetto } = useApp()
  const giorni = giorniA(progetto.scadenza)
  return (
    <div className="rounded-[14px] bg-superficie/70 p-3.5 shadow-card">
      <p className="text-xs text-testo-2">Project deadline</p>
      <p className={clsx('mt-1 text-[22px] leading-none font-bold tracking-[-0.02em]', giorni <= 14 && 'text-rosso-testo')}>
        {giorni >= 0 ? `in ${giorni} days` : `${-giorni} days ago`}
      </p>
      <p className="mt-1 text-xs text-testo-2">{dataMedia(progetto.scadenza)}</p>
    </div>
  )
}

function VoceNav({ v }: { v: Voce }) {
  const Icona = v.icona
  return (
    <NavLink
      to={v.a}
      end={v.a === '/'}
      className={({ isActive }) => clsx(
        'flex items-center gap-2.5 rounded-[9px] px-2.5 py-[7px] text-[14px] transition-colors',
        isActive ? 'bg-black/[0.07] font-semibold dark:bg-white/[0.1]' : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.06]',
      )}
    >
      <Icona size={18} strokeWidth={1.9} className="text-accento-testo" />
      <span className="flex-1">{v.etichetta}</span>
      {!!v.conteggio && (v.attenzione
        ? <span className="cifre grid h-5 min-w-5 place-items-center rounded-full bg-arancio px-1.5 text-xs font-semibold text-[#1d1d1f]">{v.conteggio}</span>
        : <span className="cifre text-xs font-semibold text-testo-2">{v.conteggio}</span>)}
    </NavLink>
  )
}

function VoceScheda({ v }: { v: Voce }) {
  const Icona = v.icona
  return (
    <NavLink to={v.a} end={v.a === '/'} aria-label={v.etichetta}
      className={({ isActive }) => clsx('relative flex flex-col items-center gap-0.5 py-1 text-[10px] font-medium', isActive ? 'text-accento-testo' : 'text-testo-2')}>
      <Icona size={23} strokeWidth={1.9} />
      {v.breve}
      {!!v.conteggio && <span className="absolute top-0 left-1/2 ml-2 grid h-4 min-w-4 place-items-center rounded-full bg-rosso px-1 text-[10px] font-semibold text-white">{v.conteggio}</span>}
    </NavLink>
  )
}

/** Il manager carica una riunione da qualunque pagina e guarda Agentonic lavorare. */
function CaricaRiunione() {
  const [aperto, setAperto] = useState(false)
  return (
    <>
      <Bottone variante="primario" icona={Upload} onClick={() => setAperto(true)} aria-label="Upload meeting">
        <span className="hidden sm:inline">Upload meeting</span>
      </Bottone>
      <Modale aperto={aperto} onChiudi={() => setAperto(false)} titolo="Upload a meeting">
        <PannelloAnalisi onChiudi={() => setAperto(false)} />
      </Modale>
    </>
  )
}

function MenuPersona() {
  const { io, membri, persone, scegliPersona, esci, progetto } = useApp()
  const [aperto, setAperto] = useState(false)
  const rif = useRef<HTMLDivElement>(null)
  useChiudiFuori(aperto, () => setAperto(false), rif)

  const [cerca, setCerca] = useState('')
  const altri = Object.values(persone).filter((p) => !membri.some((m) => m.id === p.id))
  const elenco = [...membri, ...altri].filter((p) => corrisponde(`${p.nome} ${p.ruolo}`, cerca))
  return (
    <div ref={rif} className="relative">
      <button onClick={() => setAperto((a) => !a)} aria-expanded={aperto}
        className="flex items-center gap-2 rounded-full py-0.5 pr-2 pl-0.5 transition-colors hover:bg-black/[0.05] dark:hover:bg-white/[0.08]">
        <Avatar persona={io} size={32} />
        <span className="hidden text-left sm:block">
          <span className="block text-[13px] leading-tight font-semibold">{io.nome}</span>
          <span className="block text-xs text-testo-2">{io.id === progetto.manager_id ? 'Project manager' : io.ruolo}</span>
        </span>
        <ChevronDown size={14} className={clsx('text-testo-3 transition-transform', aperto && 'rotate-180')} />
      </button>
      <AnimatePresence>
        {aperto && (
          <motion.div initial={{ opacity: 0, y: -4, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.16 }} className={clsx(POPOVER, 'right-0 mt-2 w-80 p-0')}>
            <div className="p-4">
              <p className="text-xs text-testo-2">Your areas: you only see what falls within them</p>
              <div className="mt-2 flex flex-wrap gap-1">{io.competenze.map((a) => <ChipArea key={a} area={a} />)}</div>
              <p className="mt-4 mb-1.5 text-xs text-testo-2">Appearance</p>
              <SceltaTema piccolo />
            </div>
            <div className="border-t border-separatore">
              <p className="px-4 pt-3 text-xs font-semibold text-testo-2">Sign in as someone else (demo)</p>
              <input value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder={`Search ${membri.length + altri.length} people…`}
                aria-label="Search for a person" className="mx-4 mt-2 w-[calc(100%-2rem)] rounded-lg bg-riempimento px-3 py-1.5 text-sm focus:outline-none" />
              <ul className="max-h-72 overflow-y-auto p-1.5">
                {elenco.length === 0 && <li className="px-2.5 py-2 text-sm text-testo-2">Nessuno trovato.</li>}
                {elenco.map((p) => {
                  const fuori = !membri.some((m) => m.id === p.id)
                  return (
                    <li key={p.id}>
                      <button onClick={() => { setAperto(false); scegliPersona(p.id) }}
                        className="flex w-full items-center gap-3 rounded-[10px] px-2.5 py-1.5 text-left hover:bg-riempimento">
                        <Avatar persona={p} size={28} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{p.nome}</span>
                          <span className="block truncate text-xs text-testo-2">{p.id === progetto.manager_id ? 'Manager' : p.ruolo}</span>
                        </span>
                        {p.id === io.id ? <Check size={15} strokeWidth={2.6} className="text-accento-testo" />
                          : fuori && <span className="text-[11px] text-testo-2">not on this project</span>}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
            <button onClick={esci} className="flex w-full items-center gap-2 border-t border-separatore px-4 py-3 text-sm text-rosso-testo hover:bg-riempimento">
              <LogOut size={15} /> Back to choosing a person
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
