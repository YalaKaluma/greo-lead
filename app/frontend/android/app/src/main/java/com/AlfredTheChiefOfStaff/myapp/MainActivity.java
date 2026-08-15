package com.AlfredTheChiefOfStaff.myapp;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(MeetingRecorderPlugin.class);
        registerPlugin(SessionCredentialsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
