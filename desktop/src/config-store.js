// ============================================================
// 配置存储模块
// 职责：读写桌面端用户配置（userData/config.json）；
//       若用户尚未配置，则回退读取项目共享的 config/.env，
//       免去在桌面端重复录入 Dify Key。
// ============================================================

const path = require('path');
const fs = require('fs');
const { app } = require('electron');

const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');
// 本文件位于 desktop/src/，项目 config 目录在仓库根，故需回退两级
const ENV_PATH = path.join(__dirname, '..', '..', 'config', '.env');

// 解析形如 KEY=VALUE 的 .env 文件，返回键值对象
function parseEnvFile(file) {
  const out = {};
  try {
    const text = fs.readFileSync(file, 'utf-8');
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m) out[m[1]] = m[2];
    }
  } catch (e) { /* 文件不存在则忽略 */ }
  return out;
}

// 读取配置：用户配置优先，否则回退 config/.env
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    }
  } catch (e) { /* 解析失败则回退 */ }
  const env = parseEnvFile(ENV_PATH);
  return {
    difyBaseUrl: env.DIFY_BASE_URL || 'http://localhost',
    difyApiKey: env.DIFY_API_KEY || '',
  };
}

// 持久化配置到 userData/config.json
function saveConfig(cfg) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
  } catch (e) {
    console.error('保存配置失败:', e);
  }
}

module.exports = { loadConfig, saveConfig, CONFIG_PATH, ENV_PATH };
