package com.zuzu.ai.assistant;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.provider.Settings;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;

import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Capacitor Native Bridge for Zuzu AI.
 * Provides:
 * - Silent Android Foreground Service control
 * - Essential runtime permissions (Microphone & Notifications)
 * - Lightweight AudioRecord custom trigger monitor (Mouth Whistle & Finger Snap)
 * - Native Android SpeechRecognizer (Bangla bn-BD & English en-US)
 * - Native Android TextToSpeech fallback for reliable APK voice playback
 */
@CapacitorPlugin(
        name = "ZuzuNative",
        permissions = {
                @Permission(strings = { Manifest.permission.RECORD_AUDIO }, alias = "microphone"),
                @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications"),
                @Permission(strings = { Manifest.permission.BLUETOOTH_CONNECT, Manifest.permission.BLUETOOTH_SCAN }, alias = "bluetooth"),
                @Permission(strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }, alias = "location"),
                @Permission(strings = { Manifest.permission.CALL_PHONE }, alias = "phone"),
                @Permission(strings = { Manifest.permission.READ_CONTACTS, Manifest.permission.WRITE_CONTACTS }, alias = "contacts"),
                @Permission(strings = { Manifest.permission.READ_EXTERNAL_STORAGE, Manifest.permission.WRITE_EXTERNAL_STORAGE }, alias = "storage"),
                @Permission(strings = { Manifest.permission.CAMERA }, alias = "camera")
        }
)
public class ZuzuNativeBridgePlugin extends Plugin {

    private static class NativeTriggerSpec {
        String id;
        String label;
        String kind;
        double peakHz;
        double crestFactor;
        double rmsThreshold;
        double sensitivity;
        int whistleStreak = 0;
    }

    private SpeechRecognizer speechRecognizer;
    private TextToSpeech textToSpeech;
    private boolean ttsInitialized = false;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    private final AtomicBoolean isTriggerMonitorRunning = new AtomicBoolean(false);
    private Thread triggerMonitorThread;
    private volatile long lastTriggerFiredAt = 0L;
    private volatile List<NativeTriggerSpec> activeTriggers = new ArrayList<>();

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
    public void startAudioTriggerMonitor(PluginCall call) {
        Context ctx = getContext();
        if (!hasPerm(ctx, Manifest.permission.RECORD_AUDIO)) {
            call.reject("Microphone permission required for custom audio triggers.", "PERMISSION_DENIED");
            return;
        }

        JSArray triggersJson = call.getArray("triggers", new JSArray());
        List<NativeTriggerSpec> parsed = new ArrayList<>();
        if (triggersJson != null) {
            for (int i = 0; i < triggersJson.length(); i++) {
                try {
                    JSONObject obj = triggersJson.getJSONObject(i);
                    NativeTriggerSpec spec = new NativeTriggerSpec();
                    spec.id = obj.optString("id", "trig-" + i);
                    spec.label = obj.optString("label", "Custom Sound");
                    spec.kind = obj.optString("kind", "whistle");
                    spec.peakHz = obj.optDouble("peakHz", 1600.0);
                    spec.crestFactor = obj.optDouble("crestFactor", 3.5);
                    spec.rmsThreshold = obj.optDouble("rmsThreshold", 0.04);
                    spec.sensitivity = obj.optDouble("sensitivity", 0.78);
                    parsed.add(spec);
                } catch (Exception ignored) {}
            }
        }

        activeTriggers = parsed;
        if (parsed.isEmpty()) {
            stopMonitorInternal();
            JSObject ret = new JSObject();
            ret.put("running", false);
            call.resolve(ret);
            return;
        }

        if (isTriggerMonitorRunning.get()) {
            JSObject ret = new JSObject();
            ret.put("running", true);
            ret.put("count", parsed.size());
            call.resolve(ret);
            return;
        }

        isTriggerMonitorRunning.set(true);
        triggerMonitorThread = new Thread(this::runAudioTriggerLoop, "ZuzuAudioTriggerLoop");
        triggerMonitorThread.setPriority(Thread.MIN_PRIORITY);
        triggerMonitorThread.start();

        JSObject ret = new JSObject();
        ret.put("running", true);
        ret.put("count", parsed.size());
        call.resolve(ret);
    }

    @PluginMethod
    public void stopAudioTriggerMonitor(PluginCall call) {
        stopMonitorInternal();
        JSObject ret = new JSObject();
        ret.put("running", false);
        call.resolve(ret);
    }

    private void stopMonitorInternal() {
        isTriggerMonitorRunning.set(false);
        if (triggerMonitorThread != null) {
            try {
                triggerMonitorThread.interrupt();
            } catch (Exception ignored) {}
            triggerMonitorThread = null;
        }
    }

    private void runAudioTriggerLoop() {
        final int sampleRate = 16000;
        final int frameSize = 1024; // ~64ms window
        int minBuf = AudioRecord.getMinBufferSize(
                sampleRate,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT
        );
        int bufferSize = Math.max(minBuf, frameSize * 4);

        AudioRecord recorder = null;
        try {
            recorder = new AudioRecord(
                    MediaRecorder.AudioSource.MIC,
                    sampleRate,
                    AudioFormat.CHANNEL_IN_MONO,
                    AudioFormat.ENCODING_PCM_16BIT,
                    bufferSize
            );
            if (recorder.getState() != AudioRecord.STATE_INITIALIZED) {
                isTriggerMonitorRunning.set(false);
                return;
            }

            short[] samples = new short[frameSize];
            recorder.startRecording();

            while (isTriggerMonitorRunning.get() && !Thread.currentThread().isInterrupted()) {
                int read = recorder.read(samples, 0, frameSize);
                if (read <= 0) continue;

                double sumSq = 0;
                double peakAbs = 0;
                int zeroCrossings = 0;
                for (int i = 0; i < read; i++) {
                    double norm = samples[i] / 32768.0;
                    double abs = Math.abs(norm);
                    if (abs > peakAbs) peakAbs = abs;
                    sumSq += norm * norm;
                    if (i > 0 && ((samples[i - 1] >= 0 && samples[i] < 0) || (samples[i - 1] < 0 && samples[i] >= 0))) {
                        zeroCrossings++;
                    }
                }

                double rms = Math.sqrt(sumSq / read);
                double crest = peakAbs / Math.max(rms, 0.0001);
                double estHz = (zeroCrossings * sampleRate) / (2.0 * read);

                long now = System.currentTimeMillis();
                if (now - lastTriggerFiredAt < 3000) continue;

                List<NativeTriggerSpec> snapshot = activeTriggers;
                for (NativeTriggerSpec spec : snapshot) {
                    if ("whistle".equals(spec.kind)) {
                        double targetHz = spec.peakHz > 750 ? spec.peakHz : 1500.0;
                        double goertzelTarget = computeGoertzelMagnitude(samples, read, sampleRate, targetHz);
                        double goertzelRefLow = computeGoertzelMagnitude(samples, read, sampleRate, Math.max(250, targetHz * 0.55));
                        double goertzelRefHigh = computeGoertzelMagnitude(samples, read, sampleRate, Math.min(7200, targetHz * 1.45));
                        double ratio = goertzelTarget / Math.max(1e-5, (goertzelRefLow + goertzelRefHigh) * 0.5);

                        boolean hit = rms >= Math.max(0.024, spec.rmsThreshold * 0.50)
                                && estHz >= 750.0
                                && Math.abs(estHz - targetHz) <= 300.0
                                && ratio >= 3.8;

                        if (hit) {
                            spec.whistleStreak++;
                            if (spec.whistleStreak >= 3) {
                                fireNativeTrigger(spec, now);
                                break;
                            }
                        } else {
                            spec.whistleStreak = Math.max(0, spec.whistleStreak - 1);
                        }
                    } else if ("snap".equals(spec.kind)) {
                        boolean hit = rms >= Math.max(0.042, spec.rmsThreshold * 0.55)
                                && crest >= Math.max(3.35, spec.crestFactor * 0.70)
                                && estHz >= 1450.0;
                        if (hit) {
                            fireNativeTrigger(spec, now);
                            break;
                        }
                    } else {
                        boolean hit = rms >= Math.max(0.040, spec.rmsThreshold * 0.58)
                                && Math.abs(estHz - spec.peakHz) <= 320.0;
                        if (hit) {
                            spec.whistleStreak++;
                            if (spec.whistleStreak >= 2) {
                                fireNativeTrigger(spec, now);
                                break;
                            }
                        } else {
                            spec.whistleStreak = 0;
                        }
                    }
                }
            }
        } catch (SecurityException | IllegalStateException ignored) {
        } finally {
            isTriggerMonitorRunning.set(false);
            if (recorder != null) {
                try {
                    recorder.stop();
                } catch (Exception ignored) {}
                try {
                    recorder.release();
                } catch (Exception ignored) {}
            }
        }
    }

    private double computeGoertzelMagnitude(short[] samples, int length, int sampleRate, double targetFreq) {
        double k = (0.5 + (length * targetFreq) / sampleRate);
        double omega = (2.0 * Math.PI * k) / length;
        double coeff = 2.0 * Math.cos(omega);
        double q0 = 0;
        double q1 = 0;
        double q2 = 0;
        for (int i = 0; i < length; i++) {
            double x = samples[i] / 32768.0;
            q0 = coeff * q1 - q2 + x;
            q2 = q1;
            q1 = q0;
        }
        return Math.sqrt(Math.max(0.0, q1 * q1 + q2 * q2 - q1 * q2 * coeff)) / length;
    }

    private void fireNativeTrigger(NativeTriggerSpec spec, long now) {
        lastTriggerFiredAt = now;
        spec.whistleStreak = 0;
        stopMonitorInternal();
        JSObject payload = new JSObject();
        payload.put("id", spec.id);
        payload.put("label", spec.label);
        payload.put("kind", spec.kind);
        payload.put("triggeredAt", now);
        mainHandler.post(() -> notifyListeners("nativeAudioTriggerDetected", payload));
    }

    @PluginMethod
    public void checkAllNativePermissions(PluginCall call) {
        call.resolve(buildPermissionSnapshot());
    }

    private JSObject buildPermissionSnapshot() {
        Context ctx = getContext();
        JSObject res = new JSObject();

        // 1-2. Audio & Voice
        res.put("microphone", hasPerm(ctx, Manifest.permission.RECORD_AUDIO) ? "granted" : "prompt");
        res.put("modify_audio", "granted");

        // 3-6. Bluetooth (API 31+ runtime connect/scan)
        res.put("bluetooth", "granted");
        res.put("bluetooth_admin", "granted");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            res.put("bluetooth_connect", hasPerm(ctx, Manifest.permission.BLUETOOTH_CONNECT) ? "granted" : "prompt");
            res.put("bluetooth_scan", hasPerm(ctx, Manifest.permission.BLUETOOTH_SCAN) ? "granted" : "prompt");
        } else {
            res.put("bluetooth_connect", "granted");
            res.put("bluetooth_scan", "granted");
        }

        // 7-15. Network, Foreground Services, WakeLock, Boot & Battery
        res.put("internet", "granted");
        res.put("access_network", "granted");
        res.put("access_wifi", "granted");
        res.put("foreground_service", "granted");
        res.put("fg_microphone", "granted");
        res.put("fg_media", "granted");
        res.put("wake_lock", "granted");
        res.put("boot_completed", "granted");

        boolean ignoringBattery = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
            ignoringBattery = pm != null && pm.isIgnoringBatteryOptimizations(ctx.getPackageName());
        }
        res.put("battery_opt", ignoringBattery ? "granted" : "system_required");

        // 16-22. Notifications, Overlay, System Settings & Package Visibility
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            res.put("notifications", hasPerm(ctx, Manifest.permission.POST_NOTIFICATIONS) ? "granted" : "prompt");
        } else {
            res.put("notifications", NotificationManagerCompat.from(ctx).areNotificationsEnabled() ? "granted" : "prompt");
        }
        res.put("vibrate", "granted");

        boolean canOverlay = Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(ctx);
        res.put("system_alert_window", canOverlay ? "granted" : "system_required");

        boolean canWriteSettings = Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.System.canWrite(ctx);
        res.put("write_settings", canWriteSettings ? "granted" : "system_required");

        res.put("expand_status_bar", "granted");
        res.put("query_all_packages", "granted");

        boolean canInstall = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            canInstall = ctx.getPackageManager().canRequestPackageInstalls();
        }
        res.put("request_install_packages", canInstall ? "granted" : "system_required");

        // 23-30. Location, Calls, Contacts, Storage & Camera
        res.put("fine_location", hasPerm(ctx, Manifest.permission.ACCESS_FINE_LOCATION) ? "granted" : "prompt");
        res.put("coarse_location", hasPerm(ctx, Manifest.permission.ACCESS_COARSE_LOCATION) ? "granted" : "prompt");
        res.put("call_phone", hasPerm(ctx, Manifest.permission.CALL_PHONE) ? "granted" : "prompt");
        res.put("read_contacts", hasPerm(ctx, Manifest.permission.READ_CONTACTS) ? "granted" : "prompt");
        res.put("write_contacts", hasPerm(ctx, Manifest.permission.WRITE_CONTACTS) ? "granted" : "prompt");

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            res.put("read_storage", "granted");
            res.put("write_storage", "granted");
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            res.put("read_storage", hasPerm(ctx, Manifest.permission.READ_EXTERNAL_STORAGE) ? "granted" : "prompt");
            res.put("write_storage", "granted");
        } else {
            res.put("read_storage", hasPerm(ctx, Manifest.permission.READ_EXTERNAL_STORAGE) ? "granted" : "prompt");
            res.put("write_storage", hasPerm(ctx, Manifest.permission.WRITE_EXTERNAL_STORAGE) ? "granted" : "prompt");
        }

        res.put("camera", hasPerm(ctx, Manifest.permission.CAMERA) ? "granted" : "prompt");
        return res;
    }

    @PluginMethod
    public void requestCorePermissions(PluginCall call) {
        String alias = call.getString("alias", "all");
        Context ctx = getContext();

        if ("microphone".equals(alias)) {
            if (hasPerm(ctx, Manifest.permission.RECORD_AUDIO)) {
                call.resolve(buildPermissionSnapshot());
                return;
            }
            requestPermissionForAlias("microphone", call, "permCallback");
        } else if ("notifications".equals(alias)) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                if (hasPerm(ctx, Manifest.permission.POST_NOTIFICATIONS)) {
                    call.resolve(buildPermissionSnapshot());
                    return;
                }
                requestPermissionForAlias("notifications", call, "permCallback");
            } else {
                call.resolve(buildPermissionSnapshot());
            }
        } else if ("bluetooth".equals(alias)) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                if (hasPerm(ctx, Manifest.permission.BLUETOOTH_CONNECT)
                        && hasPerm(ctx, Manifest.permission.BLUETOOTH_SCAN)) {
                    call.resolve(buildPermissionSnapshot());
                    return;
                }
                requestPermissionForAlias("bluetooth", call, "permCallback");
            } else {
                call.resolve(buildPermissionSnapshot());
            }
        } else if ("location".equals(alias)) {
            if (hasPerm(ctx, Manifest.permission.ACCESS_FINE_LOCATION)
                    && hasPerm(ctx, Manifest.permission.ACCESS_COARSE_LOCATION)) {
                call.resolve(buildPermissionSnapshot());
                return;
            }
            requestPermissionForAlias("location", call, "permCallback");
        } else if ("phone".equals(alias)) {
            if (hasPerm(ctx, Manifest.permission.CALL_PHONE)) {
                call.resolve(buildPermissionSnapshot());
                return;
            }
            requestPermissionForAlias("phone", call, "permCallback");
        } else if ("contacts".equals(alias)) {
            if (hasPerm(ctx, Manifest.permission.READ_CONTACTS)
                    && hasPerm(ctx, Manifest.permission.WRITE_CONTACTS)) {
                call.resolve(buildPermissionSnapshot());
                return;
            }
            requestPermissionForAlias("contacts", call, "permCallback");
        } else if ("storage".equals(alias)) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                call.resolve(buildPermissionSnapshot());
                return;
            }
            requestPermissionForAlias("storage", call, "permCallback");
        } else if ("camera".equals(alias)) {
            if (hasPerm(ctx, Manifest.permission.CAMERA)) {
                call.resolve(buildPermissionSnapshot());
                return;
            }
            requestPermissionForAlias("camera", call, "permCallback");
        } else {
            List<String> neededAliases = new ArrayList<>();
            if (!hasPerm(ctx, Manifest.permission.RECORD_AUDIO)) neededAliases.add("microphone");
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                    && !hasPerm(ctx, Manifest.permission.POST_NOTIFICATIONS)) {
                neededAliases.add("notifications");
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
                    && (!hasPerm(ctx, Manifest.permission.BLUETOOTH_CONNECT)
                    || !hasPerm(ctx, Manifest.permission.BLUETOOTH_SCAN))) {
                neededAliases.add("bluetooth");
            }
            if (!hasPerm(ctx, Manifest.permission.ACCESS_FINE_LOCATION)) neededAliases.add("location");
            if (!hasPerm(ctx, Manifest.permission.CALL_PHONE)) neededAliases.add("phone");
            if (!hasPerm(ctx, Manifest.permission.READ_CONTACTS)
                    || !hasPerm(ctx, Manifest.permission.WRITE_CONTACTS)) {
                neededAliases.add("contacts");
            }
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU
                    && !hasPerm(ctx, Manifest.permission.READ_EXTERNAL_STORAGE)) {
                neededAliases.add("storage");
            }
            if (!hasPerm(ctx, Manifest.permission.CAMERA)) neededAliases.add("camera");

            if (neededAliases.isEmpty()) {
                call.resolve(buildPermissionSnapshot());
            } else {
                requestPermissionForAliases(neededAliases.toArray(new String[0]), call, "permCallback");
            }
        }
    }

    @PermissionCallback
    private void permCallback(PluginCall call) {
        call.resolve(buildPermissionSnapshot());
    }

    @PluginMethod
    public void startNativeSpeech(PluginCall call) {
        Context ctx = getContext();
        if (!hasPerm(ctx, Manifest.permission.RECORD_AUDIO)) {
            call.reject("Microphone permission (RECORD_AUDIO) not granted.", "PERMISSION_DENIED");
            return;
        }

        final String langTag = call.getString("language", "en-US");

        mainHandler.post(() -> {
            try {
                if (!SpeechRecognizer.isRecognitionAvailable(ctx)) {
                    call.reject("Speech recognition service unavailable on this device.", "UNAVAILABLE");
                    return;
                }

                if (speechRecognizer != null) {
                    try {
                        speechRecognizer.destroy();
                    } catch (Exception ignored) {}
                    speechRecognizer = null;
                }

                speechRecognizer = SpeechRecognizer.createSpeechRecognizer(ctx);
                speechRecognizer.setRecognitionListener(new RecognitionListener() {
                    @Override
                    public void onReadyForSpeech(Bundle params) {
                        notifyListeners("nativeSpeechReady", new JSObject());
                    }

                    @Override
                    public void onBeginningOfSpeech() {}

                    @Override
                    public void onRmsChanged(float rmsdB) {}

                    @Override
                    public void onBufferReceived(byte[] buffer) {}

                    @Override
                    public void onEndOfSpeech() {
                        notifyListeners("nativeSpeechEnd", new JSObject());
                    }

                    @Override
                    public void onError(int error) {
                        JSObject err = new JSObject();
                        err.put("code", error);
                        err.put("message", mapSpeechError(error));
                        notifyListeners("nativeSpeechError", err);
                    }

                    @Override
                    public void onResults(Bundle results) {
                        ArrayList<String> matches = results != null
                                ? results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                                : null;
                        String text = (matches != null && !matches.isEmpty()) ? matches.get(0) : "";
                        JSObject payload = new JSObject();
                        payload.put("text", text != null ? text : "");
                        notifyListeners("nativeSpeechResult", payload);
                    }

                    @Override
                    public void onPartialResults(Bundle partialResults) {
                        ArrayList<String> matches = partialResults != null
                                ? partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                                : null;
                        String text = (matches != null && !matches.isEmpty()) ? matches.get(0) : "";
                        if (text != null && !text.isEmpty()) {
                            JSObject payload = new JSObject();
                            payload.put("text", text);
                            notifyListeners("nativeSpeechPartial", payload);
                        }
                    }

                    @Override
                    public void onEvent(int eventType, Bundle params) {}
                });

                Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                String resolvedLang = ("bn-BD".equals(langTag)) ? "bn-BD" : "en-US";
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, resolvedLang);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, resolvedLang);
                intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
                intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3);
                intent.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, ctx.getPackageName());

                speechRecognizer.startListening(intent);

                JSObject ret = new JSObject();
                ret.put("started", true);
                ret.put("language", resolvedLang);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Could not start speech recognizer: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void stopNativeSpeech(PluginCall call) {
        mainHandler.post(() -> {
            if (speechRecognizer != null) {
                try {
                    speechRecognizer.stopListening();
                } catch (Exception ignored) {}
            }
            JSObject ret = new JSObject();
            ret.put("stopped", true);
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void cancelNativeSpeech(PluginCall call) {
        mainHandler.post(() -> {
            if (speechRecognizer != null) {
                try {
                    speechRecognizer.cancel();
                    speechRecognizer.destroy();
                } catch (Exception ignored) {}
                speechRecognizer = null;
            }
            JSObject ret = new JSObject();
            ret.put("cancelled", true);
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void speakNative(PluginCall call) {
        final String text = call.getString("text", "");
        final String lang = call.getString("language", "en-US");
        final float rate = call.getFloat("rate", 1.0f);
        final float pitch = call.getFloat("pitch", 1.0f);

        if (text == null || text.trim().isEmpty()) {
            call.reject("Text is required for speech playback.");
            return;
        }

        mainHandler.post(() -> {
            if (textToSpeech == null) {
                textToSpeech = new TextToSpeech(getContext(), status -> {
                    if (status == TextToSpeech.SUCCESS) {
                        ttsInitialized = true;
                        performNativeSpeak(text, lang, rate, pitch, call);
                    } else {
                        ttsInitialized = false;
                        call.reject("Android TextToSpeech initialization failed.");
                    }
                });
            } else if (ttsInitialized) {
                performNativeSpeak(text, lang, rate, pitch, call);
            } else {
                call.reject("TextToSpeech engine is still initializing.");
            }
        });
    }

    private void performNativeSpeak(String text, String lang, float rate, float pitch, PluginCall call) {
        try {
            Locale targetLocale = "bn-BD".equals(lang) ? new Locale("bn", "BD") : Locale.US;
            int avail = textToSpeech.isLanguageAvailable(targetLocale);
            if (avail >= TextToSpeech.LANG_AVAILABLE) {
                textToSpeech.setLanguage(targetLocale);
            } else {
                textToSpeech.setLanguage(Locale.US);
            }

            textToSpeech.setSpeechRate(Math.max(0.6f, Math.min(1.6f, rate)));
            textToSpeech.setPitch(Math.max(0.6f, Math.min(1.5f, pitch)));

            final String utteranceId = "zuzu-tts-" + System.currentTimeMillis();
            textToSpeech.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override
                public void onStart(String id) {
                    notifyListeners("nativeTtsStart", new JSObject().put("id", id));
                }

                @Override
                public void onDone(String id) {
                    notifyListeners("nativeTtsEnd", new JSObject().put("id", id));
                }

                @Override
                public void onError(String id) {
                    notifyListeners("nativeTtsError", new JSObject().put("id", id));
                }
            });

            textToSpeech.speak(text, TextToSpeech.QUEUE_FLUSH, null, utteranceId);
            JSObject ret = new JSObject();
            ret.put("speaking", true);
            ret.put("utteranceId", utteranceId);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("TTS speak failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stopNativeSpeak(PluginCall call) {
        mainHandler.post(() -> {
            if (textToSpeech != null) {
                try {
                    textToSpeech.stop();
                } catch (Exception ignored) {}
            }
            JSObject ret = new JSObject();
            ret.put("stopped", true);
            call.resolve(ret);
        });
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
            } else if ("android.settings.MANAGE_UNKNOWN_APP_SOURCES".equals(action)
                    && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse(pkgUri));
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
            ret.put("versionName", "3.7.0");
            ret.put("versionCode", 370);
            call.resolve(ret);
        }
    }

    @Override
    protected void handleOnDestroy() {
        stopMonitorInternal();
        mainHandler.post(() -> {
            if (speechRecognizer != null) {
                try {
                    speechRecognizer.destroy();
                } catch (Exception ignored) {}
                speechRecognizer = null;
            }
            if (textToSpeech != null) {
                try {
                    textToSpeech.shutdown();
                } catch (Exception ignored) {}
                textToSpeech = null;
            }
        });
        super.handleOnDestroy();
    }

    private String mapSpeechError(int code) {
        switch (code) {
            case SpeechRecognizer.ERROR_AUDIO:
                return "Audio recording error.";
            case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS:
                return "Microphone permission is required.";
            case SpeechRecognizer.ERROR_NETWORK:
            case SpeechRecognizer.ERROR_NETWORK_TIMEOUT:
                return "Network unreachable for speech recognition.";
            case SpeechRecognizer.ERROR_NO_MATCH:
                return "no-match";
            case SpeechRecognizer.ERROR_SPEECH_TIMEOUT:
                return "no-speech";
            case SpeechRecognizer.ERROR_RECOGNIZER_BUSY:
                return "Recognizer busy, retrying.";
            default:
                return "Speech recognition error (" + code + ")";
        }
    }

    private boolean hasPerm(Context ctx, String permission) {
        return ContextCompat.checkSelfPermission(ctx, permission) == PackageManager.PERMISSION_GRANTED;
    }
}
