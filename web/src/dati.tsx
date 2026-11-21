// Stato condiviso del progetto: documenti, proposte, avvisi (SSE), task.
// Le decisioni prese in questa sessione restano visibili anche se lo stub del backend non le salva.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { api } from './api'
import { useApp } from './contesto'
import { titoloProposta } from './lib'
import type { Area, Avviso, Documento, Modifiche, PassoRegistro, Proposta, Task } from './tipi'

export interface Dati {
  pronto: boolean
  documenti: Documento[]
  proposte: Proposta[]
  avvisi: Avviso[]
  task: Task[]
  connesso: boolean
  ricarica: () => Promise<void>
  decidi: (p: Proposta, esito: 'approva' | 'rifiuta', opz?: { aree?: Area[]; modifiche?: Modifiche }) => Promise<void>
  risolvi: (id: string) => Promise<void>
  riapri: (p: Proposta) => Promise<void>
  inoltra: (id: string, personaIds: string[], aree: Area[]) => Promise<boolean>
  /** Passi del workflow arrivati in diretta (evento SSE `passo`, PROPOSTA di contratto). */
  passiLive: PassoRegistro[]
  propostaDiAvviso: (a: Avviso) => Proposta | undefined
  avvisoDiProposta: (p: Proposta) => Avviso | undefined
}

const Ctx = createContext<Dati | null>(null)

export function useDati(): Dati {
  const c = useContext(Ctx)
  if (!c) throw new Error('useDati fuori da DatiProvider')
  return c
}

const stessoSegmento = (a: Avviso, p: Proposta) =>
  a.documento_id === p.documento_id && p.citazioni.some((c) => a.citazioni.some((x) => x.segmento_id === c.segmento_id))

export function DatiProvider({ children }: { children: ReactNode }) {
  const { progetto, sonoManager, io } = useApp()
  const [documenti, setDocumenti] = useState<Documento[]>([])
  const [proposteServer, setProposteServer] = useState<Proposta[]>([])
  const [decise, setDecise] = useState<Record<string, Proposta>>({})
  const [avvisiServer, setAvvisiServer] = useState<Avviso[]>([])
  const [passiLive, setPassiLive] = useState<PassoRegistro[]>([])
  const [risolti, setRisolti] = useState<Set<string>>(new Set())
  const [task, setTask] = useState<Task[]>([])
  const [connesso, setConnesso] = useState(false)
  const [pronto, setPronto] = useState(false)

  const caricaTask = useCallback(() => api.todoProgetto(progetto.id).then(setTask), [progetto.id])

  const ricarica = useCallback(async () => {
    const lavori: Promise<unknown>[] = [api.documenti(progetto.id).then(setDocumenti), caricaTask()]
    if (sonoManager) {
      const stati = ['in_attesa', 'approvata', 'rifiutata'] as const
      lavori.push(Promise.all(stati.map((s) => api.proposte(progetto.id, s))).then((xs) => setProposteServer(xs.flat())))
    }
    const ko = (await Promise.allSettled(lavori)).find((e) => e.status === 'rejected')
    if (ko) toast.error('Non riesco a caricare tutti i dati', { description: String((ko as PromiseRejectedResult).reason?.message ?? '') })
    setPronto(true)
  }, [progetto.id, sonoManager, caricaTask])

  useEffect(() => { ricarica() }, [ricarica])

  // Il Brain parla per primo: gli avvisi arrivano da soli via SSE.
  // Lo stream si chiude anche su `pagehide`: se il browser tiene la pagina in back/forward cache
  // con l'EventSource aperto, ogni ricaricamento lascia una connessione appesa e dopo 6 Chrome
  // blocca tutte le richieste verso il backend (limite di connessioni per host di HTTP/1.1).
  useEffect(() => {
    let es: EventSource | null = null
    const apri = () => {
      es?.close()
      es = new EventSource(api.urlAvvisi(progetto.id))
      es.onopen = () => setConnesso(true)
      es.onerror = () => setConnesso(false)
      es.addEventListener('avviso', (ev) => {
        const a: Avviso = JSON.parse((ev as MessageEvent).data)
        setAvvisiServer((xs) => [a, ...xs.filter((x) => x.id !== a.id)])
      })
      es.addEventListener('passo', (ev) => {
        const p: PassoRegistro = JSON.parse((ev as MessageEvent).data)
        setPassiLive((xs) => [...xs, p])
      })
    }
    const chiudi = () => { es?.close(); es = null; setConnesso(false) }
    const riapri = (e: PageTransitionEvent) => { if (e.persisted) apri() }
    apri()
    window.addEventListener('pagehide', chiudi)
    window.addEventListener('pageshow', riapri)
    return () => {
      window.removeEventListener('pagehide', chiudi)
      window.removeEventListener('pageshow', riapri)
      es?.close()
    }
  }, [progetto.id, io.id])

  const proposte = useMemo(() => proposteServer.map((p) => decise[p.id] ?? p), [proposteServer, decise])
  const avvisi = useMemo(
    () => avvisiServer.map((a) => (risolti.has(a.id) ? { ...a, risolto: true } : a)),
    [avvisiServer, risolti],
  )

  const propostaDiAvviso = useCallback((a: Avviso) =>
    a.proposta_id ? proposte.find((p) => p.id === a.proposta_id) : proposte.find((p) => stessoSegmento(a, p)),
  [proposte])

  const avvisoDiProposta = useCallback((p: Proposta) =>
    avvisi.find((a) => (a.proposta_id ? a.proposta_id === p.id : stessoSegmento(a, p))),
  [avvisi])

  const risolvi = useCallback(async (id: string) => {
    try {
      await api.risolviAvviso(id)
      setRisolti((s) => new Set(s).add(id))
    } catch (e) {
      toast.error('Non riesco a risolvere l\'avviso', { description: (e as Error).message })
    }
  }, [])

  const inoltra = useCallback<Dati['inoltra']>(async (id, personaIds, aree) => {
    try {
      const a = await api.inoltraAvviso(id, personaIds, aree)
      setAvvisiServer((xs) => xs.map((x) => (x.id === id ? { ...x, ...a } : x)))
      toast.success('Avviso inoltrato', { description: 'Ora lo vede chi hai scelto.' })
      return true
    } catch (e) {
      toast.error('Non riesco a inoltrare l\'avviso', { description: (e as Error).message })
      return false
    }
  }, [])

  const riapri = useCallback(async (p: Proposta) => {
    try {
      const r = await api.riapriProposta(p.id)
      setDecise((d) => ({ ...d, [p.id]: r }))
      toast.success('Proposta recuperata', { description: 'È di nuovo tra quelle da decidere.' })
    } catch (e) {
      toast.error('Non riesco a recuperarla', { description: (e as Error).message })
      throw e
    }
  }, [])

  const decidi = useCallback<Dati['decidi']>(async (p, esito, opz = {}) => {
    try {
      const r = esito === 'approva'
        ? await api.approva(p.id, opz.aree ?? null, opz.modifiche ?? null)
        : await api.rifiuta(p.id)
      const finale = opz.modifiche ? { ...r, contenuto: { ...r.contenuto, ...opz.modifiche } } : r
      setDecise((d) => ({ ...d, [p.id]: finale }))
      toast.success(esito === 'approva' ? (opz.modifiche ? 'Corretta e approvata' : 'Proposta approvata') : 'Proposta rifiutata',
        { description: titoloProposta(finale) })
      const av = avvisoDiProposta(p)
      if (av && !av.risolto) await risolvi(av.id)
      caricaTask().catch(() => {})
    } catch (e) {
      toast.error('Operazione non riuscita', { description: (e as Error).message })
      throw e
    }
  }, [avvisoDiProposta, risolvi, caricaTask])

  const valore: Dati = {
    pronto, documenti, proposte, avvisi, task, connesso, ricarica, decidi, riapri, risolvi, inoltra, passiLive,
    propostaDiAvviso, avvisoDiProposta,
  }
  return <Ctx.Provider value={valore}>{children}</Ctx.Provider>
}
