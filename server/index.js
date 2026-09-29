import { createWebServer } from "./web-server.js";

const host = process.env.SOUNDFLEX_WEB_HOST || "127.0.0.1";
const port = Number(process.env.SOUNDFLEX_WEB_PORT || 3080);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new RangeError("SOUNDFLEX_WEB_PORT must be an integer from 1 to 65535");
}

const application = createWebServer();
application.server.listen(port, host, () => {
  console.log(`SoundFlex Control is available at http://${host}:${port}`);
});

const shutdown = async () => {
  await application.close();
  process.exit(0);
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
