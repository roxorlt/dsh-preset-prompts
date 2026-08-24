// 注意：本插件通过 link: 安装在 profile 之外，Node 从真实目录解析依赖时够不到
// dsh 引擎的 @deepseek-ai/* 包，因此这里不 import defineTool，而是直接用
// ctx.tools.register 注册「标准 JSON Schema」形状的工具（type 只能是
// object/array/string/number/integer/boolean/null，required 是数组，不能内联）。
// defineTool 只是把作者 DSL 编译成这个形状再包一层参数校验，手写等价。
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const VERSION = require("../package.json").version;

const DATA_DIR = join(homedir(), ".askit");
const DATA_FILE = join(DATA_DIR, "prompts.json");

const BUILTINS = [
  {
    id: 'socratic',
    name: '苏格拉底式提问',
    desc: '先想清楚你真正要问什么',
    scenario: '问清问题',
    vars: [{ key: 'confusion', label: '我的困惑', placeholder: '请尽量具体地描述发生了什么、你怎么理解，以及你卡在哪里' }],
    body: '我的困惑是：$confusion。先不要给建议。请对我进行一次苏格拉底式问诊，通过最多6个问题，帮我找到真正值得回答的问题。请遵守这些规则：1. 每次只问一个问题，根据我的回答决定下一问，不要提前给我一整套问卷；2. 优先区分我说的是可验证的事实、对事实的解释、价值判断，还是我希望实现的目标；3. 检查关键词是否含糊、我默认了哪些前提、证据来自哪里、有没有相反解释，以及结论成立或不成立分别意味着什么；4. 每次提问前，用一句话说明上一条回答让你更新了什么判断；5. 只问可能改变结论的问题。信息足够时立刻停止，不必凑满6个。问诊结束后，请整理出：1. 我最开始问的问题；2. 我真正想解决的问题；3. 已经确认的事实；4. 仍未验证的假设；5. 最可能改变结论的关键变量；6. 一个准确、具体、可以继续行动的新问题。等我确认这个新问题以后，再给出你的判断、理由和下一步行动。'
  },
  {
    id: 'two-layer',
    name: '双层解释法',
    desc: '小白版加专业版各讲一遍',
    scenario: '学习',
    vars: [{ key: 'topic', label: '概念或问题', placeholder: '请填写概念或问题' }],
    body: '我想学习的是：$topic。请分两层解释：第一层，小白版。用生活化的语言和一个具体例子，让完全没有基础的人也能听懂。第二层，专业版。使用准确术语，讲清核心机制、适用边界和常见误解。最后请整理出：1. 列出小白说法与专业术语的对应关系；2. 我最容易理解错的地方；3. 3个用于检查我是否真正理解的问题。'
  },
  {
    id: 'reverse-deconstruct',
    name: '反向拆解',
    desc: '拆解范例，提炼可复用规律',
    scenario: '学习',
    vars: [{ key: 'sample', label: '优秀范例', placeholder: '请粘贴产品页面、网页、方案、流程说明、数据看板或其他成品' }, { key: 'goal', label: '想学会什么', placeholder: '请填写你希望从中学会什么' }],
    body: '我想拆解的优秀范例是：$sample。我想学会的是：$goal。请先用一句话说明它解决了什么问题，再反向拆解它为什么有效。重点分析：1. 它服务谁，目标是什么；2. 它采用了什么结构或流程；3. 哪些关键选择拉开了质量差距；4. 它的完成标准是什么；5. 哪些规律可以迁移，哪些细节只适合这个案例。最后请给我：1. 提炼3到5条可复用规律；2. 一份可以照着执行的操作清单；3. 一个最值得先尝试的小练习。'
  },
  {
    id: 'hv-research',
    name: '横纵分析法',
    desc: '半小时建立陌生领域框架',
    scenario: '学习',
    vars: [{ key: 'subject', label: '研究对象', placeholder: '请填写产品、公司、人物、技术、行业或事件' }],
    body: '研究对象是：$subject。请使用横纵分析法，对它完成一份可追溯的深度研究。研究截止时间为执行当天。纵向分析：1. 它在什么背景和需求下诞生，关键推动者是谁；2. 它经历了哪些重要转折、成功和失败；3. 哪些早期选择变成了今天的能力、路径依赖或包袱。横向分析：1. 选择最值得比较的对象，并说明为什么选它们；2. 用统一维度比较各自的强项、短板和独特性；3. 解释用户、客户或市场为什么选择它，又为什么放弃它。把两条轴合起来，继续判断：1. 过去形成的能力、路径依赖和约束会怎样影响未来；2. 未来最可能出现哪3条路径；3. 每条路径出现的前提和预警信号是什么。请遵守这些证据规则：1. 优先使用官方资料、原始数据、论文、财报和访谈等一手来源；2. 重要结论就近标注来源与日期；3. 事实、推断和观点分开写；4. 遇到冲突信息时并列呈现，找不到证据时明确写“暂未核实”。最后按以下顺序输出：核心结论、关键时间线、横向对比表、详细分析、未来判断、仍待确认的问题。报告需要在10000～30000字之间，语言尽量通俗，不要堆砌资料。'
  },
  {
    id: 'fact-check',
    name: '事实核查',
    desc: '联网核证，五级标记可信度',
    scenario: '学习',
    vars: [{ key: 'claim', label: '要核查的说法', placeholder: '请粘贴观点、结论、数据或方案' }],
    body: '我要核查的说法是：$claim。请先把它拆成：1. 可以被外部验证的事实；2. 从事实推出的结论；3. 其中包含的价值判断。对于事实部分，请联网核查来源、样本、时间和完整上下文，并标记为：1. 已证实；2. 基本成立，但需要收窄；3. 存在争议；4. 证据不足；5. 明显错误。在假设相关事实成立的情况下，继续检查：1. 这些事实能否推出当前结论；2. 是否藏着未经验证的假设；3. 是否混淆相关性和因果关系；4. 是否遗漏了其他解释或关键信息；5. 结论在什么条件下成立或失效。最后请输出：1. 哪些事实可信，哪些需要修正；2. 推理链中最关键的漏洞；3. 补强后的最合理版本；4. 我目前可以相信到什么程度。'
  },
  {
    id: 'expert-panel',
    name: '专家会诊',
    desc: '三视角互相质疑后给方案',
    scenario: '解决问题',
    vars: [{ key: 'problem', label: '问题、事实、目标、约束', placeholder: '请填写问题、已知事实、目标和现实约束' }],
    body: '我的问题是：$problem。先不要直接给方案。请为这个问题选择3种真正互补的专业视角，并说明每种视角为什么必要。让每种视角分别回答：1. 它怎样重新定义这个问题；2. 它最推荐的解决路径；3. 其他视角最容易忽略的风险；4. 什么新证据会让它改变判断。然后让三种视角互相质疑，找出：1. 共同认可的事实；2. 真正的分歧；3. 分歧背后的不同假设。最后请综合输出：1. 综合后最推荐的方案；2. 适用条件；3. 最大风险；4. 退出条件；5. 第一步行动。不要选择三个高度相似的身份，也不要模仿或编造真实人物的观点。信息不足时，先只问我一个最关键的问题。'
  },
  {
    id: 'first-principles',
    name: '第一性原理',
    desc: '回到基本事实重新推导',
    scenario: '解决问题',
    vars: [{ key: 'problem', label: '你的问题', placeholder: '请填写你的问题' }],
    body: '我想解决的问题是：$problem。请用第一性原理把它拆回最底层，区分：1. 已经确认、无法绕开的基本事实；2. 习惯性接受、却没有验证过的假设；3. 真正想实现的目标；4. 现实中的资源与约束。暂时放下行业惯例和现成方案，只从基本事实、目标和约束出发，重新推导可行路径。最后请输出：1. 原方案中只在修补表面的部分；2. 从基本事实重新推导出的新路径；3. 这条路径成立的前提；4. 验证它的第一步。'
  },
  {
    id: 'cross-domain',
    name: '跨领域借解',
    desc: '去别的领域找现成解法',
    scenario: '解决问题',
    vars: [{ key: 'context', label: '背景、做法、约束、卡点', placeholder: '请说明背景、当前做法、现实约束和具体卡点' }],
    body: '我的困惑是：$context。请先剥掉行业术语，把它抽象成一个人类在其他领域也可能遇到的问题，并找出：1. 问题的底层结构；2. 真正的核心矛盾；3. 普通解法失效的原因。然后从历史案例，以及至少3个彼此距离较远的领域中，每个案例都要说明：1. 那个领域遇到了什么问题；2. 使用了什么解决机制；3. 与我的问题相似在哪里；4. 哪些部分可以迁移；5. 什么条件下会失效。最后请选出最值得借用的3种机制，把它们翻译成适合我当前处境的解决方案，再推荐一个最值得先试的低成本、可逆实验。'
  },
  {
    id: 'steelman',
    name: '双向钢人论证',
    desc: '两选项各站最强立场帮决策',
    scenario: '决策',
    vars: [{ key: 'decision', label: '问题、两个选项、目标、约束', placeholder: '请写清问题、两个选项、目标和现实约束' }],
    body: '我需要做的决定是：$decision。先别急着回答，也别默认我已经把问题想清楚。请先做一次双向钢人论证：1. 用最完整、有力的方式，重述我真正需要做出的选择；2. 分别给出支持两个方向的最强理由、适用条件、最大收益、最大风险，以及最难回答的反对意见；3. 找出双方真正的分歧、最可能改变结论的关键变量，以及还需要补充的信息；4. 只问我一个最可能改变结论的问题。等我回答以后，再给出明确判断、理由、适用条件和下一步行动。'
  },
  {
    id: 'min-experiment',
    name: '用最小实验替代空想',
    desc: '把纠结变成可跑的小实验',
    scenario: '决策',
    vars: [{ key: 'choice', label: '选择或想法', placeholder: '请填写你的选择或想法' }, { key: 'window', label: '可接受的周期', placeholder: '请填写7天或你能接受的周期' }],
    body: '我正在纠结的是：$choice。请先找出这个决定背后最需要验证的3个假设，再选出最可能改变最终结论的那一个。围绕这个假设，帮我设计一个低成本、可逆、能在$window内完成的最小实验。请写清：1. 具体要做什么；2. 需要投入多少时间和资源；3. 观察什么指标；4. 什么结果支持继续；5. 什么结果提醒我停止；6. 实验结束后能获得什么新信息。最后告诉我，明天就能开始的第一个动作是什么。'
  }
];

const MAX_HISTORY = 10;
const store = { version: 2, overrides: {}, custom: [] };
let loaded = false;

function errMsg(err) {
  return err && err.message ? err.message : String(err);
}

function cleanContent(src) {
  const o = src && typeof src === 'object' ? src : {};
  let vars = [];
  if (Array.isArray(o.vars)) {
    const seen = new Set();
    for (const v of o.vars) {
      if (!v || typeof v !== 'object' || typeof v.key !== 'string' || !v.key.trim()) continue;
      const key = v.key.trim().slice(0, 20);
      if (seen.has(key)) continue;
      seen.add(key);
      vars.push({
        key,
        label: typeof v.label === 'string' ? v.label.trim().slice(0, 20) : key,
        placeholder: typeof v.placeholder === 'string' ? v.placeholder.trim().slice(0, 40) : ''
      });
    }
  }
  let body = typeof o.body === 'string' ? o.body.trim().slice(0, 20000) : '';
  for (const v of vars) {
    body = body.split('$' + v.key + '×').join('$' + v.key);
  }
  return {
    name: typeof o.name === 'string' ? o.name.trim().slice(0, 40) : '',
    desc: typeof o.desc === 'string' ? o.desc.trim().slice(0, 80) : '',
    scenario: typeof o.scenario === 'string' && o.scenario.trim() ? o.scenario.trim().slice(0, 20) : '自定义',
    body,
    vars
  };
}

function sanitize(item) {
  const src = item && typeof item === 'object' ? item : {};
  const c = cleanContent(src);
  const version = Number.isFinite(src.version) && src.version > 0 ? Math.floor(src.version) : 1;
  const updatedAt = Number.isFinite(src.updatedAt) && src.updatedAt > 0 ? Math.floor(src.updatedAt) : Date.now();
  let history = [];
  if (Array.isArray(src.history)) {
    history = [];
    for (const h of src.history) {
      if (!h || typeof h !== 'object') continue;
      const cc = cleanContent(h);
      if (!cc.name || !cc.body) continue;
      history.push({
        ...cc,
        version: Number.isFinite(h.version) && h.version > 0 ? Math.floor(h.version) : 1,
        updatedAt: Number.isFinite(h.updatedAt) && h.updatedAt > 0 ? Math.floor(h.updatedAt) : 0
      });
    }
    history = history.slice(0, MAX_HISTORY);
  }
  return { ...c, version, updatedAt, history };
}

function migrateLegacy(s) {
  if (Array.isArray(s.vars) && s.vars.length) return s;
  if (s.body.indexOf('【') === -1) return s;
  const vars = [];
  const byInner = new Map();
  const re = /【([^【】]{1,40})】/g;
  let m;
  while ((m = re.exec(s.body)) !== null) {
    const inner = m[1].trim();
    if (byInner.has(inner)) continue;
    let base = inner.replace(/\s+/g, '').slice(0, 8);
    if (!base) base = 'var';
    let key = base;
    let n = 1;
    while (vars.some((v) => v.key === key)) {
      n++;
      key = base + n;
    }
    vars.push({ key, label: inner.slice(0, 20), placeholder: '请输入' + inner.slice(0, 20) });
    byInner.set(inner, key);
  }
  const re2 = /【([^【】]{1,40})】/g;
  const body = s.body.replace(re2, (full, inner) => {
    const key = byInner.get(inner.trim());
    return key ? '$' + key : full;
  });
  return { ...s, vars, body };
}

async function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  try {
    const text = await readFile(DATA_FILE, 'utf8');
    const data = JSON.parse(text);
    let migrated = false;
    if (data && typeof data === 'object') {
      if (data.overrides && typeof data.overrides === 'object') {
        const ov = {};
        for (const k of Object.keys(data.overrides)) {
          const v = data.overrides[k];
          if (v === null) {
            ov[k] = null;
            continue;
          }
          if (v && typeof v === 'object') {
            const s = sanitize(v);
            const m = migrateLegacy(s);
            if (m !== s) migrated = true;
            ov[k] = m;
          }
        }
        store.overrides = ov;
      }
      if (Array.isArray(data.custom)) {
        store.custom = [];
        for (const x of data.custom) {
          if (!x || typeof x !== 'object' || typeof x.id !== 'string') continue;
          const s = sanitize(x);
          const m = migrateLegacy(s);
          if (m !== s) migrated = true;
          if (!m.name || !m.body) continue;
          store.custom.push({ id: x.id.slice(0, 40), ...m });
        }
        store.custom = store.custom.slice(0, 200);
      }
    }
    if (migrated) {
      try { await persist(); } catch (err) {}
    }
  } catch (err) {}
}

async function persist() {
  await mkdir(DATA_DIR, { recursive: true });
  const budget = [MAX_HISTORY, 5, 1, 0];
  let json = JSON.stringify(store, null, 2);
  while (json.length > 5000000 && budget.length) {
    const keep = budget.shift();
    store.custom = store.custom.map((c) => ({ ...c, history: c.history.slice(0, keep) }));
    for (const k of Object.keys(store.overrides)) {
      const ov = store.overrides[k];
      if (ov && typeof ov === 'object') store.overrides[k] = { ...ov, history: ov.history.slice(0, keep) };
    }
    json = JSON.stringify(store, null, 2);
  }
  await writeFile(DATA_FILE, json, 'utf8');
}

function effectiveList() {
  const list = [];
  for (const b of BUILTINS) {
    const ov = store.overrides[b.id];
    if (ov === null) continue;
    if (ov && typeof ov === 'object') {
      list.push({
        id: b.id,
        name: ov.name || b.name,
        desc: ov.desc || b.desc,
        scenario: ov.scenario || b.scenario,
        body: ov.body || b.body,
        vars: Array.isArray(ov.vars) && ov.vars.length ? ov.vars : (Array.isArray(b.vars) ? b.vars : []),
        builtin: true
      });
    } else {
      list.push({ ...b, builtin: true });
    }
  }
  for (const c of store.custom) list.push({ ...c, builtin: false });
  return list;
}

export const name = 'dsh-preset-prompts';
export const inject = ['webServer', 'tools'];

export function apply(ctx) {
  function route(method, fn) {
    return ctx.webServer.register({
      kind: 'prefix',
      path: '/api/askit/' + method,
      handler: async (req, res) => {
        let body = null;
        try {
          if (req.method === 'POST') {
            const chunks = [];
            for await (const chunk of req) chunks.push(chunk);
            const raw = Buffer.concat(chunks).toString('utf8');
            if (raw) body = JSON.parse(raw);
          }
        } catch (err) {}
        try {
          const result = await fn(body || {});
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-cache' });
          res.end(JSON.stringify(result));
        } catch (err) {
          res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, error: errMsg(err) }));
        }
      }
    });
  }

  ctx.effect(() => route('templates', async () => {
    await ensureLoaded();
    return effectiveList();
  }));
  ctx.effect(() => route('builtins', async () => BUILTINS.map((b) => ({ ...b, builtin: true }))));
  ctx.effect(() => route('state', async () => {
    await ensureLoaded();
    return { overrides: store.overrides, custom: store.custom };
  }));
  ctx.effect(() => route('version', async () => ({ version: VERSION })));
  ctx.effect(() => route('history', async (args) => {
    await ensureLoaded();
    const id = args && typeof args.id === 'string' ? args.id : '';
    if (!id) return { ok: false, error: '缺少 id' };
    if (args && args.builtin) {
      const b = BUILTINS.find((x) => x.id === id);
      if (!b) return { ok: false, error: '未知的内置模板' };
      const cur = store.overrides[id] && typeof store.overrides[id] === 'object' ? store.overrides[id] : null;
      if (!cur) return { version: 1, updatedAt: 0, history: [] };
      return { version: cur.version, updatedAt: cur.updatedAt, history: cur.history };
    }
    const cur = store.custom.find((x) => x.id === id);
    if (!cur) return { ok: false, error: '提示词不存在' };
    return { version: cur.version, updatedAt: cur.updatedAt, history: cur.history };
  }));
  ctx.effect(() => route('savePrompt', async (args) => {
    await ensureLoaded();
    const raw = args && args.item && typeof args.item === 'object' ? args.item : {};
    const item = sanitize(raw);
    if (!item.name || !item.body) return { ok: false, error: '名称与正文不能为空' };
    const now = Date.now();
    const next = { name: item.name, desc: item.desc, scenario: item.scenario, body: item.body, vars: item.vars };
    const contentKey = (x) => JSON.stringify([x.name, x.desc, x.scenario, x.body, x.vars]);
    if (raw.builtin) {
      const b = BUILTINS.find((x) => x.id === item.id);
      if (!b) return { ok: false, error: '未知的内置模板' };
      const curOv = store.overrides[b.id] && typeof store.overrides[b.id] === 'object' ? store.overrides[b.id] : null;
      const base = curOv || { name: b.name, desc: b.desc, scenario: b.scenario, body: b.body, vars: b.vars || [], version: 1, updatedAt: 0, history: [] };
      if (contentKey(base) === contentKey(next)) return { ok: true, templates: effectiveList() };
      const history = [{ name: base.name, desc: base.desc, scenario: base.scenario, body: base.body, vars: base.vars, version: base.version, updatedAt: base.updatedAt }].concat(base.history || []).slice(0, MAX_HISTORY);
      store.overrides = Object.assign({}, store.overrides, {
        [b.id]: { ...next, version: base.version + 1, updatedAt: now, history }
      });
    } else {
      const id = raw.id && typeof raw.id === 'string' && raw.id.slice(0, 1) === 'c' ? raw.id : 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const cur = store.custom.find((x) => x.id === id);
      if (cur && contentKey(cur) === contentKey(next)) return { ok: true, templates: effectiveList() };
      const history = cur
        ? [{ name: cur.name, desc: cur.desc, scenario: cur.scenario, body: cur.body, vars: cur.vars, version: cur.version, updatedAt: cur.updatedAt }].concat(cur.history || []).slice(0, MAX_HISTORY)
        : [];
      const entry = { id, ...next, version: cur ? cur.version + 1 : 1, updatedAt: now, history };
      const idx = store.custom.findIndex((x) => x.id === id);
      if (idx >= 0) store.custom[idx] = entry;
      else store.custom.push(entry);
      if (store.custom.length > 200) store.custom = store.custom.slice(-200);
    }
    await persist();
    return { ok: true, templates: effectiveList() };
  }));
  ctx.effect(() => route('restoreVersion', async (args) => {
    await ensureLoaded();
    const id = args && typeof args.id === 'string' ? args.id : '';
    const version = Number.isFinite(args && args.version) ? Math.floor(args.version) : 0;
    if (!id || !version) return { ok: false, error: '参数不完整' };
    const now = Date.now();
    const applyRestore = (cur) => {
      const target = cur.history.find((h) => h.version === version);
      if (!target) return null;
      const maxV = Math.max(cur.version, ...cur.history.map((h) => h.version));
      const history = [{ name: cur.name, desc: cur.desc, scenario: cur.scenario, body: cur.body, vars: cur.vars, version: cur.version, updatedAt: cur.updatedAt }].concat(cur.history.filter((h) => h.version !== version)).slice(0, MAX_HISTORY);
      return { name: target.name, desc: target.desc, scenario: target.scenario, body: target.body, vars: target.vars, version: maxV + 1, updatedAt: now, history };
    };
    if (args && args.builtin) {
      const b = BUILTINS.find((x) => x.id === id);
      if (!b) return { ok: false, error: '未知的内置模板' };
      const cur = store.overrides[id] && typeof store.overrides[id] === 'object' ? store.overrides[id] : null;
      if (!cur) return { ok: false, error: '该内置模板没有历史版本' };
      const restored = applyRestore(cur);
      if (!restored) return { ok: false, error: '版本不存在' };
      store.overrides = Object.assign({}, store.overrides, { [id]: restored });
    } else {
      const cur = store.custom.find((x) => x.id === id);
      if (!cur) return { ok: false, error: '提示词不存在' };
      const restored = applyRestore(cur);
      if (!restored) return { ok: false, error: '版本不存在' };
      store.custom = store.custom.map((x) => (x.id === id ? { id, ...restored } : x));
    }
    await persist();
    return { ok: true, templates: effectiveList() };
  }));
  ctx.effect(() => route('deletePrompt', async (args) => {
    await ensureLoaded();
    const id = args && typeof args.id === 'string' ? args.id : '';
    if (!id) return { ok: false, error: '缺少 id' };
    if (args && args.builtin) {
      if (!BUILTINS.some((x) => x.id === id)) return { ok: false, error: '未知的内置模板' };
      store.overrides = Object.assign({}, store.overrides, { [id]: null });
    } else {
      store.custom = store.custom.filter((x) => x.id !== id);
    }
    await persist();
    return { ok: true, templates: effectiveList() };
  }));
  ctx.effect(() => route('restorePrompt', async (args) => {
    await ensureLoaded();
    const id = args && typeof args.id === 'string' ? args.id : '';
    if (!id) return { ok: false, error: '缺少 id' };
    const next = Object.assign({}, store.overrides);
    delete next[id];
    store.overrides = next;
    await persist();
    return { ok: true, templates: effectiveList() };
  }));

  const web = ctx.get('web');
  const factCheckTool = {
    name: 'fact_check',
    description: '思维工具·事实核查（五级核查法的联网版）。收到一条待核查的说法后：先把它拆成可外部验证的事实、从事实推出的结论、价值判断（由调用方完成）；再对事实部分逐条联网检索来源。返回去重后的来源列表（标题、链接、摘要）与核查协议，调用方据此按五级标记：已证实 / 基本成立但需收窄 / 存在争议 / 证据不足 / 明显错误。适合用户要求核查观点、数据、引用或方案时自主调用。',
    parameters: {
      type: 'object',
      properties: {
        claim: { type: 'string', description: '要核查的说法原文' },
        queries: { type: 'array', items: { type: 'string' }, description: '额外检索词，最多 3 个；缺省只检索 claim 原文' },
        maxResults: { type: 'number', description: '每个检索词的来源上限，默认 5' }
      },
      required: ['claim']
    },
    output: {
      schema: { type: 'string' },
      render(_args, value) {
        return [{ type: 'text', text: String(value) }];
      }
    },
    async execute(args, exec) {
      const claim = typeof args.claim === 'string' ? args.claim.trim() : '';
      if (!claim) return '缺少 claim 参数';
      const extra = Array.isArray(args.queries)
        ? args.queries.filter((q) => typeof q === 'string' && q.trim()).slice(0, 3)
        : [];
      const queries = [claim].concat(extra);
      const maxResults = Number.isFinite(args.maxResults)
        ? Math.max(1, Math.min(10, Math.floor(args.maxResults)))
        : 5;
      const signal = exec && exec.signal ? exec.signal : undefined;
      if (!web) return 'web 服务不可用，无法联网核查';
      const seen = new Set();
      const lines = [];
      for (const q of queries) {
        try {
          const res = await web.search({ query: q, maxResults }, signal);
          const list = Array.isArray(res && res.sources) ? res.sources : [];
          const kept = [];
          for (const s of list) {
            const sUrl = s && typeof s.url === 'string' ? s.url : '';
            if (!sUrl || seen.has(sUrl)) continue;
            seen.add(sUrl);
            kept.push(s);
          }
          lines.push('【检索】' + q + ' → ' + kept.length + ' 条' + (res && res.truncated ? '（有截断）' : ''));
          for (const s of kept.slice(0, 8)) {
            const sUrl = typeof s.url === 'string' ? s.url : '';
            const title = typeof s.title === 'string' ? s.title : '';
            const snippet = typeof s.snippet === 'string' && s.snippet
              ? s.snippet
              : (typeof s.content === 'string' ? s.content.slice(0, 160) : '');
            lines.push('- ' + (title || '（无标题）'));
            lines.push('  ' + (sUrl || '（无链接）'));
            if (snippet) lines.push('  ' + snippet);
          }
        } catch (err) {
          lines.push('【检索】' + q + ' → 失败：' + errMsg(err));
        }
      }
      lines.push('');
      lines.push('核查协议（调用方完成）：1. 把待核说法拆成可外部验证的事实、从事实推出的结论、价值判断；2. 对事实部分逐条对照上述来源，按五级标记：已证实 / 基本成立但需收窄 / 存在争议 / 证据不足 / 明显错误；3. 检查推理链漏洞与相关因果混淆；4. 输出：哪些可信、哪些要修正、推理链最关键漏洞、补强后的最合理版本、目前可以相信到什么程度。');
      return lines.join('\n');
    }
  };
  ctx.effect(() => {
    // 防御：注册失败只降级 fact_check 工具，不拖垮 dsh 启动（面板路由不受影响）。
    try {
      return ctx.tools.register(factCheckTool);
    } catch (err) {
      console.error('dsh-preset-prompts: 注册 fact_check 失败，该工具降级为不可用:', err);
      return () => {};
    }
  });
}
