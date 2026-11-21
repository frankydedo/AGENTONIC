import clsx from 'clsx'
import { motion } from 'motion/react'
import { Avatar, ChipArea, MarchioBrain } from '../componenti/ui'
import type { Persona } from '../tipi'

/**
 * Ingresso della demo: si timbra il cartellino. L'identità decide cosa il Brain ti mostra,
 * e arriva da qui, mai dal testo di una domanda.
 */
export function SceltaPersona({ persone, managerId, membri, onScegli }: {
  persone: Persona[]; managerId?: string; membri?: string[]; onScegli: (id: string) => void
}) {
  return (
    <div className="quadrettatura min-h-screen px-4 py-10 sm:px-8 lg:py-16">
      <div className="mx-auto max-w-6xl">
        <header className="grid gap-8 lg:grid-cols-[1fr_minmax(0,22rem)] lg:items-end">
          <div>
            <MarchioBrain size={44} parla />
            <h1 className="titolo-tavola mt-6 text-[3.2rem] sm:text-[5.2rem]">Company<br />Brain</h1>
          </div>
          <p className="max-w-sm text-[17px] leading-relaxed text-grafite lg:pb-3">
            Il membro del team che legge le riunioni, tiene la memoria del progetto e ti dice cosa richiede
            la tua attenzione. <span className="font-semibold text-inchiostro">Chiede sempre prima di agire.</span>
          </p>
        </header>

        <div className="mt-12 flex flex-wrap items-baseline justify-between gap-2 border-t-2 border-inchiostro pt-4">
          <p className="text-lg font-bold [font-stretch:110%]">Chi sei? Timbra il tuo cartellino.</p>
          <p className="text-sm text-grafite">Ognuno vede solo ciò che rientra nelle sue competenze.</p>
        </div>

        <ul className="mt-6 grid gap-x-4 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
          {persone.map((p, i) => (
            <motion.li key={p.id} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 + i * 0.035, type: 'spring', stiffness: 260, damping: 26 }}>
              <Cartellino p={p} manager={p.id === managerId} fuori={!!membri && !membri.includes(p.id)} onScegli={onScegli} />
            </motion.li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function Cartellino({ p, manager, fuori, onScegli }: { p: Persona; manager: boolean; fuori: boolean; onScegli: (id: string) => void }) {
  return (
    <button
      onClick={() => onScegli(p.id)}
      className={clsx(
        'group relative flex h-full w-full flex-col rounded-[5px] border border-linea-forte bg-foglio text-left transition',
        'hover:-translate-y-1 hover:border-inchiostro hover:shadow-[5px_5px_0_var(--color-inchiostro)]',
        fuori && 'border-dashed',
      )}
    >
      {/* la fessura del cartellino */}
      <span aria-hidden className="absolute top-2.5 left-1/2 h-2 w-12 -translate-x-1/2 rounded-full border border-linea-forte bg-carta" />
      <span className="condensato mt-7 flex items-center justify-between border-y border-linea px-4 py-1 text-[11.5px] text-grafite">
        <span>Cartellino {p.id.replace('p-', 'n. ')}</span>
        {(manager || fuori) && <span className="font-semibold text-inchiostro">{manager ? 'Manager' : 'Fuori progetto'}</span>}
      </span>
      <span className="flex items-center gap-3 px-4 pt-4">
        <Avatar persona={p} size={42} />
        <span className="min-w-0">
          <span className="block truncate text-[16px] leading-tight font-bold">{p.nome}</span>
          <span className="block truncate text-sm text-grafite">{p.ruolo}</span>
        </span>
      </span>
      <span className="flex flex-1 flex-wrap content-start gap-1 px-4 pt-3 pb-4">
        {p.competenze.filter((a) => a !== 'generale').map((a) => <ChipArea key={a} area={a} />)}
      </span>
      <span className="flex items-center justify-between rounded-b-[4px] border-t border-linea px-4 py-2 text-sm font-semibold text-grafite transition-colors group-hover:bg-inchiostro group-hover:text-foglio">
        Timbra l'ingresso
        <span aria-hidden className="h-2 w-2 rounded-full bg-linea-forte transition-colors group-hover:bg-segnale" />
      </span>
    </button>
  )
}
