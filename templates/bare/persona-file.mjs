/**
 * persona-file — the "bare" preset's only prompt row.
 *
 * Three jobs, all mounted from this one script so the workbench shows exactly
 * one locked 地基 row:
 *
 * 1. Persona: compose the system prompt from `sections.json` + the flat
 *    `section.*.md` files beside this script. There is NO fallback card:
 *    no enabled section means the persona text is `''`, and with `complete: true` that renders
 *    as an empty system prompt — DSH records a system message with zero
 *    content blocks, i.e. "no system prompt".
 *
 * 2. Tool silencing (`noTools`, default true): preset omission is not enough
 *    to get zero tools — tools registered by HOST-level plugins (web search,
 *    MCP servers, profile bundles) are global and no preset row can remove
 *    them. `tools.restrict({ allow: [] })` keeps only the empty set of
 *    inherited global tools, which is the supported way to send the model no
 *    tools at all. Set `noTools: false` in `agent.cordis.yml` to keep them.
 *
 *    (Do NOT do this in a `system-prompt/assemble` listener: that waterfall's
 *    `assembly` carries no `tools` field — reading `result.tools` throws —
 *    and the registry re-attaches its own `tools` over the listener's return
 *    value, so an override there is silently discarded.)
 *
 * 3. Required contexts: `suppressRuntimeContext()` only drops OPTIONAL
 *    entries. A `required: true` registration survives it, and the stock
 *    `working-directory` row is exactly that — it would leave
 *    `Current working directory: "…".` in every request. Each such name gets
 *    a shadow in this layer (`required: false`, empty text), which then
 *    falls out of both the suppression filter and the required-name set.
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

/** Services this row needs: the prompt registry, and the tool registry. */
export const inject = ['systemPrompt', 'tools']

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
 * Names registered with `required: true` anywhere in the prompt registry.
 *
 * Read straight off the registry's own layer tables (global plus every
 * scoped overlay) instead of going through `merge(scope)`, because a
 * preset-local row has no portable way to name the agent's scope key.
 * @param prompt - the injected `systemPrompt` service.
 * @returns a name → entry map of the required registrations, or an empty
 *   map when the registry's internals are not where this version puts them.
 */
function requiredContextEntries(prompt) {
  const found = new Map()
  const layers = prompt === undefined || prompt === null ? undefined : prompt.layers
  if (layers === undefined || layers === null) return found
  const collect = function (layer) {
    if (layer === undefined || layer === null) return
    const table = layer.contexts
    if (table === undefined || table === null || typeof table.entries !== 'function') return
    for (const [contextName, entry] of table.entries()) {
      if (entry !== undefined && entry !== null && entry.required === true && !found.has(contextName)) {
        found.set(contextName, entry)
      }
    }
  }
  collect(layers.global)
  const scoped = layers.scoped
  if (scoped instanceof Map) for (const layer of scoped.values()) collect(layer)
  return found
}

/**
 * Register the persona section, empty the inherited tool set, and shadow
 * every `required` runtime context out of existence.
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

  if (!includeRuntimeContext) {
    ctx.systemPrompt.suppressRuntimeContext()

    // A suppressor leaves `required: true` rows alone, so take the ones that
    // would otherwise survive and give each a `required: false` twin in this
    // layer. Empty text keeps the rendered snapshot empty even if something
    // still reads the entry.
    let required = new Map()
    try {
      required = requiredContextEntries(ctx.systemPrompt)
    } catch (_) {
      required = new Map()
    }
    for (const [contextName, entry] of required) {
      const order = Number.isFinite(entry.order) ? entry.order : 0
      try {
        ctx.effect(() => ctx.systemPrompt.context({
          name: contextName,
          order,
          required: false,
          interpolate: false,
          text: '',
        }), 'persona-file.shadowContext(' + contextName + ')')
      } catch (_) {
        // A name already shadowed in this layer is not worth failing the row.
      }
    }
  }

  if (noTools) {
    // `allow: []` keeps only an empty set of inherited globals: the registry
    // accepts it (no unknown names) and intersects it with every ancestor
    // restriction. This row's own registrations stay visible, which is why
    // the preset must also not register any tool.
    try {
      ctx.effect(() => ctx.tools.restrict({ allow: [] }), 'persona-file.restrictTools()')
    } catch (error) {
      // Older or reshaped hosts: say so once instead of failing the whole
      // preset. The persona half still leaves an empty system prompt.
      try {
        ctx.logger.warn('persona-file: tools.restrict({ allow: [] }) unavailable: ' +
          (error && error.message ? error.message : String(error)))
      } catch (_) { /* ignore */ }
    }
  }
}
