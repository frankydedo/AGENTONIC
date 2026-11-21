import { BrainCircuit, LoaderCircle, ServerCrash, UserRoundX } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import { api, ErroreApi } from './api'
import { Layout } from './componenti/Layout'
import { Avatar, Bottone } from './componenti/ui'
import { ContestoApp, type Contesto } from './contesto'
import { DatiProvider } from './dati'
import { Chiedi } from './pagine/Chiedi'
import { Documenti } from './pagine/Documenti'
import { Documento } from './pagine/Documento'
import { Panoramica } from './pagine/Panoramica'
import { Registro } from './pagine/Registro'
import { SceltaPersona } from './pagine/SceltaPersona'
import { Team } from './pagine/Team'
import type { Persona, Progetto } from './tipi'

const PROGETTO_ID = 'prj-01'
const CHIAVE = 'company-brain-persona'

// La persona scelta sopravvive al ricaricamento della pagina (solo comodità della demo).
const ricorda = (id: string | null) => {
  try { if (id) sessionStorage.setItem(CHIAVE, id); else sessionStorage.removeItem(CHIAVE) } catch { /* storage non disponibile */ }
}
const ricordata = () => { try { return sessionStorage.getItem(CHIAVE) } catch { return null } }

type Fase = 'avvio' | 'scelta' | 'carico' | 'pronto' | 'non_membro' | 'offline'

export default function App() {
  const [persone, setPersone] = useState<Persona[]>([])
  const [io, setIo] = useState<Persona | null>(null)
  const [progetto, setProgetto] = useState<Progetto | null>(null)
  const [fase, setFase] = useState<Fase>('avvio')

  const scegli = useCallback(async (id: string) => {
    setFase('carico')
    try {
      setIo(await api.apriSessione(id))
      ricorda(id)
      try {
        setProgetto(await api.progetto(PROGETTO_ID))
        setFase('pronto')
      } catch (e) {
        if (e instanceof ErroreApi && e.status === 403) { setProgetto(null); setFase('non_membro') } else throw e
      }
    } catch {
      setFase('offline')
    }
  }, [])

  const avvia = useCallback(() => {
    setFase('avvio')
    api.persone()
      .then((ps) => {
        setPersone(ps)
        const r = ricordata()
        if (r && ps.some((p) => p.id === r)) scegli(r)
        else setFase('scelta')
      })
      .catch(() => setFase('offline'))
  }, [scegli])

  useEffect(() => { avvia() }, [avvia])

  const esci = useCallback(() => { ricorda(null); setIo(null); setProgetto(null); setFase('scelta') }, [])

  const ctx = useMemo<Contesto | null>(() => {
    if (!io || !progetto) return null
    const mappa = Object.fromEntries(persone.map((p) => [p.id, p]))
    return {
      io, progetto, persone: mappa,
      membri: progetto.membri.map((id) => mappa[id]).filter(Boolean),
      sonoManager: io.id === progetto.manager_id,
      scegliPersona: scegli, esci,
    }
  }, [io, progetto, persone, scegli, esci])

  if (fase === 'avvio' || fase === 'carico') {
    return (
      <div className="grid min-h-screen place-items-center">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white"><BrainCircuit size={24} /></span>
          <LoaderCircle size={18} className="animate-spin" />
        </div>
      </div>
    )
  }
  if (fase === 'offline') {
    return (
      <Schermo icona={<ServerCrash size={26} />} titolo="Il backend non risponde"
        testo="Controlla che il server FastAPI sia acceso (vedi README) e riprova.">
        <Bottone variante="primario" onClick={avvia}>Riprova</Bottone>
      </Schermo>
    )
  }
  if (fase === 'scelta' || !io) return <SceltaPersona persone={persone} onScegli={scegli} />
  if (fase === 'non_membro' || !ctx) {
    return (
      <Schermo icona={<UserRoundX size={26} />} titolo={`${io.nome.split(' ')[0]}, non fai parte di questo progetto`}
        testo="Il Brain non ti mostra nulla del progetto: né i dati, né che esistono. Chiedi al manager di aggiungerti.">
        <div className="flex items-center gap-3"><Avatar persona={io} size={32} /><Bottone onClick={esci}>Cambia persona</Bottone></div>
      </Schermo>
    )
  }

  return (
    <ContestoApp.Provider value={ctx}>
      <DatiProvider key={io.id}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Panoramica />} />
            <Route path="documenti" element={<Documenti />} />
            <Route path="documenti/:id" element={<Documento />} />
            <Route path="team" element={<Team />} />
            <Route path="chiedi" element={<Chiedi />} />
            <Route path="registro" element={<Registro />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </DatiProvider>
    </ContestoApp.Provider>
  )
}

function Schermo({ icona, titolo, testo, children }: { icona: ReactNode; titolo: string; testo: string; children: ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="max-w-md text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-slate-500">{icona}</span>
        <h1 className="mt-4 text-xl font-semibold">{titolo}</h1>
        <p className="mt-2 text-slate-500">{testo}</p>
        <div className="mt-6 flex justify-center">{children}</div>
      </div>
    </div>
  )
}
