import type { FastifyReply, FastifyRequest } from "fastify";
import jwt from "jsonwebtoken";

interface TokenPayload {
  sub: string;
  role: "ADMIN" | "ATTENDANT";
}

export async function authGuard(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;

  if (!authHeader) {
    return reply.status(401).send({ message: "Token não enviado" });
  }

  const [, token] = authHeader.split(" ");

  if (!token) {
    return reply.status(401).send({ message: "Token mal formatado" });
  }

  try {
    const payload = jwt.verify(
      token,
      process.env.JWT_SECRET as string,
    ) as TokenPayload;
    request.user = payload;
  } catch {
    return reply.status(401).send({ message: "Token inválido ou expirado" });
  }
}
