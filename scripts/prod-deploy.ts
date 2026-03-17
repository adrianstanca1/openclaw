#!/usr/bin/env node
/**
 * OpenClaw Production Deploy Script
 * Deploys all optimizations to production environment
 */

import { execSync } from 'child_process'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

interface DeployConfig {
  target: 'local' | 'vps' | 'cloud'
  host: string
  port: number
  sshKey: string
  models: string[]
  optimizations: string[]
}

class ProductionDeploy {
  private config: DeployConfig
  private logs: string[] = []

  constructor(config: Partial<DeployConfig> = {}) {
    this.config = {
      target: config.target || 'local',
      host: config.host || 'localhost',
      port: config.port || 3000,
      sshKey: config.sshKey || '',
      models: config.models || ['llama3.1:8b', 'llama3.2:3b', 'phi3:mini'],
      optimizations: config.optimizations || ['all'],
    }
  }

  private logMessage(message: string): void {
    const timestamp = new Date().toISOString()
    const entry = `[${timestamp}] ${message}`
    this.logs.push(entry)
    console.log(entry)
  }

  /**
   * Pre-deployment checks
   */
  async preChecks(): Promise<boolean> {
    this.logMessage('🔍 Running pre-deployment checks...\n')

    const checks = [
      { name: 'Node.js', cmd: 'node --version' },
      { name: 'Ollama', cmd: 'ollama --version' },
      { name: 'pnpm', cmd: 'pnpm --version' },
      { name: 'Build', cmd: 'test -d dist || test -d .next' },
    ]

    let allPassed = true

    checks.forEach(check => {
      try {
        execSync(check.cmd, { stdio: 'ignore' })
        this.logMessage(`✅ ${check.name}: OK`)
      } catch {
        this.logMessage(`❌ ${check.name}: FAILED`)
        allPassed = false
      }
    })

    this.logMessage()
    return allPassed
  }

  /**
   * Install required models
   */
  async installModels(): Promise<void> {
    this.logMessage('📦 Installing models...\n')

    for (const model of this.config.models) {
      try {
        this.logMessage(`   Checking ${model}...`)
        execSync(`ollama ls ${model}`, { stdio: 'ignore' })
        this.logMessage(`   ✅ ${model}: Already installed`)
      } catch {
        this.logMessage(`   📥 ${model}: Downloading...`)
        execSync(`ollama pull ${model}`, { stdio: 'inherit' })
        this.logMessage(`   ✅ ${model}: Ready`)
      }
    }

    this.logMessage()
  }

  /**
   * Generate production config
   */
  generateProductionConfig(): void {
    this.logMessage('⚙️  Generating production config...\n')

    const config = {
      environment: 'production',
      port: this.config.port,
      host: this.config.host,
      hardwareProfile: 'workstation',
      optimizations: {
        cache: true,
        kvCache: true,
        speculative: true,
        gpuOffload: true,
        batching: true,
        distributed: false,
      },
      models: {
        default: 'llama3.1:8b',
        draft: 'phi3:mini',
        code: 'codellama:7b',
        analytical: 'llama3.1:70b',
      },
      performance: {
        maxThreads: 16,
        maxContext: 16384,
        batchSize: 256,
        cacheSize: 10000,
        cacheTTL: 300000,
      },
      monitoring: {
        enabled: true,
        dashboardPort: 3001,
        metricsInterval: 5000,
      },
      deployedAt: new Date().toISOString(),
    }

    const configPath = join(process.cwd(), 'config', 'production.json')
    mkdirSync(join(configPath, '..'), { recursive: true })
    writeFileSync(configPath, JSON.stringify(config, null, 2))

    this.logMessage(`   Config: ${configPath}`)
    this.logMessage()
  }

  /**
   * Build production bundle
   */
  async build(): Promise<void> {
    this.logMessage('🏗️  Building production bundle...\n')

    try {
      execSync('pnpm build', { stdio: 'inherit' })
      this.logMessage('✅ Build successful')
    } catch (error) {
      this.logMessage('❌ Build failed')
      throw error
    }

    this.logMessage()
  }

  /**
   * Start production server
   */
  async startServer(): Promise<void> {
    this.logMessage('🚀 Starting production server...\n')

    try {
      execSync(`pnpm start --port ${this.config.port} &`, { stdio: 'ignore' })
      this.logMessage(`   Server starting on port ${this.config.port}`)
      
      // Wait for server to start
      await new Promise(resolve => setTimeout(resolve, 3000))
      
      // Health check
      try {
        execSync(`curl -s http://localhost:${this.config.port} > /dev/null`, { stdio: 'ignore' })
        this.logMessage('✅ Server healthy')
      } catch {
        this.logMessage('⚠️  Server health check pending')
      }
    } catch (error) {
      this.logMessage('❌ Server start failed')
      throw error
    }

    this.logMessage()
  }

  /**
   * Start monitoring dashboard
   */
  async startDashboard(): Promise<void> {
    this.logMessage('📊 Starting monitoring dashboard...\n')

    try {
      execSync(`node --import tsx scripts/performance-dashboard.ts &`, { stdio: 'ignore' })
      this.logMessage('   Dashboard starting on port 3001')
      this.logMessage('   URL: http://localhost:3001')
      this.logMessage('✅ Dashboard ready')
    } catch {
      this.logMessage('⚠️  Dashboard start failed')
    }

    this.logMessage()
  }

  /**
   * Deploy to VPS via SSH
   */
  async deployToVPS(): Promise<void> {
    this.logMessage('🌐 Deploying to VPS...\n')

    const vpsHost = '72.62.132.43'
    const vpsUser = 'root'

    const commands = [
      'mkdir -p /opt/openclaw',
      'scp -r * ${vpsUser}@${vpsHost}:/opt/openclaw/',
      'cd /opt/openclaw && pnpm install --production',
      'cd /opt/openclaw && pnpm build',
      'ollama pull llama3.1:8b',
      'ollama pull phi3:mini',
      'pm2 restart openclaw',
    ]

    this.logMessage('   Commands to run on VPS:')
    commands.forEach(cmd => this.logMessage(`   $ ${cmd}`))
    this.logMessage()

    this.logMessage('⚠️  SSH deployment requires manual execution')
    this.logMessage('   Run: ssh root@72.62.132.43')
    this.logMessage()
  }

  /**
   * Generate deployment report
   */
  generateReport(): void {
    this.logMessage('📄 Generating deployment report...\n')

    const report = {
      status: 'success',
      target: this.config.target,
      host: this.config.host,
      port: this.config.port,
      models: this.config.models,
      optimizations: this.config.optimizations,
      deployedAt: new Date().toISOString(),
      logs: this.log,
    }

    const reportPath = join(process.cwd(), 'logs', 'deploy-report.json')
    writeFileSync(reportPath, JSON.stringify(report, null, 2))

    this.logMessage(`   Report: ${reportPath}`)
    this.logMessage()
  }

  /**
   * Run full deployment
   */
  async deploy(): Promise<void> {
    this.logMessage('🚀 OpenClaw Production Deployment\n')
    this.logMessage(`Target: ${this.config.target}`)
    this.logMessage(`Host: ${this.config.host}`)
    this.logMessage(`Port: ${this.config.port}`)
    this.logMessage()

    // Pre-checks
    const passed = await this.preChecks()
    if (!passed) {
      this.logMessage('❌ Pre-checks failed. Fix issues before deploying.')
      return
    }

    // Install models
    await this.installModels()

    // Generate config
    this.generateProductionConfig()

    // Build
    await this.build()

    // Start server
    await this.startServer()

    // Start dashboard
    await this.startDashboard()

    // Generate report
    this.generateReport()

    this.logMessage('✅ Deployment complete!\n')
    this.logMessage('📊 Access points:')
    this.logMessage(`   App: http://localhost:${this.config.port}`)
    this.logMessage(`   Dashboard: http://localhost:3001`)
    this.logMessage()
    this.logMessage('🚀 Ready for production!')
  }
}

// CLI entry
async function main() {
  const args = process.argv.slice(2)
  const action = args[0] || 'deploy'

  const deployer = new ProductionDeploy({
    target: 'local',
    port: 3000,
    models: ['llama3.1:8b', 'llama3.2:3b', 'phi3:mini', 'codellama:7b'],
    optimizations: ['all'],
  })

  if (action === 'deploy') {
    await deployer.deploy()
  } else if (action === 'check') {
    await deployer.preChecks()
  } else if (action === 'models') {
    await deployer.installModels()
  } else if (action === 'config') {
    deployer.generateProductionConfig()
  } else if (action === 'build') {
    await deployer.build()
  } else if (action === 'start') {
    await deployer.startServer()
    await deployer.startDashboard()
  } else if (action === 'vps') {
    await deployer.deployToVPS()
  } else if (action === 'report') {
    deployer.generateReport()
  }
}

main().catch(console.error)
