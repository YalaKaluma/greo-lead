package com.AlfredTheChiefOfStaff.myapp;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "SessionCredentials")
public class SessionCredentialsPlugin extends Plugin {
    private static final String KEY_ALIAS = "alfred_session_credentials";
    private static final String PREFERENCES_NAME = "alfred_secure_session";
    private static final String CIPHERTEXT_KEY = "ciphertext";
    private static final String IV_KEY = "iv";

    @PluginMethod
    public void set(PluginCall call) {
        String token = call.getString("token");
        if (token == null || token.isEmpty()) {
            clearStoredCredential();
            call.resolve();
            return;
        }
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey());
            byte[] encrypted = cipher.doFinal(token.getBytes(StandardCharsets.UTF_8));
            preferences().edit()
                .putString(CIPHERTEXT_KEY, Base64.encodeToString(encrypted, Base64.NO_WRAP))
                .putString(IV_KEY, Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
                .apply();
            call.resolve();
        } catch (Exception error) {
            call.reject("Could not securely store the session credential", error);
        }
    }

    @PluginMethod
    public void get(PluginCall call) {
        String ciphertext = preferences().getString(CIPHERTEXT_KEY, null);
        String iv = preferences().getString(IV_KEY, null);
        JSObject result = new JSObject();
        if (ciphertext == null || iv == null) {
            result.put("token", JSObject.NULL);
            call.resolve(result);
            return;
        }
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), new GCMParameterSpec(
                128,
                Base64.decode(iv, Base64.NO_WRAP)
            ));
            byte[] decrypted = cipher.doFinal(Base64.decode(ciphertext, Base64.NO_WRAP));
            result.put("token", new String(decrypted, StandardCharsets.UTF_8));
            call.resolve(result);
        } catch (Exception error) {
            clearStoredCredential();
            call.reject("Could not restore the secure session credential", error);
        }
    }

    @PluginMethod
    public void clear(PluginCall call) {
        clearStoredCredential();
        call.resolve();
    }

    private SharedPreferences preferences() {
        return getContext().getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE);
    }

    private void clearStoredCredential() {
        preferences().edit().clear().apply();
    }

    private SecretKey getOrCreateKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        SecretKey existingKey = (SecretKey) keyStore.getKey(KEY_ALIAS, null);
        if (existingKey != null) return existingKey;

        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(
            KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
        ).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .build());
        return generator.generateKey();
    }
}
