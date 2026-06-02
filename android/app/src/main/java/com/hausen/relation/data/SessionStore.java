package com.hausen.relation.data;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

public class SessionStore {
    private static final String PREFS = "relation_session";
    private static final String KEY_BASE_URL = "base_url";
    private static final String KEY_TOKEN = "token";
    private static final String KEY_USER = "user_json";
    public static final String DEFAULT_BASE_URL = "https://relation.midongtech.com/api";

    private final SharedPreferences preferences;

    public SessionStore(Context context) {
        preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public String baseUrl() {
        return DEFAULT_BASE_URL;
    }

    public void setBaseUrl(String url) {
        preferences.edit().putString(KEY_BASE_URL, DEFAULT_BASE_URL).apply();
    }

    public String token() {
        return preferences.getString(KEY_TOKEN, "");
    }

    public boolean isLoggedIn() {
        return token() != null && !token().isEmpty();
    }

    public JSONObject user() {
        try {
            return new JSONObject(preferences.getString(KEY_USER, "{}"));
        } catch (Exception e) {
            return new JSONObject();
        }
    }

    public String displayName() {
        JSONObject user = user();
        String displayName = user.optString("display_name", "");
        if (!displayName.isEmpty()) return displayName;
        return user.optString("username", "商务");
    }

    public int userId() {
        return user().optInt("id", 0);
    }

    public void saveLogin(String token, JSONObject user) {
        preferences.edit()
            .putString(KEY_TOKEN, token == null ? "" : token)
            .putString(KEY_USER, user == null ? "{}" : user.toString())
            .apply();
    }

    public void clearLogin() {
        preferences.edit()
            .remove(KEY_TOKEN)
            .remove(KEY_USER)
            .apply();
    }

    private String normalizeBaseUrl(String raw) {
        String url = raw == null ? DEFAULT_BASE_URL : raw.trim();
        if (url.endsWith("/")) url = url.substring(0, url.length() - 1);
        if (!url.endsWith("/api")) url = url + "/api";
        return url;
    }
}
