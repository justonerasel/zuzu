package com.zuzu.ai.assistant;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Capacitor Native Bridge for Zuzu AI.
 * Exposes real Android Foreground Service control, runtime permissions,
 * battery optimization exemptions, system intents, and package version info.
 */
@CapacitorPlugin(
        name = "ZuzuNative",
        permissions = {
                @Permission(strings = { Manifest.permission.RECORD_AUDIO }, alias = "microphone"),
                @Permission(strings = { Manifest.permission.CAMERA }, alias = "camera"),
                @Permission(strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }, alias = "location"),
                @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications")
        }
)
public class ZuzuNativeBridgePlugin extends Plugin {

    @PluginMethod
    public void startForegroundService(PluginCall call) {
        Context context = getContext();
        String wakeWord = call.getString("wakeWord", "Wake up Zuzu");

        Intent serviceIntent = new Intent(context, ZuzuForegroundService.class);
        serviceIntent.putExtra(ZuzuForegroundService.KEY_WAKE_WORD, wakeWord);

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent);
            } else {
                context.startService(serviceIntent);
            }
            JSObject ret = new JSObject();
            ret.put("started", true);
            ret.put("running", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to start foreground service: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stopForegroundService(PluginCall call) {
        Context context = getContext();
        Intent stopIntent = new Intent(context, ZuzuForegroundService.class);
        stopIntent.setAction(ZuzuForegroundService.ACTION_STOP_SERVICE);
        try {
            context.startService(stopIntent);
        } catch (Exception e) {
            context.stopService(new Intent(context, ZuzuForegroundService.class));
        }

        JSObject ret = new JSObject();
        ret.put("stopped", true);
        ret.put("running", false);
        call.resolve(ret);
    }

    @PluginMethod
    public void isForegroundServiceRunning(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("running", ZuzuForegroundService.isServiceRunning());
        call.resolve(ret);
    }

    @PluginMethod
    public void checkAllNativePermissions(PluginCall call) {
        Context ctx = getContext();
        JSObject res = new JSObject();

        res.put("microphone", hasPerm(ctx, Manifest.permission.RECORD_AUDIO) ? "granted" : "denied");
        res.put("bg_microphone", hasPerm(ctx, Manifest.permission.RECORD_AUDIO) ? "granted" : "denied");
        res.put("camera", hasPerm(ctx, Manifest.permission.CAMERA) ? "granted" : "denied");
        res.put("flashlight", hasPerm(ctx, Manifest.permission.CAMERA) ? "granted" : "denied");
        res.put("location", hasPerm(ctx, Manifest.permission.ACCESS_FINE_LOCATION) ? "granted" : "denied");
        res.put("contacts", hasPerm(ctx, Manifest.permission.READ_CONTACTS) ? "granted" : "denied");
        res.put("phone", hasPerm(ctx, Manifest.permission.CALL_PHONE) ? "granted" : "denied");

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            res.put("notifications", hasPerm(ctx, Manifest.permission.POST_NOTIFICATIONS) ? "granted" : "denied");
            res.put("photos_videos", hasPerm(ctx, Manifest.permission.READ_MEDIA_IMAGES) ? "granted" : "denied");
        } else {
            res.put("notifications", NotificationManagerCompat.from(ctx).areNotificationsEnabled() ? "granted" : "denied");
            res.put("photos_videos", hasPerm(ctx, Manifest.permission.READ_EXTERNAL_STORAGE) ? "granted" : "denied");
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            res.put("bluetooth", hasPerm(ctx, Manifest.permission.BLUETOOTH_CONNECT) ? "granted" : "denied");
        } else {
            res.put("bluetooth", "granted");
        }

        // Battery optimization exemption status
        boolean ignoringBattery = false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
            ignoringBattery = pm != null && pm.isIgnoringBatteryOptimizations(ctx.getPackageName());
        } else {
            ignoringBattery = true;
        }
        res.put("battery_opt", ignoringBattery ? "granted" : "system_required");

        // Display over other apps
        boolean canOverlay = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            canOverlay = Settings.canDrawOverlays(ctx);
        }
        res.put("overlay", canOverlay ? "granted" : "system_required");

        // Write system settings
        boolean canWriteSettings = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            canWriteSettings = Settings.System.canWrite(ctx);
        }
        res.put("write_settings", canWriteSettings ? "granted" : "system_required");

        call.resolve(res);
    }

    @PluginMethod
    public void requestCorePermissions(PluginCall call) {
        String alias = call.getString("alias", "all");
        if ("microphone".equals(alias)) {
            requestPermissionForAlias("microphone", call, "permCallback");
        } else if ("camera".equals(alias)) {
            requestPermissionForAlias("camera", call, "permCallback");
        } else if ("location".equals(alias)) {
            requestPermissionForAlias("location", call, "permCallback");
        } else if ("notifications".equals(alias)) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                requestPermissionForAlias("notifications", call, "permCallback");
            } else {
                JSObject ret = new JSObject();
                ret.put("granted", NotificationManagerCompat.from(getContext()).areNotificationsEnabled());
                call.resolve(ret);
            }
        } else {
            requestAllPermissions(call, "permCallback");
        }
    }

    @PermissionCallback
    private void permCallback(PluginCall call) {
        checkAllNativePermissions(call);
    }

    @PluginMethod
    public void openSystemSettings(PluginCall call) {
        String action = call.getString("action", "");
        Context ctx = getContext();
        String pkgUri = "package:" + ctx.getPackageName();

        try {
            Intent intent;
            if ("android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS".equals(action)
                    && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
                if (pm != null && !pm.isIgnoringBatteryOptimizations(ctx.getPackageName())) {
                    intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse(pkgUri));
                } else {
                    intent = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                }
            } else if ("android.settings.action.MANAGE_OVERLAY_PERMISSION".equals(action)
                    && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse(pkgUri));
            } else if ("android.settings.action.MANAGE_WRITE_SETTINGS".equals(action)
                    && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                intent = new Intent(Settings.ACTION_MANAGE_WRITE_SETTINGS, Uri.parse(pkgUri));
            } else if ("android.settings.ACCESSIBILITY_SETTINGS".equals(action)) {
                intent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
            } else if ("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS".equals(action)) {
                intent = new Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS");
            } else {
                intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse(pkgUri));
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(intent);
            JSObject ret = new JSObject();
            ret.put("opened", true);
            call.resolve(ret);
        } catch (Exception e) {
            try {
                Intent fallback = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse(pkgUri));
                fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(fallback);
                JSObject ret = new JSObject();
                ret.put("opened", true);
                call.resolve(ret);
            } catch (Exception ex) {
                call.reject("Could not open Android settings: " + ex.getMessage());
            }
        }
    }

    @PluginMethod
    public void getAppVersion(PluginCall call) {
        try {
            PackageInfo pInfo = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            JSObject ret = new JSObject();
            ret.put("versionName", pInfo.versionName);
            long code = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                    ? pInfo.getLongVersionCode()
                    : pInfo.versionCode;
            ret.put("versionCode", code);
            call.resolve(ret);
        } catch (Exception e) {
            JSObject ret = new JSObject();
            ret.put("versionName", "3.6.2");
            ret.put("versionCode", 362);
            call.resolve(ret);
        }
    }

    private boolean hasPerm(Context ctx, String permission) {
        return ContextCompat.checkSelfPermission(ctx, permission) == PackageManager.PERMISSION_GRANTED;
    }
}
