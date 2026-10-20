# bare（空提示词）预设

**没有任何系统提示词，也没有任何工具。** 会话里只有你说的话和模型本身 —— 用来观察模型的原始行为，或者当作"从零开始"的底板。

## 它为什么是空的

| 常见内容 | 这里的状态 |
| --- | --- |
| Harness 身份、工具说明、Web 环境、结构化输出指引 | 全部不进入 —— 人设段用 `complete: true` 独占系统提示词 |
| 人设/角色设定 | 空：`sections.json` 里没有任何启用段落 |
| 运行时快照（源码路径、沙盒、审批策略…） | 关闭（`includeRuntimeContext: false`） |
| 工具表 | 清空（`persona-file.mjs` 在 `system-prompt/assemble` 里返回空列表） |

有两样东西**压不掉**，它们是 harness 的硬约束，而且都是以 **user 消息** 出现、不是系统提示词：

- `Current working directory: ...`（working-directory 服务标记为 `required`）
- `You are the Team Lead named "lead"...`（只在启用 agent-team bundle 时出现，同样 `required`）

## 怎么用

1. 设置 → **预设工作台** → 新建，来源选本模板（`bare` / 空提示词），填一个 id。
2. 打开它 → **＋添加段落** → 写下你想要的提示词，保存。加了段落就不再是空提示词了，这正是它的用法：从零开始，一行一行加。
3. 想要工具时：到预设目录里把 `agent.cordis.yml` 的 `noTools: true` 改成 `false`，再用工作台的能力开关逐个勾选。

## 文件说明

| 文件 | 作用 | 需要你动吗 |
| --- | --- | --- |
| sections.json + section.*.md | 提示词分段本体（初始为空） | 在工作台里改 |
| agent.cordis.yml | 组合：人设装载器 + 压缩；`noTools` 开关在这里 | 想开工具时改 |
| persona-file.mjs | 装载脚本：拼提示词 + 清空工具表 | 不要动 |
| preset.yml | 选择器里显示的名字和简介 | 想改名时改 |

> 注意：清空工具表是在**装配阶段**做的，所以即使把 web / 文件工具等能力开关勾上，只要 `noTools: true`，模型仍然看不到任何工具。先关掉它，再勾能力。
