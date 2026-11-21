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

// il filo colorato a sinistra dell'avviso, dello stesso tono dell'etichetta
const FILO: Record<Tono, string> = {
  rosso: 'before:bg-allarme', giallo: 'before:bg-segnale', viola: 'before:bg-viola',
  blu: 'before:bg-cavo', grigio: 'before:bg-linea-forte', verde: 'before:bg-timbro',
}

const TIPI: Record<TipoAvviso, [string, Tono, LucideIcon]> = {
  incongruenza: ['Incongruenza', 'rosso', TriangleAlert],
  punto_oscuro: ['Punto oscuro', 'giallo', CircleHelp],
  sconosciuto: ['Non lo conosco', 'viola', UserRoundX],
  dipendenza_a_rischio: ['Dipendenza a rischio', 'rosso', GitBranch],
  evento_esterno: ['Evento esterno', 'blu', Zap],
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
      className={clsx("relative list-none overflow-hidden rounded-[5px] border border-linea bg-foglio py-3.5 pr-4 pl-5 before:absolute before:inset-y-0 before:left-0 before:w-[4px] before:content-['']", FILO[tono])}>
      <div className="flex items-center gap-2">
        <Badge tono={tono} icona={Icona}>{etichetta}</Badge>
        {a.basato_su_proposte?.length ? <Badge tono="grigio" icona={Hourglass}>da proposte non ancora approvate</Badge> : null}
        {sonoManager && a.solo_manager && <span className="text-xs text-traccia">visibile solo a te</span>}
      </div>
      <p className="mt-2 text-[15px] leading-relaxed">{a.testo}</p>
      <Citazioni citazioni={a.citazioni} className="mt-2" />
      {sonoManager && !!a.inoltrato_a?.length && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-grafite">
          <Forward size={12} /> Inoltrato a
          <span className="flex -space-x-1">{a.inoltrato_a.map((id) => <Avatar key={id} persona={persone[id]} size={18} />)}</span>
        </p>
      )}
      {sonoManager && (
        <div className="mt-3 flex flex-wrap gap-2">
          {correggibile && <Bottone piccolo variante="attenzione" onClick={() => setCorreggi(true)}>Correggi</Bottone>}
          <Bottone piccolo variante="fantasma" icona={Forward} onClick={() => setInoltra(true)}>Inoltra</Bottone>
          <Bottone piccolo variante="fantasma" icona={CircleCheck} onClick={() => risolvi(a.id)}>Segna come risolto</Bottone>
        </div>
      )}
      {proposta && (
        <Modale aperto={correggi} onChiudi={() => setCorreggi(false)} titolo="Correggi la proposta del Brain">
          <p className="mb-4 text-sm text-grafite">
            Sistema i campi incerti e approva: l'avviso si chiude da solo e la voce entra nella memoria del progetto.
          </p>
          <CartaProposta p={proposta} correggiSubito onDecisa={() => setCorreggi(false)} />
        </Modale>
      )}
      {sonoManager && (
        <Modale aperto={inoltra} onChiudi={() => setInoltra(false)} titolo="Inoltra l'avviso">
          <Inoltro a={a} onFatto={() => setInoltra(false)} />
        </Modale>
      )}
    </motion.li>
  )
}

/** Il Brain parla per primo: avvisi aperti, opzionalmente di un solo documento. */
export function ListaAvvisi({ documentoId }: { documentoId?: string }) {
  const { avvisi, connesso } = useDati()
  const aperti = avvisi.filter((a) => !a.risolto && (!documentoId || a.documento_id === documentoId))
  return (
    <>
      <div className="flex items-center gap-2 px-5 pt-3.5 text-xs text-grafite" role="status">
        <span aria-hidden className={clsx('h-2 w-2 rounded-full', connesso ? 'animate-spia bg-timbro' : 'bg-linea-forte')} />
        {connesso ? 'In ascolto: gli avvisi arrivano da soli' : 'Connessione agli avvisi in corso…'}
      </div>
      {aperti.length === 0
        ? <Vuoto icona={CircleCheck} titolo="Tutto chiaro" testo="Il Brain non ha nulla da segnalarti in questo momento." />
        : (
          <ul className="space-y-2.5 p-4 pt-3">
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
      <p className="border-l-[3px] border-linea-forte pl-3 text-sm text-grafite">{a.testo}</p>
      <p className="mt-5 mb-2 text-sm font-bold">A chi</p>
      <ul className="grid gap-1 sm:grid-cols-2">
        {membri.filter((m) => m.id !== progetto.manager_id).map((m) => (
          <li key={m.id}>
            <label className="flex cursor-pointer items-center gap-2 rounded-[4px] px-2 py-1.5 hover:bg-velina">
              <input type="checkbox" checked={scelti.has(m.id)} onChange={() => alterna(m.id)} className="h-4 w-4 accent-[var(--color-inchiostro)]" />
              <Avatar persona={m} size={22} />
              <span className="min-w-0 truncate text-sm">{m.nome}</span>
            </label>
          </li>
        ))}
      </ul>
      <p className="mt-5 mb-2 text-sm font-bold">Oppure a chi ha queste competenze</p>
      <div className="flex flex-wrap gap-1.5">
        {AREE.map((ar) => <ChipArea key={ar} area={ar} attiva={aree.includes(ar)} onClick={() => setAree((xs) => (xs.includes(ar) ? xs.filter((x) => x !== ar) : [...xs, ar]))} />)}
      </div>
      <Bottone variante="primario" icona={Forward} className="mt-5" disabled={occupato || (!scelti.size && !aree.length)}
        onClick={async () => { setOccupato(true); if (await inoltra(a.id, [...scelti], aree)) onFatto(); setOccupato(false) }}>
        Inoltra
      </Bottone>
    </div>
  )
}
