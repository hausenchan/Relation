package com.hausen.relation.api;

public interface ApiCallback {
    void onSuccess(String body);
    void onError(String message);
}
