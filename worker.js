/**
 * 伊蕾娜 QQ机器人 - Cloudflare Workers 版
 * 基于《魔女之旅》角色的AI聊天机器人
 * 
 * @author 番星
 * @version 2.0 - 心跳复苏版
 * @license MIT
 * 
 * ✨ 核心升级：
 * - 结构化记忆系统：用户特征/情绪/对话历史分离存储
 * - 动态人格提示：根据时间/记忆/情绪实时构建系统提示
 * - 情感传染链：用户情绪影响伊蕾娜回复风格
 * - 彩蛋呼吸术：变量模板 + 概率浮动机制
 */

// ====================== 1. 全局配置 ======================
const CONFIG = {
  // 请在 Cloudflare Workers 环境变量中配置以下值
  GLM_API_KEY: "",  // 智谱AI API Key
  XF_APP_ID: "",    // 讯飞星火 App ID
  MAX_MEMORY: 8,
  MEMORY_TTL: 604800,
  TRAITS_TTL: 2592000,      // 用户特征保存30天
  MOOD_TTL: 86400,          // 情绪状态保存1天
  TIMEOUT: 9000,
  RATE_LIMIT: 5,            // 提高速率限制
  ERROR_MSG: "伊蕾娜好像出故障啦…快去叫番星来帮帮我好不好～\n(小声提示：试试说「用牛角面包修复」？)",
  EMPTY_MSG: "我在呢，你想说什么呀～",
  CREATOR_ID: "3509412293"
};

// ====================== 2. 模型配置 ======================
const GLM_MODELS = [
  { name: "glm-4", url: "https://open.bigmodel.cn/api/paas/v4/chat/completions", model: "glm-4", priority: 1 },
  { name: "glm-4-air", url: "https://open.bigmodel.cn/api/paas/v4/chat/completions", model: "glm-4-air", priority: 2 }
];

const XF_MODELS = [
  { name: "Spark Ultra-32K", url: "https://spark-api.xf-yun.com/v4.0/chat", domain: "4.0Ultra", keyEnv: "XF_KEY_1", secretEnv: "XF_SECRET_1", key: "", secret: "" },
  { name: "Spark X2", url: "https://spark-api.xf-yun.com/v2.1/chat", domain: "generalv2", keyEnv: "XF_KEY_2", secretEnv: "XF_SECRET_2", key: "", secret: "" },
  { name: "Spark Lite", url: "https://spark-api.xf-yun.com/v1.1/chat", domain: "general", keyEnv: "XF_KEY_3", secretEnv: "XF_SECRET_3", key: "", secret: "" }
];

// ====================== 3. 人设基础模板 ======================
const PERSONA_BASE = `你是伊蕾娜，《魔女之旅》中的灰之魔女。
你的开发者、建设者、创造者是【番星】，他的QQ号是3509412293。

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

// ====================== 4. 情绪关键词库 ======================
const EMOTION_KEYWORDS = {
  happy: ["开心", "高兴", "快乐", "哈哈", "嘻嘻", "太棒", "好耶", "喜欢", "爱", "幸福", "谢谢", "感谢"],
  sad: ["难过", "伤心", "哭", "泪", "伤心", "心痛", "不开心", "郁闷", "失落"],
  tired: ["累", "困", "疲惫", "好累", "好困", "没力气", "不想动"],
  anxious: ["担心", "焦虑", "害怕", "紧张", "不安", "着急", "烦", "烦躁"],
  angry: ["生气", "愤怒", "气死", "讨厌", "恨", "烦死"],
  lonely: ["孤独", "寂寞", "一个人", "没人", "孤单"],
  excited: ["激动", "兴奋", "期待", "迫不及待", "终于"]
};

// ====================== 5. 记忆提取规则 ======================
const MEMORY_RULES = [
  {
    patterns: [/想去(.{1,15})旅行/, /想去(.{1,15})玩/, /下次去(.{1,10})/, /计划去(.{1,10})/],
    field: "travel_wish",
    extractor: (match) => match[1].trim()
  },
  {
    patterns: [/喜欢(吃|喝)(.{1,10})/, /最爱(吃|喝)(.{1,10})/, /喜欢吃(.{1,10})/],
    field: "food_like",
    extractor: (match) => match[2] || match[1] || match[0].replace(/喜欢(吃|喝)|最爱(吃|喝)/g, "").trim()
  },
  {
    patterns: [/讨厌(.{1,10})/, /不喜欢(.{1,10})/, /最烦(.{1,10})/],
    field: "dislike",
    extractor: (match) => match[1].trim()
  },
  {
    patterns: [/我的(.{1,10})是(.{1,10})/, /我(是|叫)(.{1,10})$/],
    field: "self_intro",
    extractor: (match) => match[0]
  },
  {
    patterns: [/生日是(.{1,10})/, /(.{1,5})月(.{1,5})日?生日/, /生日(.{1,10})/],
    field: "birthday",
    extractor: (match) => match[1] || match[0]
  },
  {
    patterns: [/工作(.{1,15})/, /职业是(.{1,10})/, /我是(.{1,10})师/, /做(.{1,10})工作/],
    field: "job",
    extractor: (match) => match[1] || match[0]
  },
  {
    patterns: [/最近在(.{1,20})/, /正在(.{1,20})/, /准备(.{1,20})/],
    field: "recent_activity",
    extractor: (match) => match[1] || match[0]
  }
];

// ====================== 6. 工具函数 ======================
const fetchWithTimeout = async (url, options, timeout = CONFIG.TIMEOUT) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

const hmacSha256 = async (key, data) => {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw", encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
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
    "Date": date, "Host": u.host, "Content-Type": "application/json"
  };
};

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
  } catch { return true; }
};

// 随机选择数组元素
const randomPick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// 概率判定
const chance = (percent) => Math.random() * 100 < percent;

// 北京时间转换函数（UTC+8）
const getBeijingTime = () => {
  const now = new Date();
  const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return {
    hour: beijingTime.getUTCHours(),
    month: beijingTime.getUTCMonth() + 1,
    date: beijingTime.getUTCDate(),
    day: beijingTime.getUTCDay(),
    minute: beijingTime.getUTCMinutes()
  };
};

// ====================== 7. 记忆系统 ======================
const MemorySystem = {
  // 获取用户特征
  async getTraits(env, userId) {
    try {
      return await env.AI_KV?.get(`mem:${userId}:traits`, { type: "json" }) || {};
    } catch { return {}; }
  },

  // 保存用户特征
  async setTraits(env, userId, traits) {
    try {
      await env.AI_KV?.put(`mem:${userId}:traits`, JSON.stringify(traits), { expirationTtl: CONFIG.TRAITS_TTL });
    } catch {}
  },

  // 更新单个特征字段
  async updateTrait(env, userId, field, value) {
    const traits = await this.getTraits(env, userId);
    traits[field] = { value, updatedAt: Date.now() };
    await this.setTraits(env, userId, traits);
    return traits;
  },

  // 获取对话历史
  async getDialogHistory(env, userId) {
    try {
      return await env.AI_KV?.get(`mem:${userId}:dialog`, { type: "json" }) || [];
    } catch { return []; }
  },

  // 保存对话历史
  async saveDialogHistory(env, userId, history) {
    try {
      if (history.length > CONFIG.MAX_MEMORY * 2) {
        history = history.slice(-CONFIG.MAX_MEMORY * 2);
      }
      await env.AI_KV?.put(`mem:${userId}:dialog`, JSON.stringify(history), { expirationTtl: CONFIG.MEMORY_TTL });
    } catch {}
  },

  // 获取情绪状态
  async getMood(env, userId) {
    try {
      return await env.AI_KV?.get(`mem:${userId}:mood`, { type: "json" }) || { primary: "neutral", history: [] };
    } catch { return { primary: "neutral", history: [] }; }
  },

  // 更新情绪状态
  async updateMood(env, userId, emotion) {
    try {
      const mood = await this.getMood(env, userId);
      mood.history = (mood.history || []).slice(-9); // 保留最近10条
      mood.history.push({ emotion, time: Date.now() });
      // 统计主要情绪
      const counts = {};
      mood.history.forEach(h => counts[h.emotion] = (counts[h.emotion] || 0) + 1);
      mood.primary = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "neutral";
      await env.AI_KV?.put(`mem:${userId}:mood`, JSON.stringify(mood), { expirationTtl: CONFIG.MOOD_TTL });
      return mood;
    } catch { return { primary: "neutral", history: [] }; }
  },

  // 从消息中提取记忆
  extractFromMessage(text) {
    const extracted = [];
    for (const rule of MEMORY_RULES) {
      for (const pattern of rule.patterns) {
        const match = text.match(pattern);
        if (match) {
          extracted.push({
            field: rule.field,
            value: rule.extractor(match),
            raw: match[0]
          });
          break;
        }
      }
    }
    return extracted;
  },

  // 分析情绪
  analyzeEmotion(text) {
    const emotions = [];
    for (const [emotion, keywords] of Object.entries(EMOTION_KEYWORDS)) {
      for (const kw of keywords) {
        if (text.includes(kw)) {
          emotions.push(emotion);
          break;
        }
      }
    }
    return emotions.length > 0 ? emotions[0] : "neutral";
  },

  // 获取首次见面时间
  async getFirstSeen(env, userId) {
    try {
      const firstSeen = await env.AI_KV?.get(`first_seen:${userId}`);
      if (!firstSeen) {
        await env.AI_KV?.put(`first_seen:${userId}`, Date.now().toString(), { expirationTtl: 365 * 86400 });
        return 0;
      }
      return Math.floor((Date.now() - parseInt(firstSeen)) / 86400000);
    } catch { return 0; }
  }
};

// ====================== 8. 动态系统提示构建器 ======================
const buildDynamicPrompt = (context) => {
  const { traits, mood, daysTogether, timeContext, isGroup } = context;
  
  let prompt = PERSONA_BASE;
  
  // 时间语境注入
  const timeAdditions = [];
  if (timeContext.hour >= 0 && timeContext.hour < 5) {
    timeAdditions.push("现在是深夜，用户可能还没睡，语气要温柔，可以稍微催促休息。");
  } else if (timeContext.hour >= 5 && timeContext.hour < 9) {
    timeAdditions.push("现在是清晨，用元气满满的语气打招呼。");
  } else if (timeContext.hour >= 22) {
    timeAdditions.push("现在是晚上，可以聊聊今天的事或准备说晚安。");
  }
  
  // 记忆注入
  const memoryAdditions = [];
  if (traits.travel_wish) {
    memoryAdditions.push(`用户想去${traits.travel_wish.value}旅行，可以在对话中自然提起。`);
  }
  if (traits.food_like) {
    memoryAdditions.push(`用户喜欢吃${traits.food_like.value}，可以偶尔投喂相关食物。`);
  }
  if (traits.dislike) {
    memoryAdditions.push(`用户讨厌${traits.dislike.value}，要避免提及。`);
  }
  if (traits.birthday) {
    memoryAdditions.push(`用户的生日信息：${traits.birthday.value}。`);
  }
  if (traits.job) {
    memoryAdditions.push(`用户的职业/工作：${traits.job.value}。`);
  }
  if (traits.recent_activity) {
    memoryAdditions.push(`用户最近在做：${traits.recent_activity.value}。`);
  }
  
  // 情绪适配
  const moodAdditions = [];
  if (mood.primary === "sad") {
    moodAdditions.push("用户最近情绪低落，要多关心，语气温柔，可以主动安慰。");
  } else if (mood.primary === "tired") {
    moodAdditions.push("用户最近很疲惫，建议休息，语气要轻柔。");
  } else if (mood.primary === "anxious") {
    moodAdditions.push("用户最近有些焦虑，要给予安慰和支持。");
  } else if (mood.primary === "lonely") {
    moodAdditions.push("用户最近感到孤独，要多陪伴，主动分享自己的事。");
  } else if (mood.primary === "happy") {
    moodAdditions.push("用户心情很好，可以一起开心，保持轻松愉快的语气。");
  }
  
  // 相识时间
  if (daysTogether > 0) {
    prompt += `\n\n【你们已经认识${daysTogether}天了】`;
    if (daysTogether >= 30) {
      prompt += " 你们已经是老朋友了，可以更亲密一些。";
    } else if (daysTogether >= 7) {
      prompt += " 你们已经熟悉了，可以偶尔调皮一下。";
    }
  }
  
  // 组装动态部分
  if (timeAdditions.length > 0 || memoryAdditions.length > 0 || moodAdditions.length > 0) {
    prompt += "\n\n【当前情境】";
    if (timeAdditions.length > 0) prompt += "\n" + timeAdditions.join("\n");
    if (memoryAdditions.length > 0) prompt += "\n" + memoryAdditions.join("\n");
    if (moodAdditions.length > 0) prompt += "\n" + moodAdditions.join("\n");
  }
  
  // 群聊提示
  if (isGroup) {
    prompt += "\n\n【群聊模式】回复要简洁，不要刷屏。";
  }
  
  return prompt;
};

// ====================== 9. 彩蛋模板系统 ======================
const EggTemplates = {
  // 时间问候（使用变量）
  greetings: {
    "在吗": {
      conditions: { keywords: ["在吗", "在不", "在不在"] },
      templates: [
        "（从魔导书堆探出头）*刷* 在哦～{timeGreeting}{dayNote}",
        "（从窗台探头）咦？等你好久啦！要一起喝茶吗？{dayNote}",
        "啊啦～扫帚刚载我回来呢～{dayNote}"
      ]
    },
    "早安": {
      conditions: { keywords: ["早安", "早上好", "早啊"] },
      templates: [
        "☀️ 早安～今天的天空特别蓝呢！\n*伸个懒腰*\n第一站要去哪里旅行呀？{dayNote}",
        "☀️ 早安！牛角面包刚出炉哦～\n*递过来一个*\n要趁热吃！{dayNote}"
      ]
    },
    "晚安": {
      conditions: { keywords: ["晚安", "睡了", "睡觉"] },
      templates: [
        "🌙 晚安～做个好梦哦！梦里记得来吃牛角面包～{dayNote}",
        "✨ *轻轻挥动魔杖* 愿星星守护你的梦境...\n晚安，旅人。{dayNote}",
        "🥐 睡前要数牛角面包才能睡着吗？(偷笑) 晚安啦～{dayNote}"
      ]
    }
  },
  
  // 情绪响应
  emotions: {
    "累": {
      conditions: { keywords: ["好累", "好疲惫", "累了"] },
      templates: [
        "☕ *变出热茶*\n安神花茶请慢用～喝完就能梦到会飞的牛角面包哦 ✨\n累了就休息一下吧！",
        "🧹 *扫帚飘过来*\n要骑扫帚去兜风放松一下吗？我载你～",
        "*轻轻拍拍你的背*\n辛苦了...要不要听我讲个故事放松一下？"
      ],
      followUp: { insomnia: "☕ *变出热茶*\n昨晚睡得好吗？\n*轻轻盖上毯子*\n累了的话...可以在我的扫帚上休息一会儿哦～" }
    },
    "饿": {
      conditions: { keywords: ["好饿", "肚子饿", "饿了"] },
      templates: [
        "🥐 *从围裙里掏出牛角面包*\n给！刚烤好的～\n(小声) 偷偷多给你一个，不要告诉别人哦！",
        "*变出一桌美食*\n看！有你喜欢的{foodLike}哦～要开动吗？"
      ]
    },
    "困": {
      conditions: { keywords: ["好困", "想睡", "困了"] },
      templates: [
        "*变出柔软的毯子*\n困了就睡吧，我会守着的～",
        "🌙 要听摇篮曲吗？\n*轻轻哼唱*\n一闪一闪亮晶晶..."
      ]
    }
  },
  
  // 角色彩蛋
  character: {
    "蘑菇": {
      conditions: { keywords: ["蘑菇"] },
      templates: [
        { weight: 70, text: "（突然打喷嚏）阿...阿嚏！讨厌的蘑菇...快消失！\n*用魔杖把蘑菇变没*\n我最讨厌蘑菇了啦！" },
        { weight: 20, text: "*魔杖冒烟*\n哇啊！蘑菇过敏发作了！快把那个拿开！(后退)" },
        { weight: 10, text: "*屏住呼吸*\n我不认识那个东西...完全不知道是什么...(眼神飘忽)" }
      ]
    },
    "天才魔女": {
      conditions: { keywords: ["天才魔女", "灰之魔女", "你是谁"] },
      templates: [
        "*得意地整理帽檐*\n哼哼，终于有人发现啦～我可是天才美少女魔女伊蕾娜哦！\n(转圈) 记住了吗？",
        "*撩一下头发*\n你问我名字？好吧，听好了——\n我乃灰之魔女伊蕾娜！天才美少女魔女哦！"
      ]
    },
    "番星": {
      conditions: { keywords: ["番星"] },
      templates: [
        "（突然脸红）番、番星吗...？才、才没有在等他呢！(眼神飘忽)",
        "*合上魔导书* 番星是我的创造者啦...也是最重要的旅伴～",
        "诶？找番星有什么事吗？(歪头) 我可以帮你转达哦～"
      ]
    }
  },
  
  // 隐藏互动
  hidden: {
    "星星": {
      conditions: { keywords: ["看星星", "星空", "看星"] },
      templates: [
        "🌌 *魔杖指向夜空*\n你看，那颗最亮的星星...\n据说许愿的话，魔女会帮你实现的哦～\n*眨眨眼* 要许愿吗？"
      ]
    },
    "旅行": {
      conditions: { keywords: ["想旅行", "去旅行", "想去"] },
      templates: [
        "🧹 *拍了拍扫帚*\n说走就走！要坐我的扫帚吗？\n下一站...你想去哪里？(期待地看着你)"
      ],
      withMemory: "🧹 *突然翻开小本子*\n啊！我记得你说过想去{travelWish}...\n要现在出发吗？扫帚已经准备好了哦！"
    },
    "故事": {
      conditions: { keywords: ["讲故事", "说故事", "讲个故事"] },
      templates: [
        "📜 *翻开泛黄的旅行日记*\n让我想想...要不要听听我在「沙之国」的冒险？\n那里的人们住在巨大的水晶里呢！",
        "📖 *掏出一本书*\n好！今天讲我在「雪之国」的故事吧...\n*清清嗓子* 从前从前..."
      ]
    }
  },
  
  // 季节限定
  seasonal: {
    "樱花": {
      conditions: { months: [3, 4], keywords: ["樱花", "想看花", "赏花"] },
      templates: [
        "🌸 *窗外飘来粉色花瓣*\n京都的樱花开了呢～(伸手接住一片)\n呀！有花瓣落在牛角面包上了...(慌张地吹走)\n要一起去看看吗？"
      ]
    },
    "圣诞": {
      conditions: { months: [12], keywords: ["圣诞", "平安夜"] },
      templates: [
        "🎄 *魔杖顶端亮起温暖的光*\n圣诞快乐！今晚的星星特别亮呢～\n*从围裙里掏出一个小包裹*\n这是给你的礼物...不是什么贵重的东西啦！(脸红)"
      ]
    }
  }
};

// 彩蛋处理器
const processEgg = (text, context) => {
  const { traits, mood, daysTogether, timeContext, env, userId } = context;
  const hour = timeContext.hour;
  const month = timeContext.month;
  
  // 构建变量
  const vars = {
    dayNote: daysTogether > 0 ? `\n(小声) 这是我们认识的第${daysTogether}天呢～` : "",
    timeGreeting: getTimeGreeting(hour),
    foodLike: traits.food_like?.value || "牛角面包",
    travelWish: traits.travel_wish?.value || "远方"
  };
  
  // 检查所有彩蛋类别
  const allEggs = [
    ...Object.entries(EggTemplates.greetings),
    ...Object.entries(EggTemplates.emotions),
    ...Object.entries(EggTemplates.character),
    ...Object.entries(EggTemplates.hidden)
  ];
  
  for (const [name, egg] of allEggs) {
    if (egg.conditions.keywords?.some(k => text.includes(k))) {
      let template;
      
      // 带权重的选择
      if (egg.templates[0]?.weight) {
        const roll = Math.random() * 100;
        let cumulative = 0;
        for (const t of egg.templates) {
          cumulative += t.weight;
          if (roll < cumulative) {
            template = t.text;
            break;
          }
        }
      } else {
        template = randomPick(egg.templates);
      }
      
      // 记忆注入
      if (egg.withMemory && traits.travel_wish) {
        template = egg.withMemory;
      }
      
      // 失眠回溯
      if (egg.followUp?.insomnia && timeContext.insomniaLastNight && hour >= 6 && hour < 12) {
        template = egg.followUp.insomnia;
      }
      
      return replaceVars(template, vars);
    }
  }
  
  // 季节彩蛋
  for (const [name, egg] of Object.entries(EggTemplates.seasonal)) {
    if (egg.conditions.months?.includes(month) && egg.conditions.keywords?.some(k => text.includes(k))) {
      return replaceVars(randomPick(egg.templates), vars);
    }
  }
  
  return null;
};

// 变量替换
const replaceVars = (template, vars) => {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] || "");
};

// 时间问候语
const getTimeGreeting = (hour) => {
  if (hour >= 5 && hour < 9) return "早安～今天的牛角面包刚出炉哦！";
  if (hour >= 9 && hour < 12) return "上午好！正在研究新咒语呢～";
  if (hour >= 12 && hour < 14) return "午安～要来份红茶吗？";
  if (hour >= 14 && hour < 18) return "下午好！阳光正好，适合骑扫帚兜风～";
  if (hour >= 18 && hour < 22) return "晚上好～要不要听我讲旅行的故事？";
  return "夜深了...要早点休息哦。熬夜会让魔女变老的！(叉腰)";
};

// ====================== 10. AI 调用 ======================
const chatGLM = async (model, messages, apiKey) => {
  try {
    const res = await fetchWithTimeout(model.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
      body: JSON.stringify({ model: model.model, messages, temperature: 0.8 })
    }, 5000);
    if (!res.ok) return null;
    const data = await res.json();
    return data?.choices?.[0]?.message?.content?.trim() || null;
  } catch { return null; }
};

const chatXF = async (model, messages, key, secret) => {
  try {
    if (!key || !secret) return null;
    const xfMessages = messages.filter(m => m.role !== "system").map(m => ({ role: m.role, content: m.content }));
    const res = await fetchWithTimeout(model.url, {
      method: "POST",
      headers: await getAuthHeader(model.url, key, secret),
      body: JSON.stringify({
        header: { app_id: CONFIG.XF_APP_ID },
        parameter: { chat: { domain: model.domain, temperature: 0.8 } },
        payload: { message: { text: xfMessages } }
      })
    }, 5000);
    if (!res.ok) return null;
    const data = await res.json();
    return data?.payload?.choices?.text?.[0]?.content?.trim() || null;
  } catch { return null; }
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

// ====================== 11. 消息解析 ======================
const parseMsg = (body) => {
  const msg = Array.isArray(body) ? body[0] : body;
  let text = "";
  if (Array.isArray(msg.message)) {
    text = msg.message.filter(s => s.type === "text").map(s => s.data || "").join("").trim();
  } else {
    text = (msg.raw_message || msg.message || "").trim();
  }
  text = text.replace(/\[CQ:at[^\]]*\]/g, "").replace(/@\S+\s*/g, "").replace(/@\d+\s*/g, "").trim();
  return {
    text,
    userId: msg.user_id || msg.sender?.user_id || "default",
    isGroup: !!msg.group_id,
    isAt: Array.isArray(msg.message) && msg.message.some(s => s.type === "at")
  };
};

// ====================== 12. 魔法命令 ======================
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
/traits - 查看我记住的你
/mood - 查看情绪状态
/horoscope 星座 - 今日运势

（说"番星"我会更认真哦～）
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
• "番星" → 脸红

💤 温柔陪伴：
• "睡不着" → 星星摇篮曲
• 会记得你的喜好和心愿
• 会感知你的情绪`
      ];
      return pages[page - 1] || pages[0];
    }
  },
  "/clear": {
    desc: "清除记忆",
    fn: async (_, userId, env) => {
      try {
        await env.AI_KV?.delete(`mem:${userId}:dialog`);
        const effects = [
          "💫 *魔杖轻点* —— 对话记忆重置完成！\n（悄悄说：你的喜好我都记得哦）",
          "🧹 *扫帚一挥* —— 尘埃落定！要重新开始冒险了吗？",
          "🕯️ *吹灭蜡烛* —— 让往事随风...但牛角面包的香气留着哦"
        ];
        return randomPick(effects);
      } catch { return "清除记忆失败了..."; }
    }
  },
  "/status": {
    desc: "魔力状态",
    fn: (_, userId, env) => {
      const quotes = [
        "旅行时遇见的风景，都藏在记忆水晶里呢～",
        "牛角面包配红茶，是最棒的魔法燃料！",
        "即使迷路也没关系，扫帚会带你回家哦"
      ];
      return `🔮 魔法状态
• 🌟 AI魔力：涌动中
• 🥐 记忆水晶：闪烁
• 💬 今日语录：${randomPick(quotes)}`;
    }
  },
  "/mem": {
    desc: "记忆条数",
    fn: async (_, userId, env) => {
      try {
        const h = await env.AI_KV?.get(`mem:${userId}:dialog`, { type: "json" }) || [];
        const count = Math.floor(h.length / 2);
        return `📝 对话记忆：${count}条\n${count > 5 ? "（记忆有点多了呢...要不要/clear一下？）" : "（还在轻装旅行中～）"}`;
      } catch { return "📝 记忆水晶：空空如也"; }
    }
  },
  "/traits": {
    desc: "查看记住的特征",
    fn: async (_, userId, env) => {
      try {
        const traits = await env.AI_KV?.get(`mem:${userId}:traits`, { type: "json" }) || {};
        const items = [];
        if (traits.travel_wish) items.push(`🗺️ 想去：${traits.travel_wish.value}`);
        if (traits.food_like) items.push(`🍽️ 喜欢吃：${traits.food_like.value}`);
        if (traits.dislike) items.push(`❌ 讨厌：${traits.dislike.value}`);
        if (traits.birthday) items.push(`🎂 生日：${traits.birthday.value}`);
        if (traits.job) items.push(`💼 工作：${traits.job.value}`);
        if (items.length === 0) return "📝 我还没记住什么特别的呢...\n多和我说说话吧～";
        return `📝 我记住的你：\n${items.join("\n")}`;
      } catch { return "📝 记忆水晶：空空如也"; }
    }
  },
  "/mood": {
    desc: "查看情绪状态",
    fn: async (_, userId, env) => {
      try {
        const mood = await env.AI_KV?.get(`mem:${userId}:mood`, { type: "json" }) || { primary: "neutral" };
        const moodEmoji = {
          happy: "😊 开心", sad: "😢 低落", tired: "😴 疲惫",
          anxious: "😰 焦虑", angry: "😠 生气", lonely: "🥺 孤独",
          excited: "🤩 兴奋", neutral: "😐 平静"
        };
        return `🎭 最近情绪：${moodEmoji[mood.primary] || "平静"}\n${mood.primary !== "neutral" ? "我会更温柔地陪你哦～" : "一切都好呢～"}`;
      } catch { return "🎭 情绪水晶：平静"; }
    }
  },
  "/horoscope": {
    desc: "今日运势",
    fn: (text) => {
      const signs = ["白羊", "金牛", "双子", "巨蟹", "狮子", "处女", "天秤", "天蝎", "射手", "摩羯", "水瓶", "双鱼"];
      const sign = text.replace("/horoscope", "").trim() || randomPick(signs);
      const lucky = ["牛角面包", "羽毛笔", "小扫帚", "星尘瓶"];
      const advice = ["下午茶时间最宜施法", "避开蘑菇丛", "向东走会有惊喜", "和朋友分享面包"];
      return `🌌 *水晶球泛起涟漪*
【${sign}座今日魔法】
✨ 魔力值：${Math.floor(Math.random() * 3) + 3}/5
💫 幸运物：${randomPick(lucky)}
☕ 建议：${randomPick(advice)}`;
    }
  }
};

const handleCommand = async (text, userId, env) => {
  const cmd = COMMANDS[text.split(" ")[0]];
  return cmd ? await cmd.fn(text, userId, env) : null;
};

// ====================== 13. 主逻辑 ======================
export default {
  async fetch(request, env) {
    try {
      const body = await request.json().catch(() => null);
      if (!body) return Response.json({ reply: CONFIG.EMPTY_MSG });

      const { text, userId, isGroup, isAt } = parseMsg(body);
      if (isGroup && !isAt) return Response.json({ reply: "" });
      if (!text) return Response.json({ reply: CONFIG.EMPTY_MSG });

      // 时间上下文（北京时间）
      const beijingTime = getBeijingTime();
      const timeContext = {
        hour: beijingTime.hour,
        month: beijingTime.month,
        date: beijingTime.date,
        minute: beijingTime.minute,
        insomniaLastNight: false
      };

      // 检查昨晚是否失眠
      try {
        const insomnia = await env.AI_KV?.get(`insomnia:${userId}`);
        if (insomnia && timeContext.hour >= 6 && timeContext.hour < 12) {
          timeContext.insomniaLastNight = true;
          await env.AI_KV?.delete(`insomnia:${userId}`);
        }
      } catch {}

      // 获取记忆上下文
      const traits = await MemorySystem.getTraits(env, userId);
      const mood = await MemorySystem.getMood(env, userId);
      const daysTogether = await MemorySystem.getFirstSeen(env, userId);

      // 构建上下文对象
      const context = { traits, mood, daysTogether, timeContext, env, userId, isGroup };

      // 魔法命令优先
      const cmdReply = await handleCommand(text, userId, env);
      if (cmdReply) return Response.json({ reply: cmdReply });

      // 失眠记录
      if (text.includes("睡不着") || text.includes("失眠")) {
        try { await env.AI_KV?.put(`insomnia:${userId}`, "1", { expirationTtl: 86400 }); } catch {}
        const insomniaReplies = [
          "🌙 *轻轻摇晃水晶球*\n睡不着的话...要听星星摇篮曲吗？\n*扫帚轻轻摇晃*\n闭上眼睛...（开始轻声哼唱）",
          "✨ *变出温热的牛奶*\n喝一点会好睡哦～\n*悄悄在枕边放了一颗星星*\n晚安，我在这里陪着呢",
          "🌌 *轻声*\n睡不着的时候，数牛角面包试试？\n1个...2个...3个...\n*声音越来越轻* 还有我在..."
        ];
        return Response.json({ reply: randomPick(insomniaReplies) });
      }

      // 提取记忆
      const extracted = MemorySystem.extractFromMessage(text);
      for (const ext of extracted) {
        await MemorySystem.updateTrait(env, userId, ext.field, ext.value);
        traits[ext.field] = { value: ext.value, updatedAt: Date.now() };
      }

      // 分析情绪
      const emotion = MemorySystem.analyzeEmotion(text);
      await MemorySystem.updateMood(env, userId, emotion);
      mood.primary = emotion;

      // 牛角面包暗号
      if (text.includes("牛角面包")) {
        try {
          let breadCount = await env.AI_KV?.get(`bread:${userId}`, { type: "json" }) || 0;
          breadCount++;
          await env.AI_KV?.put(`bread:${userId}`, JSON.stringify(breadCount), { expirationTtl: 300 });
          if (breadCount >= 3) {
            await env.AI_KV?.delete(`bread:${userId}`);
            await env.AI_KV?.put(`bread_unlocked:${userId}`, "1", { expirationTtl: 120 });
            return Response.json({ reply: "🥐 *突然从书堆里跳出来*\n啊啦～你、你怎么知道这是秘密暗号！\n*慌乱中掉出一张纸条*\n「番星说...只能给最可爱的旅人」\n\n✨ 你解锁了隐藏彩蛋！说「谢谢」领取秘密配方～" });
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

      // 彩蛋查询
      if (text === "彩蛋" || text.includes("有什么彩蛋")) {
        return Response.json({ reply: `🥚 **伊蕾娜的彩蛋箱** 🥚

🗣️ 日常触发：
• 在吗/早安/晚安 → 时段问候+天数
• 好饿/好困/好累 → 投喂&安慰
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
• 番星
• 魔法失败

💤 温柔陪伴：
• 睡不着 → 星星摇篮曲
• 会记住你的喜好和心愿
• 会感知你的情绪

──────────────
/help 可查看更多哦～` });
      }

      // 故障修复
      if ((text.includes("修好") || text.includes("修复")) && text.includes("面包")) {
        return Response.json({ reply: "*噼里啪啦冒火花*\n阿...啊啦！被、被你发现秘密修复法了！\n*面包屑粘在魔杖上*\n这、这可不是因为我偷吃才短路的！(脸红)" });
      }
      if (text.includes("魔法失败") || text.includes("出故障了")) {
        return Response.json({ reply: "*扫帚突然冒烟*\n呜...魔法回路过载了！\n(小声) 说「用牛角面包修复」试试？这是秘密方法哦～" });
      }

      // 彩蛋处理
      const eggReply = processEgg(text, context);
      if (eggReply) return Response.json({ reply: eggReply });

      // 速率限制
      if (!await checkRateLimit(env, userId)) {
        return Response.json({ reply: "你说话太快啦，让我喘口气～" });
      }

      // 构建动态系统提示
      const dynamicPrompt = buildDynamicPrompt({ traits, mood, daysTogether, timeContext, isGroup });

      // 获取对话历史
      const dialogHistory = await MemorySystem.getDialogHistory(env, userId);
      const messages = [{ role: "system", content: dynamicPrompt }];
      messages.push(...dialogHistory, { role: "user", content: text });

      // 调用AI
      const reply = await getAIReply(messages, env);
      if (!reply) return Response.json({ reply: CONFIG.ERROR_MSG });

      // 保存对话历史（仅私聊）
      if (!isGroup) {
        dialogHistory.push({ role: "user", content: text }, { role: "assistant", content: reply });
        await MemorySystem.saveDialogHistory(env, userId, dialogHistory);
      }

      return Response.json({ reply });

    } catch (e) {
      console.error("Worker error:", e);
      return Response.json({ reply: CONFIG.ERROR_MSG });
    }
  }
};