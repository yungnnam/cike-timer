package cn.cike.timer;

import android.app.Notification;
import android.os.SystemClock;
import android.view.View;
import android.widget.RemoteViews;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.graphics.Color;
import android.os.Build;
import android.os.IBinder;

/**
 * 正在计时的常驻通知。
 *
 * 为什么需要它：手机上切到别的应用之后，网页的那条计时记录还在（时间戳存在 IndexedDB 里），
 * 但你看不到它。这个前台服务把「哪个类型、从几点开始」放在通知栏上一直挂着：
 *  - 计时中：用 setUsesChronometer(true)，秒数是系统自己跳的，不需要每秒唤醒应用；
 *  - 暂停中：改成静态文字「已暂停 · 1时05分」，因为计时器停住了，跳动会误导；
 *  - 点通知回到应用。
 */
public class TimerService extends Service {
    public static final String CHANNEL = "cike_timer";
    private static final int NOTIF_ID = 7301;

    // 最后一次推送的内容（被系统重启时用它把通知补回来）
    private String lastTitle;
    private String lastNote;
    private long lastStart;
    private boolean lastPaused;
    private long lastElapsed;
    private String lastColor;

    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_NOTE = "note";
    public static final String EXTRA_START = "start";
    public static final String EXTRA_PAUSED = "paused";
    public static final String EXTRA_ELAPSED = "elapsed";
    public static final String EXTRA_COLOR = "color";
    public static final String EXTRA_STOP = "stop";

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            // 系统把服务重启了（START_STICKY）：用上次记下的内容把通知补回去
            if (lastTitle == null || lastTitle.isEmpty()) {
                stopSelf();
                return START_NOT_STICKY;
            }
            ensureChannel();
            startForeground(NOTIF_ID, build(lastTitle, lastNote, lastStart,
                    lastPaused, lastElapsed, lastColor));
            return START_STICKY;
        }
        if (intent.getBooleanExtra(EXTRA_STOP, false)) {
            stop();
            return START_NOT_STICKY;
        }

        String title = intent.getStringExtra(EXTRA_TITLE);
        String note = intent.getStringExtra(EXTRA_NOTE);
        long start = intent.getLongExtra(EXTRA_START, System.currentTimeMillis());
        boolean paused = intent.getBooleanExtra(EXTRA_PAUSED, false);
        long elapsed = intent.getLongExtra(EXTRA_ELAPSED, 0L);
        String color = intent.getStringExtra(EXTRA_COLOR);

        if (title == null || title.isEmpty()) {
            stop();
            return START_NOT_STICKY;
        }

        // 记住最后一次内容：被系统杀掉重启（START_STICKY）时还能把通知重新挂上
        lastTitle = title;
        lastNote = note;
        lastStart = start;
        lastPaused = paused;
        lastElapsed = elapsed;
        lastColor = color;

        ensureChannel();
        Notification n = build(title, note, start, paused, elapsed, color);
        startForeground(NOTIF_ID, n);
        // 计时还在继续 → 别让系统在内存紧张时把它带走
        return START_STICKY;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        super.onTaskRemoved(rootIntent);
        // 用户把应用从最近任务里划掉了，但计时还在跑：
        // 通知要留着，不然锁屏上就什么都看不见了。
        if (lastTitle != null && !lastTitle.isEmpty()) {
            try {
                startForeground(NOTIF_ID, build(lastTitle, lastNote, lastStart,
                        lastPaused, lastElapsed, lastColor));
            } catch (Throwable ignored) {
            }
        }
    }

    private void stop() {
        try {
            if (Build.VERSION.SDK_INT >= 24) {
                stopForeground(STOP_FOREGROUND_REMOVE);
            } else {
                stopForeground(true);
            }
        } catch (Throwable ignored) {
        }
        stopSelf();
    }

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (nm.getNotificationChannel(CHANNEL) != null) return;
        NotificationChannel ch = new NotificationChannel(
                CHANNEL, getString(R.string.notif_channel), NotificationManager.IMPORTANCE_DEFAULT);
        ch.setDescription(getString(R.string.notif_channel_desc));
        ch.setShowBadge(false);
        ch.enableVibration(false);
        ch.setSound(null, null);
        // 锁屏上直接显示内容（以后用户在系统设置里改成「隐藏敏感内容」也尊重他的选择）
        ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(ch);
    }

    private Notification build(String title, String note, long start,
                               boolean paused, long elapsed, String color) {
        Intent open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = Build.VERSION.SDK_INT >= 23
                ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                : PendingIntent.FLAG_UPDATE_CURRENT;
        PendingIntent pi = PendingIntent.getActivity(this, 1, open, flags);

        Notification.Builder b = Build.VERSION.SDK_INT >= 26
                ? new Notification.Builder(this, CHANNEL)
                : new Notification.Builder(this);

        String text = paused ? getString(R.string.notif_paused) : getString(R.string.notif_recording);

        // 两个排版：折叠态只有一行（类型 + 时间），展开态三行（多一行副标题）。
        // 之前只用一份竖排三行：折叠态系统只给 64dp 左右，第三行会被裁掉。
        RemoteViews small = makeViews(R.layout.notif_timer, title, paused, elapsed, false, null);
        RemoteViews big = makeViews(R.layout.notif_timer_big, title, paused, elapsed, true, note);

        b.setSmallIcon(R.drawable.ic_stat_timer)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setLocalOnly(true)
                .setContentTitle(title)
                .setContentText(text)
                .setContentIntent(pi)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setCategory(Notification.CATEGORY_STOPWATCH)
                .setWhen(start)
                .setShowWhen(false)
                .setStyle(new Notification.DecoratedCustomViewStyle())
                .setCustomContentView(small);
        if (Build.VERSION.SDK_INT >= 24) {
            b.setCustomBigContentView(big);
        }

        if (color != null && !color.isEmpty()) {
            try {
                b.setColor(Color.parseColor(color));
            } catch (Throwable ignored) {
            }
        }
        return b.build();
    }

    /**
     * 按状态填一份 RemoteViews。
     * withNote=false 的布局里没有 nt_note（折叠态），所以只在 withNote 时才碰它。
     */
    private RemoteViews makeViews(int layout, String title,
                                  boolean paused, long elapsed,
                                  boolean withNote, String note) {
        RemoteViews rv = new RemoteViews(getPackageName(), layout);
        rv.setTextViewText(R.id.nt_type, title == null ? "" : title);

        if (paused) {
            rv.setViewVisibility(R.id.nt_clock, View.GONE);
            rv.setViewVisibility(R.id.nt_clock_static, View.VISIBLE);
            rv.setTextViewText(R.id.nt_clock_static, cn(elapsed));
        } else {
            rv.setViewVisibility(R.id.nt_clock, View.VISIBLE);
            rv.setViewVisibility(R.id.nt_clock_static, View.GONE);
            // 系统自己跳秒：只给一个基准点，不靠 App 每秒更新
            long base = SystemClock.elapsedRealtime() - Math.max(0, elapsed);
            rv.setChronometer(R.id.nt_clock, base, null, true);
        }

        if (withNote) {
            boolean hasNote = note != null && !note.isEmpty();
            rv.setViewVisibility(R.id.nt_note, hasNote ? View.VISIBLE : View.GONE);
            if (hasNote) rv.setTextViewText(R.id.nt_note, note);
        }
        return rv;
    }

    /** 1 小时 05 分 / 1h 05m —— 用资源里的格式，跟随系统语言 */
    private String cn(long ms) {
        long sec = Math.max(0, ms) / 1000;
        long h = sec / 3600;
        long m = (sec % 3600) / 60;
        if (h > 0) return getString(R.string.dur_hm, h, m);
        return getString(R.string.dur_m, m);
    }
}
