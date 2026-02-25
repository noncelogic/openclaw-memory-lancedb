import fs from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type EmbeddingProvider = "openai" | "gemini";

export type MemoryConfig = {
  embedding: {
    provider: EmbeddingProvider;
    model?: string;
    apiKey: string;
  };
  dbPath?: string;
  autoCapture?: boolean;
  autoRecall?: boolean;
  captureMaxChars?: number;
};

export const MEMORY_CATEGORIES = ["preference", "fact", "decision", "entity", "other"] as const;
export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

const DEFAULT_PROVIDER: EmbeddingProvider = "openai";
const DEFAULT_MODEL_BY_PROVIDER: Record<EmbeddingProvider, string> = {
  openai: "text-embedding-3-small",
  gemini: "text-embedding-004",
};
export const DEFAULT_CAPTURE_MAX_CHARS = 500;
const LEGACY_STATE_DIRS: string[] = [];

function resolveDefaultDbPath(): string {
  const home = homedir();
  const preferred = join(home, ".openclaw", "memory", "lancedb");
  try {
    if (fs.existsSync(preferred)) {
      return preferred;
    }
  } catch {
    // best-effort
  }

  for (const legacy of LEGACY_STATE_DIRS) {
    const candidate = join(home, legacy, "memory", "lancedb");
    try {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    } catch {
      // best-effort
    }
  }

  return preferred;
}

const DEFAULT_DB_PATH = resolveDefaultDbPath();

const EMBEDDING_DIMENSIONS: Record<EmbeddingProvider, Record<string, number>> = {
  openai: {
    "text-embedding-3-small": 1536,
    "text-embedding-3-large": 3072,
  },
  gemini: {
    "text-embedding-004": 768,
    "embedding-001": 768,
  },
};

function assertAllowedKeys(value: Record<string, unknown>, allowed: string[], label: string) {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length === 0) {
    return;
  }
  throw new Error(`${label} has unknown keys: ${unknown.join(", ")}`);
}

export function vectorDimsForModel(provider: EmbeddingProvider, model: string): number {
  const providerModels = EMBEDDING_DIMENSIONS[provider];
  if (!providerModels) {
    throw new Error(`Unsupported embedding provider: ${provider}`);
  }

  const dims = providerModels[model];
  if (!dims) {
    throw new Error(`Unsupported ${provider} embedding model: ${model}`);
  }
  return dims;
}

function resolveEnvVars(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, envVar) => {
    const envValue = process.env[envVar];
    if (!envValue) {
      throw new Error(`Environment variable ${envVar} is not set`);
    }
    return envValue;
  });
}

function resolveEmbeddingModel(provider: EmbeddingProvider, embedding: Record<string, unknown>): string {
  const model =
    typeof embedding.model === "string" ? embedding.model : DEFAULT_MODEL_BY_PROVIDER[provider];
  vectorDimsForModel(provider, model);
  return model;
}

export const memoryConfigSchema = {
  parse(value: unknown): MemoryConfig {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("memory config required");
    }
    const cfg = value as Record<string, unknown>;
    assertAllowedKeys(
      cfg,
      ["embedding", "dbPath", "autoCapture", "autoRecall", "captureMaxChars"],
      "memory config",
    );

    const embedding = cfg.embedding as Record<string, unknown> | undefined;
    if (!embedding || typeof embedding.apiKey !== "string") {
      throw new Error("embedding.apiKey is required");
    }
    assertAllowedKeys(embedding, ["provider", "apiKey", "model"], "embedding config");

    const provider = embedding.provider;
    if (provider !== undefined && provider !== "openai" && provider !== "gemini") {
      throw new Error(`Unsupported embedding provider: ${String(provider)}`);
    }

    const resolvedProvider = (provider as EmbeddingProvider | undefined) ?? DEFAULT_PROVIDER;
    const model = resolveEmbeddingModel(resolvedProvider, embedding);

    const captureMaxChars =
      typeof cfg.captureMaxChars === "number" ? Math.floor(cfg.captureMaxChars) : undefined;
    if (
      typeof captureMaxChars === "number" &&
      (captureMaxChars < 100 || captureMaxChars > 10_000)
    ) {
      throw new Error("captureMaxChars must be between 100 and 10000");
    }

    return {
      embedding: {
        provider: resolvedProvider,
        model,
        apiKey: resolveEnvVars(embedding.apiKey),
      },
      dbPath: typeof cfg.dbPath === "string" ? cfg.dbPath : DEFAULT_DB_PATH,
      autoCapture: cfg.autoCapture === true,
      autoRecall: cfg.autoRecall !== false,
      captureMaxChars: captureMaxChars ?? DEFAULT_CAPTURE_MAX_CHARS,
    };
  },
  uiHints: {
    "embedding.provider": {
      label: "Embedding Provider",
      placeholder: DEFAULT_PROVIDER,
      help: "Embedding provider to use: openai or gemini",
    },
    "embedding.apiKey": {
      label: "Embedding API Key",
      sensitive: true,
      placeholder: "${OPENAI_API_KEY} or ${GEMINI_API_KEY}",
      help: "API key for the selected embedding provider",
    },
    "embedding.model": {
      label: "Embedding Model",
      placeholder: DEFAULT_MODEL_BY_PROVIDER.openai,
      help: "Model to use (OpenAI: text-embedding-3-small/large, Gemini: text-embedding-004/embedding-001)",
    },
    dbPath: {
      label: "Database Path",
      placeholder: "~/.openclaw/memory/lancedb",
      advanced: true,
    },
    autoCapture: {
      label: "Auto-Capture",
      help: "Automatically capture important information from conversations",
    },
    autoRecall: {
      label: "Auto-Recall",
      help: "Automatically inject relevant memories into context",
    },
    captureMaxChars: {
      label: "Capture Max Chars",
      help: "Maximum message length eligible for auto-capture",
      advanced: true,
      placeholder: String(DEFAULT_CAPTURE_MAX_CHARS),
    },
  },
};
