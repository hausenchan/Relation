package com.hausen.relation.data;

import org.json.JSONObject;

public class MobileItem {
    public int id;
    public String kind;
    public String title;
    public String subtitle;
    public String status;
    public String statusLabel;
    public String meta;
    public String body;
    public boolean canStart;
    public boolean canDone;
    public JSONObject raw;

    public MobileItem(int id, String kind, String title) {
        this.id = id;
        this.kind = kind;
        this.title = title;
    }
}
