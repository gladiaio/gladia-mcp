import { mkdtemp, mkdir, realpath, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  MAX_UPLOAD_BYTES,
  resolveAllowedLocalFile,
} from "../src/lib/local-files.js";

describe("resolveAllowedLocalFile", () => {
  it("accepts a regular file beneath an allowed root", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "gladia-mcp-allowed-"));
    const file = path.join(root, "audio.mp3");
    await writeFile(file, "audio");

    await expect(resolveAllowedLocalFile(file, [root])).resolves.toBe(
      await realpath(file),
    );
  });

  it("rejects uploads when no roots are configured", async () => {
    await expect(resolveAllowedLocalFile("/tmp/audio.mp3", [])).rejects.toThrow(
      /disabled|GLADIA_LOCAL_FILE_ROOTS|Desktop/i,
    );
  });

  it("rejects paths and symlinks that resolve outside an allowed root", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "gladia-mcp-root-"));
    const outside = await mkdtemp(path.join(tmpdir(), "gladia-mcp-outside-"));
    const outsideFile = path.join(outside, "secret.txt");
    const link = path.join(root, "linked.mp3");
    await writeFile(outsideFile, "secret");
    await symlink(outsideFile, link);

    await expect(resolveAllowedLocalFile(outsideFile, [root])).rejects.toThrow(
      "allowed root",
    );
    await expect(resolveAllowedLocalFile(link, [root])).rejects.toThrow(
      "allowed root",
    );
  });

  it("rejects directories and files larger than the Gladia limit", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "gladia-mcp-kind-"));
    const directory = path.join(root, "directory");
    await mkdir(directory);

    await expect(resolveAllowedLocalFile(directory, [root])).rejects.toThrow(
      "regular file",
    );

    const fakeFs = {
      realpath: async (value: string) => value,
      stat: async () => ({ isFile: () => true, size: MAX_UPLOAD_BYTES + 1 }),
    };
    await expect(
      resolveAllowedLocalFile("/audio.mp3", ["/"], fakeFs),
    ).rejects.toThrow("1,000 MB");

    const boundaryFs = {
      ...fakeFs,
      stat: async () => ({ isFile: () => true, size: MAX_UPLOAD_BYTES }),
    };
    await expect(
      resolveAllowedLocalFile("/audio.mp3", ["/"], boundaryFs),
    ).resolves.toBe("/audio.mp3");
  });
});
