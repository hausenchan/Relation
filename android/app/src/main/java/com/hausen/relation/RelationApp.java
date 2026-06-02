package com.hausen.relation;

import android.app.Application;

import com.hausen.relation.api.ApiClient;
import com.hausen.relation.data.SessionStore;

public class RelationApp extends Application {
    private SessionStore sessionStore;
    private ApiClient apiClient;

    @Override
    public void onCreate() {
        super.onCreate();
        sessionStore = new SessionStore(this);
        apiClient = new ApiClient(sessionStore);
    }

    public SessionStore session() {
        return sessionStore;
    }

    public ApiClient api() {
        return apiClient;
    }
}
