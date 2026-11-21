// Posta: client delle rotte /posta/... (specchio di backend/posta). La UI non sa quale provider
// c'è dietro (casella finta, Gmail o Outlook): vede solo cartelle, mail e risposte di Agentonic.
import { useEffect, useState } from 'react'
import { chiama } from './api'
import type { Citazione } from './tipi'

export type IdCartella = 'in_arrivo' | 'inviata' | 'archivio'

export interface Indirizzo { nome: string; email: string }

export interface MailBreve {
  id: string
  cartella: IdCartella
  da: Indirizzo
  a: Indirizzo[]
  oggetto: string
  data: string
  anteprima: string
  letta: boolean
  progetto_id: string | null
}

export interface Mail extends MailBreve { testo: string }

export interface Cartella { id: IdCartella; nome: string; totale: number; non_lette: number }

export interface RispostaPosta {
  esito: 'risposta' | 'non_lo_so'
  testo: string
  cita_email: boolean
  citazioni: Citazione[]
}

export const posta = {
  cartelle: () => chiama<Cartella[]>('/posta/cartelle'),
  messaggi: (cartella: IdCartella) => chiama<MailBreve[]>(`/posta/messaggi?cartella=${cartella}`),
  messaggio: (id: string) => chiama<Mail>(`/posta/messaggi/${encodeURIComponent(id)}`),
  chiedi: (id: string, progettoId: string, testo: string) =>
    chiama<RispostaPosta>(`/posta/messaggi/${encodeURIComponent(id)}/chiedi`,
      { method: 'POST', body: JSON.stringify({ progetto_id: progettoId, testo }) }),
}

// Quando si apre una mail il conteggio delle non lette nel menu si aggiorna da solo.
const EVENTO = 'posta-letta'
export const segnalaLettura = () => window.dispatchEvent(new Event(EVENTO))

/** Mail non lette in arrivo, per il numero accanto a «Posta» nel menu. */
export function useNonLette(personaId: string) {
  const [n, setN] = useState(0)
  useEffect(() => {
    let vivo = true
    const aggiorna = () => posta.cartelle()
      .then((cs) => { if (vivo) setN(cs.find((c) => c.id === 'in_arrivo')?.non_lette ?? 0) })
      .catch(() => { if (vivo) setN(0) })
    aggiorna()
    window.addEventListener(EVENTO, aggiorna)
    return () => { vivo = false; window.removeEventListener(EVENTO, aggiorna) }
  }, [personaId])
  return n
}
