#!/usr/bin/env node
/**
 * OpenClaw Semantic Cache
 * LLM-powered response caching with semantic similarity matching
 * Avoids redundant inference by detecting semantically similar queries
 */

import { createHash } from 'crypto'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'

interface CachedResponse {
  id: string
  query: string
  queryEmbedding: number[]
  response: string
  model: string
  tokens: number
  latency: number
  createdAt: number
  hitCount: number
  lastHitAt: number
}

interface CacheConfig {
  maxSize: number
  ttlMs: number
  similarityThreshold: number
  embeddingModel: string
  evictionPolicy: 'lru' | 'lfu' | 'fifo'
}

class SemanticCache {
  private cache: Map<string, CachedResponse>
  private config: CacheConfig
  private cacheDir: string
  private indexFile: string

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      maxSize: config.maxSize || 10000,
      ttlMs: config.ttlMs || 300_000, // 5 minutes
      similarityThreshold: config.similarityThreshold || 0.85,
      embeddingModel: config.embeddingModel || 'all-minilm:22m',
      evictionPolicy: config.evictionPolicy || 'lru',
    }

    this.cache = new Map()
    this.cacheDir = join(process.cwd(), 'cache', 'semantic')
    this.indexFile = join(this.cacheDir, 'index.json')

    // Ensure cache directory exists
    if (!existsSync(this.cacheDir)) {
      mkdirSync(this.cacheDir, { recursive: true })
    }

    // Load persisted cache
    this.loadCache()
  }

  /**
   * Generate semantic embedding for query
   */
  private async generateEmbedding(query: string): Promise<number[]> {
    try {
      const { execSync } = require('child_process')
      const output = execSync(
        `ollama embed ${this.config.embeddingModel} "${query.replace(/"/g, '\\"')}"`,
        { encoding: 'utf8' }
      )
      return JSON.parse(output).embedding || []
    } catch {
      // Fallback to hash-based embedding
      return this.hashEmbedding(query)
    }
  }

  /**
   * Fallback: simple hash-based embedding
   */
  private hashEmbedding(query: string): number[] {
    const hash = createHash('sha256').update(query).digest('hex')
    return hash.split('').map(c => c.charCodeAt(0) / 255)
  }

  /**
   * Calculate cosine similarity between embeddings
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    const dot = a.reduce((sum, val, i) => sum + val * b[i], 0)
    const normA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0))
    const normB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0))

    if (normA === 0 || normB === 0) return 0
    return dot / (normA * normB)
  }

  /**
   * Check if query exists in cache (semantic match)
   */
  async get(query: string): Promise<CachedResponse | null> {
    const queryEmbedding = await this.generateEmbedding(query)

    // Find semantically similar cached queries
    let bestMatch: CachedResponse | null = null
    let bestScore = 0

    for (const [key, cached] of this.cache.entries()) {
      // Skip expired entries
      if (Date.now() - cached.createdAt > this.config.ttlMs) {
        this.cache.delete(key)
        continue
      }

      const similarity = this.cosineSimilarity(queryEmbedding, cached.queryEmbedding)

      if (similarity > this.config.similarityThreshold && similarity > bestScore) {
        bestScore = similarity
        bestMatch = cached
        cached.hitCount++
        cached.lastHitAt = Date.now()
      }
    }

    if (bestMatch) {
      console.log(`✅ Cache HIT (similarity: ${(bestScore * 100).toFixed(1)}%)`)
      console.log(`   Query: "${query}"`)
      console.log(`   Cached response: "${bestMatch.response.substring(0, 50)}..."`)
      console.log(`   Latency saved: ${bestMatch.latency}ms`)
      console.log()

      // Move to end for LRU
      this.cache.delete(bestMatch.id)
      this.cache.set(bestMatch.id, bestMatch)

      return bestMatch
    }

    console.log(`❌ Cache MISS`)
    console.log(`   Query: "${query}"`)
    console.log()
    return null
  }

  /**
   * Add response to cache
   */
  async set(query: string, response: string, model: string, tokens: number, latency: number): Promise<string> {
    const id = createHash('sha256').update(query + Date.now()).digest('hex').substring(0, 16)
    const embedding = await this.generateEmbedding(query)

    const cached: CachedResponse = {
      id,
      query,
      queryEmbedding: embedding,
      response,
      model,
      tokens,
      latency,
      createdAt: Date.now(),
      hitCount: 0,
      lastHitAt: 0,
    }

    // Evict if at capacity
    if (this.cache.size >= this.config.maxSize) {
      this.evict()
    }

    this.cache.set(id, cached)
    this.persistCache()

    console.log(`💾 Cache STORED`)
    console.log(`   ID: ${id}`)
    console.log(`   Query: "${query.substring(0, 50)}..."`)
    console.log(`   Tokens: ${tokens}`)
    console.log(`   Latency: ${latency}ms`)
    console.log()

    return id
  }

  /**
   * Evict oldest/least used entries
   */
  private evict(): void {
    const entries = Array.from(this.cache.entries())

    switch (this.config.evictionPolicy) {
      case 'lru':
        entries.sort((a, b) => a[1].lastHitAt - b[1].lastHitAt)
        break
      case 'lfu':
        entries.sort((a, b) => a[1].hitCount - b[1].hitCount)
        break
      case 'fifo':
        entries.sort((a, b) => a[1].createdAt - b[1].createdAt)
        break
    }

    // Remove oldest 10%
    const removeCount = Math.ceil(this.cache.size * 0.1)
    for (let i = 0; i < removeCount; i++) {
      this.cache.delete(entries[i][0])
    }

    console.log(`🗑️  Evicted ${removeCount} entries (${this.config.evictionPolicy})`)
  }

  /**
   * Persist cache to disk
   */
  private persistCache(): void {
    const data = {
      config: this.config,
      size: this.cache.size,
      entries: Array.from(this.cache.entries()),
      savedAt: new Date().toISOString(),
    }

    writeFileSync(this.indexFile, JSON.stringify(data, null, 2))
  }

  /**
   * Load cache from disk
   */
  private loadCache(): void {
    try {
      const data = readFileSync(this.indexFile, 'utf8')
      const parsed = JSON.parse(data)

      parsed.entries.forEach(([key, value]: [string, CachedResponse]) => {
        this.cache.set(key, value)
      })

      console.log(`📂 Loaded ${this.cache.size} cached entries`)
    } catch {
      console.log(`📂 Cache index not found, starting fresh`)
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number
    maxSize: number
    hitRate: number
    avgLatencySaved: number
    totalTokensSaved: number
    memoryUsage: number
  } {
    const entries = Array.from(this.cache.values())
    const hits = entries.reduce((sum, e) => sum + e.hitCount, 0)
    const total = entries.length + 1 // +1 for misses estimate
    const latencySaved = entries.reduce((sum, e) => sum + e.latency * e.hitCount, 0)
    const tokensSaved = entries.reduce((sum, e) => sum + e.tokens * e.hitCount, 0)

    return {
      size: entries.length,
      maxSize: this.config.maxSize,
      hitRate: Math.round((hits / total) * 100),
      avgLatencySaved: Math.round(latencySaved / (hits || 1)),
      totalTokensSaved: tokensSaved,
      memoryUsage: Math.round(entries.length * 500 / 1024), // ~500KB per entry
    }
  }

  /**
   * Clear cache
   */
  clear(): void {
    this.cache.clear()
    this.persistCache()
    console.log(`🗑️  Cache cleared`)
  }
}

// CLI entry
async function main() {
  const args = process.argv.slice(2)
  const action = args[0] || 'stats'
  const query = args[1] || ''

  console.log('🧠 OpenClaw Semantic Cache\n')

  const cache = new SemanticCache()

  if (action === 'test') {
    // Test caching with sample queries
    const testQueries = [
      'What is TypeScript?',
      'Explain TypeScript programming',
      'TypeScript vs JavaScript',
      'How to install Node.js?',
      'Node.js installation steps',
    ]

    console.log('Running cache test...\n')

    for (const q of testQueries) {
      const hit = await cache.get(q)
      if (!hit) {
        await cache.set(q, 'Sample response for: ' + q, 'llama3.1:8b', 50, 500)
      }
    }

    console.log()
    const stats = cache.getStats()
    console.log('📊 Cache Statistics:')
    console.log(`   Size: ${stats.size}/${stats.maxSize}`)
    console.log(`   Hit rate: ${stats.hitRate}%`)
    console.log(`   Avg latency saved: ${stats.avgLatencySaved}ms`)
    console.log(`   Total tokens saved: ${stats.totalTokensSaved}`)
    console.log(`   Memory usage: ${stats.memoryUsage} MB`)
  } else if (action === 'stats') {
    const stats = cache.getStats()
    console.log('📊 Cache Statistics:')
    console.log(`   Size: ${stats.size}/${stats.maxSize}`)
    console.log(`   Hit rate: ${stats.hitRate}%`)
    console.log(`   Avg latency saved: ${stats.avgLatencySaved}ms`)
    console.log(`   Total tokens saved: ${stats.totalTokensSaved}`)
    console.log(`   Memory usage: ${stats.memoryUsage} MB`)
  } else if (action === 'clear') {
    cache.clear()
  } else if (action === 'query') {
    if (!query) {
      console.log('Usage: semantic-cache.ts query "<your query>"')
      return
    }
    const hit = await cache.get(query)
    if (hit) {
      console.log('\nCached response:')
      console.log(hit.response)
    } else {
      console.log('Not in cache - would call LLM')
    }
  }
}

main().catch(console.error)
