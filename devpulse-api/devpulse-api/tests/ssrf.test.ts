import { describe, expect, it } from "vitest";
import { assertPublicHttpUrl } from "../src/security/ssrf.js";

describe("assertPublicHttpUrl", () => {
  it("accepts a public HTTPS URL", async () => {
    await expect(assertPublicHttpUrl("https://example.com/status")).resolves.toBeInstanceOf(URL);
  });
  it.each([
    "http://localhost",
    "http://127.0.0.1",
    "http://10.0.0.5",
    "http://192.168.1.2",
    "file:///etc/passwd",
    "http://user:pass@example.com",
    "http://example.com:8080"
  ])("blocks unsafe URL: %s", async url => {
    await expect(assertPublicHttpUrl(url)).rejects.toThrow();
  });
});
