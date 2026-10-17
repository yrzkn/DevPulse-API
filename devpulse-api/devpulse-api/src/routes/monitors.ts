import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/errors.js";
import { assertPublicHttpUrl } from "../security/ssrf.js";
import { runMonitorCheck } from "../services/checker.js";

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  url: z.string().url().max(2048),
  intervalMs: z.number().int().min(15000).max(86400000).optional()
});
const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  url: z.string().url().max(2048).optional(),
  intervalMs: z.number().int().min(15000).max(86400000).optional(),
  isActive: z.boolean().optional()
}).refine(v => Object.keys(v).length > 0, "Informe pelo menos um campo");

export async function monitorRoutes(app: FastifyInstance) {
  app.addHook("preHandler", async request => {
    if (!request.url.startsWith("/monitors")) return;
    await request.jwtVerify();
  });

  app.get("/monitors", async request => {
    const userId = request.user.sub;
    return prisma.monitor.findMany({
      where: { userId }, orderBy: { createdAt: "desc" },
      include: { _count: { select: { results: true, incidents: true } } }
    });
  });

  app.post("/monitors", async (request, reply) => {
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) throw new HttpError(400, "Dados inválidos para criar monitor");
    await assertPublicHttpUrl(parsed.data.url);
    const count = await prisma.monitor.count({ where: { userId: request.user.sub } });
    const max = Number(process.env.MAX_MONITORS_PER_USER ?? 25);
    if (count >= max) throw new HttpError(403, `Limite de ${max} monitores por usuário atingido`);
    const monitor = await prisma.monitor.create({
      data: { ...parsed.data, intervalMs: parsed.data.intervalMs ?? 60000, userId: request.user.sub }
    });
    // Run first check asynchronously so API response isn't held by a remote endpoint.
    void runMonitorCheck(monitor.id).catch(err => request.log.error(err));
    return reply.code(201).send(monitor);
  });

  app.get("/monitors/:id", async request => {
    const { id } = request.params as { id: string };
    const monitor = await prisma.monitor.findFirst({ where: { id, userId: request.user.sub } });
    if (!monitor) throw new HttpError(404, "Monitor não encontrado");
    return monitor;
  });

  app.patch("/monitors/:id", async request => {
    const { id } = request.params as { id: string };
    const parsed = patchSchema.safeParse(request.body);
    if (!parsed.success) throw new HttpError(400, "Dados inválidos para atualizar monitor");
    const current = await prisma.monitor.findFirst({ where: { id, userId: request.user.sub } });
    if (!current) throw new HttpError(404, "Monitor não encontrado");
    if (parsed.data.url) await assertPublicHttpUrl(parsed.data.url);
    return prisma.monitor.update({ where: { id }, data: parsed.data });
  });

  app.delete("/monitors/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const current = await prisma.monitor.findFirst({ where: { id, userId: request.user.sub }, select: { id: true } });
    if (!current) throw new HttpError(404, "Monitor não encontrado");
    await prisma.monitor.delete({ where: { id } });
    return reply.code(204).send();
  });

  app.get("/monitors/:id/checks", async request => {
    const { id } = request.params as { id: string };
    const query = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) }).parse(request.query);
    const owned = await prisma.monitor.findFirst({ where: { id, userId: request.user.sub }, select: { id: true } });
    if (!owned) throw new HttpError(404, "Monitor não encontrado");
    return prisma.checkResult.findMany({ where: { monitorId: id }, orderBy: { checkedAt: "desc" }, take: query.limit });
  });

  app.get("/monitors/:id/incidents", async request => {
    const { id } = request.params as { id: string };
    const owned = await prisma.monitor.findFirst({ where: { id, userId: request.user.sub }, select: { id: true } });
    if (!owned) throw new HttpError(404, "Monitor não encontrado");
    return prisma.incident.findMany({ where: { monitorId: id }, orderBy: { startedAt: "desc" }, take: 100 });
  });
}
