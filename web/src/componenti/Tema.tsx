import { Moon, Sun, SunMoon } from 'lucide-react'
import { useState } from 'react'
import { leggiTema, salvaTema, type Tema } from '../tema'
import { Segmentato } from './ui'

const OPZIONI = [['auto', 'Auto', SunMoon], ['chiaro', 'Light', Sun], ['scuro', 'Dark', Moon]] as const

/** Aspetto dell'interfaccia: segue il sistema, oppure sempre chiaro o sempre scuro. */
export function SceltaTema({ piccolo }: { piccolo?: boolean }) {
  const [tema, setTema] = useState<Tema>(leggiTema)
  return (
    <Segmentato etichetta="Appearance" valore={tema} opzioni={OPZIONI} piccolo={piccolo}
      onCambia={(t) => { setTema(t); salvaTema(t) }} />
  )
}
