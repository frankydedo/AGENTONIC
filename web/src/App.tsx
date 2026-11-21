import { ServerCrash, UserRoundX } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router'
import { api } from './api'
import { Layout } from './componenti/Layout'
import { Avatar, Bottone, MarchioBrain } from './componenti/ui'
import { ContestoApp, type Contesto } from './contesto'
import { DatiProvider } from './dati'
import { Chiedi } from './pagine/Chiedi'
import { Documenti } from './pagine/Documenti'
import { Documento } from './pagine/Documento'
import { Panoramica } from './pagine/Panoramica'
import { Impostazioni } from './pagine/Impostazioni'
import { Posta } from './pagine/Posta'
import { ModuloProgetto, Progetti } from './pagine/Progetti'
import { puoCreareProgetti } from './lib'
import { Registro } from './pagine/Registro'
import { SceltaPersona } from './pagine/SceltaPersona'
import { Team } from './pagine/Team'
import type { Persona, Progetto } from './tipi'

const CHIAVE = 'company-brain-persona'
const CHIAVE_PROGETTO = 'company-brain-progetto'

// Persona e progetto scelti sopravvivono al ricaricamento della pagina (solo comodità della demo).
const salva = (chiave: string, id: string | null) => {
  try { if (id) sessionStorage.setItem(chiave, id); else sessionStorage.removeItem(chiave) } catch { /* storage non disponibile */ }
}
const leggi = (chiave: string) => { try { return sessionStorage.getItem(chiave) } catch { return null } }

type Fase = 'avvio' | 'scelta' | 'carico' | 'pronto' | 'non_membro' | 'offline'

export default function App() {
  const [persone, setPersone] = useState<Persona[]>([])
  const [io, setIo] = useState<Persona | null>(null)
  const [progetti, setProgetti] = useState<Progetto[]>([])
  const [progettoId, setProgettoId] = useState<string | null>(null)
  const [fase, setFase] = useState<Fase>('avvio')
  const vai = useNavigate()

  const scegli = useCallback(async (id: string) => {
    setFase('carico')
    try {
      setIo(await api.apriSessione(id))
      salva(CHIAVE, id)
      const suoi = await api.progetti()
      setProgetti(suoi)
      if (suoi.length === 0) { setProgettoId(null); setFase('non_membro'); return }
      const ricordato = leggi(CHIAVE_PROGETTO)
      setProgettoId(suoi.some((p) => p.id === ricordato) ? ricordato : suoi[0].id)
      setFase('pronto')
    } catch {
      setFase('offline')
    }
  }, [])

  const ricaricaProgetti = useCallback(async () => {
    const suoi = await api.progetti()
    setProgetti(suoi)
    // se il progetto aperto non c'è più (eliminato o non più membro) si passa a un altro, o alla schermata vuota
    setProgettoId((attuale) => {
      if (suoi.some((p) => p.id === attuale)) return attuale
      if (suoi.length === 0) { setFase('non_membro'); return null }
      return suoi[0].id
    })
    return suoi
  }, [])

  const scegliProgetto = useCallback((id: string) => {
    salva(CHIAVE_PROGETTO, id)
    setProgettoId(id)
    setFase('pronto')
    vai('/')
  }, [vai])

  const avvia = useCallback(() => {
    setFase('avvio')
    api.persone()
      .then((ps) => {
        setPersone(ps)
        const r = leggi(CHIAVE)
        if (r && ps.some((p) => p.id === r)) scegli(r)
        else setFase('scelta')
      })
      .catch(() => setFase('offline'))
  }, [scegli])

  useEffect(() => { avvia() }, [avvia])

  const esci = useCallback(() => { salva(CHIAVE, null); setIo(null); setProgetti([]); setFase('scelta') }, [])

  const progetto = progetti.find((p) => p.id === progettoId) ?? null
  const ctx = useMemo<Contesto | null>(() => {
    if (!io || !progetto) return null
    const mappa = Object.fromEntries(persone.map((p) => [p.id, p]))
    return {
      io, progetto, progetti, scegliProgetto, ricaricaProgetti, persone: mappa,
      membri: progetto.membri.map((id) => mappa[id]).filter(Boolean),
      sonoManager: io.id === progetto.manager_id,
      scegliPersona: scegli, esci,
    }
  }, [io, progetto, progetti, scegliProgetto, ricaricaProgetti, persone, scegli, esci])

  if (fase === 'avvio' || fase === 'carico') {
    return (
      <div className="grid min-h-screen place-items-center">
        <div className="flex flex-col items-center gap-4" role="status">
          <MarchioBrain size={56} parla />
          <p className="text-[15px] text-testo-2">{fase === 'carico' ? 'The Brain is preparing your day…' : 'Starting up…'}</p>
        </div>
      </div>
    )
  }
  if (fase === 'offline') {
    return (
      <Schermo icona={<ServerCrash size={26} />} titolo="The backend isn’t responding"
        testo="Check that the FastAPI server is running (see the README) and try again.">
        <Bottone variante="primario" onClick={avvia}>Try again</Bottone>
      </Schermo>
    )
  }
  if (fase === 'scelta' || !io) return <SceltaPersona persone={persone} onScegli={scegli} />
  if ((fase === 'non_membro' || !ctx) && puoCreareProgetti(io)) {
    // app vuota: chi può creare progetti parte da qui
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">Hi {io.nome.split(' ')[0]}, there are no projects yet</h1>
        <p className="mt-2 text-testo-2">Create the first one: choose who works on it and who leads it. Then upload the minutes of a meeting and the Brain gets to work.</p>
        <div className="mt-8 rounded-2xl bg-superficie p-6 shadow-alta">
          <ModuloProgetto progetto={null} io={io} tutte={persone} ricaricaProgetti={ricaricaProgetti}
            scegliProgetto={scegliProgetto} onFatto={() => {}} />
        </div>
        <Bottone variante="secondario" className="mt-6" onClick={esci}>Switch person</Bottone>
      </div>
    )
  }
  if (fase === 'non_membro' || !ctx) {
    return (
      <Schermo icona={<UserRoundX size={26} />} titolo={`${io.nome.split(' ')[0]}, you’re not part of any project`}
        testo="The Brain shows you nothing about projects you’re not a member of: not their data, not even that they exist. Ask a manager to add you.">
        <div className="flex items-center gap-3"><Avatar persona={io} size={32} /><Bottone onClick={esci}>Switch person</Bottone></div>
      </Schermo>
    )
  }

  return (
    <ContestoApp.Provider value={ctx}>
      <DatiProvider key={`${io.id}:${progetto?.id}`}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Panoramica />} />
            <Route path="projects" element={<Progetti />} />
            <Route path="settings" element={<Impostazioni />} />
            <Route path="documents" element={<Documenti />} />
            <Route path="documents/:id" element={<Documento />} />
            <Route path="team" element={<Team />} />
            <Route path="ask" element={<Chiedi />} />
            <Route path="mail" element={<Posta />} />
            <Route path="log" element={<Registro />} />
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
      <div className="flex max-w-md flex-col items-center rounded-[28px] bg-superficie px-8 py-10 text-center shadow-alta">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-arancio-tenue text-arancio-testo">{icona}</span>
        <h1 className="titolo-grande mt-5 text-[26px]">{titolo}</h1>
        <p className="mt-2 text-[15px] text-testo-2">{testo}</p>
        <div className="mt-7 flex">{children}</div>
      </div>
    </div>
  )
}
