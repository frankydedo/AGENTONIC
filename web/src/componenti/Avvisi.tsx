import clsx from 'clsx'
import { CircleCheck, CircleHelp, Forward, GitBranch, Hourglass, Sparkles, TriangleAlert, UserRoundX, Zap, type LucideIcon } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { useApp } from '../contesto'
import { useDati } from '../dati'
import type { Tono } from '../lib'
import { AREE, type Area, type Avviso, type TipoAvviso } from '../tipi'
import { CartaProposta } from './Proposte'
import { Avatar, Badge, Bottone, ChipArea, Citazioni, Modale, Vuoto } from './ui'

// fondo tenue e icona piena dello stesso tono dell'etichetta, come una notifica
const FONDO: Record<Tono, string> = {
  rosso: 'bg-rosso-tenue', giallo: 'bg-arancio-tenue', viola: 'bg-viola-tenue',
  blu: 'bg-accento-tenue', grigio: 'bg-riempimento', verde: 'bg-verde-tenue',
}
const ICONA: Record<Tono, string> = {
  rosso: 'bg-rosso', giallo: 'bg-arancio', viola: 'bg-viola', blu: 'bg-accento', grigio: 'bg-testo-3', verde: 'bg-verde',
}

const TIPI: Record<TipoAvviso, [string, Tono, LucideIcon]> = {
  incongruenza: ['Inconsistency', 'rosso', TriangleAlert],
  punto_oscuro: ['Unclear point', 'giallo', CircleHelp],
  sconosciuto: ['Unknown to me', 'viola', UserRoundX],
  dipendenza_a_rischio: ['Dependency at risk', 'rosso', GitBranch],
  evento_esterno: ['External event', 'blu', Zap],
  brief: ['Brief', 'grigio', Sparkles],
}

export function CartaAvviso({ a }: { a: Avviso }) {
  const { sonoManager, persone } = useApp()
  const { propostaDiAvviso, risolvi } = useDati()
  const [correggi, setCorreggi] = useState(false)
  const [inoltra, setInoltra] = useState(false)
  const [etichetta, tono, Icona] = TIPI[a.tipo]
  const proposta = propostaDiAvviso(a)
  const correggibile = sonoManager && proposta?.stato === 'in_attesa'

  return (
    <motion.li layout initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, height: 0 }}
      className={clsx('flex list-none gap-3 rounded-2xl p-3.5', FONDO[tono])}>
      <span className={clsx('mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-white', ICONA[tono])}><Icona size={14} strokeWidth={2.4} /></span>
      <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className="font-semibold">{etichetta}</span>
        {a.basato_su_proposte?.length ? <Badge tono="grigio" icona={Hourglass} className="bg-superficie/70">from proposals not yet approved</Badge> : null}
        {sonoManager && a.solo_manager && <span className="text-testo-2">visible only to you</span>}
      </div>
      <p className="mt-1 text-[15px] leading-snug">{a.testo}</p>
      <Citazioni citazioni={a.citazioni} className="mt-2 [&_a]:bg-superficie/80" />
      {sonoManager && !!a.inoltrato_a?.length && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-testo-2">
          <Forward size={12} /> Forwarded to
          <span className="flex -space-x-1">{a.inoltrato_a.map((id) => <Avatar key={id} persona={persone[id]} size={18} />)}</span>
        </p>
      )}
      {sonoManager && (
        <div className="mt-2.5 -ml-1 flex flex-wrap gap-1">
          {correggibile && <Bottone piccolo variante="primario" onClick={() => setCorreggi(true)}>Correct</Bottone>}
          <Bottone piccolo variante="fantasma" icona={Forward} onClick={() => setInoltra(true)}>Forward</Bottone>
          <Bottone piccolo variante="fantasma" icona={CircleCheck} onClick={() => risolvi(a.id)}>Mark as resolved</Bottone>
        </div>
      )}
      {proposta && (
        <Modale aperto={correggi} onChiudi={() => setCorreggi(false)} titolo="Correct Agentonic's proposal">
          <p className="mb-4 text-[15px] text-testo-2">
            Fix the uncertain fields and approve: the alert closes by itself and the item enters the project's memory.
          </p>
          <CartaProposta p={proposta} correggiSubito onDecisa={() => setCorreggi(false)} />
        </Modale>
      )}
      {sonoManager && (
        <Modale aperto={inoltra} onChiudi={() => setInoltra(false)} titolo="Forward the alert">
          <Inoltro a={a} onFatto={() => setInoltra(false)} />
        </Modale>
      )}
      </div>
    </motion.li>
  )
}

/** Il Brain parla per primo: avvisi aperti, opzionalmente di un solo documento. */
export function ListaAvvisi({ documentoId, griglia }: { documentoId?: string; griglia?: boolean }) {
  const { avvisi, connesso } = useDati()
  const aperti = avvisi.filter((a) => !a.risolto && (!documentoId || a.documento_id === documentoId))
  return (
    <>
      <div className={clsx('flex items-center gap-2 pt-3 text-xs text-testo-2', griglia ? 'px-5 sm:pl-[78px]' : 'px-5')} role="status">
        <span aria-hidden className="relative flex h-2 w-2">
          {connesso && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-verde opacity-60" />}
          <span className={clsx('relative inline-flex h-2 w-2 rounded-full', connesso ? 'bg-verde' : 'bg-testo-3')} />
        </span>
        {connesso ? 'Listening: alerts arrive on their own' : 'Connecting to alerts…'}
      </div>
      {aperti.length === 0
        ? (griglia
          ? <p className="flex items-center gap-2 px-5 pt-2 pb-5 text-sm text-testo-2 sm:pl-[78px]"><CircleCheck size={15} className="text-verde-testo" /> All clear: Agentonic has nothing to flag for you right now.</p>
          : <Vuoto icona={CircleCheck} titolo="All clear" testo="Agentonic has nothing to flag for you right now." />)
        : (
          <ul className={clsx('gap-2.5 p-4 pt-3', griglia ? 'grid sm:p-5 sm:pt-3 md:grid-cols-2' : 'flex flex-col')}>
            <AnimatePresence initial={false}>{aperti.map((a) => <CartaAvviso key={a.id} a={a} />)}</AnimatePresence>
          </ul>
        )}
    </>
  )
}

/** Il manager decide chi deve sapere: per nome o per area (regola puo_vedere_avviso nel backend). */
function Inoltro({ a, onFatto }: { a: Avviso; onFatto: () => void }) {
  const { membri, progetto } = useApp()
  const { inoltra } = useDati()
  const [scelti, setScelti] = useState<Set<string>>(new Set(a.inoltrato_a ?? []))
  const [aree, setAree] = useState<Area[]>(a.aree ?? [])
  const [occupato, setOccupato] = useState(false)
  const alterna = (id: string) => setScelti((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  return (
    <div>
      <p className="rounded-2xl bg-riempimento p-3.5 text-[15px] text-testo-2">{a.testo}</p>
      <p className="mt-5 mb-2 text-[13px] font-semibold text-testo-2">To whom</p>
      <ul className="grid gap-1 sm:grid-cols-2">
        {membri.filter((m) => m.id !== progetto.manager_id).map((m) => (
          <li key={m.id}>
            <label className="flex cursor-pointer items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-riempimento">
              <input type="checkbox" checked={scelti.has(m.id)} onChange={() => alterna(m.id)} className="h-[18px] w-[18px] accent-[var(--accento)]" />
              <Avatar persona={m} size={22} />
              <span className="min-w-0 truncate text-sm">{m.nome}</span>
            </label>
          </li>
        ))}
      </ul>
      <p className="mt-5 mb-2 text-[13px] font-semibold text-testo-2">Or to anyone with these areas</p>
      <div className="flex flex-wrap gap-1.5">
        {AREE.map((ar) => <ChipArea key={ar} area={ar} attiva={aree.includes(ar)} onClick={() => setAree((xs) => (xs.includes(ar) ? xs.filter((x) => x !== ar) : [...xs, ar]))} />)}
      </div>
      <Bottone variante="primario" icona={Forward} className="mt-5" disabled={occupato || (!scelti.size && !aree.length)}
        onClick={async () => { setOccupato(true); if (await inoltra(a.id, [...scelti], aree)) onFatto(); setOccupato(false) }}>
        Forward
      </Bottone>
    </div>
  )
}
