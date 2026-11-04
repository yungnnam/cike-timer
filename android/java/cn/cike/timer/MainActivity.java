package cn.cike.timer;

import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.MediaStore;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * 此刻 · 时间记录（离线壳）
 *
 * 网页文件全部打在 APK 的 assets/www 里，用 https://cike.local/ 这个假域名喂给 WebView：
 * 这样就是一个「安全上下文」（IndexedDB、localStorage 正常可用），
 * 又完全不联网（APK 没有 INTERNET 权限，拦截请求时只读安装包里的文件）。
 */
public class MainActivity extends Activity {
    private static final String HOST = "cike.local";
    private static final String BG = "#06070C";
    private static final int REQ_FILE = 1011;

    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private boolean backBusy = false;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        getWindow().setStatusBarColor(Color.parseColor(BG));
        getWindow().setNavigationBarColor(Color.parseColor(BG));

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor(BG));
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);
        web.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setTextZoom(100);
        if (Build.VERSION.SDK_INT >= 21) {
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        }
        // 界面自己就是深色的：关掉 WebView 的「强制深色」，
        // 否则系统开着深色模式时，WebView 会再叠一层反色/压暗，颜色全变。
        try {
            if (Build.VERSION.SDK_INT >= 33) {
                s.setAlgorithmicDarkeningAllowed(false);
            } else if (Build.VERSION.SDK_INT >= 29) {
                s.setForceDark(WebSettings.FORCE_DARK_OFF);
            }
        } catch (Throwable ignored) {
        }

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (u != null && HOST.equals(u.getHost())) {
                    return fromAssets(u.getPath());
                }
                return null;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (u == null || HOST.equals(u.getHost())) return false;
                // 外链交给系统浏览器，别在应用里跑未知页面
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, u));
                } catch (Exception ignored) {
                }
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> cb,
                                             FileChooserParams params) {
                // 「导入 JSON」要能打开系统的文件选择器，否则点了没反应
                fileCallback = cb;
                try {
                    Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                    i.addCategory(Intent.CATEGORY_OPENABLE);
                    i.setType("*/*");
                    startActivityForResult(Intent.createChooser(i, getString(R.string.chooser_pick_file)), REQ_FILE);
                    return true;
                } catch (Exception e) {
                    fileCallback = null;
                    return false;
                }
            }

            @Override
            public boolean onJsAlert(WebView view, String url, String message,
                                     final android.webkit.JsResult result) {
                new android.app.AlertDialog.Builder(MainActivity.this)
                        .setMessage(message)
                        .setPositiveButton(getString(R.string.dlg_ok), (d, w) -> result.confirm())
                        .setCancelable(false)
                        .show();
                return true;
            }

            @Override
            public boolean onJsConfirm(WebView view, String url, String message,
                                       final android.webkit.JsResult result) {
                // 没有这个回调，网页里的 window.confirm() 会直接返回 false，
                // 「导入会覆盖」「删分组连子类型一起删」这类确认会静默失败。
                new android.app.AlertDialog.Builder(MainActivity.this)
                        .setMessage(message)
                        .setPositiveButton(getString(R.string.dlg_confirm), (d, w) -> result.confirm())
                        .setNegativeButton(getString(R.string.dlg_cancel), (d, w) -> result.cancel())
                        .setCancelable(false)
                        .show();
                return true;
            }
        });
        web.addJavascriptInterface(new Bridge(), "CikeNative");

        askNotifyPermission();
        setContentView(web);
        web.loadUrl("https://" + HOST + "/index.html");
    }

    @Override
    protected void onActivityResult(int req, int result, Intent data) {
        if (req == REQ_FILE) {
            if (fileCallback != null) {
                fileCallback.onReceiveValue(
                        WebChromeClient.FileChooserParams.parseResult(result, data));
                fileCallback = null;
            }
            return;
        }
        super.onActivityResult(req, result, data);
    }

    /** 给网页用的原生能力：把一段文本存成文件（导出的 JSON / CSV 走这里） */
    private class Bridge {
        @JavascriptInterface
        public String saveFile(final String rawName, final String content) {
            String name = rawName == null ? "" : rawName.replaceAll("[\\\\/:*?\"<>|]", "_").trim();
            if (name.isEmpty()) name = getString(R.string.backup_file_name);
            final byte[] bytes = (content == null ? "" : content).getBytes(StandardCharsets.UTF_8);
            String where = null;
            try {
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                    v.put(MediaStore.MediaColumns.MIME_TYPE, "application/octet-stream");
                    v.put(MediaStore.MediaColumns.RELATIVE_PATH,
                            Environment.DIRECTORY_DOWNLOADS + "/" + getString(R.string.backup_dir));
                    Uri uri = getContentResolver()
                            .insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                    if (uri != null) {
                        OutputStream os = getContentResolver().openOutputStream(uri);
                        if (os != null) {
                            os.write(bytes);
                            os.close();
                        }
                        where = String.format(getString(R.string.downloads_prefix), getString(R.string.backup_dir)) + name;
                    }
                } else {
                    File dir = new File(getExternalFilesDir(null), getString(R.string.backup_dir_legacy));
                    if (!dir.exists()) dir.mkdirs();
                    File f = new File(dir, name);
                    FileOutputStream fos = new FileOutputStream(f);
                    fos.write(bytes);
                    fos.close();
                    where = f.getAbsolutePath();
                }
            } catch (Exception e) {
                where = null;
            }
            final String msg = where == null ? getString(R.string.save_failed) : getString(R.string.saved_to, where);
            runOnUiThread(() -> Toast.makeText(MainActivity.this, msg, Toast.LENGTH_LONG).show());
            return where == null ? "" : where;
        }

        /**
         * 正在计时的常驻通知。
         * title 类型名，note 副标题，color 类型色，start 开始时间戳（毫秒），
         * paused 是否暂停，elapsed 已记录毫秒（暂停时用它显示静态时长）。
         */
        @JavascriptInterface
        public void notifyTimer(String title, String note, String color,
                                double start, boolean paused, double elapsed) {
            if (title == null || title.isEmpty()) {
                notifyClear();
                return;
            }
            try {
                Intent i = new Intent(MainActivity.this, TimerService.class);
                i.putExtra(TimerService.EXTRA_TITLE, title);
                i.putExtra(TimerService.EXTRA_NOTE, note);
                i.putExtra(TimerService.EXTRA_COLOR, color);
                i.putExtra(TimerService.EXTRA_START, (long) start);
                i.putExtra(TimerService.EXTRA_PAUSED, paused);
                i.putExtra(TimerService.EXTRA_ELAPSED, (long) elapsed);
                if (Build.VERSION.SDK_INT >= 26) {
                    startForegroundService(i);
                } else {
                    startService(i);
                }
            } catch (Throwable ignored) {
            }
        }

        /** 通知/锁屏现在的状态（JSON 字符串），给「我的 → 锁屏与通知栏」显示 */
        @JavascriptInterface
        public String notifyStatus() {
            boolean enabled = true;
            boolean channel = false;
            int importance = -1;
            int lockscreen = -1;
            try {
                android.app.NotificationManager nm =
                        (android.app.NotificationManager) getSystemService(NOTIFICATION_SERVICE);
                if (nm != null && Build.VERSION.SDK_INT >= 24) {
                    enabled = nm.areNotificationsEnabled();
                }
                if (Build.VERSION.SDK_INT >= 33
                        && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
                        != PackageManager.PERMISSION_GRANTED) {
                    enabled = false;
                }
                if (nm != null && Build.VERSION.SDK_INT >= 26) {
                    android.app.NotificationChannel ch = nm.getNotificationChannel(TimerService.CHANNEL);
                    if (ch != null) {
                        channel = true;
                        importance = ch.getImportance();
                        lockscreen = ch.getLockscreenVisibility();
                    }
                }
            } catch (Throwable ignored) {
            }
            return "{\"enabled\":" + enabled
                    + ",\"channel\":" + channel
                    + ",\"importance\":" + importance
                    + ",\"lockscreen\":" + lockscreen
                    + ",\"sdk\":" + Build.VERSION.SDK_INT + "}";
        }

        /** 跳到系统的「通知」设置页：锁屏上要不要显示，由这里决定 */
        @JavascriptInterface
        public void openNotifySettings() {
            try {
                Intent i = new Intent();
                if (Build.VERSION.SDK_INT >= 26) {
                    i.setAction(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS);
                    i.putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, getPackageName());
                } else {
                    i.setAction(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                    i.setData(Uri.parse("package:" + getPackageName()));
                }
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(i);
            } catch (Throwable ignored) {
            }
        }

        /** 重新要一次通知权限（用户之前点了「不允许」） */
        @JavascriptInterface
        public void askNotify() {
            askNotifyPermission();
        }

        /** 计时结束/清空时把通知摘掉 */
        @JavascriptInterface
        public void notifyClear() {
            try {
                Intent i = new Intent(MainActivity.this, TimerService.class);
                i.putExtra(TimerService.EXTRA_STOP, true);
                startService(i);
            } catch (Throwable ignored) {
            }
        }

        /** 点按震动：WebView 里没有 navigator.vibrate，只能走这里 */
        @JavascriptInterface
        public void vibrate(int ms) {
            try {
                Vibrator v = (Vibrator) getSystemService(VIBRATOR_SERVICE);
                if (v == null || !v.hasVibrator()) return;
                int len = Math.max(1, Math.min(40, ms));
                if (Build.VERSION.SDK_INT >= 26) {
                    v.vibrate(VibrationEffect.createOneShot(len, VibrationEffect.DEFAULT_AMPLITUDE));
                } else {
                    v.vibrate(len);
                }
            } catch (Throwable ignored) {
            }
        }

        /**
         * 系统现在是深色还是浅色。
         *
         * 必须从这里问：WebView 的 prefers-color-scheme 是跟着「应用自己的主题」
         * （我们是浅色的 Theme.DeviceDefault）走的，系统开了深色它也报浅色，
         * 于是「跟随系统」永远停在浅色。
         */
        @JavascriptInterface
        public boolean systemDark() {
            try {
                int mode = getResources().getConfiguration().uiMode
                        & android.content.res.Configuration.UI_MODE_NIGHT_MASK;
                return mode == android.content.res.Configuration.UI_MODE_NIGHT_YES;
            } catch (Throwable e) {
                return false;
            }
        }
    }

    /**
     * 用户在系统设置里切换深色 / 浅色时，Activity 不会重建（configChanges 里带了 uiMode），
     * 所以得自己把这件事告诉网页，让它重新套一次主题。
     */
    @Override
    public void onConfigurationChanged(android.content.res.Configuration cfg) {
        super.onConfigurationChanged(cfg);
        try {
            if (web != null) {
                web.post(() -> web.evaluateJavascript(
                        "window.__sysTheme && window.__sysTheme()", null));
            }
        } catch (Throwable ignored) {
        }
    }

    private static final int REQ_NOTIFY = 1012;

    /**
     * Android 13 起，通知要用户点一次「允许」才会显示。
     * 不给也不是不能用，只是通知栏不会出现，所以这里不拦截主流程。
     */
    private void askNotifyPermission() {
        if (Build.VERSION.SDK_INT < 33) return;
        try {
            if (checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
                    == PackageManager.PERMISSION_GRANTED) return;
            requestPermissions(
                    new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIFY);
        } catch (Throwable ignored) {
        }
    }

    /** 把 https://cike.local/xxx 映射到 assets/www/xxx */
    private WebResourceResponse fromAssets(String path) {
        String name = path == null ? "" : path;
        while (name.startsWith("/")) name = name.substring(1);
        if (name.isEmpty()) name = "index.html";
        if (name.contains("..")) return null;
        try {
            InputStream in = getAssets().open("www/" + name);
            String mime = mimeOf(name);
            String enc = isText(mime) ? "utf-8" : null;
            WebResourceResponse r = new WebResourceResponse(mime, enc, in);
            if (Build.VERSION.SDK_INT >= 21) {
                r.setStatusCodeAndReasonPhrase(200, "OK");
            }
            return r;
        } catch (IOException e) {
            return null;
        }
    }

    private static boolean isText(String mime) {
        return mime.startsWith("text/")
                || mime.contains("javascript")
                || mime.contains("json")
                || mime.contains("manifest");
    }

    private static String mimeOf(String name) {
        String n = name.toLowerCase();
        if (n.endsWith(".html") || n.endsWith(".htm")) return "text/html";
        if (n.endsWith(".css")) return "text/css";
        if (n.endsWith(".js") || n.endsWith(".mjs")) return "application/javascript";
        if (n.endsWith(".json")) return "application/json";
        if (n.endsWith(".webmanifest")) return "application/manifest+json";
        if (n.endsWith(".png")) return "image/png";
        if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
        if (n.endsWith(".svg")) return "image/svg+xml";
        if (n.endsWith(".woff2")) return "font/woff2";
        if (n.endsWith(".ico")) return "image/x-icon";
        return "application/octet-stream";
    }

    @Override
    public void onBackPressed() {
        // 顺序：先让网页把抽屉关掉；没有抽屉就直接退出应用。
        // 以前这里还会 w.goBack() —— 于是返回键只是退回上一个栏目（用户明确不要这个行为）。
        final WebView w = web;
        if (w == null) {
            super.onBackPressed();
            return;
        }
        if (backBusy) return;
        backBusy = true;
        w.evaluateJavascript(
                "(function(){try{return window.__androidBack&&window.__androidBack()?'1':'0'}catch(e){return '0'}})()",
                value -> {
                    backBusy = false;
                    // 网页处理掉了（关掉抽屉）就不再往下走
                    if (value != null && value.contains("1")) return;
                    finish();
                });
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
    }

    @Override
    protected void onPause() {
        if (web != null) web.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.loadUrl("about:blank");
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
