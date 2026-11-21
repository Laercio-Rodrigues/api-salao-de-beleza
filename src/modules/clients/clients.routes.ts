import type { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { authGuard } from '../../plugins/auth-guard.js'

const createClientSchema = z.object({
  name: z.string().min(2, 'Nome deve ter no mínimo 2 caracteres'),
  phone: z.string().min(8, 'Telefone inválido'),
  email: z.email('E-mail inválido').optional(),
  notes: z.string().optional(),
})

const updateClientSchema = createClientSchema.partial()

const paramsSchema = z.object({
  id: z.string(),
})

const resetPasswordSchema = z.object({
  password: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
})

// Só informa se a cliente tem conta no app/site (e qual e-mail usa para entrar).
const withAccount = { account: { select: { email: true } } } as const

// MongoDB não obriga um campo a existir em todo documento. Como "deletedAt"
// só é preenchido quando o registro é removido, clientes ativos podem tê-lo
// ausente (nunca gravado) OU explicitamente null. Esse filtro reconhece os dois casos.
const notDeletedFilter = {
  OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
}

export async function clientsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard)

  app.post('/clients', async (request, reply) => {
    const body = createClientSchema.parse(request.body)

    const client = await prisma.client.create({
      data: { ...body, deletedAt: null },
    })

    return reply.status(201).send(client)
  })

  app.get('/clients', async (request, reply) => {
    const clients = await prisma.client.findMany({
      where: notDeletedFilter,
      include: withAccount,
      orderBy: { name: 'asc' },
    })

    return reply.send(clients)
  })

  app.get('/clients/:id', async (request, reply) => {
    const { id } = paramsSchema.parse(request.params)

    const client = await prisma.client.findFirst({
      where: { id, ...notDeletedFilter },
    })

    if (!client) {
      return reply.status(404).send({ message: 'Cliente não encontrado' })
    }

    return reply.send(client)
  })

  app.put('/clients/:id', async (request, reply) => {
    const { id } = paramsSchema.parse(request.params)
    const body = updateClientSchema.parse(request.body)

    const client = await prisma.client.findFirst({
      where: { id, ...notDeletedFilter },
    })

    if (!client) {
      return reply.status(404).send({ message: 'Cliente não encontrado' })
    }

    const updated = await prisma.client.update({
      where: { id },
      data: body,
    })

    return reply.send(updated)
  })

  app.delete('/clients/:id', async (request, reply) => {
    const { id } = paramsSchema.parse(request.params)

    const client = await prisma.client.findFirst({
      where: { id, ...notDeletedFilter },
    })

    if (!client) {
      return reply.status(404).send({ message: 'Cliente não encontrado' })
    }

    await prisma.client.update({
      where: { id },
      data: { deletedAt: new Date() },
    })

    return reply.status(204).send()
  })

  // Cliente esqueceu a senha do app/site: a equipe define uma nova e passa para ela.
  app.patch('/clients/:id/password', async (request, reply) => {
    const { id } = paramsSchema.parse(request.params)
    const { password } = resetPasswordSchema.parse(request.body)

    const client = await prisma.client.findFirst({
      where: { id, ...notDeletedFilter },
      include: { account: true },
    })

    if (!client) {
      return reply.status(404).send({ message: 'Cliente não encontrado' })
    }

    if (!client.account) {
      return reply.status(400).send({ message: 'Esse cliente não tem conta no app/site' })
    }

    await prisma.clientAccount.update({
      where: { id: client.account.id },
      data: { passwordHash: await bcrypt.hash(password, 10) },
    })

    return reply.status(204).send()
  })
}
