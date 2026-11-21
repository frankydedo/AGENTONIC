import { LogOut, Palette, UserRound } from 'lucide-react'
import { SceltaTema } from '../componenti/Tema'
import { Avatar, Bottone, Card, ChipArea, IntestazioneCard, TitoloPagina } from '../componenti/ui'
import { useApp } from '../contesto'

/** Impostazioni di chi guarda: aspetto dell'interfaccia e profilo. */
export function Impostazioni() {
  const { io, progetti, esci } = useApp()
  return (
    <>
      <TitoloPagina titolo="Settings" sottotitolo="They apply only to you, in this browser." />
      <div className="grid max-w-3xl gap-6">
        <Card>
          <IntestazioneCard icona={Palette} titolo="Appearance" sottotitolo="Light, dark, or the same as your operating system." />
          <div className="p-5"><SceltaTema /></div>
        </Card>
        <Card>
          <IntestazioneCard icona={UserRound} titolo="Your profile" sottotitolo="Your identity comes from the session, never from the text of a question." />
          <div className="space-y-4 p-5">
            <div className="flex items-center gap-3">
              <Avatar persona={io} size={44} />
              <div>
                <p className="font-semibold">{io.nome}</p>
                <p className="text-sm text-testo-2">{io.ruolo}{io.reparto ? ` · ${io.reparto}` : ''}</p>
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs text-testo-2">Areas: in every project you only see what falls within them</p>
              <div className="flex flex-wrap gap-1">{io.competenze.map((a) => <ChipArea key={a} area={a} />)}</div>
            </div>
            <p className="text-sm text-testo-2">Projects you’re part of: <span className="font-semibold text-testo">{progetti.length}</span></p>
            <Bottone variante="secondario" icona={LogOut} onClick={esci}>Cambia persona</Bottone>
          </div>
        </Card>
      </div>
    </>
  )
}
