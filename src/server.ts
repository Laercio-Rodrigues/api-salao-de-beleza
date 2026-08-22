import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import { ZodError } from 'zod'
import { authRoutes } from './modules/auth/auth.routes.js'
import { clientsRoutes } from './modules/clients/clients.routes.js'
import { professionalsRoutes } from './modules/professionals/professionals.routes.js'
import { servicesRoutes } from './modules/services/services.routes.js'
import { appointmentsRoutes } from './modules/appointments/appointments.routes.js'

const app = Fastify({ logger: true })

// app.register(cors, {
//   origin: process.env.FRONTEND_URL || 'http://localhost:5173',
// })

app.register(cors, {
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
})

app.setErrorHandler((error, request, reply) => {
  if (error instanceof ZodError) {
    return reply.status(400).send({
      message: 'Dados inválidos',
      issues: error.issues,
    })
  }

  app.log.error(error)
  return reply.status(500).send({ message: 'Erro interno do servidor' })
})

app.register(authRoutes)
app.register(clientsRoutes)
app.register(professionalsRoutes)
app.register(servicesRoutes)
app.register(appointmentsRoutes)

app.get('/health', async () => {
  return { status: 'ok' }
})

const PORT = Number(process.env.PORT) || 3333

app
  .listen({ port: PORT, host: '0.0.0.0' })
  .then(() => console.log(`Servidor rodando na porta ${PORT}`))
  .catch((err) => {
    app.log.error(err)
    process.exit(1)
  })
