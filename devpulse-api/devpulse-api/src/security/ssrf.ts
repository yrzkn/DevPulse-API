import dns from "node:dns/promises";
import net from "node:net";
import { HttpError } from "../lib/errors.js";

/**
 * MVP SSRF guard. Blocks IP literals and DNS answers for private/reserved ranges.
 * For production, prefer a controlled egress proxy/network policy as an additional layer.
 */
function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, part) => ((acc << 8) | Number(part)) >>> 0, 0);
}
function isBlockedIPv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  const ranges: Array<[string, number]> = [
    ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
    ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
    ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
    ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4]
  ];
  return ranges.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (n & mask) === (ipv4ToInt(base) & mask);
  });
}
function isBlockedIPv6(ip: string): boolean {
  const value = ip.toLowerCase().split("%")[0];
  return value === "::" || value === "::1" || value.startsWith("fc") ||
    value.startsWith("fd") || /^fe[89ab]/.test(value) ||
    value.startsWith("2001:db8:") || value.startsWith("::ffff:127.") ||
    value.startsWith("::ffff:10.") || value.startsWith("::ffff:192.168.");
}

export async function assertPublicHttpUrl(raw: string): Promise<URL> {
  let url: URL;
  try { url = new URL(raw); } catch { throw new HttpError(400, "URL inválida"); }
  if (!["http:", "https:"].includes(url.protocol)) throw new HttpError(400, "Somente URLs HTTP/HTTPS são permitidas");
  if (url.username || url.password) throw new HttpError(400, "URLs com credenciais não são permitidas");
  if (url.port && !["80", "443"].includes(url.port)) throw new HttpError(400, "Somente portas 80 e 443 são permitidas");
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new HttpError(400, "Destino local ou interno não permitido");
  }
  const ipVersion = net.isIP(host);
  if (ipVersion === 4 && isBlockedIPv4(host)) throw new HttpError(400, "Endereço IP privado/reservado não permitido");
  if (ipVersion === 6 && isBlockedIPv6(host)) throw new HttpError(400, "Endereço IPv6 privado/reservado não permitido");
  if (!ipVersion) {
    let records: Array<{ address: string; family: number }>;
    try { records = await dns.lookup(host, { all: true, verbatim: true }); }
    catch { throw new HttpError(400, "Não foi possível resolver o domínio"); }
    if (!records.length || records.some(r => r.family === 4 ? isBlockedIPv4(r.address) : isBlockedIPv6(r.address))) {
      throw new HttpError(400, "O domínio resolve para endereço privado/reservado");
    }
  }
  return url;
}
