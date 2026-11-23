// Starts the server on the gym PC: read config, build the app, serve it over HTTPS.
import { createApp } from "./app.ts";
import { readConfig } from "./config.ts";
import { createHttpsServer } from "./https.ts";

const config = readConfig(process.env);
const server = createHttpsServer(createApp(config.clientDir), config);

server.listen(config.port, () => {
  console.log(`Jeyo's server listening on https://localhost:${config.port}/`);
});
