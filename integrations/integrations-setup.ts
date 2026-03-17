#!/usr/bin/env node
/**
 * OpenClaw Integrations Setup
 * Configure all external service connections
 */

import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

interface IntegrationConfig {
  name: string
  enabled: boolean
  apiKey: string
  webhookUrl: string
  config: Record<string, any>
}

class IntegrationsSetup {
  private integrations: Map<string, IntegrationConfig>

  constructor() {
    this.integrations = new Map()
  }

  /**
   * Add integration
   */
  add(name: string, config: Partial<IntegrationConfig>): void {
    this.integrations.set(name, {
      name,
      enabled: config.enabled ?? false,
      apiKey: config.apiKey || '',
      webhookUrl: config.webhookUrl || '',
      config: config.config || {},
    })
  }

  /**
   * Generate config file
   */
  generateConfig(): void {
    const configDir = join(process.cwd(), 'config')
    mkdirSync(configDir, { recursive: true })

    const config = {
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
      integrations: Object.fromEntries(this.integrations),
    }

    const path = join(configDir, 'integrations.json')
    writeFileSync(path, JSON.stringify(config, null, 2))
    console.log(`💾 Config saved to ${path}`)
  }

  /**
   * Setup Telegram
   */
  setupTelegram(token: string): void {
    this.add('telegram', {
      enabled: true,
      apiKey: token,
      config: {
        webhookPort: 8443,
        adminIds: [],
        commands: ['/start', '/help', '/infer', '/status', '/models'],
      },
    })
    console.log('✅ Telegram configured')
  }

  /**
   * Setup Slack
   */
  setupSlack(botToken: string, signingSecret: string): void {
    this.add('slack', {
      enabled: true,
      apiKey: botToken,
      config: {
        signingSecret,
        channels: ['general'],
        events: ['message', 'reaction'],
      },
    })
    console.log('✅ Slack configured')
  }

  /**
   * Setup Discord
   */
  setupDiscord(botToken: string, guildId: string): void {
    this.add('discord', {
      enabled: true,
      apiKey: botToken,
      config: {
        guildId,
        channels: [],
        intents: ['messages', 'guilds'],
      },
    })
    console.log('✅ Discord configured')
  }

  /**
   * Setup WhatsApp
   */
  setupWhatsApp(phoneNumberId: string, accessToken: string): void {
    this.add('whatsapp', {
      enabled: false,
      apiKey: accessToken,
      config: {
        phoneNumberId,
        verifyToken: '',
        businessAccountId: '',
      },
    })
    console.log('✅ WhatsApp configured (disabled)')
  }

  /**
   * Setup GitHub
   */
  setupGitHub(token: string, webhookSecret: string): void {
    this.add('github', {
      enabled: true,
      apiKey: token,
      config: {
        webhookSecret,
        webhookPort: 8080,
        autoPR: false,
        repos: [],
      },
    })
    console.log('✅ GitHub configured')
  }

  /**
   * Setup Linear
   */
  setupLinear(apiKey: string, teamId: string): void {
    this.add('linear', {
      enabled: true,
      apiKey,
      config: {
        teamId,
        autoCreate: false,
        syncInterval: 300,
      },
    })
    console.log('✅ Linear configured')
  }

  /**
   * Setup Supabase
   */
  setupSupabase(url: string, anonKey: string, serviceKey: string): void {
    this.add('supabase', {
      enabled: true,
      apiKey: anonKey,
      config: {
        url,
        serviceKey,
        realtime: true,
        storage: true,
      },
    })
    console.log('✅ Supabase configured')
  }

  /**
   * Setup Vercel
   */
  setupVercel(token: string, teamId: string): void {
    this.add('vercel', {
      enabled: true,
      apiKey: token,
      config: {
        teamId,
        autoDeploy: false,
        previewEnabled: true,
      },
    })
    console.log('✅ Vercel configured')
  }

  /**
   * Setup Stripe
   */
  setupStripe(secretKey: string, webhookSecret: string): void {
    this.add('stripe', {
      enabled: false,
      apiKey: secretKey,
      config: {
        webhookSecret,
        autoInvoice: false,
        products: [],
      },
    })
    console.log('✅ Stripe configured (disabled)')
  }

  /**
   * Print setup summary
   */
  printSummary(): void {
    console.log('\n📊 Integration Summary:\n')
    console.log('┌─────────────┬──────────┬──────────────────────────┐')
    console.log('│ Service     │ Status   │ Configuration            │')
    console.log('├─────────────┼──────────┼──────────────────────────┤')

    this.integrations.forEach((config, name) => {
      const status = config.enabled ? '✅ Enabled' : '❌ Disabled'
      const keyMasked = config.apiKey ? `${config.apiKey.substring(0, 4)}...` : 'Not set'
      console.log(`│ ${name.padEnd(11)} │ ${status.padEnd(8)} │ ${keyMasked.padEnd(24)} │`)
    })

    console.log('└─────────────┴──────────┴──────────────────────────┘')
  }
}

// CLI entry
async function main() {
  const args = process.argv.slice(2)
  const action = args[0] || 'setup'

  console.log('🔌 OpenClaw Integrations Setup\n')

  const setup = new IntegrationsSetup()

  if (action === 'setup') {
    // Setup all integrations with placeholder values
    setup.setupTelegram('YOUR_TELEGRAM_BOT_TOKEN')
    setup.setupSlack('xoxb-YOUR-SLACK-TOKEN', 'YOUR_SIGNING_SECRET')
    setup.setupDiscord('YOUR_DISCORD_BOT_TOKEN', 'YOUR_GUILD_ID')
    setup.setupWhatsApp('YOUR_PHONE_ID', 'YOUR_ACCESS_TOKEN')
    setup.setupGitHub('YOUR_GITHUB_TOKEN', 'YOUR_WEBHOOK_SECRET')
    setup.setupLinear('YOUR_LINEAR_API_KEY', 'YOUR_TEAM_ID')
    setup.setupSupabase('https://xxx.supabase.co', 'YOUR_ANON_KEY', 'YOUR_SERVICE_KEY')
    setup.setupVercel('YOUR_VERCEL_TOKEN', 'YOUR_TEAM_ID')
    setup.setupStripe('sk_YOUR_STRIPE_KEY', 'YOUR_WEBHOOK_SECRET')

    setup.generateConfig()
    setup.printSummary()

    console.log('\n📝 Next steps:')
    console.log('   1. Edit config/integrations.json with real credentials')
    console.log('   2. For Telegram: Get token from @BotFather')
    console.log('   3. For Slack: Create app at api.slack.com')
    console.log('   4. For Discord: Create bot at discord.com/developers')
    console.log('   5. Run: node --import tsx integrations/telegram-bot.ts poll')
  } else if (action === 'telegram') {
    const token = args[1]
    if (token) {
      setup.setupTelegram(token)
      setup.generateConfig()
      console.log('\n✅ Telegram configured!')
      console.log('   Run: node --import tsx integrations/telegram-bot.ts poll')
    } else {
      console.log('Usage: integrations-setup.ts telegram <bot-token>')
    }
  } else if (action === 'list') {
    setup.add('telegram', { enabled: false })
    setup.add('slack', { enabled: false })
    setup.add('discord', { enabled: false })
    setup.printSummary()
  }
}

main().catch(console.error)
