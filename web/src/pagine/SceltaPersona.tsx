import { motion } from 'motion/react'
import { useState } from 'react'
import { corrisponde } from '../componenti/Selettori'
import { SceltaTema } from '../componenti/Tema'
import { Avatar, MarchioBrain } from '../componenti/ui'
import type { Persona } from '../tipi'

/**
 * Ingresso della demo: chi sei? L'identità decide cosa il Brain ti mostra,
 * e arriva da qui, mai dal testo di una domanda.
 */
export function SceltaPersona({ persone, managerId, membri, onScegli }: {
  persone: Persona[]; managerId?: string; membri?: string[]; onScegli: (id: string) => void
}) {
  const [cerca, setCerca] = useState('')
  return (
    <div className="relative min-h-screen px-4 pt-20 pb-16 sm:px-8 sm:pt-24">
      <div className="absolute top-4 right-4"><SceltaTema piccolo /></div>
      <div className="mx-auto flex max-w-5xl flex-col items-center text-center">
        <MarchioBrain size={72} parla className="shadow-[0_14px_44px_rgba(94,92,230,0.38)]" />
        <h1 className="titolo-grande mt-7 text-[44px] sm:text-[60px]">Company Brain</h1>
        <p className="mt-4 max-w-xl text-[19px] leading-snug text-testo-2 sm:text-[21px]">
          Il membro del team che legge le riunioni, tiene la memoria del progetto e ti dice cosa richiede la tua attenzione.
          Chiede sempre prima di agire.
        </p>

        <h2 className="mt-16 text-[22px] font-semibold tracking-[-0.01em]">Chi sei?</h2>
        <p className="mt-1.5 text-[15px] text-testo-2">Ognuno vede solo ciò che rientra nelle sue competenze.</p>

        {persone.length > 8 && (
          <input value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder={`Cerca tra ${persone.length} persone…`}
            aria-label="Cerca una persona" className="mt-8 w-full max-w-sm rounded-xl bg-riempimento px-4 py-2.5 text-[15px] focus:outline-none" />
        )}
        <ul className="mt-9 grid max-h-[60vh] w-full grid-cols-2 gap-x-3 gap-y-4 overflow-y-auto sm:grid-cols-3 lg:grid-cols-4">
          {persone.filter((p) => corrisponde(`${p.nome} ${p.ruolo}`, cerca)).map((p, i) => {
            const manager = p.id === managerId
            const fuori = !!membri && !membri.includes(p.id)
            return (
              <motion.li key={p.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 + i * 0.04, type: 'spring', stiffness: 260, damping: 26 }}>
                <button onClick={() => onScegli(p.id)}
                  className="group flex w-full flex-col items-center gap-2 rounded-[22px] px-2 py-5 transition hover:bg-superficie hover:shadow-alta focus-visible:bg-superficie">
                  <span className="rounded-full transition group-hover:shadow-[0_0_0_3px_var(--superficie),0_0_0_6px_var(--accento)]">
                    <Avatar persona={p} size={84} />
                  </span>
                  <span className="mt-1 text-[17px] font-semibold">{p.nome}</span>
                  <span className="-mt-1.5 text-[13px] text-testo-2 first-letter:uppercase">{p.ruolo}</span>
                  {manager && <span className="rounded-[7px] bg-viola-tenue px-2 py-0.5 text-xs font-semibold text-viola-testo">Manager</span>}
                  {fuori && <span className="rounded-[7px] bg-riempimento px-2 py-0.5 text-xs font-semibold text-testo-2">Fuori progetto</span>}
                </button>
              </motion.li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
