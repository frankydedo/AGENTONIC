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

  const scegliProgetto = useCallback((id: string) => {
    salva(CHIAVE_PROGETTO, id)
    setProgettoId(id)
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
      io, progetto, progetti, scegliProgetto, persone: mappa,
      membri: progetto.membri.map((id) => mappa[id]).filter(Boolean),
      sonoManager: io.id === progetto.manager_id,
      scegliPersona: scegli, esci,
    }
  }, [io, progetto, progetti, scegliProgetto, persone, scegli, esci])

  if (fase === 'avvio' || fase === 'carico') {
    return (
      <div className="quadrettatura grid min-h-screen place-items-center">
        <div className="flex flex-col items-center gap-4" role="status">
          <MarchioBrain size={52} parla />
          <p className="text-sm font-medium text-grafite">{fase === 'carico' ? 'Il Brain prepara la tua giornata…' : 'Accensione…'}</p>
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
      <Schermo icona={<UserRoundX size={26} />} titolo={`${io.nome.split(' ')[0]}, non fai parte di nessun progetto`}
        testo="Il Brain non ti mostra nulla dei progetti di cui non sei membro: né i dati, né che esistono. Chiedi a un manager di aggiungerti.">
        <div className="flex items-center gap-3"><Avatar persona={io} size={32} /><Bottone onClick={esci}>Cambia persona</Bottone></div>
      </Schermo>
    )
  }

  return (
    <ContestoApp.Provider value={ctx}>
      <DatiProvider key={`${io.id}:${progetto?.id}`}>
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
    <div className="quadrettatura grid min-h-screen place-items-center px-4">
      <div className="sopra max-w-md rounded-md border border-inchiostro bg-foglio p-7">
        <span className="grid h-11 w-11 place-items-center rounded-[4px] bg-segnale text-inchiostro">{icona}</span>
        <h1 className="titolo-tavola mt-5 text-2xl">{titolo}</h1>
        <p className="mt-2 text-grafite">{testo}</p>
        <div className="mt-6 flex">{children}</div>
      </div>
    </div>
  )
}
