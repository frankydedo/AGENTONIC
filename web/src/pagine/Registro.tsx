import { BrainCircuit, UserCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api } from '../api'
import { Avatar, Badge, Card, Scheletro, TitoloPagina, Vuoto } from '../componenti/ui'
import { useApp } from '../contesto'
import { useDati } from '../dati'
import { oraDi } from '../lib'
import type { PassoRegistro } from '../tipi'

/** Trasparenza: ogni passo del Brain e ogni decisione umana, in ordine. */
export function Registro() {
  const { progetto, persone, sonoManager } = useApp()
  const { proposte } = useDati()
  const [passi, setPassi] = useState<PassoRegistro[] | null>(null)
  const [errore, setErrore] = useState<string | null>(null)

  useEffect(() => {
    if (!sonoManager) return
    api.registro(progetto.id).then(setPassi).catch((e) => setErrore(e.message))
  }, [progetto.id, sonoManager, proposte])

  if (!sonoManager) return <Card><Vuoto icona={UserCheck} titolo="Solo per il manager" testo="Il registro completo dei passi è visibile al manager del progetto." /></Card>

  return (
    <>
      <TitoloPagina titolo="Registro" sottotitolo="Cosa ha letto il Brain, quale passo ha eseguito, con quale risultato, e chi ha deciso." />
      <Card>
        {errore ? <Vuoto icona={UserCheck} titolo="Registro non disponibile" testo={errore} /> : !passi ? <Scheletro /> : (
          <ol className="relative space-y-0 p-6">
            {passi.map((p, i) => {
              const umano = p.attore !== 'brain'
              return (
                <li key={p.id} className="relative flex gap-4 pb-6 last:pb-0">
                  {i < passi.length - 1 && <span className="absolute top-9 bottom-0 left-[17px] w-px bg-slate-200" />}
                  {umano ? <Avatar persona={persone[p.attore]} nome={p.attore} size={36} /> : (
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white"><BrainCircuit size={17} /></span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{umano ? (persone[p.attore]?.nome ?? p.attore) : 'Brain'}</span>
                      <Badge tono={p.tipo === 'decisione' ? 'verde' : 'blu'}>{p.step}</Badge>
                      <span className="font-mono text-xs text-slate-400">{oraDi(p.quando)}</span>
                    </div>
                    <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                      <pre className="overflow-x-auto rounded-lg bg-slate-50 p-2.5 text-slate-600"><span className="text-slate-400">input </span>{JSON.stringify(p.input, null, 1)}</pre>
                      <pre className="overflow-x-auto rounded-lg bg-slate-50 p-2.5 text-slate-600"><span className="text-slate-400">output </span>{JSON.stringify(p.output, null, 1)}</pre>
                    </div>
                    {p.motivo && <p className="mt-1 text-xs text-slate-500">{p.motivo}</p>}
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </Card>
    </>
  )
}
