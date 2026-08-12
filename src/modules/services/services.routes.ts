import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { authGuard } from "../../plugins/auth-guard.js";

const createServiceSchema = z.object({
  name: z.string().min(2, "Nome deve ter no mínimo 2 caracteres"),
  durationMin: z.number().int().positive("Tempo deve ser maior que zero"),
  price: z.number().positive("Preço deve ser maior que zero"),
});

const updateServiceSchema = createServiceSchema.partial();

const paramsSchema = z.object({
  id: z.string(),
});

const notDeletedFilter = {
  OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
};

export async function servicesRutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  // CREATE service
  app.post("/services", async (request, reply) => {
    const body = createServiceSchema.parse(request.body);

    const service = await prisma.service.create({
      data: { ...body, deletedAt: null },
    });

    return reply.status(201).send(service);
  });

  // LIST services
  app.get("/services", async (request, reply) => {
    const services = await prisma.service.findMany({
      where: notDeletedFilter,
      orderBy: { name: "asc" },
    });

    return reply.send(services);
  });

  // BUSCAR service ESPECIFICADO
  app.get("/services/:id", async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);

    const service = await prisma.service.findFirst({
      where: { id, ...notDeletedFilter },
    });

    if (!service) {
      return reply.status(404).send({ message: "Serviço não encontrado" });
    }

    return reply.send(service);
  });

  // ATUALIZAR service
  app.put("/services/:id", async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    const body = updateServiceSchema.parse(request.body);

    const service = await prisma.service.findFirst({
      where: { id, ...notDeletedFilter },
    });

    if (!service) {
      return reply.status(404).send({ message: "Serviço não encontrado" });
    }

    const updated = await prisma.service.update({
      where: { id },
      data: body,
    });

    return reply.send(updated);
  });

  app.delete("/services/:id", async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);

    const service = await prisma.service.findFirst({
      where: { id, ...notDeletedFilter },
    });

    if (!service) {
      return reply.status(404).send({ message: "Serviço nao encontrado" });
    }

    await prisma.service.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return reply.status(204).send();
  });
}
