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
import { fileURLToPath } from 'node:url'

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

    async function dirForId(id) {
      const r = await presets.resolve(id)
      if (!r || !r.path) throw new Error('找不到预设: ' + id)
      return dirOf(r.path)
    }

    async function userList() {
      const all = await presets.list()
      const out = []
      for (const p of all) {
        if (p.trust !== 'user') continue
        out.push({
          id: p.id,
          path: String(p.path).replace(/\\/g, '/').replace(/\/agent\.cordis\.yml$/, ''),
          broken: !!p.broken,
          name: typeof p.name === 'string' ? p.name : undefined,
          description: typeof p.description === 'string' ? p.description : undefined,
        })
      }
      return out
    }

    async function allPresets() {
      // 让「当前预设」下拉框能选到官方预设（system，只读）：返回全部预设并标 trust。
      const all = await presets.list()
      const out = []
      const seen = {}
      for (const p of all) {
        const isUser = p.trust === 'user'
        seen[p.id] = true
        out.push({
          id: p.id,
          path: String(p.path).replace(/\\/g, '/').replace(/\/agent\.cordis\.yml$/, ''),
          broken: !!p.broken,
          name: typeof p.name === 'string' ? p.name : undefined,
          description: typeof p.description === 'string' ? p.description : undefined,
          trust: p.trust,
          readonly: !isUser, // 系统/官方预设 = 只读（写操作会被 assertUserEditable 硬拦截）
        })
      }
      // 官方预设不一定出现在 list() 里（取决于部署 root），用探测到的可用 id 补上，标为系统只读。
      for (const id of officialIconIds()) {
        if (seen[id]) continue
        const r = await presets.resolve(id).catch(function () { return null })
        if (!r) continue
        out.push({
          id: id,
          path: String(r.path).replace(/\\/g, '/').replace(/\/agent\.cordis\.yml$/, ''),
          broken: !!r.broken,
          name: typeof r.name === 'string' ? r.name : undefined,
          description: typeof r.description === 'string' ? r.description : undefined,
          trust: 'system',
          readonly: true,
        })
      }
      return out
    }

    function officialIconIds() {
      // 官方预设的常用 id 集合（按部署实际存在情况过滤）。Code mode 已更名为 PTC。
      return ['standard', 'ptc', 'code', 'minimal', 'cordis']
    }

    async function templateList() {
      // 内置模板不单独成组：本机已有同名用户预设时直接用人家的，
      // 没有时才把内置模板并入“用户”组（新机器上它们就是可选的用户模板）。
      const all = await presets.list()
      const pres = []
      const userIds = {}
      for (const p of all) {
        pres.push({
          id: p.id,
          name: typeof p.name === 'string' ? p.name : undefined,
          source: p.trust === 'user' ? 'user' : 'system',
        })
        if (p.trust === 'user') userIds[p.id] = true
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
      const users = await userList()
      for (const u of users) if (u.id === id) return
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
        const sp = ctx.get('sandboxPolicy')
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
      const sp = ctx.get('subprocess')
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
      // 系统/官方预设：没有分段提示词文件（能力开关会读组合行展示），这里只标记只读。
      const r = await presets.resolve(id).catch(function () { return null })
      if (r && r.trust === 'system') {
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
      return { wrote: manifest.length }
    }

    async function userPresetsRoot() {
      const all = await presets.list()
      for (const p of all) {
        if (p.trust === 'user' && p.path) {
          const dir = dirOf(p.path)
          const parent = dir.slice(0, dir.lastIndexOf('/'))
          if (parent) return parent
        }
      }
      const home = String(process.env.DSH_HOME || '').replace(/\\/g, '/')
      return home ? home + '/.agent-presets' : ''
    }

    async function createFromBuiltin(id, displayName, tpl) {
      const root = await userPresetsRoot()
      if (!root) throw new Error('找不到用户预设根目录')
      const target = root + '/' + id
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
      const r = await presets.resolve(id)
      return { id: r.id, path: r.path }
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
      const all = await presets.list()
      const have = {}
      for (const p of all) have[p.id] = true
      // ── 目标 id 占用预检：先于 presets.copy() 拦截，抛我们自己的双语报错，
      //    不再让宿主那句英文 "preset \"x\" already exists..." 漏到界面 ──
      if (have[String(id)]) throw new Error(e('idExists', String(id)))
      if (!src) {
        // 可移植回退：优先本机 cetacea，其次官方极简/标准。
        for (const cand of ['cetacea', 'minimal', 'standard', 'code']) {
          if (have[cand]) { src = cand; break }
        }
        if (!src) throw new Error(e('noTemplate'))
      }
      if (!have[src] && builtinTemplates().indexOf(src) >= 0) {
        // 本机没有该模板（如只装了插件没装同名用户预设）→ 从内置模板复制兜底。
        return await createFromBuiltin(String(id), name, src)
      }
      if (!have[src]) throw new Error(e('noSrc', src))
      await presets.copy(src, String(id), typeof name === 'string' && name !== '' ? name : undefined)
      const r = await presets.resolve(id)
      return { id: r.id, path: r.path }
    }

    async function deletePreset(id) {
      await assertUserEditable(id)
      await presets.remove(id)
      return { removed: id }
    }

    async function validatePreset(id) {
      try {
        await presets.standingKeyFor(id)
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
      try { text = await readTextSmart(dir + '/agent.cordis.yml') } catch (_) {}
      const en = lang === 'en'
      const r = await presets.resolve(id).catch(function () { return null })
      const isSystem = !!(r && r.trust === 'system')
      // 当前预设的实体组合行（用于识别"地基"模块并展示）。
      let rows = []
      try {
        const inv = await presets.compositionInventory()
        const found = (inv || []).filter(function (x) { return x.id === id })[0]
        if (found && Array.isArray(found.rows)) rows = found.rows
      } catch (_) {}
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
      // 系统/官方预设：全部组合行都作为能力开关项（整体只读，地基更标 🔒 禁勾）。
      if (isSystem) {
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
        const cr = ctx.get('codeRuntime')
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
      return { enabled: enabled }
    }

    async function dispatch(body) {
      const op = String((body && body.op) || '')
      if (op === 'list') return { presets: await allPresets() }
      if (op === 'load') return await loadPreset(String(body.id))
      if (op === 'save') return await savePreset(String(body.id), body.sections)
      if (op === 'create') return await createPreset(body.id, body.name, body.from, body.lang)
      if (op === 'templates') return { templates: await templateList() }
      if (op === 'delete') return await deletePreset(String(body.id))
      if (op === 'validate') return await validatePreset(String(body.id))
      if (op === 'reveal') return await revealPreset(String(body.id))
      if (op === 'caps') return { caps: await capabilityList(String(body.id), body.lang) }
      if (op === 'setCap') return await setCapability(String(body.id), String(body.capId), !!body.enabled)
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
  })
}
