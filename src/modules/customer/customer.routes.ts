import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { notDeletedFilter } from '../../lib/filters.js'
import { hasConflict } from '../../lib/availability.js'
import { isClosedDay, isWithinWorkHours } from '../../lib/scheduling.js'
import { toBrazilDateString } from '../../lib/time.js'
import { customerGuard } from '../../plugins/auth-guard.js'

const bookingSchema = z.object({
  professionalId: z.string(),
  serviceId: z.string(),
  date: z.iso.datetime({ offset: true }),
})

const paramsSchema = z.object({
  id: z.string(),
})

const profileSchema = z.object({
  name: z.string().trim().min(2, 'Nome deve ter no mínimo 2 caracteres'),
  phone: z.string().trim().min(8, 'Telefone inválido'),
})

const profileSelect = { id: true, name: true, phone: true, email: true } as const

export async function customerRoutes(app: FastifyInstance) {
  app.addHook('preHandler', customerGuard)

  app.get('/customer/me', async (request, reply) => {
    const client = await prisma.client.findFirst({
      where: { id: request.user!.sub, ...notDeletedFilter },
      select: profileSelect,
    })

    if (!client) {
      return reply.status(401).send({ message: 'Conta não encontrada' })
    }

    return reply.send(client)
  })

  // A cliente pode ajustar nome e telefone. O e-mail é o login e não muda por aqui.
  app.put('/customer/me', async (request, reply) => {
    const body = profileSchema.parse(request.body)

    const client = await prisma.client.findFirst({
      where: { id: request.user!.sub, ...notDeletedFilter },
    })

    if (!client) {
      return reply.status(401).send({ message: 'Conta não encontrada' })
    }

    const updated = await prisma.client.update({
      where: { id: client.id },
      data: body,
      select: profileSelect,
    })

    return reply.send(updated)
  })

  app.get('/customer/appointments', async (request, reply) => {
    const appointments = await prisma.appointment.findMany({
      where: { clientId: request.user!.sub, ...notDeletedFilter },
      include: {
        professional: { select: { id: true, name: true } },
        service: { select: { id: true, name: true, durationMin: true, price: true } },
      },
      orderBy: { date: 'desc' },
    })

    return reply.send(appointments)
  })

  app.post('/customer/appointments', async (request, reply) => {
    const body = bookingSchema.parse(request.body)
    const clientId = request.user!.sub

    const [client, professional, service] = await Promise.all([
      prisma.client.findFirst({ where: { id: clientId, ...notDeletedFilter } }),
      prisma.professional.findFirst({ where: { id: body.professionalId, ...notDeletedFilter } }),
      prisma.service.findFirst({ where: { id: body.serviceId, ...notDeletedFilter } }),
    ])

    if (!client) {
      return reply.status(401).send({ message: 'Conta não encontrada' })
    }

    if (!professional) {
      return reply.status(404).send({ message: 'Profissional não encontrado' })
    }

    if (!service) {
      return reply.status(404).send({ message: 'Serviço não encontrado' })
    }

    const start = new Date(body.date)

    if (start <= new Date()) {
      return reply.status(400).send({ message: 'Escolha um horário futuro' })
    }

    if (isClosedDay(toBrazilDateString(start))) {
      return reply.status(400).send({ message: 'O salão não abre nesse dia' })
    }

    if (!isWithinWorkHours(start, service.durationMin, professional.workStart, professional.workEnd)) {
      return reply.status(400).send({ message: 'Horário fora do expediente do profissional' })
    }

    const end = new Date(start.getTime() + service.durationMin * 60000)

    if (await hasConflict(professional.id, start, end)) {
      return reply.status(409).send({ message: 'Esse horário acabou de ser ocupado' })
    }

    const appointment = await prisma.appointment.create({
      data: {
        date: start,
        clientId,
        professionalId: professional.id,
        serviceId: service.id,
        deletedAt: null,
      },
    })

    return reply.status(201).send(appointment)
  })

  app.patch('/customer/appointments/:id/cancel', async (request, reply) => {
    const { id } = paramsSchema.parse(request.params)

    const appointment = await prisma.appointment.findFirst({
      where: { id, clientId: request.user!.sub, ...notDeletedFilter },
    })

    if (!appointment) {
      return reply.status(404).send({ message: 'Agendamento não encontrado' })
    }

    if (appointment.status !== 'SCHEDULED') {
      return reply.status(400).send({ message: 'Só é possível cancelar agendamentos em aberto' })
    }

    if (appointment.date <= new Date()) {
      return reply.status(400).send({ message: 'Esse horário já passou. Fale com o salão.' })
    }

    const updated = await prisma.appointment.update({
      where: { id },
      data: { status: 'CANCELED' },
    })

    return reply.send(updated)
  })
}