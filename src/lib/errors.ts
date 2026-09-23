import type { CallToolResult } from "@modelcontextprotocol/server";

export type TranscriptionMode = "pre-recorded" | "live";

function statusFrom(error: unknown): number | undefined {
  if (typeof error === "object" && error !== null) {
    const candidate = error as { status?: unknown; statusCode?: unknown };
    const status = candidate.status ?? candidate.statusCode;
    if (typeof status === "number") return status;
  }

  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/\b(401|404|429)\b/);
  return match ? Number(match[1]) : undefined;
}

/** Pull Gladia's user-facing message (+ optional request_id) out of an SDK HttpError. */
function gladiaDetails(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;

  const { name, message, requestId, responseBody } = error as {
    name?: unknown;
    message?: unknown;
    requestId?: unknown;
    responseBody?: unknown;
  };

  let text: string | undefined;
  let id = typeof requestId === "string" ? requestId : undefined;

  if (typeof responseBody === "object" && responseBody !== null) {
    const body = responseBody as Record<string, unknown>;
    if (typeof body.message === "string" && body.message.trim()) {
      text = body.message.trim();
      const errors = body.validation_errors;
      if (
        Array.isArray(errors) &&
        errors.length > 0 &&
        errors.every((entry) => typeof entry === "string")
      ) {
        text += `: ${errors.join("; ")}`;
      }
    }
    if (typeof body.request_id === "string") id = body.request_id;
  } else if (name === "HttpError" && typeof message === "string") {
    // SDK format: "<gladia message> | <request_id> | <status> | <METHOD path>"
    const [prefix, maybeId] = message.split(" | ");
    text = prefix?.trim() || undefined;
    if (!id && maybeId && /^G-[\w-]+$/i.test(maybeId.trim())) {
      id = maybeId.trim();
    }
  }

  if (
    !text ||
    /(?:x-gladia-key|api[_-]?key|authorization|https?:\/\/)/i.test(text)
  ) {
    return undefined;
  }
  return id ? `${text} (request_id: ${id})` : text;
}

function notFoundMessage(jobId?: string, mode?: TranscriptionMode): string {
  if (!jobId) {
    return "The requested Gladia resource was not found.";
  }
  if (mode === "live") {
    return `Gladia live transcription ${jobId} was not found.`;
  }
  if (mode === "pre-recorded") {
    return `Gladia pre-recorded transcription ${jobId} was not found.`;
  }
  return `Gladia transcription ${jobId} was not found.`;
}

export function safeErrorMessage(
  error: unknown,
  jobId?: string,
  mode?: TranscriptionMode,
): string {
  if (
    error instanceof Error &&
    "userFacing" in error &&
    error.userFacing === true
  ) {
    return error.message;
  }

  switch (statusFrom(error)) {
    case 401:
      return "Gladia rejected the credentials. Check GLADIA_API_KEY and try again.";
    case 404:
      return notFoundMessage(jobId, mode);
    case 429:
      return "Gladia rate-limited the request. Wait before trying again.";
    default: {
      const details = gladiaDetails(error);
      return details
        ? `Gladia rejected the request: ${details}`
        : "The Gladia request failed. Check the server logs and try again.";
    }
  }
}

export function toolError(
  error: unknown,
  jobId?: string,
  mode?: TranscriptionMode,
): CallToolResult {
  return {
    content: [{ type: "text", text: safeErrorMessage(error, jobId, mode) }],
    isError: true,
  };
}
