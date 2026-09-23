import * as z from "zod/v4";

export const languageCodeSchema = z
  .string()
  .regex(/^[a-z]{2,3}$/, "Use a lowercase ISO 639 language code");

const languageConfig = z
  .object({
    languages: z.array(languageCodeSchema).max(5).optional(),
    code_switching: z.boolean().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.code_switching &&
      (!value.languages || value.languages.length === 0)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "code_switching requires between one and five expected languages",
        path: ["languages"],
      });
    }
  });

const customVocabularyEntry = z.union([
  z.string().min(1),
  z
    .object({
      value: z.string().min(1),
      intensity: z.number().min(0).max(1).optional(),
      pronunciations: z.array(z.string().min(1)).optional(),
      language: languageCodeSchema.optional(),
    })
    .strict(),
]);

export const transcriptionInputSchema = z
  .object({
    audio_url: z
      .url()
      .refine(
        (value) => new URL(value).protocol === "https:",
        "audio_url must use HTTPS",
      ),
    language_config: languageConfig.optional(),
    diarization: z.boolean().optional(),
    diarization_config: z
      .object({
        number_of_speakers: z.number().int().positive().optional(),
        min_speakers: z.number().int().positive().optional(),
        max_speakers: z.number().int().positive().optional(),
      })
      .strict()
      .optional(),
    translation: z.boolean().optional(),
    translation_config: z
      .object({
        target_languages: z.array(languageCodeSchema).min(1),
        model: z.enum(["base", "batch", "enhanced"]).optional(),
        match_original_utterances: z.boolean().optional(),
        lipsync: z.boolean().optional(),
        context_adaptation: z.boolean().optional(),
        context: z.string().optional(),
        informal: z.boolean().optional(),
      })
      .strict()
      .optional(),
    subtitles: z.boolean().optional(),
    subtitles_config: z
      .object({
        formats: z
          .array(z.enum(["srt", "vtt"]))
          .min(1)
          .optional(),
        minimum_duration: z.number().nonnegative().optional(),
        maximum_duration: z.number().positive().optional(),
        maximum_characters_per_row: z.number().int().positive().optional(),
        maximum_rows_per_caption: z.number().int().positive().optional(),
        style: z.enum(["default", "compliance"]).optional(),
      })
      .strict()
      .optional(),
    summarization: z.boolean().optional(),
    summarization_config: z
      .object({
        type: z.enum(["general", "bullet_points", "concise"]).optional(),
      })
      .strict()
      .optional(),
    sentiment_analysis: z.boolean().optional(),
    named_entity_recognition: z.boolean().optional(),
    pii_redaction: z.boolean().optional(),
    pii_redaction_config: z
      .object({
        entity_types: z.string().min(1).optional(),
        processed_text_type: z.enum(["MARKER", "MASK"]).optional(),
      })
      .strict()
      .optional(),
    custom_vocabulary: z.boolean().optional(),
    custom_vocabulary_config: z
      .object({
        vocabulary: z.array(customVocabularyEntry).min(1),
        default_intensity: z.number().min(0).max(1).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type TranscriptionInput = z.infer<typeof transcriptionInputSchema>;
