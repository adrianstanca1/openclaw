#!/usr/bin/env node
/**
 * OpenClaw Smart Model Switcher
 * Auto-selects best model based on task complexity, latency, and hardware load
 */

import { execSync } from 'child_process'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

interface ModelMetrics {
  name: string
  avgLatency: number
  successRate: number
  tokensPerSecond: number
  vramUsage: number
  qualityScore: number
}

interface TaskProfile {
  type: 'simple' | 'complex' | 'creative' | 'analytical' | 'code'
  maxLatency: number
  minQuality: number
  contextLength: number
}

const MODEL_REGISTRY: ModelMetrics[] = [
  { name: 'phi3:mini', avgLatency: 200, successRate: 99, tokensPerSecond: 150, vramUsage: 2, qualityScore: 70 },
  { name: 'llama3.2:3b', avgLatency: 400, successRate: 98, tokensPerSecond: 100, vramUsage: 3, qualityScore: 85 },
  { name: 'llama3.1:8b', avgLatency: 800, successRate: 97, tokensPerSecond: 50, vramUsage: 6, qualityScore: 90 },
  { name: 'mistral:7b', avgLatency: 750, successRate: 96, tokensPerSecond: 55, vramUsage: 5, qualityScore: 88 },
  { name: 'codellama:7b', avgLatency: 800, successRate: 95, tokensPerSecond: 45, vramUsage: 5, qualityScore: 92 },
  { name: 'llama3.1:70b', avgLatency: 3000, successRate: 99, tokensPerSecond: 15, vramUsage: 40, qualityScore: 98 },
]

const TASK_PROFILES: Record<string, TaskProfile> = {
  simple: { type: 'simple', maxLatency: 500, minQuality: 60, contextLength: 1024 },
  complex: { type: 'complex', maxLatency: 2000, minQuality: 85, contextLength: 8192 },
  creative: { type: 'creative', maxLatency: 1500, minQuality: 80, contextLength: 4096 },
  analytical: { type: 'analytical', maxLatency: 3000, minQuality: 90, contextLength: 16384 },
  code: { type: 'code', maxLatency: 1000, minQuality: 85, contextLength: 8192 },
}

/**
 * Detect current system load
 */
function getSystemLoad(): { cpu: number; ram: number; vram: number } {
  try {
    const loadavg = execSync('cat /proc/loadavg 2>/dev/null || sysctl -n vm.loadavg 2>/dev/null || echo "0.5"', { encoding: 'utf8' }).trim()
    const cpu = parseFloat(loadavg.split(' ').pop() || '0.5')
    
    const memInfo = execSync('free -m 2>/dev/null || vm_stat 2>/dev/null || echo "MemTotal: 48000"', { encoding: 'utf8' })
    const ram = 48 // Default for this machine
    
    const vram = 0 // Discrete GPU detection would go here
    
    return { cpu, ram, vram }
  } catch {
    return { cpu: 0.5, ram: 48, vram: 0 }
  }
}

/**
 * Score model suitability for task
 */
function scoreModel(model: ModelMetrics, task: TaskProfile, load: { cpu: number; ram: number; vram: number }): number {
  let score = 0
  
  // Quality match
  if (model.qualityScore >= task.minQuality) {
    score += 40
  } else {
    score += (model.qualityScore / task.minQuality) * 40
  }
  
  // Latency match
  if (model.avgLatency <= task.maxLatency) {
    score += 30
  } else {
    score += Math.max(0, 30 - (model.avgLatency - task.maxLatency) / 100)
  }
  
  // VRAM availability
  if (model.vramUsage <= load.ram) {
    score += 20
  } else {
    score += 0
  }
  
  // Throughput bonus
  score += model.tokensPerSecond / 10
  
  // Success rate bonus
  score += model.successRate / 10
  
  return score
}

/**
 * Select best model for task
 */
function selectModel(taskType: string): string {
  const task = TASK_PROFILES[taskType] || TASK_PROFILES.simple
  const load = getSystemLoad()
  
  console.log('🔍 Analyzing task requirements...')
  console.log(`   Type: ${task.type}`)
  console.log(`   Max latency: ${task.maxLatency}ms`)
  console.log(`   Min quality: ${task.minQuality}`)
  console.log(`   Context: ${task.contextLength}`)
  console.log()
  console.log('📊 System Load:')
  console.log(`   CPU: ${load.cpu}`)
  console.log(`   RAM: ${load.ram} GB`)
  console.log()
  
  const scores = MODEL_REGISTRY.map(model => ({
    model,
    score: scoreModel(model, task, load),
  }))
  
  scores.sort((a, b) => b.score - a.score)
  
  console.log('🏆 Model Rankings:')
  scores.forEach((s, i) => {
    console.log(`   ${i + 1}. ${s.model.name}: ${Math.round(s.score)} points`)
  })
  console.log()
  
  const winner = scores[0]
  console.log(`✅ Selected: ${winner.model.name}`)
  
  return winner.model.name
}

/**
 * Switch to new model
 */
async function switchModel(modelName: string): Promise<void> {
  console.log(`🔄 Switching to ${modelName}...`)
  
  try {
    // Verify model exists
    execSync(`ollama ls ${modelName} 2>/dev/null`, { stdio: 'ignore' })
    console.log(`✅ ${modelName} is ready`)
  } catch {
    console.log(`📥 ${modelName} not found, pulling...`)
    execSync(`ollama pull ${modelName}`, { stdio: 'inherit' })
  }
  
  // Update config
  const configPath = join(process.cwd(), 'config', 'active-model.json')
  writeFileSync(configPath, JSON.stringify({
    model: modelName,
    switchedAt: new Date().toISOString(),
    reason: 'auto-selection',
  }, null, 2))
  
  console.log(`💾 Config saved to ${configPath}`)
}

/**
 * Main CLI entry
 */
async function main() {
  const args = process.argv.slice(2)
  const taskType = args[0] || 'simple'
  
  console.log('🧠 OpenClaw Smart Model Switcher\n')
  
  const selected = selectModel(taskType)
  await switchModel(selected)
  
  console.log('\n✨ Model switch complete!')
  console.log(`Next task will use: ${selected}`)
}

main().catch(console.error)
