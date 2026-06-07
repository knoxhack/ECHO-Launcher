import { FileWarning, Wrench } from 'lucide-react'
import type { CrashAnalysis } from '../../types/diagnostics'
import { CyberButton } from './CyberButton'
import { GlassCard } from './GlassCard'

interface CrashAnalyzerCardProps {
  analysis: CrashAnalysis
  onRepair: () => void
  onOpenLog: () => void
}

export function CrashAnalyzerCard({ analysis, onRepair, onOpenLog }: CrashAnalyzerCardProps) {
  return (
    <GlassCard tone={analysis.severity === 'Critical' ? 'danger' : 'amber'}>
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-danger-echo/40 bg-danger-echo/10 text-red-100">
          <FileWarning className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-white">{analysis.title}</h3>
            <span className="rounded-full border border-danger-echo/50 bg-danger-echo/10 px-2 py-0.5 text-xs font-semibold text-red-100">
              {analysis.severity}
            </span>
          </div>
          <div className="mt-4 grid gap-3 text-sm text-slate-300 md:grid-cols-2">
            <div>
              <p className="text-slate-500">Likely Cause</p>
              <p className="mt-1 text-white">{analysis.likelyCause}</p>
            </div>
            <div>
              <p className="text-slate-500">Suggested Fix</p>
              <p className="mt-1 text-white">{analysis.suggestedFix}</p>
            </div>
          </div>
          {analysis.signatures?.length ? (
            <div className="mt-4 space-y-2">
              {analysis.signatures.slice(0, 3).map((signature) => (
                <div className="rounded-lg border border-cyan-soft/20 bg-black/30 p-3 text-xs text-slate-300" key={signature.id}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-white">{signature.label}</span>
                    <span className="text-cyan-soft">{Math.round(signature.confidence * 100)}%</span>
                  </div>
                  <p className="mt-2">{signature.evidence[0]}</p>
                </div>
              ))}
            </div>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <CyberButton icon={Wrench} onClick={onRepair} size="sm" variant="danger">
              Repair Now
            </CyberButton>
            <CyberButton icon={FileWarning} onClick={onOpenLog} size="sm" variant="ghost">
              Open Crash Log
            </CyberButton>
          </div>
        </div>
      </div>
    </GlassCard>
  )
}
