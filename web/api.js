// ============================================================
// 华农心晴导航 Web 前端 - 通信层（只订阅，不持有任何密钥）
// 职责: 解析后端地址、发起 /v1/chat-messages 流式请求、解析 SSE 事件
// 不负责: UI 渲染、密钥管理（Key 由 server/dify_proxy.py 在服务端注入）
// ============================================================

(function () {
  'use strict';

  // 地址来源优先级：桌面端注入(HN_DESKTOP) > web/config.js > 默认本地代理
  const config = window.APP_CONFIG || {};
  const API_BASE = (config.apiBaseUrl || 'http://localhost:8001').replace(/\/$/, '');
  const USER_ID = 'web_user_001';

  /**
   * 流式对话订阅。
   * @param {string} query 用户输入
   * @param {string} conversationId 会话 ID（首轮传空串）
   * @param {{onDelta?:Function, onConversationId?:Function, onError?:Function}} handlers
   * @returns {Promise<void>}
   */
  async function streamChat(query, conversationId, handlers) {
    const resp = await fetch(`${API_BASE}/v1/chat-messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inputs: {},
        query: query,
        response_mode: 'streaming',
        conversation_id: conversationId || '',
        user: USER_ID,
      }),
    });

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // 按行切分 SSE，最后一段可能不完整，留到下一轮
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') continue;

        let json;
        try {
          json = JSON.parse(data);
        } catch (_) {
          continue; // 跳过无法解析的心跳/空包
        }

        if (json.event === 'message' && json.answer && handlers.onDelta) {
          handlers.onDelta(json.answer);
        }
        if (json.conversation_id && handlers.onConversationId) {
          handlers.onConversationId(json.conversation_id);
        }
        if (json.event === 'error' && handlers.onError) {
          handlers.onError(json.message || '未知错误');
        }
      }
    }
  }

  window.XinQingAPI = { streamChat, apiBase: API_BASE };
})();
