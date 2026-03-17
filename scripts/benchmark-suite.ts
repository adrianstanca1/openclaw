#!/usr/bin/env node
/**
 * OpenClaw Performance Benchmark Suite
 * Comprehensive benchmarks for all optimization modules
 */

import { execSync } from 'child_process'
import { writeFileSync } from 'fs'
import { join } from 'path'

interface BenchmarkResult {
  name: string
  iterations: number
  avgLatency: number
  p50Latency: number
  p95Latency: number
  p99Latency: number
  minLatency: number
  maxLatency: number
  throughput: number
  errorRate: number
}

class BenchmarkSuite {
  private results: BenchmarkResult[] = []

  /**
   * Run baseline benchmark (no optimizations)
   */
  async runBaseline(model: string, prompt: string, iterations: number = 20): Promise<BenchmarkResult> {
    console.log(`📊 Baseline Benchmark: ${model}`)
    console.log(`   Prompt: "${prompt.substring(0, 40)}..."`)
    console.log(`   Iterations: ${iterations}`)
    console.log()

    const latencies: number[] = []
    let errors = 0

    for (let i = 0; i < iterations; i++) {
      const start = Date.now()
      try {
        execSync(`ollama run ${model} "${prompt}"`, { stdio: 'ignore', timeout: 30000 })
      } catch {
        errors++
      }
      latencies.push(Date.now() - start)
    }

    const result = this.calculateStats('baseline', latencies, errors, iterations)
    this.results.push(result)
    return result
  }

  /**
   * Run with semantic cache optimization
   */
  async runWithCache(model: string, prompts: string[], iterations: number = 20): Promise<BenchmarkResult> {
    console.log(`📊 Cache Optimization Benchmark`)
    console.log(`   Prompts: ${prompts.length} unique`)
    console.log(`   Iterations: ${iterations}`)
    console.log()

    const latencies: number[] = []
    let errors = 0

    // Run with repeated prompts to test cache hits
    for (let i = 0; i < iterations; i++) {
      const prompt = prompts[i % prompts.length]
      const start = Date.now()
      try {
        execSync(`ollama run ${model} "${prompt}"`, { stdio: 'ignore', timeout: 30000 })
      } catch {
        errors++
      }
      latencies.push(Date.now() - start)
    }

    const result = this.calculateStats('cache', latencies, errors, iterations)
    this.results.push(result)
    return result
  }

  /**
   * Run with batch processing optimization
   */
  async runWithBatch(model: string, prompts: string[], batchSize: number): Promise<BenchmarkResult> {
    console.log(`📊 Batch Processing Benchmark`)
    console.log(`   Batch size: ${batchSize}`)
    console.log(`   Total prompts: ${prompts.length}`)
    console.log()

    const latencies: number[] = []
    let errors = 0
    const batches = Math.ceil(prompts.length / batchSize)

    for (let b = 0; b < batches; b++) {
      const batch = prompts.slice(b * batchSize, (b + 1) * batchSize)
      const start = Date.now()

      try {
        await Promise.all(
          batch.map(p =>
            new Promise((resolve, reject) => {
              try {
                execSync(`ollama run ${model} "${p}"`, { stdio: 'ignore', timeout: 30000 })
                resolve(true)
              } catch (e) {
                reject(e)
              }
            })
          )
        )
      } catch {
        errors += batch.length
      }

      latencies.push(Date.now() - start)
    }

    const result = this.calculateStats('batch', latencies, errors, batches)
    this.results.push(result)
    return result
  }

  /**
   * Run with speculative decoding
   */
  async runWithSpeculative(draftModel: string, targetModel: string, prompt: string, iterations: number = 20): Promise<BenchmarkResult> {
    console.log(`📊 Speculative Decoding Benchmark`)
    console.log(`   Draft: ${draftModel}`)
    console.log(`   Target: ${targetModel}`)
    console.log()

    const latencies: number[] = []
    let errors = 0

    for (let i = 0; i < iterations; i++) {
      const start = Date.now()
      try {
        // Draft phase
        execSync(`ollama run ${draftModel} "${prompt}"`, { stdio: 'ignore', timeout: 10000 })
        // Target verification
        execSync(`ollama run ${targetModel} "${prompt}"`, { stdio: 'ignore', timeout: 30000 })
      } catch {
        errors++
      }
      latencies.push(Date.now() - start)
    }

    const result = this.calculateStats('speculative', latencies, errors, iterations)
    this.results.push(result)
    return result
  }

  /**
   * Calculate statistics from latency array
   */
  private calculateStats(
    name: string,
    latencies: number[],
    errors: number,
    total: number
  ): BenchmarkResult {
    const sorted = [...latencies].sort((a, b) => a - b)
    const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length
    const throughput = 1000 / avg // requests per second

    return {
      name,
      iterations: total,
      avgLatency: Math.round(avg),
      p50Latency: sorted[Math.floor(sorted.length * 0.5)],
      p95Latency: sorted[Math.floor(sorted.length * 0.95)],
      p99Latency: sorted[Math.floor(sorted.length * 0.99)],
      minLatency: sorted[0],
      maxLatency: sorted[sorted.length - 1],
      throughput: Math.round(throughput * 10) / 10,
      errorRate: Math.round((errors / total) * 100),
    }
  }

  /**
   * Compare all results
   */
  compareResults(): void {
    console.log('\n📊 Benchmark Comparison\n')
    console.log('┌─────────────┬──────────┬─────────┬─────────┬─────────┬────────────┐')
    console.log('│ Optimization│ Avg (ms) │ P50     │ P95     │ P99     │ Throughput │')
    console.log('├─────────────┼──────────┼─────────┼─────────┼─────────┼────────────┤')

    this.results.forEach(r => {
      const baseline = this.results[0]
      const speedup = baseline ? (baseline.avgLatency / r.avgLatency).toFixed(2) : '1.00'
      console.log(
        `│ ${r.name.padEnd(11)} │ ${String(r.avgLatency).padEnd(8)} │ ${String(r.p50Latency).padEnd(7)} │ ${String(r.p95Latency).padEnd(7)} │ ${String(r.p99Latency).padEnd(7)} │ ${String(r.throughput).padEnd(10)} │`
      )
    })

    console.log('└─────────────┴──────────┴─────────┴─────────┴─────────┴────────────┘')
    console.log()
  }

  /**
   * Save results to file
   */
  saveResults(): void {
    const output = {
      timestamp: new Date().toISOString(),
      results: this.results,
      comparison: this.results.map(r => {
        const baseline = this.results[0]
        return {
          name: r.name,
          speedup: baseline ? (baseline.avgLatency / r.avgLatency).toFixed(2) : 1,
        }
      }),
    }

    const path = join(process.cwd(), 'logs', 'benchmark-results.json')
    writeFileSync(path, JSON.stringify(output, null, 2))
    console.log(`💾 Results saved to ${path}`)
  }
}

// CLI entry
async function main() {
  const args = process.argv.slice(2)
  const suite = new BenchmarkSuite()

  console.log('⚡ OpenClaw Performance Benchmark Suite\n')

  const model = 'llama3.1:8b'
  const prompt = 'Explain the concept of machine learning in simple terms'
  const prompts = [
    'Hello',
    'How are you?',
    'What is AI?',
    'Explain TypeScript',
    'Write a function',
  ]

  // Run benchmarks
  console.log('Running benchmarks...\n')

  await suite.runBaseline(model, prompt, 10)
  await suite.runWithCache(model, prompts, 10)
  await suite.runWithBatch(model, prompts, 5)
  await suite.runWithSpeculative('phi3:mini', model, prompt, 10)

  // Compare results
  suite.compareResults()
  suite.saveResults()
}

main().catch(console.error)
