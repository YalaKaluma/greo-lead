package com.AlfredTheChiefOfStaff.myapp;

import android.Manifest;
import android.content.Intent;
import android.os.Build;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import java.io.File;

@CapacitorPlugin(
        name = "MeetingRecorder",
        permissions = @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO })
)
public class MeetingRecorderPlugin extends Plugin {
    private PluginCall pendingStart;

    @PluginMethod
    public void start(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            pendingStart = call;
            requestPermissionForAlias("microphone", call, "microphonePermissionCallback");
            return;
        }
        startService(call);
    }

    @com.getcapacitor.annotation.PermissionCallback
    private void microphonePermissionCallback(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) startService(call);
        else call.reject("Microphone permission was denied.");
        pendingStart = null;
    }

    private void startService(PluginCall call) {
        File directory = new File(getContext().getFilesDir(), "meetings");
        if (!directory.exists() && !directory.mkdirs()) {
            call.reject("Could not create secure recording storage.");
            return;
        }
        File output = new File(directory, "meeting-" + System.currentTimeMillis() + ".m4a");
        Intent intent = new Intent(getContext(), MeetingRecordingService.class);
        intent.setAction(MeetingRecordingService.ACTION_START);
        intent.putExtra("outputPath", output.getAbsolutePath());
        ContextCompat.startForegroundService(getContext(), intent);
        JSObject result = new JSObject();
        result.put("path", output.getAbsolutePath());
        call.resolve(result);
    }

    @PluginMethod
    public void pause(PluginCall call) {
        if (MeetingRecordingService.pauseActiveRecording()) call.resolve();
        else call.reject("The active recording could not be paused.");
    }

    @PluginMethod
    public void resume(PluginCall call) {
        if (MeetingRecordingService.resumeActiveRecording()) call.resolve();
        else call.reject("The active recording could not be resumed.");
    }

    @PluginMethod
    public void stop(PluginCall call) {
        String path = MeetingRecordingService.stopActiveRecording();
        if (path == null) {
            call.reject("No meeting recording is active.");
            return;
        }
        JSObject result = new JSObject();
        result.put("path", path);
        call.resolve(result);
    }

    @PluginMethod
    public void removeFile(PluginCall call) {
        String path = call.getString("path");
        if (path == null || !path.startsWith(new File(getContext().getFilesDir(), "meetings").getAbsolutePath())) {
            call.reject("Invalid meeting recording path.");
            return;
        }
        File file = new File(path);
        JSObject result = new JSObject();
        result.put("removed", !file.exists() || file.delete());
        call.resolve(result);
    }
}
