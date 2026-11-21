import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { notDeletedFilter } from '../../lib/filters.js'
import { findBusyIntervals } from '../../lib/availability.js'
import { closedWeekdays, computeSlots, isClosedDay } from '../../lib/scheduling.js'

const availabilityQuerySchema = z.object({
  professionalId: z.string(),
  serviceId: z.string(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (use AAAA-MM-DD)')
    .refine(
      (value) => !Number.isNaN(new Date(`${value}T00:00:00-03:00`).getTime()),
      'Data inválida',
    ),
})

// Rotas abertas (sem login) usadas pelo site público: vitrine e horários livres.
// Nunca devolvem dados de clientes ou de agendamentos de terceiros.
export async function publicRoutes(app: FastifyInstance) {
  app.get('/public/info', async (_request, reply) => {
    return reply.send({ closedWeekdays: closedWeekdays() })
  })

  app.get('/public/services', async (_request, reply) => {
    const services = await prisma.service.findMany({
      where: notDeletedFilter,
      select: { id: true, name: true, durationMin: true, price: true },
      orderBy: { name: 'asc' },
    })

    return reply.send(services)
  })

  app.get('/public/professionals', async (_request, reply) => {
    const professionals = await prisma.professional.findMany({
      where: notDeletedFilter,
      select: { id: true, name: true, specialties: true },
      orderBy: { name: 'asc' },
    })

    return reply.send(professionals)
  })

  app.get('/public/availability', async (request, reply) => {
    const query = availabilityQuerySchema.parse(request.query)

    const [professional, service] = await Promise.all([
      prisma.professional.findFirst({ where: { id: query.professionalId, ...notDeletedFilter } }),
      prisma.service.findFirst({ where: { id: query.serviceId, ...notDeletedFilter } }),
    ])

    if (!professional) {
      return reply.status(404).send({ message: 'Profissional não encontrado' })
    }

    if (!service) {
      return reply.status(404).send({ message: 'Serviço não encontrado' })
    }

    if (isClosedDay(query.date)) {
      return reply.send({ slots: [] })
    }

    const busy = await findBusyIntervals(professional.id, query.date)

    const slots = computeSlots({
      dateString: query.date,
      workStart: professional.workStart,
      workEnd: professional.workEnd,
      durationMin: service.durationMin,
      busy,
      now: new Date(),
    })

    return reply.send({ slots: slots.map((slot) => slot.toISOString()) })
  })
}
