package com.zuzu.ai.assistant;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

/**
 * Persistent Silent Android Foreground Service for Zuzu AI.
 * Keeps background Wake-Word listening alive across Android 9 - Android 16
 * with IMPORTANCE_MIN, zero sound, zero vibration, and Android 14+ microphone FGS safety.
 */
public class ZuzuForegroundService extends Service {
    public static final String CHANNEL_ID = "zuzu_ai_silent_guard_v3";
    private static final String LEGACY_CHANNEL_V1 = "zuzu_ai_foreground_channel";
    private static final String LEGACY_CHANNEL_V2 = "zuzu_ai_silent_bg_v2";
    public static final int NOTIFICATION_ID = 36101;
    public static final String PREFS_NAME = "ZuzuNativePrefs";
    public static final String KEY_SERVICE_ENABLED = "foreground_enabled";
    public static final String KEY_WAKE_WORD = "wake_word_phrase";
    public static final String ACTION_STOP_SERVICE = "com.zuzu.ai.assistant.ACTION_STOP_SERVICE";

    private static volatile boolean isRunning = false;
    private String activeWakeWord = null;
    private PowerManager.WakeLock wakeLock;

    public static boolean isServiceRunning() {
        return isRunning;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        createSilentNotificationChannel();
        acquireWakeLock();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP_SERVICE.equals(intent.getAction())) {
            saveEnabledPref(false);
            activeWakeWord = null;
            stopForegroundCompat();
            stopSelf();
            return START_NOT_STICKY;
        }

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            isRunning = false;
            saveEnabledPref(false);
            stopSelf();
            return START_NOT_STICKY;
        }

        String wakeWord = "Wake up Zuzu";
        if (intent != null && intent.hasExtra(KEY_WAKE_WORD)) {
            String extra = intent.getStringExtra(KEY_WAKE_WORD);
            if (extra != null && !extra.trim().isEmpty()) {
                wakeWord = extra.trim();
            }
        } else {
            SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
            wakeWord = prefs.getString(KEY_WAKE_WORD, "Wake up Zuzu");
        }

        if (isRunning && wakeWord.equals(activeWakeWord)) {
            return START_STICKY;
        }

        createSilentNotificationChannel();
        Notification notification = buildSilentNotification(wakeWord);

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(
                        NOTIFICATION_ID,
                        notification,
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
                );
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
        } catch (SecurityException | IllegalStateException e) {
            isRunning = false;
            activeWakeWord = null;
            saveEnabledPref(false);
            stopSelf();
            return START_NOT_STICKY;
        } catch (Exception e) {
            if (Build.VERSION.SDK_INT >= 34) {
                isRunning = false;
                activeWakeWord = null;
                saveEnabledPref(false);
                stopSelf();
                return START_NOT_STICKY;
            }
            try {
                startForeground(NOTIFICATION_ID, notification);
            } catch (Exception ignored) {
                isRunning = false;
                activeWakeWord = null;
                saveEnabledPref(false);
                stopSelf();
                return START_NOT_STICKY;
            }
        }

        saveEnabledPref(true);
        getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                .edit()
                .putString(KEY_WAKE_WORD, wakeWord)
                .apply();
        activeWakeWord = wakeWord;
        isRunning = true;
        return START_STICKY;
    }

    private void saveEnabledPref(boolean enabled) {
        getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                .edit()
                .putBoolean(KEY_SERVICE_ENABLED, enabled)
                .apply();
    }

    private Notification buildSilentNotification(String wakeWord) {
        Intent launchIntent = new Intent(this, MainActivity.class);
        launchIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);

        int pendingFlags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                : PendingIntent.FLAG_UPDATE_CURRENT;

        PendingIntent contentIntent = PendingIntent.getActivity(this, 0, launchIntent, pendingFlags);

        Intent stopIntent = new Intent(this, ZuzuForegroundService.class);
        stopIntent.setAction(ACTION_STOP_SERVICE);
        PendingIntent stopPendingIntent = PendingIntent.getService(this, 1, stopIntent, pendingFlags);

        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("Zuzu AI Assistant")
                .setContentText("Silent mode • Ready for \"" + wakeWord + "\"")
                .setSmallIcon(android.R.drawable.ic_btn_speak_now)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setSilent(true)
                .setSound(null)
                .setVibrate(null)
                .setDefaults(0)
                .setPriority(NotificationCompat.PRIORITY_MIN)
                .setVisibility(NotificationCompat.VISIBILITY_SECRET)
                .setCategory(NotificationCompat.CATEGORY_SERVICE)
                .setContentIntent(contentIntent)
                .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Pause", stopPendingIntent)
                .build();
    }

    private void createSilentNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager == null) return;

            // Delete older channels so Android never keeps old alert sound/vibration caches
            try {
                if (manager.getNotificationChannel(LEGACY_CHANNEL_V1) != null) {
                    manager.deleteNotificationChannel(LEGACY_CHANNEL_V1);
                }
                if (manager.getNotificationChannel(LEGACY_CHANNEL_V2) != null) {
                    manager.deleteNotificationChannel(LEGACY_CHANNEL_V2);
                }
            } catch (Exception ignored) {}

            NotificationChannel existing = manager.getNotificationChannel(CHANNEL_ID);
            if (existing == null) {
                NotificationChannel channel = new NotificationChannel(
                        CHANNEL_ID,
                        "Zuzu AI Background Assistant (Silent)",
                        NotificationManager.IMPORTANCE_MIN
                );
                channel.setDescription("100% silent background listener for Zuzu AI wake-word.");
                channel.setSound(null, null);
                channel.enableVibration(false);
                channel.setVibrationPattern(null);
                channel.enableLights(false);
                channel.setShowBadge(false);
                channel.setLockscreenVisibility(Notification.VISIBILITY_SECRET);
                manager.createNotificationChannel(channel);
            }
        }
    }

    private void acquireWakeLock() {
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null && wakeLock == null) {
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "ZuzuAI::BackgroundWakeLock");
                wakeLock.setReferenceCounted(false);
                wakeLock.acquire();
            }
        } catch (Exception ignored) {}
    }

    private void releaseWakeLock() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) {
                wakeLock.release();
            }
        } catch (Exception ignored) {}
        wakeLock = null;
    }

    private void stopForegroundCompat() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE);
        } else {
            stopForeground(true);
        }
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        if (Build.VERSION.SDK_INT < 34
                && ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                == PackageManager.PERMISSION_GRANTED) {
            SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
            if (prefs.getBoolean(KEY_SERVICE_ENABLED, false)) {
                Intent restartIntent = new Intent(getApplicationContext(), ZuzuForegroundService.class);
                restartIntent.putExtra(KEY_WAKE_WORD, prefs.getString(KEY_WAKE_WORD, "Wake up Zuzu"));
                try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        getApplicationContext().startForegroundService(restartIntent);
                    } else {
                        getApplicationContext().startService(restartIntent);
                    }
                } catch (Exception ignored) {}
            }
        }
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        isRunning = false;
        activeWakeWord = null;
        releaseWakeLock();
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
