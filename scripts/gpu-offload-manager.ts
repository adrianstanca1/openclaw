#!/usr/bin/env node
/**
 * OpenClaw GPU Offloading Manager
 * Manages VRAM allocation, GPU layer offloading, and multi-GPU distribution
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

interface GPUInfo {
  id: number;
  name: string;
  vramTotal: number;
  vramUsed: number;
  vramFree: number;
  utilization: number;
  temperature: number;
  cudaCores: number;
}

interface OffloadConfig {
  gpuLayers: number;
  mainGpu: number;
  tensorSplit: number[];
  splitMode: "layer" | "row" | "none";
}

class GPUOffloadManager {
  private gpus: GPUInfo[];
  private config: OffloadConfig;
  private modelPath: string;

  constructor() {
    this.gpus = [];
    this.config = {
      gpuLayers: 0,
      mainGpu: 0,
      tensorSplit: [],
      splitMode: "layer",
    };
    this.modelPath = "";
  }

  /**
   * Detect available GPUs
   */
  detectGPUs(): GPUInfo[] {
    console.log("🔍 Detecting GPUs...\n");

    try {
      // NVIDIA detection
      const nvidiaOutput = execSync(
        "nvidia-smi --query-gpu=index,name,memory.total,memory.used,memory.free,utilization.gpu,temperature.gpu,cuda_cores --format=csv 2>/dev/null",
        { encoding: "utf8" },
      );
      const lines = nvidiaOutput.trim().split("\n").slice(1);

      this.gpus = lines.map((line, idx) => {
        const [id, name, total, used, free, util, temp, cores] = line.split(", ");
        return {
          id: idx,
          name: name || "Unknown",
          vramTotal: parseInt(total) || 0,
          vramUsed: parseInt(used) || 0,
          vramFree: parseInt(free) || 0,
          utilization: parseInt(util) || 0,
          temperature: parseInt(temp) || 0,
          cudaCores: parseInt(cores) || 0,
        };
      });
    } catch {
      // macOS Metal detection
      try {
        const metalOutput = execSync(
          'system_profiler SPDisplaysDataType 2>/dev/null | grep -A 20 "Metal"',
          { encoding: "utf8" },
        );
        this.gpus = [
          {
            id: 0,
            name: "Apple Silicon GPU",
            vramTotal: 0, // Unified memory
            vramUsed: 0,
            vramFree: 0,
            utilization: 0,
            temperature: 0,
            cudaCores: 0,
          },
        ];
      } catch {
        this.gpus = [
          {
            id: 0,
            name: "CPU Only",
            vramTotal: 0,
            vramUsed: 0,
            vramFree: 0,
            utilization: 0,
            temperature: 0,
            cudaCores: 0,
          },
        ];
      }
    }

    return this.gpus;
  }

  /**
   * Calculate optimal GPU layers for model
   */
  calculateGPULayers(modelSize: number, quantization: string): number {
    const modelVRAM = this.estimateModelVRAM(modelSize, quantization);
    const availableVRAM = this.gpus.reduce((sum, gpu) => sum + gpu.vramFree, 0);

    if (availableVRAM <= 0) {
      console.log("⚠️  No dedicated VRAM available, using CPU");
      return 0;
    }

    // Calculate how many layers fit in VRAM
    const totalLayers = modelSize > 70 ? 80 : modelSize > 13 ? 40 : 32;
    const vramPerLayer = modelVRAM / totalLayers;

    const maxLayers = Math.floor(availableVRAM / vramPerLayer);
    const optimalLayers = Math.min(maxLayers, totalLayers);

    console.log(`📊 VRAM Analysis:`);
    console.log(`   Model size: ${modelSize}B`);
    console.log(`   Quantization: ${quantization}`);
    console.log(`   Estimated VRAM: ${modelVRAM.toFixed(1)} GB`);
    console.log(`   Available VRAM: ${availableVRAM.toFixed(1)} GB`);
    console.log(`   Total layers: ${totalLayers}`);
    console.log(`   VRAM per layer: ${vramPerLayer.toFixed(2)} GB`);
    console.log(`   Max GPU layers: ${maxLayers}`);
    console.log(`   Optimal GPU layers: ${optimalLayers}`);
    console.log();

    return optimalLayers;
  }

  /**
   * Estimate VRAM usage by model size and quantization
   */
  private estimateModelVRAM(sizeB: number, quantization: string): number {
    const baseVRAM: Record<string, number> = {
      Q2_K: sizeB * 0.3,
      Q3_K: sizeB * 0.4,
      Q4_K: sizeB * 0.5,
      Q4_K_M: sizeB * 0.55,
      Q5_K: sizeB * 0.65,
      Q6_K: sizeB * 0.75,
      Q8_0: sizeB * 0.9,
      F16: sizeB * 2,
      F32: sizeB * 4,
    };

    return baseVRAM[quantization] || sizeB * 0.5;
  }

  /**
   * Configure tensor parallelism across multiple GPUs
   */
  configureTensorParallel(): number[] {
    if (this.gpus.length < 2) {
      return [];
    }

    // Calculate split ratios based on VRAM
    const totalVRAM = this.gpus.reduce((sum, gpu) => sum + gpu.vramFree, 0);
    const splits = this.gpus.map((gpu) => Math.round((gpu.vramFree / totalVRAM) * 100));

    console.log(`🔀 Tensor Parallel Split:`);
    this.gpus.forEach((gpu, idx) => {
      console.log(`   GPU ${idx} (${gpu.name}): ${splits[idx]}%`);
    });
    console.log();

    return splits;
  }

  /**
   * Generate Ollama run command with GPU flags
   */
  generateRunCommand(model: string): string {
    const args = [`ollama run ${model}`];

    if (this.config.gpuLayers > 0) {
      args.push(`--num-gpu-layers ${this.config.gpuLayers}`);
    }

    if (this.config.mainGpu > 0) {
      args.push(`--main-gpu ${this.config.mainGpu}`);
    }

    if (this.config.tensorSplit.length > 0) {
      args.push(`--tensor-split ${this.config.tensorSplit.join(",")}`);
    }

    args.push(`--split-mode ${this.config.splitMode}`);

    return args.join(" ");
  }

  /**
   * Apply optimal configuration for model
   */
  async optimizeForModel(model: string): Promise<void> {
    console.log(`⚙️  Optimizing for ${model}...\n`);

    // Detect GPUs
    this.detectGPUs();

    // Parse model size from name
    const sizeMatch = model.match(/(\d+)(?:b|B)/);
    const sizeB = sizeMatch ? parseInt(sizeMatch[1]) : 8;

    // Default quantization
    const quantization = "Q4_K_M";

    // Calculate GPU layers
    this.config.gpuLayers = this.calculateGPULayers(sizeB, quantization);

    // Configure multi-GPU if available
    if (this.gpus.length > 1) {
      this.config.tensorSplit = this.configureTensorParallel();
      this.config.mainGpu = 0;
    }

    // Save config
    const configPath = join(process.cwd(), "config", "gpu-offload.json");
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          model,
          gpus: this.gpus,
          config: this.config,
          command: this.generateRunCommand(model),
          timestamp: new Date().toISOString(),
        },
        null,
        2,
      ),
    );

    console.log(`💾 Config saved to ${configPath}`);
    console.log();
    console.log(`🚀 Ready command:`);
    console.log(`   ${this.generateRunCommand(model)}`);
    console.log();
  }

  /**
   * Monitor GPU usage in real-time
   */
  startMonitoring(intervalMs: number = 1000): void {
    console.log(`📊 Starting GPU monitoring (${intervalMs}ms intervals)...\n`);

    setInterval(() => {
      this.detectGPUs();
      const timestamp = new Date().toLocaleTimeString();

      console.log(`[${timestamp}]`);
      this.gpus.forEach((gpu, idx) => {
        console.log(
          `   GPU ${idx}: ${gpu.utilization}% util, ${gpu.temperature}°C, ${gpu.vramUsed}/${gpu.vramTotal} MB`,
        );
      });
      console.log();
    }, intervalMs);
  }
}

// CLI entry
async function main() {
  const args = process.argv.slice(2);
  const model = args[0] || "llama3.1:8b";
  const action = args[1] || "optimize";

  console.log("🎮 OpenClaw GPU Offload Manager\n");

  const manager = new GPUOffloadManager();

  if (action === "optimize") {
    await manager.optimizeForModel(model);
  } else if (action === "monitor") {
    manager.detectGPUs();
    manager.startMonitoring(1000);
  } else if (action === "detect") {
    manager.detectGPUs();
    console.log("Detected GPUs:");
    manager.gpus.forEach((gpu, idx) => {
      console.log(`  ${idx}. ${gpu.name}`);
      console.log(`     VRAM: ${gpu.vramTotal} MB total, ${gpu.vramFree} MB free`);
      console.log(`     CUDA Cores: ${gpu.cudaCores}`);
      console.log();
    });
  }
}

main().catch(console.error);
