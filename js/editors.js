/* 类型 / 目标 编辑抽屉 */

import {
  state, addType, updateType, deleteType, addGoal, updateGoal, deleteGoal, PALETTE, ICONS,
  groupList, isGroup,
} from './store.js';
import { fmtDur, shadeFor } from './format.js';
import { openSheet, toast, esc, $, $$ } from './ui.js';

/* ---------------- 类型 ---------------- */

export function openTypeEditor(type, opts = {}) {
  const isNew = !type;
  let icon = type?.icon || 'book';
  const seededParent = opts.parentId ? state.types.find((t) => t.id === opts.parentId) : null;
  // 新建子类型时默认拿分组的颜色，这样「学习」下面不会一个青一个紫一个绿
  let color = type?.color || seededParent?.color || PALETTE[0];
  let parentId = type?.parentId || opts.parentId || '';
  const hasKids = !!type && state.types.some((t) => t.parentId === type.id);
  let isGroup = !!(type ? (hasKids || type.isGroup) : opts.isGroup);
  let syncKids = true;

  const parents = groupList().filter((t) => t.id !== type?.id);

  const body = `
    <div class="field"><label>名字</label>
      <input class="inp" data-k="name" maxlength="12" placeholder="${isGroup ? '例如：学习' : '例如：背单词'}" value="${esc(type?.name || '')}">
    </div>
    <div class="field">
      <div class="row-sw" data-switch-group>
        <span class="row-sw-t">这是个分组
          <small>分组里可以装子类型，比如「学习」里放编程、英语、高数</small>
        </span>
        <button class="toggle ${isGroup ? 'on' : ''}" data-tg="group" ${hasKids ? 'disabled' : ''}></button>
      </div>
      ${hasKids ? '<div class="hint">该类型下已有子类型，因此保持为分组。</div>' : ''}
    </div>
    <div class="field" data-wrap-parent ${isGroup ? 'hidden' : ''}><label>归到分组（可选）</label>
      <select class="inp" data-k="parent">
        <option value="">不分组</option>
        ${parents.map((p) => `<option value="${p.id}" ${p.id === parentId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
      </select>
    </div>
    <div class="field" data-quick-field hidden><label>沿用分组色深浅</label>
      <div class="swatches quick" data-quick></div>
      <div class="hint">同一分组内可用不同深浅区分，统计图中保持同一色系。</div>
    </div>
    <div class="field"><label>颜色</label>
      <div class="swatches" data-colors>
        ${PALETTE.map((c) => `<button class="sw ${c === color ? 'on' : ''}" data-color="${c}" style="background:${c}"></button>`).join('')}
      </div>
      <div class="hint" data-color-hint hidden></div>
    </div>
    ${hasKids ? `<div class="field">
      <div class="row-sw" data-switch-kids>
        <span class="row-sw-t">子类型一起换色
          <small>把「${esc(type.name)}」里面的子类型都改成这个颜色；想各自区分就关掉</small>
        </span>
        <button class="toggle on" data-tg="kids"></button>
      </div>
    </div>` : ''}
    <div class="field"><label>图标</label>
      <div class="pick-grid" data-icons>
        ${ICONS.map((n) => `<button class="pick ${n === icon ? 'on' : ''}" data-icon="${n}"><svg class="ic"><use href="#i-t-${n}"/></svg></button>`).join('')}
      </div>
    </div>
  `;

  const foot = isNew
    ? `<button class="btn" data-do="cancel">取消</button><button class="btn primary" data-do="save" style="--c:${color}">创建</button>`
    : `<button class="btn danger" data-do="del">删除</button><button class="btn primary" data-do="save" style="--c:${color}">保存</button>`;

  openSheet({
    title: isNew ? (isGroup ? '新建分组' : '新建类型') : '编辑类型',
    sub: '颜色用于发光显示；分组作为容器，也可直接记录',
    body, foot,
    onMount(sheet, { close }) {
      const saveBtn = $('[data-do="save"]', sheet);
      const syncColor = () => { saveBtn.style.setProperty('--c', color); };
      const hintEl = $('[data-color-hint]', sheet);
      const quickField = $('[data-quick-field]', sheet);
      const quickEl = $('[data-quick]', sheet);
      const parentOf = () => {
        const pid = isGroup ? '' : ($('[data-k="parent"]', sheet)?.value || type?.parentId || '');
        return pid ? state.types.find((t) => t.id === pid) : null;
      };
      /* 子类型专用的「分组色深浅」快捷色板：点一下就把颜色调成同色系的另一档 */
      const paintQuick = () => {
        const p = parentOf();
        if (!quickEl || !quickField) return;
        if (!p) { quickField.hidden = true; quickEl.innerHTML = ''; return; }
        const shades = [0, 1, 2, 3, 4].map((k) => shadeFor(p.color, k));
        quickField.hidden = false;
        quickEl.innerHTML = shades.map((c, i) => `<button class="sw qc ${c.toLowerCase() === String(color).toLowerCase() ? 'on' : ''}"
          data-color="${c}" title="${i === 0 ? '跟分组同色' : `同色系第 ${i + 1} 档`}" style="background:${c}"></button>`).join('');
      };
      const paintHint = () => {
        if (!hintEl) return;
        hintEl.hidden = false;
        const p = parentOf();
        const same = p && String(p.color).toLowerCase() === String(color).toLowerCase();
        const shade = p ? [0, 1, 2, 3, 4].find((k) => shadeFor(p.color, k).toLowerCase() === String(color).toLowerCase()) : undefined;
        if (same) hintEl.textContent = `跟分组「${p.name}」同一个颜色`;
        else if (shade) hintEl.textContent = `和「${p.name}」同色系的第 ${shade + 1} 档，统计里能分开`;
        else if (hasKids) hintEl.textContent = '修改颜色时子类型同步变化；关闭后各自保留';
        else hintEl.textContent = '每个分组一种颜色，子类型默认沿用分组颜色';
      };
      paintHint();
      paintQuick();
      sheet.addEventListener('click', (e) => {
        const b = e.target.closest('[data-color]');
        if (!b) return;
        color = b.dataset.color;
        $$('[data-color]', sheet).forEach((x) => x.classList.toggle('on', x.dataset.color.toLowerCase() === color.toLowerCase()));
        syncColor();
        paintHint();
      });
      $('[data-k="parent"]', sheet)?.addEventListener('change', (e) => {
        const p = state.types.find((t) => t.id === e.target.value);
        if (!p) { paintHint(); paintQuick(); return; }
        // 归到哪个分组，就跟着那个分组的颜色
        color = p.color;
        $$('[data-color]', sheet).forEach((x) => x.classList.toggle('on', x.dataset.color.toLowerCase() === color.toLowerCase()));
        syncColor();
        paintHint();
        paintQuick();
      });
      $('[data-tg="kids"]', sheet)?.addEventListener('click', (e) => {
        syncKids = !syncKids;
        e.currentTarget.classList.toggle('on', syncKids);
      });
      $('[data-icons]', sheet).addEventListener('click', (e) => {
        const b = e.target.closest('[data-icon]');
        if (!b) return;
        icon = b.dataset.icon;
        $$('[data-icon]', sheet).forEach((x) => x.classList.toggle('on', x === b));
      });
      $('[data-tg="group"]', sheet).addEventListener('click', (e) => {
        if (e.currentTarget.disabled) return;
        isGroup = !isGroup;
        e.currentTarget.classList.toggle('on', isGroup);
        $('[data-wrap-parent]', sheet).hidden = isGroup;
        paintQuick();
        paintHint();
      });

      sheet.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-do]');
        if (!b) return;
        if (b.dataset.do === 'cancel') return close();

        if (b.dataset.do === 'del') {
          const used = state.records.filter((r) => r.typeId === type.id).length;
          const kids = state.types.filter((t) => t.parentId === type.id).length;
          // 删分组会连子类型一起删，先说清楚再动手
          if (kids && !window.confirm(`「${type.name}」里有 ${kids} 个子类型，会一起删掉。继续？`)) return;
          close();
          await deleteType(type.id);
          const extra = [kids ? `${kids} 个子类型一起删了` : '', used ? `${used} 条记录保留在未分类` : '']
            .filter(Boolean).join('，');
          toast(`已删除「${type.name}」${extra ? `，${extra}` : ''}`, { undoable: true });
          return;
        }

        if (b.dataset.do === 'save') {
          const name = $('[data-k="name"]', sheet).value.trim();
          if (!name) { toast('给它设置名字'); return; }
          const pid = isGroup ? null : ($('[data-k="parent"]', sheet)?.value || null);
          const patch = { name, icon, color, parentId: pid, isGroup };
          if (isNew) {
            await addType(patch);
            close();
            toast(`${isGroup ? '分组' : '类型'}「${name}」已创建`, { undoable: true });
          } else {
            await updateType(type.id, patch, { withKids: syncKids });
            close();
            toast('已保存', { undoable: true });
          }
        }
      });
    },
  });
}

/* ---------------- 目标 ---------------- */

const PERIODS = [['day', '每天'], ['week', '每周'], ['month', '每月'], ['year', '每年']];
const MODES = [['reach', '达成'], ['limit', '不超过']];

export function openGoalEditor(goal) {
  const isNew = !goal;
  let period = goal?.period || 'week';
  let mode = goal?.mode || 'reach';
  let typeIds = new Set(goal?.typeIds || []);

  const body = `
    <div class="field"><label>目标名字</label>
      <input class="inp" data-k="name" maxlength="16" placeholder="例如：每周编程 10 小时" value="${esc(goal?.name || '')}">
    </div>
    <div class="two">
      <div class="field"><label>周期</label>
        <div class="seg-ctrl" data-seg="period">
          ${PERIODS.map(([v, l]) => `<button class="${v === period ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}
        </div>
      </div>
      <div class="field"><label>方式</label>
        <div class="seg-ctrl" data-seg="mode">
          ${MODES.map(([v, l]) => `<button class="${v === mode ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}
        </div>
      </div>
    </div>
    <div class="field"><label>统计哪些类型（不选 = 全部）</label>
      <div class="chips tchips">
        ${state.types.map((t) => `<button class="chip ${typeIds.has(t.id) ? 'on' : ''}" data-tid="${t.id}">
          <i class="cdot" style="background:${t.color}"></i>${esc(t.name)}
        </button>`).join('')}
      </div>
    </div>
    <div class="field"><label>目标时长（小时）</label>
      <input class="inp" type="number" inputmode="decimal" min="0" step="0.5" data-k="hours" value="${goal ? (goal.targetMin / 60) : 10}">
    </div>
    <div class="field"><label>预览</label><div class="dur-preview" data-preview></div></div>
  `;

  const foot = isNew
    ? `<button class="btn" data-do="cancel">取消</button><button class="btn primary" data-do="save">创建</button>`
    : `<button class="btn danger" data-do="del">删除</button><button class="btn primary" data-do="save">保存</button>`;

  openSheet({
    title: isNew ? '新建目标' : '编辑目标',
    sub: '「达成」会在不够时提醒你，「不超过」在超了之后变红',
    body, foot,
    onMount(sheet, { close }) {
      const preview = $('[data-preview]', sheet);
      const hoursEl = $('[data-k="hours"]', sheet);
      const refresh = () => {
        const h = parseFloat(hoursEl.value) || 0;
        const label = period === 'day' ? '每天' : period === 'week' ? '每周' : period === 'month' ? '每月' : '每年';
        preview.textContent = `${label}${mode === 'reach' ? '至少' : '最多'} ${h} 小时`;
      };
      refresh();
      hoursEl.addEventListener('input', refresh);

      sheet.addEventListener('click', (e) => {
        const segBtn = e.target.closest('[data-seg] button');
        if (segBtn) {
          const seg = segBtn.closest('[data-seg]');
          $$('button', seg).forEach((b) => b.classList.toggle('on', b === segBtn));
          if (seg.dataset.seg === 'period') period = segBtn.dataset.v;
          if (seg.dataset.seg === 'mode') mode = segBtn.dataset.v;
          refresh();
          return;
        }
        const chip = e.target.closest('.tchips [data-tid]');
        if (chip) {
          const id = chip.dataset.tid;
          if (typeIds.has(id)) typeIds.delete(id); else typeIds.add(id);
          chip.classList.toggle('on', typeIds.has(id));
          return;
        }
        const b = e.target.closest('[data-do]');
        if (!b) return;
        if (b.dataset.do === 'cancel') return close();
        if (b.dataset.do === 'del') {
          close();
          deleteGoal(goal.id);
          toast('目标已删除', { undoable: true });
          return;
        }
        if (b.dataset.do === 'save') {
          const name = $('[data-k="name"]', sheet).value.trim();
          const hours = parseFloat(hoursEl.value) || 0;
          if (!name) { toast('给目标设置名字'); return; }
          if (hours <= 0) { toast('目标时长要大于 0'); return; }
          const patch = { name, period, mode, typeIds: Array.from(typeIds), targetMin: Math.round(hours * 60) };
          if (isNew) { addGoal(patch); close(); toast('目标已创建', { undoable: true }); }
          else { updateGoal(goal.id, patch); close(); toast('已保存', { undoable: true }); }
        }
      });
    },
  });
}
