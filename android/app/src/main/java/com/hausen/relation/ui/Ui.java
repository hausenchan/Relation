package com.hausen.relation.ui;

import android.content.Context;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

public final class Ui {
    public static final int PAGE = Color.rgb(245, 245, 245);
    public static final int SURFACE = Color.WHITE;
    public static final int PRIMARY = Color.rgb(7, 193, 96);
    public static final int PRIMARY_DARK = Color.rgb(18, 150, 85);
    public static final int TEXT = Color.rgb(17, 17, 17);
    public static final int SECONDARY = Color.rgb(128, 128, 128);
    public static final int TERTIARY = Color.rgb(168, 168, 168);
    public static final int LINE = Color.rgb(232, 232, 232);
    public static final int BAR = Color.rgb(247, 247, 247);
    public static final int SEARCH_BG = Color.rgb(237, 237, 237);
    public static final int SOFT_GREEN = Color.rgb(232, 248, 239);
    public static final int SOFT_BLUE = Color.rgb(236, 244, 255);
    public static final int SOFT_ORANGE = Color.rgb(255, 244, 230);

    private Ui() {
    }

    public static int dp(Context context, float value) {
        return Math.round(value * context.getResources().getDisplayMetrics().density);
    }

    public static TextView text(Context context, String value, float sp, int color, int style) {
        TextView view = new TextView(context);
        view.setText(value == null ? "" : value);
        view.setTextSize(sp);
        view.setTextColor(color);
        view.setIncludeFontPadding(false);
        view.setLineSpacing(dp(context, 1), 1.0f);
        if (style != Typeface.NORMAL) view.setTypeface(Typeface.DEFAULT, style);
        return view;
    }

    public static TextView ellipsize(TextView view, int lines) {
        view.setMaxLines(lines);
        view.setEllipsize(TextUtils.TruncateAt.END);
        return view;
    }

    public static GradientDrawable bg(int color, float radiusDp, Context context) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(color);
        drawable.setCornerRadius(dp(context, radiusDp));
        return drawable;
    }

    public static GradientDrawable strokeBg(Context context, int color, float radiusDp, int strokeColor) {
        GradientDrawable drawable = bg(color, radiusDp, context);
        drawable.setStroke(dp(context, 1), strokeColor);
        return drawable;
    }

    public static LinearLayout vertical(Context context) {
        LinearLayout layout = new LinearLayout(context);
        layout.setOrientation(LinearLayout.VERTICAL);
        return layout;
    }

    public static LinearLayout horizontal(Context context) {
        LinearLayout layout = new LinearLayout(context);
        layout.setOrientation(LinearLayout.HORIZONTAL);
        layout.setGravity(Gravity.CENTER_VERTICAL);
        return layout;
    }

    public static View spacer(Context context, int heightDp) {
        View view = new View(context);
        view.setLayoutParams(new LinearLayout.LayoutParams(1, dp(context, heightDp)));
        return view;
    }

    public static TextView chip(Context context, String label, int bgColor, int textColor) {
        TextView view = text(context, label, 12, textColor, Typeface.NORMAL);
        view.setSingleLine(true);
        view.setGravity(Gravity.CENTER);
        view.setPadding(dp(context, 8), dp(context, 3), dp(context, 8), dp(context, 3));
        view.setBackground(bg(bgColor, 999, context));
        return view;
    }

    public static Button actionButton(Context context, String label, boolean primary) {
        Button button = new Button(context);
        button.setAllCaps(false);
        button.setText(label);
        button.setTextSize(13);
        button.setMinHeight(0);
        button.setMinWidth(0);
        button.setPadding(dp(context, 10), 0, dp(context, 10), 0);
        button.setTextColor(primary ? Color.WHITE : PRIMARY);
        button.setBackground(primary
            ? bg(PRIMARY, 7, context)
            : strokeBg(context, Color.WHITE, 7, Color.rgb(191, 221, 205)));
        button.setGravity(Gravity.CENTER);
        button.setLayoutParams(new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(context, 34)));
        return button;
    }
}
