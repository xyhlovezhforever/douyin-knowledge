# Douyin analysis adapter

This adapter is loaded by `douyin-favorites-to-knowledge` for each authorized
favorite or liked video. It produces a safe extractive summary without a model
key and can call any OpenAI compatible chat completions endpoint when these
variables are configured:

```dotenv
VIDEO_ANALYSIS_API_URL=http://127.0.0.1:11434/v1/chat/completions
VIDEO_ANALYSIS_MODEL=qwen3:8b
VIDEO_ANALYSIS_API_KEY=
```

The adapter only sends the collected description and transcript. It never
changes the item identity or source URL.
