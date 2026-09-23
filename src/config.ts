import { homedir } from "node:os";
import path from "node:path";

export interface ServerConfig {
  apiKey: string;
  apiUrl?: string;
  localFileRoots: string[];
}

type Environment = Record<string, string | undefined>;

/** Default trusted root for local uploads when GLADIA_LOCAL_FILE_ROOTS is unset. */
export function defaultLocalFileRoot(): string {
  return path.join(homedir(), "Desktop");
}

function parseLocalFileRoots(raw: string | undefined): string[] {
  if (raw === undefined) {
    return [defaultLocalFileRoot()];
  }

  return raw
    .split(path.delimiter)
    .map((root) => root.trim())
    .filter(Boolean)
    .map((root) => path.resolve(root));
}

export function loadConfig(env: Environment = process.env): ServerConfig {
  const apiKey = env.GLADIA_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("GLADIA_API_KEY is required");
  }

  const apiUrl = env.GLADIA_API_URL?.trim();
  return {
    apiKey,
    localFileRoots: parseLocalFileRoots(env.GLADIA_LOCAL_FILE_ROOTS),
    ...(apiUrl ? { apiUrl } : {}),
  };
}
