# android/ — WebView 容器与构建脚本

这一层不重新实现界面：它把 `app/` 中的静态站点装载进 `WebView`，并补齐浏览器里没有的能力
（离线资源、常驻通知、返回键语义、文件导出、系统主题）。

## 为什么用 WebView

| 方案 | 评估 |
| --- | --- |
| 原生重写 | 需要重做全部布局、动画与图表；本项目界面依赖 `grid`/`flex` 与过渡动画，重写成本远高于收益 |
| WebView 容器（当前） | 同一份代码同时服务浏览器与手机；代价是必须处理 WebView 与浏览器行为差异（见第 4 节） |

## 关键设计

### 1. 拦截私有域名，而不是 `file://`

`MainActivity.shouldInterceptRequest` 将 `https://cike.local/...` 映射到 `assets/www/...`。

`file://` 属于不透明源：IndexedDB 不可用，`localStorage` 受限。使用 `https://` 前缀可获得
安全上下文，存储能力完整；同时 APK 未申请 `INTERNET` 权限，请求无法离开进程。

### 2. 前台服务中的常驻通知

`TimerService` 在计时期间维持一条通知：

- 计时中：`setUsesChronometer(true)`，秒数由系统推进，应用不参与刷新。
- 暂停时：切换为静态时长文本，避免视觉上误判为仍在计时。
- 折叠态可用高度约 64 dp，因此折叠与展开使用两份 `RemoteViews`
  （`res/layout/notif_timer.xml` 单行，`notif_timer_big.xml` 三行）。
- `VISIBILITY_PUBLIC`，锁屏可见；服务为 `START_STICKY`，任务被移除后可从最后一帧恢复。

### 3. 原生桥（`MainActivity.Bridge`，JS 侧为 `app/js/native.js`）

| 方法 | 作用 |
| --- | --- |
| `saveFile(name, content)` | 将导出内容写入系统下载目录（Web 端回退为浏览器下载） |
| `vibrate(ms)` | 点按震动；WebView 不提供 `navigator.vibrate` |
| `notifyTimer(...)` / `notifyClear()` | 开始 / 暂停 / 继续 / 停止时同步通知 |
| `notifyStatus()` / `openNotifySettings()` / `askNotify()` | 查询通知可用性、跳转系统设置、申请权限 |
| `systemDark()` | 返回真实的系统深色状态；WebView 的 `prefers-color-scheme` 反映的是应用主题 |

### 4. 返回键

先调用网页的 `window.__androidBack()`：若存在已打开的抽屉则关闭并返回 `true`；
否则 `finish()` 退出应用，不遍历浏览历史。

## 已知行为差异与处理

| 差异 | 处理 |
| --- | --- |
| `window.confirm()` 默认返回 `false` | 实现 `WebChromeClient.onJsConfirm` |
| 无 `navigator.vibrate` | 原生桥 + `VIBRATE` 权限 |
| `prefers-color-scheme` 跟随 Activity 主题 | 桥接 `systemDark()`，并在 `onConfigurationChanged` 通知页面 |
| 系统强制深色会二次压暗 | `setForceDark(FORCE_DARK_OFF)` / `setAlgorithmicDarkeningAllowed(false)` |
| 文件选择器不可用 | 实现 `onShowFileChooser`（`ACTION_GET_CONTENT`） |
| 折叠态通知被裁剪 | 两份 `RemoteViews`（见上） |

## 构建

不使用 Gradle。`build_apk.py` 将 `app/` 复制为 `assets/www/`，随后执行：

```
aapt2 compile → aapt2 link（--java 生成 R.java）→ javac（含 R.java）→ d8
→ 注入 classes.dex → zipalign → keytool + apksigner → dist/cike-<version>.apk
```

```bash
python android/build_apk.py
```

| 变量 | 作用 | 默认值 |
| --- | --- | --- |
| `CIKE_BT` | build-tools 目录（需含 `aapt2`、`d8`、`zipalign`、`apksigner`） | 由 `ANDROID_HOME` 或 `ANDROID_SDK_ROOT` 探测 |
| `CIKE_PLATFORM` | `platforms/android-XX` 目录 | 最新可用的 `android-3x` |
| `CIKE_JDK` | JDK 路径（`keytool`、`apksigner` 需要） | 由 `PATH` 上的 `java` 推导 |
| `CIKE_BUILD` | 中间产物目录 | `%TEMP%/cike-build` |

版本号仅来自 `AndroidManifest.xml` 的 `versionCode` / `versionName`，脚本读取后写入产物。

### 注意事项

- 构建路径需为 ASCII：`aapt2` 无法打开包含非 ASCII 字符的目录，
  因此 `CIKE_BUILD` 应指向纯 ASCII 路径。
- 图标依赖 Pillow 生成各密度位图；缺失时会跳过缩放并使用已有资源。

## 资源

| 路径 | 作用 |
| --- | --- |
| `java/cn/cike/timer/MainActivity.java` | WebView 容器、资源拦截、原生桥、返回键与文件选择 |
| `java/cn/cike/timer/TimerService.java` | 前台服务与通知构建 |
| `res/layout/notif_timer.xml` | 折叠态通知布局（单行） |
| `res/layout/notif_timer_big.xml` | 展开态通知布局（三行） |
| `res/drawable/` | 通知背景、状态栏图标 |
| `res/values/`, `res/values-en/` | 系统侧字符串（中文 / 英文） |
| `res/mipmap-*/` | 应用图标 |
