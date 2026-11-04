# 此刻 · Cike

A time tracker built around one rule: **one tap starts, one tap stops.**

The same codebase runs in a desktop browser, on a phone home screen as a PWA, and inside
an offline Android APK. Interface available in Chinese and English.

- **0.53 MB APK**, no network permission, no account, no telemetry.
- **No build step**: plain HTML, CSS and ES modules. The `app/` directory *is* the application.
- **Local-first storage**: IndexedDB (falls back to `localStorage`), exportable as JSON/CSV.

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
