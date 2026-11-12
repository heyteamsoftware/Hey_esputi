package org.duckdns.myappsserver.esputi;

import android.app.AlertDialog;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

// Actualización de la propia app: mira en el servidor si hay un APK más nuevo y, si el usuario
// acepta, lo descarga y se lo pasa al instalador de Android (que pide confirmar).
class Updater {
    static final String ACTION_STATUS = "org.duckdns.myappsserver.esputi.INSTALL_STATUS";
    private static final String BASE = MainActivity.HOME + "app/";

    private static InputStream open(String url) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(10_000);
        c.setReadTimeout(30_000);
        c.setUseCaches(false);
        if (c.getResponseCode() != 200) throw new Exception("HTTP " + c.getResponseCode());
        return c.getInputStream();
    }

    static void check(MainActivity a) {
        new Thread(() -> {
            try {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                try (InputStream in = open(BASE + "version.json?t=" + System.currentTimeMillis())) {
                    byte[] buf = new byte[4096];
                    for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
                }
                int latest = new JSONObject(out.toString("UTF-8")).getInt("versionCode");
                int mine = a.getPackageManager().getPackageInfo(a.getPackageName(), 0).versionCode;
                if (latest > mine) a.runOnUiThread(() -> ask(a));
            } catch (Exception e) { /* sin conexión o sin fichero: se mirará la próxima vez */ }
        }).start();
    }

    private static void ask(MainActivity a) {
        if (a.isFinishing() || a.isDestroyed()) return;
        new AlertDialog.Builder(a)
            .setTitle("Actualización de Esputi")
            .setMessage("Hay una versión nueva de la app. Se descarga en un momento y Android te pedirá confirmar la instalación.")
            .setPositiveButton("Actualizar", (d, w) -> download(a))
            .setNegativeButton("Ahora no", null)
            .show();
    }

    private static void download(MainActivity a) {
        Toast.makeText(a, "Descargando la actualización…", Toast.LENGTH_SHORT).show();
        new Thread(() -> {
            try {
                PackageInstaller pi = a.getPackageManager().getPackageInstaller();
                PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
                params.setAppPackageName(a.getPackageName());
                int id = pi.createSession(params);
                try (PackageInstaller.Session s = pi.openSession(id)) {
                    try (InputStream in = open(BASE + "esputi.apk?t=" + System.currentTimeMillis());
                         OutputStream os = s.openWrite("esputi", 0, -1)) {
                        byte[] buf = new byte[65536];
                        for (int n; (n = in.read(buf)) > 0; ) os.write(buf, 0, n);
                        s.fsync(os);
                    }
                    Intent back = new Intent(a, MainActivity.class).setAction(ACTION_STATUS);
                    PendingIntent done = PendingIntent.getActivity(a, id, back, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE);
                    s.commit(done.getIntentSender());
                }
            } catch (Exception e) {
                a.runOnUiThread(() -> Toast.makeText(a, "No se pudo descargar la actualización", Toast.LENGTH_LONG).show());
            }
        }).start();
    }

    // Respuesta del instalador: o pide la confirmación del usuario o informa del resultado
    static void onStatus(MainActivity a, Intent i) {
        int status = i.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            Intent confirm = i.getParcelableExtra(Intent.EXTRA_INTENT);
            if (confirm != null) a.startActivity(confirm);
        } else if (status != PackageInstaller.STATUS_SUCCESS && status != PackageInstaller.STATUS_FAILURE_ABORTED) {
            Toast.makeText(a, "No se pudo instalar la actualización", Toast.LENGTH_LONG).show();
        }
    }
}
