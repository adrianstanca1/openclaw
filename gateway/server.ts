#!/usr/bin/env node
/**
 * OpenClaw Web Gateway Server
 * Browser-accessible inference gateway with real-time chat UI
 */

import { execSync } from "child_process";
import { readFileSync } from "fs";
import http from "http";
import { join } from "path";

const PORT = process.env.PORT || 3002;
const HTML_PATH = join(process.cwd(), "gateway", "index.html");

// Simple in-memory cache
const cache = new Map<string, string>();

const server = http.createServer(async (req: http.IncomingMessage, res: http.ServerResponse) => {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  // Serve gateway UI
  if (req.method === "GET" && (req.url === "/" || req.url === "/gateway")) {
    try {
      const html = readFileSync(HTML_PATH, "utf8");
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(html);
    } catch {
      res.writeHead(404);
      res.end("Gateway UI not found");
    }
    return;
  }

  // Inference API
  if (req.method === "POST" && req.url === "/api/infer") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", async () => {
      try {
        const { prompt, model } = JSON.parse(body);

        // Check cache
        const cached = cache.get(prompt);
        if (cached) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ response: cached, cacheHit: true, tokens: 0 }));
          return;
        }

        // Run inference
        const start = Date.now();
        const output = execSync(`ollama run ${model} "${prompt.replace(/"/g, '\\"')}"`, {
          encoding: "utf8",
          timeout: 60000,
        });
        const latency = Date.now() - start;
        const tokens = output.split(" ").length;

        // Cache response
        cache.set(prompt, output.trim());

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            response: output.trim(),
            model,
            tokens,
            latency,
            cacheHit: false,
          }),
        );
      } catch (error: unknown) {
        res.writeHead(500);
        const err = error as Error;
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Health check
  if (req.method === "GET" && req.url === "/api/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", port: PORT, cacheSize: cache.size }));
    return;
  }

  // 404
  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 OpenClaw Web Gateway");
  console.log(`   URL: http://localhost:${PORT}`);
  console.log(`   Network: http://192.168.1.118:${PORT}`);
  console.log(`   Gateway UI: http://localhost:${PORT}/`);
  console.log(`   API: http://localhost:${PORT}/api/infer`);
  console.log();
  console.log("   Ready for browser access!");
});
