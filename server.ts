import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { initSocketServer } from "./src/server/socket";
import { initBackgroundSchedulers } from "./src/server/jobs/scheduler";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

async function bootstrap() {
  try {
    await app.prepare();

    const httpServer = createServer((req, res) => {
      try {
        const parsedUrl = parse(req.url!, true);
        handle(req, res, parsedUrl);
      } catch (err) {
        console.error("HTTP handler error:", err);
        res.statusCode = 500;
        res.end("Internal Server Error");
      }
    });

    // Initialize Socket.io on the same HTTP server port
    initSocketServer(httpServer);

    // Initialize automated background schedulers (PIN rotation & Sunday settlements)
    initBackgroundSchedulers();

    httpServer.listen(port, () => {
      console.log(`> GullyQuiz QR Server ready on http://${hostname}:${port}`);
      console.log(`> Real-time Socket.io rooms initialized on the same port.`);
      console.log(`> Mode: ${dev ? "development" : "production"}`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

bootstrap();
