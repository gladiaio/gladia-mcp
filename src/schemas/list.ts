import * as z from "zod/v4";

const jobStatusSchema = z.enum(["queued", "processing", "done", "error"]);

/**
 * Curated list filters aligned with `PreRecordedV2ListParams`.
 * When `url` is set, the SDK follows that pagination link and ignores other filters.
 */
export const listTranscriptionsInputSchema = z
  .object({
    offset: z.number().int().nonnegative().optional(),
    limit: z.number().int().positive().optional(),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD")
      .optional(),
    before_date: z.string().min(1).optional(),
    after_date: z.string().min(1).optional(),
    status: z.array(jobStatusSchema).optional(),
    custom_metadata: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
      .optional(),
    url: z
      .url()
      .refine(
        (value) => new URL(value).protocol === "https:",
        "url must use HTTPS",
      )
      .optional(),
  })
  .strict();

export type ListTranscriptionsInput = z.infer<
  typeof listTranscriptionsInputSchema
>;
