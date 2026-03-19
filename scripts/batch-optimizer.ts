#!/usr/bin/env node
/**
 * OpenClaw Batch Processing Optimizer
 * Parallel inference with smart batching for throughput maximization
 */

import { execSync } from "child_process";
import { writeFileSync } from "fs";
import { join } from "path";

interface BatchConfig {
  parallelJobs: number;
  batchSize: number;
  maxContext: number;
  timeout: number;
  retryAttempts: number;
}

interface BatchResult {
  jobId: string;
  status: "success" | "failed" | "timeout";
  duration: number;
  tokens: number;
  error?: string;
}

const HARDWARE_PROFILES: Record<string, BatchConfig> = {
  minimal: { parallelJobs: 1, batchSize: 16, maxContext: 1024, timeout: 30000, retryAttempts: 1 },
  standard: { parallelJobs: 2, batchSize: 64, maxContext: 4096, timeout: 60000, retryAttempts: 2 },
  enthusiast: {
    parallelJobs: 4,
    batchSize: 128,
    maxContext: 8192,
    timeout: 90000,
    retryAttempts: 3,
  },
  workstation: {
    parallelJobs: 8,
    batchSize: 256,
    maxContext: 16384,
    timeout: 120000,
    retryAttempts: 3,
  },
};

/**
 * Detect hardware profile
 */
function getHardwareProfile(): string {
  const { totalmem } = require("os");
  const ramGB = Math.round(totalmem() / 1024 ** 3);

  if (ramGB < 8) {
    return "minimal";
  }
  if (ramGB < 16) {
    return "standard";
  }
  if (ramGB < 32) {
    return "enthusiast";
  }
  return "workstation";
}

/**
 * Execute batch of prompts in parallel
 */
async function executeBatch(
  prompts: string[],
  model: string,
  config: BatchConfig,
): Promise<BatchResult[]> {
  console.log(`📦 Executing batch: ${prompts.length} prompts`);
  console.log(`   Model: ${model}`);
  console.log(`   Parallel: ${config.parallelJobs}`);
  console.log(`   Batch size: ${config.batchSize}`);
  console.log();

  const results: BatchResult[] = [];
  const chunks = chunkArray(prompts, config.batchSize);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    console.log(`Processing chunk ${i + 1}/${chunks.length}...`);

    const chunkResults = await Promise.allSettled(
      chunk.map((prompt, j) => executeSingle(prompt, model, config, `${i}-${j}`)),
    );

    chunkResults.forEach((result, idx) => {
      if (result.status === "fulfilled") {
        results.push(result.value);
      } else {
        results.push({
          jobId: `${i}-${idx}`,
          status: "failed",
          duration: 0,
          tokens: 0,
          error: result.reason?.message || "Unknown error",
        });
      }
    });

    console.log(`Chunk ${i + 1} complete: ${chunkResults.length} jobs`);
  }

  return results;
}

/**
 * Execute single prompt
 */
async function executeSingle(
  prompt: string,
  model: string,
  config: BatchConfig,
  jobId: string,
): Promise<BatchResult> {
  const start = Date.now();

  try {
    const output = execSync(`ollama run ${model} "${escapeShell(prompt)}"`, {
      encoding: "utf8",
      timeout: config.timeout,
    });

    const duration = Date.now() - start;
    const tokens = output.split(" ").length;

    return {
      jobId,
      status: "success",
      duration,
      tokens,
    };
  } catch (error: unknown) {
    const duration = Date.now() - start;

    const err = error as Error;
    if (err.message?.includes("timeout")) {
      return { jobId, status: "timeout", duration, tokens: 0, error: "Timeout" };
    }

    return { jobId, status: "failed", duration, tokens: 0, error: err.message };
  }
}

/**
 * Chunk array into batches
 */
function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/**
 * Escape shell special characters
 */
function escapeShell(str: string): string {
  return str.replace(/"/g, '\\"').replace(/\$/g, "\\$").replace(/`/g, "\\`");
}

/**
 * Calculate throughput stats
 */
function calculateStats(results: BatchResult[]): {
  totalJobs: number;
  successRate: number;
  avgDuration: number;
  totalTokens: number;
  tokensPerSecond: number;
} {
  const total = results.length;
  const success = results.filter((r) => r.status === "success").length;
  const duration = results.reduce((sum, r) => sum + r.duration, 0);
  const tokens = results.reduce((sum, r) => sum + r.tokens, 0);

  return {
    totalJobs: total,
    successRate: Math.round((success / total) * 100),
    avgDuration: Math.round(duration / total),
    totalTokens: tokens,
    tokensPerSecond: Math.round(tokens / (duration / 1000)),
  };
}

/**
 * Main CLI entry
 */
async function main() {
  const args = process.argv.slice(2);
  const model = args[0] || "llama3.1:8b";
  const inputFile = args[1] || "batch-input.txt";

  console.log("⚡ OpenClaw Batch Processing Optimizer\n");

  // Detect hardware
  const profile = getHardwareProfile();
  const config = HARDWARE_PROFILES[profile];

  console.log("🖥️  Hardware Profile:");
  console.log(`   Profile: ${profile}`);
  console.log(`   Parallel jobs: ${config.parallelJobs}`);
  console.log(`   Batch size: ${config.batchSize}`);
  console.log(`   Max context: ${config.maxContext}`);
  console.log();

  // Load prompts
  let prompts: string[];
  try {
    const { readFileSync } = require("fs");
    const content = readFileSync(inputFile, "utf8");
    prompts = content.split("\n").filter((line) => line.trim());
  } catch {
    prompts = ["Hello", "How are you?", "What is AI?", "Explain quantum computing"];
  }

  console.log(`📝 Loaded ${prompts.length} prompts from ${inputFile}`);
  console.log();

  // Execute batch
  const results = await executeBatch(prompts, model, config);

  // Calculate stats
  const stats = calculateStats(results);

  console.log("\n📊 Batch Results:");
  console.log(`   Total jobs: ${stats.totalJobs}`);
  console.log(`   Success rate: ${stats.successRate}%`);
  console.log(`   Avg duration: ${stats.avgDuration}ms`);
  console.log(`   Total tokens: ${stats.totalTokens}`);
  console.log(`   Throughput: ${stats.tokensPerSecond} tok/s`);
  console.log();

  // Save results
  const outputPath = join(process.cwd(), "logs", `batch-${Date.now()}.json`);
  writeFileSync(
    outputPath,
    JSON.stringify(
      {
        profile,
        config,
        model,
        stats,
        results,
        timestamp: new Date().toISOString(),
      },
      null,
      2,
    ),
  );

  console.log(`💾 Results saved to ${outputPath}`);
  console.log("\n✨ Batch processing complete!");
}

main().catch(console.error);
