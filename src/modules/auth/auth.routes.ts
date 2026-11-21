import type { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { anyUserGuard } from '../../plugins/auth-guard.js'

type SessionRole = 'ADMIN' | 'ATTENDANT' | 'CLIENT'

const email = z.email('E-mail inválido').transform((value) => value.toLowerCase())

const loginSchema = z.object({
  email,
  password: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
})

const registerSchema = z.object({
  name: z.string().min(2, 'Nome deve ter no mínimo 2 caracteres'),
  phone: z.string().min(8, 'Telefone inválido'),
  email,
  password: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
})

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Informe a senha atual'),
  newPassword: z.string().min(6, 'A nova senha deve ter no mínimo 6 caracteres'),
})

function createSession(id: string, name: string, role: SessionRole) {
  const expiresIn = role === 'CLIENT' ? '7d' : '8h'

  const token = jwt.sign({ sub: id, role }, process.env.JWT_SECRET as string, {
    expiresIn,
  })

  return { token, user: { id, name, role } }
}

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/login', async (request, reply) => {
    const body = loginSchema.parse(request.body)
    const invalid = () => reply.status(401).send({ message: 'Credenciais inválidas' })

    const staff = await prisma.user.findUnique({ where: { email: body.email } })

    if (staff && !staff.deletedAt) {
      const matches = await bcrypt.compare(body.password, staff.password)

      if (!matches) {
        return invalid()
      }

      return reply.send(createSession(staff.id, staff.name, staff.role))
    }

    const account = await prisma.clientAccount.findUnique({
      where: { email: body.email },
      include: { client: true },
    })

    if (!account || account.client.deletedAt) {
      return invalid()
    }

    const matches = await bcrypt.compare(body.password, account.passwordHash)

    if (!matches) {
      return invalid()
    }

    return reply.send(createSession(account.client.id, account.client.name, 'CLIENT'))
  })

  app.post('/auth/register', async (request, reply) => {
    const body = registerSchema.parse(request.body)

    const [staff, account] = await Promise.all([
      prisma.user.findUnique({ where: { email: body.email } }),
      prisma.clientAccount.findUnique({ where: { email: body.email } }),
    ])

    if (staff || account) {
      return reply.status(409).send({ message: 'E-mail já cadastrado' })
    }

    const passwordHash = await bcrypt.hash(body.password, 10)

    const created = await prisma.clientAccount.create({
      data: {
        email: body.email,
        passwordHash,
        client: {
          create: {
            name: body.name,
            phone: body.phone,
            email: body.email,
            deletedAt: null,
          },
        },
      },
      include: { client: true },
    })

    return reply.status(201).send(createSession(created.client.id, created.client.name, 'CLIENT'))
  })

  // Troca a própria senha (equipe ou cliente), confirmando a senha atual.
  app.patch('/auth/password', { preHandler: anyUserGuard }, async (request, reply) => {
    const body = changePasswordSchema.parse(request.body)
    const { sub, role } = request.user!
    const wrongPassword = () => reply.status(400).send({ message: 'Senha atual incorreta' })
    const newHash = await bcrypt.hash(body.newPassword, 10)

    if (role === 'CLIENT') {
      const account = await prisma.clientAccount.findUnique({ where: { clientId: sub } })

      if (!account) {
        return reply.status(404).send({ message: 'Conta não encontrada' })
      }

      if (!(await bcrypt.compare(body.currentPassword, account.passwordHash))) {
        return wrongPassword()
      }

      await prisma.clientAccount.update({ where: { id: account.id }, data: { passwordHash: newHash } })
      return reply.status(204).send()
    }

    const staff = await prisma.user.findUnique({ where: { id: sub } })

    if (!staff || staff.deletedAt) {
      return reply.status(404).send({ message: 'Usuário não encontrado' })
    }

    if (!(await bcrypt.compare(body.currentPassword, staff.password))) {
      return wrongPassword()
    }

    await prisma.user.update({ where: { id: staff.id }, data: { password: newHash } })
    return reply.status(204).send()
  })
}