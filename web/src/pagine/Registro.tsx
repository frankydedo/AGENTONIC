import clsx from 'clsx'
import { ChevronRight, CircleAlert, ScrollText, UserCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api } from '../api'
import { Avatar, Badge, Card, MarchioBrain, Scheletro, Segmentato, TitoloPagina, Vuoto } from '../componenti/ui'
import { useApp } from '../contesto'
import { useDati } from '../dati'
import { dataBreve, descriviPasso, durata, oraDi, riassuntoOutput } from '../lib'
import type { PassoRegistro } from '../tipi'

type Filtro = 'tutti' | 'brain' | 'persone'

/**
 * Il diario di bordo del progetto: ogni passo del Brain e ogni decisione di una persona.
 * Serve a verificare cosa ha fatto l'AI e chi ha deciso cosa (trasparenza). In chiaro, per tutti;
 * i dati grezzi restano nei «dettagli tecnici».
 */
export function Registro() {
  const { progetto, persone, sonoManager } = useApp()
  const { proposte, documenti } = useDati()
  const [passi, setPassi] = useState<PassoRegistro[] | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<Filtro>('tutti')
  const [documento, setDocumento] = useState('')

  useEffect(() => {
    if (!sonoManager) return
    api.registro(progetto.id).then(setPassi).catch((e) => setErrore(e.message))
  }, [progetto.id, sonoManager, proposte])

  if (!sonoManager) return <Card><Vuoto icona={UserCheck} titolo="Manager only" testo="The full log of steps is visible to the project manager." /></Card>

  const nome = (id: string) => persone[id]?.nome ?? id
  const titolo = (id: string) => documenti.find((d) => d.id === id)?.titolo ?? null
  const docDi = (p: PassoRegistro) => p.documento_id ?? (typeof p.input.documento_id === 'string' ? p.input.documento_id : '')
  const visibili = (passi ?? [])
    .filter((p) => filtro === 'tutti' || (filtro === 'brain') === (p.attore === 'brain'))
    .filter((p) => !documento || docDi(p) === documento)
    .sort((a, b) => b.quando.localeCompare(a.quando))
  const docsNelRegistro = [...new Set((passi ?? []).map(docDi).filter(Boolean))]

  return (
    <>
      <TitoloPagina titolo="Log" sottotitolo="The project's logbook: what Agentonic did and what people decided, in order." />

      <Card className="mb-6 flex max-w-4xl gap-3 p-4 text-sm leading-relaxed text-testo-2">
        <ScrollText size={18} className="mt-0.5 shrink-0 text-testo" />
        <p>
          Every time Agentonic reads a document, extracts information or compares meetings, and every time someone
          approves, rejects or asks a question, a line is kept here. So you can always check <b className="text-testo">where</b> a proposal comes from,
          <b className="text-testo"> which model</b> produced it and <b className="text-testo">who approved it</b>. Nothing enters the memory without leaving a trace.
        </p>
      </Card>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmentato etichetta="Who" valore={filtro} onCambia={setFiltro}
          opzioni={[['tutti', 'All'], ['brain', 'Agentonic only'], ['persone', 'People only']] as const} />
        {docsNelRegistro.length > 0 && (
          <select value={documento} onChange={(e) => setDocumento(e.target.value)} aria-label="Filter by document" className="h-9 rounded-full bg-riempimento-2/80 pr-8 pl-3.5 text-sm font-medium text-testo focus:ring-3 focus:ring-accento/30 focus:outline-none">
            <option value="">All documents</option>
            {docsNelRegistro.map((d) => <option key={d} value={d}>{titolo(d) ?? d}</option>)}
          </select>
        )}
      </div>

      <Card>
        {errore ? <Vuoto icona={UserCheck} titolo="Log not available" testo={errore} /> : !passi ? <Scheletro /> : visibili.length === 0 ? (
          <Vuoto icona={ScrollText} titolo="No steps to show" testo="Upload a meeting: every step Agentonic takes will appear here." />
        ) : (
          <ol className="p-6">
            {visibili.map((p, i) => {
              const umano = p.attore !== 'brain'
              const problema = p.esito && p.esito !== 'ok'
              return (
                <li key={p.id ?? i} className="relative flex gap-4 pb-6 last:pb-0">
                  {i < visibili.length - 1 && <span className="absolute top-10 bottom-0 left-[17px] w-px bg-testo-3" />}
                  {umano ? <Avatar persona={persone[p.attore]} nome={p.attore} size={36} /> : (
                    <MarchioBrain size={36} />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-3">
                      <p className="font-semibold">{descriviPasso(p, nome, titolo)}</p>
                      <span className="cifre text-sm text-testo-2">{dataBreve(p.quando)}, {oraDi(p.quando)}</span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {problema && <Badge tono={p.esito === 'errore' ? 'rosso' : 'giallo'} icona={CircleAlert}>{p.esito === 'errore' ? 'Error' : 'Discarded'}</Badge>}
                      {riassuntoOutput(p.output).map((r) => <Badge key={r}>{r}</Badge>)}
                      {p.modello && <Badge tono="viola">{p.provider === 'locale' ? 'local model' : p.provider === 'cloud' ? 'cloud model' : 'mock model'}: {p.modello}</Badge>}
                      {durata(p.durata_ms) && <Badge tono="blu">{durata(p.durata_ms)}</Badge>}
                      {(p.tentativi ?? 1) > 1 && <Badge tono="giallo">{p.tentativi} attempts</Badge>}
                    </div>
                    {p.motivo && <p className={clsx('mt-1.5 text-sm', problema ? 'text-arancio-testo' : 'text-testo-2')}>{p.motivo}</p>}
                    <details className="group mt-2">
                      <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-testo-2 hover:text-testo">
                        <ChevronRight size={12} className="transition group-open:rotate-90" /> Technical details
                      </summary>
                      <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                        <pre className="overflow-x-auto rounded-lg border border-separatore bg-riempimento p-2.5 text-testo-2"><span className="font-sans font-semibold text-testo">Input </span>{JSON.stringify(p.input, null, 1)}</pre>
                        <pre className="overflow-x-auto rounded-lg border border-separatore bg-riempimento p-2.5 text-testo-2"><span className="font-sans font-semibold text-testo">Output </span>{JSON.stringify(p.output, null, 1)}</pre>
                      </div>
                      {p.versione_prompt && <p className="mt-1 text-xs text-testo-3">Prompt version: {p.versione_prompt}</p>}
                    </details>
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
