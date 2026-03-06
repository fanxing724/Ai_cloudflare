# 🚀 伊蕾娜 QQ机器人 部署教程

本教程将指导你从零开始部署伊蕾娜 QQ机器人。

## 📋 目录

- [前置准备](#前置准备)
- [获取AI API](#获取ai-api)
- [配置API密钥](#配置api密钥)
- [部署Worker](#部署worker)
- [配置NapCat](#配置napcat)
- [绑定KV存储](#绑定kv存储)
- [常见问题](#常见问题)

---

## 前置准备

### 必需

| 项目 | 说明 | 获取方式 |
|------|------|----------|
| Cloudflare 账号 | 用于托管 Worker | [注册](https://dash.cloudflare.com/sign-up) |
| NapCat | QQ机器人框架 | [GitHub](https://github.com/NapNeko/NapCatQQ) |
| AI API | GLM 或 讯飞 | 见下方教程 |

### 可选

| 项目 | 用途 |
|------|------|
| Cloudflare KV | 对话记忆存储 |
| 自定义域名 | 更美观的访问地址 |

---

## 获取AI API

### 方式一：智谱AI GLM（推荐）

**优势**：免费额度充足，响应快，效果好

1. 访问 [智谱AI开放平台](https://open.bigmodel.cn/)
2. 注册/登录账号
3. 进入 [API Key 管理](https://open.bigmodel.cn/usercenter/apikeys)
4. 点击「创建 API Key」

```
API Key 格式：xxxxxxxx.xxxxxxxxxxxxxx
```

### 方式二：讯飞星火

1. 访问 [讯飞星火开放平台](https://xinghuo.xfyun.cn/)
2. 注册/登录
3. 创建应用，获取 AppID、API Key、API Secret

---

## 配置API密钥

> ⚠️ **安全提示**：API Key 属于敏感信息，请勿提交到公开仓库！

本项目支持多种配置方式，按安全性排序：

### 方式一：Cloudflare Secrets（推荐 ⭐）

**最安全**，密钥加密存储，不会出现在代码或配置文件中。

**命令行**：
```bash
# 设置 GLM API Key
wrangler secret put GLM_API_KEY
# 输入你的 API Key

# 设置讯飞配置（如使用讯飞）
wrangler secret put XF_APP_ID
wrangler secret put XF_KEY_1
wrangler secret put XF_SECRET_1
```

**网页控制台**：
1. Workers & Pages → 你的 Worker → 设置
2. 变量 → 环境变量 → 添加
3. 选择「加密」类型
4. 添加变量名和值

### 方式二：网页控制台环境变量

**较安全**，不会出现在代码中。

1. Workers & Pages → 你的 Worker → 设置
2. 变量 → 环境变量 → 添加
3. 选择「明文」或「加密」类型
4. 添加变量：

| 变量名 | 说明 |
|--------|------|
| `GLM_API_KEY` | 智谱AI API Key |
| `XF_APP_ID` | 讯飞 App ID |
| `XF_KEY_1` | 讯飞 API Key（模型1） |
| `XF_SECRET_1` | 讯飞 API Secret（模型1） |

### 方式三：wrangler.toml 变量

**仅适合开发环境**，会提交到 Git。

编辑 `wrangler.toml`：
```toml
name = "irena-qqbot"
main = "worker.js"
compatibility_date = "2024-01-01"

[vars]
GLM_API_KEY = "你的API Key"
XF_APP_ID = "你的AppID"
```

⚠️ **警告**：如果项目开源，请确保 `wrangler.toml` 在 `.gitignore` 中！

### 方式四：直接写入代码

**最简单但最不安全**，仅适合私有项目。

编辑 `worker.js` 开头的 `CONFIG` 对象：
```javascript
const CONFIG = {
  GLM_API_KEY: "你的智谱AI API Key",
  XF_APP_ID: "你的讯飞App ID",
  // ...
};

// 讯飞模型配置
const XF_MODELS = [
  { 
    name: "Spark Ultra-32K", 
    url: "https://spark-api.xf-yun.com/v4.0/chat", 
    domain: "4.0Ultra", 
    key: "你的讯飞Key", 
    secret: "你的讯飞Secret" 
  },
  // ...
];
```

### 方式五：本地开发用 .dev.vars

**仅用于本地测试**，不会部署到 Cloudflare。

创建 `.dev.vars` 文件（已加入 `.gitignore`）：
```env
GLM_API_KEY=你的API Key
XF_APP_ID=你的AppID
XF_KEY_1=你的讯飞Key
XF_SECRET_1=你的讯飞Secret
```

本地运行：
```bash
wrangler dev
```

### 配置方式对比

| 方式 | 安全性 | 易用性 | 适用场景 |
|------|--------|--------|----------|
| Cloudflare Secrets | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | 生产环境（推荐） |
| 网页控制台变量 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 生产环境 |
| wrangler.toml | ⭐⭐ | ⭐⭐⭐⭐⭐ | 私有项目 |
| 写入代码 | ⭐ | ⭐⭐⭐⭐⭐ | 快速测试 |
| .dev.vars | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 本地开发 |

### 验证配置

部署后测试配置是否正确：
```bash
curl -X POST https://你的worker.workers.dev \
  -H "Content-Type: application/json" \
  -d '{"post_type":"message","message_type":"private","user_id":1,"message":"你好"}'
```

如果返回伊蕾娜的回复，说明配置成功！

---

## 部署Worker

### 方法一：命令行部署（推荐）

#### 1. 安装 Node.js

**Windows/macOS**: 下载 [Node.js 官网](https://nodejs.org/) 安装包

**Linux**:
```bash
# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# CentOS/RHEL
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs
```

#### 2. 安装 Wrangler

```bash
npm install -g wrangler
```

#### 3. 登录 Cloudflare

```bash
wrangler login
```

浏览器会打开授权页面，点击允许。

#### 4. 创建项目

```bash
# 创建项目目录
mkdir irena-qqbot && cd irena-qqbot

# 初始化
wrangler init
```

按提示选择：
- `Yes to all` - 使用默认配置
- 不需要 TypeScript

#### 5. 替换代码

将本项目 `worker.js` 复制到项目目录

#### 6. 配置 API Key

参考上方 [配置API密钥](#配置api密钥) 章节，选择适合的方式配置。

#### 7. 部署

```bash
wrangler deploy
```

成功后会显示：
```
Published irena-qqbot (production)
  https://irena-qqbot.你的账号.workers.dev
```

### 方法二：网页控制台部署

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 左侧菜单 → Workers & Pages
3. 点击「创建应用程序」→「创建 Worker」
4. 命名为 `irena-qqbot`，点击「部署」
5. 点击「编辑代码」
6. 删除默认代码，粘贴 `worker.js` 内容
7. 点击「保存并部署」
8. 配置 API Key：设置 → 变量 → 环境变量（参考 [配置API密钥](#配置api密钥)）

---

## 绑定KV存储

KV 用于存储对话记忆，**强烈推荐绑定**。

### 1. 创建 KV 命名空间

**命令行**:
```bash
wrangler kv:namespace create AI_KV
```

**网页控制台**:
1. Workers & Pages → KV
2. 创建命名空间，命名为 `AI_KV`

### 2. 绑定到 Worker

编辑 `wrangler.toml`：
```toml
[[kv_namespaces]]
binding = "AI_KV"
id = "你的KV命名空间ID"
```

或网页控制台：
1. 进入 Worker → 设置 → 变量
2. KV 命名空间绑定 → 添加绑定
3. 变量名：`AI_KV`，选择刚创建的命名空间

---

## 配置NapCat

### 1. 安装 NapCat

参考 [NapCat 官方文档](https://napneko.github.io/zh-CN/develop/introduction)

**快速安装（Docker）**:
```bash
docker run -d \
  --name napcat \
  -p 3000:3000 \
  -v ./napcat:/app/napcat/config \
  mlikiowa/napcat-docker:latest
```

### 2. 配置 HTTP 回调

编辑 NapCat 配置文件（通常在 `config/onebot.json`）：

```json
{
  "http": {
    "enable": true,
    "host": "0.0.0.0",
    "port": 3000
  },
  "httpPost": {
    "enable": true,
    "urls": [
      "https://你的worker.workers.dev"
    ]
  }
}
```

### 3. 登录 QQ

启动 NapCat 后，扫描二维码登录。

### 4. 测试

给机器人 QQ 发送消息：
```
在吗
```

如果收到伊蕾娜的回复，说明部署成功！

---

## 常见问题

### Q: 机器人不回复？

**检查清单**：
1. Worker 是否部署成功？访问 Worker URL 应返回 `{"reply":"..."}`
2. NapCat 是否正常运行？
3. HTTP 回调 URL 是否正确？
4. QQ 是否登录成功？

**调试方法**：
```bash
# 查看 Worker 日志
wrangler tail

# 测试 Worker
curl -X POST https://你的worker.workers.dev \
  -H "Content-Type: application/json" \
  -d '{"post_type":"message","message_type":"private","user_id":12345,"message":"在吗"}'
```

### Q: AI 回复很慢或报错？

1. 检查 API Key 是否正确
2. 检查 API 额度是否用完
3. 尝试切换 AI 模型（GLM ↔ 讯飞）

### Q: 对话记忆不工作？

1. 确认 KV 已绑定
2. 检查 KV 变量名是否为 `AI_KV`
3. 查看 Worker 日志是否有错误

### Q: 群聊不回复？

群聊需要 @ 机器人才会回复，这是预期行为。

### Q: 如何修改人设？

编辑 `worker.js` 中的 `SYSTEM_PROMPT`：
```javascript
const SYSTEM_PROMPT = `你的自定义人设...`;
```

### Q: 如何添加新彩蛋？

在 `worker.js` 主逻辑中添加新的判断：
```javascript
if (text.includes("你的关键词")) {
  return Response.json({ reply: "你的回复" });
}
```

---

## 进阶配置

### 自定义域名

1. Cloudflare Dashboard → 你的域名 → Workers 路由
2. 添加路由：`bot.yourdomain.com/*` → `irena-qqbot`

### 多模型负载均衡

修改 `GLM_MODELS` 数组，添加多个模型：
```javascript
const GLM_MODELS = [
  { name: "glm-4", model: "glm-4", priority: 1 },
  { name: "glm-4-air", model: "glm-4-air", priority: 2 },
  { name: "glm-3-turbo", model: "glm-3-turbo", priority: 3 }
];
```

### 限流配置

修改 `CONFIG`：
```javascript
const CONFIG = {
  RATE_LIMIT: 5,  // 每分钟最大消息数
  // ...
};
```

---

## 下一步

- 🎮 尝试各种彩蛋
- 📝 根据需要修改人设
- 🤝 [参与贡献](https://github.com/your-username/irena-qqbot)

有问题欢迎提 [Issue](https://github.com/your-username/irena-qqbot/issues)！
