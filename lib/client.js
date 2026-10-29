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
        // 预设操作排固定一行：按钮不压缩，宽不下时由末尾提示截断让位
        '.pwt-presetRow{flex-wrap:nowrap}',
        '.pwt-presetRow .pwt-btn{flex:none}',
        '.pwt-presetRow .pwt-select{min-width:0;flex:0 1 auto}',
        '.pwt-presetRow .pwt-hint{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
        '.pwt-btnCol{display:flex;flex-direction:column;align-items:flex-start;gap:2px;min-width:0}',
        // 注意：必须写成 .pwt-subtab.pwt-subtab--icon —— 单类名的规则会被后面的 .pwt-subtab 覆盖，
        // 那样 padding 回来、内容区只剩 4px，图标就被裁成看不见的小点。
        '.pwt-subtab.pwt-subtab--icon{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;line-height:0;flex:none}',
        '.pwt-subtab--icon svg{display:block;width:12px;height:12px}',
        '.pwt-subtab.pwt-subtab--icon:disabled{opacity:.45;cursor:default}',
        '.pwt-btnIcon:hover{color:var(--dsw-alias-label-primary)}',
        '.pwt-openHint{font-size:11px;line-height:1.35;color:var(--dsw-alias-label-tertiary);max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
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
        '.pwt-ta{width:100%;box-sizing:border-box;background:var(--dsw-specific-input-major,var(--dsw-alias-bg-layer-2));border:1px solid var(--dsw-alias-border-l2);border-radius:6px;color:var(--dsw-alias-label-primary);font-family:Consolas,Menlo,"Microsoft YaHei","PingFang SC",monospace;font-size:12.5px;line-height:1.55;padding:8px;resize:vertical}',
        '.pwt-ta-1{min-height:56px;resize:vertical}',
        // 双击就地编辑：平时是文字，悬停给一点点提示，双击变输入框
        '.pwt-metaRow{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px;font-size:12px;color:var(--dsw-alias-label-tertiary)}',
        '.pwt-metaTitle{color:var(--dsw-alias-label-secondary)}',
        '.pwt-metaName{color:var(--dsw-alias-label-primary)}',
        '.pwt-metaDescWrap{flex-basis:100%;min-width:0}',
        '.pwt-metaDesc{display:block;line-height:1.5}',
        '.pwt-editable{cursor:text;border-radius:4px;margin:-2px -4px;padding:2px 4px}',
        '.pwt-editable:hover{background:var(--dsw-alias-bg-layer-2)}',
        '.pwt-inlineInput{max-width:280px;height:26px;padding:0 8px;font-size:13px}',
        '.pwt-inlineTextarea{width:100%;max-width:none}',
        '.pwt-ta:focus-visible,.pwt-input:focus-visible,.pwt-select:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-1px}',
        '.pwt-hint{color:var(--dsw-alias-label-tertiary);font-size:12px}',
        '.pwt-kind{display:inline-block;margin-right:8px;padding:1px 7px;border-radius:9px;font-size:11px;line-height:17px;white-space:nowrap;background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l1)}',
        '.pwt-kindWarn{background:var(--dsw-alias-state-warn-primary);color:var(--dsw-alias-label-primary);border-color:transparent}',
        '.pwt-file{color:var(--dsw-alias-label-tertiary);font-size:11px}',
        '.pwt-grow{flex:1 1 160px;min-width:0}',
        '.pwt-tpl{min-width:120px;max-width:220px;flex:0 1 auto}',
        '.pwt-tabs{display:flex;align-items:center;gap:20px;border-bottom:1px solid var(--dsw-alias-border-l2);flex:0 0 auto}',
        // 查看页的子页签：比顶级页签轻一档
        '.pwt-subtabs{display:flex;align-items:center;flex-wrap:wrap;gap:4px;margin:2px 0 8px}',
        '.pwt-subtab{background:none;border:1px solid transparent;border-radius:6px;padding:3px 10px;font-size:12px;font-family:inherit;color:var(--dsw-alias-label-secondary);cursor:pointer}',
        '.pwt-subtab:hover{background:var(--dsw-alias-bg-layer-2)}',
        '.pwt-subtab--on{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l2)}',
        '.pwt-tab{background:none;border:0;padding:8px 2px 10px;font-size:13px;font-family:inherit;color:var(--dsw-alias-label-secondary);cursor:pointer;position:relative}',
        '.pwt-tab--on{color:var(--dsw-alias-label-primary)}',
        '.pwt-tab--on:after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:2px;border-radius:2px 2px 0 0;background:var(--dsw-alias-label-primary)}',
        '.pwt-tabs-spacer{flex:1}',
        // 以下四条照抄 @deepseek-ai/dsh-client-ui-agent-preset 的 AgentPresetSeat.module.css，
        // 保证和宿主自己的预设胶囊视觉一致（类名前缀换成 pwt*）。
        // 与宿主 hero 行同宽同留白：width 公式抄 .wSkVaW_composerHero，
        // padding 抄 .wSkVaW_heroWorkspaceRow（0 16px 0 20px）。
        '.pwtDock{display:flex;align-items:center;justify-content:flex-start;gap:8px;margin-top:4px;align-self:center;width:min(calc(var(--dsh-composer-card-max-width, 760px) + 2 * var(--dsh-composer-side-clearance, 0px)), 100%);padding:0 16px 0 20px;box-sizing:border-box}',
        // 皮肤底板豁免：input.dock 的直接子元素会被皮肤刷成"配件底板"，
        // 而这一格是全宽容器（不是小配件）→ 整条被刷成玻璃横条。
        // 皮肤那条规则形如 html[data-dsh-skin] [data-phase="active"] [data-slot="conversation.input.dock"] > *
        // （特异性 0,3,1），这里用 html + 两个属性 + 类（0,4,1）压过它。
        'html:root [data-phase="active"] [data-slot="conversation.input.dock"] > .pwtDock',
        'html:root [data-slot="conversation.input.dock"] > .pwtDock{background:none !important;border:0 !important;border-radius:0 !important;box-shadow:none !important;backdrop-filter:none !important;-webkit-backdrop-filter:none !important}',
        // hover 模式：透明但占位，鼠标移上去显形（含键盘焦点，可达）
        '.pwtHoverWrap{display:inline-flex;align-items:center;min-height:28px;opacity:0;transition:opacity .12s var(--ds-ease-in-out,cubic-bezier(.4,0,.2,1))}',
        '.pwtHoverWrap:hover,.pwtHoverWrap:focus-within{opacity:1}',
        // 整行悬停即显形（relocate 的 .dshsm-dock 就是这套做法：盯着行容器，而不是不可见的小盒子）
        '.dshsm-dock:hover .pwtHoverWrap--row{opacity:1}',
        '[data-slot="conversation.input.dock"]:hover .pwtHoverWrap--row{opacity:1}',
        // 设置页的选项行
        '.pwt-opt{display:flex;align-items:center;gap:8px;cursor:pointer;padding:4px 0}',
        '.pwt-optName{font-size:13px;color:var(--dsw-alias-label-primary)}',
        // 菜单项：左名字右徽章，撑满整行（官方 Menu 的 item 容器是块级）
        '.pwtOpt{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;min-width:0}',
        '.pwtOptName{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
        '.pwtOptPend{flex:none;font-size:11px;line-height:16px;padding:0 6px;border-radius:9px;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-tertiary);white-space:nowrap}',
        '.pwt-caps{display:flex;flex-direction:column;gap:6px;margin-top:6px}',
        '.pwt-cap{align-items:flex-start}',
        '.pwt-capName{font-size:12.5px;font-weight:600;white-space:nowrap}',
        '.pwtMenuAnchor{min-width:54px;max-width:100%}',
        '.pwtSeat{border-radius:var(--dsw-radius-sm);min-width:0;max-width:min(100%,320px);min-height:28px;color:var(--dsw-alias-label-primary);white-space:nowrap;cursor:pointer;background:0 0;border:none;align-items:center;gap:4px;padding:0 8px;font-size:13px;font-weight:500;line-height:20px;display:inline-flex}',
        '.pwtSeat:not(:disabled):hover,.pwtSeat[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover)}',
        '.pwtSeat:disabled{cursor:default;color:var(--dsw-alias-label-quaternary,var(--dsw-alias-label-tertiary))}',
        '.pwtSeatIcon{color:var(--dsw-alias-label-primary);flex:none}',
        '.pwtSeatLabel{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}',
        '.pwtChevron{color:var(--dsw-alias-label-caption,var(--dsw-alias-label-tertiary));flex:none}',
        '.pwtSeatMenu{left:0;right:auto;min-width:220px}',
        // A label and its control must wrap as one unit: with bare flex items a narrow panel
        // pushes the control to the next line and leaves the label hanging behind.
        '.pwt-field{display:inline-flex;align-items:center;gap:6px;min-width:0;max-width:100%}',
        '.pwt-field>span{white-space:nowrap}',
        '.pwt-field>.pwt-input{flex:1 1 140px;min-width:110px}',
        '.pwt-dd{position:relative;display:inline-block}',
        // Surface colour: deliberately NOT --dsw-specific-menu. That token is the platform menu
        // fill and carries alpha (#f8f9fa94 on Windows), so a panel painted with it lets the
        // form underneath show through. Use the opaque bg-layer tokens instead.
        '.pwt-dd-btn{display:flex;align-items:center;gap:8px;width:100%;background:var(--dsw-alias-bg-layer-3,var(--dsw-alias-bg-layer-2,#fff))}',
        '.pwt-dd-btn:hover{background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-layer-3,#fff));border-color:var(--dsw-alias-label-dimmed)}',
        '.pwt-dd-label{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;text-align:left}',
        '.pwt-dd-caret{color:var(--dsw-alias-label-tertiary);font-size:11px}',
        '.pwt-dd-menu{position:absolute;top:calc(100% + 4px);left:0;min-width:230px;max-width:340px;max-height:280px;overflow-y:auto;background:var(--dsw-alias-bg-layer-3,var(--dsw-alias-bg-layer-2,#fff));border:1px solid var(--dsw-alias-border-l2);border-radius:8px;box-shadow:0 6px 20px rgba(0,0,0,.28);z-index:999;padding:4px}',
        '.pwt-dd-group{display:flex;flex-direction:column}',
        '.pwt-dd-glabel{font-size:11px;color:var(--dsw-alias-label-tertiary);padding:3px 8px 2px}',
        '.pwt-dd-opt{display:block;width:100%;text-align:left;background:none;border:none;color:var(--dsw-alias-label-primary);padding:5px 8px;border-radius:5px;cursor:pointer;font-size:13px}',
        '.pwt-dd-opt:hover{background:var(--dsw-alias-button-floating-hover,var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2)));color:var(--dsw-alias-label-primary)}',
        '.pwt-dd-sel{color:var(--dsw-alias-brand-primary);font-weight:600}',
        '.pwt-dd-opt.pwt-dd-sel{background:var(--dsw-alias-interactive-bg-active,var(--dsw-alias-bg-layer-2))}',
        '.pwt-title{font-weight:600;display:inline-flex;align-items:center}',
        '.pwt-lock{flex:none;margin-right:4px;color:var(--dsw-alias-label-tertiary)}',
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
          'whatIs': '预设是什么',
          'whatIsP1': '预设 = 新会话的「开局配置包」。你在新会话前选择哪个预设，那个会话里的 AI 就是什么人设、什么能力。',
          'whatIsP2': '一个预设包含三样：① 人设提示词（本页编辑的主体，可分多段）② 能力配置（下方「能力开关」里打勾即可加减工具）③ 名字与简介',
          'whatIsP3a': '新建自己的预设：',
          'whatIsP3b': '点下方「新建预设」→ 起个 id（英文小写，如 my-rp）和显示名 → 它会复制鲸鱼娘的全部内容 → 在编辑区改成你的设定 → 点「保存全部」→ 新开会话，在选择器里选它。完事。',
          'whatIsP4a': '改名/改简介：',
          'whatIsP4b': '在「查看」页选中预设，直接改上方的名称与简介，点保存即可。',
          'whatIsP5a': '勾选框：',
          'whatIsP5b': '取消勾选的段保留文字但不进入系统提示词（不给 AI 看）。',
          'whatIsP6a': '保存后：',
          'whatIsP6b': '只对之后新开的会话生效，当前正在聊的会话不变。',
          'currentPreset': '预设：',
          'openDir': '打开目录',
          'openDirTip': '在资源管理器中打开这个预设的文件夹',
          'validate': '校验挂载',
          'validateTip': '模拟一次会话加载，检查预设能否正常使用',
          'bindTitle': '工作区默认预设',
          'bindDesc': '为每个工作区目录预选默认预设，该目录的新建会话会默认选中它；未绑定目录使用全局默认。',
          'bindEmpty': '还没有工作区。先在左侧栏添加工作项目，再回来绑定。',
          'bindNone': '（不绑定，用全局默认）',
          'bindOrphan': '此目录已不在工作区列表，但绑定仍在——新会话若从这里启动仍会生效。',
          'bindOk': '已绑定：新会话将使用「{0}」。',
          'bindCleared': '已解除绑定，恢复全局默认。',
          'bindFail': '绑定失败: ',
          'tabView': '查看',
          'swTip': '切换这个会话的预设（下一次压缩对话后生效）',
          'swPick': '（未选择预设）',
          'pStandard': '标准模式',
          'pPtc': 'PTC 模式',
          'pMinimal': '极简模式',
          'pCordis': '创造模式',
          'swLoading': '正在读取预设清单…',
          'swHint': '已开始的会话在下一次压缩对话后生效',
          'swPendingTip': '将在下次压缩对话后切到「{0}」',
          'swPendingBadge': '下次压缩后',
          'swNow': '已切换预设。',
          'swQueued': '已排队：下一次压缩对话后生效。',
          'swFail': '切换失败: ',
          'tabNew': '新建',
          'newHint': '选一个模板 → 下面直接展开它的全部提示词，在这里改成你的 → 填 id 和显示名 → 另存为新预设。模板本体不会被改动。',
          'saveAs': '另存为新预设',
          'resetDraft': '放弃修改',
          'draftHint': '改的是副本；保存后模板本体保持不变。',
          'draftCapsTitle': '能力开关',
          'draftCapsHint': '勾选后保存时写进这个新预设的组合文件；模板本身不变。',
          'capNative': '模板自带，可取消',
          'capNativeLocked': '模板自带，嵌在分组内不可单独移除',
          'draftCapsEmpty': '能力目录暂时读不到，请刷新页面重试。',
          'draftEmpty': '这个预设没有可复制的分段提示词。换一个模板，或直接从空白开始新建。',
          'tplLoading': '正在读取模板…',
          'tplLoadFail': '模板读取失败: ',
          'saving': '正在保存…',
          'savedAs': '已保存为新预设「{0}」，并切换到它。',
          'saveAsFail': '保存失败: ',
          'tabHelp': '预设是什么？',
          'metaTitle': '名称与简介',
          'metaDblHint': '双击编辑',
          'metaLocalHint': '官方预设：这里的名字与简介只存在本机，不改动预设本身',
          'metaUnnamed': '（未命名）',
          'metaNoDesc': '（无简介）',
          'metaFieldName': '名称',
          'metaFieldDesc': '简介',
          'metaSave': '保存名称与简介',
          'metaSaved': '已保存：{0}',
          'metaFail': '保存失败: ',
          'tabSettings': '对话中切换预设',
          'setChipTitle': '预设胶囊',
          'setChipHint': '将在下次自动压缩记忆时使用本切换器选中的预设',
          'chipAlways': '一直显示',
          'chipHover': '悬浮在那一行才出现',
          'chipHoverSelf': '只悬浮胶囊才出现',
          'chipNever': '不显示',
          'collapse': '收起新建',
          'deletePreset': '删除预设',
          'deleteTip': '删除整个预设文件夹（两击确认防手滑）',
          'confirmDel': '⚠ 确认删除 {0} ？',
          'cancelDel': '取消',
          'selectUnit': '（选择）',
          'brokenTag': '（损坏）',
          'template': '模板：',
          'idLabel': 'id：',
          'nameLabel': '显示名：',
          'idPlaceholder': '英文小写，如 my-rp',
          'namePlaceholder': '',
          'createFrom': '从模板创建',
          'noTemplateSel': '请先选择模板',
          'creating': '创建中…',
          'created': '已创建: {0}。现在编辑它的提示词段落，改完记得点「保存全部」，然后在新会话的选择器里选它。',
          'createFail': '创建失败: ',
          'deleteFail': '删除失败: ',
          'deleted': '已删除预设: {0}',
          'addSection': '＋添加段落',
          'saveAll': '保存',
          'revert': '还原',
          'revertTip': '丢弃未保存的修改，重新读取磁盘上的内容',
          'reverted': '已还原为磁盘上的内容',
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
          'openDirOk': '已打开目录: {0}',
          'loadFail': '读取失败: ',
          'capsTitle': '能力开关：给这个预设加/减工具（打勾立即生效，自动校验）',
          'vtSections': '段落',
          'vtCaps': '能力开关',
          'vtBinds': '工作区默认预设',
          'capsDesc': '下面是可选能力，每次切换会自动校验并提示结果。只对之后新开的会话生效。',
          'capsRo': '官方预设只读——不可修改。想改成自己的，复制一份再编辑。',
          'capsHint': '选中预设后这里会列出可开关的能力',
          'capOn': '开启',
          'capOff': '关闭',
          'capToggle': '能力「{0}」{1}。新会话生效；挂载校验{2}',
          'capOk': '通过 ✔',
          'capFail': '失败：{0}',
          'capSwitchFail': '能力切换失败: ',
          'badgeWired': '🔌 已接线（未启用）',
          'grpUser': '📁 用户模板',
          'grpSystem': '🏁 插件 / 系统预设',
          'unitNone': '（未选择）',
          'nameWrap': '（{0}）',
          'curUserGrp': '用户预设',
          'curSystemGrp': '插件 / 系统预设（只读）',
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
          'kindBuiltin': '📦 内置模板',
          'kindBuiltinTip': '这个 id 与插件随包分发的模板同名，且内容与模板一致——该内容已随插件公开。',
          'kindBuiltinModified': '📦 内置模板 · ✏️ 已改动',
          'kindBuiltinModifiedTip': 'id 与随包模板同名，但内容已被改动——里面可能有你自己加的内容，不要假定它和模板一样可以公开。',
          'kindTemplate': '📦 插件内置模板',
          'kindOfficial': '官方预设',
          'kindOfficialTip': '由 DSH 官方或第三方插件声明，磁盘上没有目录，本工作台只能查看。',
        },
        en: {
          'sectionTitle': 'Preset Workbench',
          'lang': '中文',
          'whatIs': 'What is a preset',
          'whatIsP1': 'A preset is a "starter config pack" for a new session. Whichever preset you pick before a session sets that session\u2019s persona and capabilities.',
          'whatIsP2': 'A preset has three parts: ① persona prompt (edited here, can be multi-section) ② capability config (toggle tools below in "Capabilities") ③ name & description',
          'whatIsP3a': 'Create your own: ',
          'whatIsP3b': 'click "New preset" → give an id (lowercase, e.g. my-rp) and display name → it copies whale-mom\u2019s full content → edit in the area → "Save all" → open a new session and pick it. Done.',
          'whatIsP4a': 'Rename / edit description: ',
          'whatIsP4b': 'Pick the preset on the View tab and edit its name and description right there, then save.',
          'whatIsP5a': 'Checkboxes: ',
          'whatIsP5b': 'unchecked sections keep their text but are excluded from the system prompt (hidden from the AI).',
          'whatIsP6a': 'After saving: ',
          'whatIsP6b': 'only affects sessions opened afterwards; the current conversation stays unchanged.',
          'currentPreset': 'Preset:',
          'openDir': 'Open folder',
          'openDirTip': 'Open this preset\u2019s folder in the file explorer',
          'validate': 'Validate load',
          'validateTip': 'Simulate a session load to check the preset works',
          'bindTitle': 'Workspace default presets',
          'bindDesc': 'Pick a default preset for each workspace directory; new sessions created there start on it, and unbound directories use the global default.',
          'bindEmpty': 'No workspaces yet. Add a work project in the sidebar first, then come back to bind.',
          'bindNone': '(none — use global default)',
          'bindOrphan': 'This directory left the workspace list, but the binding remains — new sessions started here still apply it.',
          'bindHint': 'Sessions started in subdirectories inherit the binding too. An explicit preset picked for a new session always wins.',
          'bindOk': 'Bound: new sessions will use “{0}”.',
          'bindCleared': 'Binding removed; the global default applies again.',
          'bindFail': 'Binding failed: ',
          'tabView': 'View',
          'swTip': 'Switch this session\'s preset (takes effect after the next compaction)',
          'swPick': '(no preset)',
          'pStandard': 'Standard mode',
          'pPtc': 'PTC mode',
          'pMinimal': 'Minimal mode',
          'pCordis': 'Creator mode',
          'swLoading': 'Loading presets…',
          'swHint': 'A session already under way switches after its next compaction',
          'swPendingTip': 'Will switch to "{0}" after the next compaction',
          'swPendingBadge': 'next compaction',
          'swNow': 'Preset switched.',
          'swQueued': 'Queued: takes effect after the next compaction.',
          'swFail': 'Switch failed: ',
          'tabNew': 'New',
          'newHint': 'Pick a template — its full prompt expands below and you edit it right there — then give an id and a name and save as a new preset. The template itself is never modified.',
          'saveAs': 'Save as new preset',
          'resetDraft': 'Discard edits',
          'draftHint': 'You are editing a copy; saving leaves the template untouched.',
          'draftCapsTitle': 'Capabilities',
          'draftCapsHint': 'Checked items are written into the new preset\'s composition on save; the template stays untouched.',
          'capNative': 'from template, can be unchecked',
          'capNativeLocked': 'from template, nested in a group — cannot be removed here',
          'draftCapsEmpty': 'The capability catalog could not be read. Refresh the page and retry.',
          'draftEmpty': 'This preset has no section files to copy. Pick another template, or start from an empty draft.',
          'tplLoading': 'Reading template…',
          'tplLoadFail': 'Template read failed: ',
          'saving': 'Saving…',
          'savedAs': 'Saved as new preset "{0}" and switched to it.',
          'saveAsFail': 'Save failed: ',
          'tabHelp': 'What is a preset?',
          'metaTitle': 'Name and description',
          'metaDblHint': 'Double-click to edit',
          'metaLocalHint': 'Official preset: the name and description here live on this machine only and never modify the preset',
          'metaUnnamed': '(unnamed)',
          'metaNoDesc': '(no description)',
          'metaFieldName': 'Name',
          'metaFieldDesc': 'Description',
          'metaSave': 'Save name and description',
          'metaSaved': 'Saved: {0}',
          'metaFail': 'Save failed: ',
          'tabSettings': 'Switch preset mid-conversation',
          'setChipTitle': 'Preset chip',
          'setChipHint': 'The preset chosen here is used from the next automatic context compaction',
          'chipAlways': 'Always visible',
          'chipHover': 'On row hover',
          'chipHoverSelf': 'Only when hovering the chip',
          'chipNever': 'Never',
          'collapse': 'Collapse',
          'deletePreset': 'Delete preset',
          'deleteTip': 'Delete the whole preset folder (two clicks to confirm)',
          'confirmDel': '⚠ Delete {0}?',
          'cancelDel': 'Cancel',
          'selectUnit': '（select）',
          'brokenTag': '（broken）',
          'template': 'Template:',
          'idLabel': 'id:',
          'nameLabel': 'Name:',
          'idPlaceholder': 'lowercase, e.g. my-rp',
          'namePlaceholder': '',
          'createFrom': 'Create from template',
          'noTemplateSel': 'Please select a template first',
          'creating': 'Creating…',
          'created': 'Created {0}. Now edit its prompt sections, then click "Save all", and pick it in a new session\u2019s selector.',
          'createFail': 'Create failed: ',
          'deleteFail': 'Delete failed: ',
          'deleted': 'Deleted preset: {0}',
          'addSection': '+ Add section',
          'saveAll': 'Save',
          'revert': 'Revert',
          'revertTip': 'Discard unsaved changes and re-read from disk',
          'reverted': 'Reverted to the version on disk',
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
          'openDirOk': 'Opened folder: {0}',
          'loadFail': 'Load failed: ',
          'capsTitle': 'Capabilities: add/remove tools for this preset (toggle applies immediately, auto-validated)',
          'vtSections': 'Sections',
          'vtCaps': 'Capabilities',
          'vtBinds': 'Workspace defaults',
          'capsDesc': 'The optional capabilities below. Each toggle auto-validates. Affects only new sessions.',
          'capsRo': 'Official presets are read-only — not editable. Duplicate one to make your own.',
          'capsHint': 'Capabilities will appear here after picking a preset',
          'capOn': 'on',
          'capOff': 'off',
          'capToggle': 'Capability "{0}" {1}. New sessions; mount check {2}',
          'capOk': 'passed ✔',
          'capFail': 'failed: {0}',
          'capSwitchFail': 'Capability toggle failed: ',
          'badgeWired': '🔌 wired (inactive)',
          'grpUser': '📁 User templates',
          'grpSystem': '🏁 Plugin / system presets',
          'unitNone': '（not selected）',
          'nameWrap': '（{0}）',
          'curUserGrp': 'User presets',
          'curSystemGrp': 'Plugin / system presets (read-only)',
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
          'kindBuiltin': '📦 Built-in template',
          'kindBuiltinTip': 'This id matches a template shipped with the plugin, and the content matches it byte for byte — that content is already public with the plugin.',
          'kindBuiltinModified': '📦 Built-in template · ✏️ modified',
          'kindBuiltinModifiedTip': 'The id matches a shipped template, but the content has been changed — it may contain your own additions, so do not assume it is as public as the template.',
          'kindTemplate': '📦 Built-in template',
          'kindOfficial': 'Official preset',
          'kindOfficialTip': 'Declared by DSH or a third-party plugin, with no directory on disk — this workbench can only view it.',
        },
      }
      /**
       * 把一个预设 id 解析成显示名。
       *
       * 宿主那四个内置预设的声明里只有 id（name 缺省），官方界面用自己的 locale
       * 把它们映射成"标准模式 / PTC 模式 / 极简模式 / 创造模式"。这里照同样规则来，
       * 否则切换器上会显示成 cordis 这种裸 id。
       * @param id 预设 id
       * @param name 预设声明的显示名（可能缺省）
       * @returns 展示用文本
       */
      function presetLabel(id, name) {
        if (id === undefined || id === null || id === '') return ''
        var builtin = {
          standard: 'pStandard',
          ptc: 'pPtc',
          minimal: 'pMinimal',
          cordis: 'pCordis',
        }
        if (builtin[id] !== undefined) return t(builtin[id])
        return (name !== undefined && name !== null && name !== '') ? name : String(id)
      }

      // ── 会话内胶囊的显示模式 ────────────────────────────────────────────────
      // 这是纯前端偏好（不该进预设文件），所以存 localStorage 并用订阅即时广播：
      // 设置页一改，已经在跑的对话区胶囊立刻跟着变，不用刷新。
      var CHIP_MODE_KEY = 'pwt-chip-mode'
      // hover = 整行悬浮就显形；hover-self = 只悬浮胶囊那一小块才显形（最早的做法）
      var CHIP_MODES = ['always', 'hover', 'hover-self', 'never']
      var chipModeListeners = []

      function readChipMode() {
        try {
          var v = localStorage.getItem(CHIP_MODE_KEY)
          return CHIP_MODES.indexOf(v) >= 0 ? v : 'always'
        } catch (e) { return 'always' }
      }

      var chipModeNow = readChipMode()

      function setChipMode(next) {
        if (CHIP_MODES.indexOf(next) < 0) return
        chipModeNow = next
        try { localStorage.setItem(CHIP_MODE_KEY, next) } catch (e) {}
        for (var i = 0; i < chipModeListeners.length; i++) {
          try { chipModeListeners[i](next) } catch (e) {}
        }
      }

      /** 订阅显示模式；返回 [mode, setMode]。 */
      function useChipMode() {
        var st = react.useState(chipModeNow)
        var mode = st[0]
        var setMode = st[1]
        react.useEffect(function () {
          var fn = function (v) { setMode(v) }
          chipModeListeners.push(fn)
          return function () {
            chipModeListeners = chipModeListeners.filter(function (x) { return x !== fn })
          }
        }, [])
        return mode
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
                arr.map(function (it) {
                  var v = it.source + ':' + it.id
                  return h('button', { key: v, type: 'button', className: 'pwt-dd-opt' + (v === val ? ' pwt-dd-sel' : ''), onClick: function () { onChange(v); setOpen(false) } },
                    it.id + (it.name ? t('nameWrap', it.name) : ''))
                })
              )
            })
          ) : null
        )
      }

      /**
       * 锁图标：用内联 SVG 而不是 emoji —— emoji 在 Windows 上会走彩色字形，
       * 尺寸和基线都不受控，和文字排在一行时高度对不齐。
       * 注意：必须定义在 WorkbenchPage 同级（它不在 apply() 作用域里）。
       */
      function LockIcon() {
        return h('svg', { className: 'pwt-lock', width: 12, height: 12, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
          h('path', { d: 'M4.6 7V5.2a3.4 3.4 0 0 1 6.8 0V7', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' }),
          h('rect', { x: 2.9, y: 7, width: 10.2, height: 6.8, rx: 1.6, stroke: 'currentColor', strokeWidth: 1.5 }),
        )
      }

      /** 加号图标：画线而不是打 "+" 字符，避免字体基线导致视觉偏心。 */
      function IconPlus() {
        return h('svg', { width: 12, height: 12, viewBox: '0 0 12 12', fill: 'none', 'aria-hidden': 'true' },
          h('path', { d: 'M6 2.2v7.6M2.2 6h7.6', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' }),
        )
      }

      /** 减号图标：同上，横线居中。 */
      function IconMinus() {
        return h('svg', { width: 12, height: 12, viewBox: '0 0 12 12', fill: 'none', 'aria-hidden': 'true' },
          h('path', { d: 'M2.2 6h7.6', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' }),
        )
      }
      function WorkbenchPage() {
        var presetsL = react.useState(null); var list = presetsL[0]; var setList = presetsL[1]
        var cur = react.useState(''); var current = cur[0]; var setCurrent = cur[1]
        var dta = react.useState(null); var data = dta[0]; var setData = dta[1]
        var stt = react.useState(''); var status = stt[0]; var setStatus = stt[1]
        var bsy = react.useState(false); var busy = bsy[0]; var setBusy = bsy[1]
        var shw = react.useState('view'); var tab = shw[0]; var setTab = shw[1]
        var chipMode = useChipMode()
        var nid = react.useState(''); var newId = nid[0]; var setNewId = nid[1]
        var nnm = react.useState(''); var newName = nnm[0]; var setNewName = nnm[1]
        var tpl = react.useState(null); var templates = tpl[0]; var setTemplates = tpl[1]
        var tplSel = react.useState(''); var template = tplSel[0]; var setTemplate = tplSel[1]
        var cfd = react.useState(false); var confirmDel = cfd[0]; var setConfirmDel = cfd[1]
        var lng = react.useState(langNow()); var lang = lng[0]; var setLangState = lng[1]
        var curRo = react.useState(false); var currentReadonly = curRo[0]; var setCurrentReadonly = curRo[1]
        var bnd = react.useState(null); var bindings = bnd[0]; var setBindings = bnd[1]
        // draft：新建页从模板加载、就地修改的段落副本；模板本体不被触碰。
        var drf = react.useState(null); var draft = drf[0]; var setDraft = drf[1]
        // 新建页能力开关的折叠状态（默认展开，点标题可收）。
        var nco = react.useState(true); var newCapsOpen = nco[0]; var setNewCapsOpen = nco[1]
        // 查看页：当前预设的名字 / 简介（直接改 preset.yml，不用开记事本）。
        var mns = react.useState(''); var metaName = mns[0]; var setMetaName = mns[1]
        var mds = react.useState(''); var metaDesc = mds[0]; var setMetaDesc = mds[1]
        // 正在就地编辑哪个字段：'' | 'name' | 'desc'
        var med = react.useState(''); var metaEditing = med[0]; var setMetaEditing = med[1]
        // 新建页的能力勾选：即使还没选模板也要能勾（取模板的默认值覆盖）。
        var ncap = react.useState(null); var newCaps = ncap[0]; var setNewCaps = ncap[1]

        var loadCapsCatalog = function () {
          return rpc('capsCatalog', { lang: langNow() }).then(function (r) {
            if (!r || !r.ok) throw new Error((r && r.error) || 'capsCatalog failed')
            return (r.caps || []).map(function (c) {
              return { id: c.id, title: c.title, desc: c.desc, enabled: false, dormant: !!c.dormant }
            })
          }).catch(function () {
            // 老宿主机没有 capsCatalog：借 caps（任一预设）拿到同一份目录，全部按未勾选。
            return rpc('templates').then(function (t) {
              var first = t && t.ok && (t.templates || [])[0]
              if (!first) return []
              return rpc('caps', { id: first.id, lang: langNow() }).then(function (r2) {
                if (!r2 || !r2.ok) return []
                return (r2.caps || [])
                  .filter(function (c) { return c.kind === 'cap' })
                  .map(function (c) {
                    return { id: c.id, title: c.title, desc: c.desc, enabled: false, dormant: !!c.dormant }
                  })
              })
            }).catch(function () { return [] })
          }).then(function (list) { setNewCaps(list) })
        }

        var loadBindings = function () {
          return rpc('bindings').then(function (r) {
            if (r && r.ok) setBindings(r.rows || [])
          }).catch(function () { setBindings([]) })
        }
        react.useEffect(function () { loadBindings(); loadCapsCatalog() }, [])

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

        // ── 新建页：选模板 → 就地加载它的段落 ──────────────────────────
        var onPickTemplate = function (value) {
          setTemplate(value)
          setDraft(null)
          setStatus(t('tplLoading'))
          var tplId = String(value).replace(/^[a-z]+:/, '')
          rpc('templateDraft', { id: tplId, lang: langNow() }).then(function (r) {
            if (!r || !r.ok) throw new Error((r && r.error) || 'load failed')
            setDraft({
              template: tplId,
              sections: (r.sections || []).map(function (x) {
                return { file: x.file, title: x.title, enabled: x.enabled !== false, text: x.text || '' }
              }),
            })
            var fromTpl = r.caps || []
            setNewCaps(function (prev) {
              var base = prev && prev.length ? prev : fromTpl
              return base.map(function (c) {
                var hit = fromTpl.filter(function (x) { return x.id === c.id })[0]
                return {
                  id: c.id,
                  title: c.title || (hit && hit.title) || c.id,
                  desc: c.desc || (hit && hit.desc) || '',
                  dormant: !!c.dormant,
                  // native = 模板组合里本来就有，另存时原样带过去；勾选框只是告知
                  native: !!(hit && hit.enabled),
                  // 模板自带的项：能不能在这里取消，取决于它是不是顶层行
                  locked: !!(hit && hit.enabled) && !(hit && hit.removable),
                  enabled: !!(hit && hit.enabled),
                }
              })
            })
            setStatus('')
          }).catch(function (e) { setStatus(t('tplLoadFail') + e.message) })
        }
        // 注意：这三个函数只改 sections，必须把 draft 的其余字段（template 最关键）
        // 原样带过去。以前它们返回 { sections } 就把 template 丢了，于是「选模板 →
        // 就地改一个字 → 另存」会送出空 template，宿主不写组合文件，存出一个挂不
        // 起来的预设（工作台标「损坏」、预设选择器里也看不到）。
        var patchDraft = function (i, patch) {
          setDraft(function (d) {
            if (!d) return d
            var arr = d.sections.slice()
            arr[i] = Object.assign({}, arr[i], patch)
            return Object.assign({}, d, { sections: arr })
          })
        }
        var removeDraft = function (i) {
          setDraft(function (d) {
            if (!d) return d
            return Object.assign({}, d, { sections: d.sections.filter(function (_x, j) { return j !== i }) })
          })
        }
        var toggleNewCap = function (i) {
          // 只有"模板自带且嵌在分组里"的项不可动；顶层行允许取消（会真的从组合里删掉）。
          if (newCaps && newCaps[i] && newCaps[i].locked) return
          setNewCaps(function (list) {
            if (!list) return list
            var arr = list.slice()
            arr[i] = Object.assign({}, arr[i], { enabled: !arr[i].enabled })
            return arr
          })
        }
        var addDraftSection = function () {
          setDraft(function (d) {
            var arr = d && d.sections ? d.sections.slice() : []
            arr.push({ file: '', title: '', enabled: true, text: '' })
            return Object.assign({}, d || {}, { sections: arr })
          })
        }
        var doSaveAs = function () {
          if (!newId) return
          setBusy(true)
          setStatus(t('saving'))
          rpc('save-as', {
            id: newId,
            name: newName,
            template: draft.template || '',
            lang: langNow(),
            caps: (newCaps || []).filter(function (c) { return c.enabled }).map(function (c) { return c.id }),
            // 只报模板本来有、这次被取消的；模板本来就没有的项（含预留接线）不受影响。
            removed: (newCaps || []).filter(function (c) { return c.native && !c.enabled }).map(function (c) { return c.id }),
            sections: (draft && draft.sections ? draft.sections : []).map(function (x) {
              return { title: x.title, enabled: x.enabled !== false, text: x.text || '' }
            }),
          }).then(function (r) {
            if (!r || !r.ok) throw new Error((r && r.error) || 'save-as failed')
            setTab('view')
            setNewId('')
            setNewName('')
            setDraft(null)
            setStatus(t('savedAs', r.id))
            return refresh().then(function () { setCurrent(r.id) })
          }).catch(function (e) { setStatus(t('saveAsFail') + e.message) }).finally(function () { setBusy(false) })
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

        /** 保存名字与简介：宿主只改 preset.yml 的这两行，然后重新声明预设。 */
        /**
         * 保存名字 / 简介。就地编辑时只提交被改的那个字段，另一侧传 null 表示不动。
         * @param field 'name' | 'desc' | ''（空 = 两个都提交）
         */
        /**
         * 进入编辑态前先把草稿填成"现在叫什么"。
         *
         * 数据来源分两级：新宿主的 load 会带回 meta（preset.yml 原文）；
         * 老宿主没有这个字段，就退回列表里的 name/description —— 两者都能拿到，
         * 所以输入框永远不会是空的。
         */
        var beginEdit = function (field) {
          if (isRo || busy) return
          var known = (data && data.meta) || {}
          var name = known.name !== undefined ? String(known.name) : ((currentMeta && currentMeta.name) || '')
          var desc = known.description !== undefined ? String(known.description) : ((currentMeta && currentMeta.description) || '')
          setMetaName(name)
          setMetaDesc(desc)
          setMetaEditing(field)
        }

        // 载入完成 / 切换预设后同步草稿（正在编辑时不覆盖用户输入）。
        react.useEffect(function () {
          if (metaEditing !== '') return
          var known = (data && data.meta) || {}
          setMetaName(known.name !== undefined ? String(known.name) : ((currentMeta && currentMeta.name) || ''))
          setMetaDesc(known.description !== undefined ? String(known.description) : ((currentMeta && currentMeta.description) || ''))
        }, [current, data, currentMeta, metaEditing])

        var doSaveMeta = function (field) {
          if (!current) return
          // 与 beginEdit 用同一套回退，老宿主（load 不带 meta）也能判断值没被改过
          var known = (data && data.meta) || {}
          var curName = known.name !== undefined ? String(known.name) : ((currentMeta && currentMeta.name) || '')
          var curDesc = known.description !== undefined ? String(known.description) : ((currentMeta && currentMeta.description) || '')
          var sameName = (field === 'desc') || (metaName === curName)
          var sameDesc = (field === 'name') || (metaDesc === curDesc)
          if (sameName && sameDesc) { setMetaEditing(''); return }
          setBusy(true)
          setStatus(t('saving'))
          var payload = { id: current }
          if (field !== 'desc') payload.name = metaName
          if (field !== 'name') payload.description = metaDesc
          rpc(isRo ? 'setOverride' : 'setMeta', payload).then(function (r) {
            if (!r || !r.ok) throw new Error((r && r.error) || 'setMeta failed')
            setMetaName(r.name || '')
            setMetaDesc(r.description || '')
            setMetaEditing('')
            setStatus(t('metaSaved', r.name || current))
            if (isRo) { setData(function (d) { return d === null ? d : Object.assign({}, d, { meta: { id: current, name: r.name, description: r.description } }) }) }
            return refresh()
          }).catch(function (e) { setStatus(t('metaFail') + e.message) }).finally(function () { setBusy(false) })
        }

        /** 键盘约定：Enter 保存，Esc 取消（简介里 Ctrl+Enter 才保存，普通回车换行）。 */
        var metaKey = function (e, field) {
          if (e.key === 'Escape') {
            // 退出编辑态即可：上面的 effect 会按"已存值"重新预填草稿，
            // 所以 Esc 不会把框清空（老宿主没有 load.meta 时也一样）。
            setMetaEditing('')
            return
          }
          if (e.key === 'Enter' && (field === 'name' || e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            doSaveMeta(field)
          }
        }

        /** 还原：丢掉内存里的改动，重新从磁盘读一次（段落、标题、启用状态全回到已保存版本）。 */
        var doRevert = function () {
          if (!current) return
          setSecTab(0)
          load(current)
          setStatus(t('reverted'))
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
            setOpenHint(t('openDirOk', r.dir))
          }).catch(function (e) { setOpenHint(t('openDirFail') + e.message) })
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

        /** 新增一段，并自动跳到这一段（否则新段落加在最后，用户还得自己翻过去找）。 */
        var addSection = function () {
          var at = (data && data.sections ? data.sections.length : 0)
          setData(function (d) {
            if (!d) return d
            var arr = d.sections.slice()
            arr.push({ file: 'section.' + Date.now() + '.md', title: '新段落', enabled: true, text: '' })
            return Object.assign({}, d, { sections: arr })
          })
          setSecTab(at)
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
        // 打开目录的结果显示在该按钮正下方（不进全局状态栏，避免和其他提示混在一起）。
        var oh = react.useState(''); var openHint = oh[0]; var setOpenHint = oh[1]
        // 查看页的子页签：段落 / 能力开关 / 工作区默认预设
        var vtv = react.useState('sections'); var viewTab = vtv[0]; var setViewTab = vtv[1]
        // 段落切换：每个段落一个标签，标签文字就是段落标题（核心人设 / 人格开关 …）。
        var secT = react.useState(0); var secTab = secT[0]; var setSecTab = secT[1]

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

        /** 开关一条「可关的地基行」（目前只有 command-compact）：宿主写 disabled。 */
        var toggleRow = function (c) {
          if (!current) return
          setBusy(true)
          rpc('setRow', { id: current, module: c.module, enabled: !c.enabled }).then(function (r) {
            if (!r || !r.ok) throw new Error(r && r.error || 'setRow failed')
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

        // ── 选择与操作（钉在顶部，不随内容滚动）──
        // 按只读性分组：用户预设可编辑，官方预设（system）只读。
        var userOpts = []
        var systemOpts = []
        ;(list || []).forEach(function (p) {
          // 可编辑预设加来源标记：📦 = 与随包模板同名；自定义不加任何标记。
          var mark = p.readonly ? '' : (p.kind === 'builtin' ? '📦 ' : '')
          var label = mark + (p.name ? p.name + ' · ' : '') + p.id + (p.broken ? t('brokenTag') : '')
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

        children.push(h('div', { key: 'tabs', className: 'pwt-tabs', role: 'tablist', 'aria-label': t('sectionTitle') },
          h('button', { type: 'button', className: 'pwt-tab' + (tab === 'view' ? ' pwt-tab--on' : ''), role: 'tab', 'aria-selected': tab === 'view', onClick: function () { setTab('view'); setConfirmDel(false) } }, t('tabView')),
          h('button', { type: 'button', className: 'pwt-tab' + (tab === 'new' ? ' pwt-tab--on' : ''), role: 'tab', 'aria-selected': tab === 'new', onClick: function () { setTab('new'); setConfirmDel(false) } }, t('tabNew')),
          h('button', { type: 'button', className: 'pwt-tab' + (tab === 'help' ? ' pwt-tab--on' : ''), role: 'tab', 'aria-selected': tab === 'help', onClick: function () { setTab('help'); setConfirmDel(false) } }, t('tabHelp')),
          h('button', { type: 'button', className: 'pwt-tab' + (tab === 'settings' ? ' pwt-tab--on' : ''), role: 'tab', 'aria-selected': tab === 'settings', onClick: function () { setTab('settings'); setConfirmDel(false) } }, t('tabSettings')),
          h('span', { className: 'pwt-tabs-spacer', role: 'presentation' }),
          h('button', { className: 'pwt-btn', role: 'presentation', onClick: toggleLang, title: lang === 'en' ? '切换到中文' : 'Switch to English' }, t('lang'))
        ))

        // ── 第三页：预设是什么 ──
        if (tab === 'help') children.push(h('div', { key: 'help', className: 'pwt-help' },
          h('div', { className: 'pwt-title' }, t('whatIs')),
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

        // ── 第四页：对话中切换预设 ── 预设胶囊的显示方式。
        if (tab === 'settings') {
          var chipModes = [
            { id: 'always', name: t('chipAlways') },
            { id: 'hover', name: t('chipHover') },
            { id: 'hover-self', name: t('chipHoverSelf') },
            { id: 'never', name: t('chipNever') },
          ]
          children.push(h('div', { key: 'setChip', className: 'pwt-card' },
            h('div', { className: 'pwt-title' }, t('setChipTitle')),
            h('div', { className: 'pwt-hint' }, t('setChipHint')),
            h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2, marginTop: 6 } },
              chipModes.map(function (m) {
                return h('label', { key: m.id, className: 'pwt-opt' },
                  h('input', {
                    type: 'radio',
                    name: 'pwt-chip-mode',
                    checked: chipMode === m.id,
                    onChange: function () { setChipMode(m.id) },
                  }),
                  h('span', { className: 'pwt-optName' }, m.name)
                )
              })
            )
          ))
        }

        // ── 编辑动作行 ──
        var saveHint = ''
        if (isRo) saveHint = t('systemBadge')
        else if (!current) saveHint = t('saveHintNone')
        else if (!data) saveHint = t('saveHintLoading')

        if (tab === 'view') children.push(h('div', { key: 'row1', className: 'pwt-row pwt-presetRow' },
          h('span', null, t('currentPreset')),
          h('select', { className: 'pwt-select', value: current, onChange: function (e) { setCurrent(e.target.value); setConfirmDel(false); setOpenHint(''); setSecTab(0) }, disabled: busy },
            h('option', { key: '', value: '' }, t('selectUnit')),
            opts
          ),
          h('div', { className: 'pwt-btnCol' },
            h('button', { className: 'pwt-btn', onClick: doReveal, disabled: !current || isRo, title: t('openDirTip') }, t('openDir')),
            openHint ? h('span', { className: 'pwt-openHint', title: openHint }, openHint) : null
          ),
          h('button', { className: 'pwt-btn', onClick: doValidate, disabled: busy || !current, title: t('validateTip') }, t('validate')),
          h('button', {
            className: 'pwt-btn pwt-btnDanger',
            onClick: function () { if (confirmDel) { doDelete() } else { setConfirmDel(true) } },
            disabled: busy || !current || isRo,
            title: t('deleteTip')
          }, confirmDel ? t('confirmDel', current) : t('deletePreset')),
          // 确认态必须能退出来：只提示确认、却不给取消键，等于逼用户点下去。
          confirmDel
            ? h('button', { className: 'pwt-btn', onClick: function () { setConfirmDel(false) }, disabled: busy }, t('cancelDel'))
            : null,
          // 【还原】= 重新从磁盘读一次，丢弃未保存的改动（放在保存左边，误点也不会丢数据）
        // 保存放在这一排末尾：和预设级操作一起，不用滚到段落区去找
          h('button', { className: 'pwt-btn', onClick: doRevert, disabled: busy || !data || !current || isRo, title: t('revertTip') }, t('revert')),
          h('button', { className: 'pwt-btn', onClick: save, disabled: busy || !data || !current || isRo }, t('saveAll')),
          h('span', { className: 'pwt-hint' }, saveHint)
        ))

        if (tab === 'view' && currentMeta) {
          // 来源徽章：📦 内置模板 / 📦·✏️ 已改动 / 官方预设；自定义不显示徽章
          var badge = (function (p) {
            if (p.readonly) return { text: t('kindOfficial'), tip: t('kindOfficialTip'), warn: false }
            if (p.kind === 'builtin') {
              return p.modified
                ? { text: t('kindBuiltinModified'), tip: t('kindBuiltinModifiedTip'), warn: true }
                : { text: t('kindBuiltin'), tip: t('kindBuiltinTip'), warn: false }
            }
            return null
          })(currentMeta)
        // 名称 / 简介：双击就地变输入框。只读预设（官方 / 第三方声明）不给编辑。
        var metaRow = function () {
          // 官方/第三方声明式预设没有磁盘文件，改名字与简介会落到本插件的本地覆盖里，
          // 既不改动那份声明，也不写 DSH 配置 —— 所以这里一律可编辑。
          var canEdit = true
          var nameNode = metaEditing === 'name'
            ? h('input', {
                className: 'pwt-input pwt-inlineInput',
                value: metaName,
                autoFocus: true,
                placeholder: '',
                disabled: busy,
                onChange: function (e) { setMetaName(e.target.value) },
                onKeyDown: function (e) { metaKey(e, 'name') },
                onBlur: function () { doSaveMeta('name') },
              })
            : h('span', {
                className: 'pwt-metaName' + (canEdit ? ' pwt-editable' : ''),
                title: canEdit ? t('metaDblHint') : '',
                onDoubleClick: function () { beginEdit('name') },
              }, currentMeta.name || t('metaUnnamed'))
          var descNode = metaEditing === 'desc'
            ? h('textarea', {
                className: 'pwt-ta pwt-ta-1 pwt-inlineTextarea',
                value: metaDesc,
                autoFocus: true,
                placeholder: '',
                rows: 3,
                disabled: busy,
                onChange: function (e) { setMetaDesc(e.target.value) },
                onKeyDown: function (e) { metaKey(e, 'desc') },
                onBlur: function () { doSaveMeta('desc') },
              })
            : h('span', {
                className: 'pwt-metaDesc' + (canEdit ? ' pwt-editable' : ''),
                title: canEdit ? t('metaDblHint') : '',
                onDoubleClick: function () { beginEdit('desc') },
              }, currentMeta.description || t('metaNoDesc'))
          return h('div', { key: 'meta', className: 'pwt-metaRow' },
            badge ? h('span', { className: 'pwt-kind' + (badge.warn ? ' pwt-kindWarn' : ''), title: badge.tip }, badge.text) : null,
            h('span', { className: 'pwt-metaTitle' }, t('metaName', '')),
            nameNode,
            h('div', { className: 'pwt-metaDescWrap' }, descNode),
            isRo ? h('div', { className: 'pwt-hint', style: { flexBasis: '100%' } }, t('metaLocalHint')) : null
          )
        }
        children.push(metaRow())
        }

        if (tab === 'new') {
          children.push(h('div', { key: 'newHint', className: 'pwt-hint' }, t('newHint')))
          children.push(h('div', { key: 'rowNew', className: 'pwt-row' },
            h('div', { className: 'pwt-field' },
              h('span', null, t('template')),
              h(TemplatePicker, { value: template, items: templates || [], onChange: onPickTemplate })
            ),
            h('label', { className: 'pwt-field pwt-grow' },
              h('span', null, t('idLabel')),
              h('input', { className: 'pwt-input', value: newId, placeholder: t('idPlaceholder'), onChange: function (e) { setNewId(e.target.value) } })
            ),
            h('label', { className: 'pwt-field pwt-grow' },
              h('span', null, t('nameLabel')),
              h('input', { className: 'pwt-input', value: newName, placeholder: t('namePlaceholder'), onChange: function (e) { setNewName(e.target.value) } })
            ),
            h('button', { className: 'pwt-btn', onClick: doSaveAs, disabled: busy || !newId }, t('saveAs'))
          ))
          // 能力开关常驻：还没选模板也能先勾好，保存时一并写入组合文件。
          children.push(h('details', { key: 'newCaps', className: 'pwt-help', open: newCapsOpen, onToggle: function (e) { setNewCapsOpen(e.target.open) } },
            h("summary", null,
              h('span', { className: 'pwt-title' }, t('draftCapsTitle')),
              h('span', { className: 'pwt-hint', style: { marginLeft: 8 } }, t('draftCapsHint'))
            ),
            (newCaps === null
              ? h('div', { className: 'pwt-hint' }, t('loading'))
              : (newCaps.length === 0
                ? h('div', { className: 'pwt-hint' }, t('draftCapsEmpty'))
                : h('div', { className: 'pwt-caps' },
                    newCaps.map(function (c, i) {
                      return h('label', { key: c.id, className: 'pwt-row pwt-cap', title: c.desc, style: { cursor: (busy || c.locked) ? 'default' : 'pointer' } },
                        h('input', {
                          type: 'checkbox',
                          checked: !!c.enabled,
                          disabled: busy || !!c.locked,
                          onChange: function () { toggleNewCap(i) },
                        }),
                        h('span', { className: 'pwt-capName' }, c.title),
                        c.native ? h('span', { className: 'pwt-hint' }, c.locked ? t('capNativeLocked') : t('capNative')) : null,
                        h('span', { className: 'pwt-hint' }, c.desc)
                      )
                    })
                  )))
          ))
          // 选了模板就给出段落编辑器：模板没有段落（如 bare）时也能自己加。
          if (draft) {
            children.push(h('div', { key: 'draftBar', className: 'pwt-row' },
              h('button', { className: 'pwt-btn', onClick: function () { setDraft(null) } }, t('resetDraft'))
            ))
            if (!draft.sections.length) {
              children.push(h('div', { key: 'draftEmpty', className: 'pwt-hint' }, t('draftEmpty')))
            }
            draft.sections.map(function (sec, i) {
              return h('div', { key: 'd' + i, className: 'pwt-card' },
                h('div', { className: 'pwt-row' },
                  h('label', { className: 'pwt-field', title: t('enabledTip') },
                    h('input', { type: 'checkbox', checked: sec.enabled !== false, onChange: function (e) { patchDraft(i, { enabled: e.target.checked }) } }),
                    h('span', { className: 'pwt-title' }, t('enabled'))
                  ),
                  h('input', {
                    className: 'pwt-input pwt-grow', value: sec.title || '', placeholder: t('secTitlePh'),
                    onChange: function (e) { patchDraft(i, { title: e.target.value }) },
                  }),
                  h('button', { className: 'pwt-btn', onClick: function () { removeDraft(i) } }, t('delSec'))
                ),
                h('textarea', {
                  className: 'pwt-ta', rows: Math.min(20, Math.max(6, (sec.text || '').split('\n').length + 1)),
                  value: sec.text || '', placeholder: t('secTextPh'),
                  onChange: function (e) { patchDraft(i, { text: e.target.value }) },
                })
              )
            }).forEach(function (el) { children.push(el) })
            children.push(h('div', { key: 'draftAct', className: 'pwt-row' },
              h('button', { className: 'pwt-btn', onClick: addDraftSection, disabled: busy }, t('addSection')),
              h('span', { className: 'pwt-hint' }, t('draftHint'))
            ))
          }
        }


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
              h('span', { className: 'pwt-file' }, s.file)
            ),
            h('textarea', {
              className: 'pwt-ta', rows: Math.min(20, Math.max(6, (s.text || '').split('\n').length + 1)),
              value: s.text || '', placeholder: t('secTextPh'),
              onChange: function (e) { patchSection(i, { text: e.target.value }) },
            })
          )
        })

        if (tab === 'view') children.push(h('div', { key: 'sections', className: 'pwt-sections' },
          // ── 子页签：一个页面装三类内容，各自独立，不再挤在同一条滚动里 ──
          h('div', { key: 'vtabs', className: 'pwt-subtabs', role: 'tablist' },
            h('button', { type: 'button', role: 'tab', className: 'pwt-subtab' + (viewTab === 'sections' ? ' pwt-subtab--on' : ''), 'aria-selected': viewTab === 'sections', onClick: function () { setViewTab('sections') } }, t('vtSections')),
            h('button', { type: 'button', role: 'tab', className: 'pwt-subtab' + (viewTab === 'caps' ? ' pwt-subtab--on' : ''), 'aria-selected': viewTab === 'caps', onClick: function () { setViewTab('caps') } }, t('vtCaps')),
            h('button', { type: 'button', role: 'tab', className: 'pwt-subtab' + (viewTab === 'binds' ? ' pwt-subtab--on' : ''), 'aria-selected': viewTab === 'binds', onClick: function () { setViewTab('binds') } }, t('vtBinds'))
          ),
          // ── 能力开关（与段落卡片同属一个滚动区：展开后能一路滚到底）──
          // 系统/官方预设只读：能力开关仅供查看，勾选禁用。
          viewTab !== 'caps' ? null : h('div', { key: 'caps', className: 'pwt-card' },
            h('div', { className: 'pwt-title' }, t('capsTitle')),
            h('div', null,
              h('p', { style: { margin: '4px 0' } }, t('capsDesc')),
              isRo ? h('div', { className: 'pwt-status' }, t('capsRo')) : null,
              (caps === null
                ? h('div', { className: 'pwt-hint' }, t('capsHint'))
                : h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
                  caps.map(function (c) {
                    // 三类：地基（锁死）/ 可关的地基行（如 command-compact）/ 能力开关
                    var isRowToggle = c.kind === 'rowToggle'
                    var lock = c.locked && !isRowToggle
                    var badge = (c.enabled && c.dormant) ? t('badgeWired') : ''
                    return h('label', { key: c.id, className: 'pwt-row', title: c.desc || '', style: { cursor: (isRo || lock) ? 'default' : 'pointer' } },
                      h('input', {
                        type: 'checkbox',
                        checked: lock ? true : !!c.enabled,
                        disabled: busy || !current || isRo || lock,
                        onChange: function () {
                          if (lock) return
                          if (isRowToggle) { toggleRow(c); return }
                          toggleCap(c)
                        },
                      }),
                      h('span', { className: 'pwt-title' }, lock ? h(LockIcon) : null, c.title),
                      badge ? h('span', { className: 'pwt-hint' }, badge) : null,
                      h('span', { className: 'pwt-hint' }, (lock ? t('compCore') + ' · ' : '') + (c.desc || ''))
                    )
                  })
                ))
            )
          ),
          // ── 每工作区默认预设：给每个工作区目录绑一个预设，新会话自动用 ──
          viewTab !== 'binds' ? null : h('div', { key: 'bindings', className: 'pwt-card' },
            h('div', { className: 'pwt-title' }, t('bindTitle')),
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
            )
          ),
          // 段落区：段落各占一个标签，标签文字用段落标题；下面是该段落的编辑卡片。
          viewTab !== 'sections'
            ? null
            : (data === null
              ? h('div', { className: 'pwt-hint' }, current ? t('loading') : t('pickFirst'))
              : (data.sections.length === 0
                ? h('div', { className: 'pwt-hint' }, t('noSections'))
                : (function () {
                  var active = Math.min(Math.max(0, secTab), data.sections.length - 1)
                  var tabs = h('div', { className: 'pwt-subtabs', key: 'sectabs' },
                    data.sections.map(function (s, i) {
                      var label = (s.title && String(s.title).trim()) || String(s.file || '').replace(/^section\.\d+-/, '').replace(/\.md$/, '') || String(i + 1)
                      return h('button', {
                        key: 'st' + i,
                        type: 'button',
                        className: 'pwt-subtab' + (i === active ? ' pwt-subtab--on' : ''),
                        role: 'tab',
                        'aria-selected': i === active,
                        onClick: function () { setSecTab(i) },
                      }, label)
                    }),
                    // 靠右：+ 新增一段，- 删除当前选中的这一段（不再每张卡片各挂一个删除键）
                    h('span', { className: 'pwt-tabs-spacer', key: 'sp' }),
                    h('button', {
                      key: 'addSec',
                      type: 'button',
                      className: 'pwt-subtab pwt-subtab--icon',
                      title: t('addSection'),
                      disabled: busy || !data || isRo,
                      onClick: addSection,
                    }, h(IconPlus)),
                    h('button', {
                      key: 'delSecCur',
                      type: 'button',
                      className: 'pwt-subtab pwt-subtab--icon',
                      title: t('delSec'),
                      disabled: busy || !data || isRo || data.sections.length === 0,
                      onClick: function () {
                        if (!data || data.sections.length === 0) return
                        removeSection(active)
                        setSecTab(Math.max(0, Math.min(active, data.sections.length - 2)))
                      },
                    }, h(IconMinus))
                  )
                  return h("div", { key: "secTab" }, tabs, cards[active])
                })()))
        ))

        return h('div', { className: 'pwt-root' }, children)
      }

      /** 把样式表插进 document.head（一次性）。对话区的入口不经过设置页，拿不到页内 <style>。 */
      function injectGlobalCss() {
        try {
          var tagId = 'dsh-preset-workbench'
          if (typeof document === 'undefined') return
          if (document.querySelector('style[data-plugin-css="' + tagId + '"]') !== null) return
          var tag = document.createElement('style')
          tag.dataset.plugin = 'dsh-preset-workbench'
          tag.dataset.pluginCss = tagId
          tag.textContent = cssText
          document.head.appendChild(tag)
        } catch (e) {}
      }

      function apply(ctx) {
        var slots = ctx.get('slots')
        if (slots === undefined) return
        injectGlobalCss()

        // ── 会话内预设切换器（输入框上方那一排，外观照抄官方 seat）──────────
        //
        // 官方的 conversation.hero.agentPreset 是 single slot、只服务新会话；这里
        // 补一个同款外观的切换器，作用是给已经开聊的会话换预设：换绑排队，等下一次
        // 压缩对话后生效（压缩是换挡点，旧上下文被摘要收拢，人设不会和历史打架）。
        //
        // 视觉直接复用 @deepseek-ai/dsh-client-ui-primitives 的 Menu 和官方图标，
        // 样式表照抄官方 AgentPresetSeat.module.css，保证和宿主自己那个胶囊一致。
        var primitives = null
        try { primitives = require('@deepseek-ai/dsh-client-ui-primitives') } catch (e) { primitives = null }

        /** 没有 useSessions 时的替身，保证 hook 调用顺序稳定。 */
        function noSessionsHook() { return undefined }


        function PresetSwitcher(props) {
          var onlyStarted = !!(props && props.onlyStarted)
          var chipMode = useChipMode()
          var sessionId = (props && props.sessionId) || (props && props.session && props.session.id)
          // 当前预设可以直接从会话投影读（和宿主头部那个只读标签同一个来源），
          // 这样即使宿主的切换 op 还没就位，胶囊也能显示正确的名字。
          var useSess = (props && props.useSessions) || noSessionsHook
          var projected = useSess(function (state) {
            var row = state && state.byId ? state.byId[sessionId] : undefined
            var value = row && row.projectionValues ? row.projectionValues.agentPreset : undefined
            return typeof value === 'string' ? value : undefined
          })
          var st = react.useState(null); var info = st[0]; var setInfo = st[1]
          var op2 = react.useState(false); var open = op2[0]; var setOpen = op2[1]
          var ro = react.useState(null); var rows = ro[0]; var setRows = ro[1]
          var bs = react.useState(false); var busy = bs[0]; var setBusy = bs[1]
          var er = react.useState(''); var err = er[0]; var setErr = er[1]

          /** 拉清单：优先轻量 roster；老宿主机没有它就退到 templates（也不做逐文件比对）。 */
          var loadRoster = function () {
            return rpc('roster').then(function (r) {
              if (r && r.ok) return (r.rows || []).filter(function (p) { return !p.broken })
              throw new Error((r && r.error) || 'roster failed')
            }).catch(function () {
              return rpc('templates').then(function (r2) {
                if (!r2 || !r2.ok) return []
                return (r2.templates || []).map(function (x) {
                  return { id: x.id, name: x.name || x.id, description: x.description || '' }
                })
              }).catch(function () { return [] })
            }).then(function (list) { setRows(list); return list })
          }

          var reload = function () {
            if (!sessionId) return
            rpc('sessionPreset', { sessionId: sessionId }).then(function (r) {
              if (r && r.ok) setInfo(r)
            }).catch(function () {})
          }
          react.useEffect(function () { reload(); loadRoster() }, [sessionId])

          if (!sessionId) return null

          if (chipMode === 'never') return null

          // dock 那一处只在「hero 那排已经消失」时出现，避免空白会话里出现两个胶囊。
          // 判据两条：
          //   • 宿主报的 started === false（重启后可用）；
          //   • DOM 里还有 heroWorkspaceRow（宿主类名是 <hash>_heroWorkspaceRow，兼容未重启）。
          if (onlyStarted) {
            if (info && info.started === false) return null
            try {
              if (typeof document !== 'undefined' && document.querySelector('[class*="heroWorkspaceRow"]') !== null) return null
            } catch (e) {}
          }

          var current = (info && info.current) || projected || null
          var pending = info && info.pending
          var shown = pending || current
          var curName = presetLabel(current, '')
          var pendName = presetLabel(pending, '')
          var isPending = !!(pending && current && pending !== current)
          var label = shown === null || shown === undefined
            ? '…'
            : (isPending ? curName + ' › ' + pendName : curName)

          var pick = function (id) {
            setBusy(true)
            rpc('switchPreset', { sessionId: sessionId, presetId: id }).then(function (r) {
              if (!r || !r.ok) throw new Error((r && r.error) || 'switch failed')
              setErr('')
              setOpen(false)
              reload()
            }).catch(function (e) { setErr(t('swFail') + e.message) }).finally(function () { setBusy(false) })
          }

          var seatButton = h('button', {
            type: 'button',
            className: 'pwtSeat',
            'aria-haspopup': 'menu',
            'aria-expanded': open,
            title: err !== '' ? err : (isPending ? t('swPendingTip', pending) : t('swTip')),
            disabled: busy,
            onClick: function () {
              var next = !open
              setOpen(next)
              if (next) {
                // 只在第一次打开时拉清单：重复点开是即时的。用 roster 而不是 list，
                // 后者会对每个预设做逐文件比对，正是下拉框卡住几秒的原因。
                if (rows === null) loadRoster()
                reload()
              }
            },
          },
            primitives && primitives.IconAgentPresetOutlineRegular
              ? h(primitives.IconAgentPresetOutlineRegular, { className: 'pwtSeatIcon' })
              : null,
            h('span', { className: 'pwtSeatLabel' }, label),
            primitives && primitives.IconChevronDownOutlineRegular
              ? h(primitives.IconChevronDownOutlineRegular, { className: 'pwtChevron' })
              : h('span', { className: 'pwtChevron' }, '▾')
          )

          var items = (rows || []).map(function (p) {
            // 当前生效的项由官方 Menu 自己画勾（selectedId）；
            // 「已选、等下次压缩后才生效」的项用行尾小徽章标，两者不混。
            var badge = (pending && p.id === pending && p.id !== current)
              ? h('span', { className: 'pwtOptPend' }, t('swPendingBadge'))
              : null
            return {
              id: p.id,
              label: h('span', { className: 'pwtOpt' },
                h('span', { className: 'pwtOptName' }, presetLabel(p.id, p.name)),
                badge
              ),
            }
          })

          // 一律走官方 Menu：清单没到时放一个占位项，而不是退回自绘空盒子
          // （空菜单看起来就是"点了打不开"）。
          var node
          if (primitives && primitives.Menu) {
            var menuItems = items.length
              ? items
              : [{ id: '__loading', label: t('swLoading') }]
            node = h(primitives.Menu, {
              open: open,
              onClose: function () { setOpen(false) },
              items: menuItems,
              selectedId: current || '',
              onSelect: function (id) { if (id !== '__loading') pick(id) },
              align: 'start',
              portal: true,
              className: 'pwtMenuAnchor',
              anchor: seatButton,
            })
          } else {
            node = h('div', { className: 'pwt-dd' },
              seatButton,
              open ? h('div', { className: 'pwt-dd-menu pwtSeatMenu' },
                items.map(function (it) {
                  return h('button', {
                    key: it.id,
                    type: 'button',
                    className: 'pwt-dd-opt' + (it.id === current ? ' pwt-dd-sel' : ''),
                    onClick: function () { pick(it.id) },
                  }, it.label)
                })
              ) : null
            )
          }

          // hover 模式：平时完全透明但保留占位（不会让布局跳动），
          // 鼠标移到这一小块上才显形——既然要"悬浮才出现"，就得留可悬停的面积。
          // hover       → 整行悬浮显形（pwtHoverWrap--row）
          // hover-self  → 只有指针落进胶囊自己那小块才显形
          if (chipMode === 'hover' || chipMode === 'hover-self') {
            return h('div', {
              className: 'pwtHoverWrap' + (chipMode === 'hover' ? ' pwtHoverWrap--row' : ''),
            }, node)
          }
          return node
        }

        // 空白会话不接管官方预设胶囊（conversation.hero.agentPreset 保持官方实现），
        // 预设位的切换统一交给 session-relocate 那一行 / 下面的 dock 兜底。

        // 第二处：conversation.input.dock。
        //
        // 官方的预设胶囊在 hero 那一排，而 hero 只在空白会话渲染——一开始对话就整排
        // 消失。input.dock 是 composer 里唯一「始终渲染」的槽（宿主代码里只有
        // zone !== undefined 一个条件），放这里才能真正固化：空白会话和已开聊会话
        // 都在输入框正上方同一条位置，不再跳动。
        //
        // 几何照抄宿主 hero 行（.wSkVaW_heroWorkspaceRow）：同样宽度公式与左右留白，
        // 视觉上与 DSH / 预设胶囊那一排对齐，而不是贴到左边缘。
        // 装了 dsh-session-relocate 时，它会在 input.dock 里开一个自己的行容器
        // （子槽 session-relocate.dock）。把预设胶囊注册进那个子槽，就落在工作区 chip
        // 的右边 —— 和官方 hero 那一排 [工作区] [预设] 完全一致；此时下面官方 dock
        // 那条要退让，否则会多占一行。
        var joinedRelocateRow = false
        try {
          slots.inject('session-relocate.dock', function () {
            joinedRelocateRow = true
            slots.register({
              name: 'session-relocate.dock',
              id: 'preset-switch-inline',
              order: -10,
              inject: function (sessionId) { return { sessionId: sessionId } }
            }, function (props) {
              var sid = (props && props.sessionId) || (props && props.session && props.session.id)
              return h(PresetSwitcher, { sessionId: sid, onlyStarted: true })
            })
          })
        } catch (e) {
          // 没有这个子槽（没装 relocate / 老宿主）就继续走下面的官方 dock。
        }

        slots.inject('conversation.input.dock', function () {
          slots.register({
            name: 'conversation.input.dock',
            id: 'preset-switch',
            order: -20,
            inject: function (sessionId) { return { sessionId: sessionId } }
          }, function (props) {
            // 已经并进 relocate 的行容器了：这条让位，不然会多一行。
            if (joinedRelocateRow) return null
            // input.dock 的 ownerProps 带 session，作为 inject 缺席时的兜底。
            var sid = (props && props.sessionId) || (props && props.session && props.session.id)
            return h('div', { className: 'pwtDock' },
              h(PresetSwitcher, { sessionId: sid, onlyStarted: true })
            )
          })
        })

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
