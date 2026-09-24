package com.rosklad.zvonok;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    public MainActivity() {
        registerPlugin(LiveSchedulePlugin.class);
    }
}
