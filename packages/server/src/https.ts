// Serves the app over HTTPS, because browsers open the door tablet's camera only on secure pages (KTD3).
import { readFileSync } from "node:fs";
import type { RequestListener } from "node:http";
import { createServer } from "node:https";
import type { Server } from "node:https";

/** Wraps handler (the Express app) in an HTTPS server using the certificate files from config. */
export function createHttpsServer(
  handler: RequestListener,
  files: { certFile: string; keyFile: string },
): Server {
  return createServer(
    {
      cert: readFileSync(files.certFile),
      key: readFileSync(files.keyFile),
      // Node already defaults to TLS 1.2; stating it means a startup flag cannot lower it
      minVersion: "TLSv1.2",
    },
    handler,
  );
}
