#!/usr/bin/env node
/**
 * OpenClaw Local Optimization Script
 * Pulls recommended models, tunes performance, benchmarks hardware
 */

import { execSync } from "child_process";
import { writeFileSync } from "fs";
import { join } from "path";

interface ModelConfig {
  name: string;
  purpose: string;
  vram: string;
  context: number;
  use_case: string;
  performance_score: number;
}

const RECOMMENDED_MODELS: ModelConfig[] = [
  {
    name: "llama3.2:3b",
    purpose: "Fast responses",
    vram: "2GB",
    context: 8192,
    use_case: "Chat, quick tasks",
    performance_score: 95,
  },
  {
    name: "llama3.1:8b",
    purpose: "Balanced performance",
    vram: "6GB",
    context: 8192,
    use_case: "General, coding",
    performance_score: 90,
  },
  {
    name: "mistral:7b",
    purpose: "Efficient inference",
    vram: "5GB",
    context: 8192,
    use_case: "Long context",
    performance_score: 88,
  },
  {
    name: "codellama:7b",
    purpose: "Code generation",
    vram: "5GB",
    context: 16384,
    use_case: "Programming",
    performance_score: 92,
  },
  {
    name: "phi3:mini",
    purpose: "Ultra-fast",
    vram: "2GB",
    context: 4096,
    use_case: "Quick Q&A",
    performance_score: 85,
  },
];

async function checkOllamaInstalled(): Promise<boolean> {
  try {
    execSync("command -v ollama", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

async function pullModel(model: string): Promise<void> {
  console.log(`📥 Pulling ${model}...`);
  try {
    execSync(`ollama pull ${model}`, { stdio: "inherit" });
    console.log(`✅ ${model} ready`);
  } catch {
    console.error(`❌ Failed to pull ${model}`);
  }
}

async function benchmarkModel(model: string): Promise<number> {
  console.log(`⚡ Benchmarking ${model}...`);
  const start = Date.now();
  try {
    execSync(`ollama run ${model} "Hello"`, { stdio: "ignore" });
    const latency = Date.now() - start;
    console.log(`  Latency: ${latency}ms`);
    return latency;
  } catch {
    return Infinity;
  }
}

async function detectHardware() {
  const { cpus, totalmem } = await import("os");

  const cpuCount = cpus().length;
  const ramGB = Math.round(totalmem() / 1024 ** 3);

  console.log("🖥️  Hardware Detection:");
  console.log(`  CPU: ${cpuCount} cores`);
  console.log(`  RAM: ${ramGB} GB`);

  let profile: "minimal" | "standard" | "enthusiast" | "workstation";
  if (ramGB < 8) {
    profile = "minimal";
  } else if (ramGB < 16) {
    profile = "standard";
  } else if (ramGB < 32) {
    profile = "enthusiast";
  } else {
    profile = "workstation";
  }

  console.log(`  Profile: ${profile}`);
  return { cpuCount, ramGB, profile };
}

async function generateConfig(profile: string) {
  const config = {
    minimal: { threads: 2, context: 1024, batch: 256, model: "phi3:mini" },
    standard: { threads: 4, context: 4096, batch: 512, model: "llama3.1:8b" },
    enthusiast: { threads: 8, context: 8192, batch: 1024, model: "llama3.1:8b" },
    workstation: { threads: 16, context: 16384, batch: 2048, model: "llama3.1:70b" },
  };

  const settings = config[profile as keyof typeof config];
  console.log("⚙️  Generated Configuration:");
  console.log(`  Threads: ${settings.threads}`);
  console.log(`  Context: ${settings.context}`);
  console.log(`  Batch: ${settings.batch}`);
  console.log(`  Model: ${settings.model}`);

  return settings;
}

async function main() {
  console.log("🚀 OpenClaw Local Optimization\n");

  // Check Ollama
  if (!(await checkOllamaInstalled())) {
    console.log("❌ Ollama not installed");
    console.log("Install: curl -fsSL https://ollama.com/install.sh | sh");
    return;
  }

  console.log("✅ Ollama detected\n");

  // Detect hardware
  const hardware = await detectHardware();
  console.log();

  // Generate config
  const config = await generateConfig(hardware.profile);
  console.log();

  // Pull recommended models
  console.log("📦 Installing recommended models...\n");
  for (const model of RECOMMENDED_MODELS.slice(0, 3)) {
    await pullModel(model.name);
  }
  console.log();

  // Benchmark
  console.log("⚡ Running benchmarks...\n");
  const results: Array<{ model: string; latency: number }> = [];
  for (const model of RECOMMENDED_MODELS.slice(0, 2)) {
    const latency = await benchmarkModel(model.name);
    results.push({ model: model.name, latency });
  }

  // Sort by performance
  results.sort((a, b) => a.latency - b.latency);
  console.log("\n🏆 Performance Ranking:");
  results.forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.model}: ${r.latency}ms`);
  });

  // Save config
  const configPath = join(process.cwd(), "config", "local-tuning.json");
  writeFileSync(
    configPath,
    JSON.stringify(
      {
        hardware,
        config,
        benchmarks: results,
        timestamp: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log(`\n💾 Config saved to ${configPath}`);

  console.log("\n✨ Optimization complete!");
  console.log(`\nRecommended: Use ${config.model} for best performance`);
}

main().catch(console.error);
