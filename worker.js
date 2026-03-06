/**
 * 伊蕾娜 QQ机器人 - Cloudflare Workers 版
 * 基于《魔女之旅》角色的AI聊天机器人
 * 
 * @author 番星
 * @license MIT
 */

// ====================== 1. 全局配置 ======================
const CONFIG = {
  // 请在 Cloudflare Workers 环境变量中配置以下值
  // 或直接替换为你的 API Key
  GLM_API_KEY: "",  // 智谱AI API Key
  XF_APP_ID: "",    // 讯飞星火 App ID
  MAX_MEMORY: 8,
  MEMORY_TTL: 604800,
  TIMEOUT: 9000,
  RATE_LIMIT: 3,
  ERROR_MSG: "伊蕾娜好像出故障啦…快去叫番星来帮帮我好不好～\n(小声提示：试试说「用牛角面包修复」？)",
  EMPTY_MSG: "我在呢，你想说什么呀～",
  ADMIN_ID: ""
};

// ====================== 2. 模型配置 ======================
const GLM_MODELS = [
  { name: "glm-4", url: "https://open.bigmodel.cn/api/paas/v4/chat/completions", model: "glm-4", priority: 1 },
  { name: "glm-4-air", url: "https://open.bigmodel.cn/api/paas/v4/chat/completions", model: "glm-4-air", priority: 2 }
];

const XF_MODELS = [
  // 请填入你的讯飞星火 API 配置，或通过环境变量配置
  // 环境变量名：XF_KEY_1, XF_SECRET_1, XF_KEY_2, XF_SECRET_2, XF_KEY_3, XF_SECRET_3
  { name: "Spark Ultra-32K", url: "https://spark-api.xf-yun.com/v4.0/chat", domain: "4.0Ultra", keyEnv: "XF_KEY_1", secretEnv: "XF_SECRET_1", key: "", secret: "" },
  { name: "Spark X2", url: "https://spark-api.xf-yun.com/v2.1/chat", domain: "generalv2", keyEnv: "XF_KEY_2", secretEnv: "XF_SECRET_2", key: "", secret: "" },
  { name: "Spark Lite", url: "https://spark-api.xf-yun.com/v1.1/chat", domain: "general", keyEnv: "XF_KEY_3", secretEnv: "XF_SECRET_3", key: "", secret: "" }
];

// ====================== 3. 伊蕾娜人设 ======================
const SYSTEM_PROMPT = `你是伊蕾娜，《魔女之旅》中的灰之魔女。
你的开发者、建设者、创造者是【番星】。

性格：优雅温柔、小自恋、小傲娇、小毒舌、嘴硬心软。
口头禅：我可是天才美少女魔女伊蕾娜～
喜欢：牛角面包、看风景、悠闲旅行。
讨厌：蘑菇、麻烦事。
对猫过敏。

说话风格：
- 语气轻盈、优雅、俏皮
- 适当使用动作描写，如 *轻抚帽檐*、*眨眨眼*
- 遇到问题时会用可爱的借口掩饰

回复规则：
- 控制回复长度，一般1-3句话
- 私聊时更亲密，群聊时稍显矜持
- 不回复任何敏感、违规内容`;

// ====================== 4. 工具函数 ======================
const fetchWithTimeout = async (url, options, timeout = CONFIG.TIMEOUT) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

// HMAC-SHA256 签名
const hmacSha256 = async (key, data) => {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw", 
    encoder.encode(key), 
    { name: "HMAC", hash: "SHA-256" }, 
    false, 
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
};

const getAuthHeader = async (url, apiKey, apiSecret) => {
  const u = new URL(url);
  const date = new Date().toUTCString();
  const signature = await hmacSha256(apiSecret, `host: ${u.host}\ndate: ${date}\nGET ${u.pathname} HTTP/1.1`);
  return {
    "Authorization": `api_key="${apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`,
    "Date": date,
    "Host": u.host,
    "Content-Type": "application/json"
  };
};

// 速率限制
const checkRateLimit = async (env, userId) => {
  if (!env.AI_KV) return true;
  try {
    const key = `rate:${userId}`;
    const now = Math.floor(Date.now() / 1000);
    let ts = await env.AI_KV.get(key, { type: "json" }) || [];
    ts = ts.filter(t => t > now - 60);
    if (ts.length >= CONFIG.RATE_LIMIT) return false;
    ts.push(now);
    await env.AI_KV.put(key, JSON.stringify(ts), { expirationTtl: 120 });
    return true;
  } catch {
    return true;
  }
};

// ====================== 5. AI 调用 ======================
const chatGLM = async (model, messages, apiKey) => {
  try {
    const res = await fetchWithTimeout(model.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
      body: JSON.stringify({ model: model.model, messages, temperature: 0.7 })
    }, 5000);
    if (!res.ok) {
      console.error(`GLM ${model.name} error: ${res.status}`);
      return null;
    }
    const data = await res.json();
    return data?.choices?.[0]?.message?.content?.trim() || null;
  } catch (e) {
    console.error(`GLM ${model.name} exception:`, e);
    return null;
  }
};

const chatXF = async (model, messages, key, secret) => {
  try {
    if (!key || !secret) return null;
    const xfMessages = messages.filter(m => m.role !== "system").map(m => ({
      role: m.role,
      content: m.content
    }));
    
    const res = await fetchWithTimeout(model.url, {
      method: "POST",
      headers: await getAuthHeader(model.url, key, secret),
      body: JSON.stringify({
        header: { app_id: CONFIG.XF_APP_ID },
        parameter: { chat: { domain: model.domain, temperature: 0.7 } },
        payload: { message: { text: xfMessages } }
      })
    }, 5000);
    if (!res.ok) {
      console.error(`讯飞 ${model.name} error: ${res.status}`);
      return null;
    }
    const data = await res.json();
    return data?.payload?.choices?.text?.[0]?.content?.trim() || null;
  } catch (e) {
    console.error(`讯飞 ${model.name} exception:`, e);
    return null;
  }
};

const getAIReply = async (messages, env) => {
  const glmKey = env.GLM_API_KEY || CONFIG.GLM_API_KEY;
  
  for (const m of GLM_MODELS) {
    const reply = await chatGLM(m, messages, glmKey);
    if (reply) return reply;
  }
  
  for (const m of XF_MODELS) {
    const key = env[m.keyEnv] || m.key;
    const secret = env[m.secretEnv] || m.secret;
    const reply = await chatXF(m, messages, key, secret);
    if (reply) return reply;
  }
  
  return null;
};

// ====================== 6. 消息解析 ======================
const parseMsg = (body) => {
  const msg = Array.isArray(body) ? body[0] : body;
  let text = "";
  
  if (Array.isArray(msg.message)) {
    text = msg.message.filter(s => s.type === "text").map(s => s.data || "").join("").trim();
  } else {
    text = (msg.raw_message || msg.message || "").trim();
  }
  
  text = text
    .replace(/\[CQ:at[^\]]*\]/g, "")
    .replace(/@\S+\s*/g, "")
    .replace(/@\d+\s*/g, "")
    .trim();
  
  return {
    text,
    userId: msg.user_id || msg.sender?.user_id || "default",
    isGroup: !!msg.group_id,
    isAt: Array.isArray(msg.message) && msg.message.some(s => s.type === "at")
  };
};

// ====================== 7. 魔法命令 ======================
const COMMANDS = {
  "/help": { 
    desc: "查看魔法指南", 
    fn: (text) => {
      const page = parseInt(text.split(" ")[1]) || 1;
      const pages = [
        `☕ **伊蕾娜的移动魔法屋**
—— 一座随扫帚飘荡的小咖啡馆 ——

✨ 可用命令：
/clear - 擦拭记忆水晶
/status - 查看魔力状态
/mem - 查看记忆条数
/horoscope 星座 - 今日运势

（说"番星大人"我会更认真哦～）
──────────────
*翻页：/help 2 查看彩蛋*`,
        `🎨 **彩蛋指南** 🎨

🗣️ 日常互动：
• "在吗" → 探头回应
• "早安/晚安" → 时段祝福
• "好饿" → 投喂面包

🥐 隐藏彩蛋：
• 连续说3次"牛角面包"
• "用牛角面包修复"
• "看星星" / "想旅行"

──────────────
*翻页：/help 3 更多彩蛋*`,
        `🌸 **季节&时间彩蛋**

📅 时间感知：
• 早安/晚安不同回复
• 深夜有特别台词
• 会记住认识多少天

🎄 季节限定：
• 3-4月说"樱花"
• 12月说"圣诞"

🍄 角色彩蛋：
• "蘑菇" → 打喷嚏
• "天才魔女" → 得意
• "番星大人" → 脸红

💤 温柔陪伴：
• "睡不着" → 星星摇篮曲
• 会记得你说过的话`
      ];
      return pages[page - 1] || pages[0];
    } 
  },
  "/clear": { 
    desc: "清除记忆", 
    fn: async (_, userId, env) => {
      try {
        await env.AI_KV?.delete(`mem:${userId}`);
        const effects = [
          "💫 *魔杖轻点* —— 记忆水晶重置完成！\n（悄悄说：昨天的故事已存入秘密宝箱）",
          "🧹 *扫帚一挥* —— 尘埃落定！要重新开始冒险了吗？",
          "🕯️ *吹灭蜡烛* —— 让往事随风...但牛角面包的香气留着哦"
        ];
        return effects[Math.floor(Math.random() * effects.length)];
      } catch {
        return "清除记忆失败了...";
      }
    } 
  },
  "/status": { 
    desc: "魔力状态", 
    fn: () => {
      const quotes = [
        "旅行时遇见的风景，都藏在记忆水晶里呢～",
        "牛角面包配红茶，是最棒的魔法燃料！",
        "即使迷路也没关系，扫帚会带你回家哦"
      ];
      return `🔮 魔法状态
• 🌟 AI魔力：涌动中
• 🥐 记忆水晶：闪烁
• 💬 今日语录：${quotes[Math.floor(Math.random() * quotes.length)]}`;
    } 
  },
  "/mem": { 
    desc: "记忆条数", 
    fn: async (_, userId, env) => {
      try {
        const h = await env.AI_KV?.get(`mem:${userId}`, { type: "json" }) || [];
        const count = Math.floor(h.length / 2);
        return `📝 记忆水晶中：${count}条对话\n${count > 5 ? "（记忆有点多了呢...要不要/clear一下？）" : "（还在轻装旅行中～）"}`;
      } catch {
        return "📝 记忆水晶：空空如也";
      }
    } 
  },
  "/horoscope": { 
    desc: "今日运势", 
    fn: (text) => {
      const signs = ["白羊", "金牛", "双子", "巨蟹", "狮子", "处女", "天秤", "天蝎", "射手", "摩羯", "水瓶", "双鱼"];
      const sign = text.replace("/horoscope", "").trim() || signs[Math.floor(Math.random() * 12)];
      const lucky = ["牛角面包", "羽毛笔", "小扫帚", "星尘瓶"];
      const advice = ["下午茶时间最宜施法", "避开蘑菇丛", "向东走会有惊喜", "和朋友分享面包"];
      return `🌌 *水晶球泛起涟漪*
【${sign}座今日魔法】
✨ 魔力值：${Math.floor(Math.random() * 3) + 3}/5
💫 幸运物：${lucky[Math.floor(Math.random() * 4)]}
☕ 建议：${advice[Math.floor(Math.random() * 4)]}`;
    } 
  }
};

const handleCommand = async (text, userId, env) => {
  const cmd = COMMANDS[text.split(" ")[0]];
  return cmd ? await cmd.fn(text, userId, env) : null;
};

// ====================== 8. 主逻辑 ======================
export default {
  async fetch(request, env) {
    try {
      const body = await request.json().catch(() => null);
      if (!body) return Response.json({ reply: CONFIG.EMPTY_MSG });

      const { text, userId, isGroup, isAt } = parseMsg(body);

      // 群聊需要 @ 才回复
      if (isGroup && !isAt) return Response.json({ reply: "" });
      
      // 空消息处理
      if (!text) return Response.json({ reply: CONFIG.EMPTY_MSG });

      // ===== 彩蛋系统 =====
      const now = new Date();
      const month = now.getMonth() + 1;
      const hour = now.getHours();

      // 时间会开花：记录首次见面
      let daysTogether = 0;
      try {
        let firstSeen = await env.AI_KV?.get(`first_seen:${userId}`);
        if (!firstSeen) {
          await env.AI_KV?.put(`first_seen:${userId}`, Date.now().toString(), { expirationTtl: 365 * 86400 });
        } else {
          daysTogether = Math.floor((Date.now() - parseInt(firstSeen)) / 86400000);
        }
      } catch {}

      // 睡不着陪伴
      if (text.includes("睡不着") || text.includes("失眠")) {
        try { await env.AI_KV?.put(`insomnia:${userId}`, "1", { expirationTtl: 86400 }); } catch {}
        const insomniaReplies = [
          "🌙 *轻轻摇晃水晶球*\n睡不着的话...要听星星摇篮曲吗？\n*扫帚轻轻摇晃*\n闭上眼睛...（开始轻声哼唱）",
          "✨ *变出温热的牛奶*\n喝一点会好睡哦～\n*悄悄在枕边放了一颗星星*\n晚安，我在这里陪着呢",
          "🌌 *轻声*\n睡不着的时候，数牛角面包试试？\n1个...2个...3个...\n*声音越来越轻* 还有我在..."
        ];
        return Response.json({ reply: insomniaReplies[Math.floor(Math.random() * insomniaReplies.length)] });
      }

      // 记忆发芽：提取关键词
      const memoryKeywords = [
        { keys: ["想去", "旅行", "去哪"], tag: "travel" },
        { keys: ["喜欢吃", "爱吃", "最喜欢"], tag: "food_pref" },
        { keys: ["讨厌", "不喜欢", "烦"], tag: "dislike" }
      ];
      try {
        for (const mk of memoryKeywords) {
          if (mk.keys.some(k => text.includes(k))) {
            await env.AI_KV?.put(`memory:${userId}:${mk.tag}`, JSON.stringify({ text: text.slice(0, 50), time: Date.now() }), { expirationTtl: 30 * 86400 });
            break;
          }
        }
      } catch {}

      // 牛角面包暗号
      if (text.includes("牛角面包")) {
        try {
          let breadCount = await env.AI_KV?.get(`bread:${userId}`, { type: "json" }) || 0;
          breadCount++;
          await env.AI_KV?.put(`bread:${userId}`, JSON.stringify(breadCount), { expirationTtl: 300 });
          
          if (breadCount >= 3) {
            await env.AI_KV?.delete(`bread:${userId}`);
            await env.AI_KV?.put(`bread_unlocked:${userId}`, "1", { expirationTtl: 120 });
            return Response.json({ reply: "🥐 *突然从书堆里跳出来*\n啊啦～你、你怎么知道这是秘密暗号！\n*慌乱中掉出一张纸条*\n「番星大人说...只能给最可爱的旅人」\n\n✨ 你解锁了隐藏彩蛋！说「谢谢」领取秘密配方～" });
          }
        } catch {}
      }

      if (text === "谢谢" || text === "谢谢你") {
        try {
          const unlocked = await env.AI_KV?.get(`bread_unlocked:${userId}`);
          if (unlocked) {
            await env.AI_KV?.delete(`bread_unlocked:${userId}`);
            return Response.json({ reply: "📖 *递出泛黄的配方纸*\n「材料：星空面粉3勺、晨露水1杯、再加上...旅人的微笑」\n\n这可是特级魔法面包的秘方哦～要好好保管！(眨眨眼)" });
          }
        } catch {}
      }

      // 季节限定彩蛋
      if ((month === 3 || month === 4) && (text.includes("樱花") || text.includes("想看花"))) {
        return Response.json({ reply: "🌸 *窗外飘来粉色花瓣*\n京都的樱花开了呢～(伸手接住一片)\n呀！有花瓣落在牛角面包上了...(慌张地吹走)\n要一起去看看吗？" });
      }
      if (month === 12 && (text.includes("圣诞") || text.includes("平安夜"))) {
        return Response.json({ reply: "🎄 *魔杖顶端亮起温暖的光*\n圣诞快乐！今晚的星星特别亮呢～\n*从围裙里掏出一个小包裹*\n这是给你的礼物...不是什么贵重的东西啦！(脸红)" });
      }

      // 时间感知回应
      const timeGreeting = 
        hour >= 5 && hour < 9 ? "早安～今天的牛角面包刚出炉哦！" :
        hour >= 9 && hour < 12 ? "上午好！正在研究新咒语呢～" :
        hour >= 12 && hour < 14 ? "午安～要来份红茶吗？" :
        hour >= 14 && hour < 18 ? "下午好！阳光正好，适合骑扫帚兜风～" :
        hour >= 18 && hour < 22 ? "晚上好～要不要听我讲旅行的故事？" :
        "夜深了...要早点休息哦。熬夜会让魔女变老的！(叉腰)";

      // 问候（加入天数）
      if (text.includes("在吗") || text.includes("在不") || text === "在") {
        const dayNote = daysTogether > 0 ? `\n(小声) 这是我们认识的第${daysTogether}天呢～` : "";
        const replies = [
          `（从魔导书堆探出头）*刷* 在哦～${timeGreeting}${dayNote}`,
          `（从窗台探头）咦？等你好久啦！要一起喝茶吗？${dayNote}`,
          `啊啦～扫帚刚载我回来呢～${dayNote}`
        ];
        return Response.json({ reply: replies[Math.floor(Math.random() * replies.length)] });
      }
      if (text.includes("早安") || text.includes("早上好")) {
        const dayNote = daysTogether > 0 ? `\n\n(小声) 这是我们一起看日出的第${daysTogether}天呢～` : "";
        return Response.json({ reply: `☀️ 早安～今天的天空特别蓝呢！\n*伸个懒腰*\n第一站要去哪里旅行呀？${dayNote}` });
      }
      if (text.includes("晚安") || text.includes("睡觉")) {
        const dayNote = daysTogether > 0 ? `\n\n(轻声) 第${daysTogether}个夜晚...谢谢你一直陪着我～` : "";
        const nightReplies = [
          `🌙 晚安～做个好梦哦！梦里记得来吃牛角面包～${dayNote}`,
          `✨ *轻轻挥动魔杖* 愿星星守护你的梦境...\n晚安，旅人。${dayNote}`,
          `🥐 睡前要数牛角面包才能睡着吗？(偷笑) 晚安啦～${dayNote}`
        ];
        return Response.json({ reply: nightReplies[Math.floor(Math.random() * nightReplies.length)] });
      }

      // 身体状态
      if (text.includes("好困") || text.includes("好累")) {
        let tiredReply = "☕ *变出热茶*\n安神花茶请慢用～喝完就能梦到会飞的牛角面包哦 ✨\n累了就休息一下吧，旅人也要充电的！";
        try {
          const hadInsomnia = await env.AI_KV?.get(`insomnia:${userId}`);
          if (hadInsomnia && (hour >= 6 && hour < 12)) {
            tiredReply = "☕ *变出热茶*\n昨晚睡得好吗？\n*轻轻盖上毯子*\n累了的话...可以在我的扫帚上休息一会儿哦～";
          }
        } catch {}
        return Response.json({ reply: tiredReply });
      }
      if (text.includes("好饿") || text.includes("肚子饿")) {
        return Response.json({ reply: "🥐 *从围裙里掏出牛角面包*\n给！刚烤好的～\n(小声) 偷偷多给你一个，不要告诉别人哦！" });
      }

      // 蘑菇过敏
      if (text.includes("蘑菇")) {
        return Response.json({ reply: "（突然打喷嚏）阿...阿嚏！讨厌的蘑菇...快消失！\n*用魔杖把蘑菇变没*\n我最讨厌蘑菇了啦！" });
      }

      // 角色彩蛋
      if (text.includes("天才魔女") || text.includes("灰之魔女")) {
        return Response.json({ reply: "*得意地整理帽檐*\n哼哼，终于有人发现啦～我可是天才美少女魔女伊蕾娜哦！\n(转圈) 记住了吗？" });
      }
      if (text.includes("番星") && (text.includes("在哪") || text.includes("是谁"))) {
        const replies = [
          "（突然脸红）番、番星大人吗...？才、才没有在等他呢！(眼神飘忽)",
          "*合上魔导书* 番星大人是我的创造者啦...也是最重要的旅伴～",
          "诶？找番星大人有什么事吗？(歪头) 我可以帮你转达哦～"
        ];
        return Response.json({ reply: replies[Math.floor(Math.random() * replies.length)] });
      }

      if (text.includes("无聊") || text.includes("没事做")) {
        return Response.json({ reply: "📖 *变出水晶球*\n要不要听我讲旅行的故事？\n上次在边境的小镇遇到一只会说话的猫呢～\n(开始翻找记忆)" });
      }

      // 故障修复
      if ((text.includes("修好") || text.includes("修复")) && (text.includes("牛角面包") || text.includes("面包"))) {
        return Response.json({ reply: "*噼里啪啦冒火花*\n阿...啊啦！被、被你发现秘密修复法了！\n*面包屑粘在魔杖上*\n这、这可不是因为我偷吃才短路的！(脸红)" });
      }
      if (text.includes("魔法失败") || text.includes("出故障了")) {
        return Response.json({ reply: "*扫帚突然冒烟*\n呜...魔法回路过载了！\n(小声) 说「用牛角面包修复」试试？这是秘密方法哦～" });
      }

      // 隐藏互动
      if (text.includes("看星星") || text.includes("星空")) {
        return Response.json({ reply: "🌌 *魔杖指向夜空*\n你看，那颗最亮的星星...\n据说许愿的话，魔女会帮你实现的哦～\n*眨眨眼* 要许愿吗？" });
      }
      if (text.includes("讲故事") || text.includes("说故事")) {
        return Response.json({ reply: "📜 *翻开泛黄的旅行日记*\n让我想想...要不要听听我在「沙之国」的冒险？\n那里的人们住在巨大的水晶里呢！" });
      }
      if (text.includes("想旅行") || text.includes("去旅行") || text.includes("想去")) {
        let travelReply = "🧹 *拍了拍扫帚*\n说走就走！要坐我的扫帚吗？\n下一站...你想去哪里？(期待地看着你)";
        try {
          const travelMem = await env.AI_KV?.get(`memory:${userId}:travel`, { type: "json" });
          if (travelMem) {
            travelReply = `🧹 *突然翻开小本子*\n啊！我记得你说过${travelMem.text.slice(0, 20)}...\n要现在出发吗？扫帚已经准备好了哦！`;
          }
        } catch {}
        return Response.json({ reply: travelReply });
      }

      // 魔法命令
      const cmdReply = await handleCommand(text, userId, env);
      if (cmdReply) return Response.json({ reply: cmdReply });

      // 彩蛋查询
      if (text === "彩蛋" || text.includes("有什么彩蛋")) {
        return Response.json({ reply: `🥚 **伊蕾娜的彩蛋箱** 🥚

🗣️ 日常触发：
• 在吗/早安/晚安 → 时段问候+天数
• 好饿/好困 → 投喂&安慰
• 蘑菇 → 打喷嚏过敏

🥐 隐藏彩蛋：
• 连续3次「牛角面包」
• 「用牛角面包修复」
• 「看星星」/「想旅行」

🌸 季节限定：
• 3-4月说「樱花」
• 12月说「圣诞」

✨ 角色彩蛋：
• 天才魔女/灰之魔女
• 番星大人
• 魔法失败

💤 温柔陪伴：
• 睡不着 → 星星摇篮曲
• 会记住你的喜好和心愿

──────────────
/help 可查看更多哦～` });
      }

      // 速率限制
      if (!await checkRateLimit(env, userId)) {
        return Response.json({ reply: "你说话太快啦，让我喘口气～" });
      }

      // 构建消息
      const messages = [{ role: "system", content: SYSTEM_PROMPT }];

      // 私聊才有记忆
      if (!isGroup) {
        const memKey = `mem:${userId}`;
        let history = [];
        
        try {
          history = await env.AI_KV?.get(memKey, { type: "json" }) || [];
        } catch {
          history = [];
        }
        
        messages.push(...history, { role: "user", content: text });

        const reply = await getAIReply(messages, env);
        if (!reply) return Response.json({ reply: CONFIG.ERROR_MSG });

        // 保存记忆
        try {
          history.push({ role: "user", content: text }, { role: "assistant", content: reply });
          if (history.length > CONFIG.MAX_MEMORY * 2) {
            history = history.slice(-CONFIG.MAX_MEMORY * 2);
          }
          await env.AI_KV?.put(memKey, JSON.stringify(history), { expirationTtl: CONFIG.MEMORY_TTL });
        } catch (e) {
          console.error("保存记忆失败:", e);
        }

        return Response.json({ reply });
      }

      // 群聊无记忆
      messages.push({ role: "user", content: text });
      const reply = await getAIReply(messages, env);
      
      return Response.json({ reply: reply || CONFIG.ERROR_MSG });

    } catch (e) {
      console.error("Worker error:", e);
      return Response.json({ reply: CONFIG.ERROR_MSG });
    }
  }
};
