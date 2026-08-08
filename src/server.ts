import Fastify from "fastify";

const app = Fastify({ logger: true });

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
