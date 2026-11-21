// Aspetto dell'interfaccia: automatico (segue il sistema), chiaro o scuro.
// La scelta resta nel browser di chi guarda; index.html la applica prima del primo disegno.

export type Tema = 'auto' | 'chiaro' | 'scuro'

const CHIAVE = 'company-brain-tema'
const scuroDiSistema = () => window.matchMedia('(prefers-color-scheme: dark)').matches

export function leggiTema(): Tema {
  try {
    const v = localStorage.getItem(CHIAVE)
    return v === 'chiaro' || v === 'scuro' ? v : 'auto'
  } catch {
    return 'auto'
  }
}

export function applicaTema(t: Tema) {
  const scuro = t === 'scuro' || (t === 'auto' && scuroDiSistema())
  document.documentElement.dataset.theme = scuro ? 'dark' : 'light'
}

export function salvaTema(t: Tema) {
  try {
    if (t === 'auto') localStorage.removeItem(CHIAVE)
    else localStorage.setItem(CHIAVE, t)
  } catch { /* storage non disponibile: vale solo per questa visita */ }
  applicaTema(t)
}

/** In automatico, segue il sistema anche quando cambia mentre la pagina è aperta. */
export function seguiSistema(): () => void {
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const cambia = () => { if (leggiTema() === 'auto') applicaTema('auto') }
  mq.addEventListener('change', cambia)
  return () => mq.removeEventListener('change', cambia)
}
