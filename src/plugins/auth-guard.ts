import type { FastifyReply, FastifyRequest } from 'fastify'
import jwt from 'jsonwebtoken'

type Role = 'ADMIN' | 'ATTENDANT' | 'CLIENT'

interface TokenPayload {
  sub: string
  role: Role
}

type TokenResult = { payload: TokenPayload } | { error: string }

function readToken(request: FastifyRequest): TokenResult {
  const authHeader = request.headers.authorization

  if (!authHeader) {
    return { error: 'Token não enviado' }
  }

  const [, token] = authHeader.split(' ')

  if (!token) {
    return { error: 'Token mal formatado' }
  }

  try {
    return { payload: jwt.verify(token, process.env.JWT_SECRET as string) as TokenPayload }
  } catch {
    return { error: 'Token inválido ou expirado' }
  }
}

function guardFor(...allowedRoles: Role[]) {
  return async function guard(request: FastifyRequest, reply: FastifyReply) {
    const result = readToken(request)

    if ('error' in result) {
      return reply.status(401).send({ message: result.error })
    }

    if (!allowedRoles.includes(result.payload.role)) {
      return reply.status(403).send({ message: 'Acesso negado' })
    }

    request.user = result.payload
  }
}

// Seguro por padrão: o nome antigo continua valendo e agora exige EQUIPE.
// Assim, os módulos que já usam authGuard (clientes, profissionais, serviços,
// agendamentos) passam a recusar tokens de cliente sem precisar de nenhuma edição.
export const authGuard = guardFor('ADMIN', 'ATTENDANT')
export const adminGuard = guardFor('ADMIN')
export const customerGuard = guardFor('CLIENT')
// Qualquer pessoa logada (equipe ou cliente), ex.: trocar a própria senha.
export const anyUserGuard = guardFor('ADMIN', 'ATTENDANT', 'CLIENT')