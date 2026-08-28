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
        '.pwt-title{font-weight:600}',
        'details.pwt-help{border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:6px 10px;background:var(--dsw-alias-bg-layer-3)}',
        'details.pwt-help summary{cursor:pointer;color:var(--dsw-alias-label-secondary);font-size:12px;user-select:none}',
        'details.pwt-help[open] summary{margin-bottom:6px}',
        'details.pwt-help ul{margin:4px 0 4px 18px;padding:0}'
      ].join('\n')

      function rpc(op, payload) {
        return fetch('/api/preset-workbench', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(Object.assign({ op: op }, payload || {})),
        }).then(function (res) { return res.json() })
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

        var refresh = function () {
          var tarr = []
          return rpc('list').then(function (r) {
            if (!r || !r.ok) throw new Error(r && r.error || 'load failed')
            var arr = r.presets || []
            tarr = arr
            setList(arr)
            setCurrent(function (prev) { return prev || (arr[0] ? arr[0].id : '') })
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

        var load = function (id) {
          if (!id) { setData(null); return }
          setBusy(true)
          rpc('load', { id: id }).then(function (r) {
            if (!r || !r.ok) throw new Error(r && r.error || 'load failed')
            setData(r)
            setStatus('')
          }).catch(function (e) {
            setData(null)
            setStatus('读取失败: ' + e.message)
          }).finally(function () { setBusy(false) })
        }

        react.useEffect(function () { refresh() }, [])
        react.useEffect(function () { load(current) }, [current])

        var save = function () {
          if (!data || !current) return
          setBusy(true)
          setStatus('保存中…')
          rpc('save', { id: current, sections: data.sections }).then(function (r) {
            if (!r || !r.ok) throw new Error(r && r.error || 'save failed')
            setStatus('已保存 ' + (r.wrote || 0) + ' 段。新开的会话生效；当前会话不变。')
          }).catch(function (e) { setStatus('保存失败: ' + e.message) }).finally(function () { setBusy(false) })
        }

        var doValidate = function () {
          if (!current) return
          setStatus('校验中…')
          rpc('validate', { id: current }).then(function (r) {
            setStatus(r && r.ok ? '挂载校验通过 ✔ 下次新开会话可以正常加载这个预设。' : '挂载校验失败：' + (r && r.error))
          }).catch(function (e) { setStatus('校验请求失败: ' + e.message) })
        }

        var doReveal = function () {
          if (!current) return
          rpc('reveal', { id: current }).then(function (r) {
            if (!r || !r.ok) throw new Error(r && r.error || 'reveal failed')
            setStatus('已打开目录: ' + r.dir + '（可在此用记事本改 preset.yml 的名字和简介）')
          }).catch(function (e) { setStatus('打开目录失败: ' + e.message) })
        }

        var doCreate = function () {
          if (!template) { setStatus('请先选择模板'); return }
          setBusy(true)
          setStatus('创建中…')
          rpc('create', { id: newId, name: newName, from: template }).then(function (r) {
            if (!r || !r.ok) throw new Error(r && r.error || 'create failed')
            setShowNew(false)
            setNewId('')
            setNewName('')
            setStatus('已创建: ' + r.id + '。现在编辑它的提示词段落，改完记得点「保存全部」，然后在新会话的选择器里选它。')
            return refresh().then(function () { setCurrent(r.id) })
          }).catch(function (e) { setStatus('创建失败: ' + e.message) }).finally(function () { setBusy(false) })
        }

        var doDelete = function () {
          if (!current) return
          setBusy(true)
          rpc('delete', { id: current }).then(function (r) {
            if (!r || !r.ok) throw new Error(r && r.error || 'delete failed')
            setStatus('已删除预设: ' + current)
            setConfirmDel(false)
            setData(null)
            setCurrent('')
            return refresh()
          }).catch(function (e) {
            setStatus('删除失败: ' + e.message)
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
            var verb = !c.enabled ? '开启' : '关闭'
            return rpc('caps', { id: current }).then(function (r2) {
              if (r2 && r2.ok) setCaps(r2.caps)
              return rpc('validate', { id: current }).then(function (v) {
                setStatus('能力「' + c.title + '」' + verb + '。新会话生效；挂载校验' + (v && v.ok ? '通过 ✔' : '失败：' + (v && v.error)))
              })
            })
          }).catch(function (e) { setStatus('能力切换失败: ' + e.message) }).finally(function () { setBusy(false) })
        }

        var children = []

        children.push(h('style', { key: 'pwt-style' }, cssText))

        // ── 内置说明 ──
        children.push(h('details', { key: 'help', className: 'pwt-help' },
          h('summary', null, '❓ 预设是什么？怎么用本页？点开看 30 秒说明'),
          h('div', null,
            h('p', { style: { margin: '4px 0' } },
              '预设 = 新会话的「开局配置包」。你在新会话前选择哪个预设，那个会话里的 AI 就是什么人设、什么能力。'),
            h('ul', null,
              h('li', null, '一个预设包含三样：① 人设提示词（本页编辑的主体，可分多段）② 能力配置（下方「能力开关」里打勾即可加减工具）③ 名字与简介')),
            h('p', { style: { margin: '4px 0' } },
              h('b', null, '新建自己的预设：'), '点下方「新建预设」→ 起个 id（英文小写，如 my-rp）和显示名 → 它会复制鲸鱼娘的全部内容 → 在编辑区改成你的设定 → 点「保存全部」→ 新开会话，在选择器里选它。完事。'),
            h('p', { style: { margin: '4px 0' } },
              h('b', null, '改名/改简介：'), '选中预设 → 点「打开目录」→ 用记事本改 preset.yml 里的 name 和 description 两行。'),
            h('p', { style: { margin: '4px 0' } },
              h('b', null, '勾选框：'), '取消勾选的段保留文字但不进入系统提示词（不给 AI 看）。'),
            h('p', { style: { margin: '4px 0' } },
              h('b', null, '保存后：'), '只对之后新开的会话生效，当前正在聊的会话不变。'))
        ))

        // ── 选择与操作（钉在顶部，不随内容滚动）──
        var opts = (list || []).map(function (p) {
          var label = (p.name ? p.name + ' · ' : '') + p.id + (p.broken ? '（损坏）' : '')
          return h('option', { key: p.id, value: p.id }, label)
        })
        var currentMeta = (list || []).filter(function (p) { return p.id === current })[0]

        children.push(h('div', { key: 'row1', className: 'pwt-row' },
          h('span', null, '当前预设：'),
          h('select', { className: 'pwt-select', value: current, onChange: function (e) { setCurrent(e.target.value); setConfirmDel(false) }, disabled: busy },
            h('option', { key: '', value: '' }, '（选择）'),
            opts
          ),
          h('button', { className: 'pwt-btn', onClick: doReveal, disabled: !current, title: '在资源管理器中打开这个预设的文件夹' }, '打开目录'),
          h('button', { className: 'pwt-btn', onClick: doValidate, disabled: busy || !current, title: '模拟一次会话加载，检查预设能否正常使用' }, '校验挂载'),
          h('button', { className: 'pwt-btn', onClick: function () { setShowNew(!showNew); setConfirmDel(false) } }, showNew ? '收起新建' : '新建预设'),
          h('button', {
            className: 'pwt-btn pwt-btnDanger',
            onClick: function () { if (confirmDel) { doDelete() } else { setConfirmDel(true) } },
            disabled: busy || !current,
            title: '删除整个预设文件夹（两击确认防手滑）'
          }, confirmDel ? '⚠ 确认删除 ' + current + ' ？再点一次' : '删除预设')
        ))

        if (currentMeta && (currentMeta.name || currentMeta.description)) {
          children.push(h('div', { key: 'meta', className: 'pwt-hint' },
            (currentMeta.name ? '名称：' + currentMeta.name + '　' : '') + (currentMeta.description || '')))
        }

        if (showNew) {
          children.push(h('div', { key: 'rowNew', className: 'pwt-row' },
            h('span', null, '模板：'),
            h('select', { className: 'pwt-select pwt-tpl', value: template, onChange: function (e) { setTemplate(e.target.value) } },
              (function () {
                var groups = [
                  { label: '📁 用户模板', source: 'user' },
                  { label: '🏁 官方预设', source: 'system' }
                ]
                var opts = []
                for (var g = 0; g < groups.length; g++) {
                  var grp = groups[g]
                  var items = (templates || []).filter(function (t) { return t.source === grp.source })
                  if (!items.length) continue
                  opts.push(h('optgroup', { key: grp.source, label: grp.label },
                    items.map(function (t) {
                      var v = grp.source + ':' + t.id
                      return h('option', { key: v, value: v }, t.id + (t.name ? '（' + t.name + '）' : ''))
                    })))
                }
                return opts
              })()
            ),
            h('span', null, 'id：'),
            h('input', { className: 'pwt-input', value: newId, placeholder: '英文小写，如 my-rp', onChange: function (e) { setNewId(e.target.value) } }),
            h('span', null, '显示名：'),
            h('input', { className: 'pwt-input', value: newName, placeholder: '如 我的角色扮演', onChange: function (e) { setNewName(e.target.value) } }),
            h('button', { className: 'pwt-btn', onClick: doCreate, disabled: busy || !newId }, '从模板创建')
          ))
        }

        // ── 编辑动作行 ──
        var saveHint = ''
        if (!current) saveHint = '（先在上面选择一个预设）'
        else if (!data) saveHint = '（读取中…）'
        children.push(h('div', { key: 'rowAct', className: 'pwt-row' },
          h('button', { className: 'pwt-btn', onClick: addSection, disabled: busy || !data }, '＋添加段落'),
          h('button', { className: 'pwt-btn', onClick: save, disabled: busy || !data || !current }, '💾 保存全部'),
          h('span', { className: 'pwt-hint' }, saveHint)
        ))

        // ── 能力开关（打勾 = 给这个预设加装备）──
        children.push(h('details', { key: 'caps', className: 'pwt-help' },
          h('summary', null, '🧰 能力开关：给这个预设加/减工具（打勾 + 保存？不——打勾立即生效，自动校验）'),
          h('div', null,
            h('p', { style: { margin: '4px 0' } }, '下面是可选能力。勾上 → 把对应工具装进这个预设；取消 → 移除。每次切换会自动校验并提示结果。对下次**新开的会话**生效。'),
            (caps === null
              ? h('div', { className: 'pwt-hint' }, '选中预设后这里会列出可开关的能力')
              : h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
                caps.map(function (c) {
                  var badge = c.enabled ? (c.dormant ? '🔌 已接线（未启用）' : '✓ 已启用') : ''
                  return h('label', { key: c.id, className: 'pwt-row', title: c.desc, style: { cursor: 'pointer' } },
                    h('input', {
                      type: 'checkbox',
                      checked: !!c.enabled,
                      disabled: busy || !current,
                      onChange: function () { toggleCap(c) },
                    }),
                    h('span', { className: 'pwt-title' }, c.title),
                    badge ? h('span', { className: 'pwt-hint' }, badge) : null,
                    h('span', { className: 'pwt-hint' }, c.desc)
                  )
                })
              ))
          )
        ))

        children.push(h('div', { key: 'status', className: status.indexOf('失败') >= 0 ? 'pwt-status pwt-statusError' : 'pwt-status' }, status))

        // ── 段落卡片（唯一滚动区）──
        var cards = (data && data.sections ? data.sections : []).map(function (s, i) {
          return h('div', { key: s.file + '-' + i, className: 'pwt-card' },
            h('div', { className: 'pwt-row' },
              h('label', { className: 'pwt-row', title: '勾选 = 这段生效；取消 = 保留文字但不给 AI 看' },
                h('input', { type: 'checkbox', checked: s.enabled !== false, onChange: function (e) { patchSection(i, { enabled: e.target.checked }) } }),
                h('span', { className: 'pwt-title' }, '启用')
              ),
              h('input', {
                className: 'pwt-input pwt-grow', value: s.title || '', placeholder: '段落标题',
                onChange: function (e) { patchSection(i, { title: e.target.value }) },
              }),
              h('span', { className: 'pwt-file' }, s.file),
              h('button', { className: 'pwt-btn', onClick: function () { removeSection(i) } }, '删除段')
            ),
            h('textarea', {
              className: 'pwt-ta', rows: Math.min(20, Math.max(6, (s.text || '').split('\n').length + 1)),
              value: s.text || '', placeholder: '这一段提示词内容…',
              onChange: function (e) { patchSection(i, { text: e.target.value }) },
            })
          )
        })

        children.push(h('div', { key: 'sections', className: 'pwt-sections' },
          data === null
            ? h('div', { className: 'pwt-hint' }, current ? '读取中…' : '先在上面选择一个预设')
            : (data.sections.length === 0 ? h('div', { className: 'pwt-hint' }, '该预设还没有分段提示词') : cards)
        ))

        return h('div', { className: 'pwt-root' }, children)
      }

      function apply(ctx) {
        var slots = ctx.get('slots')
        if (slots === undefined) return
        slots.inject('settings.section', function () {
          slots.register(
            { name: 'settings.section', id: 'preset-workbench', order: 60, label: '预设工作台' },
            function (props) { return h(WorkbenchPage, props || {}) }
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
