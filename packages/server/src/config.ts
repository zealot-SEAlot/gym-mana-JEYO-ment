// Reads the server's settings from environment variables when it starts (U2, U14).
import { isAbsolute, join, resolve } from "node:path";

export type Config = {
  /** The data folder outside the repo: database, photos, certificate (U14 locks it to the service account) */
  dataDir: string;
  port: number;
  certFile: string;
  keyFile: string;
  /** The secret the install script writes, which owner setup asks for (R49, KTD5) */
  setupSecretFile: string;
  /** The built client pages */
  clientDir: string;
};

/** Reads env (process.env when the server starts) and refuses to start on a missing or wrong value. */
export function readConfig(env: Record<string, string | undefined>): Config {
  const dataDir = env["JEYOS_DATA_DIR"];
  // The Windows service starts in an unknown working folder, so a relative path could point anywhere
  if (dataDir === undefined || !isAbsolute(dataDir)) {
    throw new Error("JEYOS_DATA_DIR must be set to the full path of the data folder");
  }

  // 443 is the default HTTPS port, so phones open https://<gym PC>/ without typing a port
  const port = Number(env["JEYOS_PORT"] ?? "443");
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("JEYOS_PORT must be a whole number from 1 to 65535");
  }

  return {
    dataDir,
    port,
    certFile: join(dataDir, "tls", "server.crt"),
    keyFile: join(dataDir, "tls", "server.key"),
    setupSecretFile: join(dataDir, "setup-secret.txt"),
    clientDir: resolve(import.meta.dirname, "../../client/dist"),
  };
}
