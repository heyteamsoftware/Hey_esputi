package org.duckdns.myappsserver.esputi;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.drawable.Icon;
import android.media.AudioManager;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;

// Mantiene la app viva con la pantalla apagada y pone los mandos en la notificación
public class PlaybackService extends Service {
    private static final String CHANNEL = "esputi";
    private static final String PREV = "prev", TOGGLE = "toggle", NEXT = "next", QUIT = "quit";
    private static final int IDLE_CHECKS = 10; // minutos en silencio antes de dejar dormir al móvil

    private PowerManager.WakeLock wake;
    private WifiManager.WifiLock wifi;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private int idle = 0;

    private final Runnable watch = new Runnable() {
        @Override public void run() {
            AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
            idle = am.isMusicActive() ? 0 : idle + 1;
            if (idle >= IDLE_CHECKS) release(); else handler.postDelayed(this, 60_000);
        }
    };

    @Override public void onCreate() {
        super.onCreate();
        NotificationManager nm = getSystemService(NotificationManager.class);
        NotificationChannel ch = new NotificationChannel(CHANNEL, "Reproducción", NotificationManager.IMPORTANCE_LOW);
        ch.setShowBadge(false);
        nm.createNotificationChannel(ch);
        wake = ((PowerManager) getSystemService(Context.POWER_SERVICE)).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "esputi:play");
        wifi = ((WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE)).createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "esputi:play");
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (Build.VERSION.SDK_INT >= 29) startForeground(1, notification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        else startForeground(1, notification());

        String action = intent == null ? null : intent.getAction();
        MainActivity a = MainActivity.current;
        if (a == null) { stopSelf(); return START_NOT_STICKY; }
        if (QUIT.equals(action)) { a.quit(); return START_NOT_STICKY; }
        if (PREV.equals(action)) a.js("document.querySelector('[aria-label=\"Anterior\"]')?.click()");
        else if (TOGGLE.equals(action)) a.js("document.querySelector('.play-btn')?.click()");
        else if (NEXT.equals(action)) a.js("document.querySelector('[aria-label=\"Siguiente\"]')?.click()");

        // Cada vez que se abre la app o se toca un mando se vuelve a mantener despierto el móvil
        idle = 0;
        if (!wake.isHeld()) wake.acquire();
        if (!wifi.isHeld()) wifi.acquire();
        handler.removeCallbacks(watch);
        handler.postDelayed(watch, 60_000);
        return START_NOT_STICKY;
    }

    private PendingIntent tap(String action, int code) {
        Intent i = new Intent(this, PlaybackService.class).setAction(action);
        return PendingIntent.getService(this, code, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private Notification.Action button(int icon, String title, String action, int code) {
        return new Notification.Action.Builder(Icon.createWithResource(this, icon), title, tap(action, code)).build();
    }

    private Notification notification() {
        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE);
        return new Notification.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat)
            .setColor(0xFFFF4FA3)
            .setContentTitle("Esputi")
            .setContentText("La música sigue con la pantalla apagada")
            .setContentIntent(open)
            .setOngoing(true)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .addAction(button(R.drawable.ic_prev, "Anterior", PREV, 1))
            .addAction(button(R.drawable.ic_playpause, "Play/Pausa", TOGGLE, 2))
            .addAction(button(R.drawable.ic_next, "Siguiente", NEXT, 3))
            .addAction(button(R.drawable.ic_close, "Cerrar", QUIT, 4))
            .setStyle(new Notification.MediaStyle().setShowActionsInCompactView(1, 2, 3))
            .build();
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
        handler.removeCallbacks(watch);
        release();
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }
}
