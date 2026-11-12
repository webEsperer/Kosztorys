// Zabezpieczenie przed „czarnym ekranem”: błąd w rysowaniu części widoku pokazuje komunikat zamiast
// wywracać całą aplikację. `resetKey` — zmiana (np. nowa wersja danych) ponawia próbę.

import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  resetKey?: unknown
  /** Krótki komunikat w miejscu elementu (wariant „mały”). */
  inline?: boolean
  /** Dodatkowa akcja w komunikacie, np. „Cofnij ostatnią zmianę”. */
  action?: { label: string; onClick: () => void }
}

interface State {
  error: Error | null
  key: unknown
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, key: undefined }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (props.resetKey !== state.key) return { key: props.resetKey, error: null }
    return null
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn('Błąd widoku:', error.message, info.componentStack?.split('\n')[1]?.trim())
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    if (this.props.inline) return <p className="calc todo-inline">Nie można policzyć: {error.message}</p>
    return (
      <div className="error-bar error-box">
        <p>
          <b>Nie udało się wyświetlić tego widoku.</b> {error.message}
        </p>
        <p className="small">Popraw ostatnio zmienioną wartość w „Dane projektu” albo cofnij zmianę.</p>
        {this.props.action && (
          <button className="btn" onClick={this.props.action.onClick}>
            {this.props.action.label}
          </button>
        )}
      </div>
    )
  }
}
