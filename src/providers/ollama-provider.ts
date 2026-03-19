/**
 * OpenClaw Ollama Provider - Local LLM Integration
 * Optimized for extraordinary local performance
 */

import { CacheManager } from "../infra/cache-manager.js";
import { RateLimiter } from "../infra/rate-limiter.js";
import type {
  Provider,
  ProviderOptions,
  CompletionRequest,
  CompletionResponse,
} from "../types/provider.js";

export class OllamaProvider implements Provider {
  name = "ollama";
  baseUrl: string;
  private rateLimiter: RateLimiter;
  private cache: CacheManager;
  private connectionPool: Map<string, Connection> = new Map();

  constructor(options: ProviderOptions = {}) {
    this.baseUrl = options.baseUrl || "http://127.0.0.1:11434";
    this.rateLimiter = new RateLimiter({
      requestsPerSecond: options.rateLimit || 10,
      burstLimit: options.burstLimit || 20,
    });
    this.cache = new CacheManager({
      ttlMs: options.cacheTTL || 300_000, // 5 minutes
      maxSize: options.cacheSize || 1000,
    });
  }

  /**
   * Generate completion with local optimizations
   */
  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    // Check cache first for identical requests
    const cacheKey = this.getCacheKey(request);
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Rate limit protection
    await this.rateLimiter.acquire();

    // Build optimized request
    const optimizedRequest = this.optimizeRequest(request);

    // Execute with connection pooling
    const connection = this.getConnection(request.model);
    const response = await connection.execute(optimizedRequest);

    // Cache successful responses
    await this.cache.set(cacheKey, response);

    return response;
  }

  /**
   * Stream completion for real-time responses
   */
  async *streamComplete(request: CompletionRequest): AsyncGenerator<string> {
    const optimizedRequest = this.optimizeRequest(request);
    const connection = this.getConnection(request.model);

    yield* connection.stream(optimizedRequest);
  }

  /**
   * Optimize request for local execution
   */
  private optimizeRequest(request: CompletionRequest): CompletionRequest {
    return {
      ...request,
      options: {
        // Quantization-friendly settings
        temperature: request.options?.temperature ?? 0.7,
        top_p: request.options?.top_p ?? 0.9,
        top_k: request.options?.top_k ?? 40,
        repeat_penalty: request.options?.repeat_penalty ?? 1.1,

        // Memory optimizations
        num_ctx: Math.min(request.options?.num_ctx ?? 2048, 4096),
        num_batch: Math.min(request.options?.num_batch ?? 512, 1024),

        // Thread optimization for local CPU
        num_thread: request.options?.num_thread ?? this.detectOptimalThreads(),
      },
    };
  }

  /**
   * Detect optimal thread count based on hardware
   */
  private detectOptimalThreads(): number {
    const cpus = require("os").cpus().length;
    // Reserve 1 thread for system, use rest for inference
    return Math.max(1, cpus - 1);
  }

  /**
   * Get or create connection for model
   */
  private getConnection(model: string): Connection {
    const key = `${this.baseUrl}:${model}`;
    if (!this.connectionPool.has(key)) {
      this.connectionPool.set(key, new Connection(this.baseUrl, model));
    }
    return this.connectionPool.get(key)!;
  }

  /**
   * Generate cache key from request
   */
  private getCacheKey(request: CompletionRequest): string {
    const hash = require("crypto")
      .createHash("sha256")
      .update(
        JSON.stringify({
          model: request.model,
          messages: request.messages,
          temperature: request.options?.temperature,
        }),
      )
      .digest("hex");
    return `ollama:${hash}`;
  }

  /**
   * Prefetch model to reduce cold start
   */
  async prefetchModel(model: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/pull`, {
      method: "POST",
      body: JSON.stringify({ name: model, stream: false }),
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      throw new Error(`Failed to prefetch ${model}: ${response.statusText}`);
    }
  }

  /**
   * List available local models
   */
  async listModels(): Promise<string[]> {
    const response = await fetch(`${this.baseUrl}/api/tags`, {
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      throw new Error("Failed to list models");
    }

    const data = await response.json();
    return data.models?.map((m: { name?: string }) => m.name) || [];
  }

  /**
   * Get model info for optimization
   */
  async getModelInfo(model: string): Promise<ModelInfo> {
    const response = await fetch(`${this.baseUrl}/api/show`, {
      method: "POST",
      body: JSON.stringify({ name: model }),
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      throw new Error(`Failed to get model info: ${model}`);
    }

    return response.json();
  }
}

interface ModelInfo {
  license: string;
  modelfile: string;
  parameters: string;
  template: string;
  details: {
    format: string;
    family: string;
    families: string[];
    parameter_size: string;
    quantization_level: string;
  };
  model_info: Record<string, number>;
}

class Connection {
  private baseUrl: string;
  private model: string;
  private keepAlive: boolean = true;

  constructor(baseUrl: string, model: string) {
    this.baseUrl = baseUrl;
    this.model = model;
  }

  async execute(request: CompletionRequest): Promise<CompletionResponse> {
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        prompt: request.messages?.[0]?.content || "",
        stream: false,
        options: request.options,
        keep_alive: this.keepAlive ? "24h" : "0s",
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.statusText}`);
    }

    return response.json();
  }

  async *stream(request: CompletionRequest): AsyncGenerator<string> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        messages: request.messages,
        stream: true,
        options: request.options,
        keep_alive: "24h",
      }),
    });

    if (!response.body) {
      throw new Error("No response body");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      const chunk = decoder.decode(value);
      for (const line of chunk.split("\n")) {
        if (line.trim()) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.message?.content) {
              yield parsed.message.content;
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }
  }
}
