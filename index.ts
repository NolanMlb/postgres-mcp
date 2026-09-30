#!/usr/bin/env bun

import { PostgresMCPServer } from "./server.js";
import { Logger } from "./utils/logger.js";

// Start the server
const server = new PostgresMCPServer();
server.run().catch((error) => {
  Logger.error("Fatal error starting server", { error: error.message });
  process.exit(1);
});
