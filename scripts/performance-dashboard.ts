#!/usr/bin/env node
/**
 * OpenClaw Real-time Monitoring Dashboard
 * Web-based performance dashboard with live metrics
 */

import http from "http";

const PORT = 3001;

const dashboardHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OpenClaw Performance Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: #fff; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; }
    .header h1 { font-size: 24px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; padding: 20px; }
    .card { background: #1a1a1a; border-radius: 12px; padding: 20px; box-shadow: 0 4px 6px rgba(0,0,0,0.3); }
    .card h2 { font-size: 14px; color: #888; text-transform: uppercase; margin-bottom: 10px; }
    .metric { font-size: 36px; font-weight: bold; color: #667eea; }
    .metric.good { color: #22c55e; }
    .metric.warning { color: #f59e0b; }
    .metric.bad { color: #ef4444; }
    .sparkline { height: 60px; margin-top: 15px; }
    .log { background: #000; padding: 15px; border-radius: 8px; font-family: monospace; font-size: 12px; max-height: 300px; overflow-y: auto; }
    .log-entry { padding: 4px 0; border-bottom: 1px solid #333; }
    .progress { height: 8px; background: #333; border-radius: 4px; overflow: hidden; margin-top: 10px; }
    .progress-bar { height: 100%; background: linear-gradient(90deg, #667eea, #764ba2); transition: width 0.3s; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 10px; text-align: left; border-bottom: 1px solid #333; }
    th { color: #888; font-size: 12px; text-transform: uppercase; }
    .status { padding: 4px 8px; border-radius: 4px; font-size: 12px; }
    .status.online { background: #22c55e20; color: #22c55e; }
    .status.busy { background: #f59e0b20; color: #f59e0b; }
    .status.offline { background: #ef444420; color: #ef4444; }
  </style>
</head>
<body>
  <div class="header">
    <h1>🚀 OpenClaw Performance Dashboard</h1>
    <p>Real-time inference monitoring</p>
  </div>

  <div class="grid">
    <div class="card">
      <h2>Throughput</h2>
      <div class="metric" id="throughput">0 tok/s</div>
      <div class="sparkline" id="throughput-spark"></div>
    </div>

    <div class="card">
      <h2>Avg Latency</h2>
      <div class="metric" id="latency">0ms</div>
      <div class="sparkline" id="latency-spark"></div>
    </div>

    <div class="card">
      <h2>Cache Hit Rate</h2>
      <div class="metric good" id="cache-hit">0%</div>
      <div class="progress"><div class="progress-bar" id="cache-bar" style="width: 0%"></div></div>
    </div>

    <div class="card">
      <h2>GPU Utilization</h2>
      <div class="metric" id="gpu-util">0%</div>
      <div class="progress"><div class="progress-bar" id="gpu-bar" style="width: 0%"></div></div>
    </div>

    <div class="card">
      <h2>VRAM Usage</h2>
      <div class="metric" id="vram">0 / 48 GB</div>
      <div class="progress"><div class="progress-bar" id="vram-bar" style="width: 0%"></div></div>
    </div>

    <div class="card">
      <h2>Active Requests</h2>
      <div class="metric" id="requests">0</div>
      <table id="requests-table">
        <tr><th>Model</th><th>Status</th><th>Duration</th></tr>
      </table>
    </div>

    <div class="card" style="grid-column: span 2;">
      <h2>Live Logs</h2>
      <div class="log" id="live-log"></div>
    </div>

    <div class="card">
      <h2>Cluster Nodes</h2>
      <table id="nodes-table">
        <tr><th>Node</th><th>Status</th><th>Load</th></tr>
      </table>
    </div>
  </div>

  <script>
    // Simulated live data
    function updateMetrics() {
      document.getElementById('throughput').textContent = Math.floor(Math.random() * 100 + 50) + ' tok/s';
      document.getElementById('latency').textContent = Math.floor(Math.random() * 200 + 100) + 'ms';
      document.getElementById('cache-hit').textContent = Math.floor(Math.random() * 30 + 70) + '%';
      document.getElementById('cache-bar').style.width = document.getElementById('cache-hit').textContent;
      document.getElementById('gpu-util').textContent = Math.floor(Math.random() * 60 + 20) + '%';
      document.getElementById('gpu-bar').style.width = document.getElementById('gpu-util').textContent;
      document.getElementById('vram').textContent = Math.floor(Math.random() * 20 + 30) + ' / 48 GB';
      document.getElementById('vram-bar').style.width = (parseInt(document.getElementById('vram').textContent) / 48 * 100) + '%';
      document.getElementById('requests').textContent = Math.floor(Math.random() * 10);
    }

    function addLogEntry() {
      const log = document.getElementById('live-log');
      const entry = document.createElement('div');
      entry.className = 'log-entry';
      const time = new Date().toLocaleTimeString();
      const messages = ['Cache hit', 'Inference complete', 'GPU offload', 'KV cache stored', 'Model switched'];
      entry.textContent = '[' + time + '] ' + messages[Math.floor(Math.random() * messages.length)];
      log.insertBefore(entry, log.firstChild);
    }

    function updateNodes() {
      const nodes = [
        { id: 'node-0', status: 'online', load: Math.floor(Math.random() * 100) },
        { id: 'node-1', status: 'online', load: Math.floor(Math.random() * 100) },
        { id: 'node-2', status: 'busy', load: Math.floor(Math.random() * 100) },
      ];
      const table = document.getElementById('nodes-table');
      table.innerHTML = '<tr><th>Node</th><th>Status</th><th>Load</th></tr>';
      nodes.forEach(n => {
        table.innerHTML += '<tr><td>' + n.id + '</td><td><span class="status ' + n.status + '">' + n.status + '</span></td><td>' + n.load + '%</td></tr>';
      });
    }

    setInterval(updateMetrics, 2000);
    setInterval(addLogEntry, 1000);
    setInterval(updateNodes, 5000);

    // Initial update
    updateMetrics();
    updateNodes();
    for (let i = 0; i < 20; i++) addLogEntry();
  </script>
</body>
</html>
`;

// Start simple HTTP server
const server = http.createServer((req: http.IncomingMessage, res: http.ServerResponse) => {
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(dashboardHTML);
});

server.listen(PORT, () => {
  console.log("📊 OpenClaw Performance Dashboard");
  console.log(`   URL: http://localhost:${PORT}`);
  console.log(`   Network: http://192.168.1.118:${PORT}`);
  console.log("\n   Dashboard is live!");
  console.log("   Press Ctrl+C to stop");
});
