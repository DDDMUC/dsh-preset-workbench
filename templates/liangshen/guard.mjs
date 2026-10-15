/**
 * guard — the LiangShen preset's runtime degeneration circuit breaker.
 *
 * Why this exists: DSH discussion #5976 documents a model-side generation
 * degeneration on DeepSeek-V4.1-Flash under very long context and max
 * reasoning effort — the agent emits turn after turn of zero-output
 * self-urging reasoning with no tool call, no automatic fuse, and the run
 * has to be killed by hand. The persona's reflection-fuse discipline cannot
 * stop it, because in that state the discipline text itself has fallen out of
 * the effective context. The only thing that works is an OUTSIDE force, and
 * the report's own conclusion is that this guard-layer gap can be filled by a
 * plugin without touching the DSH core. This plugin is that outside force.
 *
 * Two signals, both folded from the durable session event stream (never from
 * process memory, so resume and compaction rebuild the same verdict):
 *
 * - STALL: N consecutive assistant steps that carry reasoning but neither a
 *   tool call nor any visible reply text — the #5976 shape. Reading the
 *   reasoning TEXT is unnecessary (and impossible on routes that redact it);
 *   the block's character count is the objective "long thinking" measure.
 *   On a route that persists signed reasoning blocks with NO text, every
 *   character count reads zero and the character ladders can never fire, so a
 *   session in which no reasoning text was ever observed falls back to a
 *   step-count measure (see DEFAULT_BLIND_STALL_CAP) and says so once.
 * - ECHO: the same tool called with the same arguments failing M times in a
 *   row with no success in between — the closed loop of repeating one broken
 *   call.
 *
 * On either signal the breaker FIRES once per episode with a circuit-breaker
 * user message injected at the next pre-step (the one channel guaranteed to
 * reach the model, as durable as the working-context projection), telling the
 * model the loop was interrupted and to close out or pick a materially
 * different action.
 *
 * A STALL additionally arms a temporary reasoning-effort step-down that rides
 * the `agent/request` waterfall for the next FEW requests: one notch down
 * `max -> high`, and `high` (like every other level) is left alone. Lowering
 * the budget is the community-observed recovery move (r/DeepSeek 1whgo3e) and
 * the official effort-cost curve puts the sweet spot below max — neither piece
 * of evidence supports going BELOW the 60-80 sweet spot, so the ladder stops
 * at `high`. ECHO does NOT step down: its cause is a broken call, not an
 * over-large budget, and lowering the effort would weaken a model that is
 * already stuck. This is the ONLY moment this plugin rewrites a request: with
 * no signal it never touches one, so prefix-cache stability and the user's
 * explicit model-selector effort stay untouched — the constraint recorded in
 * the Agent Note that removed the old phase-based switching.
 *
 * Recovery: a step with a tool call or a visible reply re-arms the breaker
 * and, once the step-down window has run its requests, the route's own effort
 * resumes unchanged. Thresholds are deliberately conservative — a false
 * interruption of real long thinking hurts more than a missed episode.
 */

/** Cordis plugin name used by loader diagnostics. */
export const name = 'liangshen-guard'

/**
 * How many consecutive runaway-reasoning zero-output steps trip the per-step
 * ladder. ONE is deliberate: a single step whose reasoning alone blows past
 * the character floor with no output is already the runaway-generation shape
 * (#5976's first symptom), and waiting for a second one just lets the episode
 * burn another 384K-scale generation. The slow-burn ladder below carries the
 * burden of proof for smaller steps, so this ladder staying hair-trigger does
 * not raise the false-positive rate — a step has to be individually enormous
 * AND output-free to count.
 */
export const DEFAULT_STALL_STEPS = 1

/**
 * The per-step reasoning-character floor for a step to count as "long",
 * keyed by the request's CURRENT reasoning effort. The floor follows the
 * budget the model was asked to spend: max effort produces the longest
 * trajectories (official data: 1.6-1.8x the sweet spot) and is where every
 * documented runaway happened, so its floor is the lowest; low effort thinks
 * briefly by design, so a zero-output step that still runs long is almost
 * certainly abnormal and the floor can sit higher without false positives.
 *
 * Calibration anchor: DeepSeek-V4.1's official MAX OUTPUT is 384K. The max-
 * effort floor of 8000 chars (roughly 2-4K thinking tokens) is far beyond any
 * healthy single step yet catches a runaway in its first 2% — waiting for a
 * higher floor just lets the episode burn more of the 384K budget.
 */
export const STALL_REASONING_CHARS_BY_EFFORT = {
  max: 8000,
  high: 12000,
  low: 20000,
}
/** Floor for unknown effort levels (numeric efforts, off): the per-step ladder
 * stays armed at the high-effort floor; the slow-burn ladder carries the rest. */
export const DEFAULT_STALL_REASONING_CHARS = 12000

/** How many identical-argument failures in a row constitute an echo loop. */
export const DEFAULT_ECHO_FAILURES = 3

/**
 * Steps with at least this much reasoning count toward the global (slow-burn)
 * stall ladder. Deliberately low: the ladder exists to catch the loop of many
 * individually-plausible-but-output-free steps, so any step that really thought
 * counts; a step that barely reasoned (a tool ack, an empty turn) must not.
 */
export const GLOBAL_MIN_REASONING_CHARS = 200

/** How many consecutive output-free reasoning steps trip the slow-burn ladder. */
export const DEFAULT_GLOBAL_STALL_CAP = 4

/**
 * Consecutive output-free steps that trip STALL on a route that never produced
 * any reasoning text. Both character ladders read zero there, so the step count
 * is the only objective measure left; the cap matches the slow-burn ladder's,
 * which keeps the fallback as conservative as the ladder it stands in for.
 */
export const DEFAULT_BLIND_STALL_CAP = 4

/**
 * Sensitivity presets: a whole-scale multiplier over the adaptive thresholds,
 * for operators who know they fear false interruptions more than missed
 * episodes (or the reverse) without hand-tuning four numbers.
 * - conservative: every floor and cap x 1.5, rounded — fewest interruptions.
 * - balanced: x 1.0, the calibrated defaults.
 * - aggressive: every floor x 0.5 and every cap - 1 (floored at the minimums) —
 *   catches episodes earlier at the cost of more false positives.
 */
export const SENSITIVITY_OPTIONS = ['conservative', 'balanced', 'aggressive']
export const DEFAULT_SENSITIVITY = 'balanced'
const SENSITIVITY_SCALE = { conservative: 1.5, balanced: 1.0, aggressive: 0.5 }

/** Requests the temporary effort step-down stays on for after firing. */
export const DEFAULT_STEP_DOWN_REQUESTS = 3

/** Steps the breaker stays quiet after firing once (no message spam). */
export const DEFAULT_REFIRE_COOLDOWN_STEPS = 5

/**
 * The effort ladder a step-down walks along: one notch down from `max` only.
 * `high` is where the ladder stops, because the official effort-cost curve
 * puts the model's sweet spot at 60-80 and nothing supports stepping below it;
 * every other level (including `high` itself) is left alone.
 */
const EFFORT_LADDER = ['max', 'high']

/** Validate a positive-integer config value, or fall back when absent. */
function integerAtLeast(value, field, minimum, fallback) {
  if (value === undefined) return fallback
  if (!Number.isInteger(value) || value < minimum) {
    throw new TypeError(`${name}: ${field} must be an integer >= ${minimum}`)
  }
  return value
}

/** Session events, tolerating both snapshotEvents() and events array. */
function sessionEvents(session) {
  if (Array.isArray(session?.events)) return session.events
  if (typeof session?.snapshotEvents === 'function') return session.snapshotEvents()
  return []
}

/** Reasoning characters one assistant/message event carries. */
function reasoningCharsOf(event) {
  let chars = 0
  for (const block of event?.data?.message?.content ?? []) {
    if (block?.type === 'reasoning') chars += String(block.text ?? '').length
  }
  return chars
}

/** Reasoning blocks one assistant/message event carries, text or not. */
function reasoningBlocksOf(event) {
  let blocks = 0
  for (const block of event?.data?.message?.content ?? []) {
    if (block?.type === 'reasoning') blocks += 1
  }
  return blocks
}

/** Visible reply blocks (non-empty text) one assistant/message event carries. */
function visibleRepliesOf(event) {
  let count = 0
  for (const block of event?.data?.message?.content ?? []) {
    if (block?.type === 'text' && String(block.text ?? '').trim().length > 0) count += 1
  }
  return count
}

/** Stable signature for one tool call: name plus canonicalized arguments. */
function callSignature(event) {
  const tool = event?.data?.name
  if (typeof tool !== 'string') return undefined
  let args = event.data?.arguments
  if (typeof args === 'string') {
    try { args = JSON.parse(args) } catch { /* keep raw string */ }
  }
  let canonical
  try { canonical = JSON.stringify(args ?? null) } catch { canonical = String(args) }
  return `${tool}${canonical}`
}

/** The tool/result matching one callId carried an error. */
function isErrorResult(event) {
  if (event?.type !== 'tool/result') return false
  const data = event.data
  if (data?.error !== undefined && data.error !== null) return true
  const message = data?.message
  if (message?.isError === true) return true
  return false
}

/**
 * Fold the breaker verdict from the event stream.
 *
 * The fold tracks, walking newest-last:
 * - a running count of consecutive zero-output long-reasoning steps
 *   (assistant/message events with reasoning chars above the threshold and
 *   neither a following tool/call nor visible text before the next step/
 *   turn boundary);
 * - the latest tool call's signature and its consecutive-failure count,
 *   reset by any success or any differently-shaped call.
 *
 * Returns `{ signal: 'stall' | 'echo' | undefined, detail, blind }` for the TAIL
 * of the stream: the breaker only cares whether the session is degenerate NOW.
 * `blind` reports the session-level fact that reasoning blocks were observed
 * without a single character of reasoning text, so the caller can say once that
 * this session's stall detection is running on step counts.
 */
export function foldGuardSignal(events, options) {
  const stallSteps = options?.stallSteps ?? DEFAULT_STALL_STEPS
  const stallChars = options?.stallReasoningChars ?? DEFAULT_STALL_REASONING_CHARS
  const echoFailures = options?.echoFailures ?? DEFAULT_ECHO_FAILURES
  const globalCap = options?.globalStallCap ?? DEFAULT_GLOBAL_STALL_CAP
  const blindCap = options?.blindStallCap ?? DEFAULT_BLIND_STALL_CAP

  // Stall, two independent ladders walked in parallel:
  //  1. PER-STEP: one step whose reasoning alone blows past the character floor
  //     with no output — the runaway-generation shape (#5976's first symptom).
  //  2. GLOBAL: N consecutive steps with NO output at all, regardless of each
  //     step's size — the slow-burn closed loop. This ladder is bounded by a
  //     hard global cap so a legitimately long investigation (many small
  //     read-only steps) cannot trip it by accumulation alone: the streak only
  //     counts while the steps are also individually reasoning-heavy.
  //  3. BLIND (fallback): on a route that persists signed reasoning blocks
  //     with no text, every character measure reads zero and ladders 1 and 2
  //     are structurally dead. When the whole stream carried reasoning blocks
  //     but not one character of reasoning text, the step count is the only
  //     measure left, so consecutive output-free reasoning-block steps trip
  //     STALL at the same cap the slow-burn ladder uses.
  let stallStreak = 0
  let globalStreak = 0
  let blindStreak = 0
  // Session-level facts the blind fallback keys on: whether ANY reasoning text
  // was ever observed, and whether any reasoning block was observed at all.
  // A stream with no reasoning block yet (a fresh session) is NOT blind — the
  // character ladders have simply not had their chance.
  let reasoningTextSeen = false
  let reasoningBlocksSeen = 0
  // pending holds, for the current step, whether we saw reasoning and whether
  // we saw any output (tool call or visible text).
  let pendingReasoning = 0
  let pendingReasoningBlocks = 0
  let pendingOutput = false

  const closeStep = () => {
    // Per-step ladder: one bloated zero-output step is enough to advance it.
    if (pendingReasoning >= stallChars && !pendingOutput) {
      stallStreak += 1
    } else if (pendingOutput || pendingReasoning > 0) {
      stallStreak = 0
    }
    // Global ladder: any output resets; an output-free step advances it only
    // while the step also carried real reasoning (a bare tool-ack or an empty
    // thought must not count toward a stall).
    if (pendingOutput) {
      globalStreak = 0
    } else if (pendingReasoning >= GLOBAL_MIN_REASONING_CHARS) {
      globalStreak = Math.min(globalStreak + 1, globalCap)
    }
    // Blind ladder: an output-free step that still carried a reasoning block —
    // the exact shape a redacted route produces. Character count is not part of
    // the test, because on that route it is always zero.
    if (pendingOutput) {
      blindStreak = 0
    } else if (pendingReasoningBlocks > 0) {
      blindStreak = Math.min(blindStreak + 1, blindCap)
    }
    pendingReasoning = 0
    pendingReasoningBlocks = 0
    pendingOutput = false
  }

  // Echo: latest call signature and its consecutive failure count.
  let lastSignature
  let lastCallId
  let failStreak = 0

  for (const event of Array.isArray(events) ? events : []) {
    switch (event?.type) {
      case 'step/start':
      case 'turn/start':
        closeStep()
        break
      case 'assistant/message': {
        const reasoning = reasoningCharsOf(event)
        if (reasoning > 0) {
          pendingReasoning += reasoning
          reasoningTextSeen = true
        }
        const blocks = reasoningBlocksOf(event)
        if (blocks > 0) {
          pendingReasoningBlocks += blocks
          reasoningBlocksSeen += blocks
        }
        if (visibleRepliesOf(event) > 0) pendingOutput = true
        break
      }
      case 'tool/call': {
        pendingOutput = true
        const signature = callSignature(event)
        if (signature !== lastSignature) {
          lastSignature = signature
          failStreak = 0
        }
        lastCallId = event.data?.callId
        break
      }
      case 'tool/result': {
        const callId = event.data?.callId ?? event.data?.message?.source?.callId
        if (callId !== undefined && lastCallId !== undefined && callId !== lastCallId) break
        if (isErrorResult(event)) {
          if (lastSignature !== undefined) failStreak += 1
        } else {
          failStreak = 0
          lastSignature = undefined
          lastCallId = undefined
        }
        break
      }
      default:
        break
    }
  }
  closeStep()

  // The blind fallback applies only when the session really is on a redacted
  // route: reasoning blocks were observed, none of them carried any text.
  const blind = !reasoningTextSeen && reasoningBlocksSeen > 0
  if (blind && blindStreak >= blindCap) {
    return {
      signal: 'stall',
      detail: `${blindStreak} consecutive output-free reasoning steps (no reasoning text in this session)`,
      blind,
    }
  }
  if (stallStreak >= stallSteps) {
    return { signal: 'stall', detail: `${stallStreak} consecutive runaway-reasoning steps (${stallChars}+ chars each)`, blind }
  }
  if (globalStreak >= globalCap) {
    return { signal: 'stall', detail: `${globalStreak} consecutive output-free reasoning steps (slow burn)`, blind }
  }
  if (failStreak >= echoFailures) {
    return { signal: 'echo', detail: `${failStreak} consecutive identical-argument tool failures`, blind }
  }
  return { signal: undefined, detail: '', blind }
}

/**
 * Resolve the concrete thresholds for one request: the adaptive floor for the
 * current effort, scaled by the sensitivity preset, with any explicit fine-
 * tuning override winning over the table. All inputs are optional; the result
 * is always a complete, valid set. Every guard fine-tuning field is absent by
 * default, which is what lets the effort table and the sensitivity preset be
 * the shipped behavior rather than dead branches behind a factory value.
 */
export function resolveThresholds(options) {
  const effort = options?.effort
  const sensitivity = SENSITIVITY_SCALE[options?.sensitivity] !== undefined ? options.sensitivity : DEFAULT_SENSITIVITY
  const scale = SENSITIVITY_SCALE[sensitivity]
  const baseFloor = STALL_REASONING_CHARS_BY_EFFORT[effort] ?? DEFAULT_STALL_REASONING_CHARS
  const stallReasoningChars = options?.stallReasoningChars !== undefined
    ? options.stallReasoningChars
    : Math.max(200, Math.round(baseFloor * scale))
  const globalStallCap = options?.globalStallCap !== undefined
    ? options.globalStallCap
    : Math.max(2, Math.round(DEFAULT_GLOBAL_STALL_CAP * scale))
  const echoFailures = options?.echoFailures !== undefined
    ? options.echoFailures
    : Math.max(2, Math.round(DEFAULT_ECHO_FAILURES * scale))
  // The blind fallback carries no fine-tuning field of its own: it is a
  // degraded stand-in for the slow-burn ladder, so it scales with the same
  // sensitivity preset unless the caller pins the slow-burn cap explicitly.
  const blindStallCap = options?.blindStallCap !== undefined
    ? options.blindStallCap
    : globalStallCap
  return { stallReasoningChars, globalStallCap, echoFailures, blindStallCap }
}

/**
 * One notch down the effort ladder, or undefined when the level is left alone.
 * Only `max` moves, and it moves to `high`: the ladder stops at the sweet
 * spot, so a session the user explicitly put on `high` is never weakened.
 */
export function stepDownEffort(effort) {
  const index = EFFORT_LADDER.indexOf(effort)
  if (index < 0 || index === EFFORT_LADDER.length - 1) return undefined
  return EFFORT_LADDER[index + 1]
}

/** The breaker message injected at pre-step. */
export function renderGuardMessage(verdict) {
  const what = verdict.signal === 'stall'
    ? 'repeated long reasoning with no tool call and no reply'
    : 'the same tool call failing repeatedly with identical arguments'
  return [
    `[Circuit Breaker] The runtime interrupted a degeneration loop: ${what}.`,
    'Stop re-deriving in thought. Do exactly ONE of these now:',
    '1. give the user the best final answer you already have, or',
    '2. take ONE materially different concrete action (a different tool, different arguments, or a smaller sub-step) and verify its result.',
    'Do not repeat the interrupted pattern.',
  ].join(' ')
}

/** Register the signal fold, the pre-step injection, and the stall-triggered effort step-down. */
export function apply(ctx, config) {
  const enabled = config?.enabled !== false
  if (!enabled) return
  const sensitivity = SENSITIVITY_OPTIONS.includes(config?.sensitivity) ? config.sensitivity : DEFAULT_SENSITIVITY
  // Fine-tuning overrides: when the operator sets one, it wins over the
  // adaptive table for every effort level; absent, the table applies.
  const overrideStallChars = config?.stallReasoningChars !== undefined
    ? integerAtLeast(config.stallReasoningChars, 'stallReasoningChars', 200, DEFAULT_STALL_REASONING_CHARS)
    : undefined
  const overrideGlobalCap = config?.globalStallCap !== undefined
    ? integerAtLeast(config.globalStallCap, 'globalStallCap', 2, DEFAULT_GLOBAL_STALL_CAP)
    : undefined
  const overrideEcho = config?.echoFailures !== undefined
    ? integerAtLeast(config.echoFailures, 'echoFailures', 2, DEFAULT_ECHO_FAILURES)
    : undefined
  const stallSteps = integerAtLeast(config?.stallSteps, 'stallSteps', 1, DEFAULT_STALL_STEPS)
  const stepDownRequests = integerAtLeast(config?.stepDownRequests, 'stepDownRequests', 1, DEFAULT_STEP_DOWN_REQUESTS)
  const refireCooldown = integerAtLeast(config?.refireCooldownSteps, 'refireCooldownSteps', 1, DEFAULT_REFIRE_COOLDOWN_STEPS)

  // Per-agent runtime state: the breaker cooldown / step-down window, the
  // current reasoning effort the request waterfall observed, and whether this
  // session's degraded stall detection has already been reported. The signal
  // itself always re-derives from the durable event stream, so a resume never
  // inherits a stale verdict; the effort is a read-only observation, never a
  // rewrite outside a fired episode.
  const stateByAgent = new WeakMap()
  const stateOf = (agent) => {
    let state = stateByAgent.get(agent)
    if (state === undefined) {
      state = { cooldown: 0, firedVerdict: undefined, stepDownLeft: 0, currentEffort: undefined, blindWarned: false }
      stateByAgent.set(agent, state)
    }
    return state
  }

  ctx.on('agent/disposed', ({ agent }) => { stateByAgent.delete(agent) })

  // One listener, two jobs ordered by where the information lives: the request
  // waterfall sees the effort FIRST (it is part of the resolved call config),
  // so it records the current effort for the NEXT pre-step's threshold
  // resolution, and — only inside a fired episode's window — steps it down.
  ctx.on('agent/request', async (payload, next) => {
    const resolved = await next()
    const agent = payload?.agent
    if (agent === undefined) return resolved
    const state = stateOf(agent)
    // Read-only observation: the effort the route actually resolved. This never
    // changes the request by itself.
    if (typeof resolved?.reasoningEffort === 'string') state.currentEffort = resolved.reasoningEffort
    if (state.stepDownLeft === 0) return resolved
    state.stepDownLeft -= 1
    const lowered = stepDownEffort(resolved?.reasoningEffort)
    if (lowered === undefined) return resolved
    return { ...resolved, reasoningEffort: lowered }
  })

  // Fold the signal and inject the breaker message. step/start is not emitted
  // as a ctx event on every host, so the fold runs inside pre-step — the one
  // hook guaranteed before each model request — using the effort the most
  // recent agent/request observation recorded (undefined until the first one).
  ctx.on('agent/pre-step', async (payload, next) => {
    const decision = await next()
    if (decision.kind !== 'enter') return decision
    const agent = payload?.agent
    if (agent === undefined) return decision
    const state = stateOf(agent)

    const thresholds = resolveThresholds({
      effort: state.currentEffort,
      sensitivity,
      stallReasoningChars: overrideStallChars,
      globalStallCap: overrideGlobalCap,
      echoFailures: overrideEcho,
    })
    const verdict = foldGuardSignal(sessionEvents(agent.session), { stallSteps, ...thresholds })

    // A redacted route makes both character ladders structurally dead; the fold
    // has fallen back to step counts. Say so once per agent, because a session
    // whose stall detection is degraded is a fact an operator debugging a
    // missed episode needs, and the breaker's own fire log never carries it.
    if (verdict.blind && !state.blindWarned) {
      state.blindWarned = true
      try { ctx.logger?.warn?.(`${name}: this session persisted reasoning blocks without any reasoning text, so stall detection is degraded to step counts (${thresholds.blindStallCap} consecutive output-free steps)`) } catch {}
    }

    if (verdict.signal !== undefined && state.cooldown === 0) {
      // Fire: inject the breaker message, and arm the effort step-down only for
      // a STALL. A stall is an over-large reasoning budget, which is what
      // lowering the effort addresses; an echo is a broken call, where
      // weakening the model would only make the loop harder to escape.
      state.cooldown = refireCooldown
      if (verdict.signal === 'stall') state.stepDownLeft = stepDownRequests
      state.firedVerdict = verdict
      const message = {
        id: globalThis.crypto.randomUUID(),
        role: 'user',
        content: [{ type: 'text', text: renderGuardMessage(verdict) }],
        source: { kind: name },
      }
      try { ctx.logger?.warn?.(`${name}: circuit breaker fired (${verdict.detail}) [${thresholds.stallReasoningChars}ch/${thresholds.globalStallCap}steps/${thresholds.echoFailures}fails, ${sensitivity}, effort ${state.currentEffort ?? 'unknown'}, ${verdict.signal === 'stall' ? `step-down ${String(stepDownRequests)} requests` : 'message only'}]`) } catch {}
      return { ...decision, messages: [...decision.messages, message] }
    }

    if (state.cooldown > 0) state.cooldown -= 1
    return decision
  })
}
