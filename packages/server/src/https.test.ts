import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connect } from "node:tls";
import type { ConnectionOptions } from "node:tls";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createHttpsServer } from "./https.ts";

describe("createHttpsServer", () => {
  let folder: string;
  let cert: Buffer;
  let server: ReturnType<typeof createHttpsServer>;
  let port: number;

  // A throwaway certificate for localhost, made with OpenSSL (Git for Windows ships it) and
  // deleted afterwards, so no key is ever committed
  beforeAll(async () => {
    folder = mkdtempSync(join(tmpdir(), "jeyos-https-test-"));
    const certFile = join(folder, "server.crt");
    const keyFile = join(folder, "server.key");
    execFileSync(
      "openssl",
      [
        "req",
        "-x509",
        "-newkey",
        "ec",
        "-pkeyopt",
        "ec_paramgen_curve:prime256v1",
        "-nodes",
        "-days",
        "1",
        "-subj",
        "/CN=localhost",
        "-addext",
        "subjectAltName=DNS:localhost",
        "-keyout",
        keyFile,
        "-out",
        certFile,
      ],
      { stdio: "ignore" },
    );
    cert = readFileSync(certFile);

    server = createHttpsServer((_request, response) => response.end("ok"), { certFile, keyFile });
    server.listen(0);
    await new Promise((done) => server.once("listening", done));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise((done) => server.close(done));
    rmSync(folder, { recursive: true, force: true });
  });

  // Opens a TLS connection that trusts only the test certificate, and reports the TLS version agreed
  function handshake(options: ConnectionOptions): Promise<string | null> {
    return new Promise((done, fail) => {
      const socket = connect({ host: "localhost", port, ca: cert, ...options }, () => {
        done(socket.getProtocol());
        socket.end();
      });
      socket.once("error", fail);
    });
  }

  it("accepts a secure connection that checks the certificate", async () => {
    expect(await handshake({})).toBe("TLSv1.3");
  });

  it("accepts TLS 1.2, which older gym tablets may still use", async () => {
    expect(await handshake({ maxVersion: "TLSv1.2" })).toBe("TLSv1.2");
  });

  it("refuses TLS 1.1", async () => {
    // Node's own client also refuses TLS 1.1, so lower its security level to play an old device;
    // the "protocol version" alert proves the server, not the client, said no
    const oldDevice: ConnectionOptions = {
      minVersion: "TLSv1.1",
      maxVersion: "TLSv1.1",
      ciphers: "DEFAULT@SECLEVEL=0",
    };

    await expect(handshake(oldDevice)).rejects.toThrow("protocol version");
  });
});
