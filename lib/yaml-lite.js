/**
 * yaml-lite - 一个只覆盖 agent.cordis.yml 实际用法的 YAML 子集解析器。
 *
 * 为什么自带：DSH 的 agent-preset registry 在新版改为「声明式注册」——
 * 插件必须把 composition 解析成结构化 plugins 数组交给 register()。
 * 宿主的 YAML 库装在其自身 node_modules 内，插件（link 安装）解析不到，
 * 因此这里实现一个够用的子集解析器（社区 preset-center 同样自带解析器）。
 *
 * 支持（经真实预设文件扫描确认，覆盖 100% 现有用法）：
 *   - 顶层序列（`- `）、映射（`key: value`）、任意嵌套
 *   - 标量：裸字符串、单/双引号字符串、数字、true/false、null/~
 *   - flow 序列：`[a, b, c]` 与 flow 映射：`{a: 1}`
 *   - `!!js <表达式>` -> { __jsExpr: '<表达式>' }（宿主自行求值）
 *   - 块标量：`|`、`|-`、`|+`、`>`、`>-`、`>+`（含缩进剥离）
 *   - 注释（`#`，仅在非引号上下文）与空行
 *
 * 明确不支持（现有文件均未使用；遇到即抛错，绝不静默猜错）：
 *   锚点/别名（&/*）、多文档（---）、复杂键（? ）、制表符缩进。
 */

/** 解析失败时抛出，带行号，便于定位问题文件。 */
export class YamlLiteError extends Error {
  constructor(message, line) {
    super(line === undefined ? message : `${message} (第 ${line + 1} 行)`)
    this.name = 'YamlLiteError'
  }
}

const RE_TAG_JS = /^!!js(?:\s|$)/
const RE_NUM = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/

/** 去掉一行末尾的行内注释（引号内的 # 不算注释）。 */
function stripComment(line) {
  let inSingle = false
  let inDouble = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === "'" && !inDouble) inSingle = !inSingle
    else if (ch === '"' && !inSingle) {
      if (inDouble && line[i - 1] === '\\') continue
      inDouble = !inDouble
    } else if (ch === '#' && !inSingle && !inDouble) {
      // `#` 只有当它前面是行首或空白时才是注释
      if (i === 0 || /\s/.test(line[i - 1])) return line.slice(0, i)
    }
  }
  return line
}

/** 读一个标量：引号、!!js、flow、数字、布尔、null。 */
function parseScalar(raw, lineNo) {
  const s = raw.trim()
  if (s === '') return null

  // !!js 表达式：宿主认识 { __jsExpr }，会自行求值
  if (RE_TAG_JS.test(s)) {
    const expr = s.replace(RE_TAG_JS, '').trim()
    if (expr === '') throw new YamlLiteError('!!js 缺少表达式', lineNo)
    return { __jsExpr: unquote(expr) }
  }

  if (s[0] === "'") {
    if (s[s.length - 1] !== "'" || s.length < 2) throw new YamlLiteError('单引号字符串未闭合', lineNo)
    return s.slice(1, -1).replace(/''/g, "'")
  }
  if (s[0] === '"') {
    if (s[s.length - 1] !== '"' || s.length < 2) throw new YamlLiteError('双引号字符串未闭合', lineNo)
    return unescapeDouble(s.slice(1, -1))
  }
  if (s[0] === '[') return parseFlowSeq(s, lineNo)
  if (s[0] === '{') return parseFlowMap(s, lineNo)

  if (s === 'true') return true
  if (s === 'false') return false
  if (s === 'null' || s === '~') return null
  if (RE_NUM.test(s)) return Number(s)
  return s
}

/** 单层 flow 序列；元素可为引号字符串或标量。 */
function parseFlowSeq(s, lineNo) {
  if (s[s.length - 1] !== ']') throw new YamlLiteError('flow 序列未闭合', lineNo)
  const body = s.slice(1, -1).trim()
  if (body === '') return []
  return splitFlow(body, lineNo).map(function (part) { return parseScalar(part, lineNo) })
}

/** 单层 flow 映射，如 {a: 1, b: two}。 */
function parseFlowMap(s, lineNo) {
  if (s[s.length - 1] !== '}') throw new YamlLiteError('flow 映射未闭合', lineNo)
  const body = s.slice(1, -1).trim()
  const out = {}
  if (body === '') return out
  for (const part of splitFlow(body, lineNo)) {
    const idx = findTopColon(part)
    if (idx < 0) throw new YamlLiteError('flow 映射项缺少 ":"', lineNo)
    const k = unquote(part.slice(0, idx).trim())
    out[k] = parseScalar(part.slice(idx + 1), lineNo)
  }
  return out
}

/** 按顶层逗号切分 flow 内容（忽略引号/嵌套内的逗号）。 */
function splitFlow(body, lineNo) {
  const parts = []
  let depth = 0
  let inSingle = false
  let inDouble = false
  let cur = ''
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]
    if (ch === "'" && !inDouble) inSingle = !inSingle
    else if (ch === '"' && !inSingle) inDouble = !inDouble
    else if (!inSingle && !inDouble) {
      if (ch === '[' || ch === '{') depth++
      else if (ch === ']' || ch === '}') depth--
      else if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; continue }
    }
    cur += ch
  }
  if (inSingle || inDouble) throw new YamlLiteError('flow 内容中引号未闭合', lineNo)
  if (cur.trim() !== '') parts.push(cur)
  return parts
}

/** flow 项里第一个顶层冒号。 */
function findTopColon(part) {
  let inSingle = false
  let inDouble = false
  for (let i = 0; i < part.length; i++) {
    const ch = part[i]
    if (ch === "'" && !inDouble) inSingle = !inSingle
    else if (ch === '"' && !inSingle) inDouble = !inDouble
    else if (ch === ':' && !inSingle && !inDouble) return i
  }
  return -1
}

function unquote(s) {
  const t = s.trim()
  if (t.length >= 2 && t[0] === "'" && t[t.length - 1] === "'") return t.slice(1, -1).replace(/''/g, "'")
  if (t.length >= 2 && t[0] === '"' && t[t.length - 1] === '"') return unescapeDouble(t.slice(1, -1))
  return t
}

function unescapeDouble(s) {
  return s.replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/g, function (_, esc) {
    switch (esc[0]) {
      case 'n': return '\n'
      case 't': return '\t'
      case 'r': return '\r'
      case '"': return '"'
      case '\\': return '\\'
      case '/': return '/'
      case '0': return '\0'
      case 'u': return String.fromCharCode(Number.parseInt(esc.slice(1), 16))
      case 'x': return String.fromCharCode(Number.parseInt(esc.slice(1), 16))
      default: return esc
    }
  })
}

/** 缩进宽度（空格数）；制表符直接拒绝。 */
function indentOf(line, lineNo) {
  if (/^\t/.test(line)) throw new YamlLiteError('不支持制表符缩进', lineNo)
  let n = 0
  while (n < line.length && line[n] === ' ') n++
  return n
}

/** 判断 `key:` 还是 `key: value`，返回键名与值起始下标。 */
function splitKey(content, lineNo) {
  const idx = findTopColon(content)
  if (idx < 0) return null
  const key = content.slice(0, idx).trim()
  if (key === '') throw new YamlLiteError('映射键为空', lineNo)
  if (/[&*]/.test(key[0])) throw new YamlLiteError('不支持锚点/别名', lineNo)
  return { key: unquote(key), rest: content.slice(idx + 1) }
}

/**
 * 解析 YAML 文本。
 * @param {string} text - 文档内容。
 * @returns {unknown} 解析结果（composition 场景下为数组）。
 */
export function parseYaml(text) {
  const rawLines = String(text).split(/\r?\n/)
  // 预处理：算缩进、去注释、标记空行；块标量内容在解析时按需取用
  const lines = rawLines.map(function (line, i) {
    const stripped = stripComment(line)
    return { raw: line, text: stripped, indent: indentOf(stripped, i), blank: stripped.trim() === '', no: i }
  })

  let pos = 0

  function peek() {
    while (pos < lines.length && lines[pos].blank) pos++
    return pos < lines.length ? lines[pos] : null
  }

  /** 收集块标量（`|`/`>`）的正文。 */
  function readBlockScalar(header, headerIndent, lineNo) {
    const style = header[0]                // '|' 或 '>'
    const chomp = header[1] === '-' ? 'strip' : header[1] === '+' ? 'keep' : 'clip'
    const collected = []
    let blockIndent = -1
    while (pos < lines.length) {
      const cur = lines[pos]
      if (cur.blank) { collected.push(''); pos++; continue }
      if (cur.indent <= headerIndent) break
      if (blockIndent < 0) blockIndent = cur.indent
      collected.push(cur.raw.slice(Math.min(blockIndent, cur.raw.length)))
      pos++
    }
    // 去掉尾部空行（clip/strip 语义）
    while (collected.length && collected[collected.length - 1] === '') collected.pop()
    let out
    if (style === '|') out = collected.join('\n')
    else {
      // 折叠：连续非空行合并为空格
      out = collected.reduce(function (acc, l) {
        if (l === '') return acc + '\n'
        return acc === '' || acc.endsWith('\n') ? acc + l : acc + ' ' + l
      }, '')
    }
    return chomp === 'keep' ? out + '\n' : out
  }

  /** 解析一个节点：序列或映射，由首行决定。 */
  function parseNode(minIndent) {
    const first = peek()
    if (first === null || first.indent < minIndent) return null
    const content = first.text.trim()
    if (content === '-') {
      // 空序列项是合法的（值为 null），但需要允许其后缩进行
      return parseSeq(first.indent)
    }
    if (content.startsWith('- ')) return parseSeq(first.indent)
    return parseMap(first.indent)
  }

  function parseSeq(indent) {
    const out = []
    while (true) {
      const line = peek()
      if (line === null || line.indent < indent) break
      if (line.indent > indent) throw new YamlLiteError('序列项缩进不一致', line.no)
      const content = line.text.trim()
      if (!(content === '-' || content.startsWith('- '))) break
      const inline = content === '-' ? '' : content.slice(2)
      pos++
      if (inline === '') {
        // 项内容在后续更深的行
        const nested = parseNode(indent + 1)
        out.push(nested === null ? null : nested)
        continue
      }
      // 行内可能是 `key: value`（映射项开头）或标量
      const kv = splitKey(inline, line.no)
      if (kv === null) {
        out.push(parseScalar(inline, line.no))
        continue
      }
      // 序列项是个映射：先把这一项解析完，再继续读同级后续键
      const obj = {}
      assignKey(obj, kv, indent + 2, line.no, indent)
      // 继续读同一映射的后续键（缩进 >= indent+2，且不是新的序列项）
      while (true) {
        const next = peek()
        if (next === null || next.indent <= indent) break
        const nc = next.text.trim()
        if (nc === '-' || nc.startsWith('- ')) break
        pos++
        const nkv = splitKey(nc, next.no)
        if (nkv === null) throw new YamlLiteError('映射项缺少 ":"', next.no)
        assignKey(obj, nkv, next.indent, next.no, indent)
      }
      out.push(obj)
    }
    return out
  }

  /** 把一个 key 及其值写入 obj；值可能来自行内、嵌套块或块标量。 */
  function assignKey(obj, kv, keyIndent, lineNo, parentIndent) {
    const rest = kv.rest.trim()
    if (rest === '') {
      // 值在后续更深的行；若下一行缩进不足则值为 null
      const next = peek()
      if (next === null || next.indent <= keyIndent - 0) {
        // 用父缩进判断：下一行必须比键所在行更深
        if (next === null || next.indent <= parentIndent || next.indent <= keyIndent - 2) {
          obj[kv.key] = null
          return
        }
      }
      const nested = parseNode(next.indent)
      obj[kv.key] = nested === null ? null : nested
      return
    }
    if (/^[|>][-+]?$/.test(rest)) {
      obj[kv.key] = readBlockScalar(rest, keyIndent, lineNo)
      return
    }
    obj[kv.key] = parseScalar(rest, lineNo)
  }

  function parseMap(indent) {
    const out = {}
    while (true) {
      const line = peek()
      if (line === null || line.indent < indent) break
      if (line.indent > indent) throw new YamlLiteError('映射缩进不一致', line.no)
      const content = line.text.trim()
      if (content === '-' || content.startsWith('- ')) break
      pos++
      const kv = splitKey(content, line.no)
      if (kv === null) throw new YamlLiteError('映射项缺少 ":"', line.no)
      assignKey(out, kv, line.indent, line.no, indent)
    }
    return out
  }

  const result = parseNode(0)
  // 解析后应无剩余内容（除空行）
  const leftover = peek()
  if (leftover !== null) throw new YamlLiteError('存在无法解析的剩余内容', leftover.no)
  return result
}

/**
 * 解析 composition 文本，并把相对路径的 `name` 绝对化为 file URL。
 *
 * registry 的 register() 以结构化行接收声明，其 baseUrl 不是预设目录，
 * 因此 `./persona-file.mjs` 这类相对行必须在交给它之前绝对化。
 * @param {string} text - agent.cordis.yml 内容。
 * @param {string} baseDir - 预设目录绝对路径。
 * @returns {object[]} 交给 registry 的行数组。
 */
export function parseComposition(text, baseDir) {
  const value = parseYaml(text)
  if (!Array.isArray(value)) throw new YamlLiteError('composition 顶层必须是插件行列表')
  return absolutizeRows(value, baseDir)
}

/** 递归把行里的相对 name 转成 file URL。 */
export function absolutizeRows(rows, baseDir) {
  const { resolve, isAbsolute } = pathApi
  const sep = baseDir.includes('\\') ? '\\' : '/'
  return rows.map(function (row, i) {
    if (row === null || typeof row !== 'object' || Array.isArray(row)) {
      throw new YamlLiteError(`第 ${i + 1} 个插件行不是映射`)
    }
    const out = Object.assign({}, row)
    const name = out.name
    if (typeof name === 'string' && (name.startsWith('./') || name.startsWith('../'))) {
      out.name = toFileUrl(resolve(baseDir, name))
    } else if (typeof name === 'string' && isAbsolute(name)) {
      out.name = toFileUrl(name)
    }
    if (out.group === true && Array.isArray(out.config)) {
      out.config = absolutizeRows(out.config, baseDir)
    }
    return out
  })
}

/** 极小的 path/url 适配（避免在本模块顶部引入无关依赖）。 */
const pathApi = {
  resolve: function (...parts) {
    // 仅用于把相对路径拼到已知绝对目录上
    const base = String(parts[0]).replace(/[\\/]+$/, '')
    let rel = String(parts[1])
    rel = rel.replace(/^\.\//, '')
    const segs = []
    for (const seg of (base + '/' + rel).split(/[\\/]+/)) {
      if (seg === '' || seg === '.') continue
      if (seg === '..') { segs.pop(); continue }
      segs.push(seg)
    }
    // Windows 盘符保留
    const joined = segs.join('/')
    return /^[A-Za-z]:/.test(joined) ? joined : '/' + joined
  },
  isAbsolute: function (p) {
    return /^([A-Za-z]:[\\/]|[\\/])/.test(String(p)) || String(p).startsWith('file:')
  },
}

/** 绝对路径 -> file URL（手工编码，避免依赖 node:url 的平台差异）。 */
function toFileUrl(p) {
  let s = String(p).replace(/\\/g, '/')
  if (s.startsWith('file:')) return s
  if (!s.startsWith('/')) s = '/' + s
  return 'file://' + s.split('/').map(function (seg, i) {
    if (i === 0) return ''
    return encodeURIComponent(seg).replace(/%3A/gi, ':')
  }).join('/')
}
