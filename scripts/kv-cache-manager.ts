#!/usr/bin/env node
/**
 * OpenClaw KV Cache Manager
 * Manages key-value cache for transformer attention, reduces redundant computation
 * Enables prefix caching, prefix reuse, and cache offloading
 */

import { createHash } from "crypto";
import { writeFileSync, readFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

interface CacheBlock {
  id: string;
  hash: string;
  keys: number[];
  values: number[];
  size: number;
  accessCount: number;
  lastAccess: number;
  prefix: string;
}

interface KVCacheConfig {
  maxBlocks: number;
  offloadToCPU: boolean;
  prefixCaching: boolean;
  cacheQuantization: "f16" | "f8" | "int4";
  evictionPolicy: "lru" | "lifo" | "random";
}

class KVCacheManager {
  private cache: Map<string, CacheBlock>;
  private config: KVCacheConfig;
  private cacheDir: string;
  private hitCount: number;
  private missCount: number;

  constructor(config: Partial<KVCacheConfig> = {}) {
    this.config = {
      maxBlocks: config.maxBlocks || 1000,
      offloadToCPU: config.offloadToCPU ?? true,
      prefixCaching: config.prefixCaching ?? true,
      cacheQuantization: config.cacheQuantization || "f16",
      evictionPolicy: config.evictionPolicy || "lru",
    };

    this.cache = new Map();
    this.cacheDir = join(process.cwd(), "cache", "kv");
    this.hitCount = 0;
    this.missCount = 0;

    // Ensure cache directory exists
    if (!existsSync(this.cacheDir)) {
      mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * Compute hash for prefix
   */
  private computePrefixHash(prefix: string): string {
    return createHash("sha256").update(prefix).digest("hex").substring(0, 16);
  }

  /**
   * Check if prefix exists in cache
   */
  hasPrefix(prefix: string): boolean {
    const hash = this.computePrefixHash(prefix);
    const exists = this.cache.has(hash);

    if (exists) {
      const block = this.cache.get(hash)!;
      block.accessCount++;
      block.lastAccess = Date.now();
      this.hitCount++;
      console.log(`✅ KV Cache HIT: ${prefix.substring(0, 30)}...`);
      console.log(`   Block: ${block.id}, Size: ${block.size} KB`);
      console.log(`   Access count: ${block.accessCount}`);
      console.log();
    } else {
      this.missCount++;
      console.log(`❌ KV Cache MISS: ${prefix.substring(0, 30)}...`);
      console.log();
    }

    return exists;
  }

  /**
   * Store prefix in cache
   */
  async storePrefix(prefix: string, keys: number[], values: number[]): Promise<string> {
    const hash = this.computePrefixHash(prefix);
    const id = `kv-${hash}`;

    // Check capacity
    if (this.cache.size >= this.config.maxBlocks) {
      this.evict();
    }

    // Apply quantization
    const quantizedKeys = this.quantize(keys, this.config.cacheQuantization);
    const quantizedValues = this.quantize(values, this.config.cacheQuantization);

    const block: CacheBlock = {
      id,
      hash,
      keys: quantizedKeys,
      values: quantizedValues,
      size: Math.round(((quantizedKeys.length + quantizedValues.length) * 2) / 1024),
      accessCount: 0,
      lastAccess: Date.now(),
      prefix,
    };

    this.cache.set(hash, block);

    // Offload to CPU if enabled
    if (this.config.offloadToCPU) {
      this.offloadBlock(block);
    }

    console.log(`💾 KV Cache STORED: ${prefix.substring(0, 30)}...`);
    console.log(`   Block: ${block.id}`);
    console.log(`   Size: ${block.size} KB (${this.config.cacheQuantization})`);
    console.log();

    return id;
  }

  /**
   * Retrieve prefix from cache
   */
  getPrefix(prefix: string): CacheBlock | null {
    const hash = this.computePrefixHash(prefix);
    const block = this.cache.get(hash);

    if (block) {
      block.accessCount++;
      block.lastAccess = Date.now();
      this.hitCount++;

      // Reload from CPU if offloaded
      if (this.config.offloadToCPU) {
        this.reloadBlock(block);
      }

      return block;
    }

    this.missCount++;
    return null;
  }

  /**
   * Quantize cache data
   */
  private quantize(data: number[], mode: string): number[] {
    switch (mode) {
      case "f8":
        return data.map((x) => Math.round(x * 127));
      case "int4":
        return data.map((x) => Math.round(x * 7));
      case "f16":
      default:
        return data;
    }
  }

  /**
   * Offload block to CPU memory
   */
  private offloadBlock(block: CacheBlock): void {
    const filePath = join(this.cacheDir, `${block.id}.bin`);
    const data = {
      keys: block.keys,
      values: block.values,
      metadata: {
        id: block.id,
        hash: block.hash,
        size: block.size,
      },
    };
    writeFileSync(filePath, JSON.stringify(data));
  }

  /**
   * Reload block from CPU memory
   */
  private reloadBlock(block: CacheBlock): void {
    const filePath = join(this.cacheDir, `${block.id}.bin`);
    try {
      const data = JSON.parse(readFileSync(filePath, "utf8"));
      block.keys = data.keys;
      block.values = data.values;
    } catch {
      // File not found, keep in GPU
    }
  }

  /**
   * Evict cache blocks
   */
  private evict(): void {
    const entries = Array.from(this.cache.entries());

    switch (this.config.evictionPolicy) {
      case "lru":
        entries.sort((a, b) => a[1].lastAccess - b[1].lastAccess);
        break;
      case "lifo":
        entries.sort((a, b) => b[1].lastAccess - a[1].lastAccess);
        break;
      case "random":
        entries.sort(() => Math.random() - 0.5);
        break;
    }

    // Remove oldest 20%
    const removeCount = Math.ceil(this.cache.size * 0.2);
    for (let i = 0; i < removeCount; i++) {
      const block = entries[i][1];
      this.cache.delete(block.hash);

      // Remove offloaded file
      const filePath = join(this.cacheDir, `${block.id}.bin`);
      try {
        require("fs").unlinkSync(filePath);
      } catch {
        // File doesn't exist
      }
    }

    console.log(`🗑️  KV Cache evicted ${removeCount} blocks`);
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    totalBlocks: number;
    hitRate: number;
    avgBlockSize: number;
    totalSize: number;
    memoryUsage: number;
  } {
    const blocks = Array.from(this.cache.values());
    const total = this.hitCount + this.missCount;
    const hitRate = total > 0 ? Math.round((this.hitCount / total) * 100) : 0;
    const avgSize = blocks.reduce((sum, b) => sum + b.size, 0) / (blocks.length || 1);
    const totalSize = blocks.reduce((sum, b) => sum + b.size, 0);

    return {
      totalBlocks: blocks.length,
      hitRate,
      avgBlockSize: Math.round(avgSize),
      totalSize,
      memoryUsage: Math.round(totalSize / 1024),
    };
  }

  /**
   * Clear cache
   */
  clear(): void {
    this.cache.clear();
    this.hitCount = 0;
    this.missCount = 0;

    // Clear offloaded files
    const files = require("fs").readdirSync(this.cacheDir);
    files.forEach((file) => {
      try {
        require("fs").unlinkSync(join(this.cacheDir, file));
      } catch {
        // Ignore
      }
    });

    console.log("🗑️  KV Cache cleared");
  }
}

// CLI entry
async function main() {
  const args = process.argv.slice(2);
  const action = args[0] || "stats";

  console.log("💾 OpenClaw KV Cache Manager\n");

  const cache = new KVCacheManager({
    maxBlocks: 500,
    offloadToCPU: true,
    prefixCaching: true,
    cacheQuantization: "f16",
    evictionPolicy: "lru",
  });

  if (action === "test") {
    // Test with sample prefixes
    const prefixes = [
      "Write a function to",
      "Write a function to calculate",
      "Explain the concept of",
      "Explain the concept of quantum",
      "What is TypeScript",
      "What is TypeScript and how",
    ];

    console.log("Running KV cache test...\n");

    for (const prefix of prefixes) {
      if (!cache.hasPrefix(prefix)) {
        // Simulate KV data
        const keys = Array(100)
          .fill(0)
          .map(() => Math.random());
        const values = Array(100)
          .fill(0)
          .map(() => Math.random());
        await cache.storePrefix(prefix, keys, values);
      }
    }

    console.log();
    const stats = cache.getStats();
    console.log("📊 KV Cache Statistics:");
    console.log(`   Blocks: ${stats.totalBlocks}`);
    console.log(`   Hit rate: ${stats.hitRate}%`);
    console.log(`   Avg block size: ${stats.avgBlockSize} KB`);
    console.log(`   Total size: ${stats.totalSize} KB`);
    console.log(`   Memory usage: ${stats.memoryUsage} MB`);
  } else if (action === "stats") {
    const stats = cache.getStats();
    console.log("📊 KV Cache Statistics:");
    console.log(`   Blocks: ${stats.totalBlocks}`);
    console.log(`   Hit rate: ${stats.hitRate}%`);
    console.log(`   Avg block size: ${stats.avgBlockSize} KB`);
    console.log(`   Total size: ${stats.totalSize} KB`);
    console.log(`   Memory usage: ${stats.memoryUsage} MB`);
  } else if (action === "clear") {
    cache.clear();
  }
}

main().catch(console.error);
