package com.zuzu.ai.assistant;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.content.ContextCompat;

/**
 * Restores scheduled Zuzu AI reminders on reboot/update/time changes,
 * and safely restarts ZuzuForegroundService only on Android < 14 with RECORD_AUDIO granted.
 */
public class ZuzuBootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null || intent == null || intent.getAction() == null) return;

        String action = intent.getAction();
        boolean isBootOrPackage = Intent.ACTION_BOOT_COMPLETED.equals(action)
                || Intent.ACTION_LOCKED_BOOT_COMPLETED.equals(action)
                || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action);
        boolean isTimeShift = Intent.ACTION_TIME_CHANGED.equals(action)
                || Intent.ACTION_TIMEZONE_CHANGED.equals(action);

        if (isBootOrPackage || isTimeShift) {
            ZuzuReminderReceiver.rescheduleAllFromPrefs(context);
        }

        if (isBootOrPackage) {
            // Android 14+ (API 34+) prohibits starting FOREGROUND_SERVICE_TYPE_MICROPHONE from BOOT_COMPLETED
            if (Build.VERSION.SDK_INT >= 34) {
                return;
            }
            if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO)
                    != PackageManager.PERMISSION_GRANTED) {
                return;
            }
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
