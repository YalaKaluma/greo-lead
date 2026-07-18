package com.AlfredTheChiefOfStaff.myapp;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(MeetingRecorderPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
