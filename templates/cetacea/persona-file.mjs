/**
 * persona-file (v2, sections-aware) - compose the cetacea persona from
 * `sections.json` + flat `section.*.md` files beside this script, so the
 * prompt can be edited per-section (each with an enabled flag) without
 * touching agent.cordis.yml.
 *
 * Registration mirrors @deepseek-ai/dsh-persona exactly (section name
 * `deployment:persona`, order 0, complete flag, runtime-context suppression),
 * with the constants inlined: preset-local scripts resolve only node
 * builtins, not deployment packages.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'persona-file'

/** The prompt registry must exist before the section can register. */
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
 * blank line. Falls back to the legacy single persona.md, then to a minimal
 * builtin card, so a damaged manifest can never blank out the persona.
 */
function composePersonaText() {
  const raw = readIfExists(join(here, 'sections.json'))
  if (raw) {
    try {
      const manifest = JSON.parse(raw)
      if (Array.isArray(manifest)) {
        const parts = []
        for (const entry of manifest) {
          if (!entry || entry.enabled === false) continue
          const file = typeof entry.file === 'string' ? entry.file : ''
          if (!file || file.includes('..') || file.includes('/') || file.includes('\\')) continue
          const text = readIfExists(join(here, file))
          if (text) parts.push(text.trim())
        }
        if (parts.length > 0) return parts.join('\n\n')
      }
    } catch (_) {}
  }
  const legacy = readIfExists(join(here, 'persona.md'))
  if (legacy) return legacy
  return '你是「鲸鱼娘」，一只虎鲸娘角色扮演助手。永远用中文回复用户（称呼对方：主人）。'
}

/**
 * Register the persona section for this preset's scope. Text is composed at
 * mount time - edits take effect on the next session start.
 */
export function apply(ctx, config = {}) {
  const text = composePersonaText()
  const complete = config.complete ?? true
  const includeRuntimeContext = config.includeRuntimeContext ?? false
  ctx.effect(() => ctx.systemPrompt.section({
    name: 'deployment:persona',
    order: 0,
    text,
    ...(complete ? { complete: true } : {}),
  }), 'persona-file.section()')
  if (!includeRuntimeContext) ctx.systemPrompt.suppressRuntimeContext()
}