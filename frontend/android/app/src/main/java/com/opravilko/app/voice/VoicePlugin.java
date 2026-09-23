package com.opravilko.app.voice;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.speech.RecognizerIntent;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;

/**
 * Voice input through the phone's own speech recognizer (Google's voice
 * typing on most phones): it shows its listening dialog, asks for the
 * microphone itself, and hands back the words.
 */
@CapacitorPlugin(name = "OpravilkoVoice")
public class VoicePlugin extends Plugin {

    @PluginMethod
    public void listen(PluginCall call) {
        String language = call.getString("language", "sl-SI");
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, language);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, language);
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        String prompt = call.getString("prompt");
        if (prompt != null && !prompt.isEmpty()) intent.putExtra(RecognizerIntent.EXTRA_PROMPT, prompt);
        try {
            startActivityForResult(call, intent, "onVoiceResult");
        } catch (ActivityNotFoundException e) {
            call.reject("This phone has no voice input. Install or enable Google voice typing.");
        }
    }

    @ActivityCallback
    private void onVoiceResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null) {
            call.reject("cancelled");
            return;
        }
        ArrayList<String> heard = data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
        JSObject ret = new JSObject();
        ret.put("text", heard == null || heard.isEmpty() ? "" : heard.get(0));
        call.resolve(ret);
    }
}
