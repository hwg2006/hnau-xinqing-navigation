// ============================================================
// 设置页逻辑
// 职责：通过 window.hnauAPI（preload 暴露的 IPC 桥）读取/保存配置。
//       本页不含任何密钥处理逻辑，仅做 UI 组织与订阅。
// ============================================================

(function () {
  'use strict';

  const api = window.hnauAPI;

  // 回填当前配置
  function fill() {
    api.getConfig().then((cfg) => {
      document.getElementById('url').value = cfg.difyBaseUrl || '';
      document.getElementById('key').value = cfg.difyApiKey || '';
    });
  }

  // 保存并关闭
  function save() {
    const url = document.getElementById('url').value.trim();
    const key = document.getElementById('key').value.trim();
    api.saveConfig({ difyBaseUrl: url, difyApiKey: key }).then(() => {
      const h = document.getElementById('hint');
      h.style.display = 'block';
      setTimeout(() => window.close(), 1200);
    });
  }

  document.getElementById('save-btn').addEventListener('click', save);
  fill();
})();
