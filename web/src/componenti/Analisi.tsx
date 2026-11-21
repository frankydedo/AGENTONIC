import clsx from 'clsx'
import {
  ArrowRight, Check, CircleAlert, RotateCcw, UploadCloud,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { api } from '../api'
import { useApp } from '../contesto'
import { useDati } from '../dati'
import { descriviPasso, durata, riassuntoOutput } from '../lib'
import type { EsitoCaricamento, PassoRegistro } from '../tipi'
import { Badge, Bottone, MarchioBrain } from './ui'

/** I passi fissi del workflow (solution.md §4): si mostrano mentre Agentonic lavora. */
const PREVISTI = [
  ['Lettura', 'Divide la riunione in interventi; se è lunga, in parti «x/X»'],
  ['Estrazione', 'Task, assegnatari, scadenze, decisioni e fatti'],
  ['Chi è chi', 'Abbina i nomi detti alle persone del progetto; se non è sicuro, lo segnala'],
  ['Lacune', 'Persone e contesti che non conosce'],
  ['Incongruenze', 'Confronto con le riunioni precedenti'],
  ['Proposte', 'Cosa cambia nella lista del progetto: decidi tu'],
] as const

type Stato =
  | { fase: 'scelta' }
  | { fase: 'in_corso'; file: string; dal: number }
  | { fase: 'fatto'; file: string; esito: EsitoCaricamento; passi: PassoRegistro[] }
  | { fase: 'errore'; file: string; messaggio: string }

/**
 * Carica la minuta di una riunione e fa vedere Agentonic che lavora: i passi previsti mentre
 * aspetta, poi la traccia vera dal registro (cosa ha letto, cosa ha prodotto, con quale modello).
 */
export function PannelloAnalisi({ onChiudi }: { onChiudi?: () => void }) {
  const { progetto, persone } = useApp()
  const { ricarica, passiLive, documenti } = useDati()
  const vai = useNavigate()
  const input = useRef<HTMLInputElement>(null)
  const [stato, setStato] = useState<Stato>({ fase: 'scelta' })
  const [sopra, setSopra] = useState(false)

  const carica = async (f: File) => {
    const dal = Date.now()
    setStato({ fase: 'in_corso', file: f.name, dal })
    try {
      const [esito] = await Promise.all([
        api.caricaRiunione(progetto.id, f),
        new Promise((r) => setTimeout(r, 600)), // evita lo sfarfallio se il backend risponde subito
      ])
      const registro = await api.registro(progetto.id).catch(() => [] as PassoRegistro[])
      const delDocumento = (p: PassoRegistro) => (p.documento_id ?? p.input.documento_id) === esito.documento_id
      const passi = registro.filter((p) => p.attore === 'brain' && delDocumento(p))
      setStato({ fase: 'fatto', file: f.name, esito, passi })
      ricarica()
    } catch (e) {
      setStato({ fase: 'errore', file: f.name, messaggio: (e as Error).message })
    } finally {
      if (input.current) input.current.value = ''
    }
  }

  const nome = (id: string) => persone[id]?.nome ?? id
  const titolo = (id: string) => documenti.find((d) => d.id === id)?.titolo ?? null

  if (stato.fase === 'scelta') {
    return (
      <label
        onDragOver={(e) => { e.preventDefault(); setSopra(true) }}
        onDragLeave={() => setSopra(false)}
        onDrop={(e) => { e.preventDefault(); setSopra(false); const f = e.dataTransfer.files[0]; if (f) carica(f) }}
        className={clsx(
          'flex cursor-pointer flex-col items-center justify-center rounded-[18px] border-2 border-dashed px-6 py-10 text-center transition-colors',
          sopra ? 'border-accento bg-accento-tenue' : 'border-separatore-forte bg-riempimento/50 hover:border-accento hover:bg-accento-tenue/50',
        )}
      >
        <input ref={input} type="file" accept=".md,.txt,.json" className="hidden" onChange={(e) => e.target.files?.[0] && carica(e.target.files[0])} />
        <span className="grid h-12 w-12 place-items-center rounded-full bg-accento-tenue text-accento-testo"><UploadCloud size={24} strokeWidth={1.9} /></span>
        <p className="mt-3 text-[17px] font-semibold">Trascina qui la minuta di una riunione</p>
        <p className="mt-1 text-sm text-testo-2">oppure <span className="font-medium text-accento-testo">sfoglia i file</span>. Minuta .md o .txt, oppure trascrizione .json (ElevenLabs), per il progetto {progetto.nome}.</p>
      </label>
    )
  }

  const liveDopo = stato.fase === 'in_corso' ? passiLive.filter((p) => Date.parse(p.quando) >= stato.dal - 2000) : []

  return (
    <div>
      <div className="flex items-center gap-3">
        {stato.fase === 'errore'
          ? <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-rosso text-white"><CircleAlert size={20} /></span>
          : <MarchioBrain size={40} parla={stato.fase === 'in_corso'} />}
        <div className="min-w-0">
          <p className="text-[17px] font-semibold">
            {stato.fase === 'in_corso' ? 'Agentonic sta leggendo la riunione…' : stato.fase === 'errore' ? 'Agentonic non ha potuto leggere il file' : 'Analisi completata'}
          </p>
          <p className="cifre truncate text-sm text-testo-2">{stato.file}</p>
        </div>
      </div>

      {stato.fase === 'errore' && (
        <div className="mt-4 rounded-2xl bg-rosso-tenue p-4 text-sm text-rosso-testo">
          <p className="font-semibold">{stato.messaggio}</p>
          <p className="mt-1">Nessuna proposta è stata creata: il documento è stato rifiutato prima di arrivare al modello.</p>
        </div>
      )}

      {stato.fase === 'in_corso' && (
        <ol className="mt-5 overflow-hidden rounded-2xl bg-riempimento/60">
          {PREVISTI.map(([t, d], i) => {
            const fatto = liveDopo[i]
            return (
              <li key={t} className="flex gap-3 border-b border-separatore px-3.5 py-2.5 last:border-0">
                <span className={clsx('cifre grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold',
                  fatto ? 'bg-verde text-white' : i === liveDopo.length ? 'animate-pulse bg-accento text-white' : 'bg-riempimento-2 text-testo-2')}>
                  {fatto ? <Check size={13} strokeWidth={3} /> : i + 1}
                </span>
                <div>
                  <p className={clsx('text-sm font-semibold', !fatto && 'text-testo-2')}>{t}</p>
                  <p className="text-xs text-testo-2">{fatto ? riassuntoOutput(fatto.output).join(', ') || d : d}</p>
                </div>
              </li>
            )
          })}
        </ol>
      )}

      {stato.fase === 'fatto' && (
        <>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-accento-tenue p-4"><p className="cifre text-[34px] leading-none font-bold text-accento-testo">{stato.esito.proposte}</p><p className="mt-1.5 text-[13px] text-testo-2">proposte da decidere</p></div>
            <div className="rounded-2xl bg-arancio-tenue p-4"><p className="cifre text-[34px] leading-none font-bold text-arancio-testo">{stato.esito.avvisi}</p><p className="mt-1.5 text-[13px] text-testo-2">avvisi (punti oscuri, incongruenze…)</p></div>
          </div>
          <p className="mt-5 mb-2 text-[13px] font-semibold text-testo-2">Cosa ha fatto, passo per passo</p>
          {stato.passi.length === 0 ? (
            <p className="text-sm text-testo-2">Il backend non ha ancora registrato i passi di questo documento.</p>
          ) : (
            <ol className="space-y-2">
              <AnimatePresence>
                {stato.passi.map((p, i) => (
                  <motion.li key={`${p.step}-${i}`} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.12 }}
                    className="flex gap-3 rounded-2xl bg-riempimento/60 p-3.5">
                    {p.esito === 'errore' ? <CircleAlert size={18} className="mt-0.5 shrink-0 text-rosso-testo" />
                      : p.esito === 'scartato' ? <CircleAlert size={18} className="mt-0.5 shrink-0 text-arancio-testo" />
                        : <span className="mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-verde text-white"><Check size={12} strokeWidth={3} /></span>}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{descriviPasso(p, nome, titolo)}</p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {riassuntoOutput(p.output).map((r) => <Badge key={r}>{r}</Badge>)}
                        {p.modello && <Badge tono="viola">{p.provider === 'locale' ? 'modello locale' : p.provider === 'cloud' ? 'modello cloud' : 'modello finto'}: {p.modello}</Badge>}
                        {durata(p.durata_ms) && <Badge tono="blu">{durata(p.durata_ms)}</Badge>}
                      </div>
                      {p.motivo && <p className="mt-1 text-xs text-testo-2">{p.motivo}</p>}
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ol>
          )}
        </>
      )}

      {stato.fase !== 'in_corso' && (
        <div className="mt-5 flex flex-wrap gap-2">
          {stato.fase === 'fatto' && (
            <Bottone variante="primario" icona={ArrowRight} onClick={() => { onChiudi?.(); vai(`/documenti/${stato.esito.documento_id}`) }}>
              Rivedi le proposte
            </Bottone>
          )}
          <Bottone icona={RotateCcw} onClick={() => setStato({ fase: 'scelta' })}>Carica un altro file</Bottone>
        </div>
      )}
    </div>
  )
}
