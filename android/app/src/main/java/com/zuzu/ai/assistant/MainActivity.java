package com.zuzu.ai.assistant;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ZuzuNativeBridgePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
