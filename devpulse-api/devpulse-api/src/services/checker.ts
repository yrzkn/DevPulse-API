import { prisma } from "../lib/prisma.js";
import { assertPublicHttpUrl } from "../security/ssrf.js";
import { env } from "../env.js";

async function safeFetch(rawUrl: string): Promise<{ statusCode: number; latencyMs: number; isUp: boolean; errorMessage?: string }> {
  const started = Date.now();
  try {
    let url = await assertPublicHttpUrl(rawUrl);
    // Redirects are disabled: every target must be explicitly registered and validated.
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(env.CHECK_TIMEOUT_MS),
      headers: { "user-agent": "DevPulse-Monitor/1.0" }
    });
    const latencyMs = Date.now() - started;
    const isUp = response.status >= 200 && response.status < 500;
    // Drain a small amount then cancel to avoid retaining large bodies.
    try { await response.body?.cancel(); } catch { /* no-op */ }
    return { statusCode: response.status, latencyMs, isUp, ...(isUp ? {} : { errorMessage: `HTTP ${response.status}` }) };
  } catch (error) {
    const latencyMs = Date.now() - started;
    return {
      latencyMs, isUp: false,
      errorMessage: error instanceof Error ? error.name === "TimeoutError" ? "Timeout" : error.message.slice(0, 180) : "Falha desconhecida"
    };
  }
}

export async function runMonitorCheck(monitorId: string): Promise<void> {
  const monitor = await prisma.monitor.findUnique({ where: { id: monitorId } });
  if (!monitor || !monitor.isActive) return;
  const result = await safeFetch(monitor.url);
  await prisma.$transaction(async tx => {
    await tx.checkResult.create({
      data: {
        monitorId,
        statusCode: result.statusCode,
        latencyMs: result.latencyMs,
        isUp: result.isUp,
        errorMessage: result.errorMessage
      }
    });
    await tx.monitor.update({ where: { id: monitorId }, data: { lastChecked: new Date() } });
    const openIncident = await tx.incident.findFirst({ where: { monitorId, resolvedAt: null }, orderBy: { startedAt: "desc" } });
    if (!result.isUp && !openIncident) {
      await tx.incident.create({ data: { monitorId, summary: result.errorMessage ?? "Endpoint indisponível" } });
    } else if (result.isUp && openIncident) {
      await tx.incident.update({ where: { id: openIncident.id }, data: { resolvedAt: new Date() } });
    }
  });
}

export async function runDueChecks(): Promise<void> {
  const cutoff = new Date(Date.now() - env.CHECK_INTERVAL_MS);
  const monitors = await prisma.monitor.findMany({
    where: { isActive: true, OR: [{ lastChecked: null }, { lastChecked: { lt: cutoff } }] },
    select: { id: true }
  });
  // Sequential execution avoids an unbounded burst against targets.
  for (const monitor of monitors) {
    try { await runMonitorCheck(monitor.id); } catch (error) {
      console.error("Falha ao executar check", monitor.id, error);
    }
  }
}
