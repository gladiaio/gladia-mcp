#!/usr/bin/env node
import { serveStdio } from "@modelcontextprotocol/server/stdio";

import { loadConfig } from "./config.js";
import { createLiveClient, createPreRecordedClient } from "./gladia/client.js";
import { createServer } from "./server.js";

try {
  const config = loadConfig();
  const client = createPreRecordedClient(config);
  const liveClient = createLiveClient(config);
  void serveStdio(() =>
    createServer({
      client,
      liveClient,
      localFileRoots: config.localFileRoots,
    }),
  );
  console.error("Gladia MCP server running on stdio");
} catch (error) {
  const message =
    error instanceof Error ? error.message : "Unknown startup error";
  console.error(`Gladia MCP server failed to start: ${message}`);
  process.exitCode = 1;
}
