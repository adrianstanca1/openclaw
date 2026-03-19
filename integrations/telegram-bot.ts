#!/usr/bin/env node
/**
 * OpenClaw Telegram Bot
 * Connect OpenClaw AI to Telegram messaging
 */

import { execSync } from "child_process";
import { writeFileSync } from "fs";
import https from "https";
import { join } from "path";

interface TelegramConfig {
  botToken: string;
  webhookUrl: string;
  adminIds: number[];
}

interface Message {
  chat_id: number;
  message_id: number;
  text: string;
  from: { id: number; username?: string };
  date: number;
}

class TelegramBot {
  private config: TelegramConfig;
  private apiUrl: string;
  private webhookPort: number = 8443;

  constructor(token: string) {
    this.config = {
      botToken: token,
      webhookUrl: "",
      adminIds: [],
    };
    this.apiUrl = `https://api.telegram.org/bot${token}`;
  }

  /**
   * Get bot info
   */
  async getBotInfo(): Promise<any> {
    return this.request("getMe");
  }

  /**
   * Set webhook for updates
   */
  async setWebhook(url: string): Promise<any> {
    return this.request("setWebhook", { url });
  }

  /**
   * Delete webhook
   */
  async deleteWebhook(): Promise<any> {
    return this.request("deleteWebhook");
  }

  /**
   * Get webhook info
   */
  async getWebhookInfo(): Promise<any> {
    return this.request("getWebhookInfo");
  }

  /**
   * Send message
   */
  async sendMessage(chatId: number, text: string, parseMode = "Markdown"): Promise<any> {
    return this.request("sendMessage", {
      chat_id: chatId,
      text,
      parse_mode: parseMode,
    });
  }

  /**
   * Send photo
   */
  async sendPhoto(chatId: number, photo: string, caption = ""): Promise<any> {
    return this.request("sendPhoto", {
      chat_id: chatId,
      photo,
      caption,
    });
  }

  /**
   * Send document
   */
  async sendDocument(chatId: number, document: string, caption = ""): Promise<any> {
    return this.request("sendDocument", {
      chat_id: chatId,
      document,
      caption,
    });
  }

  /**
   * Get updates
   */
  async getUpdates(offset = 0, limit = 100, timeout = 30): Promise<any> {
    return this.request("getUpdates", {
      offset,
      limit,
      timeout,
    });
  }

  /**
   * Request helper
   */
  private request(method: string, params: any = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      const url = `${this.apiUrl}/${method}`;
      const data = JSON.stringify(params);

      const options = {
        hostname: "api.telegram.org",
        port: 443,
        path: url.replace("https://api.telegram.org", ""),
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": data.length,
        },
      };

      const req = https.request(options, (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch {
            reject(new Error("Invalid JSON response"));
          }
        });
      });

      req.on("error", reject);
      req.write(data);
      req.end();
    });
  }

  /**
   * Process message with AI
   */
  async processMessage(message: Message): Promise<void> {
    const text = message.text;
    const chatId = message.chat_id;

    console.log(
      `📨 Message from ${message.from.username || message.from.id}: ${text.substring(0, 50)}...`,
    );

    // Handle commands
    if (text.startsWith("/")) {
      await this.handleCommand(text, chatId, message.from.id);
      return;
    }

    // AI inference
    try {
      const response = execSync(`ollama run llama3.1:8b "${text.replace(/"/g, '\\"')}"`, {
        encoding: "utf8",
        timeout: 60000,
      });

      await this.sendMessage(chatId, response.trim());
    } catch (error: any) {
      await this.sendMessage(chatId, `Error: ${error.message}`);
    }
  }

  /**
   * Handle bot commands
   */
  async handleCommand(command: string, chatId: number, userId: number): Promise<void> {
    const cmd = command.split(" ")[0].toLowerCase();

    switch (cmd) {
      case "/start":
        await this.sendMessage(
          chatId,
          `🦞 Welcome to OpenClaw Bot!

I'm your AI assistant powered by local LLM.

Commands:
/help - Show help
/status - Bot status
/infer <prompt> - Run inference
/models - List available models
/clear - Clear conversation`,
        );
        break;

      case "/help":
        await this.sendMessage(
          chatId,
          `📖 OpenClaw Bot Help

Available commands:
/start - Start conversation
/help - Show this help
/status - Bot status
/infer <prompt> - Run AI inference
/models - List models
/clearchat - Clear history

Just send any text to chat with AI!`,
        );
        break;

      case "/status":
        const info = await this.getBotInfo();
        await this.sendMessage(
          chatId,
          `📊 Bot Status

Name: ${info.result.first_name}
Username: @${info.result.username}
ID: ${info.result.id}`,
        );
        break;

      case "/infer":
        const prompt = command.substring(7);
        if (!prompt) {
          await this.sendMessage(chatId, "Usage: /infer <your prompt>");
          return;
        }
        try {
          const response = execSync(`ollama run llama3.1:8b "${prompt.replace(/"/g, '\\"')}"`, {
            encoding: "utf8",
            timeout: 60000,
          });
          await this.sendMessage(chatId, response.trim());
        } catch (error: any) {
          await this.sendMessage(chatId, `Error: ${error.message}`);
        }
        break;

      case "/models":
        try {
          const output = execSync("ollama ls", { encoding: "utf8" });
          await this.sendMessage(chatId, `📦 Available Models:\n\`\`\`\n${output}\n\`\`\``);
        } catch {
          await this.sendMessage(chatId, "Failed to list models");
        }
        break;

      case "/clear":
      case "/clearchat":
        await this.sendMessage(chatId, "Conversation cleared!");
        break;

      default:
        await this.sendMessage(chatId, "Unknown command. Use /help for available commands.");
    }
  }

  /**
   * Start polling loop
   */
  async startPolling(): Promise<void> {
    console.log("🤖 Starting Telegram bot polling...\n");

    let offset = 0;

    const poll = async () => {
      try {
        const updates = await this.getUpdates(offset, 100, 30);

        if (updates.result) {
          for (const update of updates.result) {
            offset = update.update_id + 1;

            if (update.message) {
              await this.processMessage(update.message);
            }
          }
        }
      } catch (error: any) {
        console.error("Polling error:", error.message);
      }

      setTimeout(poll, 1000);
    };

    poll();
  }

  /**
   * Save config
   */
  saveConfig(): void {
    const configPath = join(process.cwd(), "config", "telegram.json");
    writeFileSync(configPath, JSON.stringify(this.config, null, 2));
    console.log(`💾 Config saved to ${configPath}`);
  }
}

// CLI entry
async function main() {
  const args = process.argv.slice(2);
  const action = args[0] || "test";
  const token = args[1] || process.env.TELEGRAM_BOT_TOKEN;

  console.log("🤖 OpenClaw Telegram Bot\n");

  if (!token) {
    console.log("❌ No bot token provided");
    console.log("Usage: telegram-bot.ts <action> [token]");
    console.log("Set TELEGRAM_BOT_TOKEN env var or pass token as argument");
    console.log();
    console.log("To create a bot:");
    console.log("1. Message @BotFather on Telegram");
    console.log("2. Send /newbot");
    console.log("3. Follow instructions");
    console.log("4. Copy the token");
    return;
  }

  const bot = new TelegramBot(token);

  if (action === "info") {
    const info = await bot.getBotInfo();
    console.log("Bot Info:");
    console.log(`  Name: ${info.result.first_name}`);
    console.log(`  Username: @${info.result.username}`);
    console.log(`  ID: ${info.result.id}`);
  } else if (action === "webhook") {
    const url = args[2] || "https://your-domain.com/telegram-webhook";
    const result = await bot.setWebhook(url);
    console.log("Webhook set:", result);
  } else if (action === "poll") {
    bot.startPolling();
  } else if (action === "test") {
    const info = await bot.getBotInfo();
    console.log("✅ Bot connection successful");
    console.log(`   Name: ${info.result.first_name}`);
    console.log(`   Username: @${info.result.username}`);
    console.log();
    console.log("Ready to receive messages!");
  } else if (action === "send") {
    const chatId = parseInt(args[2]);
    const text = args[3] || "Hello from OpenClaw!";
    await bot.sendMessage(chatId, text);
    console.log("Message sent");
  }
}

main().catch(console.error);
