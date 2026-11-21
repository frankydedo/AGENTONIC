import { Component, type ReactNode } from 'react'

/** Se un widget va in errore, mostra un avviso al suo posto invece di svuotare tutta la pagina. */
export class Protezione extends Component<{ nome: string; children: ReactNode }, { errore: string | null }> {
  state = { errore: null as string | null }

  static getDerivedStateFromError(e: Error) {
    return { errore: e.message }
  }

  render() {
    if (this.state.errore) {
      return (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-medium">Il pannello «{this.props.nome}» ha avuto un problema.</p>
          <p className="mt-1 font-mono text-xs">{this.state.errore}</p>
          <button onClick={() => this.setState({ errore: null })} className="mt-2 text-xs font-medium underline">
            Riprova
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
