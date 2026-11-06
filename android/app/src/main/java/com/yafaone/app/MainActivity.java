package com.yafaone.app;

import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (bridge != null && bridge.getWebView() != null) {
            WebView webView = bridge.getWebView();
            WebSettings settings = webView.getSettings();

            // Enable rich web app storage & script capabilities
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);
            settings.setAllowFileAccess(true);
            settings.setSupportMultipleWindows(false);
            settings.setJavaScriptCanOpenWindowsAutomatically(true);

            // Install custom WebViewClient to prevent delegating app URLs to external Chrome
            webView.setWebViewClient(new BridgeWebViewClient(bridge) {
                @Override
                public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    if (request != null && isInternalAppUrl(request.getUrl())) {
                        return false; // Force navigation to stay inside this native WebView
                    }
                    return super.shouldOverrideUrlLoading(view, request);
                }

                @Override
                public boolean shouldOverrideUrlLoading(WebView view, String urlStr) {
                    if (urlStr != null && isInternalAppUrl(Uri.parse(urlStr))) {
                        return false; // Force navigation to stay inside this native WebView
                    }
                    return super.shouldOverrideUrlLoading(view, urlStr);
                }

                private boolean isInternalAppUrl(Uri url) {
                    if (url == null) return false;
                    String scheme = url.getScheme();
                    if (scheme == null) return false;
                    scheme = scheme.toLowerCase();
                    if (!scheme.equals("http") && !scheme.equals("https")) {
                        return false;
                    }

                    String host = url.getHost();
                    if (host == null) return false;
                    host = host.toLowerCase();

                    // Keep app cloud endpoints, preview URLs, auth providers, and local origins in WebView
                    return host.endsWith(".run.app") ||
                           host.contains("yafa") ||
                           host.contains("google.com") ||
                           host.contains("googleapis.com") ||
                           host.contains("firebaseapp.com") ||
                           host.contains("web.app") ||
                           host.equals("localhost");
                }
            });
        }
    }
}
