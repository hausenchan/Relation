package com.hausen.relation.ui;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.util.AttributeSet;
import android.view.View;

public class RelationIconView extends View {
    public static final int TASK = 1;
    public static final int OPPORTUNITY = 2;
    public static final int PERSON = 3;
    public static final int COMPANY = 4;
    public static final int MORE = 5;
    public static final int SEARCH = 6;
    public static final int FILTER = 7;
    public static final int PLUS = 8;
    public static final int REFRESH = 9;
    public static final int LOGOUT = 10;

    private final Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
    private int type = TASK;
    private int iconColor = Ui.SECONDARY;

    public RelationIconView(Context context) {
        super(context);
        init();
    }

    public RelationIconView(Context context, AttributeSet attrs) {
        super(context, attrs);
        init();
    }

    public RelationIconView(Context context, int type) {
        super(context);
        this.type = type;
        init();
    }

    private void init() {
        stroke.setStyle(Paint.Style.STROKE);
        stroke.setStrokeCap(Paint.Cap.ROUND);
        stroke.setStrokeJoin(Paint.Join.ROUND);
        fill.setStyle(Paint.Style.FILL);
    }

    public void setType(int type) {
        this.type = type;
        invalidate();
    }

    public void setIconColor(int color) {
        this.iconColor = color;
        invalidate();
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        float w = getWidth();
        float h = getHeight();
        float s = Math.min(w, h);
        float x = (w - s) / 2f;
        float y = (h - s) / 2f;
        stroke.setColor(iconColor);
        fill.setColor(iconColor);
        stroke.setStrokeWidth(Math.max(2.2f, s * 0.075f));

        switch (type) {
            case TASK:
                drawTask(canvas, x, y, s);
                break;
            case OPPORTUNITY:
                drawOpportunity(canvas, x, y, s);
                break;
            case PERSON:
                drawPerson(canvas, x, y, s);
                break;
            case COMPANY:
                drawCompany(canvas, x, y, s);
                break;
            case MORE:
                drawMore(canvas, x, y, s);
                break;
            case SEARCH:
                drawSearch(canvas, x, y, s);
                break;
            case FILTER:
                drawFilter(canvas, x, y, s);
                break;
            case PLUS:
                drawPlus(canvas, x, y, s);
                break;
            case REFRESH:
                drawRefresh(canvas, x, y, s);
                break;
            case LOGOUT:
                drawLogout(canvas, x, y, s);
                break;
            default:
                drawMore(canvas, x, y, s);
        }
    }

    private void drawTask(Canvas c, float x, float y, float s) {
        RectF r = new RectF(x + s * .2f, y + s * .14f, x + s * .8f, y + s * .86f);
        c.drawRoundRect(r, s * .12f, s * .12f, stroke);
        c.drawLine(x + s * .35f, y + s * .38f, x + s * .68f, y + s * .38f, stroke);
        c.drawLine(x + s * .35f, y + s * .56f, x + s * .68f, y + s * .56f, stroke);
        c.drawLine(x + s * .35f, y + s * .74f, x + s * .58f, y + s * .74f, stroke);
    }

    private void drawOpportunity(Canvas c, float x, float y, float s) {
        RectF r = new RectF(x + s * .18f, y + s * .2f, x + s * .82f, y + s * .8f);
        c.drawRoundRect(r, s * .16f, s * .16f, stroke);
        c.drawLine(x + s * .28f, y + s * .55f, x + s * .44f, y + s * .42f, stroke);
        c.drawLine(x + s * .44f, y + s * .42f, x + s * .56f, y + s * .52f, stroke);
        c.drawLine(x + s * .56f, y + s * .52f, x + s * .73f, y + s * .35f, stroke);
        c.drawLine(x + s * .64f, y + s * .35f, x + s * .73f, y + s * .35f, stroke);
        c.drawLine(x + s * .73f, y + s * .35f, x + s * .73f, y + s * .44f, stroke);
    }

    private void drawPerson(Canvas c, float x, float y, float s) {
        c.drawCircle(x + s * .5f, y + s * .34f, s * .16f, stroke);
        RectF body = new RectF(x + s * .23f, y + s * .56f, x + s * .77f, y + s * .86f);
        c.drawArc(body, 205, 130, false, stroke);
    }

    private void drawCompany(Canvas c, float x, float y, float s) {
        RectF r = new RectF(x + s * .22f, y + s * .18f, x + s * .78f, y + s * .84f);
        c.drawRoundRect(r, s * .07f, s * .07f, stroke);
        for (int row = 0; row < 3; row++) {
            float yy = y + s * (.34f + row * .14f);
            c.drawLine(x + s * .35f, yy, x + s * .43f, yy, stroke);
            c.drawLine(x + s * .57f, yy, x + s * .65f, yy, stroke);
        }
        c.drawLine(x + s * .5f, y + s * .7f, x + s * .5f, y + s * .84f, stroke);
    }

    private void drawMore(Canvas c, float x, float y, float s) {
        c.drawCircle(x + s * .32f, y + s * .5f, s * .055f, fill);
        c.drawCircle(x + s * .5f, y + s * .5f, s * .055f, fill);
        c.drawCircle(x + s * .68f, y + s * .5f, s * .055f, fill);
    }

    private void drawSearch(Canvas c, float x, float y, float s) {
        c.drawCircle(x + s * .45f, y + s * .44f, s * .22f, stroke);
        c.drawLine(x + s * .61f, y + s * .61f, x + s * .78f, y + s * .78f, stroke);
    }

    private void drawFilter(Canvas c, float x, float y, float s) {
        c.drawLine(x + s * .22f, y + s * .3f, x + s * .78f, y + s * .3f, stroke);
        c.drawLine(x + s * .32f, y + s * .5f, x + s * .68f, y + s * .5f, stroke);
        c.drawLine(x + s * .42f, y + s * .7f, x + s * .58f, y + s * .7f, stroke);
    }

    private void drawPlus(Canvas c, float x, float y, float s) {
        c.drawCircle(x + s * .5f, y + s * .5f, s * .3f, stroke);
        c.drawLine(x + s * .5f, y + s * .34f, x + s * .5f, y + s * .66f, stroke);
        c.drawLine(x + s * .34f, y + s * .5f, x + s * .66f, y + s * .5f, stroke);
    }

    private void drawRefresh(Canvas c, float x, float y, float s) {
        RectF r = new RectF(x + s * .24f, y + s * .24f, x + s * .76f, y + s * .76f);
        c.drawArc(r, 35, 285, false, stroke);
        Path arrow = new Path();
        arrow.moveTo(x + s * .72f, y + s * .28f);
        arrow.lineTo(x + s * .82f, y + s * .31f);
        arrow.lineTo(x + s * .77f, y + s * .4f);
        c.drawPath(arrow, stroke);
    }

    private void drawLogout(Canvas c, float x, float y, float s) {
        c.drawLine(x + s * .28f, y + s * .24f, x + s * .28f, y + s * .76f, stroke);
        c.drawLine(x + s * .28f, y + s * .24f, x + s * .55f, y + s * .24f, stroke);
        c.drawLine(x + s * .28f, y + s * .76f, x + s * .55f, y + s * .76f, stroke);
        c.drawLine(x + s * .48f, y + s * .5f, x + s * .78f, y + s * .5f, stroke);
        c.drawLine(x + s * .68f, y + s * .4f, x + s * .78f, y + s * .5f, stroke);
        c.drawLine(x + s * .68f, y + s * .6f, x + s * .78f, y + s * .5f, stroke);
    }
}
