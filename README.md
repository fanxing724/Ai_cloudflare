# 🧹 伊蕾娜 QQ机器人

> 基于《魔女之旅》角色的 AI 聊天机器人，运行在 Cloudflare Workers 上

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Platform](https://img.shields.io/badge/platform-Cloudflare%20Workers-orange.svg)
![Node](https://img.shields.io/badge/runtime-Edge%20Runtime-green.svg)

## ✨ 特性

- 🎭 **角色扮演** - 完美还原伊蕾娜（《魔女之旅》灰之魔女）的人设与性格
- 🎨 **丰富彩蛋** - 20+ 隐藏彩蛋，探索惊喜不断
- 🌸 **季节限定** - 樱花季、圣诞节等节日专属互动
- 💾 **智能记忆** - 私聊记忆、记住用户喜好、记录相识天数
- ⏰ **时间感知** - 北京时间准确感知，根据时段动态调整问候语
- 🎭 **情绪追踪** - 记住用户近期情绪状态，给予温柔关怀
- 💤 **温柔陪伴** - 深夜睡不着时的摇篮曲陪伴
- 🚀 **零成本部署** - Cloudflare Workers 免费额度足够个人使用

## 🎮 功能预览

### 基础对话
```
用户：在吗
伊蕾娜：（从魔导书堆探出头）*刷* 在哦～早安～今天的牛角面包刚出炉哦！
(小声) 这是我们认识的第7天呢～

用户：想吃牛角面包
伊蕾娜：🥐 *从围裙里掏出牛角面包*
给！刚烤好的～
(小声) 偷偷多给你一个，不要告诉别人哦！
```

### 隐藏彩蛋
```
用户：牛角面包
用户：牛角面包  
用户：牛角面包
伊蕾娜：🥐 *突然从书堆里跳出来*
啊啦～你、你怎么知道这是秘密暗号！
*慌乱中掉出一张纸条*
「番星大人说...只能给最可爱的旅人」

✨ 你解锁了隐藏彩蛋！说「谢谢」领取秘密配方～
```

### 时间感知
```
// 早安
用户：早安
伊蕾娜：☀️ 早安～今天的天空特别蓝呢！
*伸个懒腰*
第一站要去哪里旅行呀？

(小声) 这是我们一起看日出的第15天呢～

// 深夜
用户：睡不着
伊蕾娜：🌙 *轻轻摇晃水晶球*
睡不着的话...要听星星摇篮曲吗？
*扫帚轻轻摇晃*
闭上眼睛...（开始轻声哼唱）
```

## 📦 快速开始

### 前置要求

- [Cloudflare](https://dash.cloudflare.com/) 账号
- QQ机器人框架（推荐 [NapCat](https://github.com/NapNeko/NapCatQQ)）
- AI API（二选一）：
  - [智谱AI GLM](https://open.bigmodel.cn/)（推荐，免费额度充足）
  - [讯飞星火](https://xinghuo.xfyun.cn/)

### 部署步骤

1. **克隆仓库**
```bash
git clone https://github.com/your-username/irena-qqbot.git
cd irena-qqbot
```

2. **配置 API Key**
   
   方式一：修改 `worker.js` 中的配置
   ```javascript
   const CONFIG = {
     GLM_API_KEY: "你的智谱AI API Key",
     XF_APP_ID: "你的讯飞App ID",
     // ...
   };
   ```
   
   方式二：使用 Cloudflare 环境变量（推荐）

3. **部署到 Cloudflare Workers**
```bash
# 安装 wrangler
npm install -g wrangler

# 登录
wrangler login

# 部署
wrangler deploy
```

4. **配置 NapCat**

   将 NapCat 的消息转发到你的 Worker URL：
   ```
   https://your-worker.your-subdomain.workers.dev
   ```

详细部署教程请查看 [DEPLOY.md](./DEPLOY.md)

## 🎯 支持的命令

| 命令 | 说明 |
|------|------|
| `/help` | 查看魔法指南（3页） |
| `/clear` | 清除对话记忆 |
| `/status` | 查看魔力状态 |
| `/mem` | 查看记忆条数 |
| `/traits` | 查看我记住的你 |
| `/mood` | 查看情绪状态 |
| `/horoscope 星座` | 今日运势占卜 |

## 🥚 彩蛋列表

<details>
<summary>点击展开完整彩蛋列表</summary>

### 🗣️ 日常触发
- `在吗` / `在不` / `在不在` → 探头回应 + 认识天数
- `早安` / `早上好` → 早安祝福
- `晚安` / `睡了` / `睡觉` → 晚安祝福
- `好饿` / `肚子饿` / `饿了` → 投喂牛角面包
- `好困` / `想睡` / `困了` → 摇篮曲
- `好累` / `好疲惫` / `累了` → 安神花茶 + 关怀

### 🥐 隐藏彩蛋
- 连续发送3次 `牛角面包` → 解锁秘密暗号，说「谢谢」领取配方
- `用牛角面包修复` / `修好面包` → 故障修复魔法
- `看星星` / `星空` → 许愿互动
- `想旅行` / `去旅行` / `想去` → 记忆回溯（记住你想去的地方）
- `讲故事` / `说故事` → 旅行故事分享

### 🌸 季节限定
- 3-4月说 `樱花` / `想看花` / `赏花` → 樱花季彩蛋
- 12月说 `圣诞` / `平安夜` → 圣诞礼物

### ✨ 角色彩蛋
- `天才魔女` / `灰之魔女` / `你是谁` → 得意回应
- `番星` → 脸红回应
- `蘑菇` → 过敏打喷嚏（概率触发不同反应）
- `魔法失败` / `出故障了` → 故障提示

### 💤 温柔陪伴
- `睡不着` / `失眠` → 星星摇篮曲（次日早上会关心昨晚睡得怎样）
- 会记住你的旅行心愿、食物偏好、生日、职业
- 会感知你近期的情绪状态

</details>

## 🛠️ 技术栈

- **Runtime**: Cloudflare Workers (Edge Runtime)
- **AI**: 智谱AI GLM / 讯飞星火
- **Storage**: Cloudflare KV (可选)
- **Protocol**: NapCat HTTP回调

## 📁 项目结构

```
irena-qqbot/
├── worker.js          # 主程序代码
├── wrangler.toml      # Cloudflare Workers 配置
├── README.md          # 项目说明
├── DEPLOY.md          # 部署教程
└── LICENSE            # MIT 许可证
```

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 详见 [LICENSE](LICENSE) 文件

## 🙏 致谢

- [《魔女之旅》](https://ga.sbgaraku.com/) - 角色原作
- [智谱AI](https://open.bigmodel.cn/) - GLM 大模型
- [NapCat](https://github.com/NapNeko/NapCatQQ) - QQ机器人框架
- [Cloudflare Workers](https://workers.cloudflare.com/) - 边缘计算平台

---

<p align="center">
  <i>「我可是天才美少女魔女伊蕾娜哦！」</i>
</p>
