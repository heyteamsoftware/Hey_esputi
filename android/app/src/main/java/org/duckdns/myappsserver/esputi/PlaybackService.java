package org.duckdns.myappsserver.esputi;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.drawable.Icon;
import android.media.AudioManager;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

// Mantiene la app viva con la pantalla apagada y pone los mandos (con título y carátula)
// en la notificación y en la pantalla de bloqueo
public class PlaybackService extends Service {
    private static final String CHANNEL = "esputi";
    private static final String PREV = "prev", TOGGLE = "toggle", NEXT = "next", QUIT = "quit";
    private static final int IDLE_CHECKS = 10; // minutos en silencio antes de dejar dormir al móvil

    private static PlaybackService self;
    private static String title = "", artist = "", cover = "";
    private static boolean playing = false;
    private static String artUrl = "";
    private static Bitmap art;

    private PowerManager.WakeLock wake;
    private WifiManager.WifiLock wifi;
    private MediaSession session;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private int idle = 0;

    private final Runnable watch = new Runnable() {
        @Override public void run() {
            AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
            idle = am.isMusicActive() ? 0 : idle + 1;
            if (idle >= IDLE_CHECKS) release(); else handler.postDelayed(this, 60_000);
        }
    };

    // Lo que suena, tal como lo cuenta la web (se llama desde el hilo principal)
    static void update(String t, String a, String c, boolean p) {
        title = t == null ? "" : t; artist = a == null ? "" : a; cover = c == null ? "" : c; playing = p;
        if (self != null) self.refresh();
    }

    @Override public void onCreate() {
        super.onCreate();
        self = this;
        NotificationManager nm = getSystemService(NotificationManager.class);
        NotificationChannel ch = new NotificationChannel(CHANNEL, "Reproducción", NotificationManager.IMPORTANCE_LOW);
        ch.setShowBadge(false);
        nm.createNotificationChannel(ch);
        wake = ((PowerManager) getSystemService(Context.POWER_SERVICE)).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "esputi:play");
        wifi = ((WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE)).createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "esputi:play");

        session = new MediaSession(this, "Esputi");
        session.setCallback(new MediaSession.Callback() {
            @Override public void onPlay() { if (!playing) act(TOGGLE); }
            @Override public void onPause() { if (playing) act(TOGGLE); }
            @Override public void onSkipToNext() { act(NEXT); }
            @Override public void onSkipToPrevious() { act(PREV); }
            @Override public void onCustomAction(String action, Bundle extras) { act(action); }
        });
        session.setSessionActivity(PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE));
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (Build.VERSION.SDK_INT >= 29) startForeground(1, notification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        else startForeground(1, notification());
        if (MainActivity.current == null) { stopSelf(); return START_NOT_STICKY; }
        refresh();
        act(intent == null ? null : intent.getAction());
        return START_NOT_STICKY;
    }

    private void act(String action) {
        MainActivity a = MainActivity.current;
        if (a == null) return;
        if (QUIT.equals(action)) { a.quit(); return; }
        if (PREV.equals(action)) a.js("document.querySelector('[aria-label=\"Anterior\"]')?.click()");
        else if (TOGGLE.equals(action)) a.js("document.querySelector('.play-btn')?.click()");
        else if (NEXT.equals(action)) a.js("document.querySelector('[aria-label=\"Siguiente\"]')?.click()");
        // Cada vez que se abre la app o se toca un mando se vuelve a mantener despierto el móvil
        idle = 0;
        if (!wake.isHeld()) wake.acquire();
        if (!wifi.isHeld()) wifi.acquire();
        handler.removeCallbacks(watch);
        handler.postDelayed(watch, 60_000);
    }

    private void refresh() {
        if (!cover.equals(artUrl)) { artUrl = cover; art = null; if (!cover.isEmpty()) loadArt(cover); }
        MediaMetadata.Builder m = new MediaMetadata.Builder()
            .putString(MediaMetadata.METADATA_KEY_TITLE, title.isEmpty() ? "Esputi" : title)
            .putString(MediaMetadata.METADATA_KEY_ARTIST, artist);
        if (art != null) m.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, art);
        session.setMetadata(m.build());
        session.setPlaybackState(new PlaybackState.Builder()
            .setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE
                | PlaybackState.ACTION_SKIP_TO_NEXT | PlaybackState.ACTION_SKIP_TO_PREVIOUS)
            .addCustomAction(new PlaybackState.CustomAction.Builder(QUIT, "Cerrar", R.drawable.ic_close).build())
            .setState(playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED,
                PlaybackState.PLAYBACK_POSITION_UNKNOWN, playing ? 1f : 0f)
            .build());
        session.setActive(!title.isEmpty());
        getSystemService(NotificationManager.class).notify(1, notification());
    }

    private void loadArt(String url) {
        new Thread(() -> {
            try {
                HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                c.setConnectTimeout(8000); c.setReadTimeout(8000);
                Bitmap b;
                try (InputStream in = c.getInputStream()) { b = BitmapFactory.decodeStream(in); }
                handler.post(() -> { if (url.equals(artUrl) && b != null && self != null) { art = b; refresh(); } });
            } catch (Exception e) { /* sin carátula */ }
        }).start();
    }

    private PendingIntent tap(String action, int code) {
        Intent i = new Intent(this, PlaybackService.class).setAction(action);
        return PendingIntent.getService(this, code, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private Notification.Action button(int icon, String label, String action, int code) {
        return new Notification.Action.Builder(Icon.createWithResource(this, icon), label, tap(action, code)).build();
    }

    private Notification notification() {
        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = new Notification.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat)
            .setColor(0xFFFF4FA3)
            .setContentTitle(title.isEmpty() ? "Esputi" : title)
            .setContentText(title.isEmpty() ? "Elige una canción" : artist)
            .setContentIntent(open)
            .setOngoing(true)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .addAction(button(R.drawable.ic_prev, "Anterior", PREV, 1))
            .addAction(button(playing ? R.drawable.ic_pause : R.drawable.ic_play, playing ? "Pausar" : "Reproducir", TOGGLE, 2))
            .addAction(button(R.drawable.ic_next, "Siguiente", NEXT, 3))
            .addAction(button(R.drawable.ic_close, "Cerrar", QUIT, 4))
            .setStyle(new Notification.MediaStyle().setMediaSession(session.getSessionToken()).setShowActionsInCompactView(0, 1, 2));
        if (art != null) b.setLargeIcon(art);
        return b.build();
    }

    private void release() {
        if (wake.isHeld()) wake.release();
        if (wifi.isHeld()) wifi.release();
    }

    // Si se quita la app de recientes se para todo
    @Override public void onTaskRemoved(Intent rootIntent) {
        MainActivity a = MainActivity.current;
        if (a != null) a.quit(); else stopSelf();
    }

    @Override public void onDestroy() {
        self = null;
        handler.removeCallbacks(watch);
        release();
        session.release();
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }
}
