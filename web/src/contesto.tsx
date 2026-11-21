import { createContext, useContext } from 'react'
import type { Persona, Progetto } from './tipi'

export interface Contesto {
  io: Persona
  progetto: Progetto
  progetti: Progetto[] // quelli di cui la persona è membro
  scegliProgetto: (id: string) => void
  persone: Record<string, Persona>
  membri: Persona[]
  sonoManager: boolean
  scegliPersona: (id: string) => void
  esci: () => void
}

export const ContestoApp = createContext<Contesto | null>(null)

export function useApp(): Contesto {
  const c = useContext(ContestoApp)
  if (!c) throw new Error('useApp fuori da ContestoApp')
  return c
}
