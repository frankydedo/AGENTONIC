// Ricerca delle persone all'ingresso: deve reggere migliaia di dipendenti.
import { ETICHETTE_AREA } from './componenti/ui'
import type { Persona } from './tipi'

const norma = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()

/** Punteggio di pertinenza: più basso è meglio; null se non corrisponde. */
function punteggio(p: Persona, q: string): number | null {
  const nome = norma(p.nome)
  if (nome.startsWith(q)) return 0                                   // «gi» → Giulia Ferraris
  if (nome.split(/\s+/).some((parola) => parola.startsWith(q))) return 1   // «fer» → Giulia Ferraris
  if (nome.includes(q)) return 2
  const altro = norma(`${p.ruolo} ${p.reparto ?? ''} ${p.alias.join(' ')} ${p.competenze.map((a) => `${a} ${ETICHETTE_AREA[a]}`).join(' ')}`)
  if (altro.split(/\s+/).some((parola) => parola.startsWith(q))) return 3  // «budget», «purchasing», «engineering»
  if (altro.includes(q)) return 4
  return null
}

/**
 * Le persone che corrispondono a `testo` (tutte le parole devono corrispondere), dalla più pertinente,
 * a parità in ordine alfabetico. Restituisce al massimo `max` risultati e quanti sono in tutto.
 */
export function cercaPersone(persone: Persona[], testo: string, max = 50): { risultati: Persona[]; totale: number } {
  const parole = norma(testo).split(/\s+/).filter(Boolean)
  if (parole.length === 0) return { risultati: [], totale: 0 }
  const trovate: [Persona, number][] = []
  for (const p of persone) {
    let somma = 0
    for (const q of parole) {
      const s = punteggio(p, q)
      if (s === null) { somma = -1; break }
      somma += s
    }
    if (somma >= 0) trovate.push([p, somma])
  }
  trovate.sort((a, b) => a[1] - b[1] || a[0].nome.localeCompare(b[0].nome, 'en'))
  return { risultati: trovate.slice(0, max).map(([p]) => p), totale: trovate.length }
}

// --- Persone usate di recente su questo dispositivo (solo comodità: può essere vuoto) --------------

const CHIAVE = 'company-brain-persone-recenti'

export function personeRecenti(): string[] {
  try { return JSON.parse(localStorage.getItem(CHIAVE) ?? '[]') } catch { return [] }
}

export function segnaPersona(id: string) {
  const lista = [id, ...personeRecenti().filter((x) => x !== id)].slice(0, 6)
  try { localStorage.setItem(CHIAVE, JSON.stringify(lista)) } catch { /* storage non disponibile */ }
}
