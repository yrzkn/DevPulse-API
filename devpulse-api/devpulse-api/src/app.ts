import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { env } from "./env.js";
import { prisma } from "./lib/prisma.js";
import { HttpError } from "./lib/errors.js";
import { authRoutes } from "./routes/auth.js";
import { monitorRoutes } from "./routes/monitors.js";

export async function buildApp() {
  const app = Fastify({
    logger: { level: env.NODE_ENV === "development" ? "info" : "warn" },
    bodyLimit: 1024 * 1024,
    trustProxy: false
  });

  await app.register(helmet);
  await app.register(cors, { origin: env.CORS_ORIGIN.split(",").map(v => v.trim()), credentials: false });
  await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });
  await app.register(jwt, { secret: env.JWT_SECRET });
  await app.register(swagger, {
    openapi: {
      info: { title: "DevPulse API", description: "API para monitoramento de endpoints HTTP", version: "1.0.0" },
      servers: [{ url: `http://localhost:${env.PORT}` }],
      components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } } }
    }
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });
  app.get("/health", async () => ({ status: "ok", service: "devpulse-api", timestamp: new Date().toISOString() }));
  await app.register(authRoutes);
  await app.register(monitorRoutes);

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof HttpError) return reply.code(error.statusCode).send({ error: error.message });
    if (error.validation) return reply.code(400).send({ error: "Requisição inválida" });
    app.log.error(error);
    return reply.code(500).send({ error: "Erro interno do servidor" });
  });

  app.addHook("onClose", async () => { await prisma.$disconnect(); });
  return app;
}
