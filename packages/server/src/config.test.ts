import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { readConfig } from "./config.ts";

// An absolute path on both Windows and Linux test machines
const dataDir = join(process.cwd(), "gym-data");

describe("readConfig", () => {
  it("refuses to start without a data folder", () => {
    expect(() => readConfig({})).toThrow("JEYOS_DATA_DIR");
  });

  it("refuses a relative data folder path", () => {
    expect(() => readConfig({ JEYOS_DATA_DIR: "gym-data" })).toThrow("JEYOS_DATA_DIR");
  });

  it("uses port 443 when none is set", () => {
    expect(readConfig({ JEYOS_DATA_DIR: dataDir }).port).toBe(443);
  });

  it.each(["0", "65536", "80.5", "https"])("refuses port %s", (port) => {
    expect(() => readConfig({ JEYOS_DATA_DIR: dataDir, JEYOS_PORT: port })).toThrow("JEYOS_PORT");
  });

  it("keeps the certificate and its key inside the data folder", () => {
    const config = readConfig({ JEYOS_DATA_DIR: dataDir, JEYOS_PORT: "8443" });

    expect(config.port).toBe(8443);
    expect(config.certFile).toBe(join(dataDir, "tls", "server.crt"));
    expect(config.keyFile).toBe(join(dataDir, "tls", "server.key"));
  });
});
