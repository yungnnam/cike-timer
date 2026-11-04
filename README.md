# 此刻 · Cike

A time tracker built around one rule: **one tap starts, one tap stops.**

The same codebase runs in a desktop browser, on a phone home screen as a PWA, and inside
an offline Android APK. Interface available in Chinese and English.

- **0.53 MB APK**, no network permission, no account, no telemetry.
- **No build step**: plain HTML, CSS and ES modules. The `app/` directory *is* the application.
- **Local-first storage**: IndexedDB (falls back to `localStorage`), exportable as JSON/CSV.

记录 点一次类型即开始计时，再点一次结束，支持暂停与继续。24 小时墨带上按住空白拖动即可补记一段时间（自动吸附到 5 分钟），拖动时右上角实时显示区间与时长；点击已有段可直接编辑起止时间、备注与标签。补记或编辑产生的重叠区间会自动裁剪既有记录，若被裁剪的是正在计时的记录，则在插入点断开、计时不中断。

类型与分组 类型分两级：分组作为容器（如「学习」），内部放子类型（如编程、英语、阅读）。24 色色板与图标可选；长按胶囊或大格子可拖动排序，拖进分组即成为其子类型，拖回网格则退出分组。同一分组的子类型默认同色，也可取同色系的不同深浅以便区分。所有统计与目标都支持按「分组」或「类型」两种口径查看。

统计 四种区间：今天 / 本周 / 本月 / 今年，并可翻看上一年的数据。主图支持饼图、环形图、条形图三种画法；第二张图呈现所选区间的全貌（24 小时、168 小时、当月天数或全年），把已记录与空白一并展示。另有日均、条目数、最长一段、未记录四项指标，按小时／星期／月的分布，一周节奏热力图，前 10 项排行（含子类型明细与相对上一等长周期的增减），以及目标进度。所有数字来自同一次区间裁剪结果，避免不同卡片口径不一致。

目标 支持「每天 / 每周 / 每月 / 每年」与「达成 / 不超过」两种方式的组合，可指定若干类型，选择分组时自动包含其下全部子类型。

撤销 所有结构性改动（改色、删类型及其子类型、拖动排序、导入、清空）都会保留 3–10 秒的撤销机会，停留时长可设置。撤销通过整表快照还原，与操作前逐字节一致。

数据 全部保存在本机，不联网。可导出完整 JSON 备份、导出 CSV 用于表格处理，也可原样导入恢复；清空数据需要确认且可撤销。

手机端（APK） 通知栏常驻显示正在进行的计时，包含暂停状态，锁屏可见；秒数由系统计时器推进，不额外耗电。支持点按震动、返回键语义（先关闭抽屉再退出）、备份导出到系统下载目录。应用不申请 INTERNET 权限，因此不存在任何网络请求。

语言 中文、English、跟随系统三档，切换立即生效，数字与日期格式随之改变。类型名、备注、标签属于用户数据，不参与翻译；仅当类型名等于内置默认名时，切换语言会同步改名，且可撤销。

隐私 无账号、无云同步、无统计上报、无第三方 SDK。网页版数据存在浏览器配置里，APK 数据存在应用私有目录，卸载会一并删除，因此建议定期导出备份。
---

## Design principles

1. **One tap to record.** Tapping a type starts it immediately. Tapping it again stops it.
   There is no confirmation dialog.
2. **Undoable instead of confirmed.** Destructive and structural changes keep a 3–10 s
   *Undo* affordance. Undo restores the previous state from a snapshot, not by replaying
   an inverse operation, so it is byte-for-byte correct.
3. **The data belongs to the user.** No account, no sync service, no analytics. Export
   produces a complete JSON document that imports back into an identical state.

## Features

| Area | What it does |
| --- | --- |
| Now | Live timer, grouped type cards, drag-to-reorder, 24-hour strip you can drag to back-fill an interval |
| Log | Entries grouped by day, search across type/note/tags, tap to edit; cross-midnight entries are split and labelled |
| Stats | Pie / ring / bar, a second chart for the selected period (24 h, week, month, year), weekday-by-hour heat map, ranking with sub-type breakdown, goal progress |
| Me | Two-level types (group + sub-type), 24-colour palette, goals (day/week/month/year × reach/limit), theme, language, haptics, undo duration, import/export |
| Android | Ongoing timer in the notification shade (with pause state, lock-screen visible), back-gesture handling, backup export to a folder under `Downloads` |

## Architecture

```
app/                  the web application — no dependencies, no bundler
  index.html          document shell + inline SVG icon sprite
  css/app.css         the entire stylesheet (design tokens, dark/light)
  js/
    app.js            routing, follow-finger page transitions, theme, shell
    store.js          domain model: types, entries, goals, settings, undo stack
    db.js             IndexedDB wrapper with localStorage fallback and reconnect
    i18n.js           zh ⇄ en dictionary, runtime DOM translation
    ui.js             bottom sheets, toasts, entry editor
    editors.js        type and goal editors
    motion.js         press feedback, ripples, unfold animations
    native.js         bridge to the Android shell (notification, export, theme)
    format.js         duration/date formatting, colour helpers
    views/            now / records / stats / me — each exports render(), mount(), tick()
  sw.js               service worker: network-first, cache fallback
android/              WebView shell — Java, no Gradle
  java/cn/cike/timer/MainActivity.java   maps https://cike.local to assets/www
  java/cn/cike/timer/TimerService.java   foreground service for the timer notification
  res/                launcher icons, notification layouts (collapsed + expanded), strings (zh + en)
  build_apk.py        builds the APK with aapt2/javac/d8/zipalign/apksigner
tools/serve.py        LAN static server that disables caching
dist/                 prebuilt APKs
```

### Why these choices

- **Timestamps only.** A running entry stores `start` plus optional `pausedMs`/`pausedAt`.
  The UI derives the display value from `Date.now()` every second, so backgrounding the
  app, locking the screen or suspending the tab cannot desynchronise the clock.
- **Snapshot undo.** Structural edits (recolouring a group, deleting a type and its
  children) touch many records at once; snapshotting the three tables and writing them
  back is simpler and safer than maintaining per-operation inverses.
- **Intercepted requests instead of `file://`.** `file://` is an opaque origin, which
  disables IndexedDB. Serving the bundled assets over `https://cike.local` gives a secure
  context while remaining entirely local — the APK requests no network permission at all.
- **Hand-built APK pipeline.** The shell consists of two Java classes and a handful of
  resources; a Gradle project would add megabytes of tooling for a 0.53 MB artifact.
  `android/build_apk.py` drives `aapt2` → `javac` → `d8` → `zipalign` → `apksigner` directly.

## Getting started

### In a browser

```bash
python tools/serve.py 8788 app
# http://127.0.0.1:8788/      (or http://<your-lan-ip>:8788/ from a phone)
```

`tools/serve.py` sends `Cache-Control: no-store`, so reloading always picks up edits.

### As an Android app

Download `dist/cike-1.2.3.apk` from [Releases](../../releases) and install it. Android may
ask you to allow installation from unknown sources the first time.

Requested permissions: `VIBRATE`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_SPECIAL_USE`,
`POST_NOTIFICATIONS`. There is deliberately **no `INTERNET` permission**.

## Building the APK from source

Requirements: JDK 17+, Android `build-tools` (with `aapt2`, `d8`, `zipalign`, `apksigner`),
a `platforms/android-34` package, and `pip install pillow` for icon scaling.

```bash
python android/build_apk.py
```

| Variable | Purpose | Default |
| --- | --- | --- |
| `CIKE_BT` | Android `build-tools` directory | auto-detected from `ANDROID_HOME` |
| `CIKE_PLATFORM` | `platforms/android-XX` directory | newest `android-3x` found |
| `CIKE_JDK` | JDK home (for `keytool`/`apksigner`) | derived from `java` on `PATH` |
| `CIKE_BUILD` | Scratch directory | `%TEMP%/cike-build` |

The version written into the APK is read from `android/AndroidManifest.xml`.
A GitHub Actions workflow (`.github/workflows/build-apk.yml`) runs the same command on a
`v*` tag and uploads the artifact.

## Testing

The project is verified at four levels — no test framework, only Node and Python scripts
maintained outside the application directory:

| Level | What it checks |
| --- | --- |
| Domain | 93 assertions over the model: timer/pause arithmetic, overlap trimming, undo round-trips, statistics buckets, goal periods, import/export fidelity |
| Static | Routes vs. navigation, icon references, offline cache manifest, Java literals, encoded-text corruption, CSS structure |
| Rendered | The four views render to HTML in Node and are scanned for untranslated strings and `NaN`/`undefined` |
| Live | Headless Chrome over CDP: real touch gestures, geometry assertions, screenshots |

## Privacy

- Data lives in IndexedDB inside the browser profile, or in the APK's private storage.
- No account, no telemetry, no crash reporting, no third-party SDKs.
- Export writes a JSON file to the location you choose; nothing leaves the device on its own.

## Compatibility and known limitations

- Android 7.0 (API 24) and newer; the web app targets current Chrome, Firefox and Safari.
- Not implemented: Pomodoro timer, home-screen widget, restoring a running timer after reboot.
- The timer notification requires API 26+ for the channel; below that it still posts.

## License

MIT — see [LICENSE](LICENSE).

---

## 中文说明

**一个本地优先的时间记录工具：点击即开始计时，再次点击即结束。** 同一份代码可运行于桌面浏览器、
安装为 PWA，或打包为完全离线的安卓 APK。

**核心设计原则**

1. **一次点击记录**：点类型即开始，再点即结束，不弹确认框。
2. **用撤销代替确认**：所有改动保留 3–10 秒撤销（可设置）；撤销通过整表快照还原，保证与操作前完全一致。
3. **数据归用户**：无账号、无云同步、无统计上报；导出为完整 JSON，可原样导入。

**功能**：四个页面（此刻 / 记录 / 统计 / 我的）、两级类型与分组、24 色板、标签与备注、
24 小时墨带拖拽补记、日/周/月/年目标（达成或不超过）、饼图/环形/条形三种画法、
周期对比图、一周节奏热力图、排行与子类型明细、中英双语、导入导出 JSON/CSV。

**技术要点**：零依赖 ES Modules，无构建步骤；IndexedDB 存储（不可用时降级 `localStorage`）；
进行中的记录只保存时间戳，界面每秒用 `Date.now()` 做差；APK 外壳为 WebView + 前台服务，
通过 `shouldInterceptRequest` 把 `https://cike.local` 映射到 `assets/www/`，且不申请网络权限。

构建、测试与已知限制见上文的英文部分。
