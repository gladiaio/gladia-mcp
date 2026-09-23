# AGENTS.md

## Project mission

This repository publishes `@gladiaio/mcp`, a customer-facing MCP server for Gladia transcription. MCP hosts launch the package over stdio, provide the customer's `GLADIA_API_KEY`, and receive tools, resources, and prompts backed by the official Gladia JavaScript SDK.

V1 is intentionally small and stateless:

- TypeScript ESM on Node.js 22.18 or newer.
- stdio transport only.
- One Gladia account/API key per process.
- Pre-recorded job creation plus pre-recorded and live get/list/delete.
- No live session create or audio streaming through MCP.
- Job creation is asynchronous: return the Gladia job ID immediately and let the host call `get_pre_recorded_transcription`.
- Every Gladia request goes through `@gladiaio/sdk`; do not add a parallel REST client or shell out to a CLI.

## Non-negotiable invariants

Preserve these unless the product requirements explicitly change:

1. Never write logs to stdout. Stdout is the MCP JSON-RPC channel; diagnostics belong on stderr.
2. Never accept an API key as a tool argument, echo it in results, or include it in logs.
3. Keep tool errors sanitized. Models should receive actionable 401/404/429 messages, not raw SDK responses, headers, URLs containing credentials, or transcript payloads.
4. Do not make `transcribe_pre_recorded` poll. Long-running state belongs to Gladia and is represented by the returned job ID.
5. Do not bypass missing SDK features with raw `fetch`. Every Gladia operation this server exposes must go through a typed `@gladiaio/sdk` method.
6. Do not weaken the local-file boundary. Local uploads must stay limited to configured roots (Desktop when `GLADIA_LOCAL_FILE_ROOTS` is unset; empty value disables uploads), canonicalized through `realpath`, checked after symlink resolution, restricted to regular files, and capped at 1,000,000,000 bytes.
7. The MCP process must not fetch `audio_url` itself. HTTPS URLs are passed to Gladia through the SDK.
8. Keep tool, resource, and prompt registration deterministic. Some hosts cache list responses, and tests assert the current order.
9. Add or change behavior test-first. Capture the red test, implement the smallest coherent change, then refactor.

## Current public surface

Tools, in registration order:

1. `delete_live_transcription({ id })`
2. `delete_pre_recorded_transcription({ id })`
3. `get_live_transcription({ id })`
4. `get_pre_recorded_transcription({ id })`
5. `list_live_transcriptions({ offset, limit, date, before_date, after_date, status, custom_metadata, url })`
6. `list_pre_recorded_transcriptions({ offset, limit, date, before_date, after_date, status, custom_metadata, url })`
7. `transcribe_pre_recorded({ audio_url, ...options })`
8. `upload_audio({ file_path })`

`transcribe_pre_recorded` exposes language configuration, diarization, translation, subtitles, summarization, sentiment analysis, named-entity recognition, PII redaction, and custom vocabulary. Its request shape deliberately follows `PreRecordedV2InitTranscriptionRequest` field names.

Live tools manage existing sessions only. They must never start WebSocket streaming or accept audio chunks.

Resources:

- `gladia://pre-recorded/{id}`
- `gladia://live/{id}`
- `gladia://docs/feature-matrix`
- `gladia://docs/pre-recorded-limits`
- `gladia://docs/sdk-policy`

Prompts:

- `explain_transcription_result`
- `transcribe_and_translate`
- `transcribe_with_diarization`

All tools publish Zod input/output schemas and return both `structuredContent` and a JSON text fallback. Creation also returns a `resource_link` to the dynamic job resource.

## Code map

- `src/index.ts` is the executable boundary. It loads environment configuration, creates the SDK clients, and calls `serveStdio`. Keep it thin and side-effect-only.
- `src/server.ts` is the public MCP composition root. It registers tools, resources, prompts, annotations, output schemas, and safe operation logs. Dependencies are injected through `createServer` so tests never require a real API.
- `src/config.ts` owns environment parsing. Supported variables are `GLADIA_API_KEY`, optional `GLADIA_API_URL`, and optional path-delimited `GLADIA_LOCAL_FILE_ROOTS` (Desktop default when unset; empty disables local uploads).
- `src/gladia/client.ts` is the only production SDK construction point. `PreRecordedClient` and `LiveClient` are the narrow mockable interfaces used by the MCP layer.
- `src/schemas/transcription.ts` owns the curated public transcription schema and cross-field safety rules such as constrained code switching.
- `src/lib/local-files.ts` owns all local-path authorization and file-size enforcement.
- `src/lib/errors.ts` owns the user-visible error boundary. Only explicitly marked local-file errors may pass their original messages through.
- `src/resources/content.ts` contains bundled static resource data. It must remain self-contained in the compiled package.
- `tests/server.test.ts` exercises the public surface through an in-memory MCP client, rather than calling handlers as ordinary functions.
- `tests/stdio.stdio.ts` spawns the actual built executable and catches stdout/startup regressions.
- `tests/pre-recorded.integration.ts` is the explicit, billable real-API test and is never part of pull-request CI.

## Development workflow

Use npm and commit `package-lock.json`. Do not substitute another package manager without deliberately changing CI and release documentation.

Use Node 22 or 24 for development commands. The machine's system Node may be an odd-numbered release that current Vitest/tsdown versions intentionally reject.

Common commands:

```sh
npm ci
npm test
npm run typecheck
npm run test:coverage
npm run build
npm run test:stdio
npm run check
```

`npm run check` is the handoff gate. It runs formatting checks, Oxlint, strict TypeScript checks, coverage, build, the real stdio smoke test, publint, and an npm package dry run.

The real Gladia test requires explicit credentials and creates a billable job that it deletes in `finally`:

```sh
GLADIA_API_KEY=... \
GLADIA_TEST_AUDIO_URL=https://... \
npm run test:integration
```

Never run that test merely to validate a refactor. Unit and in-memory MCP tests should cover normal development.

## Testing expectations

- Maintain at least 90% statements, branches, functions, and lines across covered source.
- Prefer the narrow `PreRecordedClient` and `LiveClient` mocks over mocking network primitives.
- Test schemas over the MCP protocol so SDK conversion, advertised JSON Schema, argument rejection, and output validation are covered together.
- For every tool, cover successful SDK delegation, exact request mapping, annotations, structured output, and sanitized failure behavior.
- For filesystem work, cover the Desktop default, empty-root disable, allowed paths, traversal, symlink escapes, directories, missing/invalid files, and both sides of the size boundary.
- Any change to the executable or package layout needs a built-binary stdio test.
- Close the MCP client before the server in test cleanup to prevent hanging exchanges.

GitHub Actions runs tests on Node 22 and 24. A separate Node 24 job checks formatting, lint, build, and package contents. Commitlint follows Conventional Commits and validates the complete pull-request commit range.

## Dependency and SDK policy

The repository starts from current stable releases and locks the resolved graph. When updating dependencies:

1. Check the current official Gladia SDK types and MCP server documentation before changing code.
2. Install the latest mutually compatible releases, refresh `package-lock.json`, and run the full Node 22/24 matrix locally when practical.
3. Verify the packed artifact with `publint` and `npm pack --dry-run`.
4. Inspect SDK request/response type changes instead of preserving stale local assumptions with broad casts.

TypeScript 7 currently causes tsdown to print a non-blocking experimental-API warning. `skipLibCheck` exists because upstream SDK/tool declarations have produced errors under the newest compiler; strict checking remains enabled for this repository. Revisit the exception when upstream declarations become clean, but do not remove it without running the complete type check.

## How to extend the server

For a new tool:

1. Confirm the operation exists in the official SDK.
2. Write an in-memory MCP test that asserts name, schema, annotations, SDK call, structured output, text fallback, and sanitized failure.
3. Add only the required method to `PreRecordedClient` or `LiveClient`.
4. Register the tool in deterministic lexical order in `src/server.ts`.
5. Update the static feature matrix and README.
6. Run `npm run check` and verify both supported Node majors.

For new transcription options, prefer a curated schema over exposing an unbounded raw object. Keep public field names aligned with SDK fields, add runtime validation for known enum/range/cross-field constraints, and prove the exact object passed to `client.create()`.

For a new transport, keep `createServer` transport-independent. Add a separate executable/adapter around the existing server factory rather than mixing HTTP lifecycle, OAuth, or tenant state into stdio startup.

## Prioritized next steps

1. **Harden transcription validation and discoverability.** Add descriptions for every advertised field, use current SDK-derived enums where practical, validate speaker/subtitle ranges, and reject feature configs that would be silently ignored because their enabling flag is false or absent.
2. **Improve result ergonomics.** Evaluate optional compact/result-section views for large completed transcripts while retaining the full structured response and dynamic resource. Measure host token limits before changing defaults. Consider a compact list view so `list_pre_recorded_transcriptions` and `list_live_transcriptions` do not return full completed results by default.
3. **Harden trusted publishing.** The PR-gated Publish workflow (`.github/workflows/publish.yml`) already tags and publishes with npm provenance via `NPM_TOKEN`. Prefer migrating that job to npm OIDC trusted publishing (no long-lived token) once `@gladiaio` org ownership is confirmed. Publishing still requires explicit maintainer authorization via workflow_dispatch + release PR merge.
4. **Add hosted Streamable HTTP only with an authentication design.** Reuse `createServer`, add OAuth 2.1/PKCE and tenant-scoped client construction, and test that credentials cannot cross requests. Do not reuse the single-client stdio lifetime for multi-tenant HTTP.
5. **Consider live session create only after product validation.** MCP must still not proxy continuous microphone/audio chunks. A future tool may create a live session URL while applications stream audio directly with the Gladia SDK.

## Definition of done

A change is ready when behavior and documentation agree, new behavior began with a failing test, `npm run check` passes, Node 22 and 24 remain supported, no secret or transcript data was added to logs, and the npm dry-run contains only the intended distributable files.
