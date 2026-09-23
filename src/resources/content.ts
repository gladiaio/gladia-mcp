export const featureMatrix = {
  scope: "pre-recorded job creation plus pre-recorded and live get/list/delete",
  tools: {
    delete_live_transcription:
      "Delete an existing live transcription session and its data. Does not start streaming.",
    delete_pre_recorded_transcription:
      "Delete a pre-recorded transcription and its data.",
    get_live_transcription:
      "Read status and completed results for an existing live session created outside this MCP server.",
    get_pre_recorded_transcription:
      "Read pre-recorded job status and completed results.",
    list_live_transcriptions:
      "List existing live sessions with filters and pagination. Does not start streaming.",
    list_pre_recorded_transcriptions:
      "List pre-recorded jobs with filters and pagination.",
    transcribe_pre_recorded:
      "Create an asynchronous pre-recorded transcription.",
    upload_audio:
      "Upload a local audio or video file from an allowed root (Desktop by default).",
  },
  supported_intelligence: [
    "language configuration",
    "diarization",
    "translation",
    "subtitles",
    "summarization",
    "sentiment analysis",
    "named entity recognition",
    "PII redaction",
    "custom vocabulary",
  ],
  deferred: [
    "live session create/streaming",
    "audio-to-LLM",
    "custom spelling",
  ],
};

export const preRecordedLimits = {
  scope: "pre-recorded transcription",
  sources: [
    "https://docs.gladia.io/chapters/limits-and-specifications/concurrency",
    "https://docs.gladia.io/chapters/limits-and-specifications/supported-formats",
  ],
  media: {
    max_duration_minutes: 135,
    max_duration_minutes_enterprise: 255,
    max_file_size_mb: 1000,
    max_channels: 2,
    split_recommendation:
      "Split files near or over the duration/size limits into ~60 minute chunks.",
  },
  concurrency: {
    free: {
      monthly_usage_hours: 10,
      max_concurrent_jobs: 3,
    },
    paid: {
      monthly_usage_hours: null,
      max_concurrent_jobs: 25,
      max_queued_jobs: 300,
    },
    enterprise: {
      monthly_usage_hours: null,
      max_concurrent_jobs: "on_demand",
    },
    concurrency_exceeded_status: 429,
    note: "Paid defaults are 25 parallel pre-recorded jobs plus up to 300 queued. Higher limits need a capacity check with Gladia sales.",
  },
  audio_formats: [
    { format: "aac", mime_type: "audio/aac" },
    { format: "ac3", mime_type: "audio/ac3" },
    { format: "eac3", mime_type: "audio/eac3" },
    { format: "flac", mime_type: "audio/flac" },
    { format: "m4a", mime_type: "audio/mp4" },
    { format: "mp2", mime_type: "audio/mpeg" },
    { format: "mp3", mime_type: "audio/mpeg" },
    { format: "ogg", mime_type: "application/ogg" },
    { format: "opus", mime_type: "audio/opus" },
    { format: "wav", mime_type: "audio/wav" },
  ],
  video_formats: [
    { format: "3g2", mime_type: "video/3gpp2" },
    { format: "3gp", mime_type: "video/3gpp" },
    { format: "avi", mime_type: "video/x-msvideo" },
    { format: "flv", mime_type: "video/x-flv" },
    { format: "m4v", mime_type: "video/x-m4v" },
    { format: "matroska", mime_type: "video/x-matroska" },
    { format: "mov", mime_type: "video/quicktime" },
    { format: "mp4", mime_type: "video/mp4" },
    { format: "wmv", mime_type: "video/x-ms-wmv" },
  ],
};

export const sdkPolicy = `# Gladia SDK policy

This server uses the official Gladia SDK for every Gladia API operation.

- Pre-recorded transcription creation is asynchronous and billable to the account identified by GLADIA_API_KEY.
- Poll pre-recorded jobs with get_pre_recorded_transcription by using the returned job ID.
- Manage existing live sessions with get_live_transcription, list_live_transcriptions, and delete_live_transcription. This server cannot start or stream live sessions.
- Local uploads are limited to configured roots. When GLADIA_LOCAL_FILE_ROOTS is unset, the Desktop folder is the default root. Absolute and relative paths must resolve inside an allowed root.
- Live session create/streaming and raw REST fallbacks are outside this server's scope.
`;
