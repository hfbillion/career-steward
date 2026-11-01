import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

export interface ResolvedNetworkAddress {
  address: string;
  family: 4 | 6;
}

export interface PublicNetworkTarget {
  url: URL;
  address: ResolvedNetworkAddress;
}

export type HostLookup = (
  hostname: string,
) => Promise<readonly ResolvedNetworkAddress[]>;

export class PublicNetworkUrlError extends Error {
  readonly code:
    | "INVALID_URL"
    | "UNSUPPORTED_PROTOCOL"
    | "URL_CREDENTIALS_FORBIDDEN"
    | "NON_STANDARD_PORT_FORBIDDEN"
    | "LOCAL_HOST_FORBIDDEN"
    | "HOST_RESOLUTION_FAILED"
    | "NON_PUBLIC_ADDRESS_FORBIDDEN";

  constructor(code: PublicNetworkUrlError["code"], message: string) {
    super(message);
    this.name = "PublicNetworkUrlError";
    this.code = code;
  }
}

function normalizeHostname(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
}

function isPublicIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return false;
  }
  const [a, b, c] = octets as [number, number, number, number];
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && c === 0) return false;
  if (a === 192 && b === 0 && c === 2) return false;
  if (a === 192 && b === 88 && c === 99) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  if (a >= 224) return false;
  return true;
}

function isPublicIpv6(address: string): boolean {
  const value = address.toLowerCase().split("%")[0] ?? "";
  const groups = value.split(":");
  const first = Number.parseInt(groups[0] ?? "", 16);
  const second = Number.parseInt(groups[1] ?? "", 16);
  // Public source acquisition deliberately accepts only global-unicast IPv6.
  if (!Number.isInteger(first) || first < 0x2000 || first > 0x3fff) return false;
  if (first === 0x2001 && second === 0x0000) return false; // Teredo
  if (first === 0x2001 && second === 0x0db8) return false; // documentation
  if (first === 0x2001 && second >= 0x0010 && second <= 0x002f) return false; // ORCHID
  if (first === 0x2002) return false; // 6to4 can tunnel non-public IPv4
  return true;
}

export function isPublicNetworkAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isPublicIpv4(address);
  if (family === 6) return isPublicIpv6(address);
  return false;
}

const defaultLookup: HostLookup = async (hostname) => {
  const addresses = await dnsLookup(hostname, { all: true, verbatim: true });
  return addresses.map((item) => ({
    address: item.address,
    family: item.family as 4 | 6,
  }));
};

export async function resolvePublicNetworkTarget(
  rawUrl: string,
  lookup: HostLookup = defaultLookup,
): Promise<PublicNetworkTarget> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new PublicNetworkUrlError("INVALID_URL", `Invalid source URL: ${rawUrl}`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new PublicNetworkUrlError(
      "UNSUPPORTED_PROTOCOL",
      `Source URL must use HTTP or HTTPS: ${rawUrl}`,
    );
  }
  if (url.username || url.password) {
    throw new PublicNetworkUrlError(
      "URL_CREDENTIALS_FORBIDDEN",
      "Source URLs must not contain credentials",
    );
  }
  if (url.port) {
    throw new PublicNetworkUrlError(
      "NON_STANDARD_PORT_FORBIDDEN",
      "Source URLs must use the standard HTTP or HTTPS port",
    );
  }

  const hostname = normalizeHostname(url.hostname);
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local")
  ) {
    throw new PublicNetworkUrlError(
      "LOCAL_HOST_FORBIDDEN",
      `Local source host is not allowed: ${hostname}`,
    );
  }

  let addresses: readonly ResolvedNetworkAddress[];
  const literalFamily = isIP(hostname);
  if (literalFamily) {
    addresses = [{ address: hostname, family: literalFamily as 4 | 6 }];
  } else {
    try {
      addresses = await lookup(hostname);
    } catch (error) {
      throw new PublicNetworkUrlError(
        "HOST_RESOLUTION_FAILED",
        `Could not resolve source host ${hostname}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  if (addresses.length === 0) {
    throw new PublicNetworkUrlError(
      "HOST_RESOLUTION_FAILED",
      `Source host ${hostname} did not resolve to an address`,
    );
  }
  const nonPublic = addresses.find((item) => !isPublicNetworkAddress(item.address));
  if (nonPublic) {
    throw new PublicNetworkUrlError(
      "NON_PUBLIC_ADDRESS_FORBIDDEN",
      `Source host ${hostname} resolves to non-public address ${nonPublic.address}`,
    );
  }

  const address = [...addresses].sort((left, right) => left.family - right.family)[0]!;
  return { url, address };
}
