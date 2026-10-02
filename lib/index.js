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
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
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
    id: 'delegation',
    title: '子代理 + 工作流',
    desc: '把任务派给子代理跑；支持大规模 workflow 编排；含 Ralph 迭代代理。',
    en_title: 'Subagents + workflows',
    en_desc: 'Delegate tasks to subagents; support large workflow orchestration; includes the Ralph iterative agent.',
    block: `- id: delegation
  name: 'cordis:group'
  group: true
  isolate:
    workflowEngine: true
  config:
    - id: tool-subagent-control
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
    - id: workflow-worker-thread
      name: '@deepseek-ai/dsh-workflow-worker-thread'
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
    title: 'PPT / 代码模式演示',
    desc: '⚠ 高风险项：需要宿主具备代码运行时(codeRuntime)。环境不支持时开启会被安全拒绝，因为该行会让整个预设加载失败。对应 code 预设的 tool-presentation。',
    en_title: 'PPT / code-mode demo',
    en_desc: '⚠ High-risk: requires the host codeRuntime. Opening it without support is safely refused because the line would break the whole preset. Corresponds to tool-presentation in the code preset.',
    block: `- id: tool-presentation
  name: '@deepseek-ai/dsh-agent-tool-presentation'
  config:
    mode: code
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
    let subprocess
    let codeRuntime
    let sandboxPolicy
    sctx.inject(['workspaceRegistry'], (wctx) => { wsRegistry = wctx.get('workspaceRegistry') })
    sctx.inject(['subprocess'], (wctx) => { subprocess = wctx.get('subprocess') })
    sctx.inject(['codeRuntime'], (wctx) => { codeRuntime = wctx.get('codeRuntime') })
    sctx.inject(['sandboxPolicy'], (wctx) => { sandboxPolicy = wctx.get('sandboxPolicy') })

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
      if (declared.has(id)) return false
      const dispose = await presets.register(buildDefinition(id))
      declared.set(id, dispose)
      return true
    }

    /** 撤销一个声明，磁盘文件保持不动。 */
    async function undeclarePreset(id) {
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

    /** registry 侧的完整清单（含 isDefault 与组合行）；不可用时返回空数组。 */
    async function registryInventory() {
      try {
        const inv = await presets.compositionInventory()
        return Array.isArray(inv) ? inv : []
      } catch (_) { return [] }
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

    async function userList() {
      // 用户预设 = 磁盘上真实存在的预设目录（新版 registry 不再提供 path/trust）。
      const out = []
      for (const u of scanUserDirs()) {
        const meta = readPresetMeta(u.dir)
        out.push({
          id: u.id,
          path: u.dir.split('\\').join('/'),
          broken: !u.hasComposition,
          name: meta.name,
          description: meta.description,
          declared: declared.has(u.id),
        })
      }
      return out
    }

    async function allPresets() {
      // 用户预设来自磁盘；其余（官方/第三方声明）来自 registry 的组合清单。
      const inv = await registryInventory()
      const byId = {}
      for (const p of inv) byId[p.id] = p

      const out = []
      const seen = {}
      for (const u of scanUserDirs()) {
        const meta = readPresetMeta(u.dir)
        const r = byId[u.id]
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
        })
      }
      return out
    }

    /** 该预设当前是否为「新会话默认」（registry 的 isDefault）。 */
    async function isDefaultPreset(id) {
      const inv = await registryInventory()
      for (const p of inv) if (p.id === id) return !!p.isDefault
      return false
    }

    async function templateList() {
      // 内置模板不单独成组：本机已有同名用户预设时直接用人家的，
      // 没有时才把内置模板并入“用户”组（新机器上它们就是可选的用户模板）。
      const pres = []
      const userIds = {}
      for (const u of scanUserDirs()) {
        const meta = readPresetMeta(u.dir)
        const r = null
        pres.push({ id: u.id, name: meta.name, source: 'user' })
        userIds[u.id] = true
      }
      for (const p of await registryInventory()) {
        if (userIds[p.id]) continue
        pres.push({ id: p.id, name: p.name, source: 'system' })
      }
      for (const id of builtinTemplates()) {
        if (userIds[id]) continue
        let name
        try {
          const yml = readFileSync(join(TEMPLATES_DIR, id, 'preset.yml'), 'utf8')
          const m = /^name:\s*(.+)$/m.exec(yml)
          if (m) name = m[1].trim()
        } catch (_) {}
        pres.push({ id: id, name: name, source: 'user' })
      }
      return pres
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

    async function revealPreset(id) {
      await assertUserEditable(id)
      const dir = await dirForId(id)
      const sp = subprocess
      if (sp === undefined || sp === null) throw new Error('subprocess 服务不存在，无法打开目录')
      let program = 'explorer.exe'
      try {
        const resolved = await sp.resolveExecutable('explorer.exe')
        if (resolved) program = resolved
      } catch (_) {}
      const winDir = dir.split('/').join('\\')
      sp.spawn({
        argv: [program, winDir],
        cwd: dir,
        stdio: { stdin: 'ignore', stdout: { maxBytes: 4096 }, stderr: { maxBytes: 4096 } },
        graceMs: 1000,
      })
      return { opened: true, dir: winDir }
    }

    async function loadPreset(id) {
      const dir = await dirForId(id)
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
            return { hasManifest: true, isSystem: false, sections: sections }
          }
        } catch (_) {}
      }
      let legacy = ''
      try { legacy = await readTextSmart(dir + '/persona.md') } catch (_) {}
      const legacySections = []
      if (legacy) legacySections.push({ file: 'persona.md', title: '提示词（旧版单文件）', enabled: true, text: legacy })
      // 非用户预设（官方/第三方声明）：没有分段提示词文件（能力开关会读组合行展示），只标记只读。
      if (!isUserPresetId(id)) {
        return { hasManifest: false, isSystem: true, sections: legacySections }
      }
      return { hasManifest: false, isSystem: false, sections: legacySections }
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
        for (const cand of ['cetacea', 'minimal', 'standard']) {
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
      return /persona|compaction|-command-/.test(String(moduleName || ''))
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
          kind: 'core',
          dormant: false,
        }
      }
      // 非用户预设（官方/第三方）：全部组合行都作为能力开关项（整体只读，地基更标 🔒 禁勾）。
      if (!isUser) {
        return rows.map(toRow)
      }
      // 用户预设：地基行（锁定）+ CAPS 可选项。
      const coreRows = rows.map(toRow).filter(function (x) { return x.locked })
      const capRows = CAPS.map(function (c) {
        return {
          id: c.id,
          title: en && c.en_title ? c.en_title : c.title,
          desc: en && c.en_desc ? c.en_desc : c.desc,
          enabled: text.indexOf(PW_CAP_START(c.id)) >= 0,
          dormant: !!c.dormant,
          locked: false,
          kind: 'cap',
        }
      })
      return coreRows.concat(capRows)
    }

    async function setCapability(id, capId, enabled) {
      await assertUserEditable(id)
      let cap
      for (const c of CAPS) if (c.id === capId) cap = c
      if (!cap) throw new Error('未知能力: ' + capId)
      if (enabled && cap.id === 'presentation') {
        const cr = codeRuntime
        if (cr === undefined || cr === null) throw new Error('当前环境没有代码运行时（codeRuntime 服务）。开启 PPT/代码模式会让预设加载失败，故已安全拒绝；如需体验请先部署代码运行时。')
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
      const now = Date.now()
      if (now - lastSyncAt < 1500) return
      lastSyncAt = now
      try { await syncDeclarations() } catch (_) {}
    }

    async function dispatch(body) {
      const op = String((body && body.op) || '')
      if (op === 'list') {
        await syncDeclarationsThrottled()
        return { presets: await allPresets(), declared: Array.from(declared.keys()) }
      }
      if (op === 'load') return await loadPreset(String(body.id))
      if (op === 'save') return await savePreset(String(body.id), body.sections)
      if (op === 'create') return await createPreset(body.id, body.name, body.from, body.lang)
      if (op === 'templates') return { templates: await templateList() }
      if (op === 'delete') return await deletePreset(String(body.id))
      if (op === 'validate') return await validatePreset(String(body.id))
      if (op === 'reveal') return await revealPreset(String(body.id))
      if (op === 'caps') return { caps: await capabilityList(String(body.id), body.lang) }
      if (op === 'setCap') return await setCapability(String(body.id), String(body.capId), !!body.enabled)
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
    // 新版 DSH 不再自动扫描用户预设目录；没有这一步，1/2/cetacea 这类
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
