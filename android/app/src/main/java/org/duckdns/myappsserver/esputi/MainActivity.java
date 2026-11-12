package org.duckdns.myappsserver.esputi;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

// Esputi dentro de una app: la misma web, pero la página nunca se da por oculta,
// así la música sigue sonando con la pantalla apagada.
public class MainActivity extends Activity {
    static final String HOME = "https://myappsserver.duckdns.org/esputi/";
    private static final String OFFLINE =
        "<html><body style='background:#121212;color:#fff;font-family:sans-serif;text-align:center;padding-top:40vh'>"
        + "<p>No hay conexi&oacute;n con Esputi</p>"
        + "<p><a style='color:#ff4fa3' href='" + HOME + "'>Reintentar</a></p></body></html>";

    // Cada segundo mira en la web qué suena (título, artista, carátula, si está en marcha) y avisa
    // a la app cuando cambia, para la notificación y la pantalla de bloqueo
    private static final String WATCH =
        "(function(){if(window.__esputiApp)return;window.__esputiApp=1;var last='';setInterval(function(){"
        + "var m=navigator.mediaSession&&navigator.mediaSession.metadata,b=document.querySelector('.play-btn');"
        + "var s=[m?m.title:'',m?m.artist:'',m&&m.artwork&&m.artwork[0]?m.artwork[0].src:'',!!b&&b.getAttribute('aria-label')==='Pausar'];"
        + "var k=JSON.stringify(s);if(k!==last){last=k;EsputiApp.state(s[0],s[1],s[2],s[3]);}},1000);})();";

    static MainActivity current;
    private WebView web;

    class Bridge {
        @JavascriptInterface public void state(String title, String artist, String cover, boolean playing) {
            runOnUiThread(() -> PlaybackService.update(title, artist, cover, playing));
        }
    }

    // La vista web siempre se considera visible: el reproductor no se pausa al apagar la pantalla
    static class AlwaysVisibleWebView extends WebView {
        AlwaysVisibleWebView(Context c) { super(c); }
        @Override protected void onWindowVisibilityChanged(int visibility) {
            super.onWindowVisibilityChanged(View.VISIBLE);
        }
    }

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        current = this;
        web = new AlwaysVisibleWebView(this);
        web.setBackgroundColor(Color.parseColor("#121212"));
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportMultipleWindows(false);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);

        web.addJavascriptInterface(new Bridge(), "EsputiApp");
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                String host = u.getHost() == null ? "" : u.getHost();
                // Dentro de la app: Esputi y el inicio de sesión de Spotify. El resto, al navegador
                if (host.equals("myappsserver.duckdns.org") || host.equals("accounts.spotify.com")) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception e) { /* sin navegador */ }
                return true;
            }
            @Override public void onPageFinished(WebView v, String url) {
                if (url != null && url.startsWith(HOME)) v.evaluateJavascript(WATCH, null);
            }
            @Override public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
                if (r.isForMainFrame()) v.loadDataWithBaseURL(null, OFFLINE, "text/html", "utf-8", null);
            }
        });

        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
            requestPermissions(new String[] { Manifest.permission.POST_NOTIFICATIONS }, 1);

        if (state == null) web.loadUrl(HOME); else web.restoreState(state);
        Updater.check(this);
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (Updater.ACTION_STATUS.equals(intent.getAction())) Updater.onStatus(this, intent);
    }

    @Override protected void onStart() {
        super.onStart();
        startForegroundService(new Intent(this, PlaybackService.class));
    }

    @Override protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    // Atrás navega dentro de Esputi; en la portada deja la app de fondo sin cortar la música
    @Override public void onBackPressed() {
        if (web.canGoBack()) web.goBack(); else moveTaskToBack(true);
    }

    void js(String code) { web.evaluateJavascript(code, null); }

    void quit() {
        stopService(new Intent(this, PlaybackService.class));
        finishAndRemoveTask();
    }

    @Override protected void onDestroy() {
        if (current == this) current = null;
        stopService(new Intent(this, PlaybackService.class));
        web.destroy();
        super.onDestroy();
    }
}
