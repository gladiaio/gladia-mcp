import { homedir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { defaultLocalFileRoot, loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("requires a Gladia API key", () => {
    expect(() => loadConfig({})).toThrow("GLADIA_API_KEY");
  });

  it("normalizes configured local roots and API URL", () => {
    const config = loadConfig({
      GLADIA_API_KEY: "test-key",
      GLADIA_API_URL: "https://proxy.example.test",
      GLADIA_LOCAL_FILE_ROOTS: ["fixtures", "samples"].join(path.delimiter),
    });

    expect(config.apiKey).toBe("test-key");
    expect(config.apiUrl).toBe("https://proxy.example.test");
    expect(config.localFileRoots).toEqual([
      path.resolve("fixtures"),
      path.resolve("samples"),
    ]);
  });

  it("defaults local uploads to the Desktop directory", () => {
    expect(defaultLocalFileRoot()).toBe(path.join(homedir(), "Desktop"));
    expect(loadConfig({ GLADIA_API_KEY: "test-key" }).localFileRoots).toEqual([
      defaultLocalFileRoot(),
    ]);
  });

  it("disables local uploads when GLADIA_LOCAL_FILE_ROOTS is empty", () => {
    expect(
      loadConfig({
        GLADIA_API_KEY: "test-key",
        GLADIA_LOCAL_FILE_ROOTS: "",
      }).localFileRoots,
    ).toEqual([]);
  });
});
