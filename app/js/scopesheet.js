/* 统计范围选择器：主要显示范围与周热力图范围共用这一套勾选逻辑。
   勾分组 = 整组（子类型自动算进来，子项显示成「随分组」不可单独取消）；
   不勾分组时，子类型可以一个个挑 —— 只想看「英语」不想要「编程」也能做到。
   两组范围存在 settings.mainIds / settings.focusIds 里，结构完全一样。 */

import {
  typeById, isGroup, topTypes, childTypes, scopeIds, saveSettings,
} from './store.js';
import { esc, openSheet, toast } from './ui.js';

/** 分组下所有层级的子类型 id（含孙子） */
function descendantsOf(id) {
  return childTypes(id).flatMap((k) => [k.id, ...descendantsOf(k.id)]);
}

/**
 * @param {object} opts
 * @param {string} opts.key       设置里的字段名（mainIds / focusIds）
 * @param {string} opts.title     抽屉标题
 * @param {string} opts.sub       抽屉副标题
 * @param {string} opts.note      列表下面那句说明
 * @param {(ids: string[]) => string} opts.toastOf 保存后的提示文案
 * @param {(ids: string[]) => void} [opts.onDone] 保存后额外要做的事（比如刷新上一层抽屉的值）
 */
export function openScopeSheet({ key, title, sub, note, toastOf, onDone }) {
  const picked = new Set(scopeIds(key));

  const row = (t, kid, derived) => {
    const on = derived || picked.has(t.id);
    return `<button class="f-row${kid ? ' kid' : ''}${on ? ' on' : ''}${derived ? ' derived' : ''}" data-fid="${t.id}">
      <span class="fc"></span>
      <span class="dot" style="--c:${t.color};background:${t.color}"></span>
      <span class="tt">${esc(t.name)}${!kid && isGroup(t) ? `<small>整个分组 · ${childTypes(t.id).length} 个子类型</small>` : (kid ? '<small>只算它自己</small>' : '')}</span>
    </button>`;
  };

  const list = () => topTypes().map((t) => {
    if (!isGroup(t)) return row(t, false, false);
    const derived = picked.has(t.id);
    return row(t, false, false) + childTypes(t.id).map((k) => row(k, true, derived)).join('');
  }).join('');

  const body = `<div class="f-list" data-flist>${list()}</div>
    <div class="muted" style="margin-top:14px;font-size:12px;line-height:1.6">${esc(note)}</div>`;

  openSheet({
    title,
    sub,
    body,
    foot: '<button class="btn" data-do="clear">全部类型</button><button class="btn primary" data-do="save">保存</button>',
    onMount(sheet, { close }) {
      const box = sheet.querySelector('[data-flist]');
      const repaint = () => { box.innerHTML = list(); };

      sheet.addEventListener('click', async (e) => {
        const r = e.target.closest('.f-row');
        if (r && !r.classList.contains('derived')) {
          const id = r.dataset.fid;
          if (picked.has(id)) picked.delete(id);
          else {
            picked.add(id);
            // 勾了整个分组，再单独勾子类型就重复了，去掉
            if (isGroup(typeById(id))) descendantsOf(id).forEach((k) => picked.delete(k));
          }
          repaint();
          return;
        }
        const b = e.target.closest('[data-do]');
        if (!b) return;
        if (b.dataset.do === 'clear') { picked.clear(); repaint(); return; }
        if (b.dataset.do === 'save') {
          const ids = Array.from(picked);
          await saveSettings({ [key]: ids });
          close();
          window.__app.render();
          toast(toastOf(ids));
          if (onDone) onDone(ids);
        }
      });
    },
  });
}
