import clsx from 'clsx'
import { BrainCircuit, EyeOff, Quote, Send, ShieldCheck } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { api } from '../api'
import { Avatar, Card, ChipArea, Citazioni } from '../componenti/ui'
import { useApp } from '../contesto'
import type { Risposta } from '../tipi'

interface Scambio { domanda: string; risposta?: Risposta; errore?: string }

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
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <Card className="flex h-[calc(100vh-10rem)] min-h-[480px] flex-col overflow-hidden">
        <div className="flex-1 space-y-6 overflow-y-auto p-6">
          {storia.length === 0 && (
            <div className="mx-auto max-w-lg pt-10 text-center">
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/30">
                <BrainCircuit size={26} />
              </span>
              <h1 className="mt-4 text-xl font-semibold">Cosa vuoi sapere sul progetto?</h1>
              <p className="mt-2 text-sm text-slate-500">Rispondo solo con ciò che il manager ha approvato e che rientra nelle tue competenze. Ogni risposta ha la sua fonte.</p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {SUGGERIMENTI.map((s) => (
                  <button key={s} onClick={() => invia(s)}
                    className="rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-sm text-slate-600 shadow-sm transition hover:border-indigo-300 hover:text-indigo-700">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          <AnimatePresence initial={false}>
            {storia.map((x, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                <div className="flex justify-end gap-2">
                  <p className="max-w-[80%] rounded-2xl rounded-br-md bg-indigo-600 px-4 py-2.5 text-sm text-white shadow-sm">{x.domanda}</p>
                  <Avatar persona={io} size={30} />
                </div>
                <div className="flex gap-2">
                  <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white"><BrainCircuit size={15} /></span>
                  <div className="max-w-[80%]">
                    {x.risposta ? (
                      <div className={clsx('rounded-2xl rounded-bl-md px-4 py-3 text-sm',
                        x.risposta.esito === 'risposta' ? 'bg-slate-100 text-slate-800' : 'border border-dashed border-slate-300 bg-white text-slate-600')}>
                        <p className="leading-relaxed">{x.risposta.testo}</p>
                        {x.risposta.esito === 'risposta' ? (
                          <>
                            <p className="mt-3 mb-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-slate-500"><Quote size={11} /> Fonti</p>
                            <Citazioni citazioni={x.risposta.citazioni} />
                          </>
                        ) : (
                          <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-slate-400"><EyeOff size={12} /> Nessuna fonte che puoi vedere</p>
                        )}
                      </div>
                    ) : x.errore ? (
                      <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{x.errore}</p>
                    ) : (
                      <div className="flex items-center gap-1.5 rounded-2xl bg-slate-100 px-4 py-3.5">
                        {[0, 1, 2].map((k) => <motion.span key={k} className="h-1.5 w-1.5 rounded-full bg-slate-400"
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
        <form onSubmit={(e) => { e.preventDefault(); invia(testo) }} className="border-t border-slate-100 p-4">
          <div className="flex gap-2 rounded-xl border border-slate-300 bg-white p-1.5 shadow-sm focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20">
            <input value={testo} onChange={(e) => setTesto(e.target.value)} placeholder="Fai una domanda sul progetto…" autoFocus
              className="min-w-0 flex-1 bg-transparent px-2.5 text-sm focus:outline-none" />
            <button disabled={attesa || !testo.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40">
              <Send size={15} /> Chiedi
            </button>
          </div>
        </form>
      </Card>

      <div className="space-y-4">
        <Card className="p-5">
          <p className="text-xs font-medium tracking-wide text-slate-400 uppercase">Stai chiedendo come</p>
          <div className="mt-3 flex items-center gap-3">
            <Avatar persona={io} size={40} />
            <div><p className="font-medium">{io.nome}</p><p className="text-sm text-slate-500">{io.ruolo}</p></div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1">{io.competenze.map((a) => <ChipArea key={a} area={a} />)}</div>
        </Card>
        <Card className="p-5 text-sm text-slate-600">
          <p className="flex items-center gap-2 font-medium text-slate-800"><ShieldCheck size={16} className="text-emerald-600" /> Come risponde il Brain</p>
          <ul className="mt-3 space-y-2">
            <li>• Cerca <b>solo</b> tra task e fatti approvati dal manager.</li>
            <li>• Filtra per le tue competenze <b>prima</b> di leggere: ciò che non puoi vedere non arriva al modello.</li>
            <li>• Ogni risposta cita la riunione: clicca la fonte per aprirla al punto esatto.</li>
            <li>• Se non sa, o se l'informazione non è per te, lo dice.</li>
          </ul>
        </Card>
      </div>
    </div>
  )
}
