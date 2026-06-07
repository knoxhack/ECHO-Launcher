import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RefreshCcw } from 'lucide-react'
import { CyberButton } from '../cyber/CyberButton'
import { GlassCard } from '../cyber/GlassCard'

interface RuntimeErrorBoundaryProps {
  children: ReactNode
}

interface RuntimeErrorBoundaryState {
  error: Error | null
  detail: string
}

export class RuntimeErrorBoundary extends Component<RuntimeErrorBoundaryProps, RuntimeErrorBoundaryState> {
  state: RuntimeErrorBoundaryState = {
    error: null,
    detail: '',
  }

  static getDerivedStateFromError(error: Error): RuntimeErrorBoundaryState {
    return { error, detail: '' }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({
      error,
      detail: info.componentStack ?? '',
    })
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <main className="relative min-h-screen overflow-hidden bg-[#020711] p-8 text-white">
        <div className="cyber-grid fixed inset-0 opacity-70" />
        <div className="relative z-10 mx-auto flex min-h-[calc(100vh-4rem)] max-w-4xl items-center">
          <GlassCard tone="danger">
            <div className="flex items-start gap-4">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-danger-echo/50 bg-danger-echo/10 text-red-100">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase text-danger-echo">Renderer Recovery</p>
                <h1 className="mt-1 text-2xl font-semibold text-white">ECHO Launcher hit a UI error</h1>
                <p className="mt-3 text-sm leading-6 text-slate-300">
                  The app stayed open and caught the crash instead of leaving a blank blue screen.
                </p>
                <div className="mt-4 rounded-lg border border-danger-echo/30 bg-black/35 p-3 font-mono text-xs leading-5 text-red-100">
                  {this.state.error.message}
                </div>
                {this.state.detail ? (
                  <pre className="mt-3 max-h-48 overflow-auto rounded-lg border border-cyan-soft/20 bg-black/30 p-3 text-xs leading-5 text-slate-300">
                    {this.state.detail}
                  </pre>
                ) : null}
                <CyberButton className="mt-5" icon={RefreshCcw} onClick={() => window.location.reload()} variant="primary">
                  Reload Launcher
                </CyberButton>
              </div>
            </div>
          </GlassCard>
        </div>
      </main>
    )
  }
}
