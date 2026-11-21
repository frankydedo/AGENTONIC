import clsx from 'clsx'
import { ArrowLeft, BellRing, Gavel, Inbox, ListTodo, Quote } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { api } from '../api'
import { ListaAvvisi } from '../componenti/Avvisi'
import { CartaProposta } from '../componenti/Proposte'
import { RigaTask } from '../componenti/Todo'
import { Avatar, Badge, Card, IntestazioneCard, LinkSobrio, Scheletro, Vuoto } from '../componenti/ui'
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
      <Link to="/documenti" className="inline-flex items-center gap-1.5 text-sm font-medium text-grafite hover:text-inchiostro"><ArrowLeft size={15} /> Documenti</Link>
      <div className="mt-3 mb-7 flex flex-wrap items-end gap-4 border-b-2 border-inchiostro pb-4">
        <div className="min-w-0 flex-1">
          <h1 className="titolo-tavola text-[2rem] sm:text-[2.5rem]">{doc.titolo}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-grafite">
            <span className="inline-flex items-center gap-1.5"><Icona size={15} /> <Badge>{formato}</Badge></span>
            <span className="condensato">{dataMedia(doc.data)}{doc.ora_inizio && `, ore ${doc.ora_inizio}`}</span>
            <span className="condensato">{doc.segmenti.length} interventi</span>
          </p>
        </div>
        <div className="flex -space-x-1.5">
          {doc.partecipanti.map((n) => <Avatar key={n} persona={Object.values(persone).find((p) => p.nome === n)} nome={n} size={30} />)}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_440px]">
        <Card className="overflow-hidden">
          {conMedia && (
            <div className="sticky top-[57px] z-10 border-b border-linea bg-foglio/95 p-4 backdrop-blur">
              {doc.formato === 'video'
                ? <video ref={(el) => { media.current = el }} src={doc.url_file!} controls onTimeUpdate={aggiornaTempo} className="max-h-72 w-full rounded-[4px] bg-inchiostro" />
                : <audio ref={(el) => { media.current = el }} src={doc.url_file!} controls onTimeUpdate={aggiornaTempo} className="w-full" />}
            </div>
          )}
          {doc.formato === 'pdf' && doc.url_file && doc.segmenti.length === 0 ? (
            <iframe src={doc.url_file} title={doc.titolo} className="h-[75vh] w-full" />
          ) : (
            <ol className="divide-y divide-linea">
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
                      'relative flex cursor-pointer gap-4 py-4 pr-5 pl-5 transition-colors',
                      evidenziato ? 'segmento-evidenziato bg-segnale-chiaro' : caldo ? 'bg-segnale-chiaro/60' : 'hover:bg-velina',
                    )}
                  >
                    {(evidenziato || caldo) && <span className={clsx('absolute top-0 bottom-0 left-0', evidenziato ? 'w-[5px] bg-inchiostro' : 'w-[3px] bg-segnale')} />}
                    {/* colonna del margine: chi parla e quando, come in un copione */}
                    <div className="flex w-28 shrink-0 flex-col items-start gap-1.5 sm:w-36">
                      <span className="flex items-center gap-2">
                        <Avatar persona={p} nome={s.speaker} size={24} />
                        <span className="condensato truncate text-[13px] font-bold">{s.speaker.split(' ')[0]}</span>
                      </span>
                      <span className="condensato text-xs text-traccia">{s.inizio != null ? secondi(s.inizio) : s.id.split('#')[1]}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      {(citati.has(s.id) || evidenziato) && (
                        <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs">
                          {citati.has(s.id) && <span className="inline-flex items-center gap-1 font-medium text-grafite"><Quote size={11} /> citato</span>}
                          {evidenziato && <Badge tono="giallo">Fonte selezionata</Badge>}
                        </div>
                      )}
                      <p className={clsx('max-w-[68ch] text-[15.5px] leading-relaxed', evidenziato ? 'font-medium' : 'text-inchiostro/85')}>{s.testo}</p>
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
                : <ul className="space-y-3 p-4">{sue.map((p) => <CartaProposta key={p.id} p={p} onEvidenzia={setSuHover} />)}</ul>}
            </Card>
          ) : (
            <Card>
              <IntestazioneCard icona={ListTodo} titolo="Task nati da questo documento" sottotitolo="Solo quelli approvati che puoi vedere" />
              {taskDaQui.length === 0
                ? <Vuoto icona={Inbox} titolo="Nessun task visibile" />
                : <ul className="divide-y divide-linea">{taskDaQui.map((t) => <li key={t.id} className="px-5 py-3"><RigaTask t={t} compatta /></li>)}</ul>}
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
