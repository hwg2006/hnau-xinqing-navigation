// ============================================================
// 华农心晴导航 Web 前端 - UI 层（Vue3 应用）
// 职责: 组织界面状态、渲染消息、自动滚动、订阅后端推送并更新视图
// 不负责: 通信协议细节与密钥（见 web/api.js 与 server/ 代理）
// ============================================================

const { createApp, ref, nextTick } = Vue;

const api = window.XinQingAPI;

createApp({
  setup() {
    const messages = ref([]);
    const input = ref('');
    const streaming = ref(false);
    const conversationId = ref('');
    const messagesEnd = ref(null);
    const backendError = ref(false); // 后端不可达时给出提示

    // 自动滚动到底部
    function scrollToBottom() {
      nextTick(() => {
        if (messagesEnd.value) {
          messagesEnd.value.scrollTop = messagesEnd.value.scrollHeight;
        }
      });
    }

    // 发送消息：只负责 UI 组织，通信交给 api.js，事件回来再更新视图
    async function sendMessage() {
      const text = input.value.trim();
      if (!text || streaming.value) return;

      messages.value.push({ role: 'user', content: text });
      input.value = '';
      streaming.value = true;

      const aiMsg = { role: 'assistant', content: '' };
      messages.value.push(aiMsg);
      scrollToBottom();

      try {
        await api.streamChat(text, conversationId.value, {
          onDelta(delta) {
            aiMsg.content += delta;
            scrollToBottom();
          },
          onConversationId(cid) {
            if (!conversationId.value) conversationId.value = cid;
          },
          // 订阅后端推送的 error 事件，避免错误被静默吞掉
          onError(msg) {
            backendError.value = true;
            aiMsg.content += (aiMsg.content ? '\n' : '') + '抱歉，出现了错误: ' + msg;
            scrollToBottom();
          },
        });
        backendError.value = false;
      } catch (err) {
        backendError.value = true;
        aiMsg.content = '抱歉，出现了错误: ' + err.message;
      } finally {
        streaming.value = false;
        scrollToBottom();
      }
    }

    function newChat() {
      messages.value = [];
      conversationId.value = '';
      streaming.value = false;
      backendError.value = false;
    }

    return {
      messages, input, streaming, messagesEnd,
      backendError, sendMessage, newChat,
    };
  },
}).mount('#app');

// 注册 Service Worker (PWA 离线缓存)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
