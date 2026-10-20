/**
 * persona-file — the "bare" preset's only prompt row.
 *
 * Two jobs, both mounted from this one script so the workbench shows exactly
 * one locked 地基 row:
 *
 * 1. Persona: compose the system prompt from `sections.json` + the flat
 *    `section.*.md` files beside this script, exactly like the cetacea
 *    template. Unlike cetacea there is NO fallback card: no enabled section
 *    means the persona text is `''`, and with `complete: true` that renders
 *    as an empty system prompt — DSH records a system message with zero
 *    content blocks, i.e. "no system prompt".
 *
 * 2. Tool silencing (`noTools`, default true): preset omission is not enough
 *    to get zero tools — tools registered by HOST-level plugins (web search,
 *    MCP servers, profile bundles) are global and no preset row can remove
 *    them. The `system-prompt/assemble` waterfall owns the delivered tool
 *    set, so emptying it there is the supported way to send the model no
 *    tools at all. Set `noTools: false` in agent.cordis.yml to keep them.
 *
 * Registration mirrors @deepseek-ai/dsh-persona (section name
 * `deployment:persona`, order 0, complete flag, runtime-context suppression).
 * Constants are inlined because a preset-local script resolves only node
 * builtins, not deployment packages.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'persona-file'

/** The prompt registry whose section and assembly waterfall this row needs. */
export const inject = ['systemPrompt']

const here = dirname(fileURLToPath(import.meta.url))

function readIfExists(path) {
  try {
    return readFileSync(path, 'utf8')
  } catch (_) {
    return null
  }
}

/**
 * Compose the persona text: enabled sections in manifest order, joined by a
 * blank line. No manifest, no readable sections, or every section disabled
 * all mean `''` — the empty system prompt this preset exists for.
 */
function composePersonaText() {
  const raw = readIfExists(join(here, 'sections.json'))
  if (!raw) return ''
  try {
    const manifest = JSON.parse(raw)
    if (!Array.isArray(manifest)) return ''
    const parts = []
    for (const entry of manifest) {
      if (!entry || entry.enabled === false) continue
      const file = typeof entry.file === 'string' ? entry.file : ''
      if (!file || file.includes('..') || file.includes('/') || file.includes('\\')) continue
      const text = readIfExists(join(here, file))
      if (text && text.trim() !== '') parts.push(text.trim())
    }
    return parts.join('\n\n')
  } catch (_) {
    return ''
  }
}

/**
 * Register the persona section and, unless `noTools` is false, narrow the
 * delivered tool schemas down to none.
 * @param ctx - this preset's agent scope.
 * @param config - `complete`, `includeRuntimeContext`, `noTools`.
 */
export function apply(ctx, config = {}) {
  const text = composePersonaText()
  const complete = config.complete ?? true
  const includeRuntimeContext = config.includeRuntimeContext ?? false
  const noTools = config.noTools ?? true

  ctx.effect(() => ctx.systemPrompt.section({
    name: 'deployment:persona',
    order: 0,
    text,
    ...(complete ? { complete: true } : {}),
  }), 'persona-file.section()')

  if (!includeRuntimeContext) ctx.systemPrompt.suppressRuntimeContext()

  if (noTools) {
    ctx.on('system-prompt/assemble', async (assembly, _context, next) => {
      const result = await next()
      if (result.tools.length === 0) return result
      return { ...result, tools: [] }
    })
  }
}
