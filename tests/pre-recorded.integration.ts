import { GladiaClient } from "@gladiaio/sdk";
import { describe, expect, it } from "vitest";

const apiKey = process.env.GLADIA_API_KEY;
const audioUrl = process.env.GLADIA_TEST_AUDIO_URL;

describe.runIf(Boolean(apiKey && audioUrl))("Gladia pre-recorded API", () => {
  it("creates, polls, reads, and deletes a transcription", async () => {
    const client = new GladiaClient({ apiKey: apiKey! }).preRecorded();
    const created = await client.create({ audio_url: audioUrl! });

    try {
      const completed = await client.poll(created.id, {
        interval: 3_000,
        timeout: 120_000,
      });
      expect(completed.status).toBe("done");
      expect((await client.get(created.id)).id).toBe(created.id);
    } finally {
      await client.delete(created.id);
    }
  });
});
