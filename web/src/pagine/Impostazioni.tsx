import { LogOut, Palette, UserRound } from 'lucide-react'
import { SceltaTema } from '../componenti/Tema'
import { Avatar, Bottone, Card, ChipArea, IntestazioneCard, TitoloPagina } from '../componenti/ui'
import { useApp } from '../contesto'

/** Impostazioni di chi guarda: aspetto dell'interfaccia e profilo. */
export function Impostazioni() {
  const { io, progetti, esci } = useApp()
  return (
    <>
      <TitoloPagina titolo="Impostazioni" sottotitolo="Valgono solo per te, in questo browser." />
      <div className="grid max-w-3xl gap-6">
        <Card>
          <IntestazioneCard icona={Palette} titolo="Aspetto" sottotitolo="Chiaro, scuro, oppure come il sistema operativo." />
          <div className="p-5"><SceltaTema /></div>
        </Card>
        <Card>
          <IntestazioneCard icona={UserRound} titolo="Il tuo profilo" sottotitolo="L'identità arriva dalla sessione, mai dal testo di una domanda." />
          <div className="space-y-4 p-5">
            <div className="flex items-center gap-3">
              <Avatar persona={io} size={44} />
              <div>
                <p className="font-semibold">{io.nome}</p>
                <p className="text-sm text-testo-2">{io.ruolo}{io.reparto ? ` · ${io.reparto}` : ''}</p>
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs text-testo-2">Competenze: in ogni progetto vedi solo ciò che rientra qui</p>
              <div className="flex flex-wrap gap-1">{io.competenze.map((a) => <ChipArea key={a} area={a} />)}</div>
            </div>
            <p className="text-sm text-testo-2">Progetti a cui partecipi: <span className="font-semibold text-testo">{progetti.length}</span></p>
            <Bottone variante="secondario" icona={LogOut} onClick={esci}>Cambia persona</Bottone>
          </div>
        </Card>
      </div>
    </>
  )
}
