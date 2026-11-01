import { describe, expect, it } from "vitest";

import {
  isPublicNetworkAddress,
  PublicNetworkUrlError,
  resolvePublicNetworkTarget,
} from "../src/security/public-network-url.js";

describe("public network URL policy", () => {
  it("distinguishes public addresses from local, private and reserved ranges", () => {
    expect(isPublicNetworkAddress("8.8.8.8")).toBe(true);
    expect(isPublicNetworkAddress("2606:4700:4700::1111")).toBe(true);

    for (const address of [
      "0.0.0.0",
      "10.0.0.1",
      "100.64.0.1",
      "127.0.0.1",
      "169.254.169.254",
      "172.16.0.1",
      "192.168.1.1",
      "198.51.100.1",
      "::1",
      "::ffff:127.0.0.1",
      "fc00::1",
      "fe80::1",
      "2001:db8::1",
    ]) {
      expect(isPublicNetworkAddress(address), address).toBe(false);
    }
  });

  it("rejects unsafe URL shapes before connecting", async () => {
    const neverLookup = async () => {
      throw new Error("lookup should not run");
    };

    await expect(resolvePublicNetworkTarget("file:///etc/passwd", neverLookup)).rejects.toMatchObject({
      code: "UNSUPPORTED_PROTOCOL",
    });
    await expect(
      resolvePublicNetworkTarget("https://user:secret@example.com/", neverLookup),
    ).rejects.toMatchObject({ code: "URL_CREDENTIALS_FORBIDDEN" });
    await expect(
      resolvePublicNetworkTarget("https://example.com:8443/", neverLookup),
    ).rejects.toMatchObject({ code: "NON_STANDARD_PORT_FORBIDDEN" });
    await expect(resolvePublicNetworkTarget("http://localhost/", neverLookup)).rejects.toMatchObject({
      code: "LOCAL_HOST_FORBIDDEN",
    });
    await expect(
      resolvePublicNetworkTarget("http://169.254.169.254/latest/meta-data", neverLookup),
    ).rejects.toMatchObject({ code: "NON_PUBLIC_ADDRESS_FORBIDDEN" });
  });

  it("rejects a hostname if any DNS answer is non-public", async () => {
    await expect(
      resolvePublicNetworkTarget("https://mixed.example/article", async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "127.0.0.1", family: 4 },
      ]),
    ).rejects.toBeInstanceOf(PublicNetworkUrlError);

    const target = await resolvePublicNetworkTarget(
      "https://public.example/article",
      async () => [
        { address: "2606:4700:4700::1111", family: 6 },
        { address: "93.184.216.34", family: 4 },
      ],
    );
    expect(target.address).toEqual({ address: "93.184.216.34", family: 4 });
  });
});
