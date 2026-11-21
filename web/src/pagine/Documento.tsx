import clsx from 'clsx'
import { ChevronLeft, BellRing, Gavel, Inbox, ListTodo, Quote } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { api } from '../api'
import { ListaAvvisi } from '../componenti/Avvisi'
import { ProposteACassetti } from '../componenti/Proposte'
import { RigaTask } from '../componenti/Todo'
import { Avatar, Card, IntestazioneCard, LinkSobrio, Scheletro, Vuoto } from '../componenti/ui'
import { useApp } from '../contesto'
import { useDati } from '../dati'
import { dataMedia, secondi } from '../lib'
import type { Documento as TDocumento } from '../tipi'
import { FORMATI } from './Documenti'

/**
 * Il documento originale con il punto citato evidenziato (?seg=s003).
 * Minute e trascrizioni: testo per turni di parola. Audio e video: lettore sincronizzato.
 */
export function Documento() {
  const { id = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const seg = params.get('seg')
  const segId = seg ? `${id}#${seg}` : null
  const { persone, sonoManager } = useApp()
  const { proposte, task, avvisi } = useDati()
  const [doc, setDoc] = useState<TDocumento | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [suHover, setSuHover] = useState<string[] | null>(null)
  const [attivo, setAttivo] = useState<string | null>(null)
  const elementi = useRef(new Map<string, HTMLElement>())
  const media = useRef<HTMLMediaElement | null>(null)

  useEffect(() => {
    let vivo = true
    setDoc(null)
    setErrore(null)
    api.documento(id).then((d) => { if (vivo) setDoc(d) }).catch((e) => { if (vivo) setErrore(e.message) })
    return () => { vivo = false }
  }, [id])

  // porta in vista il segmento citato e, se c'è un lettore, salta a quel momento
  useEffect(() => {
    if (!doc || !segId) return
    elementi.current.get(segId)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const s = doc.segmenti.find((x) => x.id === segId)
    if (media.current && s?.inizio != null) media.current.currentTime = s.inizio
  }, [doc, segId])

  const sue = proposte.filter((p) => p.documento_id === id)
  const taskDaQui = task.filter((t) => t.citazioni.some((c) => c.documento_id === id))
  const citati = useMemo(() => new Set([
    ...sue.flatMap((p) => p.citazioni.map((c) => c.segmento_id)),
    ...taskDaQui.flatMap((t) => t.citazioni.map((c) => c.segmento_id)),
    ...avvisi.flatMap((a) => a.citazioni.map((c) => c.segmento_id)),
  ]), [sue, taskDaQui, avvisi])

  if (errore) return <Card><Vuoto icona={Inbox} titolo="Documento non disponibile" testo={errore} azione={<LinkSobrio a="/documenti">Torna ai documenti</LinkSobrio>} /></Card>
  if (!doc) return <Card><Scheletro righe={6} /></Card>

  const [formato, Icona] = FORMATI[doc.formato] ?? FORMATI.minuta
  const conMedia = doc.url_file && (doc.formato === 'audio' || doc.formato === 'video')
  const scegli = (sid: string) => {
    setParams({ seg: sid.split('#')[1] }, { replace: true })
  }
  const aggiornaTempo = () => {
    const t = media.current?.currentTime ?? 0
    setAttivo(doc.segmenti.find((s) => s.inizio != null && s.fine != null && t >= s.inizio && t < s.fine)?.id ?? null)
  }

  return (
    <div>
      <Link to="/documenti" className="inline-flex items-center gap-0.5 text-[15px] text-accento-testo hover:underline"><ChevronLeft size={18} strokeWidth={2.4} /> Documenti</Link>
      <div className="mt-2 mb-7 flex flex-wrap items-end gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="titolo-grande text-[30px] sm:text-[36px]">{doc.titolo}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px] text-testo-2">
            <span className="inline-flex items-center gap-1.5"><Icona size={15} /> {formato}</span>
            <span>{dataMedia(doc.data)}{doc.ora_inizio && `, ore ${doc.ora_inizio}`}</span>
            <span>{doc.segmenti.length} interventi</span>
          </p>
        </div>
        <div className="flex -space-x-1.5">
          {doc.partecipanti.slice(0, 6).map((n) => <Avatar key={n} persona={Object.values(persone).find((p) => p.nome === n)} nome={n} size={30} />)}
          {doc.partecipanti.length > 6 && (
            <span title={doc.partecipanti.slice(6).join(', ')} className="grid h-[30px] min-w-[30px] place-items-center rounded-full bg-riempimento px-1.5 text-[11px] font-semibold text-testo-2 ring-2 ring-superficie">
              +{doc.partecipanti.length - 6}
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_440px]">
        <Card className="overflow-hidden">
          {conMedia && (
            <div className="sticky top-[60px] z-10 border-b border-separatore bg-superficie/85 p-4 backdrop-blur-xl">
              {doc.formato === 'video'
                ? <video ref={(el) => { media.current = el }} src={doc.url_file!} controls onTimeUpdate={aggiornaTempo} className="max-h-72 w-full rounded-2xl bg-black" />
                : <audio ref={(el) => { media.current = el }} src={doc.url_file!} controls onTimeUpdate={aggiornaTempo} className="w-full" />}
            </div>
          )}
          {doc.formato === 'pdf' && doc.url_file && doc.segmenti.length === 0 ? (
            <iframe src={doc.url_file} title={doc.titolo} className="h-[75vh] w-full" />
          ) : (
            <ol className="py-2">
              {doc.segmenti.map((s) => {
                const evidenziato = s.id === segId
                const caldo = suHover?.includes(s.id) || attivo === s.id
                const p = s.persona_id ? persone[s.persona_id] : null
                return (
                  <li
                    key={evidenziato ? `${s.id}-${seg}` : s.id}
                    ref={(el) => { if (el) elementi.current.set(s.id, el); else elementi.current.delete(s.id) }}
                    onClick={() => scegli(s.id)}
                    className={clsx(
                      'mx-2 flex cursor-pointer gap-3.5 rounded-2xl px-4 py-3.5 transition-colors',
                      evidenziato ? 'segmento-evidenziato bg-evidenza shadow-[inset_0_0_0_1px_var(--evidenza-bordo)]' : caldo ? 'bg-evidenza' : 'hover:bg-riempimento/70',
                    )}
                  >
                    <Avatar persona={p} nome={s.speaker} size={30} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
                        <span className="font-semibold">{s.speaker}</span>
                        <span className="cifre text-testo-2">{s.inizio != null ? secondi(s.inizio) : s.id.split('#')[1]}</span>
                        {citati.has(s.id) && !evidenziato && <span className="inline-flex items-center gap-1 text-xs text-testo-2"><Quote size={11} /> citato</span>}
                        {evidenziato && <span className="rounded-[7px] bg-evidenza-segno px-2 py-0.5 text-xs font-semibold text-evidenza-testo">Fonte selezionata</span>}
                      </div>
                      <p className={clsx('mt-0.5 max-w-[68ch] text-[16px] leading-relaxed', evidenziato && 'font-medium')}>{s.testo}</p>
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </Card>

        <div className="space-y-6">
          {sonoManager ? (
            <Card>
              <IntestazioneCard icona={Gavel} titolo="Proposte da questo documento"
                sottotitolo="Passa sopra una proposta per vedere da quali frasi nasce." />
              {sue.length === 0
                ? <Vuoto icona={Inbox} titolo="Nessuna proposta" testo="Il Brain non ha estratto nulla da questo documento." />
                : <ProposteACassetti proposte={sue} onEvidenzia={setSuHover} />}
            </Card>
          ) : (
            <Card>
              <IntestazioneCard icona={ListTodo} titolo="Task nati da questo documento" sottotitolo="Solo quelli approvati che puoi vedere" />
              {taskDaQui.length === 0
                ? <Vuoto icona={Inbox} titolo="Nessun task visibile" />
                : <ul className="divide-y divide-separatore">{taskDaQui.map((t) => <li key={t.id} className="px-5 py-3.5"><RigaTask t={t} compatta /></li>)}</ul>}
            </Card>
          )}
          <Card>
            <IntestazioneCard icona={BellRing} titolo="Avvisi su questo documento" />
            <ListaAvvisi documentoId={id} />
          </Card>
        </div>
      </div>
    </div>
  )
}
