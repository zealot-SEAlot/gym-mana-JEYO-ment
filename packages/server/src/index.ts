// Starts the server on the gym PC: read config, open the database, build the app, serve it over HTTPS.
import { join } from "node:path";

import { createApp } from "./app.ts";
import { readConfig } from "./config.ts";
import { openGymDatabase } from "./db/client.ts";
import { createHttpsServer } from "./https.ts";

const config = readConfig(process.env);
// The gym database lives in the data folder, never in the repo
const db = openGymDatabase(join(config.dataDir, "gym.db"));
const server = createHttpsServer(createApp({ ...config, db }), config);

server.listen(config.port, () => {
  console.log(`Jeyo's server listening on https://localhost:${config.port}/`);
});
