import type { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { notDeletedFilter } from '../../lib/filters.js'
import { adminGuard } from '../../plugins/auth-guard.js'

// Contas de acesso da equipe (painel e app). Só ADMIN gerencia.

const email = z.email('E-mail inválido').transform((value) => value.toLowerCase())
const role = z.enum(['ADMIN', 'ATTENDANT'])

const createUserSchema = z.object({
  name: z.string().trim().min(2, 'Nome deve ter no mínimo 2 caracteres'),
  email,
  password: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
  role,
})

// Senha aqui é opcional: preenchida = redefinir a senha da pessoa.
const updateUserSchema = z.object({
  name: z.string().trim().min(2, 'Nome deve ter no mínimo 2 caracteres').optional(),
  email: email.optional(),
  password: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres').optional(),
  role: role.optional(),
})

const paramsSchema = z.object({
  id: z.string(),
})

const publicFields = { id: true, name: true, email: true, role: true, createdAt: true } as const

async function countOtherAdmins(exceptId: string) {
  return prisma.user.count({
    where: { role: 'ADMIN', id: { not: exceptId }, ...notDeletedFilter },
  })
}

// E-mail é o login: não pode repetir entre equipe e clientes.
async function emailInUse(value: string, exceptUserId?: string) {
  const [staff, account] = await Promise.all([
    prisma.user.findUnique({ where: { email: value } }),
    prisma.clientAccount.findUnique({ where: { email: value } }),
  ])

  return !!account || (!!staff && staff.id !== exceptUserId && !staff.deletedAt)
}

export async function usersRoutes(app: FastifyInstance) {
  app.addHook('preHandler', adminGuard)

  app.get('/users', async (_request, reply) => {
    const users = await prisma.user.findMany({
      where: notDeletedFilter,
      select: publicFields,
      orderBy: { name: 'asc' },
    })

    return reply.send(users)
  })

  app.post('/users', async (request, reply) => {
    const body = createUserSchema.parse(request.body)

    if (await emailInUse(body.email)) {
      return reply.status(409).send({ message: 'E-mail já cadastrado' })
    }

    const password = await bcrypt.hash(body.password, 10)
    const removed = await prisma.user.findUnique({ where: { email: body.email } })

    // O e-mail é único no banco: se a pessoa já foi removida, reativa a mesma conta.
    const user = removed
      ? await prisma.user.update({
          where: { id: removed.id },
          data: { name: body.name, role: body.role, password, deletedAt: null },
          select: publicFields,
        })
      : await prisma.user.create({
          data: { name: body.name, email: body.email, role: body.role, password, deletedAt: null },
          select: publicFields,
        })

    return reply.status(201).send(user)
  })

  app.put('/users/:id', async (request, reply) => {
    const { id } = paramsSchema.parse(request.params)
    const body = updateUserSchema.parse(request.body)

    const user = await prisma.user.findFirst({ where: { id, ...notDeletedFilter } })

    if (!user) {
      return reply.status(404).send({ message: 'Usuário não encontrado' })
    }

    if (body.role && body.role !== user.role) {
      if (id === request.user!.sub) {
        return reply.status(400).send({ message: 'Você não pode mudar o seu próprio perfil' })
      }

      if (user.role === 'ADMIN' && (await countOtherAdmins(id)) === 0) {
        return reply.status(400).send({ message: 'É preciso manter pelo menos um administrador' })
      }
    }

    if (body.email && body.email !== user.email && (await emailInUse(body.email, id))) {
      return reply.status(409).send({ message: 'E-mail já cadastrado' })
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        name: body.name,
        email: body.email,
        role: body.role,
        password: body.password ? await bcrypt.hash(body.password, 10) : undefined,
      },
      select: publicFields,
    })

    return reply.send(updated)
  })

  app.delete('/users/:id', async (request, reply) => {
    const { id } = paramsSchema.parse(request.params)

    if (id === request.user!.sub) {
      return reply.status(400).send({ message: 'Você não pode remover a sua própria conta' })
    }

    const user = await prisma.user.findFirst({ where: { id, ...notDeletedFilter } })

    if (!user) {
      return reply.status(404).send({ message: 'Usuário não encontrado' })
    }

    if (user.role === 'ADMIN' && (await countOtherAdmins(id)) === 0) {
      return reply.status(400).send({ message: 'É preciso manter pelo menos um administrador' })
    }

    await prisma.user.update({ where: { id }, data: { deletedAt: new Date() } })

    return reply.status(204).send()
  })
}
