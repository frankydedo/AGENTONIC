import clsx from 'clsx'
import { ArrowUp, EyeOff, ShieldCheck } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { api } from '../api'
import { Avatar, Card, ChipArea, Citazioni, MarchioBrain } from '../componenti/ui'
import { useApp } from '../contesto'
import { inInglese } from '../lib'
import type { Risposta } from '../tipi'

interface Scambio { domanda: string; risposta?: Risposta; errore?: string }

// Restano in italiano: i dati dell'azienda sono in italiano e le risposte registrate del modello
// finto sono legate al testo esatto della domanda.
const SUGGERIMENTI = ['Quanto budget resta?', 'Chi prepara la lista dei tag?', 'Quando è il collaudo?', 'Chi è il fornitore degli inverter?']

/** Controlli 3, 4, 5: sa chi chiede (identità dalla sessione), cita, ammette di non sapere. */
export function Chiedi() {
  const { progetto, io } = useApp()
  const [testo, setTesto] = useState('')
  const [storia, setStoria] = useState<Scambio[]>([])
  const [attesa, setAttesa] = useState(false)
  const fine = useRef<HTMLDivElement>(null)
  const { state } = useLocation()
  const vai = useNavigate()

  // Effect sempre con il corpo tra graffe: scrollIntoView() nei browser recenti restituisce una
  // Promise, e React tratterebbe qualunque valore restituito come funzione di cleanup.
  useEffect(() => { fine.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [storia])

  const invia = async (domanda: string) => {
    if (!domanda.trim() || attesa) return
    setTesto('')
    setAttesa(true)
    setStoria((s) => [...s, { domanda }])
    try {
      const risposta = await api.domanda(progetto.id, domanda)
      setStoria((s) => s.map((x, i) => (i === s.length - 1 ? { ...x, risposta } : x)))
    } catch (e) {
      setStoria((s) => s.map((x, i) => (i === s.length - 1 ? { ...x, errore: (e as Error).message } : x)))
    } finally {
      setAttesa(false)
    }
  }

  // domanda arrivata dalla Panoramica
  const daPanoramica = (state as { domanda?: string } | null)?.domanda
  const giaInviata = useRef<string | null>(null) // StrictMode esegue l'effect due volte
  useEffect(() => {
    if (!daPanoramica || giaInviata.current === daPanoramica) return
    giaInviata.current = daPanoramica
    vai('/chiedi', { replace: true, state: null })
    invia(daPanoramica)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daPanoramica])

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <Card className="flex h-[calc(100vh-8.5rem)] min-h-[520px] flex-col overflow-hidden rounded-[24px]">
        <div className="flex-1 space-y-6 overflow-y-auto px-5 pt-8 pb-4 sm:px-9">
          {storia.length === 0 && (
            <div className="mx-auto flex max-w-lg flex-col items-center pt-6 text-center">
              <MarchioBrain size={48} parla />
              <h1 className="titolo-grande mt-5 text-[28px] sm:text-[32px]">What do you want to know about the project?</h1>
              <p className="mt-2 text-[15px] text-testo-2">I answer only with what the manager has approved and what falls within your areas. Every answer has its source.</p>
            </div>
          )}
          <AnimatePresence initial={false}>
            {storia.map((x, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 30 }} className="space-y-3">
                <div className="flex justify-end">
                  <p className="max-w-[75%] rounded-[20px] rounded-br-[6px] bg-accento px-4 py-2.5 text-[16px] leading-snug text-su-accento">{x.domanda}</p>
                </div>
                <div className="flex items-end gap-2.5">
                  <MarchioBrain size={28} parla={!x.risposta && !x.errore} className={clsx(x.risposta && x.risposta.esito !== 'risposta' && 'opacity-50')} />
                  <div className="max-w-[78%]">
                    {x.risposta ? (
                      <div className={clsx('rounded-[20px] rounded-bl-[6px] px-4 py-3',
                        x.risposta.esito === 'risposta' ? 'bg-riempimento' : 'bg-superficie shadow-[inset_0_0_0_1.5px_var(--separatore-forte)]')}>
                        <p className="text-[16px] leading-relaxed">{x.risposta.testo}</p>
                        {x.risposta.esito === 'risposta' ? (
                          <div className="mt-3 border-t border-separatore pt-2.5">
                            <p className="mb-1.5 text-xs font-semibold text-testo-2">Sources</p>
                            <Citazioni citazioni={x.risposta.citazioni} className="[&_a]:bg-superficie [&_a]:shadow-card" />
                          </div>
                        ) : (
                          <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-testo-2"><EyeOff size={13} /> No source you can see</p>
                        )}
                      </div>
                    ) : x.errore ? (
                      <p className="rounded-[20px] rounded-bl-[6px] bg-rosso-tenue px-4 py-3 text-sm text-rosso-testo">{x.errore}</p>
                    ) : (
                      <div className="flex items-center gap-1.5 rounded-[20px] rounded-bl-[6px] bg-riempimento px-4 py-4" aria-label="Agentonic is searching the sources">
                        {[0, 1, 2].map((k) => <motion.span key={k} className="h-2 w-2 rounded-full bg-testo-3"
                          animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: k * 0.15 }} />)}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          <div ref={fine} />
        </div>
        <form onSubmit={(e) => { e.preventDefault(); invia(testo) }} className="px-4 pt-2 pb-4 sm:px-6 sm:pb-5">
          <div className="flex h-[52px] items-center gap-2 rounded-full bg-riempimento pr-2 pl-5 transition focus-within:bg-superficie focus-within:ring-3 focus-within:ring-accento/30">
            <input value={testo} onChange={(e) => setTesto(e.target.value)} placeholder="Ask a question about the project…" autoFocus
              aria-label="Question about the project" className="min-w-0 flex-1 bg-transparent text-[16px] placeholder:text-testo-3 focus:outline-none" />
            <button disabled={attesa || !testo.trim()} aria-label="Ask"
              className="grid h-9 w-9 place-items-center rounded-full bg-accento text-su-accento transition hover:bg-accento-premuto disabled:opacity-30">
              <ArrowUp size={18} strokeWidth={2.6} />
            </button>
          </div>
          {storia.length === 0 && (
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {SUGGERIMENTI.map((s) => (
                <button key={s} type="button" onClick={() => invia(s)}
                  className="rounded-full bg-superficie px-3.5 py-1.5 text-[13px] shadow-[inset_0_0_0_1px_var(--separatore-forte)] transition hover:bg-riempimento">
                  {s}
                </button>
              ))}
            </div>
          )}
        </form>
      </Card>

      <div className="space-y-4">
        <Card className="p-5">
          <p className="text-[13px] font-semibold text-testo-2">You are asking as</p>
          <div className="mt-3 flex items-center gap-3">
            <Avatar persona={io} size={44} />
            <div><p className="text-[16px] font-semibold">{io.nome}</p><p className="text-[13px] text-testo-2 first-letter:uppercase">{inInglese(io.ruolo)}</p></div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1">{io.competenze.map((a) => <ChipArea key={a} area={a} />)}</div>
        </Card>
        <Card className="p-5">
          <p className="flex items-center gap-2 text-[17px] font-semibold"><ShieldCheck size={18} className="text-verde-testo" /> How Agentonic answers</p>
          {/* è davvero una sequenza: l'ordine in cui il codice tratta la domanda */}
          <ol className="mt-3 space-y-3 text-sm leading-snug text-testo-2">
            {[
              <>It filters by your areas <b className="font-semibold text-testo">before</b> reading: what you cannot see never reaches the model.</>,
              <>It searches <b className="font-semibold text-testo">only</b> the tasks and facts approved by the manager.</>,
              <>Every answer cites the meeting: tap the source to open it at the exact point.</>,
              <>If it does not know, or the information is not for you, it says so.</>,
            ].map((t, i) => (
              <li key={i} className="flex gap-3">
                <span className="cifre grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-accento-tenue text-xs font-bold text-accento-testo">{i + 1}</span>
                <span>{t}</span>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </div>
  )
}
