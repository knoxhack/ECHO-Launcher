import type { NativeDiagnosticExportResult } from '../types/native'
import { invokeNative, requireNative } from './nativeBridge'

export class DiagnosticReportService {
  async exportReport(profileId: string, installPath?: string): Promise<NativeDiagnosticExportResult> {
    requireNative()
    return invokeNative('diagnostic:export', { profileId, installPath })
  }
}

export const diagnosticReportService = new DiagnosticReportService()
