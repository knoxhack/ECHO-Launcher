import { create } from 'zustand'

interface DiagnosticsStore {
  repairProgress: number
  repairActive: boolean
  verifyProgress: number
  verifyActive: boolean
  currentFile: string
  scannedFiles: number
  totalFiles: number
  errorsFound: number
  startRepair: () => void
  tickRepair: () => void
  finishRepair: () => void
  startVerification: () => void
  tickVerification: () => void
  finishVerification: (summary: { scanned: number; total: number; errors: number; currentFile?: string }) => void
}

export const useDiagnosticsStore = create<DiagnosticsStore>()((set) => ({
  repairProgress: 0,
  repairActive: false,
  verifyProgress: 0,
  verifyActive: false,
  currentFile: 'verification not run',
  scannedFiles: 0,
  totalFiles: 0,
  errorsFound: 0,
  startRepair: () => set({ repairProgress: 0, repairActive: true }),
  tickRepair: () =>
    set((state) => {
      const repairProgress = Math.min(state.repairProgress + 8, 100)
      return { repairProgress, repairActive: repairProgress < 100 }
    }),
  finishRepair: () => set({ repairProgress: 100, repairActive: false }),
  startVerification: () =>
    set({
      verifyProgress: 0,
      verifyActive: true,
      currentFile: 'manifest verification running',
      scannedFiles: 0,
      totalFiles: 0,
      errorsFound: 0,
    }),
  tickVerification: () =>
    set((state) => {
      const verifyProgress = Math.min(state.verifyProgress + 6, 100)
      const scannedFiles = Math.min(state.scannedFiles + 360, state.totalFiles)
      return {
        verifyProgress,
        scannedFiles,
        currentFile: 'manifest verification running',
        verifyActive: verifyProgress < 100,
      }
    }),
  finishVerification: ({ scanned, total, errors, currentFile }) =>
    set({
      verifyProgress: 100,
      verifyActive: false,
      scannedFiles: scanned,
      totalFiles: total,
      errorsFound: errors,
      currentFile: currentFile ?? 'manifest verification complete',
    }),
}))
