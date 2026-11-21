import clsx from 'clsx'
import { ChevronRight, FileAudio, FileText, FileType, Inbox, Video, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router'
import { PannelloAnalisi } from '../componenti/Analisi'
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
      {sonoManager && <PannelloAnalisiInline />}
      <Card className="mt-6">
        {!pronto ? <Scheletro /> : ordinati.length === 0 ? (
          <Vuoto icona={Inbox} titolo="Ancora nessun documento" testo="Carica la minuta di una riunione per iniziare." />
        ) : (
          <ul className="divide-y divide-linea">
            {ordinati.map((d) => <RigaDocumento key={d.id} d={d} />)}
          </ul>
        )}
      </Card>
    </>
  )
}

function RigaDocumento({ d }: { d: Documento }) {
  const { persone, sonoManager } = useApp()
  const { proposte, avvisi } = useDati()
  const [formato, Icona] = FORMATI[d.formato] ?? FORMATI.minuta
  const sue = proposte.filter((p) => p.documento_id === d.id)
  const conta = (s: string) => sue.filter((p) => p.stato === s).length
  const decise = conta('approvata') + conta('rifiutata')
  const aperti = avvisi.filter((a) => a.documento_id === d.id && !a.risolto).length
  const partecipanti = d.partecipanti.map((n) => Object.values(persone).find((p) => p.nome === n) ?? null)

  return (
    <li>
      <Link to={`/documenti/${d.id}`} className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-velina">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[4px] border border-linea-forte bg-foglio text-inchiostro"><Icona size={20} strokeWidth={2} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[16px] font-semibold">{d.titolo}</p>
            <Badge>{formato}</Badge>
            <Badge tono={d.tipo === 'riunione' ? 'blu' : 'viola'}>{d.tipo === 'riunione' ? 'Riunione' : 'Integrativo'}</Badge>
          </div>
          <p className="condensato mt-1 flex flex-wrap gap-x-3 text-sm text-grafite">
            <span>{dataMedia(d.data)}{d.ora_inizio && `, ore ${d.ora_inizio}`}</span><span className="text-traccia">{d.id}</span>
          </p>
        </div>
        <div className="hidden -space-x-1.5 md:flex">
          {partecipanti.slice(0, 6).map((p, k) => <Avatar key={k} persona={p} nome={d.partecipanti[k]} size={26} />)}
          {partecipanti.length > 6 && <span className="grid h-[26px] w-[26px] place-items-center rounded-[4px] bg-velina text-[10px] font-semibold text-grafite ring-2 ring-foglio">+{partecipanti.length - 6}</span>}
        </div>
        {sonoManager && (
          <div className="hidden w-48 sm:block">
            <div className="flex justify-between text-xs text-grafite">
              <span>{conta('in_attesa') ? <b className="text-inchiostro">{conta('in_attesa')} da decidere</b> : 'Tutto deciso'}</span>
              <span className="condensato">{decise}/{sue.length}</span>
            </div>
            {/* una tacca per proposta: piena se decisa, gialla se aspetta te */}
            <div className="mt-1.5 flex gap-[3px]">
              {sue.map((p) => <span key={p.id} className={clsx('h-2 flex-1 rounded-[1px]', p.stato === 'in_attesa' ? 'bg-segnale' : p.stato === 'approvata' ? 'bg-timbro' : 'bg-linea-forte')} />)}
            </div>
            {aperti > 0 && <p className="mt-1 text-xs text-segnale-scuro">{aperti} avvisi aperti</p>}
          </div>
        )}
        <ChevronRight size={18} className="text-linea-forte transition group-hover:translate-x-0.5 group-hover:text-inchiostro" />
      </Link>
    </li>
  )
}

/** Il manager carica qui una minuta e guarda il Brain lavorare (lo stesso pannello del pulsante in alto). */
function PannelloAnalisiInline() {
  return <Card className="p-5"><PannelloAnalisi /></Card>
}
