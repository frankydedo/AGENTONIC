import { CircleCheck, CircleHelp, GitBranch, Radio, Sparkles, TriangleAlert, UserRoundX, Zap, type LucideIcon } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { useApp } from '../contesto'
import { useDati } from '../dati'
import type { Tono } from '../lib'
import type { Avviso, TipoAvviso } from '../tipi'
import { CartaProposta } from './Proposte'
import { Badge, Bottone, Citazioni, Modale, Vuoto } from './ui'

const TIPI: Record<TipoAvviso, [string, Tono, LucideIcon]> = {
  incongruenza: ['Incongruenza', 'rosso', TriangleAlert],
  punto_oscuro: ['Punto oscuro', 'giallo', CircleHelp],
  sconosciuto: ['Non lo conosco', 'viola', UserRoundX],
  dipendenza_a_rischio: ['Dipendenza a rischio', 'rosso', GitBranch],
  evento_esterno: ['Evento esterno', 'blu', Zap],
  brief: ['Brief', 'grigio', Sparkles],
}

export function CartaAvviso({ a }: { a: Avviso }) {
  const { sonoManager } = useApp()
  const { propostaDiAvviso, risolvi } = useDati()
  const [correggi, setCorreggi] = useState(false)
  const [etichetta, tono, Icona] = TIPI[a.tipo]
  const proposta = propostaDiAvviso(a)
  const correggibile = sonoManager && proposta?.stato === 'in_attesa'

  return (
    <motion.li layout initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, height: 0 }}
      className="list-none rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <Badge tono={tono} icona={Icona}>{etichetta}</Badge>
        {a.solo_manager && <span className="text-[11px] text-slate-400">visibile solo a te</span>}
      </div>
      <p className="mt-2 text-sm leading-relaxed text-slate-800">{a.testo}</p>
      <Citazioni citazioni={a.citazioni} className="mt-2" />
      {sonoManager && (
        <div className="mt-3 flex gap-2">
          {correggibile && <Bottone piccolo variante="attenzione" onClick={() => setCorreggi(true)}>Correggi</Bottone>}
          <Bottone piccolo variante="fantasma" icona={CircleCheck} onClick={() => risolvi(a.id)}>Segna come risolto</Bottone>
        </div>
      )}
      {proposta && (
        <Modale aperto={correggi} onChiudi={() => setCorreggi(false)} titolo="Correggi la proposta del Brain">
          <p className="mb-4 text-sm text-slate-600">
            Sistema i campi incerti e approva: l'avviso si chiude da solo e la voce entra nella memoria del progetto.
          </p>
          <CartaProposta p={proposta} correggiSubito onDecisa={() => setCorreggi(false)} />
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
      <div className="flex items-center gap-1.5 px-5 pt-3 text-[11px] text-slate-400">
        <Radio size={12} className={connesso ? 'text-emerald-500' : ''} />
        {connesso ? 'In ascolto: gli avvisi arrivano da soli' : 'Connessione agli avvisi in corso…'}
      </div>
      {aperti.length === 0
        ? <Vuoto icona={CircleCheck} titolo="Tutto chiaro" testo="Il Brain non ha nulla da segnalarti in questo momento." />
        : (
          <ul className="space-y-3 p-5 pt-3">
            <AnimatePresence initial={false}>{aperti.map((a) => <CartaAvviso key={a.id} a={a} />)}</AnimatePresence>
          </ul>
        )}
    </>
  )
}
