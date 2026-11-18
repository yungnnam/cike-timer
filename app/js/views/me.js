/* 我的：类型、目标、外观、数据 */

import {
  state, typeById, liveTypes, elapsed, saveSettings, exportBundle, importBundle,
  wipeAll, goalProgress, totalMs, seedDemo,
  topTypes, childTypes, groupList, isGroup, followLangNames,
} from '../store.js';
import { fmtDur, fmtISO, hexA } from '../format.js';
import { openTypeEditor, openGoalEditor } from '../editors.js';
import { openSheet, toast, esc } from '../ui.js';
import { openDemo } from '../demo.js';
import { hasNotify, notifyStatus, openNotifySettings, requestNotify } from '../native.js';
import { isEn } from '../i18n.js';

const THEMES = [['dark', '深色'], ['light', '浅色'], ['auto', '跟随系统']];
// 界面语言：中文 / English / 跟随系统（系统是中文就中文，否则英文）
const LANGS = [['zh', '中文'], ['en', 'English'], ['auto', '跟随系统']];
// 撤销条停留多久（毫秒 → 显示文案）
const UNDO_CHOICES = [[3000, '3 秒'], [5000, '5 秒'], [8000, '8 秒'], [10000, '10 秒']];
// 计时满几个小时提醒一次；0 = 不提醒
const LONG_WARN_CHOICES = [[0, '关闭'], [2, '2 小时'], [4, '4 小时'], [8, '8 小时']];
// 头像候选：11 个表情 + 1 个「相册」，正好铺满两行六列
const AVATARS = ['🌱', '☕', '📚', '💻', '🎧', '🏃', '🌙', '🍀', '🔥', '🎯', '🐱'];

/** 名字 → 一个稳定的色相，没设头像时用首字配这个颜色，比默认灰好认 */
function hueOf(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

/** 头像有四种来源，优先级：相片 → 表情 → 名字首字 → 人像图标 */
function avatarHtml() {
  const av = state.settings.profileAvatar || '';
  const name = (state.settings.profileName || '').trim();
  if (av.startsWith('data:')) return `<span class="acct-av"><img src="${av}" alt=""></span>`;
  if (av) return `<span class="acct-av emo">${av}</span>`;
  if (name) return `<span class="acct-av txt" style="--c:hsl(${hueOf(name)} 62% 52%)">${esc(name.slice(0, 1))}</span>`;
  return `<span class="acct-av"><svg class="ic"><use href="#i-me"/></svg></span>`;
}

/** 缩成 128×128 的方形照片，存成 JPEG 的 data URL（一张大约 6–9 KB，备份也带得动） */
function toAvatar(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const S = 128;
        const cv = document.createElement('canvas');
        cv.width = S;
        cv.height = S;
        const g = cv.getContext('2d');
        // cover：短边撑满，长边居中裁掉，不拉伸人脸
        const k = Math.max(S / img.width, S / img.height);
        const w = img.width * k;
        const h = img.height * k;
        g.drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
        URL.revokeObjectURL(url);
        resolve(cv.toDataURL('image/jpeg', 0.86));
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(e);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片读取失败')); };
    img.src = url;
  });
}

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
 *   3. 尚未开始一次计时 → 渠道还没建出来，属正常
 */
function notifySection() {
  if (!hasNotify()) return '';
  const st = notifyStatus();
  let vv = '开启';
  let hint = '正在计时的活动会挂在通知栏和锁屏上';
  if (st && st.enabled === false) {
    vv = '被关掉了';
    hint = '前往系统设置允许通知，锁屏即可显示';
  } else if (st && st.channel === false) {
    vv = '尚未开始';
    hint = '开始计时后，通知栏与锁屏将显示';
  } else if (st && st.importance === 0) {
    vv = '被静音了';
    hint = '通知已在系统中关闭，点击前往开启';
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

  <button class="acct" data-act="profile">
    ${avatarHtml()}
    <span class="acct-meta">
      <span class="acct-n ${(state.settings.profileName || '').trim() ? '' : 'empty'}">${esc((state.settings.profileName || '').trim() || '设置名字')}</span>
      <span class="acct-s">本地账号 · 名称与头像随备份一起导出</span>
    </span>
    <svg class="ic chev"><use href="#i-chevron"/></svg>
  </button>

  <div class="sec-t">类型${groupList().length ? ` · ${groupList().length} 个分组` : ''}</div>
  <div class="list glass">
    ${groupList().length ? '' : `<div class="li" style="display:block;color:var(--text-3);font-size:12.5px;line-height:1.65">
      还没有分组。分组用于归类子类型，统计与目标会合并计算。
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
    }).join('') : `<div class="li" style="color:var(--text-3);font-size:13px">还没有目标。新建目标后，统计页会跟踪进度。</div>`}
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
        <small style="display:block;color:var(--text-3);font-size:12px;margin-top:3px">界面文字切换为英文；类型名与备注属于本地数据，不会被翻译</small>
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
      <span class="tt">点按震动<small>按下时给出轻微震动反馈</small></span>
      <span class="vv">${state.settings.haptics === false ? '已关闭' : '开启'}</span>
    </button>` : ''}
    <button class="li" data-act="day-start">
      <span class="tt">一天从几点开始<small>凌晨记录归属的日期分界</small></span>
      <span class="vv">${String(state.settings.dayStart || 0).padStart(2, '0')}:00</span>
    </button>
    <button class="li" data-act="long-warn">
      <span class="tt">长时计时提醒<small>计时超过这个时长，提醒一次「还在继续吗」</small></span>
      <span class="vv">${(LONG_WARN_CHOICES.find(([v]) => v === (Number(state.settings.longWarnH) || 0)) || [0, '关闭'])[1]}</span>
    </button>
    <div class="li" style="display:block">
      <div style="margin-bottom:9px;font-size:14.5px">撤销提示停留
        <small style="display:block;color:var(--text-3);font-size:12px;margin-top:3px">修改或删除后，「撤销」提示的停留时长</small>
      </div>
      <div class="seg-ctrl" data-undo-pick>
        ${UNDO_CHOICES.map(([v, l]) => `<button class="${undoNow === v ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}
      </div>
    </div>
  </div>

  ${notifySection()}
  <div class="sec-t">演示</div>
  <div class="list glass">
    <button class="li" data-act="demo" data-demo="backfill">
      <span class="tt">补记<small>选类型、填时长，开始时间自动算好</small></span>
      <span class="vv"><svg class="ic sm"><use href="#i-play"/></svg></span>
    </button>
    <button class="li" data-act="demo" data-demo="tags">
      <span class="tt">标签<small>加标签、按标签筛选、统计里的标签卡</small></span>
      <span class="vv"><svg class="ic sm"><use href="#i-play"/></svg></span>
    </button>
    <button class="li" data-act="demo" data-demo="longwarn">
      <span class="tt">长时计时提醒<small>忘记停表时，通知栏会问一句</small></span>
      <span class="vv"><svg class="ic sm"><use href="#i-play"/></svg></span>
    </button>
  </div>

  <div class="sec-t">数据</div>
  <div class="list glass">
    <button class="li" data-act="export-json">
      <span class="tt">导出备份<small>JSON 格式，可重新导入</small></span>
      <span class="vv"><svg class="ic sm"><use href="#i-download"/></svg></span>
    </button>
    <button class="li" data-act="export-csv">
      <span class="tt">导出 CSV<small>可用表格软件打开</small></span>
      <span class="vv"><svg class="ic sm"><use href="#i-download"/></svg></span>
    </button>
    <button class="li" data-act="import">
      <span class="tt">导入备份</span>
      <span class="vv"><svg class="ic sm"><use href="#i-upload"/></svg></span>
    </button>
    <button class="li" data-act="demo">
      <span class="tt">载入示例数据<small>一周示例记录与两个目标，用于预览界面</small></span>
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
      <span class="tt">此刻 <small>v1.3.2 正式版</small></span>
      <span class="vv">构建 cike-v46</span>
    </div>
    <div class="li" style="display:block;color:var(--text-3);font-size:12.5px;line-height:1.7">
      所有数据只存在这台设备上，不上传、也不用注册。上面的名字和头像只是给自己看的，会跟着备份一起导出。加到主屏幕后跟普通 App 一样用；装成 APK 时数据在应用自己的目录里，卸载会一起删掉，换机前记得先导一份备份。
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
    if (act === 'demo') openDemo(e.target.closest('[data-demo]')?.dataset.demo);
    if (act === 'profile') openProfileSheet();
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
    if (act === 'long-warn') openLongWarnSheet();
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
      toast(done ? '示例数据已载入' : '已有记录，示例数据不会覆盖现有数据');
    }
    if (act === 'wipe') {
      if (!window.confirm('清空所有记录和目标？类型会保留，清空后 5 秒内可以撤销。')) return;
      await wipeAll();
      toast('记录和目标已清空', { undoable: true });
    }
  });
}

/**
 * 本地账号：名字 + 头像，都存在 settings 里，跟着备份走。
 * 抽屉里的改动先攒着，点「保存」才落地 —— 中途关掉就当没改过。
 */
function openProfileSheet() {
  const startName = state.settings.profileName || '';
  const startAv = state.settings.profileAvatar || '';
  let picked = startAv;

  const grid = () => AVATARS.map((a) => `<button class="av-pick ${picked === a ? 'on' : ''}" data-av="${a}">${a}</button>`).join('')
    + `<button class="av-pick photo ${picked.startsWith('data:') ? 'on' : ''}" data-do="photo" aria-label="从相册选一张">
        ${picked.startsWith('data:') ? `<img src="${picked}" alt="">` : '<svg class="ic"><use href="#i-upload"/></svg>'}
      </button>`;

  openSheet({
    title: '本地账号',
    sub: '仅保存在本机；更换设备前导出备份即可迁移',
    // 拼成一串短字符串而不是一整段模板：文案体检（i18ncover）是按引号切片的，
    // 超过 120 字的长模板会被它切碎，拆短了才看得清哪些字要翻译。
    body: '<div class="field"><label>名字</label>'
      + `<input class="inp" data-k="name" maxlength="24" value="${esc(startName)}" placeholder="输入名称" autocomplete="off"></div>`
      + '<div class="field" style="margin-top:16px"><label>头像</label>'
      + `<div class="av-grid" data-av-grid>${grid()}</div>`
      + '<div class="hint">可从内置图标或相册选择头像；图片会压缩为 128×128 保存在本机。</div></div>'
      + '<input type="file" accept="image/*" data-k="file" hidden>',
    foot: `<button class="btn" data-do="clear">清除头像</button><button class="btn primary" data-do="save">保存</button>`,
    onMount(sheet, { close }) {
      const nameEl = sheet.querySelector('[data-k="name"]');
      const fileEl = sheet.querySelector('[data-k="file"]');
      const gridEl = sheet.querySelector('[data-av-grid]');
      const repaint = () => { gridEl.innerHTML = grid(); };

      fileEl.addEventListener('change', async () => {
        const file = fileEl.files?.[0];
        if (!file) return;
        try {
          picked = await toAvatar(file);
          repaint();
        } catch (err) {
          toast(err?.message || '图片读取失败');
        } finally {
          fileEl.value = '';
        }
      });

      sheet.addEventListener('click', async (e) => {
        const av = e.target.closest('[data-av]');
        if (av) { picked = av.dataset.av; repaint(); return; }
        const b = e.target.closest('[data-do]');
        if (!b) return;
        const what = b.dataset.do;
        if (what === 'photo') { fileEl.click(); return; }
        if (what === 'clear') { picked = ''; repaint(); return; }
        if (what === 'save') {
          await saveSettings({
            profileName: String(nameEl.value || '').trim().slice(0, 24),
            profileAvatar: picked,
          });
          close();
          window.__app.render();
          toast('账号信息已保存');
        }
      });
    },
  });
}

function openDayStartSheet() {
  const cur = state.settings.dayStart || 0;
  openSheet({
    title: '一天从几点开始',
    sub: '若常在凌晨活动，可将一天的起点设为 4 点，凌晨 1 点的记录仍计入前一天。',
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

/** 长时计时提醒：满 N 小时在通知栏问一句「还在继续吗」 */
function openLongWarnSheet() {
  const cur = Number(state.settings.longWarnH) || 0;
  openSheet({
    title: '长时计时提醒',
    sub: '忘记结束计时很常见。满这个时长后，通知栏会问一句「还在继续吗」，并轻震一下。',
    body: `<div class="seg-ctrl" data-lw>${LONG_WARN_CHOICES.map(([v, l]) => `<button class="${v === cur ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}</div>`,
    onMount(sheet, { close }) {
      sheet.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-lw] button');
        if (!b) return;
        const v = Number(b.dataset.v);
        await saveSettings({ longWarnH: v });
        close();
        window.__app.render();
        toast(v ? `计时满 ${v} 小时会提醒一次` : '长时计时提醒已关闭');
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
      toast('导入失败：' + (err?.message || '文件读取失败'));
    } finally {
      cleanup();
    }
  });
  document.body.appendChild(input);
  input.click();
}
