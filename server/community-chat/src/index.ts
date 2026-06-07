import { loadConfig } from './config/env.js'
import { createChatApp } from './http/app.js'
import { MemoryChatRepository } from './repositories/MemoryChatRepository.js'
import { PostgresChatRepository } from './repositories/PostgresChatRepository.js'

const config = loadConfig()
const repository = config.databaseUrl ? new PostgresChatRepository(config.databaseUrl) : new MemoryChatRepository()
const chatApp = await createChatApp({ config, repository, logger: true })

try {
  await chatApp.app.listen({ host: config.host, port: config.port })
} catch (error) {
  chatApp.app.log.error(error)
  await chatApp.close()
  process.exit(1)
}

const shutdown = async () => {
  await chatApp.close()
  process.exit(0)
}

process.on('SIGINT', () => void shutdown())
process.on('SIGTERM', () => void shutdown())
