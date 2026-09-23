import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createServer, type OperationLog } from "../src/server.js";
import type { LiveClient, PreRecordedClient } from "../src/gladia/client.js";

const jobId = "45463597-20b7-4af7-b3b3-f5fb778203ab";
const liveJobId = "55463597-20b7-4af7-b3b3-f5fb778203ab";

function mockGladiaClient(): PreRecordedClient {
  return {
    uploadFile: vi.fn().mockResolvedValue({
      audio_url: "https://api.gladia.io/file/audio.mp3",
      audio_metadata: {
        id: "file-id",
        filename: "audio.mp3",
        extension: "mp3",
        size: 5,
        audio_duration: 1,
        number_of_channels: 1,
      },
    }),
    create: vi.fn().mockResolvedValue({
      id: jobId,
      result_url: `https://api.gladia.io/v2/pre-recorded/${jobId}`,
    }),
    get: vi.fn().mockResolvedValue({
      id: jobId,
      request_id: "G-test",
      version: 2,
      status: "processing",
      created_at: "2026-09-09T00:00:00.000Z",
      kind: "pre-recorded",
    }),
    list: vi.fn().mockResolvedValue({
      first: "https://api.gladia.io/v2/pre-recorded?offset=0&limit=20",
      current: "https://api.gladia.io/v2/pre-recorded?offset=0&limit=20",
      next: null,
      items: [
        {
          id: jobId,
          request_id: "G-test",
          version: 2,
          status: "done",
          created_at: "2026-09-09T00:00:00.000Z",
          kind: "pre-recorded",
        },
      ],
    }),
    delete: vi.fn().mockResolvedValue(true),
  };
}

function mockLiveClient(): LiveClient {
  return {
    get: vi.fn().mockResolvedValue({
      id: liveJobId,
      request_id: "G-live",
      version: 2,
      status: "processing",
      created_at: "2026-09-09T00:00:00.000Z",
      kind: "live",
    }),
    list: vi.fn().mockResolvedValue({
      first: "https://api.gladia.io/v2/live?offset=0&limit=20",
      current: "https://api.gladia.io/v2/live?offset=0&limit=20",
      next: null,
      items: [
        {
          id: liveJobId,
          request_id: "G-live",
          version: 2,
          status: "done",
          created_at: "2026-09-09T00:00:00.000Z",
          kind: "live",
        },
      ],
    }),
    delete: vi.fn().mockResolvedValue(true),
  };
}

describe("Gladia MCP server", () => {
  let api: PreRecordedClient;
  let liveApi: LiveClient;
  let client: Client;
  let logger: (entry: OperationLog) => void;
  let server: ReturnType<typeof createServer>;

  beforeEach(async () => {
    api = mockGladiaClient();
    liveApi = mockLiveClient();
    logger = vi.fn();
    server = createServer({
      client: api,
      liveClient: liveApi,
      localFileRoots: ["/allowed"],
      version: "0.1.0",
      resolveLocalFile: vi.fn().mockResolvedValue("/allowed/audio.mp3"),
      logger,
    });
    client = new Client({ name: "test-client", version: "1.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
    await server.close();
  });

  it("advertises the deterministic v1 surface and annotations", async () => {
    const { tools } = await client.listTools();
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
    expect(
      tools.find((tool) => tool.name === "get_pre_recorded_transcription")
        ?.annotations,
    ).toMatchObject({
      readOnlyHint: true,
    });
    expect(
      tools.find((tool) => tool.name === "get_live_transcription")?.annotations,
    ).toMatchObject({
      readOnlyHint: true,
    });
    expect(
      tools.find((tool) => tool.name === "list_pre_recorded_transcriptions")
        ?.annotations,
    ).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    });
    expect(
      tools.find((tool) => tool.name === "list_live_transcriptions")
        ?.annotations,
    ).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    });
    expect(
      tools.find((tool) => tool.name === "delete_pre_recorded_transcription")
        ?.annotations,
    ).toMatchObject({
      destructiveHint: true,
    });
    expect(
      tools.find((tool) => tool.name === "delete_live_transcription")
        ?.annotations,
    ).toMatchObject({
      destructiveHint: true,
    });
    expect(
      tools.find((tool) => tool.name === "upload_audio")?.annotations,
    ).toMatchObject({ readOnlyHint: false });
  });

  it("uploads an allowed local file through the SDK", async () => {
    const result = await client.callTool({
      name: "upload_audio",
      arguments: { file_path: "/allowed/audio.mp3" },
    });

    expect(api.uploadFile).toHaveBeenCalledWith("/allowed/audio.mp3");
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      audio_url: "https://api.gladia.io/file/audio.mp3",
    });
  });

  it("creates an asynchronous transcription with the selected intelligence options", async () => {
    const result = await client.callTool({
      name: "transcribe_pre_recorded",
      arguments: {
        audio_url: "https://example.test/audio.mp3",
        language_config: { languages: ["en", "fr"], code_switching: true },
        diarization: true,
        diarization_config: { min_speakers: 2, max_speakers: 4 },
        translation: true,
        translation_config: { target_languages: ["fr"], model: "batch" },
        subtitles: true,
        subtitles_config: { formats: ["srt", "vtt"] },
        summarization: true,
        summarization_config: { type: "bullet_points" },
        sentiment_analysis: true,
        named_entity_recognition: true,
        pii_redaction: true,
        pii_redaction_config: {
          entity_types: "GDPR",
          processed_text_type: "MASK",
        },
        custom_vocabulary: true,
        custom_vocabulary_config: { vocabulary: ["Gladia"] },
      },
    });

    expect(api.create).toHaveBeenCalledWith(
      expect.objectContaining({
        audio_url: "https://example.test/audio.mp3",
        diarization: true,
        translation_config: { target_languages: ["fr"], model: "batch" },
        pii_redaction_config: {
          entity_types: "GDPR",
          processed_text_type: "MASK",
        },
      }),
    );
    expect(result.structuredContent).toMatchObject({ id: jobId });
    expect(result.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "resource_link",
          uri: `gladia://pre-recorded/${jobId}`,
          description: expect.stringContaining("Current status"),
        }),
      ]),
    );
    expect(logger).toHaveBeenCalledWith(
      expect.objectContaining({
        tool: "transcribe_pre_recorded",
        jobId,
        durationMs: expect.any(Number),
      }),
    );
  });

  it("rejects unsafe URLs and invalid code-switching configuration before the SDK call", async () => {
    const unsafe = await client.callTool({
      name: "transcribe_pre_recorded",
      arguments: { audio_url: "http://example.test/audio.mp3" },
    });
    const invalidLanguages = await client.callTool({
      name: "transcribe_pre_recorded",
      arguments: {
        audio_url: "https://example.test/audio.mp3",
        language_config: { languages: [], code_switching: true },
      },
    });

    expect(unsafe.isError).toBe(true);
    expect(invalidLanguages.isError).toBe(true);
    expect(api.create).not.toHaveBeenCalled();
  });

  it("gets and deletes a pre-recorded transcription through the SDK", async () => {
    const getResult = await client.callTool({
      name: "get_pre_recorded_transcription",
      arguments: { id: jobId },
    });
    const deleteResult = await client.callTool({
      name: "delete_pre_recorded_transcription",
      arguments: { id: jobId },
    });

    expect(api.get).toHaveBeenCalledWith(jobId);
    expect(liveApi.get).not.toHaveBeenCalled();
    expect(getResult.structuredContent).toMatchObject({ status: "processing" });
    expect(api.delete).toHaveBeenCalledWith(jobId);
    expect(liveApi.delete).not.toHaveBeenCalled();
    expect(deleteResult.structuredContent).toEqual({
      id: jobId,
      deleted: true,
    });
  });

  it("gets and deletes a live transcription through the live SDK client", async () => {
    const getResult = await client.callTool({
      name: "get_live_transcription",
      arguments: { id: liveJobId },
    });
    const deleteResult = await client.callTool({
      name: "delete_live_transcription",
      arguments: { id: liveJobId },
    });

    expect(liveApi.get).toHaveBeenCalledWith(liveJobId);
    expect(api.get).not.toHaveBeenCalled();
    expect(getResult.structuredContent).toMatchObject({
      status: "processing",
      kind: "live",
    });
    expect(liveApi.delete).toHaveBeenCalledWith(liveJobId);
    expect(api.delete).not.toHaveBeenCalled();
    expect(deleteResult.structuredContent).toEqual({
      id: liveJobId,
      deleted: true,
    });
  });

  it("lists pre-recorded transcriptions through the SDK with filters and pagination", async () => {
    const nextUrl =
      "https://api.gladia.io/v2/pre-recorded?offset=20&limit=20&status=done";
    const filters = {
      offset: 5,
      limit: 10,
      status: ["done", "error"] as const,
      after_date: "2026-09-01T00:00:00.000Z",
      custom_metadata: { user: "John Doe" },
    };

    const filtered = await client.callTool({
      name: "list_pre_recorded_transcriptions",
      arguments: filters,
    });
    const paginated = await client.callTool({
      name: "list_pre_recorded_transcriptions",
      arguments: { url: nextUrl },
    });
    const empty = await client.callTool({
      name: "list_pre_recorded_transcriptions",
      arguments: {},
    });

    expect(api.list).toHaveBeenNthCalledWith(1, filters);
    expect(api.list).toHaveBeenNthCalledWith(2, { url: nextUrl });
    expect(api.list).toHaveBeenNthCalledWith(3, {});
    expect(liveApi.list).not.toHaveBeenCalled();
    expect(filtered.structuredContent).toMatchObject({
      items: [{ id: jobId, status: "done" }],
      next: null,
    });
    expect(paginated.isError).not.toBe(true);
    expect(empty.isError).not.toBe(true);
    expect(logger).toHaveBeenCalledWith(
      expect.objectContaining({
        tool: "list_pre_recorded_transcriptions",
        durationMs: expect.any(Number),
      }),
    );
  });

  it("lists live transcriptions through the live SDK client", async () => {
    const nextUrl =
      "https://api.gladia.io/v2/live?offset=20&limit=20&status=done";
    const filters = {
      offset: 5,
      limit: 10,
      status: ["done", "error"] as const,
      after_date: "2026-09-01T00:00:00.000Z",
      custom_metadata: { user: "John Doe" },
    };

    const filtered = await client.callTool({
      name: "list_live_transcriptions",
      arguments: filters,
    });
    const paginated = await client.callTool({
      name: "list_live_transcriptions",
      arguments: { url: nextUrl },
    });

    expect(liveApi.list).toHaveBeenNthCalledWith(1, filters);
    expect(liveApi.list).toHaveBeenNthCalledWith(2, { url: nextUrl });
    expect(api.list).not.toHaveBeenCalled();
    expect(filtered.structuredContent).toMatchObject({
      items: [{ id: liveJobId, status: "done", kind: "live" }],
      next: null,
    });
    expect(paginated.isError).not.toBe(true);
    expect(logger).toHaveBeenCalledWith(
      expect.objectContaining({
        tool: "list_live_transcriptions",
        durationMs: expect.any(Number),
      }),
    );
  });

  it("rejects invalid list filters before the SDK call", async () => {
    const badDate = await client.callTool({
      name: "list_pre_recorded_transcriptions",
      arguments: { date: "09-01-2026" },
    });
    const badUrl = await client.callTool({
      name: "list_live_transcriptions",
      arguments: { url: "http://api.gladia.io/v2/live" },
    });
    const badStatus = await client.callTool({
      name: "list_pre_recorded_transcriptions",
      arguments: { status: ["running"] },
    });

    expect(badDate.isError).toBe(true);
    expect(badUrl.isError).toBe(true);
    expect(badStatus.isError).toBe(true);
    expect(api.list).not.toHaveBeenCalled();
    expect(liveApi.list).not.toHaveBeenCalled();
  });

  it("serves dynamic and static resources", async () => {
    const dynamic = await client.readResource({
      uri: `gladia://pre-recorded/${jobId}`,
    });
    const liveDynamic = await client.readResource({
      uri: `gladia://live/${liveJobId}`,
    });
    const matrix = await client.readResource({
      uri: "gladia://docs/feature-matrix",
    });
    const limits = await client.readResource({
      uri: "gladia://docs/pre-recorded-limits",
    });
    const policy = await client.readResource({
      uri: "gladia://docs/sdk-policy",
    });

    expect(api.get).toHaveBeenCalledWith(jobId);
    expect(liveApi.get).toHaveBeenCalledWith(liveJobId);
    expect(
      "text" in dynamic.contents[0]!
        ? JSON.parse(dynamic.contents[0].text)
        : {},
    ).toMatchObject({
      id: jobId,
    });
    expect(
      "text" in liveDynamic.contents[0]!
        ? JSON.parse(liveDynamic.contents[0].text)
        : {},
    ).toMatchObject({
      id: liveJobId,
      kind: "live",
    });
    expect(
      "text" in matrix.contents[0]! ? matrix.contents[0].text : "",
    ).toContain("get_live_transcription");
    expect(
      "text" in matrix.contents[0]! ? matrix.contents[0].text : "",
    ).toContain("live session create/streaming");
    expect(
      "text" in limits.contents[0]! ? JSON.parse(limits.contents[0].text) : {},
    ).toMatchObject({
      scope: "pre-recorded transcription",
      media: expect.objectContaining({
        max_duration_minutes: 135,
        max_file_size_mb: 1000,
        max_channels: 2,
      }),
      concurrency: expect.objectContaining({
        concurrency_exceeded_status: 429,
      }),
    });
    expect(
      "text" in policy.contents[0]! ? policy.contents[0].text : "",
    ).toContain("get_pre_recorded_transcription");
    expect(
      "text" in policy.contents[0]! ? policy.contents[0].text : "",
    ).toContain("cannot start or stream live sessions");
  });

  it("renders all three workflow prompts", async () => {
    const listed = await client.listPrompts();
    expect(listed.prompts.map((prompt) => prompt.name)).toEqual([
      "explain_transcription_result",
      "transcribe_and_translate",
      "transcribe_with_diarization",
    ]);

    const prompt = await client.getPrompt({
      name: "transcribe_and_translate",
      arguments: {
        audio_url: "https://example.test/audio.mp3",
        target_language: "fr",
      },
    });
    expect(prompt.messages[0]?.content).toMatchObject({ type: "text" });
    expect(JSON.stringify(prompt.messages)).toContain("fr");
    expect(JSON.stringify(prompt.messages)).toContain(
      "get_pre_recorded_transcription",
    );
  });

  it("sanitizes SDK failures into actionable tool errors", async () => {
    vi.mocked(api.create).mockRejectedValueOnce(
      new Error("401 request failed; x-gladia-key: super-secret"),
    );

    const result = await client.callTool({
      name: "transcribe_pre_recorded",
      arguments: { audio_url: "https://example.test/audio.mp3" },
    });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain("GLADIA_API_KEY");
    expect(JSON.stringify(result.content)).not.toContain("super-secret");
    expect(logger).toHaveBeenCalledWith(
      expect.objectContaining({
        tool: "transcribe_pre_recorded",
        errorClass: "Error",
      }),
    );
  });

  it("maps get, delete, list, and upload failures without leaking opaque SDK messages", async () => {
    vi.mocked(api.get).mockRejectedValueOnce({
      status: 404,
      message: "private response",
    });
    vi.mocked(api.delete).mockRejectedValueOnce({
      statusCode: 429,
      message: "private response",
    });
    vi.mocked(api.list).mockRejectedValueOnce({
      status: 401,
      message: "private response",
    });
    vi.mocked(api.uploadFile).mockRejectedValueOnce(
      new Error("private response"),
    );

    const getResult = await client.callTool({
      name: "get_pre_recorded_transcription",
      arguments: { id: jobId },
    });
    const deleteResult = await client.callTool({
      name: "delete_pre_recorded_transcription",
      arguments: { id: jobId },
    });
    const listResult = await client.callTool({
      name: "list_pre_recorded_transcriptions",
      arguments: {},
    });
    const uploadResult = await client.callTool({
      name: "upload_audio",
      arguments: { file_path: "/allowed/audio.mp3" },
    });

    expect(getResult.isError).toBe(true);
    expect(JSON.stringify(getResult.content)).toContain(
      `Gladia pre-recorded transcription ${jobId} was not found`,
    );
    expect(deleteResult.isError).toBe(true);
    expect(JSON.stringify(deleteResult.content)).toContain("rate-limited");
    expect(listResult.isError).toBe(true);
    expect(JSON.stringify(listResult.content)).toContain("GLADIA_API_KEY");
    expect(JSON.stringify(listResult.content)).not.toContain(
      "private response",
    );
    expect(uploadResult.isError).toBe(true);
    expect(JSON.stringify(uploadResult.content)).not.toContain(
      "private response",
    );
  });

  it("maps live get, delete, and list failures with mode-aware messages", async () => {
    vi.mocked(liveApi.get).mockRejectedValueOnce({
      status: 404,
      message: "private response",
    });
    vi.mocked(liveApi.delete).mockRejectedValueOnce({
      statusCode: 429,
      message: "private response",
    });
    vi.mocked(liveApi.list).mockRejectedValueOnce({
      status: 401,
      message: "private response",
    });

    const getResult = await client.callTool({
      name: "get_live_transcription",
      arguments: { id: liveJobId },
    });
    const deleteResult = await client.callTool({
      name: "delete_live_transcription",
      arguments: { id: liveJobId },
    });
    const listResult = await client.callTool({
      name: "list_live_transcriptions",
      arguments: {},
    });

    expect(getResult.isError).toBe(true);
    expect(JSON.stringify(getResult.content)).toContain(
      `Gladia live transcription ${liveJobId} was not found`,
    );
    expect(deleteResult.isError).toBe(true);
    expect(JSON.stringify(deleteResult.content)).toContain("rate-limited");
    expect(listResult.isError).toBe(true);
    expect(JSON.stringify(listResult.content)).toContain("GLADIA_API_KEY");
    expect(JSON.stringify(listResult.content)).not.toContain(
      "private response",
    );
  });

  it("returns Gladia's upload rejection message to the model", async () => {
    vi.mocked(api.uploadFile).mockRejectedValueOnce({
      name: "HttpError",
      status: 400,
      message:
        'Failed to download or upload the input file with error: Unprocessable media: "Only mono and stereo supported, got 3 channels"  | G-d40f1c72 | 400 | POST /v2/upload',
      url: "https://api.gladia.io/v2/upload",
      responseBody: {
        statusCode: 400,
        path: "/v2/upload",
        message:
          'Failed to download or upload the input file with error: Unprocessable media: "Only mono and stereo supported, got 3 channels" ',
        request_id: "G-d40f1c72",
      },
    });

    const uploadResult = await client.callTool({
      name: "upload_audio",
      arguments: { file_path: "/allowed/audio.mp3" },
    });

    expect(uploadResult.isError).toBe(true);
    const message = JSON.stringify(uploadResult.content);
    expect(message).toContain("Only mono and stereo supported, got 3 channels");
    expect(message).toContain("request_id: G-d40f1c72");
    expect(message).not.toContain("https://");
  });

  it("explains how to re-enable local uploads when roots were cleared", async () => {
    const disabledServer = createServer({
      client: api,
      liveClient: liveApi,
      localFileRoots: [],
    });
    const disabledClient = new Client({
      name: "disabled-client",
      version: "1.0.0",
    });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await disabledServer.connect(serverTransport);
    await disabledClient.connect(clientTransport);

    try {
      const result = await disabledClient.callTool({
        name: "upload_audio",
        arguments: { file_path: "/tmp/audio.mp3" },
      });
      expect(result.isError).toBe(true);
      const message = JSON.stringify(result.content);
      expect(message).toMatch(/GLADIA_LOCAL_FILE_ROOTS|Desktop/i);
    } finally {
      await disabledClient.close();
      await disabledServer.close();
    }
  });

  it("sanitizes failures from dynamic resources", async () => {
    vi.mocked(api.get).mockRejectedValueOnce({ status: 404 });
    vi.mocked(liveApi.get).mockRejectedValueOnce({ status: 404 });
    await expect(
      client.readResource({ uri: `gladia://pre-recorded/${jobId}` }),
    ).rejects.toThrow(
      `Gladia pre-recorded transcription ${jobId} was not found`,
    );
    await expect(
      client.readResource({ uri: `gladia://live/${liveJobId}` }),
    ).rejects.toThrow(`Gladia live transcription ${liveJobId} was not found`);
  });
});
