# dsh-preset-workbench

> 在 DSH（DeepSeek Harness）设置页里，创建与编辑 Agent 预设的可视化工作台——不用写 YAML，不用求创造模式代劳。
> A visual workbench on the DSH (DeepSeek Harness) Settings page for creating and editing agent presets — no YAML, no asking the "creation mode" to do it for you.

---

**[中文](#中文) · [English](#english)**

---

## 中文

## 简介

预设是 DSH 新会话的“开局配置包”：选定哪个预设，会话里的 AI 就是什么人设、什么能力。本插件把预设的编辑变成设置页里的一页可视化工具：

- **分段提示词**：每段独立标题与内容，勾选框控制这段是否进入系统提示词（不勾 = 文字保留但不给 AI 看）
- **能力开关**：15 项可选工具能力，勾选即写入组合文件、取消即移除，每次切换自动做挂载校验
- **内置模板**：随插件自带“鲸鱼娘”“梁神模式”两套预设，任何机器安装即用
- **安全边界**：系统预设只读；绝不覆盖本机已有预设；高权限能力带环境预检

## 功能

| 功能 | 说明 |
| --- | --- |
| 分段提示词编辑 | 每段：启用勾选 / 标题 / 内容，可增删段落 |
| 新建预设 | 选择内置模板或本机已有预设，一键复制（自带分段装载器） |
| 能力开关 | 15 项能力：勾选写入、取消移除、自动校验；含“预留接线（disabled）”模式 |
| 打开目录 | 一键在资源管理器中打开该预设文件夹 |
| 校验挂载 | 模拟会话加载，报告组合错误 |
| 删除预设 | 两击确认防误删；仅限用户预设 |

## 安装

```bash
# 从本地目录安装
dsh plugin add --profile web <本插件目录的绝对路径>

# 或从 GitHub 仓库安装
dsh plugin add --profile web github:<你的用户名>/dsh-preset-workbench
```

安装后**重启 dsh**，打开 **设置 → 预设工作台** 即可使用。

## npm 发布

`dsh-preset-workbench` 在公共 npm 上**已验证可用**（registry 返回 404 = 无人占用）。发布步骤：

```bash
cd <插件目录>
npm login          # 或设置 NODE_AUTH_TOKEN 环境变量
npm publish        # publishConfig 已配好：access=public, registry=npmjs
```

包内含 `templates/`（鲸鱼娘、梁神两套内置模板），所以 `npm install dsh-preset-workbench` 或 `dsh plugin add dsh-preset-workbench` 安装后开箱即用。

**备选：GitHub Packages**（`npm.pkg.github.com`）——规则要求包名**必须带账号 scope**（`@DDDMUC/dsh-preset-workbench`），且认证用 GitHub PAT（权限 `write:packages`），**不是** npm 的 token。仓库里 `.npmrc` 已配好 `@DDDMUC -> npm.pkg.github.com` 映射，需要时把 package.json 的 name 改成带 scope 即可。

## 使用

1. 打开设置 → 预设工作台
2. 下拉框选择一个用户预设（鲸鱼娘 / 梁神 / 你自己建的）
3. 编辑各段提示词 → 点「💾 保存全部」→ **下次新开的会话**生效
4. 新建自己的预设：填 id（英文小写）与显示名 → 从模板创建 → 改内容 → 保存
5. 给预设加能力：展开「🧰 能力开关」打勾，每次切换自动校验

## 能力开关

15 项可分三档：

| 档位 | 能力 |
| --- | --- |
| 🟢 安全 | 联网搜索+抓取、标准文件工具、AGENTS.md 工作区指令、技能库、提问确认、任务清单、后台任务、长期目标、规划模式 |
| 🟡 中等 | 子代理+工作流（含 Ralph 迭代代理） |
| 🔴 高危（带预检） | PPT/代码模式演示（需宿主 codeRuntime，否则安全拒绝）、插件改制工具 cordis_* |
| 🔌 预留接线 | Codex、Claude Code 产品子代理（写入官方同款 disabled 行，启用需另装捆绑）、一次性 bash/pwsh |

地基能力（命令 shell、文件编辑器、长对话压缩）永远在，不设开关、不受勾选影响。

## 内置模板

| 模板 | 说明 |
| --- | --- |
| `cetacea`（鲸鱼娘） | 极简角色扮演模板：持久 shell + 文件编辑器 + 压缩 + 分段人设（自带分段装载器） |
| `liangshen`（梁神模式） | 全功能预设：文件/搜索/技能/目标/规划/压缩/子代理/workflow/Ralph/联网等 |

模板随插件打包发布，安装即用；创建时复制到新 id 名下，**不影响本机已有同名预设**。

## 工作原理

- 预设 = `.agent-presets/<id>` 下的一个文件夹（组合文件 + 提示词分段 + 元数据）
- 本插件 = 设置页新页 + 一个 loopback HTTP 桥（`/api/preset-workbench`）
- 能力开关 = 在组合文件里插入/移除带标记的工具行；每次切换后自动跑挂载校验
- 模板复制 = 插件内 `templates/` 只读素材 → 复制到新 id，重写显示名；id 被占用即拒绝，绝不覆盖
- 只改用户预设；官方内置预设（standard/code/minimal/cordis）一律只读

## 常见问题

- **会覆盖我已有的同名预设吗？** 不会。创建时检查 id，冲突则拒绝并提示“预设 id 已被占用”。
- **能改官方系统预设吗？** 不能，所有写操作仅限用户预设。
- **我的私人预设会随插件泄露吗？** 不会。插件只打包自己的 `templates/`（鲸鱼娘、梁神），与本机 `.agent-presets/` 完全隔离。
- **改动什么时候生效？** 保存后对**之后新开的会话**生效，当前会话不变。

## 截图

> 待补充：拍几张工作台界面图，替换下面两行（放在 `docs/` 或仓库根目录后引用）。

```markdown
![工作台](./docs/main.png)
![能力开关](./docs/caps.png)
```

## 许可

[MIT](./LICENSE)

---

## English

## Intro

Presets are DSH's "starting config pack" for new sessions: choosing a preset defines who the session's AI is and what it can do. This plugin turns preset editing into one visual page inside Settings:

- **Sectioned prompts**: each section has its own title/content; the checkbox decides whether it enters the system prompt (unchecked = text kept but hidden from the AI)
- **Capability toggles**: 15 optional tool capabilities — check to write the rows into the composition, uncheck to remove, auto-validated on every toggle
- **Built-in templates**: ships with two presets ("鲸鱼娘 / Whale Girl", "梁神模式 / Liangshen Mode"), ready on any machine after install
- **Safety boundaries**: system presets are read-only; existing local presets are never overwritten; high-power capabilities carry environment pre-checks

## Features

| Feature | Description |
| --- | --- |
| Sectioned prompt editor | Per-section: enabled checkbox / title / content; add & remove sections |
| Create presets | From built-in template or any existing user preset, one-click copy (with section loader) |
| Capability toggles | 15 capabilities, write-on-check / remove-on-uncheck, auto mount validation, plus "wired but disabled" mode |
| Open directory | One click to reveal the preset folder in the file explorer |
| Validate mount | Simulates session loading and reports composition errors |
| Delete preset | Double-click confirm (anti-mistake); user presets only |

## Install

```bash
# local directory
dsh plugin add --profile web /absolute/path/to/this/plugin

# or from GitHub
dsh plugin add --profile web github:<your-username>/dsh-preset-workbench
```

**Restart dsh** after installing, then open **Settings → 预设工作台 (Preset Workbench)**.

## Publishing to npm

`dsh-preset-workbench` is **verified available** on the public npm registry (registry returned 404 = name is free). Publish like this:

```bash
cd <plugin dir>
npm login          # or set NODE_AUTH_TOKEN
npm publish        # publishConfig already set: access=public, registry=npmjs
```

The package ships `templates/` (Whale Girl & Liangshen built-in templates), so `npm install dsh-preset-workbench` or `dsh plugin add dsh-preset-workbench` works out of the box.

**Alternative: GitHub Packages** (`npm.pkg.github.com`) — that registry requires a **scoped package name** (`@DDDMUC/dsh-preset-workbench`) and auth with a GitHub PAT (scope `write:packages`), **not** an npm token. The repo's `.npmrc` already maps `@DDDMUC -> npm.pkg.github.com`; just change the name in package.json when you need it.

## Usage

1. Open Settings → Preset Workbench
2. Pick a user preset from the dropdown (Whale Girl / Liangshen / yours)
3. Edit prompt sections → click「💾 Save All」→ takes effect on **new** sessions
4. Create your own: fill in an id (lowercase english) + display name → create from template → edit → save
5. Add capabilities: open「🧰 Capability Toggles」and check any item — each toggle auto-validates

## Capabilities

15 items in three risk tiers:

| Tier | Items |
| --- | --- |
| 🟢 Safe | Web search + fetch, standard file tools, AGENTS.md, skills, ask-user confirmations, todo, background jobs, long-term goals, plan mode |
| 🟡 Medium | Subagents + workflows (incl. Ralph iterative agent) |
| 🔴 High (pre-checked) | PPT/code-mode presentation (requires host codeRuntime, otherwise safely refused), cordis_* plugin tooling |
| 🔌 Wired-but-disabled | Codex & Claude Code product subagents (official-style `disabled` rows; enable needs bundles), one-shot bash/pwsh |

Base capabilities (shell, file editor, compaction) are always on and not togglable.

## Built-in Templates

| Template | Description |
| --- | --- |
| `cetacea`（鲸鱼娘 / Whale Girl） | Minimal roleplay preset: persistent shell + file editor + compaction + sectioned persona (ships its own loader) |
| `liangshen`（梁神模式 / Liangshen Mode） | Full-featured preset: files, search, skills, goals, planning, compaction, subagents, workflows, Ralph, web... |

Templates are packed with the plugin; creation copies them to a new id and never touches local presets with the same name.

## How It Works

- A preset is a folder under `.agent-presets/<id>` (composition + prompt sections + metadata)
- This plugin = one new Settings page + a loopback HTTP bridge (`/api/preset-workbench`)
- Capability toggles insert/remove marked tool rows in the composition file; every toggle runs a mount validation
- Template creation copies read-only assets from `templates/` to the new id and rewrites the display name; occupied ids are refused — never overwritten
- Only user presets are writable; official presets (standard/code/minimal/cordis) are always read-only

## FAQ

- **Will it overwrite an existing preset with the same id?** No. Creation checks for occupied ids and refuses with "预设 id 已被占用".
- **Can I edit the official system presets?** No; every write is restricted to user presets.
- **Will my private presets leak through the plugin?** No. The plugin only packs its own `templates/` (Whale Girl, Liangshen), fully isolated from the local `.agent-presets/`.
- **When do changes take effect?** Saved changes apply to **newly opened sessions**; the current session is unchanged.

## Screenshots

> TODO: add screenshots and reference them below (`docs/` or repo root).

```markdown
![Workbench](./docs/main.png)
![Capabilities](./docs/caps.png)
```

## License

[MIT](./LICENSE)