package com.AlfredTheChiefOfStaff.myapp;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.media.MediaRecorder;
import android.os.Build;
import android.os.IBinder;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

import java.io.File;
import java.io.IOException;

public class MeetingRecordingService extends Service {
    public static final String ACTION_START = "alfred.meetings.START";
    private static final String CHANNEL_ID = "alfred_meeting_recording";
    private static final int NOTIFICATION_ID = 4201;
    private static MeetingRecordingService activeService;

    private MediaRecorder recorder;
    private String outputPath;
    private boolean paused;
    private String notificationTitle = "Alfred is recording";
    private String notificationText = "Recording in progress";

    @Override
    public void onCreate() {
        super.onCreate();
        activeService = this;
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_START.equals(intent.getAction()) && recorder == null) {
            outputPath = intent.getStringExtra("outputPath");
            String requestedTitle = intent.getStringExtra("notificationTitle");
            String requestedText = intent.getStringExtra("notificationText");
            if (requestedTitle != null && !requestedTitle.trim().isEmpty()) {
                notificationTitle = requestedTitle;
            }
            if (requestedText != null && !requestedText.trim().isEmpty()) {
                notificationText = requestedText;
            }
            startForeground(NOTIFICATION_ID, buildNotification(notificationText));
            try {
                startRecorder();
            } catch (IOException error) {
                stopSelf();
            }
        }
        return START_NOT_STICKY;
    }

    private void startRecorder() throws IOException {
        recorder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? new MediaRecorder(this) : new MediaRecorder();
        recorder.setAudioSource(MediaRecorder.AudioSource.MIC);
        recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
        recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
        // Speech-optimized bitrate keeps long meetings within transcription
        // upload limits without materially reducing voice intelligibility.
        recorder.setAudioEncodingBitRate(48000);
        recorder.setAudioSamplingRate(44100);
        recorder.setOutputFile(outputPath);
        recorder.prepare();
        recorder.start();
    }

    public static synchronized boolean pauseActiveRecording() {
        if (activeService == null || activeService.recorder == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return false;
        activeService.recorder.pause();
        activeService.paused = true;
        activeService.updateNotification("Meeting recording paused");
        return true;
    }

    public static synchronized boolean resumeActiveRecording() {
        if (activeService == null || activeService.recorder == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return false;
        activeService.recorder.resume();
        activeService.paused = false;
        activeService.updateNotification(activeService.notificationText);
        return true;
    }

    public static synchronized String stopActiveRecording() {
        if (activeService == null || activeService.recorder == null) return null;
        String path = activeService.outputPath;
        try {
            activeService.recorder.stop();
        } finally {
            activeService.recorder.release();
            activeService.recorder = null;
            activeService.stopForeground(true);
            activeService.stopSelf();
        }
        return path;
    }

    private Notification buildNotification(String text) {
        Intent openAlfred = new Intent(this, MainActivity.class);
        openAlfred.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent contentIntent = PendingIntent.getActivity(
                this,
                0,
                openAlfred,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(paused ? "Recording paused" : notificationTitle)
                .setContentText(text)
                .setContentIntent(contentIntent)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setCategory(NotificationCompat.CATEGORY_SERVICE)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .build();
    }

    private void updateNotification(String text) {
        NotificationManager manager = getSystemService(NotificationManager.class);
        manager.notify(NOTIFICATION_ID, buildNotification(text));
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Audio recording", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Shown while Alfred is recording audio");
            getSystemService(NotificationManager.class).createNotificationChannel(channel);
        }
    }

    @Override
    public void onDestroy() {
        if (recorder != null) {
            try { recorder.stop(); } catch (RuntimeException ignored) { }
            recorder.release();
            recorder = null;
        }
        if (activeService == this) activeService = null;
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) { return null; }
}
