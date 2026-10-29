/**
 * preset-workbench (host) - HTTP bridge for the settings workbench.
 *
 * Serves POST /api/preset-workbench (loopback only) with ops:
 *   list / load / save / create / delete / validate / reveal
 * All ops are restricted to USER-trust presets; system presets are refused.
 *
 * Activation waits for agentPresets/fs/webServer via ctx.inject (the
 * free-search pattern): a bare ctx.get during early composition returns
 * undefined and would silently skip route registration.
 */

import { existsSync, mkdirSync, cpSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { spawn as spawnChild } from 'node:child_process'
import { parseComposition } from './yaml-lite.js'

const TEMPLATES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'templates')

// 动态识别内置模板：templates/ 下每个含 preset.yml 的目录 = 一个内置模板
function builtinTemplates() {
  if (!existsSync(TEMPLATES_DIR)) return []
  const out = []
  for (const ent of readdirSync(TEMPLATES_DIR, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue
    const p = join(TEMPLATES_DIR, ent.name)
    if (existsSync(join(p, 'preset.yml'))) out.push(ent.name)
  }
  return out.sort()
}

const API_PATH = '/api/preset-workbench'
const FILE_OK = /^[\w.\-\u4e00-\u9fa5]+\.md$/

// ── 主机侧错误文案（按语言）─────────────────────────────────
// createPreset 等 ops 抛错时按请求 lang 取值；{0} 为占位符。
const n_err = {
  badId: { zh: '预设 id 只能用小写字母、数字、连字符，且不能以连字符开头', en: 'Preset id may only contain lowercase letters, digits and hyphens, and may not start with a hyphen' },
  idExists: { zh: 'id 已被占用：{0} 已存在。复制永远不会覆盖已有预设——请先删除它，或换一个 id', en: 'id already taken: {0} already exists. A copy never overwrites — delete it first or choose another id' },
  noBuiltin: { zh: '内置模板不存在: {0}', en: 'Builtin template not found: {0}' },
  noTemplate: { zh: '没有可用的模板预设', en: 'No available template preset' },
  noSrc: { zh: '模板预设不存在: {0}', en: 'Template preset not found: {0}' },
  noComposition: {
    zh: '来源里没有可用的组合文件（agent.cordis.yml），另存出来会是一个挂不起来的预设，已放弃保存。请改选一个本机用户预设或内置模板作为来源。',
    en: 'The source has no usable composition file (agent.cordis.yml); the preset would not mount, so nothing was saved. Pick a local user preset or a builtin template as the source.',
  },
  emptyContent: { zh: '没有可保存的内容', en: 'Nothing to save' },
  noSrcCopy: {
    zh: '「{0}」是声明式预设（由插件或市场提供），磁盘上没有可复制的目录。请改选一个本机用户预设或内置模板作为来源。',
    en: '"{0}" is a declared preset (supplied by a plugin or the market) with no directory on disk to copy. Pick a local user preset or a builtin template as the source instead.',
  },
}

// ── 能力开关目录 ─────────────────────────────────────────────
// 每一项 = 一段可独立插入/移除的组合行（带 pw-cap-start/end 标记）。
// 只做加性开关；核心的 shell/编辑器/压缩不在此列，永不因勾选被移除。
const PW_CAP_START = (id) => '# pw-cap-start:' + id
const PW_CAP_END = (id) => '# pw-cap-end:' + id

const CAPS = [
  {
    id: 'web',
    title: '联网搜索 + 网页抓取',
    desc: '让 AI 能上网搜索资料、抓取网页内容（需要已配置可用引擎）。',
    en_title: 'Web search + fetch',
    en_desc: 'Lets the AI search the web and fetch page content (requires a configured search engine).',
    block: `- id: tool-web
  name: '@deepseek-ai/dsh-tool-web'
  config:
    fetch: true
    searchTimeoutMs: 60000
`,
  },
  {
    id: 'fs',
    title: '标准文件工具',
    desc: 'read / write / edit / glob / grep——和当前这个会话用的那套一致。',
    en_title: 'Standard file tools',
    en_desc: 'read / write / edit / glob / grep — the same set this session uses.',
    block: `- id: tool-fs
  name: '@deepseek-ai/dsh-tool-fs'

- id: tool-fs-search
  name: '@deepseek-ai/dsh-tool-fs-search'
  config:
    sampleOverCapGlobResults: false
`,
  },
  {
    id: 'ask',
    title: '向你提问确认',
    desc: '让 AI 在关键选择上向你弹选择题确认，而不是自作主张。',
    en_title: 'Ask you to confirm',
    en_desc: 'Prompts the AI to ask a multiple-choice confirmation on key decisions instead of acting on its own.',
    block: `- id: tool-ask-user
  name: '@deepseek-ai/dsh-tool-ask-user'
`,
  },
  {
    id: 'todo',
    title: '任务清单',
    desc: 'todo 工具：多步骤工作时维护一个进度清单。',
    en_title: 'Todo list',
    en_desc: 'The todo tool: maintain a progress list during multi-step work.',
    block: `- id: tool-todo
  name: '@deepseek-ai/dsh-tool-todo'
  config:
    allowParallelInProgress: true
`,
  },
  {
    id: 'jobs',
    title: '后台任务',
    desc: '把耗时命令挂到后台执行，边跑边继续对话。',
    en_title: 'Background jobs',
    en_desc: 'Run long commands in the background and keep chatting while they work.',
    block: `- id: tool-jobs
  name: '@deepseek-ai/dsh-tool-jobs'
`,
  },
  {
    id: 'goal',
    title: '长期目标',
    desc: '支持 /goal 指令：一个长目标可在多轮对话里持续推进。',
    en_title: 'Long-term goal',
    en_desc: 'Supports the /goal command: a long objective advanced across many turns.',
    block: `- id: tool-goal
  name: '@deepseek-ai/dsh-tool-goal'

- id: command-goal
  name: '@deepseek-ai/dsh-command-goal'
`,
  },
  {
    id: 'skills',
    title: '技能库',
    desc: '挂载可复用的技能目录（skill），AI 可随时加载使用。',
    en_title: 'Skills',
    en_desc: 'Mount reusable skill directories that the AI can load on demand.',
    block: `- id: skill-filesystem
  name: '@deepseek-ai/dsh-skill-filesystem'

- id: tool-skill
  name: '@deepseek-ai/dsh-tool-skill'
`,
  },
  {
    id: 'subagents',
    title: '子代理',
    desc: '把任务派给子代理跑（spawn / fork 两种方式），主会话不必自己干完所有事。',
    en_title: 'Subagents',
    en_desc: 'Delegate tasks to subagents (spawn / fork) instead of doing everything in the main session.',
    block: `- id: tool-subagent-control
  name: '@deepseek-ai/dsh-tool-subagent-control'
- id: tool-subagent-list-agents
  name: '@deepseek-ai/dsh-tool-subagent-control/list-agents'
- id: tool-subagent
  name: '@deepseek-ai/dsh-tool-subagent'
  config:
    provider: spawn
    toolName: subagent
    backgroundMode: continuable
- id: tool-subagent-fork
  name: '@deepseek-ai/dsh-tool-subagent'
  config:
    provider: fork
    toolName: subagent_fork
    backgroundMode: continuable
`,
  },
  {
    id: 'workflows',
    title: '工作流编排 + Ralph',
    desc: '⚠ 高风险项：让 AI 跑多轮编排脚本，含 Ralph 迭代代理。工作流引擎需要宿主提供 PTC 运行时；环境不支持时开启会被安全拒绝，否则该行挂载失败会拖垮整个预设。',
    en_title: 'Workflow orchestration + Ralph',
    en_desc: '⚠ High-risk: run multi-round orchestration scripts, including the Ralph iterative agent. The workflow engine needs a host PTC runtime; safely refused without one, since a failed row would break the whole preset.',
    block: `- id: delegation
  name: 'cordis:group'
  group: true
  isolate:
    workflowEngine: true
  config:
    - id: workflow-ptc
      name: '@deepseek-ai/dsh-workflow-ptc'
      config:
        provider: spawn
    - id: tool-workflow
      name: '@deepseek-ai/dsh-tool-workflow'
    - id: tool-ralph
      name: '@deepseek-ai/dsh-tool-ralph'
      config:
        subagentProvider: spawn
        maxRounds: 64
`,
  },
  {
    id: 'plan',
    title: '规划模式',
    desc: '动手前先产出方案、经你批准后再执行（plan mode）。',
    en_title: 'Plan mode',
    en_desc: 'Produce a plan before acting and execute only after you approve it (plan mode).',
    block: `- id: planning
  name: 'cordis:group'
  group: true
  isolate:
    planMode: true
  config:
    - id: plan-mode
      name: '@deepseek-ai/dsh-plan-mode'
      config:
        section: |
              你在 plan mode。只能制定计划，不能执行改动；探索用只读操作；最后用 exit_plan_mode 提交完整方案供批准。
`,
  },
  {
    id: 'instructions',
    title: '工作区指令 (AGENTS.md)',
    desc: '让 AI 自动读取工作区里的 AGENTS.md 并按其中要求行事（安全、常用、无副作用）。',
    en_title: 'Workspace instructions (AGENTS.md)',
    en_desc: 'Makes the AI read AGENTS.md from the workspace and follow it (safe, common, no side effects).',
    block: `- id: agent-instructions
  name: '@deepseek-ai/dsh-agent-instructions'
  config:
    maxBytes: 65536
`,
  },
  {
    id: 'presentation',
    title: 'PTC 程序化工具调用',
    desc: '⚠ 高风险项：需要宿主提供 PTC 运行时（ptcRuntime 服务）。开启后模型改为写代码批量调用工具，而不是逐个发起工具调用。环境不支持时开启会被安全拒绝——因为缺少运行时会让该行挂载失败，进而拖垮整个预设。',
    en_title: 'PTC (programmatic tool calling)',
    en_desc: '⚠ High-risk: requires a host PTC runtime (the ptcRuntime service). The model then calls tools by writing code instead of one call per tool. Safely refused when the deployment composes no runtime, because the row would fail to mount and break the whole preset.',
    block: `- id: tool-presentation
  name: '@deepseek-ai/dsh-agent-tool-presentation'
  config:
    mode: ptc
`,
  },
  {
    id: 'cordis',
    title: '插件改制工具 (cordis_*)',
    desc: '⚠ 高危高权限：给 AI 装上定义/运行/停止动态 Cordis 插件的整套工具（cordis_define 等）。只在你确实想让它自己改制插件时开启；对普通角色扮演无意义且扩大权限面。',
    en_title: 'Cordis plugin tools (cordis_*)',
    en_desc: '⚠ High-privilege: gives the AI the full toolset to define/run/stop dynamic Cordis plugins (cordis_define etc.). Only enable it when you really want it to reshape plugins itself; meaningless for casual roleplay and widens the attack surface.',
    block: `- id: tool-cordis
  name: '@deepseek-ai/dsh-tool-cordis'
`,
  },
  // ── 官方同款“预留接线”项：勾选 = 写入禁用行（disabled:true），真正启用需另装宿主捆绑 ──
  {
    id: 'codex',
    title: 'Codex 产品子代理（预留接线）',
    desc: '官方同款：勾选后按官方格式写入一行 disabled 的子代理行（等于接线完成）。真正启用还需安装宿主捆绑 @deepseek-ai/dsh-subagent-codex 并摘除这行的 disabled。',
    en_title: 'Codex product subagent (wiring reserve)',
    en_desc: 'Same as official: checking writes a disabled subagent row per the official format (completes the wiring). Actually enabling still requires installing the host bundle @deepseek-ai/dsh-subagent-codex and removing this row\u2019s disabled.',
    dormant: true,
    block: `- id: tool-subagent-codex
  name: '@deepseek-ai/dsh-tool-subagent'
  disabled: true
  config:
    provider: codex
    toolName: subagent_codex
    backgroundMode: one-shot
    maxDepth: provider-managed
`,
  },
  {
    id: 'claude-code',
    title: 'Claude Code 产品子代理（预留接线）',
    desc: '官方同款：勾选后写入 disabled 的子代理行。真正启用需安装 @deepseek-ai/dsh-subagent-claude-code 捆绑并摘除 disabled。',
    en_title: 'Claude Code product subagent (wiring reserve)',
    en_desc: 'Same as official: check to write a disabled subagent row. Enabling requires installing @deepseek-ai/dsh-subagent-claude-code and removing the disabled.',
    dormant: true,
    block: `- id: tool-subagent-claude-code
  name: '@deepseek-ai/dsh-tool-subagent'
  disabled: true
  config:
    provider: claude-code
    toolName: subagent_claude_code
    backgroundMode: one-shot
    maxDepth: provider-managed
`,
  },
  {
    id: 'shell12',
    title: '一次性 Bash + PowerShell（预留接线）',
    desc: '官方 standard 的一次性 shell（每条命令新进程）。鲸鱼娘用持久 shell，两者工具同名不能并存，故以禁用行形式预留；如需启用先想清楚二选一。',
    en_title: 'One-shot Bash + PowerShell (wiring reserve)',
    en_desc: 'Official standard\u2019s one-shot shell (a new process per command). Whale-mom uses a persistent shell, the tools share a name so they cannot coexist; reserved as a disabled row — pick one if enabling.',
    dormant: true,
    block: `- id: tool-bash
  name: '@deepseek-ai/dsh-tool-bash'
  disabled: true

- id: tool-pwsh
  name: '@deepseek-ai/dsh-tool-pwsh'
  disabled: true
`,
  },
]

export const name = 'preset-workbench'
export const inject = []

function dirOf(presetPath) {
  const p = String(presetPath).replace(/\\/g, '/')
  const i = p.lastIndexOf('/')
  return i > 0 ? p.slice(0, i) : p
}

function writeJson(res, code, value) {
  res.statusCode = code
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(value))
}

async function readJsonBody(req) {
  try {
    let chunks = ''
    for await (const chunk of req) chunks += chunk
    return JSON.parse(chunks)
  } catch (_) {
    return undefined
  }
}

function isLoopback(req) {
  const addr = String((req.socket && req.socket.remoteAddress) || '')
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1'
}

export function apply(ctx) {
  ctx.inject(['agentPresets', 'fs', 'webServer'], (sctx) => {
    const presets = sctx.get('agentPresets')
    const fs = sctx.get('fs')
    const webServer = sctx.get('webServer')
    if (presets === undefined || fs === undefined || webServer === undefined) return
    // 可选依赖：逐个独立注入。cordis 只为「已声明」的服务解析 ctx.get()，
    // 直接取会拿到 undefined；外层 inject 是必需依赖，这些内层回调不阻塞插件激活，
    // 服务缺席时对应功能优雅降级（无工作区可绑 / 无法打开目录 / 拒绝开 PPT 模式）。
    let wsRegistry
    let ptcRuntime
    let codeRuntime
    let sandboxPolicy
    sctx.inject(['workspaceRegistry'], (wctx) => { wsRegistry = wctx.get('workspaceRegistry') })
    // PTC 运行时：新版服务名是 ptcRuntime（由 @deepseek-ai/dsh-ptc-runtime-node 提供实现），
    // 旧版叫 codeRuntime —— 两个都探测，任一到手即可开启 PTC 呈现模式。
    sctx.inject(['ptcRuntime'], (wctx) => { ptcRuntime = wctx.get('ptcRuntime') })
    sctx.inject(['codeRuntime'], (wctx) => { codeRuntime = wctx.get('codeRuntime') })
    sctx.inject(['sandboxPolicy'], (wctx) => { sandboxPolicy = wctx.get('sandboxPolicy') })
    // 会话中途换预设需要 Agent 实例（recompose 收的是 agent.ctx）。
    let agents
    sctx.inject(['agents'], (wctx) => { agents = wctx.get('agents') })
    // 会话投影（判断会话是否已经开始）——与 agents 同样按可选依赖处理。
    let sessionProjections
    sctx.inject(['sessionProjections'], (wctx) => { sessionProjections = wctx.get('sessionProjections') })

    // ── 会话中途切换预设：排队，等下一次压缩后生效 ──────────────────
    //
    // 为什么不在点击时立刻换：预设决定系统提示词与工具表，运行中替换会让当前
    // 这一轮的前缀当场变掉。压缩是天然的换挡点——旧上下文被摘要收拢，正好在
    // 此时切人设，历史与提示词不会打架。
    //
    // 真实的换绑走 agentPresets.recompose()（select() 对已开始的会话会抛
    // agent-preset/locked），并补写 agent-preset/selected 让会话投影一致。
    const pendingSwitch = new Map() // sessionId -> presetId

    async function applyPendingSwitch(sessionId) {
      const presetId = pendingSwitch.get(sessionId)
      if (presetId === undefined) return { applied: false }
      const agent = agents && typeof agents.get === 'function' ? agents.get(sessionId) : undefined
      if (agent === undefined) return { applied: false, reason: 'agent-not-live' }
      const current = typeof presets.composedPreset === 'function' ? presets.composedPreset(agent.ctx) : undefined
      if (current === presetId) {
        pendingSwitch.delete(sessionId)
        return { applied: false, reason: 'already-current' }
      }
      await presets.recompose(agent.ctx, presetId)
      try { agent.session.append('agent-preset/selected', { agentPreset: presetId }) } catch (_) {}
      pendingSwitch.delete(sessionId)
      return { applied: true, preset: presetId }
    }

    // 压缩结束 = 换挡点。续写一条，避免队列里的预设永远等不到下一个事件。
    sctx.on('session/event', (session, event) => {
      if (!session || !event) return
      if (event.type !== 'compaction/end' && event.type !== 'compaction/summary') return
      if (!pendingSwitch.has(session.id)) return
      applyPendingSwitch(session.id).catch(() => {})
    })

    // ── 用户预设库（插件自管磁盘）────────────────────────────────
    // DSH 0.2 起 agent-preset registry 改为「声明式」：它不再扫描用户预设目录，
    // 也不再暴露 path / trust / copy / remove。因此磁盘的读写由本插件自己负责，
    // 再把每个预设「声明」给 registry，使其能在会话中被选中与挂载。
    const DSH_HOME = (process.env.DSH_HOME && String(process.env.DSH_HOME).trim()) || join(homedir(), '.dsh')
    const USER_PRESET_ROOT = join(DSH_HOME, '.agent-presets')
    const COMPOSITION_FILE = 'agent.cordis.yml'
    const METADATA_FILE = 'preset.yml'
    const RE_PRESET_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

    /** 预设 id -> 目录绝对路径；非法 id 直接拒绝（防路径穿越）。 */
    function presetDirOf(id) {
      const s = String(id == null ? '' : id)
      if (!RE_PRESET_ID.test(s)) throw new Error('非法预设 id: ' + s)
      return join(USER_PRESET_ROOT, s)
    }

    /** 扫描用户预设根目录，返回真实存在的预设目录。 */
    function scanUserDirs() {
      const out = []
      let ents
      try { ents = readdirSync(USER_PRESET_ROOT, { withFileTypes: true }) } catch (_) { return out }
      for (const ent of ents) {
        if (!ent.isDirectory()) continue
        const dir = join(USER_PRESET_ROOT, ent.name)
        const hasComposition = existsSync(join(dir, COMPOSITION_FILE))
        const hasMeta = existsSync(join(dir, METADATA_FILE))
        if (!hasComposition && !hasMeta) continue
        out.push({ id: ent.name, dir: dir, hasComposition: hasComposition })
      }
      return out.sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0 })
    }

    /** 该 id 是否是磁盘上的用户预设。 */
    function isUserPresetId(id) {
      try {
        const dir = presetDirOf(id)
        return existsSync(join(dir, COMPOSITION_FILE)) || existsSync(join(dir, METADATA_FILE))
      } catch (_) { return false }
    }

    /**
     * 来源目录：内置模板或磁盘上的用户预设。
     * 声明式预设（插件/市场提供）没有目录 → 返回 ''，调用方据此拒绝复制。
     */
    function sourceDirOf(id) {
      const s = String(id == null ? '' : id)
      if (s === '') return ''
      if (isUserPresetId(s)) {
        try { return presetDirOf(s) } catch (_) { return '' }
      }
      const tplDir = join(TEMPLATES_DIR, s)
      return existsSync(join(tplDir, METADATA_FILE)) ? tplDir : ''
    }

    /**
     * preset.yml：沿用来源的 description 等字段，只把 name 换成新名字，
     * 并把 order 固定为 99（另存出来的排在最后）。
     */
    function writePresetMeta(dir, disp) {
      let lines = []
      try { lines = readFileSync(join(dir, METADATA_FILE), 'utf8').split(/\r?\n/) } catch (_) { lines = [] }
      const out = []
      let sawName = false
      let sawOrder = false
      for (const line of lines) {
        if (/^name\s*:/.test(line)) { out.push('name: ' + disp); sawName = true; continue }
        if (/^order\s*:/.test(line)) { out.push('order: 99'); sawOrder = true; continue }
        out.push(line)
      }
      if (!sawName) out.unshift('name: ' + disp)
      if (!sawOrder) out.push('order: 99')
      while (out.length > 0 && out[out.length - 1].trim() === '') out.pop()
      return out.join('\n') + '\n'
    }

    /** 读 preset.yml 的展示字段（只取 name/description/order，容忍引号）。 */
    function readPresetMeta(dir) {
      const out = {}
      let text = ''
      try { text = readFileSync(join(dir, METADATA_FILE), 'utf8') } catch (_) { return out }
      for (const line of text.split(/\r?\n/)) {
        const m = /^(name|description|order)\s*:\s*(.*)$/.exec(line)
        if (!m) continue
        let v = m[2].trim()
        if (v.length >= 2 && ((v[0] === '"' && v[v.length - 1] === '"') || (v[0] === "'" && v[v.length - 1] === "'"))) {
          v = v.slice(1, -1)
        }
        if (m[1] === 'order') {
          const n = Number(v)
          if (Number.isFinite(n)) out.order = n
          continue
        }
        if (v !== '') out[m[1]] = v
      }
      return out
    }

    // ── 声明管理：把磁盘上的用户预设注册进 registry ──
    // registry 的 register() 接收结构化 plugins；相对路径行必须绝对化，
    // 否则 registry 会以错误的 baseUrl 解析 ./persona-file.mjs 这类行。
    const declared = new Map() // id -> dispose()
    // 组合清单的短 TTL 缓存（declare/undeclare 会主动清空）。
    let invCache = { at: 0, rows: null }

    function buildDefinition(id) {
      const dir = presetDirOf(id)
      const compPath = join(dir, COMPOSITION_FILE)
      let text
      try {
        text = readFileSync(compPath, 'utf8')
      } catch (e) {
        throw new Error(COMPOSITION_FILE + ' 不可读: ' + (e && e.message ? e.message : String(e)))
      }
      const plugins = parseComposition(text, dir.split('\\').join('/'))
      const meta = readPresetMeta(dir)
      const def = { id: String(id), plugins: plugins }
      if (meta.name !== undefined) def.name = meta.name
      if (meta.description !== undefined) def.description = meta.description
      if (meta.order !== undefined) def.order = meta.order
      return def
    }

    /** 声明一个用户预设；已声明则跳过。失败向上抛（由调用方决定是否隔离）。 */
    async function declarePreset(id) {
      invCache = { at: 0, rows: null }
      if (declared.has(id)) return false
      const dispose = await presets.register(buildDefinition(id))
      declared.set(id, dispose)
      return true
    }

    /** 撤销一个声明，磁盘文件保持不动。 */
    async function undeclarePreset(id) {
      invCache = { at: 0, rows: null }
      const d = declared.get(id)
      if (d === undefined) return false
      declared.delete(id)
      try { await d() } catch (_) {}
      return true
    }

    /**
     * 让声明集合与磁盘对齐：撤掉消失的，声明新增的。
     *
     * 有的预设会由第三方插件/市场包先行声明（例如 @linxin666/dsh-liangshen），
     * 此时 registry 已认领该 id，我们再声明会被拒（duplicate）。这类预设已经
     * 可见可用，编辑也照常走文件系统，因此记为 external 而不是失败。
     * 每次同步都重算，所以第三方包被卸载后我们能自动接管。
     */

    // ── 一等公民化：把用户预设同时写成 DSH 认的 bundle ─────────────────────────
    //
    // DSH 0.2 起不再读取 $DSH_HOME/.agent-presets/<id>/ 这种旧目录（官方 skill 原文:
    // "Nothing reads that directory any more"），预设只能由 bundle patch 里的
    // @deepseek-ai/dsh-agent-preset 声明行提供。所以每次写完预设，顺手在它目录里
    // 生成 package.json + cordis.patch.yml，并把该 bundle 登记进 profile：
    //   • 装上之后即使卸载本插件，预设照常可用；
    //   • 本插件的运行时 declare 保留，作为「还没重启前也能用」的即时通道；
    //     重启后 bundle 先声明，syncDeclarations 会把它记成 external 而不重复声明。

    /** 找到当前 profile 目录（bundle 列表里含 dsh-preset-workbench 的那个）。 */
    function findProfileDir() {
      const profiles = join(DSH_HOME, 'profiles')
      let names = []
      try {
        names = readdirSync(profiles, { withFileTypes: true })
          .filter(function (d) { return d.isDirectory() })
          .map(function (d) { return d.name })
      } catch (_) { return '' }
      for (const name of names) {
        try {
          const pkg = JSON.parse(readFileSync(join(profiles, name, 'package.json'), 'utf8'))
          const list = (pkg.dsh && pkg.dsh.profile && pkg.dsh.profile.bundles) || []
          if (list.indexOf('dsh-preset-workbench') >= 0) return join(profiles, name)
        } catch (_) {}
      }
      return names.indexOf('web') >= 0 ? join(profiles, 'web') : ''
    }

    /** YAML 单行标量：用单引号，内部的 ' 双写。 */
    function yamlStr(v) {
      const str = String(v === undefined || v === null ? '' : v).replace(/\r?\n/g, ' ').trim()
      if (str === '') return "''"
      return "'" + str.replace(/'/g, "''") + "'"
    }

    /** bundle 包名（@local 作用域，避免与公开包冲突）。 */
    function bundleNameOf(id) {
      return '@local/dsh-preset-' + String(id).replace(/[^a-z0-9._-]/gi, '-').toLowerCase()
    }

    /**
     * 在预设目录里生成 package.json + cordis.patch.yml。
     * plugins 用文本缩进嵌入，不做 YAML 重排：!!js 表达式与多行块原样保留。
     * @returns {{pkg: string, dir: string}|null} 没有组合文件时返回 null
     */
    function writePresetBundle(id) {
      const dir = presetDirOf(id)
      let composition = ''
      try { composition = readFileSync(join(dir, COMPOSITION_FILE), 'utf8') } catch (_) { return null }
      if (composition.trim() === '') return null
      const meta = readPresetMeta(dir)
      const pkg = bundleNameOf(id)

      const indented = composition
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map(function (line) { return line.trim() === '' ? '' : '          ' + line })
        .join('\n')
        .replace(/\n+$/, '')

      const patch = [
        '- insert:',
        '    - id: preset-' + id,
        "      name: '@deepseek-ai/dsh-agent-preset'",
        '      config:',
        '        id: ' + id,
      ]
      if (meta.name !== undefined && String(meta.name) !== '') patch.push('        name: ' + yamlStr(meta.name))
      if (meta.description !== undefined && String(meta.description) !== '') patch.push('        description: ' + yamlStr(meta.description))
      if (meta.order !== undefined && String(meta.order) !== '') patch.push('        order: ' + meta.order)
      patch.push('        plugins:')
      patch.push(indented)
      patch.push('')

      const pkgJson = {
        name: pkg,
        version: '1.0.0',
        private: true,
        type: 'module',
        dsh: { bundle: { patch: './cordis.patch.yml' } },
      }
      writeFileSync(join(dir, 'cordis.patch.yml'), patch.join('\n'), 'utf8')
      writeFileSync(join(dir, 'package.json'), JSON.stringify(pkgJson, null, 2) + '\n', 'utf8')
      return { pkg: pkg, dir: dir }
    }

    /** 把 bundle 登记进 profile（依赖 link + bundle 列表），幂等。 */
    function registerBundleInProfile(bundle) {
      if (bundle === null || bundle === undefined) return false
      const profileDir = findProfileDir()
      if (profileDir === '') return false
      const pkgPath = join(profileDir, 'package.json')
      let profile = null
      try { profile = JSON.parse(readFileSync(pkgPath, 'utf8')) } catch (_) { return false }
      profile.dependencies = profile.dependencies || {}
      profile.dsh = profile.dsh || {}
      profile.dsh.profile = profile.dsh.profile || {}
      const list = Array.isArray(profile.dsh.profile.bundles) ? profile.dsh.profile.bundles : []
      const linkTarget = bundle.dir.split('\\').join('/')
      let changed = false
      if (profile.dependencies[bundle.pkg] !== 'link:' + linkTarget) {
        profile.dependencies[bundle.pkg] = 'link:' + linkTarget
        changed = true
      }
      if (list.indexOf(bundle.pkg) < 0) {
        list.push(bundle.pkg)
        profile.dsh.profile.bundles = list
        changed = true
      }
      if (!changed) return false
      writeFileSync(pkgPath, JSON.stringify(profile, null, 2) + '\n', 'utf8')
      return true
    }

    /** 写完一个预设后调用：生成 bundle 并登记（失败不影响保存本身）。 */
    async function ensurePresetBundle(id) {
      try {
        if (!isUserPresetId(id)) return false
        const bundle = writePresetBundle(id)
        if (bundle === null) return false
        registerBundleInProfile(bundle)
        return true
      } catch (_) { return false }
    }

    /** 一次性迁移：给所有已有用户预设补上 bundle（幂等）。 */
    let bundlesMigrated = false
    async function ensureAllPresetBundles() {
      try {
        let names = []
        try {
          names = readdirSync(USER_PRESET_ROOT, { withFileTypes: true })
            .filter(function (d) { return d.isDirectory() && RE_PRESET_ID.test(d.name) })
            .map(function (d) { return d.name })
        } catch (_) { return 0 }
        let wrote = 0
        for (const name of names) {
          if (await ensurePresetBundle(name)) wrote++
        }
        return wrote
      } catch (_) { return 0 }
    }

    async function syncDeclarations() {
      const want = []
      for (const u of scanUserDirs()) if (u.hasComposition) want.push(u.id)
      for (const id of Array.from(declared.keys())) {
        if (want.indexOf(id) < 0) await undeclarePreset(id)
      }
      const owned = {}
      for (const p of await registryInventory()) owned[p.id] = true
      const result = { declared: [], external: [], failed: [] }
      for (const id of want) {
        if (declared.has(id)) continue
        if (owned[id]) { result.external.push(id); continue }
        try {
          await declarePreset(id)
          result.declared.push(id)
        } catch (e) {
          const msg = e && e.message ? e.message : String(e)
          // 竞态兜底：启动早期第三方声明可能尚未出现在清单里。
          if (/duplicate agent preset/i.test(msg)) result.external.push(id)
          else result.failed.push({ id: id, error: msg })
        }
      }
      return result
    }

    /**
     * 重新声明一个预设：改过 composition/段落文件后，registry 里那份已加载的
     * 声明是旧的，必须撤掉再声明才能让改动真正生效（新版 register 是急切加载）。
     */
    async function redeclarePreset(id) {
      if (!isUserPresetId(id)) return false
      if (declared.has(id)) await undeclarePreset(id)
      try {
        await declarePreset(id)
        return true
      } catch (e) {
        try { ctx.logger.warn('preset-workbench: re-declare "' + id + '" failed: ' + (e && e.message ? e.message : String(e))) } catch (_) {}
        return false
      }
    }

    /**
     * registry 侧的完整清单（含 isDefault 与组合行）；不可用时返回空数组。
     *
     * 带 3 秒 memo：切换器、模板下拉、能力目录、设置页列表都要它，连续操作时
     * 没必要每次都重建整份清单。预设的增删本身会走 redeclare/declare，
     * 那两条路径会主动清缓存，所以不会读到过期数据。
     */
    async function registryInventory() {
      const now = Date.now()
      if (invCache.rows !== null && now - invCache.at < 3000) return invCache.rows
      let rows = []
      try {
        const inv = await presets.compositionInventory()
        rows = Array.isArray(inv) ? inv : []
      } catch (_) { rows = [] }
      invCache = { at: now, rows: rows }
      return rows
    }

    async function dirForId(id) {
      return presetDirOf(id)
    }

    // ── 每工作区默认预设（workspace → preset 绑定）──────────────
    // 绑定表存在我们自己的 JSON 文件里（~/.dsh/preset-workbench/workspace-bindings.json），
    // 不碰 DSH 核心的 workspace 实体。key 是工作区目录的 canonical 路径。
    const BINDINGS_DIR = join(homedir(), '.dsh', 'preset-workbench')
    const BINDINGS_FILE = join(BINDINGS_DIR, 'workspace-bindings.json')

    function readBindings() {
      try {
        const raw = readFileSync(BINDINGS_FILE, 'utf8')
        const obj = JSON.parse(raw)
        if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
          const out = {}
          for (const k of Object.keys(obj)) {
            if (typeof k === 'string' && k !== '' && typeof obj[k] === 'string' && obj[k] !== '') out[k] = obj[k]
          }
          return out
        }
      } catch (_) {}
      return {}
    }

    function writeBindings(map) {
      try {
        mkdirSync(BINDINGS_DIR, { recursive: true })
        writeFileSync(BINDINGS_FILE, JSON.stringify(map, null, 2) + '\n', 'utf8')
      } catch (e) {
        throw new Error('绑定表写入失败: ' + (e && e.message ? e.message : String(e)))
      }
    }

    // 把任意路径拼写归一化成 canonical 形式（跟 workspaceRegistry 同一语义）。
    async function canonicalPath(p) {
      try {
        const t = await fs.resolve(String(p || ''))
        return fs.processPath(t)
      } catch (_) {
        return String(p || '')
      }
    }

    // 监听会话创建：该 cwd 有绑定、且会话当前用的是全局默认预设时，自动换绑到工作区预设。
    // 用户在 hero 手动选过的会话（header.agentPreset 已写 / composedPreset ≠ defaultId）绝不碰。
    ctx.effect(() => ctx.on('agent/created', ({ agent }) => {
      try {
        const session = agent.session
        if (!session || !session.header) return
        // 子代理/委派会话继承父会话，不做工作区换绑。
        if (session.header.origin === 'subagent' || session.header.parentSession) return
        const cwd = session.header.cwd
        if (!cwd) return
        const bindings = readBindings()
        const keys = Object.keys(bindings)
        if (keys.length === 0) return
        Promise.resolve(canonicalPath(cwd)).then(async function (canon) {
          let wanted
          for (const k of keys) {
            if (k === canon || canon.indexOf(k + '/') === 0 || canon.indexOf(k + '\\') === 0) { wanted = bindings[k]; break }
          }
          if (!wanted) return
          // 只对"还没开始过对话轮"的会话换绑（与官方 select 相同的 sessionBlank 语义），
          // 防止老会话恢复时被误换绑；官方 recompose 也要求 caller 自查这一点。
          if (session.events && session.events.some(function (ev) { return ev.type === 'turn/start' })) return
          // 只换"仍在全局默认预设上"的会话：手动选过的（header.agentPreset 已写）不动。
          if (session.header.agentPreset) return
          let current
          try { current = presets.composedPreset(agent.ctx) } catch (_) {}
          if (current === undefined) return
          if (current === wanted) return
          // 新版没有 defaultId getter：从 registry 的组合清单读 isDefault。
          // 若读不到默认（口径不明），就不改会话，宁可不生效也不误伤。
          const defId = (await registryInventory()).filter(function (p) { return p.isDefault })[0]
          if (!defId || current !== defId.id) return
          try {
            const preset = await presets.recompose(agent.ctx, wanted)
            session.append('agent-preset/selected', { agentPreset: preset.id })
            try { ctx.logger.info('preset-workbench: session "' + session.id + '" auto-bound to workspace preset "' + preset.id + '"') } catch (_) {}
          } catch (e) {
            try { ctx.logger.warn('preset-workbench: workspace auto-bind failed for "' + session.id + '": ' + (e && e.message ? e.message : String(e))) } catch (_) {}
          }
        }).catch(function () {})
      } catch (_) {}
    }), 'preset-workbench.workspace-bindings')

    // ── 绑定表的 RPC ops ──
    /** 读某会话当前的预设与排队中的切换。 */
    async function sessionPresetView(sessionId) {
      if (!sessionId) return { current: null, pending: null }
      const agent = agents && typeof agents.get === 'function' ? agents.get(sessionId) : undefined
      const current = agent === undefined
        ? null
        : (typeof presets.composedPreset === 'function' ? (presets.composedPreset(agent.ctx) ?? null) : null)
      // started：会话是否已经跑过一轮。没开始的一轮都还没跑的会话，切换可以立即生效；
      // 客户端用它决定「输入框上方的切换器」要不要显示（blank 会话走 hero 那一排）。
      let started = false
      if (agent !== undefined && sessionProjections && typeof sessionProjections.stateOf === 'function') {
        try {
          const boundary = sessionProjections.stateOf(agent.session, 'turnBoundary')
          started = boundary !== undefined && boundary !== null && (boundary.openTurnStartSeq !== null || boundary.lastTurn > 0)
        } catch (_) { started = false }
      }
      return { current: current, pending: pendingSwitch.get(sessionId) ?? null, started: started }
    }

    /**
     * 请求把某会话切到另一个预设。
     *
     * 还没开始任何一轮的会话可以立刻换（走 select，与新建会话选择器同一条路）；
     * 已经开始的只能排队，等下一次压缩结束后由 applyPendingSwitch 换绑。
     */
    async function requestSwitch(sessionId, presetId) {
      if (!sessionId) throw new Error('缺少 sessionId')
      if (!presetId) throw new Error('缺少 presetId')
      const agent = agents && typeof agents.get === 'function' ? agents.get(sessionId) : undefined
      if (agent === undefined) throw new Error('会话不在运行中，无法切换')
      try {
        await presets.select(agent, presetId)
        pendingSwitch.delete(sessionId)
        return { current: presetId, pending: null, immediate: true }
      } catch (e) {
        // agent-preset/locked：会话已经开始，只能排队到下次压缩。
        const msg = e && e.message ? String(e.message) : String(e)
        if (!/locked|already started/i.test(msg)) throw e
        pendingSwitch.set(sessionId, presetId)
        return { current: await sessionPresetView(sessionId).then((v) => v.current), pending: presetId, immediate: false }
      }
    }

    async function bindingsView() {
      const map = readBindings()
      const rows = []
      for (const ws of (wsRegistry ? wsRegistry.list() : [])) {
        const canon = await canonicalPath(ws.path)
        const pid = map[canon]
        rows.push({ path: canon, title: ws.title, preset: pid || '', exact: pid !== undefined })
      }
      // 目录不在当前工作区列表里但有绑定的（如已删除的工作区），也列出，标记 orphan。
      const listed = {}
      for (const r of rows) listed[r.path] = true
      for (const k of Object.keys(map)) {
        if (listed[k]) continue
        rows.push({ path: k, title: '', preset: map[k], exact: true, orphan: true })
      }
      return rows
    }

    // 设置/更新一个工作区绑定。路径存 canonical 形式；preset 必须真实存在。
    async function setBinding(path, presetId) {
      const canon = await canonicalPath(path)
      if (!canon) throw new Error('工作区路径为空')
      const known = isUserPresetId(presetId) ||
        (await registryInventory()).some(function (p) { return p.id === presetId })
      if (!known) throw new Error('找不到预设: ' + presetId)
      const map = readBindings()
      map[canon] = String(presetId)
      writeBindings(map)
      return { path: canon, preset: String(presetId) }
    }

    // 清除一个工作区绑定（幂等）。
    async function clearBinding(path) {
      const canon = await canonicalPath(path)
      const map = readBindings()
      // 兼容：也清掉以该路径为前缀的子目录绑定（目录改名/移动后留下的孤儿）。
      let removed = 0
      for (const k of Object.keys(map)) {
        if (k === canon || k.indexOf(canon + '/') === 0 || k.indexOf(canon + '\\') === 0) { delete map[k]; removed++ }
      }
      if (removed > 0) writeBindings(map)
      return { removed: removed }
    }

    /** 递归列出目录下的相对文件路径（正斜杠、已排序），跳过 .git/node_modules。 */
    function listFilesRel(root) {
      const out = []
      const walk = (dir) => {
        let ents
        try { ents = readdirSync(dir, { withFileTypes: true }) } catch (_) { return }
        for (const ent of ents) {
          if (ent.name === '.git' || ent.name === 'node_modules') continue
          const p = join(dir, ent.name)
          if (ent.isDirectory()) walk(p)
          else if (ent.isFile()) out.push(relative(root, p).split('\\').join('/'))
        }
      }
      walk(root)
      return out.sort()
    }

    /**
     * 判定一个预设与随包模板的关系。
     *
     * kind:
     *   'builtin' —— id 命中插件 templates/ 里的模板（目前只有 bare）
     *   'custom'  —— 其余，即用户自己创作的
     * modified:
     *   仅对 builtin 有意义。内容与模板不完全一致（文件集合或任一文件字节不同）
     *   时为 true —— 说明里面含用户自己加的东西，**不能假定它与模板一样公开安全**。
     */
    function classifyPreset(id) {
      const key = String(id)
      if (builtinTemplates().indexOf(key) < 0) return { kind: 'custom', modified: false, extra: 0 }
      let modified = false
      let extra = 0
      try {
        const tplDir = join(TEMPLATES_DIR, key)
        const userDir = presetDirOf(key)
        if (!existsSync(userDir)) return { kind: 'builtin', modified: true, extra: 0 }

        // 判定依据只看向一个方向：模板里的每个文件，在用户目录里是否都存在且逐字节相同。
        //
        // 为什么忽略"用户目录里多出来的文件"：loadPreset 只按 sections.json 加载段落
        // （没有自动发现机制）。因此你真正用到的内容，要么改动了模板里的文件，要么
        // 必然改动 sections.json —— 两种都会被上面这条规则抓到；而未被引用的多余文件
        // （例如测试残留）根本不会进入预设渲染，据此报"已改动"只会产生误报。
        const tplFiles = listFilesRel(tplDir)
        const userFiles = listFilesRel(userDir)
        const userSet = {}
        for (const f of userFiles) userSet[f] = true

        for (const f of tplFiles) {
          if (!userSet[f]) { modified = true; continue }
          let a, b
          try {
            a = readFileSync(join(tplDir, f))
            b = readFileSync(join(userDir, f))
          } catch (_) { modified = true; continue }
          if (!a.equals(b)) modified = true
        }
        for (const f of userFiles) if (tplFiles.indexOf(f) < 0) extra++
      } catch (_) {
        modified = true
      }
      return { kind: 'builtin', modified: modified, extra: extra }
    }

    async function userList() {
      // 用户预设 = 磁盘上真实存在的预设目录（新版 registry 不再提供 path/trust）。
      const out = []
      for (const u of scanUserDirs()) {
        const meta = readPresetMeta(u.dir)
        const cls = classifyPreset(u.id)
        out.push({
          id: u.id,
          path: u.dir.split('\\').join('/'),
          broken: !u.hasComposition,
          name: meta.name,
          description: meta.description,
          declared: declared.has(u.id),
          kind: cls.kind,
          modified: cls.modified,
          extra: cls.extra,
        })
      }
      return out
    }

    // ── 显示覆盖（本地别名 / 简介）────────────────────────────────────────
    //
    // 官方或第三方声明的预设在磁盘上没有目录，既没有 preset.yml 也没有段落文件，
    // 想给它改名字或写一句简介，只能把覆盖存在本插件自己的目录里 —— 这不改动那份
    // 声明，也不写进 DSH 的任何配置，纯粹是本机的显示层。
    function displayOverridePath() {
      return join(DSH_HOME, 'preset-workbench', 'display-overrides.json')
    }

    function readDisplayOverrides() {
      try {
        const raw = readFileSync(displayOverridePath(), 'utf8')
        const parsed = JSON.parse(raw)
        return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {}
      } catch (_) { return {} }
    }

    function writeDisplayOverrides(map) {
      const dir = join(DSH_HOME, 'preset-workbench')
      try { mkdirSync(dir, { recursive: true }) } catch (_) {}
      writeFileSync(displayOverridePath(), JSON.stringify(map, null, 2) + '\n', 'utf8')
    }

    /** 把覆盖套到一条 { id, name, description } 上（空字符串视为"清掉"）。 */
    function applyDisplayOverride(row, overrides) {
      if (!row || typeof row.id !== 'string') return row
      const ov = overrides[row.id]
      if (!ov) return row
      const out = Object.assign({}, row)
      if (typeof ov.name === 'string' && ov.name !== '') out.name = ov.name
      if (typeof ov.description === 'string' && ov.description !== '') out.description = ov.description
      out.hasOverride = true
      return out
    }

    async function setDisplayOverride(id, name, description) {
      const overrides = readDisplayOverrides()
      const next = Object.assign({}, overrides[id] || {})
      if (name !== undefined && name !== null) {
        const v = String(name).trim()
        if (v === '') delete next.name
        else next.name = v.slice(0, 60)
      }
      if (description !== undefined && description !== null) {
        const v = String(description).trim()
        if (v === '') delete next.description
        else next.description = v
      }
      if (next.name === undefined && next.description === undefined) delete overrides[id]
      else overrides[id] = next
      writeDisplayOverrides(overrides)
      // 清掉两份清单缓存，改名立刻反映到列表与切换器
      rosterCache = { at: 0, rows: null }
      invCache = { at: 0, rows: null }
      const row = applyDisplayOverride({ id: id, name: '', description: '' }, overrides)
      return { ok: true, name: row.name || '', description: row.description || '', local: true }
    }

    async function allPresets() {
      // 用户预设来自磁盘；其余（官方/第三方声明）来自 registry 的组合清单。
      const inv = await registryInventory()
      const byId = {}
      for (const p of inv) byId[p.id] = p

      const overrides = readDisplayOverrides()
      const out = []
      const seen = {}
      for (const u of scanUserDirs()) {
        const meta = readPresetMeta(u.dir)
        const r = byId[u.id]
        const cls = classifyPreset(u.id)
        seen[u.id] = true
        out.push({
          id: u.id,
          path: u.dir.split('\\').join('/'),
          broken: !u.hasComposition,
          name: meta.name !== undefined ? meta.name : (r && r.name),
          description: meta.description !== undefined ? meta.description : (r && r.description),
          isDefault: !!(r && r.isDefault),
          readonly: false,
          declared: declared.has(u.id),
          kind: cls.kind,
          modified: cls.modified,
          extra: cls.extra,
        })
      }
      for (const p of inv) {
        if (seen[p.id]) continue
        out.push({
          id: p.id,
          path: '',
          broken: !!p.broken,
          name: p.name,
          description: p.description,
          isDefault: !!p.isDefault,
          readonly: true,
          declared: true,
          kind: 'external', // 由官方或第三方插件声明，磁盘上没有目录
          modified: false,
          extra: 0,
        })
      }
      return out.map(function (row) { return applyDisplayOverride(row, overrides) })
    }

    // ── 试挂载「新会话默认」（registry 的 isDefault）。 */
    async function isDefaultPreset(id) {
      const inv = await registryInventory()
      for (const p of inv) if (p.id === id) return !!p.isDefault
      return false
    }

    async function templateList() {
      // 内置模板不单独成组：本机已有同名用户预设时直接用人家的，
      // 没有时才把内置模板并入“用户”组（新机器上它们就是可选的用户模板）。
      // 每项都带 description：新建页选中模板后要像查看页一样显示它的信息。
      const pres = []
      const userIds = {}
      const builtins = builtinTemplates()
      for (const u of scanUserDirs()) {
        const meta = readPresetMeta(u.dir)
        pres.push({ id: u.id, name: meta.name, description: meta.description, source: 'user', builtin: builtins.indexOf(u.id) >= 0 })
        userIds[u.id] = true
      }
      for (const p of await registryInventory()) {
        if (userIds[p.id]) continue
        pres.push({ id: p.id, name: p.name, description: p.description, source: 'system' })
      }
      for (const id of builtins) {
        if (userIds[id]) continue
        let name, description
        try {
          const yml = readFileSync(join(TEMPLATES_DIR, id, 'preset.yml'), 'utf8')
          const m = /^name:\s*(.+)$/m.exec(yml)
          if (m) name = m[1].trim()
          const d = /^description:\s*(.+)$/m.exec(yml)
          if (d) description = d[1].trim()
        } catch (_) {}
        pres.push({ id: id, name: name, description: description, source: 'user', builtin: true })
      }
      return pres.map(function (row) { return applyDisplayOverride(row, readDisplayOverrides()) })
    }

    async function assertUserEditable(id) {
      if (isUserPresetId(id)) return
      throw new Error('拒绝操作：只允许编辑用户预设，系统预设不可写')
    }

    async function readTextSmart(path) {
      const target = await fs.resolve(path)
      return await fs.readText(target)
    }

    async function writeTextSmart(path, content) {
      const target = await fs.resolve(path)
      try {
        await fs.writeText(target, content)
        return 'ok'
      } catch (e1) {
        const sp = sandboxPolicy
        if (sp !== undefined && sp !== null && typeof sp.resolve === 'function') {
          let policy
          try { policy = sp.resolve({ mode: 'danger-full-access' }) } catch (_) { policy = sp.resolve({}) }
          await fs.writeText(target, content, undefined, undefined, policy)
          return 'ok'
        }
        throw e1
      }
    }

    /**
     * 平台 → 打开目录的命令与参数（纯函数，便于测试）。
     * @param platform process.platform
     * @param dir 绝对路径
     */
    function folderOpenPlan(platform, dir) {
      const target = String(dir || '')
      if (target === '') throw new Error('目录为空')
      if (platform === 'win32') return { command: 'explorer.exe', args: [target] }
      if (platform === 'darwin') return { command: 'open', args: [target] }
      return { command: 'xdg-open', args: [target] }
    }

    /**
     * 用系统文件管理器打开预设目录。
     *
     * 这里直接走 node:child_process，**不经过 DSH 的 subprocess 服务**：
     * 那个服务会给子进程加 windowsHide（映射成 CREATE_NO_WINDOW），而 explorer.exe 是
     * GUI 进程 —— 结果就是进程起来了、退出码正常，但文件夹窗口被藏起来，用户看到的是
     * 「点了没反应」。去掉那个标志后窗口正常弹出。
     *
     * 进程一次性、detached、不持有 stdio：explorer 是常驻进程，等它等于永不返回。
     * 返回的是「已发起」，不代表窗口已经出现。
     */
    async function revealPreset(id) {
      await assertUserEditable(id)
      const dir = await dirForId(id)
      const target = dir.split('/').join('\\')
      let plan
      try {
        plan = folderOpenPlan(process.platform, target)
      } catch (e) {
        throw new Error('无法打开目录: ' + (e && e.message))
      }
      const child = spawnChild(plan.command, plan.args, { detached: true, stdio: 'ignore' })
      if (child && typeof child.on === 'function') child.on('error', function () {})
      if (child && typeof child.unref === 'function') child.unref()
      return { opened: true, dir: target }
    }

    /**
     * 读一个预设的段落清单。用户预设读磁盘目录；模板（插件自带）读 templates/，
     * 这样新建页能就地展开模板提示词而不必先复制一份。
     */
    /**
     * 改预设的展示信息（preset.yml 里的 name / description）。
     *
     * 只动这两行，其余键（order 等）原样保留，不给用户「为了改个名字去开记事本」的
     * 理由。值里若有 YAML 特殊字符，按需加双引号，避免写坏文件。
     * @param id 预设 id
     * @param name 新显示名（空 = 不改）
     * @param description 新简介（空字符串 = 清空该行）
     */
    async function setPresetMeta(id, name, description) {
      await assertUserEditable(id)
      const dir = await dirForId(id)
      const file = dir + '/' + METADATA_FILE
      let lines = []
      try { lines = String(await readTextSmart(file)).split(/\r?\n/) } catch (_) { lines = [] }

      const yamlValue = function (v) {
        const str = String(v === undefined || v === null ? '' : v).replace(/\r?\n/g, ' ').trim()
        if (str === '') return ''
        // 需要引号的情况：含 YAML 指示符、或以特殊字符开头
        return /[:#]|^[\[\]{}&*!|>'"%@`,?-]/.test(str) ? '"' + str.replace(/"/g, '\\"') + '"' : str
      }

      const nextName = (name === undefined || name === null || String(name).trim() === '') ? null : String(name).trim()
      if (nextName !== null && nextName.length > 60) throw new Error('名字太长（最多 60 字）')
      const nextDesc = (description === undefined || description === null) ? null : String(description).trim()

      let sawName = false
      let sawDesc = false
      const out = []
      for (const line of lines) {
        if (/^name\s*:/.test(line)) {
          sawName = true
          if (nextName !== null) out.push('name: ' + yamlValue(nextName))
          else out.push(line)
          continue
        }
        if (/^description\s*:/.test(line)) {
          sawDesc = true
          if (nextDesc !== null) {
            if (nextDesc !== '') out.push('description: ' + yamlValue(nextDesc))
            // 清空简介 → 整行删掉
          } else out.push(line)
          continue
        }
        out.push(line)
      }
      if (nextName !== null && !sawName) out.unshift('name: ' + yamlValue(nextName))
      if (nextDesc !== null && nextDesc !== '' && !sawDesc) {
        while (out.length > 0 && out[out.length - 1].trim() === '') out.pop()
        out.push('description: ' + yamlValue(nextDesc))
      }

      while (out.length > 0 && out[out.length - 1].trim() === '') out.pop()
      await writeTextSmart(file, out.join('\n') + '\n')
      await redeclarePreset(id)
      const meta = readPresetMeta(dir)
      return { ok: true, name: meta.name || '', description: meta.description || '' }
    }

    async function loadPreset(id) {
      const dir = isUserPresetId(id)
        ? await dirForId(id)
        : join(TEMPLATES_DIR, String(id))
      let raw = null
      try { raw = await readTextSmart(dir + '/sections.json') } catch (_) {}
      if (raw) {
        try {
          const manifest = JSON.parse(raw)
          if (Array.isArray(manifest)) {
            const sections = []
            for (const e of manifest) {
              if (!e || typeof e.file !== 'string' || e.file === '') continue
              let text = ''
              try { text = await readTextSmart(dir + '/' + e.file) } catch (_) {}
              sections.push({ file: e.file, title: e.title || e.file, enabled: e.enabled !== false, text: text })
            }
            return { hasManifest: true, isSystem: false, sections: sections, meta: applyDisplayOverride(Object.assign({ id: id }, readPresetMeta(dir)), readDisplayOverrides()) }
          }
        } catch (_) {}
      }
      let legacy = ''
      try { legacy = await readTextSmart(dir + '/persona.md') } catch (_) {}
      const legacySections = []
      if (legacy) legacySections.push({ file: 'persona.md', title: '提示词（旧版单文件）', enabled: true, text: legacy })
      // 非用户预设（官方/第三方声明）：没有分段提示词文件（能力开关会读组合行展示），只标记只读。
      if (!isUserPresetId(id)) {
        return { hasManifest: false, isSystem: true, sections: legacySections, meta: applyDisplayOverride(Object.assign({ id: id }, readPresetMeta(dir)), readDisplayOverrides()) }
      }
      return { hasManifest: false, isSystem: false, sections: legacySections, meta: applyDisplayOverride(Object.assign({ id: id }, readPresetMeta(dir)), readDisplayOverrides()) }
    }

    /**
     * 把一段（通常来自模板的）提示词另存为新预设。
     *
     * 与「先 create 复制目录、再回编辑页 save」的区别：模板的段落内容直接进新
     * 目录，用户在新建页改完就能存。模板目录只读，绝不写入。
     */
    async function savePresetAs(id, name, sections, caps, template, lang, removed) {
      const L = (lang === 'en') ? 'en' : 'zh'
      const msg = function (key, sub) {
        const rows = n_err[key] || {}
        const out = rows[L] || rows.zh || key
        return sub === undefined ? out : out.replace('{0}', String(sub))
      }
      if (!RE_PRESET_ID.test(String(id || ''))) throw new Error(msg('badId'))
      if (!Array.isArray(sections)) throw new Error('sections 必须是数组')
      const dir = presetDirOf(id)
      if (existsSync(dir)) throw new Error(msg('idExists', id))
      const tplId = (typeof template === 'string' && template !== '') ? String(template) : ''
      const srcDir = tplId === '' ? '' : sourceDirOf(tplId)
      // 来源没有可复制的目录（声明式预设）→ 现在直接拒绝，而不是存出一个没有组合文件的空壳。
      if (tplId !== '' && srcDir === '') throw new Error(msg('noSrcCopy', tplId))
      let wrote = 0
      try {
        // 来源整份先落地：组合文件、persona-file.mjs / persona.md 等随行文件
        // 随行文件都跟着过来。只写组合「文本」是不够的——组合里的 `name: ./persona-file.mjs`
        // 指向的文件不在，预设照样挂不起来。
        if (srcDir !== '') cpSync(srcDir, dir, { recursive: true })
        else mkdirSync(dir, { recursive: true })
        // 来源自带的段落文件整批作废：sections.json 才是唯一清单，留着旧段落文件只会变成
        // 「多余文件」，还会让来源徽章误判。
        for (const ent of readdirSync(dir, { withFileTypes: true })) {
          if (!ent.isFile()) continue
          if (/^section\..*\.md$/.test(ent.name)) rmSync(join(dir, ent.name), { force: true })
        }
        const manifest = []
        for (const sec of sections) {
          if (!sec || typeof sec.text !== 'string' || sec.text.trim() === '') continue
          const file = 'section.' + String(manifest.length + 1).padStart(2, '0') + '.md'
          writeFileSync(join(dir, file), sec.text.replace(/\s+$/, '') + '\n', 'utf8')
          manifest.push({ file: file, title: String(sec.title || file).slice(0, 40), enabled: sec.enabled !== false })
          wrote++
        }
        // 没有段落也是合法预设（bare 这类模板本来就是空清单）：只要带了组合文件就允许保存。
        if (wrote === 0 && tplId === '') {
          throw new Error(msg('emptyContent'))
        }
        writeFileSync(join(dir, 'sections.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8')
        // 组合文件：以来源的组合为底稿，按勾选增删能力块（覆盖刚拷来的那一份）。
        if (srcDir !== '') {
          const base = await readCompositionText(tplId)
          if (base.trim() !== '') {
            writeFileSync(join(dir, COMPOSITION_FILE), applyCapsToComposition(base, Array.isArray(caps) ? caps : [], Array.isArray(removed) ? removed : undefined), 'utf8')
          }
        }
        // 硬校验：没有组合文件 = 挂不起来的预设。宁可不落盘，也不要静默存出一个「损坏」预设。
        let comp = ''
        try { comp = readFileSync(join(dir, COMPOSITION_FILE), 'utf8') } catch (_) { comp = '' }
        if (comp.trim() === '') throw new Error(msg('noComposition'))
        // 元数据：名字换成你的，order 固定 99（另存出来的排在最后），其余字段沿用来源。
        const disp = (typeof name === 'string' && name !== '') ? name : String(id)
        writeFileSync(join(dir, METADATA_FILE), writePresetMeta(dir, disp), 'utf8')
      } catch (e) {
        try { if (existsSync(dir)) rmSync(dir, { recursive: true, force: true }) } catch (_) {}
        throw e
      }
      // 新预设立即声明，不必重启就能在 DSH 的预设选择器里出现。
      try { await declarePreset(String(id)) } catch (_) {}
      return { id: String(id), wrote: wrote }
    }

    async function savePreset(id, sections) {
      await assertUserEditable(id)
      if (!Array.isArray(sections)) throw new Error('sections 必须是数组')
      const dir = await dirForId(id)
      const manifest = []
      for (const s of sections) {
        if (!s || typeof s.text !== 'string') continue
        let file = typeof s.file === 'string' ? s.file : ''
        if (!file || !FILE_OK.test(file) || file.indexOf('..') >= 0) file = 'section.' + Date.now() + '-' + manifest.length + '.md'
        await writeTextSmart(dir + '/' + file, s.text.replace(/\s+$/, '') + '\n')
        manifest.push({ file: file, title: String(s.title || file).slice(0, 40), enabled: s.enabled !== false })
      }
      await writeTextSmart(dir + '/sections.json', JSON.stringify(manifest, null, 2) + '\n')
      // 段落文本改动后重新声明，让新的提示词立即进入挂载（不必重启）。
      await redeclarePreset(id)
      return { wrote: manifest.length }
    }

    async function userPresetsRoot() {
      return USER_PRESET_ROOT.split('\\').join('/')
    }

    /** 复制一个已有预设目录到新 id（纯文件系统，替代已移除的 registry.copy）。 */
    function copyPresetDir(srcId, dstId) {
      const srcDir = presetDirOf(srcId)
      if (!existsSync(srcDir)) throw new Error('源预设不存在: ' + srcId)
      const dstDir = presetDirOf(dstId)
      if (existsSync(dstDir)) throw new Error('预设 id 已被占用: ' + dstId)
      try {
        mkdirSync(USER_PRESET_ROOT, { recursive: true })
        cpSync(srcDir, dstDir, { recursive: true })
      } catch (e) {
        try { if (existsSync(dstDir)) rmSync(dstDir, { recursive: true, force: true }) } catch (_) {}
        throw e
      }
      return dstDir
    }

    async function createFromBuiltin(id, displayName, tpl) {
      const target = presetDirOf(id)
      if (existsSync(target)) throw new Error('预设 id 已被占用: ' + id)
      const srcDir = join(TEMPLATES_DIR, tpl)
      if (!existsSync(srcDir)) throw new Error('内置模板不存在: ' + tpl)
      try {
        mkdirSync(target, { recursive: true })
        cpSync(srcDir, target, { recursive: true })
        const ymlPath = join(target, 'preset.yml')
        if (existsSync(ymlPath)) {
          let text = readFileSync(ymlPath, 'utf8')
          const disp = typeof displayName === 'string' && displayName !== '' ? displayName : tpl
          if (/^name:.*$/m.test(text)) text = text.replace(/^name:.*$/m, 'name: ' + disp)
          else text = 'name: ' + disp + '\n' + text
          writeFileSync(ymlPath, text, 'utf8')
        }
      } catch (e) {
        try { if (existsSync(target)) rmSync(target, { recursive: true, force: true }) } catch (_) {}
        throw e
      }
      // 新预设立即声明，使其无需重启即可在 DSH 的预设选择器里出现。
      try { await declarePreset(String(id)) } catch (_) {}
      return { id: String(id), path: target.split('\\').join('/') }
    }

    async function createPreset(id, name, from, lang) {
      const L = (lang === 'en') ? 'en' : 'zh'
      const e = function (key, sub) {
        const rows = n_err[key] || {}
        let out = rows[L] || rows.zh
        if (sub !== undefined) out = out.replace(/\{0\}/g, sub)
        return out
      }
      if (!/^[a-z0-9][a-z0-9-]*$/.test(String(id || ''))) throw new Error(e('badId'))
      const raw = (typeof from === 'string' && from !== '') ? from : ''
      // 来源前缀：builtin:<id> 用插件内置模板；user:<id>/裸 id 用本机已有预设
      if (raw.indexOf('builtin:') === 0) {
        const tpl = raw.slice('builtin:'.length)
        if (builtinTemplates().indexOf(tpl) < 0) throw new Error(e('noBuiltin', tpl))
        return await createFromBuiltin(String(id), name, tpl)
      }
      let src = raw.indexOf('user:') === 0 ? raw.slice('user:'.length) : (raw.indexOf('system:') === 0 ? raw.slice('system:'.length) : raw)
      // 可复制来源：磁盘上的用户预设目录，或插件内置模板。
      // 新版 registry 里的预设（官方/第三方）是 composition 声明，没有磁盘目录，不可复制。
      const diskIds = {}
      for (const u of scanUserDirs()) diskIds[u.id] = true
      const regIds = {}
      for (const p of await registryInventory()) regIds[p.id] = true
      const builtins = builtinTemplates()
      const have = Object.assign({}, regIds, diskIds)

      // ── 目标 id 占用预检：抛我们自己的双语报错，不让宿主那句英文漏到界面 ──
      if (have[String(id)]) throw new Error(e('idExists', String(id)))
      if (!src) {
        // 可移植回退：优先本机同名用户预设，其次内置模板。
        for (const cand of ['bare', 'minimal', 'standard']) {
          if (diskIds[cand] || builtins.indexOf(cand) >= 0) { src = cand; break }
        }
        if (!src && builtins.length > 0) src = builtins[0]
        if (!src) throw new Error(e('noTemplate'))
      }
      // 优先级 1：磁盘上的预设目录 → 直接目录复制（保留段落文件与 sections.json）
      if (diskIds[src]) {
        const dir = copyPresetDir(src, String(id))
        if (typeof name === 'string' && name !== '') {
          const ymlPath = join(dir, METADATA_FILE)
          try {
            let text = existsSync(ymlPath) ? readFileSync(ymlPath, 'utf8') : ''
            if (/^name:.*$/m.test(text)) text = text.replace(/^name:.*$/m, 'name: ' + name)
            else text = 'name: ' + name + '\n' + text
            writeFileSync(ymlPath, text, 'utf8')
          } catch (_) {}
        }
        try { await declarePreset(String(id)) } catch (_) {}
        return { id: String(id), path: dir.split('\\').join('/') }
      }
      // 优先级 2：内置模板
      if (builtins.indexOf(src) >= 0) return await createFromBuiltin(String(id), name, src)
      // 优先级 3：registry 里的声明式预设——没有磁盘目录，无法复制
      throw new Error(e('noSrcCopy', src))
    }

    async function deletePreset(id) {
      await assertUserEditable(id)
      // 先撤声明再删目录：避免 registry 持有一个已被删除目录的挂载。
      await undeclarePreset(id)
      const dir = presetDirOf(id)
      try {
        rmSync(dir, { recursive: true, force: true })
      } catch (e) {
        throw new Error('删除失败: ' + (e && e.message ? e.message : String(e)))
      }
      return { removed: id }
    }

    async function validatePreset(id) {
      // 验证 = 解析 composition + 声明给 registry。成功即顺手修好该预设的可见性。
      try {
        buildDefinition(id)
        if (!declared.has(id)) await declarePreset(id)
        return { ok: true }
      } catch (e) {
        return { ok: false, error: e && e.message ? e.message : String(e) }
      }
    }

    // 官方预设组合行里属于"地基"的模块（不可取消）：人设、压缩体系、命令注册器。
    function isCapCore(moduleName) {
      const mod = String(moduleName || '')
      // command-compact 只注册 /compact 命令，关掉不影响自动压缩 → 允许关闭。
      if (/command-compact/.test(mod)) return false
      return /persona|compaction|-command-/.test(mod)
    }

    async function capabilityList(id, lang) {
      const dir = await dirForId(id)
      let text = ''
      try { text = await readTextSmart(dir + '/' + COMPOSITION_FILE) } catch (_) {}
      const en = lang === 'en'
      // 用户预设 = 磁盘上有目录的预设；其余（官方/第三方声明）视为只读。
      const isUser = isUserPresetId(id)
      // 当前预设的实体组合行（用于识别"地基"模块并展示）。
      let rows = []
      const inv = await registryInventory()
      const found = inv.filter(function (x) { return x.id === id })[0]
      if (found && Array.isArray(found.rows)) rows = found.rows
      const toRow = function (row, i) {
        const mod = String(row.moduleName || '')
        const short = mod.indexOf('/') >= 0 ? mod.slice(mod.lastIndexOf('/') + 1) : mod
        return {
          id: 'row-' + i + '-' + short,
          title: short,
          desc: mod,
          enabled: row.enabled !== false,
          locked: isCapCore(mod),
          kind: /command-compact/.test(mod) ? 'rowToggle' : 'core',
          module: mod,
          dormant: false,
        }
      }
      // 非用户预设（官方/第三方）：全部组合行都作为能力开关项（整体只读，地基更标 🔒 禁勾）。
      if (!isUser) {
        return rows.map(toRow)
      }
      // 用户预设：地基行（锁定）+ CAPS 可选项。
      const mapped = rows.map(toRow)
      const coreRows = mapped.filter(function (x) { return x.locked })
      const toggleRows = mapped.filter(function (x) { return x.kind === 'rowToggle' })
      const capRows = CAPS.map(function (c) {
        return {
          id: c.id,
          title: en && c.en_title ? c.en_title : c.title,
          desc: en && c.en_desc ? c.en_desc : c.desc,
          enabled: capStateInComposition(c.id, text).enabled,
          dormant: !!c.dormant || capStateInComposition(c.id, text).dormant,
          locked: false,
          kind: 'cap',
        }
      })
      return coreRows.concat(toggleRows).concat(capRows)
    }

    /**
     * 试挂载一个能力的组合行，判断本部署是否真的支持它。
     *
     * 用一个临时 id 声明后立即撤销：由 DSH 自己校验「包是否存在、依赖服务是否可用、
     * config 是否符合 schema」，比我们离线猜包名/服务名可靠得多——新版 DSH 就把
     * codeRuntime 改名为 ptcRuntime、把 workflow-worker-thread 换成了 workflow-ptc，
     * 这类变动只有运行时才知道。探针在写入之前跑，所以不支持的开启请求永远不会弄坏预设。
     */
    /**
     * 按能力 id 列表改写一份组合 YAML 文本。
     *
     * 与 setCapability 用的是同一对标记（# pw-cap-start/end），因此磁盘上写出来的
     * 结果和「先建预设再逐项勾选」完全一致，没有第二套格式。
     * @param text 基础组合文本（来自模板或已有预设）
     * @param enabledIds 需要开启的能力 id
     * @returns 改写后的文本
     */
    /**
     * 删掉某能力的顶层行块。嵌套在 cordis 分组里的行不动（删了会破坏分组）。
     * @param text 组合文本
     * @param capId 能力 id
     */
    function stripCapRows(text, capId) {
      const lines = String(text || '').split('\n')
      const spans = compositionRowSpans(lines.join('\n'))
        .filter(function (row) { return row.indent === 0 && rowMatchesCap(capId, row.text) })
      if (spans.length === 0) return lines.join('\n')
      for (const span of spans.sort(function (a, b) { return b.start - a.start })) {
        lines.splice(span.start, span.end - span.start + 1)
      }
      // 顺手收掉连续空行
      return lines.join('\n').replace(/\n{3,}/g, '\n\n')
    }

    function applyCapsToComposition(text, enabledIds, removedIds) {
      let out = String(text || '')
      const want = new Set(Array.isArray(enabledIds) ? enabledIds.map(String) : [])
      // removedIds 有值时只删这些（用户在界面上主动取消的）；否则沿用旧语义（不在 want 里就删）。
      const gone = Array.isArray(removedIds) ? new Set(removedIds.map(String)) : null
      for (const cap of CAPS) {
        const start = PW_CAP_START(cap.id)
        const end = PW_CAP_END(cap.id)
        const at = out.indexOf(start)
        const on = want.has(cap.id)
        if (on) {
          // 已有标记块，或组合里本来就存在这个能力 → 不重复追加
          if (at >= 0) continue
          if (capStateInComposition(cap.id, out).enabled) continue
          out = out.replace(/\s+$/, '') + '\n\n' + start + '\n' + cap.block + end + '\n'
        } else if (at >= 0) {
          const e = out.indexOf(end, at)
          const after = e >= 0 ? e + end.length : at + start.length
          out = out.slice(0, Math.max(0, at - 1)) + out.slice(after)
          out = stripCapRows(out, cap.id)
        } else if (gone === null || gone.has(cap.id)) {
          // 模板自带的原生行：只有用户明确取消（或旧调用没传 removed）时才删。
          out = stripCapRows(out, cap.id)
        }
      }
      // bare 这类模板在装配阶段把工具表清空（noTools: true）。勾了任何能力就把它关掉，
      // 否则用户勾了工具却看不到工具。
      if (want.size > 0 && /noTools:\s*true/.test(out)) out = out.replace(/noTools:\s*true/g, 'noTools: false')
      return out
    }

    /** 读模板/预设的组合文件文本（新建页拿它当底稿）。 */
    async function readCompositionText(id) {
      if (isUserPresetId(id)) {
        const dir = await dirForId(id)
        try { return await readTextSmart(dir + '/' + COMPOSITION_FILE) } catch (_) { return '' }
      }
      try { return readFileSync(join(TEMPLATES_DIR, String(id), COMPOSITION_FILE), 'utf8') } catch (_) { return '' }
    }

    /**
     * 新建页的底稿：模板的段落 + 组合文本里已开启的能力。
     * @param id 模板或已有预设的 id
     * @param lang 界面语言
     */
    /**
     * 每个能力的「在场判定」。
     *
     * 以前只认 `# pw-cap-start:<id>` 标记——可那套标记是本插件写进用户预设的，
     * 内置模板是手写的，没有任何标记，于是「选模板」时能力一个都没勾上。
     * 这里补上按真实模块行判断：`any` 命中任一模块即算在场；`require` 用于区分
     * 同一模块的不同用法（subagent 的 provider: spawn / fork / codex / claude-code）。
     */
    const CAP_MATCH = {
      web: { any: [/@deepseek-ai\/dsh-tool-web\b/] },
      fs: { any: [/@deepseek-ai\/dsh-tool-fs\b/, /@deepseek-ai\/dsh-tool-fs-search\b/, /@deepseek-ai\/dsh-fs-local\b/, /@deepseek-ai\/dsh-tool-str-replace-editor\b/] },
      ask: { any: [/@deepseek-ai\/dsh-tool-ask-user\b/] },
      todo: { any: [/@deepseek-ai\/dsh-tool-todo\b/] },
      jobs: { any: [/@deepseek-ai\/dsh-tool-jobs\b/] },
      goal: { any: [/@deepseek-ai\/dsh-tool-goal\b/, /@deepseek-ai\/dsh-command-goal\b/] },
      skills: { any: [/@deepseek-ai\/dsh-skill-filesystem\b/, /@deepseek-ai\/dsh-tool-skill\b/] },
      subagents: { any: [/@deepseek-ai\/dsh-tool-subagent\b/], require: [/provider:\s*(spawn|fork)\b/] },
      workflows: { any: [/@deepseek-ai\/dsh-workflow-ptc\b/, /@deepseek-ai\/dsh-tool-workflow\b/, /@deepseek-ai\/dsh-tool-ralph\b/] },
      plan: { any: [/@deepseek-ai\/dsh-plan-mode\b/] },
      instructions: { any: [/@deepseek-ai\/dsh-agent-instructions\b/] },
      presentation: { any: [/@deepseek-ai\/dsh-agent-tool-presentation\b/] },
      cordis: { any: [/@deepseek-ai\/dsh-tool-cordis\b/] },
      codex: { any: [/@deepseek-ai\/dsh-tool-subagent\b/], require: [/provider:\s*codex\b/] },
      'claude-code': { any: [/@deepseek-ai\/dsh-tool-subagent\b/], require: [/provider:\s*claude-code\b/] },
      shell12: { any: [/@deepseek-ai\/dsh-tool-bash\b/, /@deepseek-ai\/dsh-tool-pwsh\b/, /@deepseek-ai\/dsh-terminal\b/] },
    }

    /**
     * 把组合文本按 `- id:` 切成行块，带上起止行号与缩进。
     * 缩进(row.indent)决定这一行能不能单独删掉：顶层行可以，嵌在分组里的不行。
     */
    function compositionRowSpans(composition) {
      const lines = String(composition || '').split('\n')
      const spans = []
      let cur = null
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (/^\s*- id:/.test(line)) {
          if (cur !== null) { cur.end = i - 1; spans.push(cur) }
          const indent = (line.match(/^\s*/) || [''])[0].length
          cur = { start: i, end: lines.length - 1, indent: indent, text: line }
          continue
        }
        if (cur !== null) cur.text += '\n' + line
      }
      if (cur !== null) spans.push(cur)
      return spans
    }

    /** 这一行块是否命中某能力（模块名 + 必要的 provider 限定）。 */
    function rowMatchesCap(capId, rowText) {
      const rule = CAP_MATCH[capId]
      if (rule === undefined) return false
      let hit = false
      for (const re of rule.any) { if (re.test(rowText)) { hit = true; break } }
      if (!hit) return false
      if (rule.require !== undefined) {
        let reqHit = false
        for (const re of rule.require) { if (re.test(rowText)) { reqHit = true; break } }
        if (!reqHit) return false
      }
      return true
    }

    /** 把组合文本按 `- id:` 切成行块（保留原文，便于继续匹配 config）。 */
    function compositionRows(composition) {
      const lines = String(composition || '').split('\n')
      const rows = []
      let cur = null
      for (const line of lines) {
        if (/^\s*- id:/.test(line)) {
          if (cur !== null) rows.push(cur.join('\n'))
          cur = [line]
          continue
        }
        if (cur !== null) cur.push(line)
      }
      if (cur !== null) rows.push(cur.join('\n'))
      return rows
    }

    /**
     * 判断某能力在当前组合里是否在场。
     * @returns { enabled: boolean, dormant: boolean } dormant = 只有 disabled 的接线
     */
    function capStateInComposition(capId, composition) {
      const text = String(composition || '')
      if (text.indexOf(PW_CAP_START(capId)) >= 0) {
        return { enabled: true, dormant: false, removable: true }
      }
      const rule = CAP_MATCH[capId]
      if (rule === undefined) return { enabled: false, dormant: false, removable: false }
      let sawDisabled = false
      let sawEnabled = false
      const matched = compositionRowSpans(text).filter(function (row) { return rowMatchesCap(capId, row.text) })
      // 只有全部命中行都在顶层（缩进 0）时，才能整块删掉而不破坏分组结构。
      const removable = matched.length > 0 && matched.every(function (row) { return row.indent === 0 })
      for (const row of matched) {
        if (/^\s*disabled:\s*true\s*$/m.test(row.text)) { sawDisabled = true; continue }
        sawEnabled = true
        break
      }
      return { enabled: sawEnabled, dormant: !sawEnabled && sawDisabled, removable: removable }
    }

    async function templateDraft(id, lang) {
      const loaded = await loadPreset(id)
      const composition = await readCompositionText(id)
      const en = lang === 'en'
      const caps = CAPS.map(function (c) {
        return {
          id: c.id,
          title: en && c.en_title ? c.en_title : c.title,
          desc: en && c.en_desc ? c.en_desc : c.desc,
          enabled: capStateInComposition(c.id, composition).enabled,
          dormant: !!c.dormant || capStateInComposition(c.id, composition).dormant,
          removable: capStateInComposition(c.id, composition).removable,
        }
      })
      return {
        id: String(id),
        sections: loaded.sections || [],
        caps: caps,
        hasComposition: composition.trim() !== '',
      }
    }

    /**
     * 会话内切换器用的轻量清单：只要 id / 名字 / 描述。
     *
     * 为什么不用 list：list 会对每个预设跑 classifyPreset —— 递归列目录并逐文件
     * 逐字节比对模板，十几个预设加起来要读几百 KB、上百次 stat，点开下拉框就是几秒
     * 的卡顿。这里跳过分类，并且加 10 秒缓存，连续点开是即时的。
     */
    let rosterCache = { at: 0, rows: null }
    async function switchRoster() {
      const now = Date.now()
      if (rosterCache.rows !== null && now - rosterCache.at < 10000) return rosterCache.rows
      const overrides = readDisplayOverrides()
      const out = []
      const seen = {}
      for (const u of scanUserDirs()) {
        const meta = readPresetMeta(u.dir)
        seen[u.id] = true
        out.push(applyDisplayOverride({ id: u.id, name: meta.name || u.id, description: meta.description || '' }, overrides))
      }
      for (const p of await registryInventory()) {
        if (seen[p.id]) continue
        out.push(applyDisplayOverride({ id: p.id, name: p.name || p.id, description: p.description || '', broken: !!p.broken }, overrides))
      }
      rosterCache = { at: now, rows: out }
      return out
    }

    /** 能力目录：新建页在任何模板被选中之前就要显示勾选项。 */
    function capsCatalog(lang) {
      const en = lang === 'en'
      return CAPS.map(function (c) {
        return {
          id: c.id,
          title: en && c.en_title ? c.en_title : c.title,
          desc: en && c.en_desc ? c.en_desc : c.desc,
          dormant: !!c.dormant,
        }
      })
    }

    async function probeCapability(cap) {
      let rows
      try {
        rows = parseComposition(cap.block, USER_PRESET_ROOT.split('\\').join('/'))
      } catch (e) {
        return { ok: false, error: '能力定义解析失败: ' + (e && e.message ? e.message : String(e)) }
      }
      let dispose
      try {
        // 注册即急切加载：DSH 会真正去挂载这些行，失败信息就在这里暴露。
        dispose = await presets.register({ id: 'pw-capability-probe', plugins: rows })
        return { ok: true }
      } catch (e) {
        return { ok: false, error: e && e.message ? e.message : String(e) }
      } finally {
        if (dispose !== undefined) {
          try { await dispose() } catch (_) {}
        }
      }
    }

    /**
     * 开关一条「不属于 CAPS 目录、但允许被关掉」的组合行（目前只有 command-compact）。
     *
     * 做法是给那一行加/删 `disabled: true`，而不是删掉整块 YAML：
     *   • 保留行结构，用户随时能再打开；
     *   • 缩进按该行 name 字段的缩进对齐，嵌套在 cordis:group 里也不会错位。
     * @param id 预设 id
     * @param moduleName 组合行里那个插件的模块名
     * @param enabled 是否启用
     */
    async function setRow(id, moduleName, enabled) {
      await assertUserEditable(id)
      const mod = String(moduleName || '')
      if (!mod) throw new Error('缺少模块名')
      const dir = await dirForId(id)
      const file = dir + '/' + COMPOSITION_FILE
      let text = await readTextSmart(file)
      const lines = String(text).split('\n')

      // 找到声明该模块的那一行，再回溯到它所属的 “- id:” 行
      const nameIdx = lines.findIndex(function (l) { return l.indexOf("name: '" + mod + "'") >= 0 || l.indexOf('name: "' + mod + '"') >= 0 || new RegExp('name:\\s*[\'"]?' + mod.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "[\'\"]?\\s*$").test(l) })
      if (nameIdx < 0) throw new Error('组合文件里找不到该模块: ' + mod)

      let start = nameIdx
      for (let i = nameIdx; i >= 0; i--) {
        if (/^\s*- id:/.test(lines[i])) { start = i; break }
      }
      let end = lines.length - 1
      for (let i = start + 1; i < lines.length; i++) {
        if (/^\s*- id:/.test(lines[i])) { end = i - 1; break }
      }

      const nameLine = lines[nameIdx]
      const indent = (nameLine.match(/^\s*/) || [''])[0]

      let hasDisabled = false
      for (let i = start; i <= end; i++) {
        if (/^\s*disabled:/.test(lines[i])) { hasDisabled = true; break }
      }

      if (enabled && hasDisabled) {
        for (let i = end; i >= start; i--) {
          if (/^\s*disabled:/.test(lines[i])) lines.splice(i, 1)
        }
      } else if (!enabled && !hasDisabled) {
        lines.splice(nameIdx + 1, 0, indent + 'disabled: true')
      } else {
        return { enabled: enabled, changed: false }
      }

      await writeTextSmart(file, lines.join('\n'))
      await redeclarePreset(id)
      return { enabled: enabled, changed: true }
    }

    async function setCapability(id, capId, enabled) {
      await assertUserEditable(id)
      let cap
      for (const c of CAPS) if (c.id === capId) cap = c
      if (!cap) throw new Error('未知能力: ' + capId)
      if (enabled && cap.id === 'presentation') {
        const rt = (ptcRuntime !== undefined && ptcRuntime !== null) ? ptcRuntime
          : ((codeRuntime !== undefined && codeRuntime !== null) ? codeRuntime : undefined)
        if (rt === undefined) {
          throw new Error('当前环境没有 PTC 运行时（ptcRuntime 服务）。开启 PTC 模式会让该行挂载失败、进而拖垮整个预设，故已安全拒绝；如需体验请先部署 @deepseek-ai/dsh-ptc-runtime-node。')
        }
      }
      if (enabled) {
        // 通用保护：写入前先让 DSH 试挂载这一行。包被移除、依赖服务缺失、
        // config 不符合 schema 都会在这里被拒，从而不会污染用户的预设。
        const probe = await probeCapability(cap)
        if (!probe.ok) {
          throw new Error('本部署不支持该能力，已安全拒绝写入（否则这一行会让整个预设挂载失败）。宿主报错：' + probe.error)
        }
      }
      const dir = await dirForId(id)
      const file = dir + '/agent.cordis.yml'
      let text = await readTextSmart(file)
      const start = PW_CAP_START(capId)
      const end = PW_CAP_END(capId)
      if (enabled) {
        if (text.indexOf(start) < 0) {
          const block = start + '\n' + cap.block + end + '\n'
          text = text.replace(/\s+$/, '') + '\n\n' + block
          await writeTextSmart(file, text)
        }
      } else {
        const s = text.indexOf(start)
        if (s >= 0) {
          let after
          const e = text.indexOf(end, s)
          after = e >= 0 ? e + end.length : s + start.length
          text = text.slice(0, Math.max(0, s - 1)) + text.slice(after)
          await writeTextSmart(file, text)
        }
      }
      // 组合行改动后重新声明，让新的能力立即进入挂载（不必重启）。
      await redeclarePreset(id)
      return { enabled: enabled }
    }

    // 节流：list 时顺带补齐声明（磁盘上新增的预设无需重启即可见）。
    let lastSyncAt = 0
    async function syncDeclarationsThrottled() {
      if (!bundlesMigrated) { bundlesMigrated = true; void ensureAllPresetBundles() }
      const now = Date.now()
      if (now - lastSyncAt < 1500) return
      lastSyncAt = now
      try { await syncDeclarations() } catch (_) {}
    }

    /**
     * 写操作包装：先完成文件写入，成功后再补齐 bundle。
     * bundle 生成失败只记日志，绝不把「保存成功」变成失败。
     */
    async function withBundle(id, work) {
      const result = await work()
      try {
        if (await ensurePresetBundle(String(id))) {
          ctx.logger.info('preset-workbench: bundle ready for "' + String(id) + '"')
        }
      } catch (e) {
        ctx.logger.warn('preset-workbench: bundle failed for "' + String(id) + '": ' + (e && e.message))
      }
      return result
    }

    async function dispatch(body) {
      const op = String((body && body.op) || '')
      if (op === 'list') {
        await syncDeclarationsThrottled()
        return { presets: await allPresets(), declared: Array.from(declared.keys()) }
      }
      if (op === 'load') return await loadPreset(String(body.id))
      if (op === 'save-as') return await withBundle(body.id, function () { return savePresetAs(body.id, body.name, body.sections, body.caps, body.template, body.lang, body.removed) })
      if (op === 'templateDraft') return await templateDraft(String(body.id), body.lang)
      if (op === 'capsCatalog') return { caps: capsCatalog(body.lang) }
      if (op === 'roster') return { rows: await switchRoster() }
      if (op === 'save') return await withBundle(body.id, function () { return savePreset(String(body.id), body.sections) })
      if (op === 'setMeta') return await withBundle(body.id, function () { return setPresetMeta(String(body.id), body.name, body.description) })
      if (op === 'setOverride') return await setDisplayOverride(String(body.id), body.name, body.description)
      if (op === 'create') return await withBundle(body.id, function () { return createPreset(body.id, body.name, body.from, body.lang) })
      if (op === 'templates') return { templates: await templateList() }
      if (op === 'delete') return await deletePreset(String(body.id))
      if (op === 'validate') return await validatePreset(String(body.id))
      if (op === 'reveal') return await revealPreset(String(body.id))
      if (op === 'caps') return { caps: await capabilityList(String(body.id), body.lang) }
      if (op === 'setCap') return await setCapability(String(body.id), String(body.capId), !!body.enabled)
      if (op === 'setRow') return await setRow(String(body.id), String(body.module || ''), !!body.enabled)
      if (op === 'sessionPreset') return await sessionPresetView(String(body.sessionId || ''))
      if (op === 'switchPreset') return await requestSwitch(String(body.sessionId || ''), String(body.presetId || ''))
      if (op === 'cancelSwitch') { pendingSwitch.delete(String(body.sessionId || '')); return { pending: null } }
      if (op === 'bindings') return { rows: await bindingsView() }
      if (op === 'setBinding') return await setBinding(String(body.path), String(body.preset))
      if (op === 'clearBinding') return await clearBinding(String(body.path))
      if (op === 'declarations') {
        // 诊断用：手动重跑一次声明同步，返回结果（我们声明的/第三方已声明的/失败的）。
        const r = await syncDeclarations()
        return {
          declared: Array.from(declared.keys()),
          newlyDeclared: r.declared,
          external: r.external,
          failed: r.failed,
        }
      }
      throw new Error('未知操作: ' + op)
    }

    webServer.register({
      kind: 'exact',
      path: API_PATH,
      handler: async (req, res) => {
        if (!isLoopback(req)) { writeJson(res, 403, { ok: false, error: 'loopback requests only' }); return }
        if (req.method !== 'POST') { writeJson(res, 405, { ok: false, error: 'method not allowed' }); return }
        const body = await readJsonBody(req)
        if (body === undefined) { writeJson(res, 400, { ok: false, error: 'malformed JSON body' }); return }
        try {
          const result = await dispatch(body)
          writeJson(res, 200, Object.assign({ ok: true }, result))
        } catch (e) {
          writeJson(res, 200, { ok: false, error: e && e.message ? e.message : String(e) })
        }
      },
    })

    // ── 启动：把磁盘上的用户预设声明给 registry ──
    // 新版 DSH 不再自动扫描用户预设目录；没有这一步，磁盘上的预设目录这类
    // 「只有磁盘文件、没有插件声明」的预设不会出现在任何预设选择器里。
    ctx.effect(() => {
      let alive = true
      Promise.resolve().then(function () {
        return syncDeclarations()
      }).then(function (r) {
        if (!alive) return
        try {
          if (r.declared.length > 0) ctx.logger.info('preset-workbench: declared ' + r.declared.length + ' user preset(s): ' + r.declared.join(', '))
          if (r.external.length > 0) ctx.logger.info('preset-workbench: already declared elsewhere (left as-is): ' + r.external.join(', '))
          for (const f of r.failed) ctx.logger.warn('preset-workbench: preset "' + f.id + '" could not be declared: ' + f.error)
        } catch (_) {}
      }).catch(function () {})
      return function () {
        alive = false
        for (const id of Array.from(declared.keys())) {
          try { Promise.resolve(undeclarePreset(id)).catch(function () {}) } catch (_) {}
        }
      }
    }, 'preset-workbench.declarations')
  })
}
