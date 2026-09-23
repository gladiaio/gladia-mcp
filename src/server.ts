import type {
  LiveV2ListParams,
  PreRecordedV2InitTranscriptionRequest,
  PreRecordedV2ListParams,
} from "@gladiaio/sdk";
import {
  McpServer,
  ResourceTemplate,
  type CallToolResult,
} from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import packageJson from "../package.json" with { type: "json" };
import type { LiveClient, PreRecordedClient } from "./gladia/client.js";
import { safeErrorMessage, toolError } from "./lib/errors.js";
import { resolveAllowedLocalFile } from "./lib/local-files.js";
import {
  featureMatrix,
  preRecordedLimits,
  sdkPolicy,
} from "./resources/content.js";
import {
  listTranscriptionsInputSchema,
  type ListTranscriptionsInput,
} from "./schemas/list.js";
import {
  languageCodeSchema,
  transcriptionInputSchema,
  type TranscriptionInput,
} from "./schemas/transcription.js";

const jobIdSchema = z.uuid();
const jobInputSchema = z.object({ id: jobIdSchema }).strict();
const jsonObjectSchema = z.record(z.string(), z.unknown());
const uploadOutputSchema = z.object({
  audio_url: z.string(),
  audio_metadata: jsonObjectSchema,
});
const createOutputSchema = z.object({ id: z.string(), result_url: z.string() });
const deleteOutputSchema = z.object({ id: z.string(), deleted: z.boolean() });
const listOutputSchema = z.object({
  first: z.string(),
  current: z.string(),
  next: z.string().nullable(),
  items: z.array(jsonObjectSchema),
});

type ResolveLocalFile = (filePath: string, roots: string[]) => Promise<string>;

export interface OperationLog {
  tool: string;
  durationMs: number;
  jobId?: string;
  errorClass?: string;
}

type Logger = (entry: OperationLog) => void;

export interface CreateServerOptions {
  client: PreRecordedClient;
  liveClient: LiveClient;
  localFileRoots: string[];
  version?: string;
  resolveLocalFile?: ResolveLocalFile;
  logger?: Logger;
}

function jsonContent(value: unknown): { type: "text"; text: string } {
  return { type: "text", text: JSON.stringify(value, null, 2) };
}

function asSdkRequest(
  input: TranscriptionInput,
): PreRecordedV2InitTranscriptionRequest {
  return input as PreRecordedV2InitTranscriptionRequest;
}

function asListParams(input: ListTranscriptionsInput): PreRecordedV2ListParams {
  return input as PreRecordedV2ListParams;
}

function asLiveListParams(input: ListTranscriptionsInput): LiveV2ListParams {
  return input as LiveV2ListParams;
}

function defaultLogger(entry: OperationLog): void {
  console.error(JSON.stringify(entry));
}

function errorClass(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

export function createServer(options: CreateServerOptions): McpServer {
  const server = new McpServer(
    { name: "gladia", version: options.version ?? packageJson.version },
    {
      instructions:
        "Create pre-recorded jobs asynchronously with transcribe_pre_recorded, then poll with get_pre_recorded_transcription until status is done or error. Use list_pre_recorded_transcriptions and delete_pre_recorded_transcription to browse or remove pre-recorded jobs. Manage existing live sessions with get_live_transcription, list_live_transcriptions, and delete_live_transcription — this server cannot start or stream live sessions. Pre-recorded IDs and live IDs are separate namespaces; use the matching tool family. Transcription is billable.",
    },
  );
  const resolveLocal = options.resolveLocalFile ?? resolveAllowedLocalFile;
  const logger = options.logger ?? defaultLogger;

  server.registerTool(
    "delete_live_transcription",
    {
      title: "Delete Gladia live transcription",
      description:
        "Delete an existing Gladia live transcription session and its data. Use only for live sessions created outside this MCP server. Does not start or stream a live session.",
      inputSchema: jobInputSchema,
      outputSchema: deleteOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ id }): Promise<CallToolResult> => {
      const startedAt = Date.now();
      try {
        const output = { id, deleted: await options.liveClient.delete(id) };
        logger({
          tool: "delete_live_transcription",
          jobId: id,
          durationMs: Date.now() - startedAt,
        });
        return { content: [jsonContent(output)], structuredContent: output };
      } catch (error) {
        logger({
          tool: "delete_live_transcription",
          jobId: id,
          durationMs: Date.now() - startedAt,
          errorClass: errorClass(error),
        });
        return toolError(error, id, "live");
      }
    },
  );

  server.registerTool(
    "delete_pre_recorded_transcription",
    {
      title: "Delete Gladia pre-recorded transcription",
      description:
        "Delete a pre-recorded transcription and its data from the caller's Gladia account.",
      inputSchema: jobInputSchema,
      outputSchema: deleteOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ id }): Promise<CallToolResult> => {
      const startedAt = Date.now();
      try {
        const output = { id, deleted: await options.client.delete(id) };
        logger({
          tool: "delete_pre_recorded_transcription",
          jobId: id,
          durationMs: Date.now() - startedAt,
        });
        return { content: [jsonContent(output)], structuredContent: output };
      } catch (error) {
        logger({
          tool: "delete_pre_recorded_transcription",
          jobId: id,
          durationMs: Date.now() - startedAt,
          errorClass: errorClass(error),
        });
        return toolError(error, id, "pre-recorded");
      }
    },
  );

  server.registerTool(
    "get_live_transcription",
    {
      title: "Get Gladia live transcription",
      description:
        "Fetch the status and available result for an existing Gladia live transcription session created outside this MCP server. Does not start or stream a live session.",
      inputSchema: jobInputSchema,
      outputSchema: jsonObjectSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ id }): Promise<CallToolResult> => {
      const startedAt = Date.now();
      try {
        const output = await options.liveClient.get(id);
        logger({
          tool: "get_live_transcription",
          jobId: id,
          durationMs: Date.now() - startedAt,
        });
        return { content: [jsonContent(output)], structuredContent: output };
      } catch (error) {
        logger({
          tool: "get_live_transcription",
          jobId: id,
          durationMs: Date.now() - startedAt,
          errorClass: errorClass(error),
        });
        return toolError(error, id, "live");
      }
    },
  );

  server.registerTool(
    "get_pre_recorded_transcription",
    {
      title: "Get Gladia pre-recorded transcription",
      description:
        "Fetch the status and available result for a Gladia pre-recorded transcription.",
      inputSchema: jobInputSchema,
      outputSchema: jsonObjectSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ id }): Promise<CallToolResult> => {
      const startedAt = Date.now();
      try {
        const output = await options.client.get(id);
        logger({
          tool: "get_pre_recorded_transcription",
          jobId: id,
          durationMs: Date.now() - startedAt,
        });
        return { content: [jsonContent(output)], structuredContent: output };
      } catch (error) {
        logger({
          tool: "get_pre_recorded_transcription",
          jobId: id,
          durationMs: Date.now() - startedAt,
          errorClass: errorClass(error),
        });
        return toolError(error, id, "pre-recorded");
      }
    },
  );

  server.registerTool(
    "list_live_transcriptions",
    {
      title: "List Gladia live transcriptions",
      description:
        "List existing Gladia live transcription sessions for the caller's account. Supports status/date filters, custom metadata filters, and pagination via offset/limit or a previous response's next/first/current URL. Does not start or stream live sessions.",
      inputSchema: listTranscriptionsInputSchema,
      outputSchema: listOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input): Promise<CallToolResult> => {
      const startedAt = Date.now();
      try {
        const output = await options.liveClient.list(asLiveListParams(input));
        logger({
          tool: "list_live_transcriptions",
          durationMs: Date.now() - startedAt,
        });
        return { content: [jsonContent(output)], structuredContent: output };
      } catch (error) {
        logger({
          tool: "list_live_transcriptions",
          durationMs: Date.now() - startedAt,
          errorClass: errorClass(error),
        });
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "list_pre_recorded_transcriptions",
    {
      title: "List Gladia pre-recorded transcriptions",
      description:
        "List pre-recorded transcription jobs for the caller's Gladia account. Supports status/date filters, custom metadata filters, and pagination via offset/limit or a previous response's next/first/current URL.",
      inputSchema: listTranscriptionsInputSchema,
      outputSchema: listOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input): Promise<CallToolResult> => {
      const startedAt = Date.now();
      try {
        const output = await options.client.list(asListParams(input));
        logger({
          tool: "list_pre_recorded_transcriptions",
          durationMs: Date.now() - startedAt,
        });
        return { content: [jsonContent(output)], structuredContent: output };
      } catch (error) {
        logger({
          tool: "list_pre_recorded_transcriptions",
          durationMs: Date.now() - startedAt,
          errorClass: errorClass(error),
        });
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "transcribe_pre_recorded",
    {
      title: "Create Gladia pre-recorded transcription",
      description:
        "Create an asynchronous, billable pre-recorded transcription on the caller's Gladia account. Returns immediately with a job ID. Does not create live sessions.",
      inputSchema: transcriptionInputSchema,
      outputSchema: createOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input): Promise<CallToolResult> => {
      const startedAt = Date.now();
      try {
        const output = await options.client.create(asSdkRequest(input));
        logger({
          tool: "transcribe_pre_recorded",
          jobId: output.id,
          durationMs: Date.now() - startedAt,
        });
        return {
          content: [
            jsonContent(output),
            {
              type: "resource_link",
              uri: `gladia://pre-recorded/${output.id}`,
              name: `Gladia pre-recorded transcription ${output.id}`,
              description:
                "Current status and result for this pre-recorded transcription job.",
              mimeType: "application/json",
            },
          ],
          structuredContent: output,
        };
      } catch (error) {
        logger({
          tool: "transcribe_pre_recorded",
          durationMs: Date.now() - startedAt,
          errorClass: errorClass(error),
        });
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "upload_audio",
    {
      title: "Upload audio to Gladia",
      description:
        "Upload a local audio or video file from an allowed root for later pre-recorded transcription. Paths must resolve under the Desktop folder by default, or under the directories listed in GLADIA_LOCAL_FILE_ROOTS.",
      inputSchema: z.object({ file_path: z.string().min(1) }).strict(),
      outputSchema: uploadOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ file_path }): Promise<CallToolResult> => {
      const startedAt = Date.now();
      try {
        const resolvedPath = await resolveLocal(
          file_path,
          options.localFileRoots,
        );
        const output = await options.client.uploadFile(resolvedPath);
        logger({ tool: "upload_audio", durationMs: Date.now() - startedAt });
        return { content: [jsonContent(output)], structuredContent: output };
      } catch (error) {
        logger({
          tool: "upload_audio",
          durationMs: Date.now() - startedAt,
          errorClass: errorClass(error),
        });
        return toolError(error);
      }
    },
  );

  server.registerResource(
    "feature-matrix",
    "gladia://docs/feature-matrix",
    {
      title: "Gladia MCP feature matrix",
      description: "Supported and deferred Gladia MCP capabilities.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(featureMatrix, null, 2),
        },
      ],
    }),
  );

  server.registerResource(
    "pre-recorded-limits",
    "gladia://docs/pre-recorded-limits",
    {
      title: "Gladia pre-recorded limits",
      description:
        "Async transcription concurrency, media duration/size/channels, and supported formats.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(preRecordedLimits, null, 2),
        },
      ],
    }),
  );

  server.registerResource(
    "sdk-policy",
    "gladia://docs/sdk-policy",
    {
      title: "Gladia MCP SDK policy",
      description: "SDK, billing, and local-file safety policy.",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "text/markdown", text: sdkPolicy }],
    }),
  );

  server.registerResource(
    "pre-recorded-result",
    new ResourceTemplate("gladia://pre-recorded/{id}", { list: undefined }),
    {
      title: "Gladia pre-recorded transcription",
      description:
        "Current status and result for a Gladia pre-recorded job ID.",
      mimeType: "application/json",
    },
    async (uri, variables) => {
      const id = String(variables.id);
      try {
        const output = await options.client.get(id);
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(output, null, 2),
            },
          ],
        };
      } catch (error) {
        throw new Error(safeErrorMessage(error, id, "pre-recorded"));
      }
    },
  );

  server.registerResource(
    "live-result",
    new ResourceTemplate("gladia://live/{id}", { list: undefined }),
    {
      title: "Gladia live transcription",
      description:
        "Current status and result for an existing Gladia live session ID. Does not start streaming.",
      mimeType: "application/json",
    },
    async (uri, variables) => {
      const id = String(variables.id);
      try {
        const output = await options.liveClient.get(id);
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(output, null, 2),
            },
          ],
        };
      } catch (error) {
        throw new Error(safeErrorMessage(error, id, "live"));
      }
    },
  );

  server.registerPrompt(
    "explain_transcription_result",
    {
      title: "Explain a Gladia pre-recorded transcription result",
      description:
        "Fetch a pre-recorded transcription resource and explain its status and available outputs.",
      argsSchema: z.object({
        id: jobIdSchema.describe("Gladia pre-recorded transcription job ID"),
      }),
    },
    ({ id }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Read gladia://pre-recorded/${id}. Explain its status, transcript, speakers, translations, subtitles, and intelligence results that are present. Do not invent missing results.`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "transcribe_and_translate",
    {
      title: "Transcribe and translate audio",
      description:
        "Create a pre-recorded transcription with translation enabled.",
      argsSchema: z.object({
        audio_url: z.url().describe("Public HTTPS audio or video URL"),
        target_language: languageCodeSchema.describe(
          "ISO 639 target language code",
        ),
      }),
    },
    ({ audio_url, target_language }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Call transcribe_pre_recorded for ${audio_url} with translation=true and translation_config.target_languages=[${target_language}]. Return the job ID and explain that get_pre_recorded_transcription should be used to check completion.`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "transcribe_with_diarization",
    {
      title: "Transcribe audio with diarization",
      description:
        "Create a pre-recorded transcription that identifies speakers.",
      argsSchema: z.object({
        audio_url: z.url().describe("Public HTTPS audio or video URL"),
      }),
    },
    ({ audio_url }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Call transcribe_pre_recorded for ${audio_url} with diarization=true. Return the job ID and explain that get_pre_recorded_transcription should be used to check completion.`,
          },
        },
      ],
    }),
  );

  return server;
}
