import { BrainCircuit, Crown } from 'lucide-react'
import { motion } from 'motion/react'
import { Avatar, Badge, ChipArea } from '../componenti/ui'
import type { Persona } from '../tipi'

/** Ingresso della demo: chi sei? L'identità decide cosa il Brain ti mostra. */
export function SceltaPersona({ persone, managerId, membri, onScegli }: {
  persone: Persona[]; managerId?: string; membri?: string[]; onScegli: (id: string) => void
}) {
  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--color-indigo-100),_transparent_60%)] px-4 py-12">
      <div className="mx-auto max-w-5xl">
        <div className="text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-xl shadow-indigo-500/30">
            <BrainCircuit size={28} />
          </span>
          <h1 className="mt-5 text-3xl font-semibold tracking-tight">Company Brain</h1>
          <p className="mx-auto mt-2 max-w-xl text-slate-600">
            Il membro del team che legge le riunioni, tiene la memoria del progetto e ti dice cosa richiede la tua attenzione.
            Chiede sempre prima di agire.
          </p>
          <p className="mt-8 text-sm font-medium text-slate-500">Chi sei? Ognuno vede solo ciò che rientra nelle sue competenze.</p>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {persone.map((p, i) => {
            const manager = p.id === managerId
            const fuori = membri && !membri.includes(p.id)
            return (
              <motion.button
                key={p.id}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                onClick={() => onScegli(p.id)}
                className="group flex flex-col items-start rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-lg"
              >
                <div className="flex w-full items-center gap-3">
                  <Avatar persona={p} size={40} />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{p.nome}</p>
                    <p className="truncate text-xs text-slate-500">{p.ruolo}</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1">
                  {manager && <Badge tono="viola" icona={Crown}>Manager</Badge>}
                  {fuori && <Badge tono="grigio">Fuori progetto</Badge>}
                  {p.competenze.filter((a) => a !== 'generale').map((a) => <ChipArea key={a} area={a} />)}
                </div>
              </motion.button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
