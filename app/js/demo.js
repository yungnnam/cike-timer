/*
 * 功能演示。
 *
 * 完全离线的小应用，装不了真视频 —— 每段视频少说一两兆，几段就把安装包撑胖了，
 * 而且低端机解码还会卡。这里的做法是：把真实界面按缩小比例摆出来，用几步
 * 「高亮 + 轻点回弹」的动画把操作走一遍，用户看完就知道该点哪儿。
 *
 * 每个演示是三到四个分镜，自动轮播；可以点圆点跳、点「重播」重看。
 *
 * 注意：这里的字符串一律用单引号 + `+` 拼，不写嵌套模板 —— tools/i18ncover.mjs
 * 是按反引号切词提取文案的，模板里再套模板会把整段切碎，报出一堆假缺失。
 */
import { openSheet, esc } from './ui.js';

const STEP_MS = 2000;

/* ---------- 分镜里用到的缩小版零件 ---------- */

function chipRow(items, on) {
  const chips = items
    .map((n) => '<button class="chip' + (n === on ? ' on' : '') + '">' + esc(n) + '</button>')
    .join('');
  return '<div class="tchips demo-chips">' + chips + '</div>';
}

function notifMock(title, text) {
  return (
    '<div class="demo-notif">' +
    '<div class="dn-h"><i class="dn-ic">⏱</i><b>' + esc(title) + '</b><span>此刻</span></div>' +
    '<div class="dn-t">' + esc(text) + '</div>' +
    '</div>'
  );
}

/* ---------- 三个演示 ---------- */

const DEMOS = {
  backfill: {
    title: '补记演示',
    sub: '忘开计时的时候，用补记把这一段补上',
    steps: [
      {
        cap: '选一个类型，再填上时长 —— 先选后填，顺序无所谓',
        body:
          chipRow(['学习', '英语', '生活', '工作'], '学习') +
          '<div class="demo-lbl">时长</div>' +
          chipRow(['15分', '30分', '45分'], '30分'),
      },
      {
        cap: '开始时间会自动算好，不用手动对齐到几点几分',
        body:
          chipRow(['15分', '30分', '45分'], '30分') +
          '<div class="demo-range"><span>13:53 – 14:23</span><b>30分</b></div>' +
          '<div class="demo-tap"><button class="btn primary tap">记下</button></div>',
      },
      {
        cap: '点「记下」，这段就补进了今天的记录',
        body:
          '<div class="demo-toast">已记下 30分</div>' +
          '<div class="demo-rec"><b>学习</b><span>13:53 – 14:23</span><i>30分</i></div>',
      },
    ],
  },

  tags: {
    title: '标签演示',
    sub: '标签是跨类型的横向归类：同一件事换着类型记，也能一起看',
    steps: [
      {
        cap: '记录时输入标签，回车即添加；以前用过的会提示',
        body:
          '<div class="demo-tagline">' +
          '<span class="tag-chip">深度<button class="tag-x">×</button></span>' +
          '<span class="tag-chip">复习<button class="tag-x">×</button></span>' +
          '<span class="demo-caret">|</span>' +
          '</div>' +
          '<div class="demo-sug"><span>读书</span><span>专注</span></div>',
      },
      {
        cap: '记录页顶部点「标签」，只看带这个标签的记录',
        body:
          chipRow(['今天', '本周', '标签 · 深度'], '标签 · 深度') +
          '<div class="demo-rec"><b>学习</b><span>13:53 – 14:23</span><i>30分</i></div>' +
          '<div class="demo-rec"><b>阅读</b><span>20:10 – 21:00</span><i>50分</i></div>',
      },
      {
        cap: '统计页把每个标签的时长单列成一张卡片',
        body:
          '<div class="demo-tagcard">' +
          '<div><span>深度</span><i style="--w:72%"></i><b>3时15分</b></div>' +
          '<div><span>复习</span><i style="--w:48%"></i><b>2时10分</b></div>' +
          '<div><span>读书</span><i style="--w:26%"></i><b>1时19分</b></div>' +
          '</div>',
      },
    ],
  },

  longwarn: {
    title: '长时提醒演示',
    sub: '忘记点结束的时候，让通知栏替你想一句',
    steps: [
      {
        cap: '一直在计时，自己忘了停',
        body: '<div class="demo-timer"><span>学习中</span><b>04:00:00</b></div>',
      },
      {
        cap: '到点后通知栏换成这句话，手机轻震一次',
        body: notifMock('学习 · 4:00:00', '「学习」已计时 4 小时，还在继续吗？'),
      },
      {
        cap: '档位在「我的 → 长时计时提醒」，可以关掉',
        body:
          '<div class="demo-lbl">计时满多久提醒一次</div>' +
          chipRow(['关闭', '2 小时', '4 小时', '8 小时'], '4 小时'),
      },
    ],
  },
};

/* ---------- 渲染 ---------- */

function stepHtml(step, i) {
  const cls = i === 0 ? 'demo-step on' : 'demo-step';
  return '<div class="' + cls + '" data-step="' + i + '">' + step.body + '</div>';
}

function dotHtml(on, i) {
  return '<i class="' + (on ? 'on' : '') + '" data-dot="' + i + '"></i>';
}

export function openDemo(kind) {
  const demo = DEMOS[kind];
  if (!demo) return;

  const body =
    '<div class="demo-stage">' +
    demo.steps.map(stepHtml).join('') +
    '</div>' +
    '<div class="demo-cap" data-cap>' + esc(demo.steps[0].cap) + '</div>' +
    '<div class="demo-dots" data-dots>' +
    demo.steps.map((_, i) => dotHtml(i === 0, i)).join('') +
    '</div>';

  let idx = 0;
  let timer = 0;

  openSheet({
    title: demo.title,
    sub: demo.sub,
    body,
    foot:
      '<button class="btn" data-do="replay">重播</button>' +
      '<button class="btn primary" data-do="done">知道了</button>',
    onMount(sheet, { close }) {
      const steps = [...sheet.querySelectorAll('.demo-step')];
      const dots = [...sheet.querySelectorAll('[data-dot]')];
      const cap = sheet.querySelector('[data-cap]');

      const stop = () => {
        if (timer) clearInterval(timer);
        timer = 0;
      };

      const show = (i) => {
        idx = (i + steps.length) % steps.length;
        steps.forEach((el, k) => el.classList.toggle('on', k === idx));
        dots.forEach((el, k) => el.classList.toggle('on', k === idx));
        cap.textContent = demo.steps[idx].cap;
        // 换镜时重放一次高亮动画
        const step = steps[idx];
        step.classList.remove('tapped');
        void step.offsetWidth;
        step.classList.add('tapped');
      };

      const start = () => {
        stop();
        timer = setInterval(() => show(idx + 1), STEP_MS);
      };

      show(0);
      start();

      sheet.addEventListener('click', (e) => {
        const dot = e.target.closest('[data-dot]');
        if (dot) {
          show(Number(dot.dataset.dot));
          start();
          return;
        }
        const b = e.target.closest('[data-do]');
        if (!b) return;
        if (b.dataset.do === 'replay') {
          show(0);
          start();
        } else if (b.dataset.do === 'done') {
          close();
        }
      });

      // 关掉抽屉（下滑、遮罩、Esc）时也要停掉定时器，否则会一直空转
      const root = document.getElementById('sheet-root');
      const mo = new MutationObserver(() => {
        if (!sheet.isConnected) {
          stop();
          mo.disconnect();
        }
      });
      if (root) mo.observe(root, { childList: true });
    },
  });
}
