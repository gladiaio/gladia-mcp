import { describe, expect, it } from "vitest";

import { safeErrorMessage, toolError } from "../src/lib/errors.js";

describe("Gladia error sanitization", () => {
  it("maps supported HTTP statuses without exposing upstream details", () => {
    expect(safeErrorMessage({ status: 401, message: "secret" })).toContain(
      "GLADIA_API_KEY",
    );
    expect(safeErrorMessage({ statusCode: 404 }, "job-id")).toBe(
      "Gladia transcription job-id was not found.",
    );
    expect(
      safeErrorMessage({ statusCode: 404 }, "job-id", "pre-recorded"),
    ).toBe("Gladia pre-recorded transcription job-id was not found.");
    expect(safeErrorMessage({ statusCode: 404 }, "job-id", "live")).toBe(
      "Gladia live transcription job-id was not found.",
    );
    expect(safeErrorMessage(new Error("request returned 404"))).toContain(
      "resource was not found",
    );
    expect(safeErrorMessage({ status: 429 })).toContain("rate-limited");
  });

  it("surfaces Gladia API messages from HttpError response bodies", () => {
    const httpError = {
      name: "HttpError",
      status: 400,
      message:
        'Failed to download or upload the input file with error: Unprocessable media: "Only mono and stereo supported, got 3 channels"  | G-d40f1c72 | 400 | POST /v2/upload',
      url: "https://api.gladia.io/v2/upload",
      responseBody: {
        statusCode: 400,
        timestamp: "2026-09-17T18:24:13.575Z",
        path: "/v2/upload",
        message:
          'Failed to download or upload the input file with error: Unprocessable media: "Only mono and stereo supported, got 3 channels" ',
        request_id: "G-d40f1c72",
      },
      responseHeaders: { "x-gladia-key": "should-not-leak" },
    };

    expect(safeErrorMessage(httpError)).toBe(
      'Gladia rejected the request: Failed to download or upload the input file with error: Unprocessable media: "Only mono and stereo supported, got 3 channels" (request_id: G-d40f1c72)',
    );
    expect(safeErrorMessage(httpError)).not.toContain("should-not-leak");
    expect(safeErrorMessage(httpError)).not.toContain("https://");
  });

  it("includes Gladia validation_errors when present", () => {
    expect(
      safeErrorMessage({
        name: "HttpError",
        status: 400,
        message: "Invalid parameter | G-1 | 400 | POST /v2/pre-recorded",
        responseBody: {
          message: "Invalid parameter",
          request_id: "G-1",
          validation_errors: [
            'Field "language" must be a string',
            'Field "min_speakers" must be a number',
          ],
        },
      }),
    ).toBe(
      'Gladia rejected the request: Invalid parameter: Field "language" must be a string; Field "min_speakers" must be a number (request_id: G-1)',
    );
  });

  it("falls back to the HttpError message prefix when responseBody is plain text", () => {
    expect(
      safeErrorMessage({
        name: "HttpError",
        status: 413,
        message: "Payload too large | G-2 | 413 | POST /v2/upload",
        responseBody: "Payload too large",
      }),
    ).toBe("Gladia rejected the request: Payload too large (request_id: G-2)");
  });

  it("uses a generic message for unknown failures and returns MCP tool errors", () => {
    expect(safeErrorMessage("socket exploded")).not.toContain(
      "socket exploded",
    );
    expect(toolError(new Error("unknown"))).toEqual({
      content: [
        {
          type: "text",
          text: "The Gladia request failed. Check the server logs and try again.",
        },
      ],
      isError: true,
    });
  });
});
