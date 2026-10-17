import { buildApp } from "./app.js";
import { env } from "./env.js";
import { runDueChecks } from "./services/checker.js";

const app = await buildApp();
const timer = setInterval(() => {
  void runDueChecks().catch(err => app.log.error(err));
}, Math.max(15000, env.CHECK_INTERVAL_MS));
timer.unref();

try {
  await app.listen({ port: env.PORT, host: env.HOST });
  app.log.info(`DevPulse API disponível em http://localhost:${env.PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

const shutdown = async () => {
  clearInterval(timer);
  await app.close();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
