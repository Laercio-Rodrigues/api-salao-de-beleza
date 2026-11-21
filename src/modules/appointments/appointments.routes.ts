import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { authGuard } from '../../plugins/auth-guard.js'
import { hasConflict } from '../../lib/availability.js'
import { brazilDayRange } from '../../lib/time.js'

const createAppointmentSchema = z.object({
  date: z.iso.datetime({ offset: true }),
  clientId: z.string(),
  professionalId: z.string(),
  serviceId: z.string(),
})

const updateStatusSchema = z.object({
  status: z.enum(['SCHEDULED', 'DONE', 'CANCELED']),
})

const listQuerySchema = z.object({
  date: z.string().optional(),
})

const paramsSchema = z.object({
  id: z.string(),
})

const notDeletedFilter = {
  OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
}

export async function appointmentsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard)

  app.post('/appointments', async (request, reply) => {
    const body = createAppointmentSchema.parse(request.body)

    const [client, professional, service] = await Promise.all([
      prisma.client.findFirst({ where: { id: body.clientId, ...notDeletedFilter } }),
      prisma.professional.findFirst({
        where: { id: body.professionalId, ...notDeletedFilter },
      }),
      prisma.service.findFirst({ where: { id: body.serviceId, ...notDeletedFilter } }),
    ])

    if (!client) {
      return reply.status(404).send({ message: 'Cliente não encontrado' })
    }

    if (!professional) {
      return reply.status(404).send({ message: 'Profissional não encontrado' })
    }

    if (!service) {
      return reply.status(404).send({ message: 'Serviço não encontrado' })
    }

    const start = new Date(body.date)
    const end = new Date(start.getTime() + service.durationMin * 60000)

    const conflict = await hasConflict(body.professionalId, start, end)

    if (conflict) {
      return reply
        .status(409)
        .send({ message: 'Profissional já possui agendamento nesse horário' })
    }

    const appointment = await prisma.appointment.create({
      data: {
        date: start,
        clientId: body.clientId,
        professionalId: body.professionalId,
        serviceId: body.serviceId,
        deletedAt: null,
      },
    })

    return reply.status(201).send(appointment)
  })

  app.get('/appointments', async (request, reply) => {
    const query = listQuerySchema.parse(request.query)

    const where: Record<string, unknown> = { ...notDeletedFilter }

    if (query.date) {
      const { dayStart, dayEnd } = brazilDayRange(query.date)
      where.date = { gte: dayStart, lte: dayEnd }
    }

    const appointments = await prisma.appointment.findMany({
      where,
      include: { client: true, professional: true, service: true },
      orderBy: { date: 'asc' },
    })

    return reply.send(appointments)
  })

  app.get('/appointments/:id', async (request, reply) => {
    const { id } = paramsSchema.parse(request.params)

    const appointment = await prisma.appointment.findFirst({
      where: { id, ...notDeletedFilter },
      include: { client: true, professional: true, service: true },
    })

    if (!appointment) {
      return reply.status(404).send({ message: 'Agendamento não encontrado' })
    }

    return reply.send(appointment)
  })

  app.patch('/appointments/:id/status', async (request, reply) => {
    const { id } = paramsSchema.parse(request.params)
    const { status } = updateStatusSchema.parse(request.body)

    const appointment = await prisma.appointment.findFirst({
      where: { id, ...notDeletedFilter },
    })

    if (!appointment) {
      return reply.status(404).send({ message: 'Agendamento não encontrado' })
    }

    const updated = await prisma.appointment.update({
      where: { id },
      data: { status },
    })

    return reply.send(updated)
  })

  app.delete('/appointments/:id', async (request, reply) => {
    const { id } = paramsSchema.parse(request.params)

    const appointment = await prisma.appointment.findFirst({
      where: { id, ...notDeletedFilter },
    })

    if (!appointment) {
      return reply.status(404).send({ message: 'Agendamento não encontrado' })
    }

    await prisma.appointment.update({
      where: { id },
      data: { deletedAt: new Date() },
    })

    return reply.status(204).send()
  })
}
