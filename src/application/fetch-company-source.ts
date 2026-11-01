import { createHash } from "node:crypto";
import { request as httpRequest, type IncomingHttpHeaders } from "node:http";
import { request as httpsRequest } from "node:https";

import type { Static } from "typebox";
import { Type } from "typebox";

import type { CompanySourceSnapshot } from "../domain/company-source-acquisition.js";
import {
  PublicNetworkUrlError,
  resolvePublicNetworkTarget,
  type HostLookup,
  type PublicNetworkTarget,
} from "../security/public-network-url.js";

const MAX_REDIRECTS = 5;
const MAX_RESPONSE_BYTES = 1_000_000;
const MAX_TEXT_CHARACTERS = 20_000;
const DEFAULT_TIMEOUT_MS = 15_000;
const USER_AGENT = "Career-Steward/1.0 (+local evidence acquisition)";

export const FetchCompanySourceInputSchema = Type.Object({
  url: Type.String({
    minLength: 1,
    description: "Public HTTP(S) company source URL to retrieve and normalize",
  }),
});

export type FetchCompanySourceInput = Static<typeof FetchCompanySourceInputSchema>;

interface RawSourceResponse {
  status: number;
  headers: Readonly<Record<string, string | undefined>>;
  body: Uint8Array;
}

export type CompanySourceTransport = (
  target: PublicNetworkTarget,
  signal: AbortSignal,
) => Promise<RawSourceResponse>;

export interface CompanySourceFetchDependencies {
  lookup?: HostLookup;
  transport?: CompanySourceTransport;
}

export class CompanySourceFetchError extends Error {
  readonly code:
    | PublicNetworkUrlError["code"]
    | "REQUEST_TIMEOUT"
    | "NETWORK_ERROR"
    | "TOO_MANY_REDIRECTS"
    | "REDIRECT_LOCATION_MISSING"
    | "HTTP_STATUS_ERROR"
    | "UNSUPPORTED_CONTENT_TYPE"
    | "RESPONSE_TOO_LARGE"
    | "EMPTY_SOURCE_CONTENT";

  constructor(code: CompanySourceFetchError["code"], message: string) {
    super(message);
    this.name = "CompanySourceFetchError";
    this.code = code;
  }
}

function normalizeHeaders(headers: IncomingHttpHeaders): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [
      name.toLowerCase(),
      Array.isArray(value) ? value.join(", ") : value,
    ]),
  );
}

const defaultTransport: CompanySourceTransport = (target, signal) =>
  new Promise((resolve, reject) => {
    const url = target.url;
    const request = url.protocol === "https:" ? httpsRequest : httpRequest;
    const client = request(
      {
        protocol: url.protocol,
        hostname: target.address.address,
        family: target.address.family,
        port: url.protocol === "https:" ? 443 : 80,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        servername: url.protocol === "https:" ? url.hostname : undefined,
        signal,
        headers: {
          Accept: "text/html, application/xhtml+xml, text/plain;q=0.9",
          "Accept-Encoding": "identity",
          Host: url.host,
          "User-Agent": USER_AGENT,
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        let byteLength = 0;
        const declaredLength = Number(response.headers["content-length"] ?? 0);
        if (declaredLength > MAX_RESPONSE_BYTES) {
          response.destroy();
          reject(
            new CompanySourceFetchError(
              "RESPONSE_TOO_LARGE",
              `Source response exceeds ${MAX_RESPONSE_BYTES} bytes`,
            ),
          );
          return;
        }
        response.on("data", (chunk: Buffer) => {
          byteLength += chunk.length;
          if (byteLength > MAX_RESPONSE_BYTES) {
            response.destroy(
              new CompanySourceFetchError(
                "RESPONSE_TOO_LARGE",
                `Source response exceeds ${MAX_RESPONSE_BYTES} bytes`,
              ),
            );
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => {
          resolve({
            status: response.statusCode ?? 0,
            headers: normalizeHeaders(response.headers),
            body: Buffer.concat(chunks),
          });
        });
        response.on("error", reject);
      },
    );
    client.on("error", reject);
    client.end();
  });

function decodeCodePoint(value: string, radix: number): string | undefined {
  const codePoint = Number.parseInt(value, radix);
  if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
    return undefined;
  }
  return String.fromCodePoint(codePoint);
}

function decodeHtmlEntities(value: string): string {
  const named: Readonly<Record<string, string>> = {
    amp: "&",
    apos: "'",
    gt: ">",
    hellip: "…",
    ldquo: "“",
    lsquo: "‘",
    lt: "<",
    nbsp: " ",
    quot: '"',
    rdquo: "”",
    rsquo: "’",
  };
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
    if (code.startsWith("#x")) return decodeCodePoint(code.slice(2), 16) ?? entity;
    if (code.startsWith("#")) return decodeCodePoint(code.slice(1), 10) ?? entity;
    return named[code.toLowerCase()] ?? entity;
  });
}

function normalizeText(value: string): string {
  return decodeHtmlEntities(value)
    .replace(/\r\n?/g, "\n")
    .replace(/[\t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function htmlAttribute(tag: string, name: string): string | undefined {
  const match = tag.match(
    new RegExp(
      `(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
      "i",
    ),
  );
  return match?.[1] ?? match?.[2] ?? match?.[3];
}

function metaContent(html: string, keys: readonly string[]): string | undefined {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = (htmlAttribute(tag, "property") ?? htmlAttribute(tag, "name"))?.toLowerCase();
    if (key && keys.includes(key)) {
      const content = htmlAttribute(tag, "content");
      if (content) return normalizeText(content);
    }
  }
  return undefined;
}

function extractHtml(
  html: string,
  hostname: string,
): Pick<CompanySourceSnapshot, "publisher" | "text" | "suggestedExcerpt"> &
  Partial<Pick<CompanySourceSnapshot, "title" | "publishedAt">> {
  const titleFromTag = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const title =
    metaContent(html, ["og:title", "twitter:title"]) ??
    (titleFromTag ? normalizeText(titleFromTag.replace(/<[^>]*>/g, " ")) : undefined);
  const publisher = metaContent(html, ["og:site_name", "application-name"]) ?? hostname;
  const rawPublishedAt = metaContent(html, [
    "article:published_time",
    "datepublished",
    "pubdate",
    "date",
  ]);
  const publishedAt =
    rawPublishedAt && !Number.isNaN(Date.parse(rawPublishedAt))
      ? new Date(rawPublishedAt).toISOString()
      : undefined;
  const description = metaContent(html, ["description", "og:description"]);

  const selected =
    html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ??
    html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1] ??
    html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ??
    html;
  const text = normalizeText(
    selected
      .replace(/<!--([\s\S]*?)-->/g, " ")
      .replace(
        /<(script|style|noscript|template|svg|nav|footer|aside|form)\b[^>]*>[\s\S]*?<\/\1>/gi,
        " ",
      )
      .replace(
        /<\/?(p|div|section|article|main|h[1-6]|li|br|tr|blockquote)\b[^>]*>/gi,
        "\n",
      )
      .replace(/<[^>]*>/g, " "),
  );
  const suggestedExcerpt = (description ?? text.slice(0, 1_000)).trim();
  return {
    ...(title ? { title } : {}),
    publisher,
    ...(publishedAt ? { publishedAt } : {}),
    text,
    suggestedExcerpt,
  };
}

function charsetFromContentType(contentType: string): string {
  return (
    contentType.match(/charset\s*=\s*([^;\s]+)/i)?.[1]?.replace(/["']/g, "") ??
    "utf-8"
  );
}

function decodeBody(body: Uint8Array, contentType: string): string {
  try {
    return new TextDecoder(charsetFromContentType(contentType)).decode(body);
  } catch {
    return new TextDecoder("utf-8").decode(body);
  }
}

function isRedirect(status: number): boolean {
  return [301, 302, 303, 307, 308].includes(status);
}

export async function fetchCompanySource(
  input: FetchCompanySourceInput,
  signal?: AbortSignal,
  now = new Date(),
  dependencies: CompanySourceFetchDependencies = {},
): Promise<CompanySourceSnapshot> {
  const transport = dependencies.transport ?? defaultTransport;
  const timeoutSignal = AbortSignal.timeout(DEFAULT_TIMEOUT_MS);
  const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
  const requestedUrl = input.url.trim();
  let currentUrl = requestedUrl;
  const redirects: CompanySourceSnapshot["redirects"] = [];

  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const target = await resolvePublicNetworkTarget(currentUrl, dependencies.lookup);
      const response = await transport(target, requestSignal);

      if (isRedirect(response.status)) {
        const location = response.headers.location;
        if (!location) {
          throw new CompanySourceFetchError(
            "REDIRECT_LOCATION_MISSING",
            `HTTP ${response.status} response did not include a redirect location`,
          );
        }
        if (hop === MAX_REDIRECTS) {
          throw new CompanySourceFetchError(
            "TOO_MANY_REDIRECTS",
            `Source exceeded ${MAX_REDIRECTS} redirects`,
          );
        }
        const nextUrl = new URL(location, target.url).toString();
        redirects.push({
          fromUrl: target.url.toString(),
          toUrl: nextUrl,
          status: response.status,
        });
        currentUrl = nextUrl;
        continue;
      }

      if (response.status < 200 || response.status >= 300) {
        throw new CompanySourceFetchError(
          "HTTP_STATUS_ERROR",
          `Source returned HTTP ${response.status}`,
        );
      }
      const contentType = response.headers["content-type"]?.toLowerCase() ?? "";
      if (
        !contentType.startsWith("text/html") &&
        !contentType.startsWith("application/xhtml+xml") &&
        !contentType.startsWith("text/plain")
      ) {
        throw new CompanySourceFetchError(
          "UNSUPPORTED_CONTENT_TYPE",
          `Unsupported company source content type: ${contentType || "missing"}`,
        );
      }
      if (response.body.byteLength > MAX_RESPONSE_BYTES) {
        throw new CompanySourceFetchError(
          "RESPONSE_TOO_LARGE",
          `Source response exceeds ${MAX_RESPONSE_BYTES} bytes`,
        );
      }

      const decoded = decodeBody(response.body, contentType);
      const hostname = target.url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
      const plainText = normalizeText(decoded);
      const extracted = contentType.startsWith("text/plain")
        ? {
            publisher: hostname,
            text: plainText,
            suggestedExcerpt: plainText.slice(0, 1_000),
          }
        : extractHtml(decoded, hostname);
      if (!extracted.text) {
        throw new CompanySourceFetchError(
          "EMPTY_SOURCE_CONTENT",
          "Source did not contain extractable text",
        );
      }
      const truncated = extracted.text.length > MAX_TEXT_CHARACTERS;
      const text = extracted.text.slice(0, MAX_TEXT_CHARACTERS);
      const suggestedExcerpt =
        extracted.suggestedExcerpt.slice(0, 1_000) || text.slice(0, 1_000);
      const warnings = [
        ...(truncated
          ? [`Normalized text was truncated to ${MAX_TEXT_CHARACTERS} characters.`]
          : []),
        ...(!extracted.title ? ["No page title was detected."] : []),
        ...(!extracted.publishedAt
          ? ["No reliable publication timestamp was detected."]
          : []),
        ...(contentType.includes("html")
          ? ["JavaScript was not executed; client-rendered content may be incomplete."]
          : []),
      ];

      return {
        requestedUrl: new URL(requestedUrl).toString(),
        finalUrl: target.url.toString(),
        retrievedAt: now.toISOString(),
        ...(extracted.title ? { title: extracted.title } : {}),
        publisher: extracted.publisher,
        ...(extracted.publishedAt ? { publishedAt: extracted.publishedAt } : {}),
        contentType,
        contentSha256: createHash("sha256").update(response.body).digest("hex"),
        byteLength: response.body.byteLength,
        text,
        suggestedExcerpt,
        truncated,
        redirects,
        warnings,
      };
    }
    throw new CompanySourceFetchError("TOO_MANY_REDIRECTS", "Too many redirects");
  } catch (error) {
    if (signal?.aborted) throw error;
    if (error instanceof CompanySourceFetchError) throw error;
    if (error instanceof PublicNetworkUrlError) {
      throw new CompanySourceFetchError(error.code, error.message);
    }
    if (timeoutSignal.aborted) {
      throw new CompanySourceFetchError(
        "REQUEST_TIMEOUT",
        `Source request exceeded ${DEFAULT_TIMEOUT_MS} ms`,
      );
    }
    throw new CompanySourceFetchError(
      "NETWORK_ERROR",
      `Could not fetch company source: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
