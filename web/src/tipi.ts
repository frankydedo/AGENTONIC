// Specchio di backend/modelli.py (contratto I1). Si cambia solo insieme a quello.

export type Area = 'sviluppo' | 'budget' | 'commerciale' | 'fornitori' | 'personale' | 'generale'
export const AREE: Area[] = ['sviluppo', 'budget', 'commerciale', 'fornitori', 'personale', 'generale']

export type Sicurezza = 'alta' | 'media' | 'bassa'
export type StatoTask = 'da_fare' | 'in_corso' | 'bloccato' | 'fatto' | 'annullato'
export type TipoProposta = 'nuovo_task' | 'aggiorna_task' | 'chiudi_task' | 'nuovo_fatto'
export type StatoProposta = 'in_attesa' | 'approvata' | 'rifiutata'
export type TipoAvviso =
  | 'incongruenza' | 'punto_oscuro' | 'sconosciuto'
  | 'dipendenza_a_rischio' | 'evento_esterno' | 'brief'
export type EsitoRisposta = 'risposta' | 'non_lo_so' | 'non_autorizzato'

export interface Persona {
  id: string
  nome: string
  ruolo: string
  alias: string[]
  competenze: Area[]
}

export interface Progetto {
  id: string
  nome: string
  cliente: string
  manager_id: string
  membri: string[]
  scadenza: string
  descrizione: string
}

export interface Segmento {
  id: string
  documento_id: string
  speaker: string
  persona_id: string | null
  inizio: number | null
  fine: number | null
  testo: string
}

export interface Documento {
  id: string
  progetto_id: string
  tipo: 'riunione' | 'integrativo'
  formato: 'minuta' | 'trascrizione' | 'audio' | 'video' | 'pdf' // 'video': PROPOSTA (docs/proposte-contratto-ui.md)
  titolo: string
  data: string
  ora_inizio: string | null
  partecipanti: string[]
  segmenti: Segmento[]
  url_file?: string | null // PROPOSTA: file originale (audio, video, pdf) servito dal backend
}

export interface Citazione {
  segmento_id: string
  documento_id: string
  titolo: string
  data: string
  orario: string | null
  speaker: string
  frase: string
}

export interface Task {
  id: string
  progetto_id: string
  titolo: string
  assegnatario_id: string | null
  scadenza: string | null
  stato: StatoTask
  aree: Area[]
  dipende_da: string[]
  citazioni: Citazione[]
}

export interface Proposta {
  id: string
  progetto_id: string
  documento_id: string | null
  tipo: TipoProposta
  stato: StatoProposta
  contenuto: Record<string, unknown>
  aree_proposte: Area[]
  aree_confermate: Area[] | null
  sicurezza: Sicurezza
  citazioni: Citazione[]
  creata_il: string
  decisa_da: string | null
  decisa_il: string | null
}

export interface Avviso {
  id: string
  progetto_id: string
  documento_id: string | null
  tipo: TipoAvviso
  testo: string
  citazioni: Citazione[]
  solo_manager: boolean
  risolto: boolean
  creato_il: string
  proposta_id?: string | null // PROPOSTA: la proposta da correggere (punto oscuro, sconosciuto)
}

/** Correzioni del manager al contenuto di una proposta (PROPOSTA di contratto). */
export interface Modifiche {
  titolo?: string
  assegnatario_id?: string | null
  scadenza?: string | null
  valore?: string
}

export interface Risposta {
  esito: EsitoRisposta
  testo: string
  citazioni: Citazione[]
}

export interface TodoOggi {
  persona_id: string
  data: string
  accettata: boolean
  task: Task[]
}

export interface EsitoCaricamento {
  documento_id: string
  proposte: number
  avvisi: number
}

export interface PassoRegistro {
  id: number
  quando: string
  tipo: string
  attore: string
  step: string
  input: Record<string, unknown>
  output: Record<string, unknown>
  motivo: string | null
}
