import type { FastifyInstance } from "fastify";
import argon2 from "argon2";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/errors.js";

const registerSchema = z.object({
  email: z.string().trim().email().max(254).transform(v => v.toLowerCase()),
  password: z.string().min(12).max(128)
});
const loginSchema = z.object({ email: z.string().trim().email().transform(v => v.toLowerCase()), password: z.string().min(1).max(128) });

export async function authRoutes(app: FastifyInstance) {
  app.post("/auth/register", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) throw new HttpError(400, "E-mail ou senha inválidos. A senha deve ter ao menos 12 caracteres.");
    const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    if (existing) throw new HttpError(409, "Já existe uma conta com esse e-mail");
    const passwordHash = await argon2.hash(parsed.data.password, { type: argon2.argon2id });
    const user = await prisma.user.create({ data: { email: parsed.data.email, passwordHash }, select: { id: true, email: true, createdAt: true } });
    const token = app.jwt.sign({ sub: user.id, email: user.email }, { expiresIn: "1h" });
    return reply.code(201).send({ user, token, tokenType: "Bearer", expiresIn: 3600 });
  });

  app.post("/auth/login", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) throw new HttpError(400, "Credenciais inválidas");
    const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    if (!user || !(await argon2.verify(user.passwordHash, parsed.data.password))) throw new HttpError(401, "E-mail ou senha incorretos");
    const token = app.jwt.sign({ sub: user.id, email: user.email }, { expiresIn: "1h" });
    return { user: { id: user.id, email: user.email }, token, tokenType: "Bearer", expiresIn: 3600 };
  });
}
