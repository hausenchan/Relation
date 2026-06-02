package com.hausen.relation.api;

import android.os.Handler;
import android.os.Looper;

import com.hausen.relation.data.SessionStore;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class ApiClient {
    private final SessionStore sessionStore;
    private final ExecutorService executor = Executors.newFixedThreadPool(4);
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    public ApiClient(SessionStore sessionStore) {
        this.sessionStore = sessionStore;
    }

    public void login(String baseUrl, String username, String password, ApiCallback callback) {
        sessionStore.setBaseUrl(baseUrl);
        JSONObject payload = new JSONObject();
        try {
            payload.put("username", username);
            payload.put("password", password);
        } catch (Exception ignored) {
        }
        request("POST", "/auth/login", payload, callback);
    }

    public void login(String username, String password, ApiCallback callback) {
        login(SessionStore.DEFAULT_BASE_URL, username, password, callback);
    }

    public void get(String path, ApiCallback callback) {
        request("GET", path, null, callback);
    }

    public void post(String path, JSONObject payload, ApiCallback callback) {
        request("POST", path, payload, callback);
    }

    public void put(String path, JSONObject payload, ApiCallback callback) {
        request("PUT", path, payload, callback);
    }

    private void request(String method, String path, JSONObject payload, ApiCallback callback) {
        executor.execute(() -> {
            HttpURLConnection connection = null;
            try {
                URL url = new URL(buildUrl(path));
                connection = (HttpURLConnection) url.openConnection();
                connection.setRequestMethod(method);
                connection.setConnectTimeout(10000);
                connection.setReadTimeout(15000);
                connection.setRequestProperty("Accept", "application/json");
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                String token = sessionStore.token();
                if (token != null && !token.isEmpty()) {
                    connection.setRequestProperty("Authorization", "Bearer " + token);
                }
                if (payload != null) {
                    connection.setDoOutput(true);
                    try (OutputStream os = connection.getOutputStream();
                         BufferedWriter writer = new BufferedWriter(new OutputStreamWriter(os, StandardCharsets.UTF_8))) {
                        writer.write(payload.toString());
                    }
                }

                int code = connection.getResponseCode();
                InputStream stream = code >= 200 && code < 300 ? connection.getInputStream() : connection.getErrorStream();
                String body = readStream(stream);
                if (code >= 200 && code < 300) {
                    postSuccess(callback, body);
                } else {
                    postError(callback, parseError(body, code));
                }
            } catch (Exception e) {
                postError(callback, e.getMessage() == null ? "网络请求失败" : e.getMessage());
            } finally {
                if (connection != null) connection.disconnect();
            }
        });
    }

    private String buildUrl(String path) {
        String normalizedPath = path.startsWith("/") ? path : "/" + path;
        return sessionStore.baseUrl() + normalizedPath;
    }

    private String readStream(InputStream stream) throws Exception {
        if (stream == null) return "";
        StringBuilder builder = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) builder.append(line);
        }
        return builder.toString();
    }

    private String parseError(String body, int code) {
        try {
            JSONObject json = new JSONObject(body);
            String error = json.optString("error", "");
            if (!error.isEmpty()) return error;
        } catch (Exception ignored) {
        }
        return "请求失败 (" + code + ")";
    }

    private void postSuccess(ApiCallback callback, String body) {
        mainHandler.post(() -> callback.onSuccess(body));
    }

    private void postError(ApiCallback callback, String message) {
        mainHandler.post(() -> callback.onError(message));
    }
}
