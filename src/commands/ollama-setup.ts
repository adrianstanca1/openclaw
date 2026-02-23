import { upsertAuthProfileWithLock } from "../agents/auth-profiles.js";
import { OLLAMA_NATIVE_BASE_URL } from "../agents/ollama-stream.js";
import type { OpenClawConfig } from "../config/config.js";
import type { WizardPrompter } from "../wizard/prompts.js";

export const OLLAMA_DEFAULT_BASE_URL = OLLAMA_NATIVE_BASE_URL;
export const OLLAMA_DEFAULT_CONTEXT_WINDOW = 8192;
export const OLLAMA_DEFAULT_MAX_TOKENS = 4096;
export const OLLAMA_DEFAULT_COST = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
};

export async function promptAndConfigureOllama(params: {
  cfg: OpenClawConfig;
  prompter: WizardPrompter;
  agentDir?: string;
  initialBaseUrl?: string;
  initialModelId?: string;
}): Promise<{ config: OpenClawConfig; modelId: string; modelRef: string }> {
  const baseUrlRaw = await params.prompter.text({
    message: "Ollama base URL",
    initialValue: params.initialBaseUrl ?? OLLAMA_DEFAULT_BASE_URL,
    placeholder: OLLAMA_DEFAULT_BASE_URL,
    validate: (value) => {
      try {
        new URL(value);
        return undefined;
      } catch {
        return "Please enter a valid URL (e.g. http://127.0.0.1:11434)";
      }
    },
  });

  const modelIdRaw = await params.prompter.text({
    message: "Ollama model",
    initialValue: params.initialModelId ?? "gemma3",
    placeholder: "e.g. gemma3, llama3.1, mistral",
    validate: (value) => (value?.trim() ? undefined : "Required"),
  });

  const baseUrl = String(baseUrlRaw ?? "")
    .trim()
    .replace(/\/+$/, "");
  const modelId = String(modelIdRaw ?? "").trim();
  const modelRef = `ollama/${modelId}`;

  // Ollama usually doesn't need an API key for local use, but we can store a dummy one
  // if the infrastructure requires it, or just use a placeholder.
  await upsertAuthProfileWithLock({
    profileId: "ollama:default",
    credential: { type: "api_key", provider: "ollama", key: "OLLAMA_API_KEY" },
    agentDir: params.agentDir,
  });

  const nextConfig: OpenClawConfig = {
    ...params.cfg,
    models: {
      ...params.cfg.models,
      mode: params.cfg.models?.mode ?? "merge",
      providers: {
        ...params.cfg.models?.providers,
        ollama: {
          baseUrl,
          api: "ollama",
          apiKey: "OLLAMA_API_KEY",
          models: [
            {
              id: modelId,
              name: modelId,
              reasoning: false,
              input: ["text"],
              cost: OLLAMA_DEFAULT_COST,
              contextWindow: OLLAMA_DEFAULT_CONTEXT_WINDOW,
              maxTokens: OLLAMA_DEFAULT_MAX_TOKENS,
            },
          ],
        },
      },
    },
  };

  return { config: nextConfig, modelId, modelRef };
}
