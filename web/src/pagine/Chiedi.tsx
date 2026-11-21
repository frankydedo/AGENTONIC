import clsx from 'clsx'
import { CornerDownLeft, EyeOff, ShieldCheck } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { api } from '../api'
import { Avatar, Card, ChipArea, Citazioni, MarchioBrain } from '../componenti/ui'
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
      <Card className="flex h-[calc(100vh-9rem)] min-h-[480px] flex-col overflow-hidden">
        <div className="flex-1 space-y-7 overflow-y-auto p-5 sm:p-8">
          {storia.length === 0 && (
            <div className="max-w-xl pt-6">
              <MarchioBrain size={40} />
              <h1 className="titolo-tavola mt-5 text-[2rem] sm:text-[2.4rem]">Cosa vuoi sapere sul progetto?</h1>
              <p className="mt-3 text-grafite">Rispondo solo con ciò che il manager ha approvato e che rientra nelle tue competenze. Ogni risposta ha la sua fonte.</p>
              <ul className="mt-7 divide-y divide-linea border-y border-linea">
                {SUGGERIMENTI.map((s) => (
                  <li key={s}>
                    <button onClick={() => invia(s)}
                      className="group flex w-full items-center justify-between py-2.5 text-left text-[15px] font-medium transition-colors hover:text-inchiostro-2">
                      {s}
                      <CornerDownLeft size={15} className="text-linea-forte transition-colors group-hover:text-inchiostro" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <AnimatePresence initial={false}>
            {storia.map((x, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                <div className="flex justify-end gap-2">
                  <p className="max-w-[80%] rounded-[6px] rounded-br-[2px] bg-inchiostro px-4 py-2.5 text-[15px] text-foglio">{x.domanda}</p>
                  <Avatar persona={io} size={30} />
                </div>
                <div className="flex gap-2">
                  <MarchioBrain size={30} parla={!x.risposta && !x.errore} />
                  <div className="max-w-[80%]">
                    {x.risposta ? (
                      <div className={clsx('rounded-[6px] rounded-tl-[2px] px-4 py-3',
                        x.risposta.esito === 'risposta' ? 'border border-linea bg-velina' : 'border border-dashed border-linea-forte text-grafite')}>
                        <p className="text-[15.5px] leading-relaxed">{x.risposta.testo}</p>
                        {x.risposta.esito === 'risposta' ? (
                          <div className="mt-3 border-t border-linea pt-2.5">
                            <p className="mb-1.5 text-xs font-semibold text-grafite">Fonti</p>
                            <Citazioni citazioni={x.risposta.citazioni} />
                          </div>
                        ) : (
                          <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-traccia"><EyeOff size={12} /> Nessuna fonte che puoi vedere</p>
                        )}
                      </div>
                    ) : x.errore ? (
                      <p className="rounded-[6px] border border-allarme/30 bg-allarme-chiaro px-4 py-3 text-sm text-allarme">{x.errore}</p>
                    ) : (
                      <div className="flex items-center gap-1.5 rounded-[6px] border border-linea bg-velina px-4 py-3.5" aria-label="Il Brain sta cercando tra le fonti">
                        {[0, 1, 2].map((k) => <motion.span key={k} className="h-1.5 w-1.5 rounded-full bg-grafite"
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
        <form onSubmit={(e) => { e.preventDefault(); invia(testo) }} className="border-t border-linea bg-velina/60 p-4">
          <div className="flex gap-2 rounded-[5px] border-[1.5px] border-inchiostro bg-foglio p-1.5 focus-within:ring-3 focus-within:ring-segnale/45">
            <input value={testo} onChange={(e) => setTesto(e.target.value)} placeholder="Fai una domanda sul progetto…" autoFocus
              className="min-w-0 flex-1 bg-transparent px-2.5 text-[15px] focus:outline-none" />
            <button disabled={attesa || !testo.trim()} className="inline-flex items-center gap-1.5 rounded-[3px] bg-inchiostro px-3.5 py-2 text-sm font-semibold text-foglio hover:bg-inchiostro-2 disabled:opacity-40">
              <CornerDownLeft size={15} /> Chiedi
            </button>
          </div>
        </form>
      </Card>

      <div className="space-y-4">
        <Card className="p-5">
          <p className="text-sm font-bold">Stai chiedendo come</p>
          <div className="mt-3 flex items-center gap-3">
            <Avatar persona={io} size={40} />
            <div><p className="font-semibold">{io.nome}</p><p className="text-sm text-grafite">{io.ruolo}</p></div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1">{io.competenze.map((a) => <ChipArea key={a} area={a} />)}</div>
        </Card>
        <Card className="p-5 text-sm text-grafite">
          <p className="flex items-center gap-2 font-bold text-inchiostro"><ShieldCheck size={16} className="text-timbro" /> Come risponde il Brain</p>
          {/* è davvero una sequenza: l'ordine in cui il codice tratta la domanda */}
          <ol className="mt-3 space-y-2.5">
            {[
              <>Filtra per le tue competenze <b className="text-inchiostro">prima</b> di leggere: ciò che non puoi vedere non arriva al modello.</>,
              <>Cerca <b className="text-inchiostro">solo</b> tra task e fatti approvati dal manager.</>,
              <>Ogni risposta cita la riunione: clicca la fonte per aprirla al punto esatto.</>,
              <>Se non sa, o se l'informazione non è per te, lo dice.</>,
            ].map((t, i) => (
              <li key={i} className="flex gap-3">
                <span className="condensato grid h-5 w-5 shrink-0 place-items-center rounded-[3px] border border-inchiostro text-[11px] font-bold text-inchiostro">{i + 1}</span>
                <span>{t}</span>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </div>
  )
}
