import {
  GladiaClient,
  type LiveV2ListParams,
  type LiveV2ListResponse,
  type LiveV2Response,
  type PreRecordedV2AudioUploadResponse,
  type PreRecordedV2InitTranscriptionRequest,
  type PreRecordedV2InitTranscriptionResponse,
  type PreRecordedV2ListParams,
  type PreRecordedV2ListResponse,
  type PreRecordedV2Response,
} from "@gladiaio/sdk";

import packageJson from "../../package.json" with { type: "json" };
import type { ServerConfig } from "../config.js";

export interface PreRecordedClient {
  uploadFile(filePath: string): Promise<PreRecordedV2AudioUploadResponse>;
  create(
    options: PreRecordedV2InitTranscriptionRequest,
  ): Promise<PreRecordedV2InitTranscriptionResponse>;
  get(jobId: string): Promise<PreRecordedV2Response>;
  list(params?: PreRecordedV2ListParams): Promise<PreRecordedV2ListResponse>;
  delete(jobId: string): Promise<boolean>;
}

export interface LiveClient {
  get(jobId: string): Promise<LiveV2Response>;
  list(params?: LiveV2ListParams): Promise<LiveV2ListResponse>;
  delete(jobId: string): Promise<boolean>;
}

function createGladiaSdk(config: ServerConfig): GladiaClient {
  return new GladiaClient({
    apiKey: config.apiKey,
    ...(config.apiUrl ? { apiUrl: config.apiUrl } : {}),
    httpHeaders: {
      "x-gladia-version": `mcp/${packageJson.version}`,
    },
  });
}

export function createPreRecordedClient(
  config: ServerConfig,
): PreRecordedClient {
  return createGladiaSdk(config).preRecorded();
}

export function createLiveClient(config: ServerConfig): LiveClient {
  return createGladiaSdk(config).liveV2();
}
