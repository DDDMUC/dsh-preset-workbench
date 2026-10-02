/**
 * preset-workbench (browser) - settings section "预设工作台".
 * Registers one settings.section page: pick a user preset, edit its prompt
 * sections (each with an enabled flag), save, create, delete, validate, or
 * open its directory. All host work goes through the POST bridge
 * /api/preset-workbench (loopback).
 *
 * Layout note: every control lives in the pinned top area; only the section
 * cards scroll. Theme follows the shell via --dsw-alias-* tokens.
 */
(function () {
  'use strict'

  window.__ModuleLoader__.load({
    id: 'dsh-preset-workbench',
    factory: function (require) {
      var module = { exports: {} }
      var exports = module.exports
      Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

      var react = require('react')
      var h = react.createElement

      var cssText = [
        '.pwt-root{display:flex;flex-direction:column;gap:10px;font-size:13px;line-height:1.6;height:100%;min-height:0;color:var(--dsw-alias-label-primary)}',
        '.pwt-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}',
        '.pwt-select,.pwt-input{background:var(--dsw-specific-input-major,var(--dsw-alias-bg-layer-2));border:1px solid var(--dsw-alias-border-l2);border-radius:6px;color:var(--dsw-alias-label-primary);padding:4px 8px;font-size:13px}',
        '.pwt-select option,.pwt-select optgroup{background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary)}',
        '.pwt-btn{background:var(--dsw-alias-bg-layer-3);border:1px solid var(--dsw-alias-border-l2);border-radius:6px;color:var(--dsw-alias-label-primary);padding:4px 10px;cursor:pointer;font-size:13px}',
        '.pwt-btn:hover:not([disabled]){background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}',
        '.pwt-btnDanger{color:var(--dsw-alias-state-error-primary)}',
        '.pwt-btn[disabled]{opacity:.45;cursor:default}',
        '.pwt-status{color:var(--dsw-alias-label-secondary);font-size:12px;white-space:pre-wrap;word-break:break-all}',
        '.pwt-statusError{color:var(--dsw-alias-state-error-primary)}',
        '.pwt-card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:6px}',
        '.pwt-sections{display:flex;flex-direction:column;gap:10px;overflow:auto;min-height:0;flex:1;padding-right:4px}',
        '.pwt-ta{width:100%;box-sizing:border-box;background:var(--dsw-specific-input-major,var(--dsw-alias-bg-layer-2));border:1px solid var(--dsw-alias-border-l2);border-radius:6px;color:var(--dsw-alias-label-primary);font-family:Consolas,Menlo,monospace;font-size:12.5px;line-height:1.55;padding:8px;resize:vertical}',
        '.pwt-ta:focus-visible,.pwt-input:focus-visible,.pwt-select:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-1px}',
        '.pwt-hint{color:var(--dsw-alias-label-tertiary);font-size:12px}',
        '.pwt-file{color:var(--dsw-alias-label-tertiary);font-size:11px}',
        '.pwt-grow{flex:1;min-width:160px}',
        '.pwt-tpl{min-width:150px;max-width:220px;flex:0 0 auto}',
        '.pwt-dd{position:relative;display:inline-block}',
        '.pwt-dd-btn{display:flex;align-items:center;gap:8px;width:100%;background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-3))}',
        '.pwt-dd-btn:hover{background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-3));border-color:var(--dsw-alias-label-dimmed)}',
        '.pwt-dd-label{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;text-align:left}',
        '.pwt-dd-caret{color:var(--dsw-alias-label-tertiary);font-size:11px}',
        '.pwt-dd-menu{position:absolute;top:calc(100% + 4px);left:0;min-width:230px;max-width:340px;max-height:280px;overflow-y:auto;background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-3));border:1px solid var(--dsw-alias-border-l2);border-radius:8px;box-shadow:0 6px 20px rgba(0,0,0,.28);z-index:999;padding:4px}',
        '.pwt-dd-group{display:flex;flex-direction:column}',
        '.pwt-dd-glabel{font-size:11px;color:var(--dsw-alias-label-tertiary);padding:3px 8px 2px}',
        '.pwt-dd-opt{display:block;width:100%;text-align:left;background:none;border:none;color:var(--dsw-alias-label-primary);padding:5px 8px;border-radius:5px;cursor:pointer;font-size:13px}',
        '.pwt-dd-opt:hover{background:var(--dsw-alias-button-floating-hover,var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2)));color:var(--dsw-alias-label-primary)}',
        '.pwt-dd-sel{color:var(--dsw-alias-brand-primary);font-weight:600}',
        '.pwt-dd-opt.pwt-dd-sel{background:var(--dsw-alias-interactive-bg-active,var(--dsw-alias-bg-layer-2))}',
        '.pwt-title{font-weight:600}',
        'details.pwt-help{border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:6px 10px;background:var(--dsw-alias-bg-layer-3)}',
        'details.pwt-help summary{cursor:pointer;color:var(--dsw-alias-label-secondary);font-size:12px;user-select:none}',
        'details.pwt-help[open] summary{margin-bottom:6px}',
        'details.pwt-help ul{margin:4px 0 4px 18px;padding:0}'
      ].join('\n')

      function rpc(op, payload) {
        var body = Object.assign({ op: op, lang: localStorage.getItem('pwt-lang') || 'zh' }, payload || {})
        return fetch('/api/preset-workbench', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }).then(function (res) { return res.json() })
      }

      // ── 字符串表（中/英）──「中英切换键」的文案仓库 ──
      // t(key, ...args)：按当前语言取 {0}/{1} 占位替换。
      var DICT = {
        zh: {
          'sectionTitle': '预设工作台',
          'lang': 'English',
          'whatIs': '❓ 预设是什么？怎么用本页？点开看 30 秒说明',
          'whatIsP1': '预设 = 新会话的「开局配置包」。你在新会话前选择哪个预设，那个会话里的 AI 就是什么人设、什么能力。',
          'whatIsP2': '一个预设包含三样：① 人设提示词（本页编辑的主体，可分多段）② 能力配置（下方「能力开关」里打勾即可加减工具）③ 名字与简介',
          'whatIsP3a': '新建自己的预设：',
          'whatIsP3b': '点下方「新建预设」→ 起个 id（英文小写，如 my-rp）和显示名 → 它会复制鲸鱼娘的全部内容 → 在编辑区改成你的设定 → 点「保存全部」→ 新开会话，在选择器里选它。完事。',
          'whatIsP4a': '改名/改简介：',
          'whatIsP4b': '选中预设 → 点「打开目录」→ 用记事本改 preset.yml 里的 name 和 description 两行。',
          'whatIsP5a': '勾选框：',
          'whatIsP5b': '取消勾选的段保留文字但不进入系统提示词（不给 AI 看）。',
          'whatIsP6a': '保存后：',
          'whatIsP6b': '只对之后新开的会话生效，当前正在聊的会话不变。',
          'currentPreset': '当前预设：',
          'openDir': '打开目录',
          'openDirTip': '在资源管理器中打开这个预设的文件夹',
          'validate': '校验挂载',
          'validateTip': '模拟一次会话加载，检查预设能否正常使用',
          'bindTitle': '工作区默认预设',
          'bindDesc': '给每个工作项目（工作区目录）绑定一个预设。之后在这个工作区新开的会话会自动用它，不用每次手动选；没绑定的目录沿用全局默认。对已经在聊的会话无影响。',
          'bindEmpty': '还没有工作区。先在左侧栏添加工作项目，再回来绑定。',
          'bindNone': '（不绑定，用全局默认）',
          'bindOrphan': '此目录已不在工作区列表，但绑定仍在——新会话若从这里启动仍会生效。',
          'bindHint': '子目录里的新会话也会继承绑定。手动为新会话选过预设时，以手动选择为准。',
          'bindOk': '已绑定：新会话将使用「{0}」。',
          'bindCleared': '已解除绑定，恢复全局默认。',
          'bindFail': '绑定失败: ',
          'newPreset': '新建预设',
          'collapse': '收起新建',
          'deletePreset': '删除预设',
          'deleteTip': '删除整个预设文件夹（两击确认防手滑）',
          'confirmDel': '⚠ 确认删除 {0} ？再点一次',
          'selectUnit': '（选择）',
          'brokenTag': '（损坏）',
          'template': '模板：',
          'idLabel': 'id：',
          'nameLabel': '显示名：',
          'idPlaceholder': '英文小写，如 my-rp',
          'namePlaceholder': '如 我的角色扮演',
          'createFrom': '从模板创建',
          'noTemplateSel': '请先选择模板',
          'creating': '创建中…',
          'created': '已创建: {0}。现在编辑它的提示词段落，改完记得点「保存全部」，然后在新会话的选择器里选它。',
          'createFail': '创建失败: ',
          'deleteFail': '删除失败: ',
          'deleted': '已删除预设: {0}',
          'addSection': '＋添加段落',
          'saveAll': '💾 保存全部',
          'saveHintNone': '（先在上面选择一个预设）',
          'saveHintLoading': '（读取中…）',
          'saving': '保存中…',
          'saved': '已保存 {0} 段。新开的会话生效；当前会话不变。',
          'saveFail': '保存失败: ',
          'validating': '校验中…',
          'validOk': '挂载校验通过 ✔ 下次新开会话可以正常加载这个预设。',
          'validFail': '挂载校验失败：{0}',
          'validReqFail': '校验请求失败: ',
          'openDirFail': '打开目录失败: ',
          'openDirOk': '已打开目录: {0}（可在此用记事本改 preset.yml 的名字和简介）',
          'loadFail': '读取失败: ',
          'capsTitle': '🧰 能力开关：给这个预设加/减工具（打勾立即生效，自动校验）',
          'capsDesc': '下面是可选能力。勾上 → 把对应工具装进这个预设；取消 → 移除。每次切换会自动校验并提示结果。只对之后新开的会话生效。',
          'capsRo': '官方预设只读——不可修改。想改成自己的，复制一份再编辑。',
          'capsHint': '选中预设后这里会列出可开关的能力',
          'capOn': '开启',
          'capOff': '关闭',
          'capToggle': '能力「{0}」{1}。新会话生效；挂载校验{2}',
          'capOk': '通过 ✔',
          'capFail': '失败：{0}',
          'capSwitchFail': '能力切换失败: ',
          'badgeWired': '🔌 已接线（未启用）',
          'badgeOn': '✓ 已启用',
          'grpUser': '📁 用户模板',
          'grpSystem': '🏁 官方预设',
          'unitNone': '（未选择）',
          'nameWrap': '（{0}）',
          'curUserGrp': '用户预设',
          'curSystemGrp': '官方预设（只读）',
          'systemBadge': '官方预设',
          'systemReadonly': '这是官方预设，只读——不可修改。想改成自己的，复制一份再编辑。',
          'systemComp': '它带的能力组合：',
          'compEmpty': '（没有可展示的组合行）',
          'compOn': '启用',
          'compOff': '关闭',
          'compCore': '预设地基（不可关闭）',
          'enabled': '启用',
          'enabledTip': '勾选 = 这段生效；取消 = 保留文字但不给 AI 看',
          'secTitlePh': '段落标题',
          'delSec': '删除段',
          'secTextPh': '这一段提示词内容…',
          'loading': '读取中…',
          'pickFirst': '先在上面选择一个预设',
          'noSections': '该预设还没有分段提示词',
          'metaName': '名称：{0}　',
        },
        en: {
          'sectionTitle': 'Preset Workbench',
          'lang': '中文',
          'whatIs': '❓ What is a preset & how to use this page? 30-sec intro',
          'whatIsP1': 'A preset is a "starter config pack" for a new session. Whichever preset you pick before a session sets that session\u2019s persona and capabilities.',
          'whatIsP2': 'A preset has three parts: ① persona prompt (edited here, can be multi-section) ② capability config (toggle tools below in "Capabilities") ③ name & description',
          'whatIsP3a': 'Create your own: ',
          'whatIsP3b': 'click "New preset" → give an id (lowercase, e.g. my-rp) and display name → it copies whale-mom\u2019s full content → edit in the area → "Save all" → open a new session and pick it. Done.',
          'whatIsP4a': 'Rename / edit description: ',
          'whatIsP4b': 'select the preset → "Open folder" → edit name and description in preset.yml with a text editor.',
          'whatIsP5a': 'Checkboxes: ',
          'whatIsP5b': 'unchecked sections keep their text but are excluded from the system prompt (hidden from the AI).',
          'whatIsP6a': 'After saving: ',
          'whatIsP6b': 'only affects sessions opened afterwards; the current conversation stays unchanged.',
          'currentPreset': 'Current preset:',
          'openDir': 'Open folder',
          'openDirTip': 'Open this preset\u2019s folder in the file explorer',
          'validate': 'Validate load',
          'validateTip': 'Simulate a session load to check the preset works',
          'bindTitle': 'Workspace default presets',
          'bindDesc': 'Bind a preset to each work project (workspace directory). New sessions started in that workspace automatically use it — no manual picking; unbound directories keep the global default. Running conversations are unaffected.',
          'bindEmpty': 'No workspaces yet. Add a work project in the sidebar first, then come back to bind.',
          'bindNone': '(none — use global default)',
          'bindOrphan': 'This directory left the workspace list, but the binding remains — new sessions started here still apply it.',
          'bindHint': 'Sessions started in subdirectories inherit the binding too. An explicit preset picked for a new session always wins.',
          'bindOk': 'Bound: new sessions will use “{0}”.',
          'bindCleared': 'Binding removed; the global default applies again.',
          'bindFail': 'Binding failed: ',
          'newPreset': 'New preset',
          'collapse': 'Collapse',
          'deletePreset': 'Delete preset',
          'deleteTip': 'Delete the whole preset folder (two clicks to confirm)',
          'confirmDel': '⚠ Confirm delete {0}? Click again',
          'selectUnit': '（select）',
          'brokenTag': '（broken）',
          'template': 'Template:',
          'idLabel': 'id:',
          'nameLabel': 'Name:',
          'idPlaceholder': 'lowercase, e.g. my-rp',
          'namePlaceholder': 'e.g. My Roleplay',
          'createFrom': 'Create from template',
          'noTemplateSel': 'Please select a template first',
          'creating': 'Creating…',
          'created': 'Created {0}. Now edit its prompt sections, then click "Save all", and pick it in a new session\u2019s selector.',
          'createFail': 'Create failed: ',
          'deleteFail': 'Delete failed: ',
          'deleted': 'Deleted preset: {0}',
          'addSection': '+ Add section',
          'saveAll': '💾 Save all',
          'saveHintNone': '（pick a preset above first）',
          'saveHintLoading': '（loading…）',
          'saving': 'Saving…',
          'saved': 'Saved {0} section(s). Affects only new sessions; the current conversation is unchanged.',
          'saveFail': 'Save failed: ',
          'validating': 'Validating…',
          'validOk': 'Mount check passed ✔ New sessions can load this preset normally.',
          'validFail': 'Mount check failed: {0}',
          'validReqFail': 'Validate request failed: ',
          'openDirFail': 'Open folder failed: ',
          'openDirOk': 'Opened folder: {0} (edit name & description in preset.yml here)',
          'loadFail': 'Load failed: ',
          'capsTitle': '🧰 Capabilities: add/remove tools for this preset (toggle applies immediately, auto-validated)',
          'capsDesc': 'The optional capabilities below. Check → install the tool into this preset; uncheck → remove it. Each toggle auto-validates. Affects only new sessions.',
          'capsRo': 'Official presets are read-only — not editable. Duplicate one to make your own.',
          'capsHint': 'Capabilities will appear here after picking a preset',
          'capOn': 'on',
          'capOff': 'off',
          'capToggle': 'Capability "{0}" {1}. New sessions; mount check {2}',
          'capOk': 'passed ✔',
          'capFail': 'failed: {0}',
          'capSwitchFail': 'Capability toggle failed: ',
          'badgeWired': '🔌 wired (inactive)',
          'badgeOn': '✓ active',
          'grpUser': '📁 User templates',
          'grpSystem': '🏁 Official presets',
          'unitNone': '（not selected）',
          'nameWrap': '（{0}）',
          'curUserGrp': 'User presets',
          'curSystemGrp': 'Official presets (read-only)',
          'systemBadge': 'Official preset',
          'systemReadonly': 'This is an official preset — read-only. Not editable. Duplicate it to make your own.',
          'systemComp': 'Its capability composition:',
          'compEmpty': '（no rows to show）',
          'compOn': 'on',
          'compOff': 'off',
          'compCore': 'preset core (cannot disable)',
          'enabled': 'Enabled',
          'enabledTip': 'checked = this section is active; unchecked = kept but hidden from the AI',
          'secTitlePh': 'Section title',
          'delSec': 'Delete section',
          'secTextPh': 'Prompt content for this section…',
          'loading': 'Loading…',
          'pickFirst': 'Start by picking a preset above',
          'noSections': 'This preset has no prompt sections yet',
          'metaName': 'Name: {0}　',
        },
      }
      function t(orig) {
        var lang = localStorage.getItem('pwt-lang') || 'zh'
        var key = orig
        var args = Array.prototype.slice.call(arguments, 1)
        if (lang === 'zh' && DICT.zh[key]) return substitute(DICT.zh[key], args)
        if (lang === 'en' && DICT.en[key]) return substitute(DICT.en[key], args)
        // 未收录：回退原文
        return orig
      }
      function substitute(tpl, args) {
        var s = String(tpl)
        for (var i = 0; i < args.length; i++) s = s.replace(new RegExp('\\{' + i + '\\}', 'g'), argStr(args[i]))
        return s
      }
      function argStr(a) { return (a === undefined || a === null) ? '' : String(a) }
      function langNow() { return localStorage.getItem('pwt-lang') || 'zh' }
      function setLang(l) { localStorage.setItem('pwt-lang', l) }


      // 渲染错误边界：一个子视图崩溃时显示可读的错误，而不是把整个设置页拖成空白。
      // 参考 dsh-doctor 的 DoctorErrorBoundary 写法。
      var PwtErrorBoundary = (function () {
        var B = function (props) {
          react.Component.call(this, props)
          this.state = { failed: false, message: '' }
        }
        B.prototype = Object.create(react.Component.prototype)
        B.prototype.constructor = B
        B.getDerivedStateFromError = function () { return { failed: true } }
        B.prototype.componentDidCatch = function (err) {
          try { this.setState({ message: err && err.message ? err.message : String(err) }) } catch (_) {}
        }
        B.prototype.render = function () {
          if (!this.state.failed) return this.props.children
          return h('div', { className: 'pwt-status pwt-statusError', style: { padding: '8px', border: '1px solid var(--dsw-alias-state-error-primary)', borderRadius: '8px' } },
            '◆ 预设工作台渲染出错（已捕获，不影响其他设置页）: ' + (this.state.message || 'unknown'))
        }
        return B
      })()

      function TemplatePicker(props) {
        var val = props.value || ''
        var items = props.items || []
        var onChange = props.onChange
        var opn = react.useState(false); var open = opn[0]; var setOpen = opn[1]
        var refBox = react.useRef(null)
        var label = t('unitNone')
        for (var i = 0; i < items.length; i++) {
          if (items[i].source + ':' + items[i].id === val) {
            label = items[i].id + (items[i].name ? t('nameWrap', items[i].name) : '')
            break
          }
        }
        react.useEffect(function () {
          if (!open) return undefined
          function onDown(e) {
            var el = refBox.current
            if (el && (el === e.target || el.contains(e.target))) return
            setOpen(false)
          }
          function onKey(e) { if (e.key === 'Escape') setOpen(false) }
          document.addEventListener('mousedown', onDown)
          document.addEventListener('keydown', onKey)
          return function () {
            document.removeEventListener('mousedown', onDown)
            document.removeEventListener('keydown', onKey)
          }
        }, [open])
        var groups = [
          { label: t('grpUser'), source: 'user' },
          { label: t('grpSystem'), source: 'system' }
        ]
        return h('div', { ref: refBox, className: 'pwt-dd' },
          h('button', { type: 'button', className: 'pwt-btn pwt-tpl pwt-dd-btn', onClick: function () { setOpen(!open) } },
            h('span', { className: 'pwt-dd-label' }, label),
            h('span', { className: 'pwt-dd-caret' }, open ? '▲' : '▼')
          ),
          open ? h('div', { className: 'pwt-dd-menu' },
            groups.map(function (g) {
              var arr = items.filter(function (t) { return t.source === g.source })
              if (!arr.length) return null
              return h('div', { key: g.source, className: 'pwt-dd-group' },
                h('div', { className: 'pwt-dd-glabel' }, g.label),
                arr.map(function (t) {
                  var v = t.source + ':' + t.id
                  return h('button', { key: v, type: 'button', className: 'pwt-dd-opt' + (v === val ? ' pwt-dd-sel' : ''), onClick: function () { onChange(v); setOpen(false) } },
                    t.id + (t.name ? t('nameWrap', t.name) : ''))
                })
              )
            })
          ) : null
        )
      }

      function WorkbenchPage() {
        var presetsL = react.useState(null); var list = presetsL[0]; var setList = presetsL[1]
        var cur = react.useState(''); var current = cur[0]; var setCurrent = cur[1]
        var dta = react.useState(null); var data = dta[0]; var setData = dta[1]
        var stt = react.useState(''); var status = stt[0]; var setStatus = stt[1]
        var bsy = react.useState(false); var busy = bsy[0]; var setBusy = bsy[1]
        var shw = react.useState(false); var showNew = shw[0]; var setShowNew = shw[1]
        var nid = react.useState(''); var newId = nid[0]; var setNewId = nid[1]
        var nnm = react.useState(''); var newName = nnm[0]; var setNewName = nnm[1]
        var tpl = react.useState(null); var templates = tpl[0]; var setTemplates = tpl[1]
        var tplSel = react.useState(''); var template = tplSel[0]; var setTemplate = tplSel[1]
        var cfd = react.useState(false); var confirmDel = cfd[0]; var setConfirmDel = cfd[1]
        var lng = react.useState(langNow()); var lang = lng[0]; var setLangState = lng[1]
        var curRo = react.useState(false); var currentReadonly = curRo[0]; var setCurrentReadonly = curRo[1]
        var bnd = react.useState(null); var bindings = bnd[0]; var setBindings = bnd[1]

        var loadBindings = function () {
          return rpc('bindings').then(function (r) {
            if (r && r.ok) setBindings(r.rows || [])
          }).catch(function () { setBindings([]) })
        }
        react.useEffect(function () { loadBindings() }, [])

        var setWorkspaceBinding = function (path, presetId) {
          setBusy(true)
          var call = presetId ? rpc('setBinding', { path: path, preset: presetId }) : rpc('clearBinding', { path: path })
          return call.then(function (r) {
            if (!r || !r.ok) throw new Error(r && r.error || 'binding failed')
            setStatus(presetId ? t('bindOk', presetId) : t('bindCleared'))
            return loadBindings()
          }).catch(function (e) { setStatus(t('bindFail') + e.message) }).finally(function () { setBusy(false) })
        }
        var toggleLang = function () {
          var next = (langNow() === 'en') ? 'zh' : 'en'
          setLang(next)
          setLangState(next)
          // 语言变了 → 重新拉取能力开关（title/desc 由宿主按 lang 给），保持整页文案一致
          if (current) capLoad(current)
        }

        var refresh = function () {
          var tarr = []
          return rpc('list').then(function (r) {
            if (!r || !r.ok) throw new Error(r && r.error || 'load failed')
            var arr = r.presets || []
            tarr = arr
            setList(arr)
            setCurrent(function (prev) {
              return prev || (arr[0] ? arr[0].id : '')
            })
            return rpc('templates')
          }).then(function (r) {
            if (!r || !r.ok) throw new Error(r && r.error || 'templates failed')
            setTemplates(r.templates || [])
            setTemplate(function (prev) {
              if (prev) return prev
              var ts = r.templates || []
              return ts.length ? (ts[0].source + ':' + ts[0].id) : ''
            })
          }).catch(function (e) {
            // 兼容兜底：模板接口不可用（如宿主未重启/旧版本）时，
            // 用用户预设 + 官方四个当模板即可（内置模板已并入用户组，不单独出现）。
            var ts = []
            for (var i = 0; i < tarr.length; i++) ts.push({ id: tarr[i].id, name: tarr[i].name, source: 'user' })
            var official = ['standard', 'code', 'minimal', 'cordis']
            for (var o = 0; o < official.length; o++) ts.push({ id: official[o], name: undefined, source: 'system' })
            setTemplates(ts)
            setTemplate(function (prev) { return prev || (ts[0] ? ts[0].source + ':' + ts[0].id : '') })
          })
        }

        var roOf = function (id, arr) {
          if (!arr) return false
          for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return !!arr[i].readonly
          return false
        }
        react.useEffect(function () { setCurrentReadonly(roOf(current, list)) }, [current, list])

        var load = function (id) {
          if (!id) { setData(null); return }
          setBusy(true)
          rpc('load', { id: id }).then(function (r) {
            if (!r || !r.ok) throw new Error(r && r.error || 'load failed')
            setData(r)
            setStatus('')
          }).catch(function (e) {
            setData(null)
            setStatus(t('loadFail') + e.message)
          }).finally(function () { setBusy(false) })
        }

        react.useEffect(function () { refresh() }, [])
        react.useEffect(function () { load(current) }, [current])

        var save = function () {
          if (!data || !current) return
          setBusy(true)
          setStatus(t('saving'))
          rpc('save', { id: current, sections: data.sections }).then(function (r) {
            if (!r || !r.ok) throw new Error(r && r.error || 'save failed')
            setStatus(t('saved', (r.wrote || 0)))
          }).catch(function (e) { setStatus(t('saveFail') + e.message) }).finally(function () { setBusy(false) })
        }

        var doValidate = function () {
          if (!current) return
          setStatus(t('validating'))
          rpc('validate', { id: current }).then(function (r) {
            setStatus(r && r.ok ? t('validOk') : t('validFail', (r && r.error)))
          }).catch(function (e) { setStatus(t('validReqFail') + e.message) })
        }

        var doReveal = function () {
          if (!current) return
          rpc('reveal', { id: current }).then(function (r) {
            if (!r || !r.ok) throw new Error(r && r.error || 'reveal failed')
            setStatus(t('openDirOk', r.dir))
          }).catch(function (e) { setStatus(t('openDirFail') + e.message) })
        }

        var doCreate = function () {
          if (!template) { setStatus(t('noTemplateSel')); return }
          setBusy(true)
          setStatus(t('creating'))
          rpc('create', { id: newId, name: newName, from: template }).then(function (r) {
            if (!r || !r.ok) throw new Error(r && r.error || 'create failed')
            setShowNew(false)
            setNewId('')
            setNewName('')
            setStatus(t('created', r.id))
            return refresh().then(function () { setCurrent(r.id) })
          }).catch(function (e) { setStatus(t('createFail') + e.message) }).finally(function () { setBusy(false) })
        }

        var doDelete = function () {
          if (!current) return
          setBusy(true)
          rpc('delete', { id: current }).then(function (r) {
            if (!r || !r.ok) throw new Error(r && r.error || 'delete failed')
            setStatus(t('deleted', current))
            setConfirmDel(false)
            setData(null)
            setCurrent('')
            return refresh()
          }).catch(function (e) {
            setStatus(t('deleteFail') + e.message)
            setConfirmDel(false)
          }).finally(function () { setBusy(false) })
        }

        var patchSection = function (i, patch) {
          setData(function (d) {
            if (!d) return d
            var arr = d.sections.slice()
            arr[i] = Object.assign({}, arr[i], patch)
            return Object.assign({}, d, { sections: arr })
          })
        }

        var addSection = function () {
          setData(function (d) {
            if (!d) return d
            var arr = d.sections.slice()
            arr.push({ file: 'section.' + Date.now() + '.md', title: '新段落', enabled: true, text: '' })
            return Object.assign({}, d, { sections: arr })
          })
        }

        var removeSection = function (i) {
          setData(function (d) {
            if (!d) return d
            var arr = d.sections.slice()
            arr.splice(i, 1)
            return Object.assign({}, d, { sections: arr })
          })
        }

        // ── 能力开关 ──
        var capS = react.useState(null); var caps = capS[0]; var setCaps = capS[1]

        var capLoad = function (id) {
          if (!id) { setCaps(null); return }
          rpc('caps', { id: id }).then(function (r) {
            if (r && r.ok) setCaps(r.caps || [])
          }).catch(function () { setCaps(null) })
        }

        react.useEffect(function () { capLoad(current) }, [current])

        var toggleCap = function (c) {
          if (!current) return
          setBusy(true)
          rpc('setCap', { id: current, capId: c.id, enabled: !c.enabled }).then(function (r) {
            if (!r || !r.ok) throw new Error(r && r.error || 'setCap failed')
            var verb = t(!c.enabled ? 'capOn' : 'capOff')
            return rpc('caps', { id: current }).then(function (r2) {
              if (r2 && r2.ok) setCaps(r2.caps)
              return rpc('validate', { id: current }).then(function (v) {
                setStatus(t('capToggle', c.title, verb, (v && v.ok ? t('capOk') : t('capFail', (v && v.error)))))
              })
            })
          }).catch(function (e) { setStatus(t('capSwitchFail') + e.message) }).finally(function () { setBusy(false) })
        }

        var children = []

        children.push(h('style', { key: 'pwt-style' }, cssText))

        // ── 内置说明 ──
        children.push(h('details', { key: 'help', className: 'pwt-help' },
          h('summary', null, t('whatIs')),
          h('div', null,
            h('p', { style: { margin: '4px 0' } }, t('whatIsP1')),
            h('ul', null,
              h('li', null, t('whatIsP2'))),
            h('p', { style: { margin: '4px 0' } },
              h('b', null, t('whatIsP3a')), t('whatIsP3b')),
            h('p', { style: { margin: '4px 0' } },
              h('b', null, t('whatIsP4a')), t('whatIsP4b')),
            h('p', { style: { margin: '4px 0' } },
              h('b', null, t('whatIsP5a')), t('whatIsP5b')),
            h('p', { style: { margin: '4px 0' } },
              h('b', null, t('whatIsP6a')), t('whatIsP6b')))
        ))

        // ── 选择与操作（钉在顶部，不随内容滚动）──
        // 按只读性分组：用户预设可编辑，官方预设（system）只读。
        var userOpts = []
        var systemOpts = []
        ;(list || []).forEach(function (p) {
          var label = (p.name ? p.name + ' · ' : '') + p.id + (p.broken ? t('brokenTag') : '')
          var opt = h('option', { key: p.id, value: p.id }, label)
          if (p.readonly) systemOpts.push(opt)
          else userOpts.push(opt)
        })
        var opts = [
          userOpts.length ? h('optgroup', { key: 'user', label: t('curUserGrp') }, userOpts) : null,
          systemOpts.length ? h('optgroup', { key: 'system', label: t('curSystemGrp') }, systemOpts) : null,
        ].filter(Boolean)
        var currentMeta = (list || []).filter(function (p) { return p.id === current })[0]
        var isRo = currentReadonly

        children.push(h('div', { key: 'row1', className: 'pwt-row' },
          h('span', null, t('currentPreset')),
          h('select', { className: 'pwt-select', value: current, onChange: function (e) { setCurrent(e.target.value); setConfirmDel(false) }, disabled: busy },
            h('option', { key: '', value: '' }, t('selectUnit')),
            opts
          ),
          h('button', { className: 'pwt-btn', onClick: doReveal, disabled: !current || isRo, title: t('openDirTip') }, t('openDir')),
          h('button', { className: 'pwt-btn', onClick: doValidate, disabled: busy || !current, title: t('validateTip') }, t('validate')),
          h('button', { className: 'pwt-btn', onClick: function () { setShowNew(!showNew); setConfirmDel(false) } }, showNew ? t('collapse') : t('newPreset')),
          h('button', {
            className: 'pwt-btn pwt-btnDanger',
            onClick: function () { if (confirmDel) { doDelete() } else { setConfirmDel(true) } },
            disabled: busy || !current || isRo,
            title: t('deleteTip')
          }, confirmDel ? t('confirmDel', current) : t('deletePreset')),
          h('span', { className: 'pwt-grow' }),
          h('button', { className: 'pwt-btn', onClick: toggleLang, title: lang === 'en' ? '切换到中文' : 'Switch to English' }, t('lang'))
        ))

        if (currentMeta && (currentMeta.name || currentMeta.description)) {
          children.push(h('div', { key: 'meta', className: 'pwt-hint' },
            (currentMeta.name ? t('metaName', currentMeta.name) : '') + (currentMeta.description || '')))
        }

        if (showNew) {
          children.push(h('div', { key: 'rowNew', className: 'pwt-row' },
            h('span', null, t('template')),
            h(TemplatePicker, { value: template, items: templates || [], onChange: setTemplate }),
            h('span', null, t('idLabel')),
            h('input', { className: 'pwt-input', value: newId, placeholder: t('idPlaceholder'), onChange: function (e) { setNewId(e.target.value) } }),
            h('span', null, t('nameLabel')),
            h('input', { className: 'pwt-input', value: newName, placeholder: t('namePlaceholder'), onChange: function (e) { setNewName(e.target.value) } }),
            h('button', { className: 'pwt-btn', onClick: doCreate, disabled: busy || !newId }, t('createFrom'))
          ))
        }

        // ── 编辑动作行 ──
        var saveHint = ''
        if (isRo) saveHint = t('systemBadge')
        else if (!current) saveHint = t('saveHintNone')
        else if (!data) saveHint = t('saveHintLoading')
        children.push(h('div', { key: 'rowAct', className: 'pwt-row' },
          h('button', { className: 'pwt-btn', onClick: addSection, disabled: busy || !data || isRo }, t('addSection')),
          h('button', { className: 'pwt-btn', onClick: save, disabled: busy || !data || !current || isRo }, t('saveAll')),
          h('span', { className: 'pwt-hint' }, saveHint)
        ))

        children.push(h('div', { key: 'status', className: (/失败|failed/i.test(status)) ? 'pwt-status pwt-statusError' : 'pwt-status' }, status))

        // ── 段落卡片（唯一滚动区）──
        var cards = (data && data.sections ? data.sections : []).map(function (s, i) {
          return h('div', { key: s.file + '-' + i, className: 'pwt-card' },
            h('div', { className: 'pwt-row' },
              h('label', { className: 'pwt-row', title: t('enabledTip') },
                h('input', { type: 'checkbox', checked: s.enabled !== false, onChange: function (e) { patchSection(i, { enabled: e.target.checked }) } }),
                h('span', { className: 'pwt-title' }, t('enabled'))
              ),
              h('input', {
                className: 'pwt-input pwt-grow', value: s.title || '', placeholder: t('secTitlePh'),
                onChange: function (e) { patchSection(i, { title: e.target.value }) },
              }),
              h('span', { className: 'pwt-file' }, s.file),
              h('button', { className: 'pwt-btn', onClick: function () { removeSection(i) } }, t('delSec'))
            ),
            h('textarea', {
              className: 'pwt-ta', rows: Math.min(20, Math.max(6, (s.text || '').split('\n').length + 1)),
              value: s.text || '', placeholder: t('secTextPh'),
              onChange: function (e) { patchSection(i, { text: e.target.value }) },
            })
          )
        })

        children.push(h('div', { key: 'sections', className: 'pwt-sections' },
          // ── 能力开关（与段落卡片同属一个滚动区：展开后能一路滚到底）──
          // 系统/官方预设只读：能力开关仅供查看，勾选禁用。
          h('details', { key: 'caps', className: 'pwt-help' },
            h('summary', null, t('capsTitle')),
            h('div', null,
              h('p', { style: { margin: '4px 0' } }, t('capsDesc')),
              isRo ? h('div', { className: 'pwt-status' }, t('capsRo')) : null,
              (caps === null
                ? h('div', { className: 'pwt-hint' }, t('capsHint'))
                : h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
                  caps.map(function (c) {
                    var badge = c.enabled ? (c.dormant ? t('badgeWired') : t('badgeOn')) : ''
                    var lock = c.locked
                    return h('label', { key: c.id, className: 'pwt-row', title: c.desc, style: { cursor: (isRo || lock) ? 'default' : 'pointer' } },
                      h('input', {
                        type: 'checkbox',
                        checked: lock ? true : !!c.enabled,
                        disabled: busy || !current || isRo || lock,
                        onChange: function () { if (lock) return; toggleCap(c) },
                      }),
                      h('span', { className: 'pwt-title' }, lock ? ('🔒 ' + c.title) : c.title),
                      badge ? h('span', { className: 'pwt-hint' }, badge) : null,
                      h('span', { className: 'pwt-hint' }, (lock ? t('compCore') + ' · ' : '') + c.desc)
                    )
                  })
                ))
            )
          ),
          // ── 每工作区默认预设：给每个工作区目录绑一个预设，新会话自动用 ──
          h('details', { key: 'bindings', className: 'pwt-help' },
            h('summary', null, t('bindTitle')),
            h('div', null,
              h('p', { style: { margin: '4px 0' } }, t('bindDesc')),
              (bindings === null
                ? h('div', { className: 'pwt-hint' }, t('loading'))
                : (bindings.length === 0
                  ? h('div', { className: 'pwt-hint' }, t('bindEmpty'))
                  : h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
                    bindings.map(function (b) {
                      var opts = [h('option', { key: '', value: '' }, t('bindNone'))]
                      ;(list || []).forEach(function (p) {
                        opts.push(h('option', { key: p.id, value: p.id }, (p.name ? p.name + ' · ' : '') + p.id))
                      })
                      return h('div', { key: b.path, className: 'pwt-row' },
                        h('span', { className: 'pwt-file', title: b.path }, (b.orphan ? '⚠ ' : '') + (b.title || b.path)),
                        h('select', {
                          className: 'pwt-select',
                          value: b.preset || '',
                          disabled: busy,
                          onChange: function (e) { setWorkspaceBinding(b.path, e.target.value) },
                        }, opts),
                        b.orphan ? h('span', { className: 'pwt-hint' }, t('bindOrphan')) : null
                      )
                    })
                  ))),
              h('div', { className: 'pwt-hint' }, t('bindHint'))
            )
          ),
          // 段落卡片区（能力开关已并入，不再单独列官方组合块）
          data === null
            ? h('div', { className: 'pwt-hint' }, current ? t('loading') : t('pickFirst'))
            : (data.sections.length === 0 ? h('div', { className: 'pwt-hint' }, t('noSections')) : cards)
        ))

        return h('div', { className: 'pwt-root' }, children)
      }

      function apply(ctx) {
        var slots = ctx.get('slots')
        if (slots === undefined) return
        slots.inject('settings.section', function () {
          slots.register(
            { name: 'settings.section', id: 'preset-workbench', order: 60, label: (langNow() === 'en' ? 'Preset Workbench' : '预设工作台') },
            function (props) { return h(PwtErrorBoundary, null, h(WorkbenchPage, props || {})) }
          )
        })
      }

      exports.apply = apply
      exports.inject = ['slots']
      exports.default = { apply: apply, inject: ['slots'] }

      return module.exports
    },
  })
})()
