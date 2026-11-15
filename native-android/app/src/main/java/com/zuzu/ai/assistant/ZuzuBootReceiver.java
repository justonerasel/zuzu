package com.zuzu.ai.assistant;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

/**
 * Restarts ZuzuForegroundService automatically after device reboot or APK update.
 */
public class ZuzuBootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;

        String action = intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(action)
                || Intent.ACTION_LOCKED_BOOT_COMPLETED.equals(action)
                || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            SharedPreferences prefs = context.getSharedPreferences(
                    ZuzuForegroundService.PREFS_NAME,
                    Context.MODE_PRIVATE
            );
            boolean enabled = prefs.getBoolean(ZuzuForegroundService.KEY_SERVICE_ENABLED, false);
            if (enabled) {
                Intent serviceIntent = new Intent(context, ZuzuForegroundService.class);
                serviceIntent.putExtra(
                        ZuzuForegroundService.KEY_WAKE_WORD,
                        prefs.getString(ZuzuForegroundService.KEY_WAKE_WORD, "Wake up Zuzu")
                );
                try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        context.startForegroundService(serviceIntent);
                    } else {
                        context.startService(serviceIntent);
                    }
                } catch (Exception ignored) {}
            }
        }
    }
}
