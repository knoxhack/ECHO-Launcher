export interface ServerExportPlan {
  profileId: string
  estimatedSizeMb: number
  requiredJava: string
  neoforgeVersion: string
  files: string[]
  warnings: string[]
}
