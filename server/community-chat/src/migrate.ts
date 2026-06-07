import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Pool } from 'pg'
import { loadConfig } from './config/env.js'

const config = loadConfig()
if (!config.databaseUrl) {
  throw new Error('DATABASE_URL is required to run chat migrations.')
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = path.join(root, 'migrations')
const pool = new Pool({ connectionString: config.databaseUrl })

try {
  const files = (await fs.readdir(migrationsDir)).filter((file) => file.endsWith('.sql')).sort()
  for (const file of files) {
    const sql = await fs.readFile(path.join(migrationsDir, file), 'utf8')
    await pool.query(sql)
    console.log(`applied ${file}`)
  }
} finally {
  await pool.end()
}
