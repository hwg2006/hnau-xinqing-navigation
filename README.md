# 华农心晴导航 · 校园心理支持 AI 助手

> 一次「本地大模型 → 自建智能体 → API → 多端应用」的完整工程实践。
> 把**本地部署的 LLM**接入**自建智能体平台（Dify）**，再以 **API 形式**接入到 CLI / Web / 桌面三类应用中。

---

## 一、为什么做这个

校园心理健康服务长期存在三个痛点：

1. **供给不足**：心理咨询预约难、排队久，大量同学处在「没到需要就诊、但确实难受」的灰色地带，无人可聊。
2. **通用模型不懂校园**：直接问通用大模型，它不知道华农心理中心在哪、怎么预约、有哪些老师、紧急情况打哪个电话。
3. **隐私顾虑**：把失眠、焦虑、家庭矛盾这类内容发给公有云大模型，学生是不放心的。

**设计目标**：让模型**数据不出本机**，让回答**懂华农校园**，让入口**随手可用**。

---

## 二、整体思路（四层架构）

```
┌──────────────────────────────────────────────────────────────┐
│  应用层（同一套 API，三种形态复用）                              │
│   CLI(Python)        Web(Vue3 + PWA)      Desktop(Electron)   │
└───────────────┬──────────────┬──────────────────┬─────────────┘
                │              │                  │
                │        服务端代理(可选)          │
                │     server/dify_proxy.py        │
                │     ← 为 Web 隐藏 API Key        │
                ▼              ▼                  ▼
┌──────────────────────────────────────────────────────────────┐
│  接口层：Dify 暴露 REST API                                     │
│   POST /v1/chat-messages   (streaming / blocking)             │
│   Authorization: Bearer <API_KEY>                            │
└───────────────────────────┬──────────────────────────────────┘
                            ▼
┌──────────────────────────────────────────────────────────────┐
│  编排层：Dify 智能体平台（Docker 自部署）                        │
│   Chatflow「华农心晴导航（集成版）V3」                           │
│   · 情绪支持对话   · GAD-7 焦虑自测                             │
│   · 性格小游戏     · 心情打卡                                   │
│   · 校园资源/老师查询 · 高风险识别与紧急热线引导                  │
│   会话变量：core_issue / user_mood / anon_risk_tag ...          │
└───────────────────────────┬──────────────────────────────────┘
                            ▼
┌──────────────────────────────────────────────────────────────┐
│  模型层：Ollama 本地推理（数据不出本机）                          │
│   qwen2.5:7b，作为 Dify 的 model provider 接入                  │
└──────────────────────────────────────────────────────────────┘
```

**一句话概括**：模型层负责「能回答」，编排层负责「答得对、答得懂华农」，接口层负责「能被调用」，应用层负责「让人用得上」。

---

## 三、关键设计决策

### 1. 为什么用本地模型，而不是直接调云端 API

- **隐私**：心理话题敏感，本地推理让原始对话不离开这台机器。
- **成本**：没有按 token 计费，长期陪伴类应用边际成本为零。
- **可控**：模型、提示词、知识全部掌握在自己手里，可离线运行。

### 2. 为什么中间要加 Dify，而不是直接调 Ollama

直接调 Ollama 只能拿到「裸对话」。而业务需要的是**编排能力**：

- 可视化地组织「先共情 → 再评估风险 → 必要时给校园资源 → 记会话变量」这样的流程；
- 用**会话变量**跨轮次记住用户的困扰话题、情绪状态、风险标签；
- 把编排好的流程**一键发布成一个 API**，多端复用，而不是每个端各写一遍逻辑。

Dify 在这里扮演「智能体编排 + API 网关」的双重角色，Ollama 则被注册为它的模型提供者。

### 3. 为什么 Web 端必须走服务端代理（安全）

Dify 的 API Key 相当于应用的后门钥匙。如果直接写在前端 JS 里，任何人按 F12 就能拿到并盗用——这是典型的安全反模式。

因此 Web 端的做法是：

```
浏览器  →  server/dify_proxy.py（本机代理，持有 Key）  →  Dify /v1
```

- **Key 只保存在服务端**（`config/.env`），由代理在转发时注入 `Authorization` 头；
- 浏览器发出的请求**不含任何密钥**；
- 代理顺带解决 SSE 流式透传与跨域问题。

CLI 与桌面属于「本地可信客户端」，用户自己就是 Key 的所有者，可直连。

### 4. 会话状态放在哪

交给 Dify 托管：客户端只需在首轮拿到 `conversation_id`，后续请求带上它即可续接上下文，客户端不用自己维护对话历史与摘要。

### 5. 三端复用同一后端

CLI / Web / 桌面三个形态**共用同一个 Dify API**，只是「谁来持有 Key」不同。这保证了行为一致，也避免了多端逻辑分叉。

---

## 四、应用形态

| 形态 | 技术 | 状态 | 入口 |
|------|------|------|------|
| CLI | Python + rich | ✅ 已完成 | `cd cli && python cli.py` |
| Web | Vue3 + Tailwind + PWA | ✅ 已完成 | `http://localhost:8080` |
| 桌面 | Electron | 🚧 已搭建，暂缓安装 | `cd desktop && npm start` |

CLI 用于**最快验证**工作流；Web 用于**面向同学**的日常使用（PWA 可添加到手机桌面）；桌面用于**内嵌分发**（本机可信，Key 走设置窗口）。

---

## 五、技术栈

| 层次 | 选型 |
|------|------|
| 本地推理 | Ollama + qwen2.5:7b |
| 智能体平台 | Dify 1.17（Docker Compose 自部署） |
| 应用接口 | Dify REST API（`/v1/chat-messages`，SSE 流式） |
| Web 代理 | FastAPI + uvicorn（透传 SSE） |
| CLI | Python 3.12 + requests + rich + prompt_toolkit |
| Web 前端 | Vue 3（CDN）+ Tailwind CSS + Service Worker（PWA） |
| 桌面 | Electron（contextIsolation 安全桥接） |

---

## 六、目录结构

```
ai应用创新开发/
├── cli/                     # 命令行对话客户端（直连 Dify）
│   ├── cli.py               # 主程序：交互式 / 单轮对话
│   └── ollama_backend.py    # 备选后端：绕过 Dify 直连 Ollama
├── web/                     # Web 前端（Vue3 单页 + PWA）
│   ├── index.html           # 页面与对话逻辑
│   ├── config.js            # 仅存代理地址，不含任何密钥
│   └── sw.js                # Service Worker（config.js 走网络优先）
├── desktop/                 # Electron 桌面端
│   ├── main.js / preload.js # 主进程 + 安全桥接
│   └── assets/icon.png
├── server/
│   └── dify_proxy.py        # 服务端代理：注入 API Key + SSE 透传
├── config/
│   ├── .env                 # 真实配置（已被 .gitignore 排除）
│   └── .env.example         # 配置模板
├── 心理助手_集成版_V3_fixed.yml  # Dify 工作流源文件（可导入）
├── setup.ps1                # 一键环境安装脚本
└── start.bat                # 一键启动面板
```

> 说明：`docker/dify/` 为第三方 Dify 官方源码，体积大且非本项目成果，已在 `.gitignore` 中排除，需自行 clone。

---

## 七、快速开始（简要）

```powershell
# 0) 复制配置模板并填入自己的 Dify API Key
cp config\.env.example config\.env

# 1) 启动本地模型
ollama serve
ollama pull qwen2.5:7b

# 2) 启动 Dify（需 Docker Desktop）
cd docker\dify\docker ; docker compose up -d
# 浏览器打开 http://localhost，导入 心理助手_集成版_V3_fixed.yml 并发布

# 3) 启动 Web 代理（隐藏 Key）
cd server ; python -m uvicorn dify_proxy:app --host 127.0.0.1 --port 8001

# 4) 启动 Web 前端
cd web ; python -m http.server 8080     # 访问 http://localhost:8080

# 或直接用 CLI
cd cli ; python cli.py
```

详细的环境安装可运行 `setup.ps1`，日常启动可双击 `start.bat`。

---

## 八、安全设计要点

- **API Key 永不进入前端代码**：Web 通过本机代理注入 Authorization；
- `config/.env` 与一切密钥文件被 `.gitignore` 排除，仓库只保留 `.env.example`；
- 桌面端使用 `contextIsolation: true` + `contextBridge` 白名单桥接，渲染层无 Node 权限；
- 高风险识别只记录**风险标签类型**，具体查看权限与留存方式需由学校平台侧配置（见工作流变量注释）。

---

## 九、后续规划

- [ ] 桌面端打包分发
- [ ] 小程序形态（对话入口）
- [ ] 更丰富的华农校园知识库（RAG 接入）
- [ ] 风险预警与人工转介闭环

---

> AI 生成内容仅供参考，不能替代专业心理咨询。紧急情况请拨打 **12356**（全国心理援助热线）或 **120**。
