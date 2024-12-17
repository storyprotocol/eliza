// apiServer.ts
import dotenv from "dotenv";
import path from "path";

import express from "express";
import cors from "cors";
import getCorsOptions from "./corsOptions.ts"; // Import the CORS options
import { fileURLToPath, pathToFileURL } from "url";
import { dirname } from "path";
import { elizaLogger } from "@ai16z/eliza";
import apiRouter from "./api.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export function startApiServer(port?: number) {
  const app = express();

  const allowedOrigins = process.env.ALLOWED_ORIGINS || '';
  const corsOptions = getCorsOptions(allowedOrigins);
  app.use(cors(corsOptions));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use("/api", apiRouter);

  const apiPort = port || process.env.API_PORT || 3001;

  const server = app.listen(apiPort, () => {
    elizaLogger.info(`API server running on port ${apiPort}`);
  });

  return server;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  startApiServer();
}
