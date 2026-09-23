import { beforeEach, describe, expect, it, vi } from "vitest";

import packageJson from "../package.json" with { type: "json" };

const sdk = vi.hoisted(() => ({
  constructor: vi.fn(),
  preRecorded: vi.fn().mockReturnValue({ client: "pre-recorded" }),
  liveV2: vi.fn().mockReturnValue({ client: "live" }),
}));

vi.mock("@gladiaio/sdk", () => ({
  GladiaClient: class {
    constructor(options: unknown) {
      sdk.constructor(options);
    }

    preRecorded() {
      return sdk.preRecorded();
    }

    liveV2() {
      return sdk.liveV2();
    }
  },
}));

import {
  createLiveClient,
  createPreRecordedClient,
} from "../src/gladia/client.js";

const gladiaVersionHeader = {
  "x-gladia-version": `mcp/${packageJson.version}`,
};

describe("Gladia SDK client factories", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes the API key and optional proxy URL to the official SDK", () => {
    const client = createPreRecordedClient({
      apiKey: "key",
      apiUrl: "https://proxy.example.test",
      localFileRoots: [],
    });

    expect(sdk.constructor).toHaveBeenCalledWith({
      apiKey: "key",
      apiUrl: "https://proxy.example.test",
      httpHeaders: gladiaVersionHeader,
    });
    expect(client).toEqual({ client: "pre-recorded" });
  });

  it("lets the SDK use its default API URL when no proxy is configured", () => {
    createPreRecordedClient({ apiKey: "key", localFileRoots: [] });
    expect(sdk.constructor).toHaveBeenCalledWith({
      apiKey: "key",
      httpHeaders: gladiaVersionHeader,
    });
  });

  it("builds a live client with the same SDK options", () => {
    const client = createLiveClient({
      apiKey: "key",
      apiUrl: "https://proxy.example.test",
      localFileRoots: [],
    });

    expect(sdk.constructor).toHaveBeenCalledWith({
      apiKey: "key",
      apiUrl: "https://proxy.example.test",
      httpHeaders: gladiaVersionHeader,
    });
    expect(sdk.liveV2).toHaveBeenCalledOnce();
    expect(client).toEqual({ client: "live" });
  });
});
