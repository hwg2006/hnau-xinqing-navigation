// ============================================================
// 内嵌本地代理模块
// 职责：在 Electron 主进程内起一个仅监听 127.0.0.1 的 HTTP 代理，
//       页面所有 /v1/* 请求先打到本代理，由主进程注入
//       Authorization 后转发给 Dify，渲染层因此不持有 API Key。
// 说明：与 server/dify_proxy.py 思路一致，只是跑在主进程内，
//       桌面端无需额外启动 Python 服务。
// ============================================================

const http = require('http');
const https = require('https');

// 工厂函数：注入 loadConfig，每次请求都重新读配置以支持热更新
function createProxyServer({ loadConfig }) {
  let server = null;
  let port = 0;

  function handleRequest(req, res) {
    // 渲染层从 file:// 加载，Origin 为 null，需放开 CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');

    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    if (!req.url.startsWith('/v1/')) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
      return;
    }

    const cfg = loadConfig();
    let target;
    try {
      target = new URL(req.url, cfg.difyBaseUrl || 'http://localhost');
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'invalid difyBaseUrl' }));
      return;
    }

    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const headers = {};
      for (const [k, v] of Object.entries(req.headers)) {
        if (k === 'host' || k === 'content-length' || k === 'connection') continue;
        headers[k] = v;
      }
      if (cfg.difyApiKey) headers['authorization'] = `Bearer ${cfg.difyApiKey}`;
      headers['content-length'] = Buffer.byteLength(body);

      const mod = target.protocol === 'https:' ? https : http;
      const upstream = mod.request(target, { method: req.method, headers }, (up) => {
        res.writeHead(up.statusCode || 502, up.headers);
        up.pipe(res); // SSE 流式透传
      });
      upstream.on('error', (e) => {
        if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'upstream error: ' + e.message }));
      });
      upstream.end(body);
    });
    req.on('error', () => {
      try { res.writeHead(400); res.end(); } catch (_) { /* 忽略 */ }
    });
  }

  // 启动代理，成功返回端口号
  function start() {
    return new Promise((resolve, reject) => {
      server = http.createServer(handleRequest);
      server.on('error', reject);
      // 仅监听本机回环地址、随机端口，避免端口占用冲突
      server.listen(0, '127.0.0.1', () => {
        port = server.address().port;
        resolve(port);
      });
    });
  }

  function stop() {
    if (server) {
      try { server.close(); } catch (e) { /* 忽略 */ }
      server = null;
    }
  }

  function getPort() { return port; }

  return { start, stop, getPort };
}

module.exports = { createProxyServer };
