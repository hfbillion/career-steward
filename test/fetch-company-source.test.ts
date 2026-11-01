import { describe, expect, it, vi } from "vitest";
import { Value } from "typebox/value";

import {
  CompanySourceFetchError,
  fetchCompanySource,
  type CompanySourceTransport,
} from "../src/application/fetch-company-source.js";
import { CompanySourceSnapshotSchema } from "../src/domain/company-source-acquisition.js";
import type { HostLookup } from "../src/security/public-network-url.js";

const publicLookup: HostLookup = async () => [
  { address: "93.184.216.34", family: 4 },
];

describe("company source acquisition", () => {
  it("revalidates redirects and extracts a bounded auditable HTML snapshot", async () => {
    const html = `
      <html>
        <head>
          <meta property="og:title" content="Working at Example Corp">
          <meta property="og:site_name" content="Example News">
          <meta property="article:published_time" content="2026-10-30T08:00:00+08:00">
          <meta name="description" content="Independent reporting about Example Corp culture.">
          <title>Fallback title</title>
        </head>
        <body>
          <nav>navigation noise</nav>
          <main><h1>Example Corp</h1><p>Employees described a collaborative culture.</p></main>
          <script>stealSecrets()</script>
        </body>
      </html>
    `;
    const transport = vi.fn<CompanySourceTransport>(async (target) => {
      if (target.url.pathname === "/start") {
        return {
          status: 302,
          headers: { location: "/article" },
          body: new Uint8Array([1]),
        };
      }
      return {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
        body: new TextEncoder().encode(html),
      };
    });

    const snapshot = await fetchCompanySource(
      { url: "https://example.com/start" },
      undefined,
      new Date("2026-11-01T00:00:00.000Z"),
      { lookup: publicLookup, transport },
    );

    expect(snapshot).toMatchObject({
      requestedUrl: "https://example.com/start",
      finalUrl: "https://example.com/article",
      retrievedAt: "2026-11-01T00:00:00.000Z",
      title: "Working at Example Corp",
      publisher: "Example News",
      publishedAt: "2026-10-30T00:00:00.000Z",
      suggestedExcerpt: "Independent reporting about Example Corp culture.",
      truncated: false,
    });
    expect(snapshot.text).toContain("Employees described a collaborative culture.");
    expect(snapshot.text).not.toContain("navigation noise");
    expect(snapshot.text).not.toContain("stealSecrets");
    expect(snapshot.redirects).toEqual([
      {
        fromUrl: "https://example.com/start",
        toUrl: "https://example.com/article",
        status: 302,
      },
    ]);
    expect(snapshot.contentSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(Value.Check(CompanySourceSnapshotSchema, snapshot)).toBe(true);
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it("blocks a redirect to cloud metadata before a second request", async () => {
    const transport = vi.fn<CompanySourceTransport>(async () => ({
      status: 302,
      headers: { location: "http://169.254.169.254/latest/meta-data" },
      body: new Uint8Array([1]),
    }));

    await expect(
      fetchCompanySource(
        { url: "https://example.com/start" },
        undefined,
        new Date(),
        { lookup: publicLookup, transport },
      ),
    ).rejects.toMatchObject({ code: "NON_PUBLIC_ADDRESS_FORBIDDEN" });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("rejects unsupported content and oversized responses", async () => {
    await expect(
      fetchCompanySource(
        { url: "https://example.com/report.pdf" },
        undefined,
        new Date(),
        {
          lookup: publicLookup,
          transport: async () => ({
            status: 200,
            headers: { "content-type": "application/pdf" },
            body: new Uint8Array([1]),
          }),
        },
      ),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_CONTENT_TYPE" });

    await expect(
      fetchCompanySource(
        { url: "https://example.com/huge" },
        undefined,
        new Date(),
        {
          lookup: publicLookup,
          transport: async () => ({
            status: 200,
            headers: { "content-type": "text/plain" },
            body: new Uint8Array(1_000_001),
          }),
        },
      ),
    ).rejects.toBeInstanceOf(CompanySourceFetchError);
  });

  it("truncates normalized text while preserving an explicit warning", async () => {
    const snapshot = await fetchCompanySource(
      { url: "https://example.com/long" },
      undefined,
      new Date(),
      {
        lookup: publicLookup,
        transport: async () => ({
          status: 200,
          headers: { "content-type": "text/plain; charset=utf-8" },
          body: new TextEncoder().encode("x".repeat(25_000)),
        }),
      },
    );

    expect(snapshot.text).toHaveLength(20_000);
    expect(snapshot.truncated).toBe(true);
    expect(snapshot.warnings).toContain(
      "Normalized text was truncated to 20000 characters.",
    );
  });
});
