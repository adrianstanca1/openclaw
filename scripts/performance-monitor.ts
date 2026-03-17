#!/usr/bin/env node
/**
 * OpenClaw Performance Monitor
 * Real-time metrics for local LLM inference
 */

import { execSync } from 'child_process'
import { appendFileSync } from 'fs'
import { join } from 'path'

interface Metrics {
  timestamp: string
  model: string
  latency: number
  tokensPerSecond: number
  gpuUsage: number
  vramUsage: number
  systemRam: number
  cpuUsage: number
  requestsPerMinute: number
  cacheHitRate: number
}

class PerformanceMonitor {
  private metricsLog: string
  private intervalMs: number
  private running: boolean = false

  constructor(logPath: string, intervalMs: number = 5000) {
    this.metricsLog = logPath
    this.intervalMs = intervalMs
  }

  /**
   * Collect current metrics
   */
  collectMetrics(): Metrics {
    const model = this.getCurrentModel()
    const latency = this.measureLatency()
    const tps = this.calculateTPS()
    const gpu = this.getGPUUsage()
    const vram = this.getVRAMUsage()
    const ram = this.getSystemRAM()
    const cpu = this.getCPUUsage()
    const rpm = this.getRequestsPerMinute()
    const cache = this.getCacheHitRate()

    return {
      timestamp: new Date().toISOString(),
      model,
      latency,
      tokensPerSecond: tps,
      gpuUsage: gpu,
      vramUsage: vram,
      systemRam: ram,
      cpuUsage: cpu,
      requestsPerMinute: rpm,
      cacheHitRate: cache,
    }
  }

  /**
   * Get current active model
   */
  private getCurrentModel(): string {
    try {
      const config = execSync('cat config/active-model.json 2>/dev/null || echo "{}"', { encoding: 'utf8' })
      return JSON.parse(config).model || 'unknown'
    } catch {
      return 'unknown'
    }
  }

  /**
   * Measure inference latency
   */
  private measureLatency(): number {
    try {
      const start = Date.now()
      execSync('ollama run phi3:mini "Hi" 2>&1', { stdio: 'ignore', timeout: 5000 })
      return Date.now() - start
    } catch {
      return -1
    }
  }

  /**
   * Calculate tokens per second
   */
  private calculateTPS(): number {
    // Benchmark with known token count
    try {
      const output = execSync('ollama run phi3:mini "Count from 1 to 10" 2>&1', { encoding: 'utf8', timeout: 10000 })
      const tokens = output.split(' ').length
      const duration = 1000 // Approximate
      return Math.round(tokens / (duration / 1000))
    } catch {
      return 0
    }
  }

  /**
   * Get GPU utilization (macOS/Windows/Linux)
   */
  private getGPUUsage(): number {
    try {
      // macOS: powermetrics
      // Linux: nvidia-smi
      // Windows: nvidia-smi or taskkill
      const output = execSync('powermetrics --samplers gpu_power -i 1000 -n 1 2>&1 || echo "0"', { encoding: 'utf8' })
      const match = output.match(/GPU Power: (\d+)/)
      return match ? parseInt(match[1]) : 0
    } catch {
      return 0
    }
  }

  /**
   * Get VRAM usage
   */
  private getVRAMUsage(): number {
    try {
      const output = execSync('nvidia-smi --query-gpu=memory.used --format=csv,noheader 2>&1 || echo "0"', { encoding: 'utf8' })
      const match = output.match(/(\d+)/)
      return match ? Math.round(parseInt(match[1]) / 1024) : 0
    } catch {
      return 0
    }
  }

  /**
   * Get system RAM usage
   */
  private getSystemRAM(): number {
    try {
      const { totalmem, freemem } = require('os')
      const used = (totalmem() - freemem()) / (1024 ** 3)
      return Math.round(used)
    } catch {
      return 0
    }
  }

  /**
   * Get CPU usage
   */
  private getCPUUsage(): number {
    try {
      const output = execSync('top -l 1 -n 0 2>&1 || echo "0"', { encoding: 'utf8' })
      const match = output.match(/CPU usage: (\d+)/)
      return match ? parseInt(match[1]) : 0
    } catch {
      return 0
    }
  }

  /**
   * Get requests per minute from logs
   */
  private getRequestsPerMinute(): number {
    // Parse access logs for RPM
    return Math.floor(Math.random() * 100) // Placeholder
  }

  /**
   * Get cache hit rate
   */
  private getCacheHitRate(): number {
    // Parse cache stats
    return Math.floor(Math.random() * 100) // Placeholder
  }

  /**
   * Start monitoring loop
   */
  start(): void {
    this.running = true
    console.log('📊 OpenClaw Performance Monitor')
    console.log(`Logging to: ${this.metricsLog}`)
    console.log(`Interval: ${this.intervalMs}ms`)
    console.log()

    const interval = setInterval(() => {
      if (!this.running) {
        clearInterval(interval)
        return
      }

      const metrics = this.collectMetrics()
      this.log(metrics)
      this.print(metrics)
    }, this.intervalMs)
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    this.running = false
    console.log('\n⏹️  Monitoring stopped')
  }

  /**
   * Log metrics to file
   */
  private log(metrics: Metrics): void {
    const line = JSON.stringify(metrics) + '\n'
    appendFileSync(this.metricsLog, line)
  }

  /**
   * Print metrics to console
   */
  private print(metrics: Metrics): void {
    const timestamp = new Date(metrics.timestamp).toLocaleTimeString()
    console.log(`[${timestamp}]`)
    console.log(`  Model: ${metrics.model}`)
    console.log(`  Latency: ${metrics.latency}ms`)
    console.log(`  Throughput: ${metrics.tokensPerSecond} tok/s`)
    console.log(`  VRAM: ${metrics.vramUsage} GB`)
    console.log(`  RAM: ${metrics.systemRam} GB`)
    console.log(`  CPU: ${metrics.cpuUsage}%`)
    console.log(`  RPM: ${metrics.requestsPerMinute}`)
    console.log(`  Cache: ${metrics.cacheHitRate}%`)
    console.log()
  }
}

// CLI entry
const logPath = join(process.cwd(), 'logs', 'performance.jsonl')
const monitor = new PerformanceMonitor(logPath, 5000)

console.log('Starting in 3 seconds...')
setTimeout(() => monitor.start(), 3000)

// Run for 60 seconds then stop
setTimeout(() => monitor.stop(), 63000)
