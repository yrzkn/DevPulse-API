import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3333),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, "JWT_SECRET precisa ter ao menos 32 caracteres"),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  CHECK_INTERVAL_MS: z.coerce.number().int().min(15000).default(60000),
  CHECK_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(8000),
  MAX_MONITORS_PER_USER: z.coerce.number().int().min(1).max(500).default(25)
});

export const env = schema.parse(process.env);
