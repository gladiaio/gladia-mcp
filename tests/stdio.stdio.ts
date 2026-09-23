import { spawn } from "node:child_process";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { expect, test } from "vitest";

test("the built binary negotiates over stdio without polluting stdout", async () => {
  const client = new Client({ name: "stdio-test", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["dist/index.js"],
    env: { ...process.env, GLADIA_API_KEY: "stdio-test-key" },
    stderr: "pipe",
  });

  await client.connect(transport);
  const { tools } = await client.listTools();
  expect(tools).toHaveLength(8);
  expect(tools.map((tool) => tool.name)).toEqual([
    "delete_live_transcription",
    "delete_pre_recorded_transcription",
    "get_live_transcription",
    "get_pre_recorded_transcription",
    "list_live_transcriptions",
    "list_pre_recorded_transcriptions",
    "transcribe_pre_recorded",
    "upload_audio",
  ]);
  await client.close();
});

test("the built binary fails cleanly when the API key is missing", async () => {
  const child = spawn(process.execPath, ["dist/index.js"], {
    env: { ...process.env, GLADIA_API_KEY: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
    stderr += chunk;
  });

  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });

  expect(exitCode).toBe(1);
  expect(stdout).toBe("");
  expect(stderr).toContain("GLADIA_API_KEY is required");
});
