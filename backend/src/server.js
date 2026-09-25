import { createApp } from './app.js'
import { env } from './config/env.js'

const app = createApp()

const server = app.listen(env.PORT, () => {
  console.log(`Waka Coffee API listening on http://localhost:${env.PORT}/api/v1 (${env.NODE_ENV})`)
})

function shutdown(signal) {
  console.log(`${signal} received, closing server...`)
  server.close(() => process.exit(0))
  // Force-exit if connections do not drain in time.
  setTimeout(() => process.exit(1), 10_000).unref()
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason)
})
