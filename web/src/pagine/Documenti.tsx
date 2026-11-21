import clsx from 'clsx'
import { ChevronRight, FileAudio, FileText, FileType, Inbox, LoaderCircle, UploadCloud, Video, type LucideIcon } from 'lucide-react'
import { motion } from 'motion/react'
import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { api } from '../api'
import { Avatar, Badge, Card, Scheletro, TitoloPagina, Vuoto } from '../componenti/ui'
import { useApp } from '../contesto'
import { useDati } from '../dati'
import { dataMedia } from '../lib'
import type { Documento } from '../tipi'

export const FORMATI: Record<Documento['formato'], [string, LucideIcon]> = {
  minuta: ['Minuta', FileText],
  trascrizione: ['Trascrizione', FileText],
  audio: ['Audio', FileAudio],
  video: ['Video', Video],
  pdf: ['PDF', FileType],
}

export function Documenti() {
  const { sonoManager } = useApp()
  const { documenti, pronto } = useDati()
  const ordinati = [...documenti].sort((a, b) => `${b.data}${b.ora_inizio}`.localeCompare(`${a.data}${a.ora_inizio}`))

  return (
    <>
      <TitoloPagina titolo="Documenti"
        sottotitolo="Le riunioni e i documenti letti dal Brain. Ogni proposta, task e risposta rimanda al punto preciso da cui nasce." />
      {sonoManager && <Caricamento />}
      <Card className="mt-6">
        {!pronto ? <Scheletro /> : ordinati.length === 0 ? (
          <Vuoto icona={Inbox} titolo="Ancora nessun documento" testo="Carica la minuta di una riunione per iniziare." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {ordinati.map((d, i) => <RigaDocumento key={d.id} d={d} i={i} />)}
          </ul>
        )}
      </Card>
    </>
  )
}

function RigaDocumento({ d, i }: { d: Documento; i: number }) {
  const { persone, sonoManager } = useApp()
  const { proposte, avvisi } = useDati()
  const [formato, Icona] = FORMATI[d.formato] ?? FORMATI.minuta
  const sue = proposte.filter((p) => p.documento_id === d.id)
  const conta = (s: string) => sue.filter((p) => p.stato === s).length
  const decise = conta('approvata') + conta('rifiutata')
  const aperti = avvisi.filter((a) => a.documento_id === d.id && !a.risolto).length
  const partecipanti = d.partecipanti.map((n) => Object.values(persone).find((p) => p.nome === n) ?? null)

  return (
    <motion.li initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
      <Link to={`/documenti/${d.id}`} className="group flex items-center gap-4 px-5 py-4 transition hover:bg-slate-50">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><Icona size={20} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-slate-900">{d.titolo}</p>
            <Badge>{formato}</Badge>
            <Badge tono={d.tipo === 'riunione' ? 'blu' : 'viola'}>{d.tipo === 'riunione' ? 'Riunione' : 'Integrativo'}</Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {dataMedia(d.data)}{d.ora_inizio && ` · ore ${d.ora_inizio}`} · {d.id}
          </p>
        </div>
        <div className="hidden -space-x-1.5 md:flex">
          {partecipanti.slice(0, 6).map((p, k) => <Avatar key={k} persona={p} nome={d.partecipanti[k]} size={26} />)}
          {partecipanti.length > 6 && <span className="grid h-[26px] w-[26px] place-items-center rounded-full bg-slate-100 text-[10px] font-medium text-slate-600 ring-2 ring-white">+{partecipanti.length - 6}</span>}
        </div>
        {sonoManager && (
          <div className="hidden w-48 sm:block">
            <div className="flex justify-between text-xs text-slate-500">
              <span>{conta('in_attesa') ? <b className="text-amber-600">{conta('in_attesa')} da decidere</b> : 'Tutto deciso'}</span>
              <span>{decise}/{sue.length}</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${sue.length ? (decise / sue.length) * 100 : 0}%` }} />
            </div>
            {aperti > 0 && <p className="mt-1 text-xs text-amber-600">{aperti} avvisi aperti</p>}
          </div>
        )}
        <ChevronRight size={18} className="text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500" />
      </Link>
    </motion.li>
  )
}

/** Il manager trascina qui una minuta (o un documento integrativo): parte l'analisi del Brain. */
function Caricamento() {
  const { progetto } = useApp()
  const { ricarica } = useDati()
  const vai = useNavigate()
  const input = useRef<HTMLInputElement>(null)
  const [sopra, setSopra] = useState(false)
  const [file, setFile] = useState<string | null>(null)

  const carica = async (f: File) => {
    setFile(f.name)
    try {
      const r = await api.caricaRiunione(progetto.id, f)
      toast.success(`Analisi di ${f.name} completata`, { description: `${r.proposte} proposte e ${r.avvisi} avvisi pronti da rivedere.` })
      await ricarica()
      vai(`/documenti/${r.documento_id}`)
    } catch (e) {
      toast.error('Caricamento non riuscito', { description: (e as Error).message })
    } finally {
      setFile(null)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <label
      onDragOver={(e) => { e.preventDefault(); setSopra(true) }}
      onDragLeave={() => setSopra(false)}
      onDrop={(e) => { e.preventDefault(); setSopra(false); const f = e.dataTransfer.files[0]; if (f) carica(f) }}
      className={clsx(
        'flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-8 text-center transition',
        sopra ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 bg-white hover:border-indigo-400 hover:bg-slate-50',
        file && 'pointer-events-none',
      )}
    >
      <input ref={input} type="file" accept=".md,.txt" className="hidden" onChange={(e) => e.target.files?.[0] && carica(e.target.files[0])} />
      {file ? (
        <>
          <LoaderCircle size={28} className="animate-spin text-indigo-500" />
          <p className="mt-3 font-medium text-slate-800">Il Brain sta leggendo {file}…</p>
          <p className="mt-1 text-sm text-slate-500">Estrae task, fatti e punti oscuri, e li confronta con le riunioni precedenti.</p>
        </>
      ) : (
        <>
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-indigo-50 text-indigo-600"><UploadCloud size={24} /></span>
          <p className="mt-3 font-medium text-slate-800">Trascina qui la minuta di una riunione</p>
          <p className="mt-1 text-sm text-slate-500">oppure <span className="font-medium text-indigo-600">sfoglia</span> · .md o .txt (audio e PDF in arrivo)</p>
        </>
      )}
    </label>
  )
}
