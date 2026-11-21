package com.zuzu.ai.assistant;

import android.Manifest;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.WebSettings;

import androidx.core.content.ContextCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ZuzuNativeBridgePlugin.class);
        super.onCreate(savedInstanceState);

        Window window = getWindow();
        WindowCompat.setDecorFitsSystemWindows(window, false);
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams lp = window.getAttributes();
            lp.layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            window.setAttributes(lp);
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.setStatusBarContrastEnforced(false);
            window.setNavigationBarContrastEnforced(false);
        }

        WindowInsetsControllerCompat insetsController =
                WindowCompat.getInsetsController(window, window.getDecorView());
        if (insetsController != null) {
            insetsController.setAppearanceLightStatusBars(true);
            insetsController.setAppearanceLightNavigationBars(true);
        }

        configureBridgeWebView();
    }

    private void configureBridgeWebView() {
        if (this.bridge == null || this.bridge.getWebView() == null) {
            return;
        }

        WebSettings webSettings = this.bridge.getWebView().getSettings();
        webSettings.setMediaPlaybackRequiresUserGesture(false);
        webSettings.setGeolocationEnabled(true);

        this.bridge.getWebView().setWebChromeClient(new BridgeWebChromeClient(this.bridge) {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> {
                    if (request == null) return;
                    String[] requested = request.getResources();
                    List<String> grantedResources = new ArrayList<>();

                    for (String res : requested) {
                        if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(res)
                                && ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.RECORD_AUDIO)
                                == PackageManager.PERMISSION_GRANTED) {
                            grantedResources.add(res);
                        } else if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(res)
                                && ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.CAMERA)
                                == PackageManager.PERMISSION_GRANTED) {
                            grantedResources.add(res);
                        }
                    }

                    if (!grantedResources.isEmpty()) {
                        request.grant(grantedResources.toArray(new String[0]));
                    } else {
                        super.onPermissionRequest(request);
                    }
                });
            }

            @Override
            public void onGeolocationPermissionsShowPrompt(
                    final String origin,
                    final GeolocationPermissions.Callback callback
            ) {
                boolean hasLocation =
                        ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.ACCESS_FINE_LOCATION)
                                == PackageManager.PERMISSION_GRANTED
                                || ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.ACCESS_COARSE_LOCATION)
                                == PackageManager.PERMISSION_GRANTED;

                if (hasLocation && callback != null) {
                    callback.invoke(origin, true, false);
                } else {
                    super.onGeolocationPermissionsShowPrompt(origin, callback);
                }
            }
        });
    }
}
