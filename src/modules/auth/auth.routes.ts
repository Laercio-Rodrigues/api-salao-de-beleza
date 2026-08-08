import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";

const loginSchema = z.object({
    email: z.email("E-mail inválido"),
    password: z.string().min(6, "A senha deve ter no mínimo 6 caracteres"),
});

export async function authRoutes(app: FastifyInstance) {
    app.post("/auth/login", async (request, reply) => {
        const body = loginSchema.parse(request.body);

        const user = await prisma.user.findUnique({
            where: { email: body.email },
        });

        if (!user || user.deletedAt) {
            return reply.status(401).send({ message: "Credenciais inválidas" });
        }

        const passwordMatches = await bcrypt.compare(body.password, user.password);

        if (!passwordMatches) {
            return reply.status(401).send({ message: "Credenciais inválidas" });
        }

        const token = jwt.sign(
            {
                sub: user.id,
                role: user.role,
            },
            process.env.JWT_SECRET as string,
            {
                expiresIn: "8h",
            },
        );

        return reply.send({
            token,
            user: {
                id: user.id,
                name: user.name,
                role: user.role
            }
        })
    });
}
