import clsx from 'clsx'
import {
  ChartGantt, Check, ChevronDown, ChevronsUpDown, FileText, FlaskConical, LayoutDashboard, LogOut, MessageSquare,
  ScrollText, UploadCloud, type LucideIcon,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { finti } from '../api'
import { useApp } from '../contesto'
import { useDati } from '../dati'
import { dataMedia, giorniA } from '../lib'
import { PannelloAnalisi } from './Analisi'
import { Protezione } from './Protezione'
import { Avatar, Bottone, ChipArea, MarchioBrain, Modale } from './ui'

interface Voce { a: string; etichetta: string; icona: LucideIcon; conteggio?: number; soloManager?: boolean }

export function Layout() {
  const { sonoManager } = useApp()
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

  return (
    <div className="flex min-h-screen">
      {/* barra laterale */}
      <aside className="sticky top-0 hidden h-screen w-[272px] shrink-0 flex-col border-r border-linea bg-foglio lg:flex">
        <div className="flex items-center gap-3 px-5 pt-6 pb-7">
          <MarchioBrain size={34} parla={segnalazioni + inAttesa > 0} />
          <div>
            <p className="text-[17px] leading-none font-extrabold [font-stretch:118%] tracking-tight">Company Brain</p>
            <p className="mt-1 text-xs text-grafite">Automazioni Dora</p>
          </div>
        </div>
        <nav className="flex-1 space-y-px px-3">
          {voci.map((v) => <VoceNav key={v.a} v={v} />)}
        </nav>
        <Cartiglio />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-linea bg-carta/85 backdrop-blur-md">
          <div className="flex items-center gap-3 px-4 py-2.5 lg:px-10">
            <div className="flex items-center gap-2 lg:hidden">
              <MarchioBrain size={28} parla={segnalazioni + inAttesa > 0} />
            </div>
            <div className="min-w-0 lg:hidden"><SelettoreCompatto /></div>
            <FintiInUso />
            <div className="ml-auto flex items-center gap-2">
              {sonoManager && <CaricaRiunione />}
              <MenuPersona />
            </div>
          </div>
          {/* navigazione su schermi piccoli */}
          <nav className="flex gap-1 overflow-x-auto px-3 pb-2 lg:hidden">
            {voci.map((v) => <VoceNav key={v.a} v={v} compatta />)}
          </nav>
        </header>
        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-7 lg:px-10 lg:py-10">
          <Protezione nome={pathname} key={pathname}>
            <Outlet />
          </Protezione>
        </main>
      </div>
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

/**
 * Il cartiglio della tavola: i dati della commessa nel riquadro in basso, come su un disegno tecnico.
 * La cella della commessa è anche il selettore: ognuno vede solo i progetti di cui è membro (lo decide il backend).
 */
function Cartiglio() {
  const { progetto, persone } = useApp()
  const [aperto, setAperto] = useState(false)
  const rif = useRef<HTMLDivElement>(null)
  useChiudiFuori(aperto, () => setAperto(false), rif)
  const giorni = giorniA(progetto.scadenza)
  const manager = persone[progetto.manager_id]

  return (
    <div ref={rif} className="relative m-4">
      <AnimatePresence>
        {aperto && <ElencoProgetti onScelto={() => setAperto(false)} className="right-0 bottom-full left-0 mb-2" />}
      </AnimatePresence>
      <dl className="grid grid-cols-2 overflow-hidden rounded-[3px] border-[1.5px] border-inchiostro text-[12px] leading-snug">
        <div className="col-span-2 border-b-[1.5px] border-inchiostro">
          <button onClick={() => setAperto((a) => !a)} aria-expanded={aperto}
            className="group flex w-full items-start gap-2 px-2.5 py-1.5 text-left transition-colors hover:bg-velina">
            <span className="min-w-0 flex-1">
              <dt className="text-[10.5px] text-grafite">Commessa</dt>
              <dd className="mt-px font-bold [font-stretch:95%]">{progetto.nome}</dd>
            </span>
            <ChevronsUpDown size={14} className="mt-2 shrink-0 text-grafite group-hover:text-inchiostro" />
          </button>
        </div>
        <Cella etichetta="Cliente" classe="border-r border-b">{progetto.cliente}</Cella>
        <Cella etichetta="Manager" classe="border-b">{manager?.nome ?? '—'}</Cella>
        <Cella etichetta="Scadenza" classe={clsx('border-r', giorni <= 14 && 'bg-segnale-chiaro')}>
          <span className="condensato text-[15px] font-bold">{giorni >= 0 ? `tra ${giorni} giorni` : `${-giorni} giorni fa`}</span>
        </Cella>
        <Cella etichetta="Data">{dataMedia(progetto.scadenza)}</Cella>
      </dl>
    </div>
  )
}

function Cella({ etichetta, classe, children }: { etichetta: string; classe?: string; children: ReactNode }) {
  return (
    <div className={clsx('border-inchiostro px-2.5 py-1.5', classe)}>
      <dt className="text-[10.5px] text-grafite">{etichetta}</dt>
      <dd className="mt-px">{children}</dd>
    </div>
  )
}

/** Su schermi piccoli il cartiglio non c'è: resta il nome della commessa, che apre lo stesso elenco. */
function SelettoreCompatto() {
  const { progetto } = useApp()
  const [aperto, setAperto] = useState(false)
  const rif = useRef<HTMLDivElement>(null)
  useChiudiFuori(aperto, () => setAperto(false), rif)
  return (
    <div ref={rif} className="relative">
      <button onClick={() => setAperto((a) => !a)} aria-expanded={aperto}
        className="flex max-w-[11rem] items-center gap-1.5 rounded-[4px] border border-linea-forte bg-foglio px-2 py-1 text-left text-sm font-semibold sm:max-w-xs">
        <span className="truncate">{progetto.nome}</span>
        <ChevronsUpDown size={13} className="shrink-0 text-grafite" />
      </button>
      <AnimatePresence>
        {aperto && <ElencoProgetti onScelto={() => setAperto(false)} className="top-full left-0 mt-2 w-80" />}
      </AnimatePresence>
    </div>
  )
}

function ElencoProgetti({ onScelto, className }: { onScelto: () => void; className: string }) {
  const { progetto, progetti, scegliProgetto, io } = useApp()
  return (
    <motion.ul initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }} transition={{ duration: 0.15 }}
      className={clsx('sopra absolute z-50 overflow-hidden rounded-md border border-inchiostro bg-foglio p-2', className)}>
      <li className="px-2 pt-1 pb-2 text-xs font-semibold text-grafite">I tuoi progetti ({progetti.length})</li>
      {progetti.map((p) => {
        const attuale = p.id === progetto.id
        return (
          <li key={p.id}>
            <button onClick={() => { onScelto(); if (!attuale) scegliProgetto(p.id) }}
              className={clsx('flex w-full items-start gap-3 rounded-[4px] px-2 py-2 text-left hover:bg-velina', attuale && 'bg-segnale-chiaro')}>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{p.nome}</span>
                <span className="block truncate text-xs text-grafite">{p.cliente}, {p.membri.length} persone</span>
                {p.manager_id === io.id && <span className="mt-1 inline-block text-xs font-semibold">Sei il manager</span>}
              </span>
              {attuale && <Check size={15} strokeWidth={2.5} className="mt-0.5 shrink-0" />}
            </button>
          </li>
        )
      })}
    </motion.ul>
  )
}

function VoceNav({ v, compatta }: { v: Voce; compatta?: boolean }) {
  const Icona = v.icona
  return (
    <NavLink
      to={v.a}
      end={v.a === '/'}
      className={({ isActive }) => clsx(
        'relative flex items-center gap-3 rounded-[4px] text-[14.5px] whitespace-nowrap transition-colors',
        compatta ? 'px-3 py-1.5' : 'px-3 py-2',
        isActive
          ? 'bg-inchiostro font-semibold text-foglio'
          : 'text-grafite hover:bg-velina hover:text-inchiostro',
      )}
    >
      <Icona size={17} strokeWidth={2.1} />
      <span className="flex-1">{v.etichetta}</span>
      {!!v.conteggio && (
        <span className="condensato grid min-w-[22px] place-items-center rounded-[3px] bg-segnale px-1 py-px text-[12px] font-bold text-inchiostro">
          {v.conteggio}
        </span>
      )}
    </NavLink>
  )
}

/** Il manager carica una riunione da qualunque pagina e guarda il Brain lavorare. */
function CaricaRiunione() {
  const [aperto, setAperto] = useState(false)
  return (
    <>
      <Bottone variante="primario" icona={UploadCloud} onClick={() => setAperto(true)} aria-label="Carica riunione">
        <span className="hidden sm:inline">Carica riunione</span>
      </Bottone>
      <Modale aperto={aperto} onChiudi={() => setAperto(false)} titolo="Carica una riunione">
        <PannelloAnalisi onChiudi={() => setAperto(false)} />
      </Modale>
    </>
  )
}

/** Trasparenza: dice quando una parte della UI usa dati d'esempio perché il backend non ha ancora l'endpoint. */
function FintiInUso() {
  const elenco = useSyncExternalStore(finti.iscrivi, finti.elenco)
  if (!elenco) return null
  return (
    <span title="Endpoint non ancora presenti nel backend: la UI mostra dati d'esempio (docs/proposte-contratto-ui.md)"
      className="inline-flex items-center gap-1.5 rounded-[3px] border border-dashed border-segnale-scuro/50 bg-segnale-chiaro px-2 py-0.5 text-xs font-medium text-segnale-scuro">
      <FlaskConical size={13} /> Dati d'esempio: {elenco}
    </span>
  )
}

function MenuPersona() {
  const { io, membri, persone, scegliPersona, esci, progetto } = useApp()
  const [aperto, setAperto] = useState(false)
  const rif = useRef<HTMLDivElement>(null)
  useChiudiFuori(aperto, () => setAperto(false), rif)

  const altri = Object.values(persone).filter((p) => !membri.some((m) => m.id === p.id))
  return (
    <div ref={rif} className="relative">
      <button onClick={() => setAperto((a) => !a)}
        className="flex items-center gap-2.5 rounded-[4px] py-1 pr-2 pl-1 transition-colors hover:bg-foglio" aria-expanded={aperto}>
        <Avatar persona={io} size={32} />
        <span className="hidden text-left sm:block">
          <span className="block text-sm leading-tight font-semibold">{io.nome}</span>
          <span className="block text-xs text-grafite">{io.id === progetto.manager_id ? 'Manager del progetto' : io.ruolo}</span>
        </span>
        <ChevronDown size={16} className={clsx('text-grafite transition-transform', aperto && 'rotate-180')} />
      </button>
      <AnimatePresence>
        {aperto && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}
            className="sopra absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-md border border-inchiostro bg-foglio">
            <div className="border-b border-linea p-4">
              <p className="text-xs text-grafite">Le tue competenze: vedi solo ciò che rientra qui</p>
              <div className="mt-2 flex flex-wrap gap-1">{io.competenze.map((a) => <ChipArea key={a} area={a} />)}</div>
            </div>
            <p className="px-4 pt-3 text-xs font-semibold text-grafite">Entra come un'altra persona (demo)</p>
            <ul className="max-h-80 overflow-y-auto p-2">
              {[...membri, ...altri].map((p) => {
                const fuori = !membri.some((m) => m.id === p.id)
                return (
                  <li key={p.id}>
                    <button onClick={() => { setAperto(false); scegliPersona(p.id) }}
                      className={clsx('flex w-full items-center gap-3 rounded-[4px] px-2 py-1.5 text-left hover:bg-velina', p.id === io.id && 'bg-segnale-chiaro')}>
                      <Avatar persona={p} size={28} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{p.nome}</span>
                        <span className="block truncate text-xs text-grafite">{p.id === progetto.manager_id ? 'Manager' : p.ruolo}</span>
                      </span>
                      {fuori && <span className="text-[11px] text-traccia">fuori progetto</span>}
                    </button>
                  </li>
                )
              })}
            </ul>
            <button onClick={esci} className="flex w-full items-center gap-2 border-t border-linea px-4 py-3 text-sm text-grafite hover:bg-velina hover:text-inchiostro">
              <LogOut size={15} /> Torna alla scelta della persona
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
