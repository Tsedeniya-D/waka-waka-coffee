import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import morgan from 'morgan'
import { env, isProduction, isTest } from './config/env.js'
import routes from './routes/index.js'
import { requestId, apiLimiter } from './middleware/security.js'
import { notFound, errorHandler } from './middleware/errorHandler.js'
import { AppError } from './utils/AppError.js'

export function createApp() {
  const app = express()

  app.disable('x-powered-by')
  if (env.TRUST_PROXY) app.set('trust proxy', env.TRUST_PROXY)

  app.use(requestId)
  app.use(helmet())
  app.use(
    cors({
      origin(origin, cb) {
        // Non-browser clients (curl, server-to-server) send no Origin header.
        if (!origin || env.CORS_ORIGINS.includes(origin)) return cb(null, true)
        cb(new AppError(403, `Origin ${origin} is not allowed.`, { code: 'CORS_REJECTED' }))
      },
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id', 'X-Total-Count'],
      maxAge: 600,
    })
  )
  app.use(express.json({ limit: '1mb' }))

  if (!isTest) {
    morgan.token('id', (req) => req.id)
    app.use(morgan(isProduction ? ':id :remote-addr :method :url :status :response-time ms' : 'dev'))
  }

  app.use('/api/v1', apiLimiter, routes)

  app.use(notFound)
  app.use(errorHandler)

  return app
}
