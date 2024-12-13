import express from "express";
import cors from "cors";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname } from "path";
import { elizaLogger } from "@ai16z/eliza";
import apiRouter from "./api.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function startApiServer(port?: number) {
  const app = express();

  app.use(cors());
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
