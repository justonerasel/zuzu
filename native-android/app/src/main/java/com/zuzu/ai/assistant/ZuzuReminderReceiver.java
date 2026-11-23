package com.zuzu.ai.assistant;

import android.Manifest;
import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Calendar;

/**
 * Real Android AlarmManager-backed Reminder Receiver for Zuzu AI.
 * Persists scheduled alarms in SharedPreferences so they survive process kill,
 * device reboot, app update, and system time/timezone adjustments.
 */
public class ZuzuReminderReceiver extends BroadcastReceiver {

    public static final String CHANNEL_ID = "zuzu_ai_reminders_v1";
    public static final String PREFS_NAME = "ZuzuReminderPrefs";
    public static final String KEY_ALARMS_JSON = "alarms_json";

    public static final String EXTRA_ID = "reminder_id";
    public static final String EXTRA_TITLE = "reminder_title";
    public static final String EXTRA_BODY = "reminder_body";
    public static final String EXTRA_RECURRENCE = "reminder_recurrence";
    public static final String EXTRA_RECURRENCE_WEEKDAY = "reminder_recurrence_weekday";
    public static final String EXTRA_TRIGGER_AT = "reminder_trigger_at";

    private static final long ONE_DAY_MS = 86_400_000L;
    private static final long ONE_WEEK_MS = 7L * ONE_DAY_MS;

    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null || intent == null) return;

        String id = intent.getStringExtra(EXTRA_ID);
        String title = intent.getStringExtra(EXTRA_TITLE);
        String body = intent.getStringExtra(EXTRA_BODY);
        String recurrence = intent.getStringExtra(EXTRA_RECURRENCE);
        int recurrenceWeekday = intent.getIntExtra(EXTRA_RECURRENCE_WEEKDAY, -1);
        long triggerAtMs = intent.getLongExtra(EXTRA_TRIGGER_AT, System.currentTimeMillis());

        if (id == null || id.trim().isEmpty()) {
            id = "rem-" + System.currentTimeMillis();
        }
        if (title == null || title.trim().isEmpty()) {
            title = "Zuzu AI Reminder";
        }
        if (body == null || body.trim().isEmpty()) {
            body = "You have a scheduled reminder.";
        }
        if (recurrence == null || recurrence.trim().isEmpty()) {
            recurrence = "none";
        }

        postReminderNotification(context, id, title, body);

        if ("daily".equalsIgnoreCase(recurrence)
                || "weekly".equalsIgnoreCase(recurrence)
                || "weekday".equalsIgnoreCase(recurrence)) {
            long nextTrigger = computeNextOccurrence(triggerAtMs, recurrence.toLowerCase(), recurrenceWeekday, System.currentTimeMillis() + 5000L);
            scheduleAlarm(context, id, title, body, nextTrigger, recurrence.toLowerCase(), recurrenceWeekday);
        } else {
            removeStoredAlarm(context, id);
        }
    }

    public static long computeNextOccurrence(long fromMs, String recurrence, int recurrenceWeekday, long minAllowedMs) {
        if ("daily".equalsIgnoreCase(recurrence)) {
            long candidate = fromMs + ONE_DAY_MS;
            while (candidate <= minAllowedMs) {
                candidate += ONE_DAY_MS;
            }
            return candidate;
        }
        if ("weekly".equalsIgnoreCase(recurrence)) {
            Calendar cal = Calendar.getInstance();
            cal.setTimeInMillis(fromMs);
            if (recurrenceWeekday >= 0 && recurrenceWeekday <= 6) {
                int targetCalDay = recurrenceWeekday + 1; // JS 0=Sun..6=Sat -> Calendar.SUNDAY(1)..SATURDAY(7)
                cal.add(Calendar.DAY_OF_YEAR, 7);
                int diff = (targetCalDay - cal.get(Calendar.DAY_OF_WEEK) + 7) % 7;
                if (diff > 0) {
                    cal.add(Calendar.DAY_OF_YEAR, diff);
                }
            } else {
                cal.add(Calendar.DAY_OF_YEAR, 7);
            }
            while (cal.getTimeInMillis() <= minAllowedMs) {
                cal.add(Calendar.DAY_OF_YEAR, 7);
            }
            return cal.getTimeInMillis();
        }
        if ("weekday".equalsIgnoreCase(recurrence)) {
            Calendar cal = Calendar.getInstance();
            cal.setTimeInMillis(fromMs);
            do {
                cal.add(Calendar.DAY_OF_YEAR, 1);
            } while (cal.get(Calendar.DAY_OF_WEEK) == Calendar.SATURDAY
                    || cal.get(Calendar.DAY_OF_WEEK) == Calendar.SUNDAY
                    || cal.getTimeInMillis() <= minAllowedMs);
            return cal.getTimeInMillis();
        }
        return fromMs;
    }

    public static void ensureChannel(Context ctx) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null && manager.getNotificationChannel(CHANNEL_ID) == null) {
                NotificationChannel ch = new NotificationChannel(
                        CHANNEL_ID,
                        "Zuzu AI Reminders",
                        NotificationManager.IMPORTANCE_HIGH
                );
                ch.setDescription("Scheduled reminder notifications from Zuzu AI");
                manager.createNotificationChannel(ch);
            }
        }
    }

    public static boolean canScheduleExact(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            return true;
        }
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        return am != null && am.canScheduleExactAlarms();
    }

    private static PendingIntent buildAlarmPendingIntent(
            Context ctx,
            String id,
            String title,
            String body,
            long triggerAtMs,
            String recurrence,
            int recurrenceWeekday
    ) {
        Intent intent = new Intent(ctx, ZuzuReminderReceiver.class);
        intent.putExtra(EXTRA_ID, id);
        intent.putExtra(EXTRA_TITLE, title);
        intent.putExtra(EXTRA_BODY, body);
        intent.putExtra(EXTRA_TRIGGER_AT, triggerAtMs);
        intent.putExtra(EXTRA_RECURRENCE, recurrence != null ? recurrence : "none");
        intent.putExtra(EXTRA_RECURRENCE_WEEKDAY, recurrenceWeekday);

        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                : PendingIntent.FLAG_UPDATE_CURRENT;
        return PendingIntent.getBroadcast(ctx, id.hashCode(), intent, flags);
    }

    public static void scheduleAlarm(
            Context ctx,
            String id,
            String title,
            String body,
            long triggerAtMs,
            String recurrence
    ) {
        scheduleAlarm(ctx, id, title, body, triggerAtMs, recurrence, -1);
    }

    public static void scheduleAlarm(
            Context ctx,
            String id,
            String title,
            String body,
            long triggerAtMs,
            String recurrence,
            int recurrenceWeekday
    ) {
        if (ctx == null || id == null || id.trim().isEmpty()) return;
        String cleanRecurrence = (recurrence == null || recurrence.trim().isEmpty()) ? "none" : recurrence.trim().toLowerCase();
        String cleanTitle = (title == null || title.trim().isEmpty()) ? "Zuzu AI Reminder" : title.trim();
        String cleanBody = (body == null || body.trim().isEmpty()) ? "Scheduled reminder" : body.trim();

        ensureChannel(ctx);

        long now = System.currentTimeMillis();
        long effectiveTrigger = triggerAtMs;
        if ("daily".equals(cleanRecurrence) || "weekly".equals(cleanRecurrence) || "weekday".equals(cleanRecurrence)) {
            if (effectiveTrigger < now - 30_000L) {
                effectiveTrigger = computeNextOccurrence(effectiveTrigger, cleanRecurrence, recurrenceWeekday, now - 30_000L);
            }
        } else if (effectiveTrigger < now - 60_000L) {
            removeStoredAlarm(ctx, id);
            return;
        }

        long alarmTime = Math.max(now + 500L, effectiveTrigger);
        upsertStoredAlarm(ctx, id, cleanTitle, cleanBody, alarmTime, cleanRecurrence, recurrenceWeekday);

        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;

        PendingIntent pi = buildAlarmPendingIntent(ctx, id, cleanTitle, cleanBody, alarmTime, cleanRecurrence, recurrenceWeekday);

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                if (canScheduleExact(ctx)) {
                    am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, alarmTime, pi);
                } else {
                    am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, alarmTime, pi);
                }
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
                am.setExact(AlarmManager.RTC_WAKEUP, alarmTime, pi);
            } else {
                am.set(AlarmManager.RTC_WAKEUP, alarmTime, pi);
            }
        } catch (SecurityException se) {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, alarmTime, pi);
                } else {
                    am.set(AlarmManager.RTC_WAKEUP, alarmTime, pi);
                }
            } catch (Exception ignored) {}
        } catch (Exception ignored) {}
    }

    public static void cancelAlarm(Context ctx, String id) {
        if (ctx == null || id == null || id.trim().isEmpty()) return;
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am != null) {
            try {
                PendingIntent pi = buildAlarmPendingIntent(ctx, id, "Zuzu AI Reminder", "", 0L, "none", -1);
                am.cancel(pi);
                pi.cancel();
            } catch (Exception ignored) {}
        }
        removeStoredAlarm(ctx, id);
    }

    public static void syncAllAlarms(Context ctx, JSONArray reminders) {
        if (ctx == null) return;
        JSONArray existing = readStoredAlarms(ctx);
        for (int i = 0; i < existing.length(); i++) {
            JSONObject obj = existing.optJSONObject(i);
            if (obj != null) {
                String oldId = obj.optString("id", "");
                if (!oldId.isEmpty()) {
                    cancelAlarmPendingIntentOnly(ctx, oldId);
                }
            }
        }

        writeStoredAlarms(ctx, new JSONArray());

        if (reminders == null) return;
        for (int i = 0; i < reminders.length(); i++) {
            JSONObject item = reminders.optJSONObject(i);
            if (item == null) continue;
            if (item.optBoolean("completed", false)) continue;
            String id = item.optString("id", "");
            String title = item.optString("title", "Zuzu AI Reminder");
            String body = item.optString("body", "");
            long triggerAtMs = item.optLong("triggerAtMs", 0L);
            String recurrence = item.optString("recurrence", "none");
            int recurrenceWeekday = item.optInt("recurrenceWeekday", -1);
            if (!id.isEmpty() && triggerAtMs > 0L) {
                scheduleAlarm(ctx, id, title, body, triggerAtMs, recurrence, recurrenceWeekday);
            }
        }
    }

    public static void rescheduleAllFromPrefs(Context ctx) {
        if (ctx == null) return;
        JSONArray stored = readStoredAlarms(ctx);
        for (int i = 0; i < stored.length(); i++) {
            JSONObject item = stored.optJSONObject(i);
            if (item == null) continue;
            String id = item.optString("id", "");
            String title = item.optString("title", "Zuzu AI Reminder");
            String body = item.optString("body", "");
            long triggerAtMs = item.optLong("triggerAtMs", 0L);
            String recurrence = item.optString("recurrence", "none");
            int recurrenceWeekday = item.optInt("recurrenceWeekday", -1);
            if (!id.isEmpty() && triggerAtMs > 0L) {
                scheduleAlarm(ctx, id, title, body, triggerAtMs, recurrence, recurrenceWeekday);
            }
        }
    }

    private static void cancelAlarmPendingIntentOnly(Context ctx, String id) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        try {
            PendingIntent pi = buildAlarmPendingIntent(ctx, id, "Zuzu AI Reminder", "", 0L, "none", -1);
            am.cancel(pi);
            pi.cancel();
        } catch (Exception ignored) {}
    }

    private static JSONArray readStoredAlarms(Context ctx) {
        try {
            SharedPreferences prefs = ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String raw = prefs.getString(KEY_ALARMS_JSON, "[]");
            return new JSONArray(raw != null ? raw : "[]");
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    private static void writeStoredAlarms(Context ctx, JSONArray arr) {
        ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putString(KEY_ALARMS_JSON, arr.toString())
                .apply();
    }

    private static void upsertStoredAlarm(
            Context ctx,
            String id,
            String title,
            String body,
            long triggerAtMs,
            String recurrence,
            int recurrenceWeekday
    ) {
        JSONArray existing = readStoredAlarms(ctx);
        JSONArray next = new JSONArray();
        for (int i = 0; i < existing.length(); i++) {
            JSONObject obj = existing.optJSONObject(i);
            if (obj != null && !id.equals(obj.optString("id", ""))) {
                next.put(obj);
            }
        }
        try {
            JSONObject item = new JSONObject();
            item.put("id", id);
            item.put("title", title);
            item.put("body", body);
            item.put("triggerAtMs", triggerAtMs);
            item.put("recurrence", recurrence);
            item.put("recurrenceWeekday", recurrenceWeekday);
            next.put(item);
        } catch (Exception ignored) {}
        writeStoredAlarms(ctx, next);
    }

    private static void removeStoredAlarm(Context ctx, String id) {
        JSONArray existing = readStoredAlarms(ctx);
        JSONArray next = new JSONArray();
        for (int i = 0; i < existing.length(); i++) {
            JSONObject obj = existing.optJSONObject(i);
            if (obj != null && !id.equals(obj.optString("id", ""))) {
                next.put(obj);
            }
        }
        writeStoredAlarms(ctx, next);
    }

    private static void postReminderNotification(Context ctx, String id, String title, String body) {
        try {
            ensureChannel(ctx);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                    && ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                return;
            }

            Intent launchIntent = new Intent(ctx, MainActivity.class);
            launchIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            int pendingFlags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                    ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                    : PendingIntent.FLAG_UPDATE_CURRENT;
            PendingIntent contentIntent = PendingIntent.getActivity(ctx, id.hashCode(), launchIntent, pendingFlags);

            int iconRes = ctx.getApplicationInfo().icon;
            NotificationCompat.Builder builder = new NotificationCompat.Builder(ctx, CHANNEL_ID)
                    .setSmallIcon(iconRes != 0 ? iconRes : android.R.drawable.ic_popup_reminder)
                    .setContentTitle(title)
                    .setContentText(body)
                    .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                    .setPriority(NotificationCompat.PRIORITY_HIGH)
                    .setCategory(NotificationCompat.CATEGORY_REMINDER)
                    .setContentIntent(contentIntent)
                    .setAutoCancel(true);

            NotificationManagerCompat.from(ctx).notify(id.hashCode(), builder.build());
        } catch (SecurityException | IllegalStateException ignored) {}
    }
}
