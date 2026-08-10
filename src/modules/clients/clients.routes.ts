import { FastifyInstance } from "fastify";
import z from "zod";
import { authGuard } from "../../plugins/auth-guard.js";
import { prisma } from "../../lib/prisma.js";

const createClientSchema = z.object({
  name: z.string().min(2, "Nome deve ter no mínimo 2 caracteres"),
  phone: z.string().min(8, "Telefone inválido"),
  email: z.email("E-mail inválido").optional(),
  notes: z.string().optional(),
});

const updateClientSchema = createClientSchema.partial();

const paramsSchema = z.object({
  id: z.string(),
});

const notDeletedFilter = {
  OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
}

export async function clientsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  // CREATE client
  app.post("/clients", async (request, reply) => {
    const body = createClientSchema.parse(request.body);

    const client = await prisma.client.create({
      data: { ...body, deletedAt: null },
    });

    return reply.status(201).send(client);
  });

  // LIST clients
  app.get("/clients", async (request, reply) => {
    const clients = await prisma.client.findMany({
      where: notDeletedFilter,
      orderBy: { name: "asc" },
    });

    return reply.send(clients);
  });

  // BUSCAR client ESPECIFICADO
  app.get("/clients/:id", async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);

    const clinte = await prisma.client.findFirst({
      where: { id, ...notDeletedFilter },
    });

    if (!clinte) {
      return reply.status(404).send({ message: "Cliente não encontrado" });
    }

    return reply.send(clinte);
  });

  // UPDATE client
  app.put("/clients/:id", async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    const body = updateClientSchema.parse(request.body);

    const client = await prisma.client.findFirst({
      where: { id, ...notDeletedFilter },
    });

    if (!client) {
      return reply.status(404).send({ message: "Cliente não encontrado" });
    }

    const updated = await prisma.client.update({
      where: { id },
      data: body,
    });

    return reply.send(updated);
  });

  // DELETE client
  app.delete("/clients/:id", async (request, reply) => {
    const { id } = paramsSchema.parse(request.params)

    const client = await prisma.client.findFirst({
        where: { id, ...notDeletedFilter },
    })

    if(!client) {
        return reply.status(404).send({ message: "Cliente não encontrado" });
    }

    await prisma.client.update({
        where: { id },
        data: { deletedAt: new Date() },
    })

    return reply.status(204).send()
  })
}
