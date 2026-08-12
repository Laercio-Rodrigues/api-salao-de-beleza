import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { authGuard } from "../../plugins/auth-guard.js";

const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Horário inválido (use HH:MM)')

const createProfessionalSchema = z.object({
  name: z.string().min(2, 'Nome deve ter no mínimo 2 caracteres'),
  specialties: z.array(z.string()).optional().default([]),
  workStart: timeSchema,
  workEnd: timeSchema,
})

const updateProfessionalSchema = createProfessionalSchema.partial()

const paramsSchema = z.object({
  id: z.string(),
})

const notDeletedFilter = {
    OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
};

export async function professionalsRoutes(app: FastifyInstance) {
    app.addHook("preHandler", authGuard);

    // CREATE professional
    app.post("/professionals", async (request, reply) => {
        const body = createProfessionalSchema.parse(request.body);

        const professional = await prisma.professional.create({
            data: { ...body, deletedAt: null },
        });

        return reply.status(201).send(professional);
    });

    // LIST professionals
    app.get("/professionals", async (request, reply) => {
        const professionals = await prisma.professional.findMany({
            where: notDeletedFilter,
            orderBy: { name: "asc" },
        });

        return reply.send(professionals);
    });

    // BUSCAR professional ESPECIFICADO
    app.get("/professionals/:id", async (request, reply) => {
        const { id } = paramsSchema.parse(request.params);

        const professional = await prisma.professional.findFirst({
            where: { id, ...notDeletedFilter },
        });

        if (!professional) {
            return reply.status(404).send({ message: "Profissional não encontrado" });
        }

        return reply.send(professional);
    });

    // ATUALIZAR professional
    app.put("/professionals/:id", async (request, reply) => {
        const { id } = paramsSchema.parse(request.params);
        const body = updateProfessionalSchema.parse(request.body);

        const professional = await prisma.professional.findFirst({
            where: { id, ...notDeletedFilter },
        });

        if (!professional) {
            return reply.status(404).send({ message: "Profissional não encontrado" });
        }

        const update = await prisma.professional.update({
            where: { id },
            data: body,
        });

        return reply.send(update);
    });

    // DELETAR professional
    app.delete('/professionals/:id', async (request, reply) => {
        const { id } = paramsSchema.parse(request.params)

        const professional = await prisma.professional.findFirst({
            where: { id, ...notDeletedFilter },
        })

        if (!professional) {
            return reply.status(404).send({ message: "Profissional não encontrado" });
        }

        await prisma.professional.update({
            where: { id },
            data: { deletedAt: new Date() }
        })
        return reply.status(204).send();
    })

    
}
