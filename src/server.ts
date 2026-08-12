import "dotenv/config";
import Fastify from "fastify";
import { ZodError } from "zod";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { clientsRoutes } from "./modules/clients/clients.routes.js";
import { professionalsRoutes } from "./modules/professionals/professionals.routes.js";
import { servicesRutes } from "./modules/services/services.routes.js";
import { appointmentsRoutes } from "./modules/appointments/appointments.routes.js";

const app = Fastify({ logger: true });

app.setErrorHandler((error, request, reply) => {
  if (error instanceof ZodError) {
    return reply
      .status(400)
      .send({ message: "Dado inválidos", issues: error.issues });
  }

  app.log.error(error);
  return reply.status(500).send({ message: "Erro interno do servidor" });
});

app.register(authRoutes);
app.register(clientsRoutes);
app.register(professionalsRoutes);
app.register(servicesRutes);
app.register(appointmentsRoutes);

app.get("/health", async () => {
  return { status: "ok" };
});

const PORT = Number(process.env.PORT) || 3333;

app
  .listen({ port: PORT, host: "0.0.0.0" })
  .then(() => console.log(`Servidor rodando na porta ${PORT}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
