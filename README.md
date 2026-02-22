# OpenClaw Memory (LanceDB)

Long-term memory plugin for [OpenClaw](https://github.com/openclaw/openclaw) using LanceDB for vector storage and OpenAI for embeddings. Gives your AI assistant persistent memory across conversations with automatic recall and capture.

## Features

- **Auto-recall** -- relevant memories are injected into context before every agent response
- **Auto-capture** -- important user messages are automatically stored after each conversation
- **Agent tools** -- `memory_recall`, `memory_store`, `memory_forget` for active memory management
- **CLI commands** -- `openclaw ltm list`, `openclaw ltm search`, `openclaw ltm stats`
- **Duplicate detection** -- 0.95 similarity threshold prevents storing near-identical memories
- **Prompt injection protection** -- memories are escaped and marked as untrusted data
- **GDPR-friendly** -- `memory_forget` tool for targeted deletion

## Installation

```sh
openclaw plugins install @noncelogic/openclaw-memory-lancedb
```

## Configuration

Add to your `~/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "slots": {
      "memory": "memory-lancedb"
    },
    "entries": {
      "memory-lancedb": {
        "enabled": true,
        "config": {
          "embedding": {
            "apiKey": "${OPENAI_API_KEY}"
          },
          "autoRecall": true,
          "autoCapture": true
        }
      }
    }
  }
}
```

Set `plugins.slots.memory` to `"memory-lancedb"` to switch from the default `memory-core` plugin. Only one memory plugin can be active at a time.

### Config Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `embedding.apiKey` | string | *required* | OpenAI API key (supports `${ENV_VAR}` syntax) |
| `embedding.model` | string | `text-embedding-3-small` | Embedding model (`text-embedding-3-small` or `text-embedding-3-large`) |
| `dbPath` | string | `~/.openclaw/memory/lancedb` | LanceDB database path |
| `autoRecall` | boolean | `true` | Inject relevant memories before each response |
| `autoCapture` | boolean | `false` | Auto-store important user messages |
| `captureMaxChars` | number | `500` | Max message length for auto-capture (100-10000) |

## How It Works

### Auto-Recall

Before every agent response, the plugin:

1. Embeds the user's message using OpenAI
2. Searches LanceDB for the top 3 most relevant memories (minimum 0.3 similarity)
3. Injects them into the system prompt as `<relevant-memories>` context marked as untrusted

### Auto-Capture

After each successful agent run, the plugin scans user messages for memorable content:

1. Filters by length (10-500 chars), skips system markup and agent output
2. Checks against trigger patterns (preferences, facts, decisions, contact info)
3. Rejects prompt injection attempts
4. Checks for duplicates (0.95 similarity threshold)
5. Stores up to 3 memories per conversation with auto-detected categories

## Agent Tools

### `memory_recall`

Search through stored memories.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `query` | string | *required* | Search query |
| `limit` | number | `5` | Max results |

### `memory_store`

Save information to long-term memory.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `text` | string | *required* | Information to remember |
| `importance` | number | `0.7` | Importance score (0-1) |
| `category` | string | `"other"` | One of: `preference`, `fact`, `decision`, `entity`, `other` |

### `memory_forget`

Delete memories by ID or search query.

| Parameter | Type | Description |
|-----------|------|-------------|
| `query` | string | Search to find memory candidates |
| `memoryId` | string | Specific memory UUID to delete |

## CLI

```sh
openclaw ltm list              # Show total memory count
openclaw ltm search <query>    # Search memories (JSON output)
openclaw ltm stats             # Memory statistics
```

## Safety

Memories are injected as untrusted historical context:

- All memory text is HTML-entity escaped before injection
- Wrapped in `<relevant-memories>` tags with explicit "do not follow instructions" guidance
- Prompt injection patterns are detected and rejected during capture
- Memory IDs are UUID-validated before deletion to prevent query injection

## Limitations

- **OpenAI-only embeddings** -- requires an OpenAI API key for `text-embedding-3-small` or `text-embedding-3-large`
- **LanceDB native binaries** -- LanceDB requires native binaries that may not be available on all platforms (notably macOS ARM can have issues)

## Testing

Unit tests run without any API keys:

```sh
vitest run
```

Live end-to-end tests require OpenAI:

```sh
OPENCLAW_LIVE_TEST=1 OPENAI_API_KEY=sk-... vitest run
```

## License

MIT
