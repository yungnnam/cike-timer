/* 我的：类型、目标、外观、数据 */

import {
  state, typeById, liveTypes, elapsed, saveSettings, exportBundle, importBundle,
  wipeAll, goalProgress, totalMs, seedDemo,
  topTypes, childTypes, groupList, isGroup, followLangNames,
} from '../store.js';
import { fmtDur, fmtISO, hexA } from '../format.js';
import { openTypeEditor, openGoalEditor } from '../editors.js';
import { openSheet, toast, esc } from '../ui.js';
import { hasNotify, notifyStatus, openNotifySettings, requestNotify } from '../native.js';
import { isEn } from '../i18n.js';

const THEMES = [['dark', '深色'], ['light', '浅色'], ['auto', '跟随系统']];
// 界面语言：中文 / English / 跟随系统（系统是中文就中文，否则英文）
const LANGS = [['zh', '中文'], ['en', 'English'], ['auto', '跟随系统']];
// 撤销条停留多久（毫秒 → 显示文案）
const UNDO_CHOICES = [[3000, '3 秒'], [5000, '5 秒'], [8000, '8 秒'], [10000, '10 秒']];

/** 这台机器到底能不能震：APK 里走原生桥，浏览器看有没有振动 API */
function hasHaptics() {
  try {
    const n = window.CikeNative;
    if (n && typeof n.vibrate === 'function') return true;
    return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
  } catch (e) {
    return false;
  }
}

/**
 * 通知/锁屏这一行只在 APK 里有意义：浏览器版没有通知栏，不显示。
 * 状态分三种说法，因为「看不到通知」有三种完全不同的原因：
 *   1. 通知权限被拒（系统级）→ 去系统设置里打开，或再问一次
 *   2. 通知渠道被关（本条 App 的通知被静音）→ 同上
 *   3. 还没开始过一次计时 → 渠道还没建出来，属正常
 */
function notifySection() {
  if (!hasNotify()) return '';
  const st = notifyStatus();
  let vv = '开启';
  let hint = '正在计时的活动会挂在通知栏和锁屏上';
  if (st && st.enabled === false) {
    vv = '被关掉了';
    hint = '点这里去系统设置里允许通知，锁屏才看得到';
  } else if (st && st.channel === false) {
    vv = '还没开始过';
    hint = '第一次开始计时后，通知和锁屏上就会有了';
  } else if (st && st.importance === 0) {
    vv = '被静音了';
    hint = '这条通知在系统里被关掉了，点这里去打开';
  }
  return `<div class="sec-t">通知</div>
  <div class="list glass">
    <button class="li" data-act="notify-settings">
      <span class="tt">锁屏与通知栏<small>${hint}</small></span>
      <span class="vv">${vv}</span>
    </button>
  </div>

`;
}

function totalAll() {
  return state.records.reduce((a, r) => a + elapsed(r), 0);
}

export function render() {
  const types = liveTypes();
  const total = totalAll();
  const theme = state.settings.theme || 'dark';
  const langNow = state.settings.lang || 'zh';
  const undoNow = Number(state.settings.undoMs) || 5000;

  return `
  <div class="top">
    <div>
      <h1 class="h-title">我的</h1>
      <div class="h-sub">${types.length} 个类型 · ${state.records.length} 条记录 · 累计 ${fmtDur(total)}</div>
    </div>
  </div>

  <div class="sec-t">类型${groupList().length ? ` · ${groupList().length} 个分组` : ''}</div>
  <div class="list glass">
    ${groupList().length ? '' : `<div class="li" style="display:block;color:var(--text-3);font-size:12.5px;line-height:1.65">
      还没有分组。分组是个容器，比如「学习」里放编程、英语、高数，统计和目标会把这些子类型合并起来算。
    </div>`}
    ${topTypes().map((t) => {
      const kids = childTypes(t.id);
      const g = isGroup(t);
      const used = state.records.filter((r) => r.typeId === t.id || kids.some((k) => k.id === r.typeId)).length;
      const head = `<button class="li ${g ? 'li-group' : ''}" data-type="${t.id}">
        <span class="dot" style="--c:${t.color};background:${t.color}"></span>
        <span class="tt">${esc(t.name)}${g ? `<small>${kids.length ? `${kids.length} 个子类型` : '空分组'}</small>` : ''}</span>
        <span class="vv">${used ? `${used} 条` : ''}<svg class="ic chev"><use href="#i-chevron"/></svg></span>
      </button>`;
      if (!g) return head;
      return head + kids.map((c) => `<button class="li li-kid" data-type="${c.id}">
        <span class="dot" style="--c:${c.color};background:${c.color}"></span>
        <span class="tt">${esc(c.name)}</span>
        <span class="vv">${state.records.filter((r) => r.typeId === c.id).length || ''}<svg class="ic chev"><use href="#i-chevron"/></svg></span>
      </button>`).join('') + `<button class="li li-kid li-add" data-add-child="${t.id}">
        <span class="dot dashed"></span>
        <span class="tt">在「${esc(t.name)}」里加子类型</span>
        <span class="vv"><svg class="ic sm"><use href="#i-plus"/></svg></span>
      </button>`;
    }).join('')}
    <button class="li" data-act="new-type">
      <span class="dot dashed"></span>
      <span class="tt" style="color:var(--text-2)">新建类型</span>
      <span class="vv"><svg class="ic sm"><use href="#i-plus"/></svg></span>
    </button>
    <button class="li" data-act="new-group">
      <span class="dot dashed"></span>
      <span class="tt" style="color:var(--text-2)">新建分组</span>
      <span class="vv"><svg class="ic sm"><use href="#i-layers"/></svg></span>
    </button>
  </div>

  <div class="sec-t">目标</div>
  <div class="list glass">
    ${state.goals.length ? state.goals.map((g) => {
      const p = goalProgress(g);
      const label = g.period === 'day' ? '每天' : g.period === 'week' ? '每周' : g.period === 'month' ? '每月' : '每年';
      return `<button class="li" data-goal="${g.id}">
        <span class="dot" style="--c:${typeById(g.typeIds?.[0])?.color || '#6C7BFF'}"></span>
        <span class="tt">${esc(g.name)}<small>${label}${g.mode === 'reach' ? '至少' : '最多'} ${Math.round(g.targetMin / 60 * 10) / 10} 小时 · 现在 ${fmtDur(p.cur)}</small></span>
        <span class="vv">${Math.round(Math.min(1, p.cur / p.target) * 100)}%<svg class="ic chev"><use href="#i-chevron"/></svg></span>
      </button>`;
    }).join('') : `<div class="li" style="color:var(--text-3);font-size:13px">还没有目标。定一个，统计页会帮你盯着。</div>`}
    <button class="li" data-act="new-goal">
      <span class="dot" style="--c:var(--text-3);background:transparent;border:1px dashed var(--text-3);box-shadow:none"></span>
      <span class="tt" style="color:var(--text-2)">新建目标</span>
      <span class="vv"><svg class="ic sm"><use href="#i-plus"/></svg></span>
    </button>
  </div>

  <div class="sec-t">外观</div>
  <div class="list glass">
    <div class="li" style="display:block">
      <div style="margin-bottom:9px;font-size:14.5px">主题</div>
      <div class="seg-ctrl" data-theme-pick>
        ${THEMES.map(([v, l]) => `<button class="${theme === v ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}
      </div>
    </div>
    <div class="li" style="display:block">
      <div style="margin-bottom:9px;font-size:14.5px">语言
        <small style="display:block;color:var(--text-3);font-size:12px;margin-top:3px">界面文字换成英文；类型名和备注是你自己的数据，不会被翻译</small>
      </div>
      <div class="seg-ctrl" data-lang-pick>
        ${LANGS.map(([v, l]) => `<button class="${langNow === v ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}
      </div>
    </div>
    <button class="li" data-act="motion">
      <span class="tt">动效<small>按下、翻页、展开的过渡动画</small></span>
      <span class="vv">${state.settings.motion === 'off' ? '已关闭' : '开启'}</span>
    </button>
    ${hasHaptics() ? `<button class="li" data-act="haptics">
      <span class="tt">点按震动<small>按下去手机会轻轻一震，反馈更实在</small></span>
      <span class="vv">${state.settings.haptics === false ? '已关闭' : '开启'}</span>
    </button>` : ''}
    <button class="li" data-act="day-start">
      <span class="tt">一天从几点开始<small>熬夜记的时间算到哪一天</small></span>
      <span class="vv">${String(state.settings.dayStart || 0).padStart(2, '0')}:00</span>
    </button>
    <div class="li" style="display:block">
      <div style="margin-bottom:9px;font-size:14.5px">撤销提示停留
        <small style="display:block;color:var(--text-3);font-size:12px;margin-top:3px">改完／删完之后，那条「撤销」留多久</small>
      </div>
      <div class="seg-ctrl" data-undo-pick>
        ${UNDO_CHOICES.map(([v, l]) => `<button class="${undoNow === v ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}
      </div>
    </div>
  </div>

  ${notifySection()}
  <div class="sec-t">数据</div>
  <div class="list glass">
    <button class="li" data-act="export-json">
      <span class="tt">导出备份<small>JSON，可再导入回来</small></span>
      <span class="vv"><svg class="ic sm"><use href="#i-download"/></svg></span>
    </button>
    <button class="li" data-act="export-csv">
      <span class="tt">导出 CSV<small>给表格软件看</small></span>
      <span class="vv"><svg class="ic sm"><use href="#i-download"/></svg></span>
    </button>
    <button class="li" data-act="import">
      <span class="tt">导入备份</span>
      <span class="vv"><svg class="ic sm"><use href="#i-upload"/></svg></span>
    </button>
    <button class="li" data-act="demo">
      <span class="tt">载入示例数据<small>一周虚构记录 + 两个目标，用来先看看界面</small></span>
      <span class="vv"><svg class="ic sm"><use href="#i-bolt"/></svg></span>
    </button>
    <button class="li" data-act="wipe">
      <span class="tt" style="color:#ff8a80">清空记录和目标<small>类型会保留，可以撤销一次</small></span>
      <span class="vv"><svg class="ic sm"><use href="#i-trash"/></svg></span>
    </button>
  </div>

  <div class="sec-t">关于</div>
  <div class="list glass">
    <div class="li">
      <span class="tt">此刻 <small>v1.2.3 正式版</small></span>
      <span class="vv">构建 cike-v40</span>
    </div>
    <div class="li" style="display:block;color:var(--text-3);font-size:12.5px;line-height:1.7">
      所有数据只存在这台设备上，不上传、不需要账号。加到主屏幕后跟普通 App 一样用；装成 APK 时数据在应用自己的目录里，卸载会一起删掉，换机前记得先导一份备份。
    </div>
  </div>
  <div class="spacer-16"></div>`;
}

export function mount(root) {
  root.addEventListener('click', async (e) => {
    const addChild = e.target.closest('[data-add-child]');
    if (addChild) { openTypeEditor(null, { parentId: addChild.dataset.addChild }); return; }
    const t = e.target.closest('[data-type]');
    if (t) { openTypeEditor(typeById(t.dataset.type)); return; }
    const g = e.target.closest('[data-goal]');
    if (g) { openGoalEditor(state.goals.find((x) => x.id === g.dataset.goal)); return; }

    const themeBtn = e.target.closest('[data-theme-pick] button');
    if (themeBtn) {
      await saveSettings({ theme: themeBtn.dataset.v });
      window.__app.applyTheme();
      window.__app.render();
      return;
    }

    const langBtn = e.target.closest('[data-lang-pick] button');
    if (langBtn) {
      await saveSettings({ lang: langBtn.dataset.v });
      window.__app.applyTheme();
      const renamed = await followLangNames();
      window.__app.render();
      // 换语言后顶部标题、提示语都要跟着换，别留下上一门语言的句子
      const msg = langBtn.dataset.v === 'zh' ? '界面已切换成中文' : 'Interface switched to English';
      toast(renamed ? `${msg} · ${renamed} 个默认类型名也跟着换了` : msg);
      return;
    }

    const undoBtn = e.target.closest('[data-undo-pick] button');
    if (undoBtn) {
      const ms = Number(undoBtn.dataset.v) || 5000;
      await saveSettings({ undoMs: ms });
      window.__app.render();
      toast(`撤销提示会停留 ${ms / 1000} 秒`);
      return;
    }

    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;

    if (act === 'new-type') openTypeEditor(null);
    if (act === 'new-group') openTypeEditor(null, { isGroup: true });
    if (act === 'new-goal') openGoalEditor(null);
    if (act === 'motion') {
      const next = state.settings.motion === 'off' ? 'on' : 'off';
      await saveSettings({ motion: next });
      window.__app.applyTheme();
      window.__app.render();
    }
    if (act === 'haptics') {
      await saveSettings({ haptics: state.settings.haptics === false });
      window.__app.applyTheme();
      window.__app.render();
      toast(state.settings.haptics === false ? '点按震动已关闭' : '点按震动已开启');
    }
    if (act === 'day-start') openDayStartSheet();
    if (act === 'notify-settings') {
      // 先去系统设置页看一眼；如果通知权限本身还没给，顺手再问一次
      const st = notifyStatus();
      openNotifySettings();
      if (st && st.enabled === false) requestNotify();
    }
    if (act === 'export-json') {
      const name = `${isEn() ? 'cike-backup' : '此刻备份'}-${new Date().toISOString().slice(0, 10)}.json`;
      const how = saveText(JSON.stringify(exportBundle(), null, 2), name);
      if (how !== 'native') toast('备份已导出');
    }
    if (act === 'export-csv') { exportCsv(); }
    if (act === 'import') importFile();
    if (act === 'demo') {
      const done = await seedDemo();
      toast(done ? '示例数据已载入，随便点开看看' : '已经有记录了，示例数据不会覆盖你的数据');
    }
    if (act === 'wipe') {
      if (!window.confirm('清空所有记录和目标？类型会保留，清空后 5 秒内可以撤销。')) return;
      await wipeAll();
      toast('记录和目标已清空', { undoable: true });
    }
  });
}

function openDayStartSheet() {
  const cur = state.settings.dayStart || 0;
  openSheet({
    title: '一天从几点开始',
    sub: '如果你常在凌晨活动，把一天的起点设到 4 点，凌晨 1 点的记录就还算「昨天」。',
    body: `<div class="seg-ctrl" data-ds>${[0, 2, 3, 4, 5, 6].map((h) => `<button class="${h === cur ? 'on' : ''}" data-v="${h}">${h} 点</button>`).join('')}</div>`,
    onMount(sheet, { close }) {
      sheet.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-ds] button');
        if (!b) return;
        await saveSettings({ dayStart: Number(b.dataset.v) });
        close();
        window.__app.render();
        toast('已保存');
      });
    },
  });
}

/**
 * 存一段文本成文件。
 * 装进 APK（离线版）时走原生桥，直接落到「下载/此刻/」，不弹浏览器下载条；
 * 在浏览器里就退回普通的 Blob 下载。
 */
function saveText(text, name) {
  const native = window.CikeNative;
  if (native && typeof native.saveFile === 'function') {
    try {
      const where = native.saveFile(name, text);
      if (where) {
        toast(`已存到 ${where}`);
        return 'native';
      }
    } catch (e) { /* 桥挂了就退回浏览器下载 */ }
  }
  download(new Blob([text], { type: 'text/plain;charset=utf-8' }), name);
  return 'blob';
}

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

function exportCsv() {
  const head = ['开始', '结束', '分钟', '类型', '备注', '标签'];
  const rows = state.records.slice().sort((a, b) => a.start - b.start).map((r) => [
    fmtISO(r.start),
    r.end ? fmtISO(r.end) : '进行中',
    String(Math.round(elapsed(r) / 60000)),
    typeById(r.typeId)?.name || '未分类',
    (r.note || '').replace(/[\r\n]+/g, ' '),
    (r.tags || []).join(' '),
  ]);
  const csv = '\ufeff' + [head, ...rows]
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const how = saveText(csv, `${isEn() ? 'cike' : '此刻'}-${new Date().toISOString().slice(0, 10)}.csv`);
  if (how !== 'native') toast('CSV 已导出');
}

function importFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  // 要挂进文档才点得开：部分 WebView / Safari 对「游离的 input.click()」会直接忽略
  input.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0';
  const cleanup = () => { setTimeout(() => input.remove(), 0); };
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return cleanup();
    try {
      const text = await file.text();
      const obj = JSON.parse(text);
      const n = Array.isArray(obj?.records) ? obj.records.length : 0;
      const cur = state.records.length;
      // 导入是整份替换，不是合并：手上已有数据时必须先问一声
      if (cur > 0 && !window.confirm(`导入会替换掉现在的 ${cur} 条记录（目标也会一起换）。继续？`)) return cleanup();
      await importBundle(obj);
      toast(`导入完成：${n} 条记录`, { undoable: true });
    } catch (err) {
      toast('导入失败：' + (err?.message || '文件读不出来'));
    } finally {
      cleanup();
    }
  });
  document.body.appendChild(input);
  input.click();
}
