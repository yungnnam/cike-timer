/* 双语（中文 / English）
 *
 * 做法：界面文案本来就是写在各个视图里的中文字面量，这里只做「渲染之后把文字换掉」：
 *   1. translateTree() 遍历文本节点与 placeholder/title/aria-label，按词典替换
 *   2. 装在每次 render() 之后，并用 MutationObserver 罩住后插入的内容（抽屉、提示条）
 *   3. 数字类的句子（「今天已记 1 小时」）用规则匹配，所以换了语言数字还是活的
 *
 * 好处是不用把几百个模板串改成 t('key')，视图代码一行没动，也不会漏改。
 * 代价是英文模式下每次重绘要扫一遍文本节点（几百个节点，毫秒级）。
 */

const EN = {
  /* ---------- 外壳 / 导航 ---------- */
  '此刻 · 时间记录': 'Cike · Time Tracker',
  '此刻': 'Now',
  '记录': 'Log',
  '统计': 'Stats',
  '我的': 'Me',
  '主导航': 'Main navigation',
  '出了点问题：': 'Something went wrong: ',
  '脚本报错': 'Script error',
  '数据打不开:': 'Cannot open data:',
  '试试刷新页面，或在浏览器设置里允许本站存储。':
    'Try reloading, or allow this site to store data in your browser settings.',
  '暂停': 'Paused',
  '计时中': 'Running',
  '浏览器下载目录': 'your browser download folder',
  '已作为浏览器下载保存': ' saved to your browser downloads',

  /* ---------- 通用按钮 ---------- */
  '取消': 'Cancel',
  '保存': 'Save',
  '创建': 'Create',
  '删除': 'Delete',
  '记下': 'Save',
  '知道了': 'Got it',
  '撤销': 'Undo',
  '已撤销': 'Undone',
  '没有可撤销的操作': 'Nothing to undo',
  '已保存': 'Saved',
  '已保存，计时继续': 'Saved, timer keeps running',

  /* ---------- 类型编辑 ---------- */
  '名字': 'Name',
  '例如：学习': 'e.g. Study',
  '例如：背单词': 'e.g. Vocabulary',
  '这是个分组': 'This is a group',
  '分组里可以装子类型，比如「学习」里放编程、英语、高数':
    'A group holds child types, e.g. Programming and English inside Study',
  '里面已经有子类型了，所以一直是分组。': 'It has child types, so it stays a group.',
  '归到分组（可选）': 'Belongs to group (optional)',
  '不分组': 'No group',
  '先用分组色的深浅': 'Shades of the group colour',
  '同一分组里想分得开，挑不同深浅最省事；统计图里也会把它们画成同一个色系。':
    'Pick a different shade to tell them apart; charts keep them in one colour family.',
  '颜色': 'Colour',
  '图标': 'Icon',
  '新建分组': 'New group',
  '新建类型': 'New type',
  '编辑类型': 'Edit type',
  '颜色会用来发光；分组只是容器，也能直接记录':
    'The colour is used for the glow; a group is just a container and can be tracked too',
  '跟分组同色': 'Same as group',
  '跟分组「': 'Same colour as group “',
  '同一个颜色': '”',
  '和「': 'Shade ',
  '」同色系的第': ' of the “',
  '档，统计里能分开': '” family — charts keep them apart',
  '改色时下面的子类型会一起换；关掉开关就让它们各自保留':
    'Changing the colour also updates child types; turn this off to keep theirs',
  '一个分组一种颜色，子类型默认跟着分组走':
    'One colour per group; child types follow the group by default',
  '给它起个名字': 'Give it a name',
  '已保存': 'Saved',
  '每天': 'Daily',
  '每周': 'Weekly',
  '每月': 'Monthly',
  '每年': 'Yearly',

  /* ---------- 目标编辑 ---------- */
  '达成': 'Reach',
  '不超过': 'Limit',
  '例如：每周编程 10 小时': 'e.g. 10 hours of coding per week',
  '目标名字': 'Goal name',
  '周期': 'Period',
  '方式': 'Mode',
  '统计哪些类型（不选 = 全部）': 'Which types (none = all)',
  '目标时长（小时）': 'Target (hours)',
  '预览': 'Preview',
  '新建目标': 'New goal',
  '编辑目标': 'Edit goal',
  '「达成」会在不够时提醒你，「不超过」在超了之后变红':
    '“Reach” warns you when you fall behind, “Limit” turns red when you go over',
  '至少': 'at least ',
  '最多': 'at most ',
  '小时': 'h',
  '目标已删除': 'Goal deleted',
  '给目标起个名字': 'Give the goal a name',
  '目标时长要大于 0': 'Target must be greater than 0',
  '目标已创建': 'Goal created',

  /* ---------- 记录编辑 ---------- */
  '类型': 'Type',
  '开始': 'Start',
  '结束': 'End',
  '时长预览': 'Duration',
  '备注': 'Note',
  '标签': 'Tags',
  '这条还在计时。不动「结束」直接保存，它会接着往下走。':
    'This one is still running. Save without touching “End” and it keeps going.',
  '补记一段时间': 'Add a past entry',
  '编辑记录': 'Edit entry',
  '拖动墨带选的范围可以在这里微调': 'The range you dragged can be fine-tuned here',
  '时间不对': 'Invalid time',
  '已删除这条记录': 'Entry deleted',
  '先选一个类型': 'Pick a type first',
  '开始记录': 'Start tracking',
  '搜索类型、备注、标签': 'Search types, notes, tags',

  /* ---------- 此刻 ---------- */
  '补记': 'Add',
  '新分组': 'New group',
  '还没开始 · 点下面任意类型就开始': 'Not tracking · tap any type below to start',
  '今天已记': 'Today',
  '空白': 'Blank',
  '停止': 'Stop',
  '今天还没记': 'Nothing yet today',
  '今天 · 24 小时': 'Today · 24 hours',
  '日记': '',
  '已记 ·': 'logged ·',
  '收起': 'Collapse',
  '展开': 'Expand',
  '已停止并保存': 'Stopped and saved',
  '太短了，没记下（可以在设置里关掉这个门槛）':
    'Too short, not saved (you can turn off this threshold in settings)',
  '已移到': 'Moved to ',
  '还没到那个时间，记不了': 'That time has not arrived yet',
  '只能两层：分组里不能再放分组': 'Two levels only: no groups inside groups',
  '知道了': 'Got it',
  '三件事就够用了': 'Three things is all you need',
  '点一个类型＝开始计时，再点一下就停；': 'Tap a type to start, tap again to stop;',
  '在墨带上按住拖动，可以补记一段；': 'Drag on the ribbon to log a past stretch;',
  '长按胶囊或大格子，能拖着换顺序、换分组。':
    'Long-press a chip or tile to reorder or move it between groups.',

  /* ---------- 记录页 ---------- */
  '今天': 'Today',
  '昨天': 'Yesterday',
  '本周': 'This week',
  '本月': 'This month',
  '今年': 'This year',
  '跨天': 'spans days',
  '未分类': 'Uncategorised',
  '条': 'entries',

  /* ---------- 统计 ---------- */
  '饼图': 'Pie',
  '环形': 'Ring',
  '条形': 'Bars',
  '分组': 'Groups',
  '上一年': 'Previous year',
  '下一年': 'Next year',
  '等': 'and ',
  '类': ' more',
  '0 – 24 时': '0 – 24 h',
  '本周 7 天': '7 days this week',
  '本月每天': 'Every day this month',
  '个类型': 'types',
  '项': 'items',
  '共记录': 'recorded',
  '一天 24 小时': '24 hours a day',
  '一周 168 小时': '168 hours a week',
  '年 1 月 – 12 月': 'Jan – Dec',
  '未记': 'unlogged',
  '已记录': 'recorded',
  '一周节奏': 'Weekly rhythm',
  '还没有': 'Nothing yet',
  '在「我的 → 目标」里给自己定一个，比如每周编程 10 小时。':
    'Set one in Me → Goals, e.g. 10 hours of coding per week.',
  '分钟': 'min',
  '共': 'total',
  '比上期': 'vs previous',
  '最投入': 'busiest',
  '点': '',
  '一天': 'day',
  '本周': 'this week',

  /* ---------- 我的 ---------- */
  '深色': 'Dark',
  '浅色': 'Light',
  '跟随系统': 'System',
  '3 秒': '3 s',
  '5 秒': '5 s',
  '8 秒': '8 s',
  '10 秒': '10 s',
  '开启': 'On',
  '正在计时的活动会挂在通知栏和锁屏上':
    'The running activity shows in the notification shade and on the lock screen',
  '被关掉了': 'Turned off',
  '点这里去系统设置里允许通知，锁屏才看得到':
    'Tap to allow notifications in system settings so the lock screen shows it',
  '还没开始过': 'Never started',
  '第一次开始计时后，通知和锁屏上就会有了':
    'Start a timer once and it will appear in the notification shade and lock screen',
  '被静音了': 'Silenced',
  '这条通知在系统里被关掉了，点这里去打开':
    'This notification is disabled in the system; tap to enable it',
  '通知': 'Notifications',
  '锁屏与通知栏': 'Lock screen & shade',
  '类型会保留，可以撤销一次': 'Types are kept; you can undo once',
  '空分组': 'empty',
  '目标': 'Goals',
  '外观': 'Appearance',
  '主题': 'Theme',
  '语言': 'Language',
  '中文': '中文',
  'English': 'English',
  '界面文字的语言；记录里的类型名、备注不会被翻译':
    'Language of the interface. Type names and notes in your records are not translated.',
  '动效': 'Motion',
  '按下、翻页、展开的过渡动画': 'Press, page and expand transitions',
  '已关闭': 'Off',
  '一天从几点开始': 'Day starts at',
  '熬夜记的时间算到哪一天': 'Which day a late-night entry belongs to',
  '撤销提示停留': 'Undo stays for',
  '改完／删完之后，那条「撤销」留多久': 'How long the “Undo” pill stays after a change',
  '数据': 'Data',
  '导出备份': 'Export backup',
  'JSON，可再导入回来': 'JSON, can be imported back',
  '导出 CSV': 'Export CSV',
  '给表格软件看': 'For spreadsheets',
  '导入备份': 'Import backup',
  '载入示例数据': 'Load sample data',
  '一周虚构记录 + 两个目标，用来先看看界面':
    'A week of made-up entries plus two goals, to preview the UI',
  '清空记录和目标': 'Clear entries and goals',
  '关于': 'About',
  '点按震动': 'Haptics',
  '点按震动已关闭': 'Haptics off',
  '点按震动已开启': 'Haptics on',
  '所有数据只存在这台设备上，不上传、不需要账号。加到主屏幕后跟普通 App 一样用；装成 APK 时数据在应用自己的目录里，卸载会一起删掉，换机前记得先导一份备份。':
    'Everything stays on this device: no upload, no account. Add it to your home screen to use it like a normal app; in the APK the data lives in the app folder and is removed on uninstall, so export a backup before switching phones.',
  '示例数据已载入，随便点开看看': 'Sample data loaded — tap around',
  '已经有记录了，示例数据不会覆盖你的数据': 'You already have entries; sample data was skipped',
  '清空所有记录和目标？类型会保留，清空后 5 秒内可以撤销。':
    'Clear all entries and goals? Types are kept, and you can undo within 5 seconds.',
  '记录和目标已清空': 'Entries and goals cleared',
  '如果你常在凌晨活动，把一天的起点设到 4 点，凌晨 1 点的记录就还算「昨天」。':
    'If you are often up after midnight, set the day start to 4:00 and a 1 a.m. entry still counts as “yesterday”.',
  'CSV 已导出': 'CSV exported',
  '备份已导出': 'Backup exported',
  '文件读不出来': 'Cannot read the file',
  '导入失败：': 'Import failed: ',
  '进行中': 'running',
  '正在计时': 'Tracking',

  /* ---------- 服务端 / 其它 ---------- */
  '离线了，而且这份内容还没缓存。': 'You are offline and this page is not cached yet.',
  '文件格式不对': 'Wrong file format',

  /* ---------- 补漏（覆盖率体检揪出来的） ---------- */
  '新类型': 'New type',
  '新目标': 'New goal',
  '已暂停': 'Paused',
  '继续': 'Resume',
  '暂停': 'Pause',
  '搜类型、备注、标签': 'Search types, notes, tags',
  '深浅 = 投入多少': 'darker = more time',
  '当时在做什么，或者为什么延长了': 'What were you doing, or why did it run long?',
  '用空格分隔，例如：深度 复习': 'Separate with spaces, e.g. deep focus',
  '这条还在计时。不动「结束」直接保存，它会接着往下走。':
    'This one is still running. Save without touching “End” and it keeps going.',
  '里面已经有子类型了，所以一直是分组。': 'It already has child types, so it always stays a group.',
  '跟分组同色': 'Same as group',
  '目标已创建': 'Goal created',
  '没有可撤销的操作': 'Nothing to undo',

  /* —— 统计页的列标题与小标签（都是单独一个文本节点，只能逐条对应）—— */
  '日均': 'Daily avg',
  '条记录': 'Entries',
  '最长一段': 'Longest',
  '未记录': 'Unrecorded',
  '分布': 'Breakdown',
  '排行': 'Ranking',
  '一周节奏': 'Rhythm of the week',
  '周热力图': 'Weekly heatmap',
  '少': 'Less',
  '多': 'More',
  '全部类型': 'All types',
  '没记录': 'no entries',
  /* —— 「我的 → 关注的分组与类型」—— */
  '统计范围': 'Stats scope',
  '关注的分组与类型': 'Focus groups and types',
  '周热力图只算选中的这些；不选就是全部':
    'The weekly heatmap counts only these; none = all',
  '统计页的周热力图只算这些；一个都不选就是全部':
    'The weekly heatmap counts only these; leave all unchecked for everything',
  '整个分组': 'Whole group',
  '只算它自己': 'Only this type',
  '这里是「看什么」，不是「记什么」：没选中的类型照样可以记，只是不画进周热力图。':
    'This decides what the heatmap shows, not what you can log: unchecked types still record, they just stay out of the heatmap.',
  '周热力图统计全部类型': 'Heatmap now counts all types',
  '项': 'items',
  '个类型': 'types',
  '个分组': 'groups',
  '合计': 'total',
  '类型': 'Types',
  '目标': 'Goals',
  '数据': 'Data',
  '关于': 'About',
  '外观': 'Appearance',
  '语言': 'Language',
  '主题': 'Theme',
  '动效': 'Motion',
  '深浅': 'Shade',
  '小时': 'h',
  '分钟': 'm',
  '秒': 's',
  '天': 'days',
  '本周': 'This week',
  '本月': 'This month',
  '今年': 'This year',
  '今天': 'Today',
  '昨天': 'Yesterday',
  '中文': 'Chinese',
  '跟随系统': 'Follow system',
  '界面文字换成英文；类型名和备注是你自己的数据，不会被翻译':
    'Interface text switches to English; type names and notes are your own data and stay as they are',
  '这段时间还没有记录': 'No records in this period',
  '还没有记录': 'No records yet',
  '这个分组还没有子类型 · 在「我的 → 类型」里加':
    'No child types yet · add them in Me → Types',
  '在「我的 → 目标」里给自己定一个，比如每周编程 10 小时。':
    'Set one in Me → Goals, e.g. 10 hours of programming a week.',
  '只显示前 10': 'Top 10 only',
  '全天': 'All day',
  '现在': 'now',
  '至少': 'at least',
  '不超过': 'at most',
  '回到「此刻」点一下类型就开始': 'Go to Now and tap a type to start',
  '一键开始，随手补记。属于你自己的时间账本。':
    'One tap to start, quick backfill, a ledger that is yours alone.',
  '还没有目标': 'No goals yet',
  '还没有类型': 'No types yet',
  '最投入': 'Busiest',
  '按小时': 'By hour',
  '按天': 'By day',
  '按月': 'By month',
  '条': 'entries',
  '合计时长': 'Total',

  /* —— 种子类型名（英文系统首装时直接用英文名，之后就是用户自己的数据）—— */
  '学习': 'Study',  '英语': 'English',
  '编程': 'Programming',
  '阅读': 'Reading',
  '生活': 'Life',
  '运动': 'Sport',
  '睡眠': 'Sleep',
  '吃饭': 'Meal',
  '工作': 'Work',
  '通勤': 'Commute',
  '出了点问题': 'Something went wrong',
  '数据打不开': 'Your data could not be opened',
  '试试刷新页面，或在浏览器设置里允许本站存储':
    'Try reloading, or allow this site to store data in your browser settings',
  '离线了，而且这份内容还没缓存': 'You are offline and this page was not cached yet',
  '长按胶囊或大格子，能拖着换顺序、换分组': 'Press and hold a chip or tile to reorder it, or move it into another group',
  '里面已经有子类型了，所以一直是分组': 'It already has child types, so it always stays a group',
  '这条还在计时。不动「结束」直接保存，它会接着往下走':
    'This one is still running. Save without touching “End” and it keeps going',
  '这个类型': 'this type',
  '未分组': 'Ungrouped',
  '最多的是': 'mostly',
  '没搜到，换个词试试': 'Nothing found — try another word',
  '子类型一起换色': 'Recolor subtypes too',
  '还没有分组。分组是个容器，比如「学习」里放编程、英语、高数，统计和目标会把这些子类型合并起来算。':
    'No groups yet. A group is a container — put Programming, English and Calculus inside “Study”, and stats and goals will add them up together.',
  '还没有目标。定一个，统计页会帮你盯着。':
    'No goals yet. Add one and Stats will keep an eye on it.',
  '个默认类型名也跟着换了': 'default type names updated too',
  '按下去手机会轻轻一震，反馈更实在':
    'Your phone gives a tiny buzz on tap, so it feels more solid',
  '一键开始，随手补记。属于你自己的时间账本':
    'One tap to start, quick backfill, a ledger that is yours alone',

  /* —— 抽屉与设置页里的固定句子 —— */
  '归到分组（可选）': 'Group (optional)',
  '累计': 'total',
  '合计': 'total',
  '这是个分组': 'This is a group',
  '统计哪些类型（不选 = 全部）': 'Which types (none = all)',
  '目标时长（小时）': 'Target hours',
  '太短了，没记下（可以在设置里关掉这个门槛）':
    'Too short, nothing saved (you can turn this threshold off in Settings)',
  '未分类': 'Uncategorised',
  '空分组': 'Empty group',
  '每天': 'Daily',
  '每周': 'Weekly',
  '每月': 'Monthly',
  '每年': 'Yearly',
  '已删除': 'Deleted',
  '已保存': 'Saved',
  '导入失败': 'Import failed',
  '导入完成': 'Import done',
  '界面已切换成中文': 'Interface switched to Chinese',
  'Interface switched to English': 'Interface switched to English',
  '同一分组里想分得开，挑不同深浅最省事；统计图里也会把它们画成同一个色系':
    'To keep types apart inside one group, pick different shades — charts still treat them as one colour family.',
  '在「我的 → 目标」里给自己定一个，比如每周编程 10 小时':
    'Set one in Me → Goals, e.g. 10 hours of programming a week',
  '如果你常在凌晨活动，把一天的起点设到 4 点，凌晨 1 点的记录就还算「昨天」':
    'If you are often up past midnight, set the day start to 4:00 — a 1 a.m. entry still counts as yesterday.',
  '清空所有记录和目标？类型会保留，清空后 5 秒内可以撤销':
    'Clear all entries and goals? Types stay; you can undo for 5 seconds.',
  '所有数据只存在这台设备上，不上传、不需要账号。加到主屏幕后跟普通 App 一样用；装成 APK 时数据在应用自己的目录里，卸载会一起删掉，换机前记得先导一份备份':
    'All data stays on this device — nothing is uploaded and no account is needed. Add it to the home screen and it behaves like a normal app. As an APK the data lives in the app’s own folder, so uninstalling removes it: export a backup before switching phones.',
};

/* 带数字的句子：格式函数已经按语言生成数字部分，这里只补句子骨架 */
const RULES = [
  // 先放「整句最长」的规则：拆开写的话会被下面更短的规则先抢走
  [/^(每周|每天)(至少|不超过) (.+) · 现在 (.+)$/, (m) => `${m[1] === '每周' ? 'At least' : 'At most'} ${t(m[3])} ${m[1] === '每周' ? 'a week' : 'a day'} · now ${t(m[4])}`],
  [/^(.+) · 共 (.+) · 比上期 ([+−-]?\d+)% · 最投入 (\d+)–(\d+) 点$/, (m) => `${t(m[1])} · ${m[2]} total · ${m[3]}% vs previous · busiest ${m[4]}:00–${m[5]}:00`],
  [/^(.+) · 共 (.+) · 比上期 ([+−-]?\d+)%$/, (m) => `${t(m[1])} · ${m[2]} total · ${m[3]}% vs previous`],
  [/^(.+) · 共 (.+) · 最投入 (\d+)–(\d+) 点$/, (m) => `${t(m[1])} · ${m[2]} total · busiest ${m[3]}:00–${m[4]}:00`],
  [/^(.+) · 比上期 ([+−-]?\d+)% · 最投入 (\d+)–(\d+) 点$/, (m) => `${t(m[1])} · ${m[2]}% vs previous · busiest ${m[3]}:00–${m[4]}:00`],
  [/^已暂停 · (.+)$/, (m) => `Paused · ${m[1]}`],
  [/^今天已记 (.+)$/, (m) => `Logged ${m[1]} today`],
  [/^跟分组「(.+)」同一个颜色$/, (m) => `Same color as “${m[1]}”`],
  [/^和「(.+)」同色系的第 (\d+) 档，统计里能分开$/, (m) => `Shade ${m[2]} of “${m[1]}”, still distinguishable in charts`],
  [/^同色系第 (\d+) 档$/, (m) => `Shade ${m[1]}`],
  [/^最多的是(.+)$/, (m) => `Mostly ${m[1]}`],
  [/^([日一二三四五六])$/, (m) => ({ 日: 'S', 一: 'M', 二: 'T', 三: 'W', 四: 'T', 五: 'F', 六: 'S' }[m[1]])],
  [/^「(.+)」已创建$/, (m) => `“${m[1]}” created`],
  [/^(.*) · 今天已记 (.+)$/, (m) => `${m[1]} · logged ${m[2]} today`],
  [/^空白 (.+)$/, (m) => `Blank ${m[1]}`],
  [/^(\S+) · 已记 (.+)$/, (m) => `${t(m[1])} · ${m[2]} logged`],
  [/^(\d+) 个项目?$/, (m) => `${m[1]} items`],
  [/^(.+) 条 · 合计 (.+)$/, (m) => `${m[1]} entries · total ${m[2]}`],
  [/^(\d+) 条$/, (m) => `${m[1]} entries`],
  [/^(\d+) 个类型 · (\d+) 条记录 · 累计 (.+)$/, (m) => `${m[1]} types · ${m[2]} entries · ${m[3]} total`],
  [/^已记下 (.+)$/, (m) => `Logged ${m[1]}`],
  [/^已记下$/i, () => 'Logged'],
  [/^(\d+) 个子类型一起删了$/, (m) => `${m[1]} child types deleted too`],
  [/^(\d+) 条记录保留在未分类$/, (m) => `${m[1]} entries kept as uncategorised`],
  [/^「(.+)」里有 (\d+) 个子类型，会一起删掉。继续？$/, (m) => `“${m[1]}” has ${m[2]} child types; they will be deleted too. Continue?`],
  [/^已删除「(.+)」$/, (m) => `Deleted “${m[1]}”`],
  [/^已删除「(.+)」(.*)$/, (m) => `Deleted “${m[1]}”${m[2]}`],
  [/^(分组|类型)「(.+)」已创建$/, (m) => `${m[1] === '分组' ? 'Group' : 'Type'} “${m[2]}” created`],
  [/^撤销提示会停留 (\d+) 秒$/, (m) => `Undo will stay for ${m[1]} s`],
  [/^已存到 (.+)$/, (m) => `Saved to ${m[1]}`],
  [/^此刻备份-(.+)\.json$/, (m) => `cike-backup-${m[1]}.json`],
  [/^此刻-(.+)\.csv$/, (m) => `cike-${m[1]}.csv`],
  [/^导入会替换掉现在的 (\d+) 条记录（目标也会一起换）。继续？$/, (m) => `Import replaces the current ${m[1]} entries (goals too). Continue?`],
  [/^导入完成：(\d+) 条记录$/, (m) => `Import done: ${m[1]} entries`],
  [/^已移到「(.+)」$/, (m) => `Moved to “${m[1]}”`],
  [/^「(.+)」里面有子类型，不能再塞进别的分组$/, (m) => `“${m[1]}” has child types and cannot go into another group`],
  [/^(.+) 已暂停$/, (m) => `${m[1]} paused`],
  [/^(.+) 开始$/, (m) => `${m[1]} started`],
  [/^共 (.+)$/, (m) => `${m[1]} total`],
  [/^(.+) · 共 (.+)$/, (m) => `${m[1]} · ${m[2]} total`],
  [/^· 最投入 (\d+)–(\d+) 点$/, (m) => `· busiest ${m[1]}:00–${m[2]}:00`],
  [/^· 比上期 ([+−-]?\d+)%$/, (m) => `· ${m[1]}% vs previous`],
  [/^等 (\d+) 类$/, (m) => `and ${m[1]} more`],
  [/^(\d{4}) 年$/, (m) => `${m[1]}`],
  [/^(\d{4}) 年每月$/, (m) => `Monthly · ${m[1]}`],
  [/^(\d{4}) 年全年$/, (m) => `All of ${m[1]}`],
  [/^本月 (\d+) 天$/, (m) => `${m[1]} days this month`],
  [/^(\d+) 月 (\d+) 日$/, (m) => `${MONTHS[m[1] - 1]} ${m[2]}`],
  [/^(.+) – (.+)$/, (m) => `${t(m[1])} – ${t(m[2])}`],
  [/^(\d+) 个类型$/, (m) => `${m[1]} types`],
  [/^(\d+) 个小时?$/, (m) => `${m[1]} h`],
  [/^(.+) 分钟$/, (m) => `${m[1]} min`],
  [/^（之后 (.+) 还没到）$/, (m) => `(${m[1]} still to come)`],
  [/^(\d+) 个分组$/, (m) => `${m[1]} groups`],
  [/^([+-]?\d+)\s*小时$/, (m) => `${m[1]} h`],
  [/^(.+) · 记录 (.+) · (.+) (.+)$/, (m) => `${t(m[1])} · ${m[2]} recorded · ${t(`${m[3]} ${m[4]}`)}`],

  /* —— 渲染时才拼出来的那些（「1 项」「16时」「记录学习」…）—— */
  [/^(\d+) 项$/, (m) => `${m[1]} items`],
  [/^(\d+) 个$/, (m) => `${m[1]}`],
  [/^(\d+) 个子类型$/, (m) => `${m[1]} subtypes`],
  [/^(\d+) 个分组$/, (m) => `${m[1]} groups`],
  [/^(\d+) 个类型$/, (m) => `${m[1]} types`],
  [/^(\d+) 条记录$/, (m) => `${m[1]} entries`],
  [/^(\d+) 天$/, (m) => `${m[1]} days`],
  [/^(\d+) 秒$/, (m) => `${m[1]} s`],
  [/^(\d+):(\d+)$/, (m) => `${m[1]}:${m[2]}`],
  [/^(\d+)时$/, (m) => `${m[1]}:00`],
  [/^(\d+)月$/, (m) => MONTHS[(Number(m[1]) - 1) % 12]],
  [/^(\d{4}) 年还没有记录$/, (m) => `No records in ${m[1]}`],
  [/^记录(.+)$/, (m) => `Log ${t(m[1])}`],
  [/^记录 (.+)$/, (m) => `logged ${m[1]}`],
  [/^未记 (.+)$/, (m) => `unlogged ${m[1]}`],
  [/^本周 7 天$/, () => 'This week · 7 days'],
  [/^本月每天$/, () => 'Daily this month'],
  [/^0 – 24 时$/, () => '0 – 24 h'],
  [/^每周至少 (.+)$/, (m) => `At least ${m[1]} a week`],
  [/^每天不超过 (.+)$/, (m) => `At most ${m[1]} a day`],
  [/^(每周|每天)(至少|不超过) (.+) · 现在 (.+)$/, (m) => `${t(m[3])} ${t(m[2])} ${m[1] === '每周' ? 'a week' : 'a day'} · now ${m[4]}`],
  [/^(\d+) 个默认类型名也跟着换了$/,
    (m) => `${m[1]} ${Number(m[1]) === 1 ? 'default type name' : 'default type names'} updated too`],
  [/^把「(.+)」里面的子类型都改成这个颜色；想各自区分就关掉$/,
    (m) => `Recolor the subtypes inside “${t(m[1])}” as well; turn this off to keep them apart`],
  [/^在「(.+)」里加子类型$/, (m) => `Add a type under “${t(m[1])}”`],
  [/^v(.+) 正式版$/, (m) => `v${m[1]}`],
  [/^构建 (.+)$/, (m) => `build ${m[1]}`],
  [/^共 (.+) · 比上期 (.+)$/, (m) => `${m[1]} total · ${m[2]} vs previous`],
  [/^之后 (.+) 还没到$/, (m) => `${m[1]} still to come`],
  [/^(\d+) 条记录 · 累计 (.+)$/, (m) => `${m[1]} entries · ${m[2]} total`],
  [/^条记录 · 累计 (.+)$/, (m) => `entries · ${m[1]} total`],
  [/^(\d+) 小时$/, (m) => `${m[1]} h`],
  [/^(\d+) 月$/, (m) => MONTHS[(Number(m[1]) - 1) % 12]],
  [/^(\d{4}) 年 (\d+) 月$/, (m) => `${MONTHS[(Number(m[2]) - 1) % 12]} ${m[1]}`],

  /* —— 周热力图与关注范围 —— */
  [/^整个分组 · (\d+) 个子类型$/, (m) => `Whole group · ${m[1]} subtypes`],
  // 顺序要紧：长的先用（「… · 有记录的 N 天」先剥掉尾巴，再翻前面的合计）
  [/^(.+) · 有记录的 (\d+) 天$/, (m) => `${t(m[1])} · ${m[2]} days logged`],
  [/^(.+) · 最近 (\d+) 周共 (.+)$/, (m) => `${t(m[1])} · last ${m[2]} weeks: ${m[3]}`],
  [/^最近 (\d+) 周共 ([^·]+)$/, (m) => `Last ${m[1]} weeks: ${m[2]}`],
  [/^周热力图只统计 (.+)$/, (m) => `Heatmap now counts only ${t(m[1])}`],
  [/^这 (\d+) 周里，选中的范围还没有记录。$/,
    (m) => `No entries for the selected range in the last ${m[1]} weeks.`],
  [/^(\d+)月(\d+)日 · (.+)$/, (m) => `${MONTHS[(Number(m[1]) - 1) % 12]} ${m[2]} · ${t(m[3])}`],
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const CJK = /[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]/;

let lang = 'zh';
let observer = null;
let scheduled = 0;

export function getLang() {
  return lang;
}

export function isEn() {
  return lang === 'en';
}

export function detectLang(pref) {
  if (pref === 'en' || pref === 'zh') return pref;
  // 测试可以在页面上放 window.__lang 直接指定；问不到语言就保持中文
  if (typeof window !== 'undefined' && (window.__lang === 'en' || window.__lang === 'zh')) {
    return window.__lang;
  }
  const nav = (typeof navigator !== 'undefined' && (navigator.language || '')) || '';
  if (!nav) return 'zh';
  return /^zh/i.test(nav) ? 'zh' : 'en';
}

export function setLang(next) {
  const resolved = next === 'en' || next === 'zh' ? next : detectLang(next);
  const changed = resolved !== lang;
  lang = resolved;
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('lang', lang === 'en' ? 'en' : 'zh-CN');
    if (changed && lang === 'en') translateRoot(document.body);
    // 切回中文：把被换掉的文字还原（外壳是常驻 DOM，不还原会一直是英文）
    if (changed && lang === 'zh') restoreAll();
  }
  return lang;
}

/** 单条文本翻译（没有对应条目就原样返回） */
export function t(text) {
  if (lang !== 'en' || !text) return text;
  const raw = String(text);
  const trimmed = raw.trim();
  if (!trimmed) return raw;
  if (!CJK.test(trimmed)) return raw;             // 纯英文/数字/符号：不碰
  const hit = EN[trimmed];
  if (hit !== undefined) return keepSpace(raw, trimmed, hit);
  // 同一个句子，模板里有时带句号有时不带（`长按胶囊…换分组。` vs `…换分组`）。
  // 按去掉/补上结尾标点各试一次，省得为每个变体抄一条。
  const bare = trimmed.replace(/[。！？!?]+$/, '');
  const tail = trimmed.slice(bare.length);
  if (bare !== trimmed && EN[bare] !== undefined) return keepSpace(raw, trimmed, EN[bare]);
  if (bare === trimmed && EN[trimmed + '。'] !== undefined) return keepSpace(raw, trimmed, EN[trimmed + '。']);
  // 「未记 167h 0m（之后 98h 1m 还没到）」：先把括号拆开各自翻，
  // 否则整句规则谁都不认，括号里的中文就漏出来了。
  const par0 = trimmed.match(/^(.+?)（(.+)）$/);
  if (par0) {
    const a = t(par0[1]);
    const b = t(par0[2]);
    if (!CJK.test(a + b)) return keepSpace(raw, trimmed, `${a} (${b})`);
  }
  for (const [re, fn] of RULES) {
    const m = trimmed.match(re);
    if (m) return keepSpace(raw, trimmed, fn(m));
  }
  // 组合句：用「 · 」拆开逐段翻。「本周 · 已记 1%」「类型 · 2 个分组」「11 月 2 日 – 11 月 8 日」
  // 这类句子是前端拼出来的，与其为每一句写规则，不如拆开各段走各自的规则。
  if (trimmed.includes(' · ')) {
    const out = trimmed.split(' · ').map((p) => t(p)).join(' · ');
    if (out !== trimmed) return keepSpace(raw, trimmed, out);
  }
  // 括号里的补充说明：「未记 167h 0m（之后 98h 1m 还没到）」
  const par = trimmed.match(/^(.+?)（(.+)）$/);
  if (par) {
    const inside = t(par[2]);
    if (!CJK.test(inside)) return keepSpace(raw, trimmed, `${t(par[1])}（${inside}）`);
  }
  return raw;
}

function keepSpace(raw, trimmed, out) {
  const lead = raw.slice(0, raw.indexOf(trimmed));
  const tail = raw.slice(raw.indexOf(trimmed) + trimmed.length);
  return lead + out + tail;
}

const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];

/** 把 root 里所有文字换掉（英文模式下才有动作） */
export function translateRoot(root) {
  if (lang !== 'en' || !root) return;
  if (root.nodeType === 3) {
    const next = t(root.nodeValue);
    if (next !== root.nodeValue) root.nodeValue = next;
    return;
  }
  if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const p = node.parentNode;
      if (!p) return NodeFilter.FILTER_REJECT;
      const tag = p.nodeName;
      if (tag === 'SCRIPT' || tag === 'STYLE') return NodeFilter.FILTER_REJECT;
      return CJK.test(node.nodeValue || '') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  const hits = [];
  while (walker.nextNode()) hits.push(walker.currentNode);
  for (const node of hits) {
    const next = t(node.nodeValue);
    if (next !== node.nodeValue) {
      if (!ORIG_TEXT.has(node)) ORIG_TEXT.set(node, node.nodeValue);
      node.nodeValue = next;
    }
  }
  const els = root.querySelectorAll ? root.querySelectorAll('[placeholder],[title],[aria-label],[alt]') : [];
  for (const el of els) {
    for (const attr of ATTRS) {
      const v = el.getAttribute(attr);
      if (!v || !CJK.test(v)) continue;
      const next = t(v);
      if (next !== v) {
        rememberAttr(el, attr, v);
        el.setAttribute(attr, next);
      }
    }
  }
}

/* 记下「换成英文之前」的原文，切回中文时用得上。
   用 WeakMap：节点被换掉就自然回收，不用手动清理。 */
const ORIG_TEXT = new WeakMap();
const ORIG_ATTR = new WeakMap();

function rememberAttr(el, attr, value) {
  const rec = ORIG_ATTR.get(el) || {};
  if (!(attr in rec)) rec[attr] = value;
  ORIG_ATTR.set(el, rec);
}

/** 切回中文时把常驻 DOM（外壳导航、标题）还原成原文 */
export function restoreAll() {
  if (typeof document === 'undefined') return;
  const root = document.body;
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    if (ORIG_TEXT.has(node)) {
      node.nodeValue = ORIG_TEXT.get(node);
      ORIG_TEXT.delete(node);
    }
  }
  for (const el of root.querySelectorAll('*')) {
    const rec = ORIG_ATTR.get(el);
    if (!rec) continue;
    for (const attr of Object.keys(rec)) el.setAttribute(attr, rec[attr]);
    ORIG_ATTR.delete(el);
  }
  if (document.title && TITLE_ZH) document.title = TITLE_ZH;
}

const TITLE_ZH = typeof document !== 'undefined' ? document.title : '';

/** 渲染之后叫一下；后插入的（抽屉/提示条）由 MutationObserver 兜住 */
export function refreshI18n() {
  if (lang !== 'en' || typeof document === 'undefined') return;
  translateRoot(document.title.includes('·') ? document.head : document.body);
  if (document.title) document.title = t(document.title);
}

export function installAutoTranslate() {
  if (typeof document === 'undefined' || observer) return;
  observer = new MutationObserver((records) => {
    if (lang !== 'en') return;
    let need = false;
    for (const r of records) {
      // attributes 也要：title / aria-label / placeholder 常常是后设的
      if (r.type === 'characterData' || r.type === 'attributes') { need = true; break; }
      for (const n of r.addedNodes) {
        if (n.nodeType === 1 || n.nodeType === 3) { need = true; break; }
      }
      if (need) break;
    }
    if (!need) return;
    if (scheduled) return;
    scheduled = requestAnimationFrame(() => {
      scheduled = 0;
      translateRoot(document.body);
    });
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ATTRS,   // 只盯这几个，别让 className 变化把 rAF 刷爆
  });
}

/** 首次铺种子数据时用到的类型名（数据，只在创建时翻译一次） */
export function seedName(zh) {
  return lang === 'en' ? EN[zh] || zh : zh;
}

/** 种子类型名的中文原文（换语言时用来认「这名字还是默认的」） */
const SEED_ZH = ['学习', '英语', '编程', '阅读', '生活', '运动', '睡眠', '吃饭', '工作', '通勤'];

/**
 * 把「还叫默认名字」的类型名换成当前语言的名字。
 * 只认精确匹配的种子名 —— 用户自己改过的（「高数」「项目A」）一个字都不动。
 * 这是数据层的小让步：切到英文还满屏「学习 / 英语」实在别扭，但绝不碰自定义名字。
 */
export function renameSeedName(name) {
  if (!name) return name;
  if (lang === 'en') {
    if (SEED_ZH.includes(name) && EN[name]) return EN[name];
    return name;
  }
  const zh = SEED_ZH.find((k) => EN[k] === name);
  return zh || name;
}
