package com.hausen.relation;

import android.app.AlertDialog;
import android.app.DatePickerDialog;
import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Bundle;
import android.text.InputType;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.widget.Button;
import android.widget.DatePicker;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import android.app.Activity;

import com.hausen.relation.api.ApiCallback;
import com.hausen.relation.api.ApiClient;
import com.hausen.relation.data.MobileItem;
import com.hausen.relation.data.SessionStore;
import com.hausen.relation.ui.RelationIconView;
import com.hausen.relation.ui.Ui;

import org.json.JSONArray;
import org.json.JSONObject;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class MainActivity extends Activity {
    private static final int TAB_TASKS = 0;
    private static final int TAB_OPPORTUNITIES = 1;
    private static final int TAB_PERSONS = 2;
    private static final int TAB_COMPANIES = 3;
    private static final int TAB_MORE = 4;

    private static final String[][] BUDGET_OPTIONS = {
        {"h5", "H5"}, {"api", "API"}, {"assist", "助力"}, {"acquisition", "拉新"},
        {"reactivation", "拉活"}, {"sdk", "SDK"}, {"other", "其他"}
    };
    private static final String[][] TRAFFIC_OPTIONS = {
        {"app", "APP"}, {"h5", "H5"}, {"wechat_mini_program", "微信小程序"},
        {"alipay_mini_program", "支付宝小程序"}, {"quick_app", "快应用"},
        {"wechat_group", "微信社群"}, {"alipay_group", "支付宝社群"},
        {"douyin_mini_program", "抖音小程序"}, {"adx", "Adx"},
        {"account_launch", "开户投放"}, {"other", "其他"}
    };

    private RelationApp app;
    private SessionStore session;
    private ApiClient api;
    private LinearLayout root;
    private LinearLayout content;
    private LinearLayout bottomNav;
    private TextView toastAnchor;
    private int currentTab = TAB_TASKS;
    private String taskFilter = "open";
    private String opportunityStatusFilter = "";
    private String personsSearch = "";
    private String selectedBudgetFilter = "";
    private String selectedOwnedTrafficFilter = "";
    private String selectedAgencyTrafficFilter = "";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        app = (RelationApp) getApplication();
        session = app.session();
        api = app.api();
        if (session.isLoggedIn()) {
            showMain();
        } else {
            showLogin();
        }
    }

    private void showLogin() {
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(Ui.PAGE);
        LinearLayout page = Ui.vertical(this);
        page.setGravity(Gravity.CENTER_HORIZONTAL);
        page.setPadding(Ui.dp(this, 24), Ui.dp(this, 48), Ui.dp(this, 24), Ui.dp(this, 32));
        scroll.addView(page, new ScrollView.LayoutParams(-1, -2));

        ImageView logo = new ImageView(this);
        logo.setImageResource(getResources().getIdentifier("ic_launcher", "drawable", getPackageName()));
        page.addView(logo, new LinearLayout.LayoutParams(Ui.dp(this, 64), Ui.dp(this, 64)));
        page.addView(Ui.spacer(this, 16));

        TextView title = Ui.text(this, "幂动组织中台", 26, Ui.TEXT, Typeface.BOLD);
        title.setGravity(Gravity.CENTER);
        page.addView(title, new LinearLayout.LayoutParams(-1, -2));
        TextView desc = Ui.text(this, "任务、商机、人脉、公司研究，移动场景优先。", 14, Ui.SECONDARY, Typeface.NORMAL);
        desc.setGravity(Gravity.CENTER);
        page.addView(desc, new LinearLayout.LayoutParams(-1, -2));
        page.addView(Ui.spacer(this, 28));

        LinearLayout card = Ui.vertical(this);
        card.setPadding(Ui.dp(this, 18), Ui.dp(this, 18), Ui.dp(this, 18), Ui.dp(this, 18));
        card.setBackground(Ui.bg(Color.WHITE, 12, this));
        page.addView(card, new LinearLayout.LayoutParams(-1, -2));

        EditText username = input("用户名", "", EditorInfo.IME_ACTION_NEXT);
        EditText password = input("密码", "", EditorInfo.IME_ACTION_DONE);
        password.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        Button login = Ui.actionButton(this, "登录", true);
        login.setTextSize(15);
        login.setLayoutParams(new LinearLayout.LayoutParams(-1, Ui.dp(this, 44)));

        card.addView(label("账号"));
        card.addView(username);
        card.addView(Ui.spacer(this, 12));
        card.addView(label("密码"));
        card.addView(password);
        card.addView(Ui.spacer(this, 18));
        card.addView(login);

        login.setOnClickListener(v -> {
            String user = username.getText().toString().trim();
            String pass = password.getText().toString();
            if (user.isEmpty() || pass.isEmpty()) {
                showToast("请输入用户名和密码");
                return;
            }
            login.setEnabled(false);
            login.setText("登录中...");
            api.login(user, pass, new ApiCallback() {
                @Override
                public void onSuccess(String body) {
                    login.setEnabled(true);
                    login.setText("登录");
                    try {
                        JSONObject json = new JSONObject(body);
                        session.saveLogin(json.optString("token"), json.optJSONObject("user"));
                        showMain();
                    } catch (Exception e) {
                        showToast("登录响应解析失败");
                    }
                }

                @Override
                public void onError(String message) {
                    login.setEnabled(true);
                    login.setText("登录");
                    showToast(message);
                }
            });
        });

        setContentView(scroll);
    }

    private EditText input(String hint, String value, int imeAction) {
        EditText edit = new EditText(this);
        edit.setSingleLine(true);
        edit.setText(value == null ? "" : value);
        edit.setHint(hint);
        edit.setTextSize(15);
        edit.setTextColor(Ui.TEXT);
        edit.setHintTextColor(Color.rgb(160, 166, 176));
        edit.setImeOptions(imeAction);
        edit.setPadding(Ui.dp(this, 12), 0, Ui.dp(this, 12), 0);
        edit.setBackground(Ui.strokeBg(this, Color.WHITE, 8, Ui.LINE));
        edit.setLayoutParams(new LinearLayout.LayoutParams(-1, Ui.dp(this, 44)));
        return edit;
    }

    private TextView label(String value) {
        TextView label = Ui.text(this, value, 13, Ui.SECONDARY, Typeface.NORMAL);
        label.setPadding(0, 0, 0, Ui.dp(this, 6));
        return label;
    }

    private void showMain() {
        root = Ui.vertical(this);
        root.setBackgroundColor(Ui.PAGE);

        FrameLayout body = new FrameLayout(this);
        LinearLayout mainArea = Ui.vertical(this);
        body.addView(mainArea, new FrameLayout.LayoutParams(-1, -1));

        LinearLayout top = Ui.horizontal(this);
        top.setGravity(Gravity.CENTER_VERTICAL);
        top.setPadding(Ui.dp(this, 16), Ui.dp(this, 10), Ui.dp(this, 12), Ui.dp(this, 8));
        top.setBackgroundColor(Ui.PAGE);
        TextView brand = Ui.text(this, "幂动组织中台", 19, Ui.TEXT, Typeface.BOLD);
        top.addView(brand, new LinearLayout.LayoutParams(0, -2, 1));
        top.addView(iconButton(RelationIconView.SEARCH, () -> showSearchDialog()));
        top.addView(iconButton(RelationIconView.FILTER, () -> showFilterDialog()));
        top.addView(iconButton(RelationIconView.PLUS, () -> showCreateDialog()));
        top.addView(iconButton(RelationIconView.REFRESH, () -> loadCurrentTab()));
        mainArea.addView(top, new LinearLayout.LayoutParams(-1, Ui.dp(this, 56)));

        toastAnchor = Ui.text(this, "", 1, Color.TRANSPARENT, Typeface.NORMAL);
        mainArea.addView(toastAnchor, new LinearLayout.LayoutParams(1, 1));

        content = Ui.vertical(this);
        mainArea.addView(content, new LinearLayout.LayoutParams(-1, 0, 1));

        bottomNav = Ui.horizontal(this);
        bottomNav.setGravity(Gravity.CENTER);
        bottomNav.setPadding(Ui.dp(this, 4), Ui.dp(this, 4), Ui.dp(this, 4), Ui.dp(this, 5));
        bottomNav.setBackground(Ui.strokeBg(this, Color.WHITE, 0, Ui.LINE));
        mainArea.addView(bottomNav, new LinearLayout.LayoutParams(-1, Ui.dp(this, 62)));

        root.addView(body, new LinearLayout.LayoutParams(-1, -1));
        setContentView(root);
        renderBottomNav();
        switchTab(TAB_TASKS);
    }

    private View iconButton(int type, Runnable click) {
        FrameLayout box = new FrameLayout(this);
        box.setPadding(Ui.dp(this, 6), Ui.dp(this, 6), Ui.dp(this, 6), Ui.dp(this, 6));
        RelationIconView icon = new RelationIconView(this, type);
        icon.setIconColor(Ui.TEXT);
        FrameLayout.LayoutParams iconLp = new FrameLayout.LayoutParams(Ui.dp(this, 26), Ui.dp(this, 26), Gravity.CENTER);
        box.addView(icon, iconLp);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(Ui.dp(this, 38), Ui.dp(this, 38));
        lp.leftMargin = Ui.dp(this, 2);
        box.setLayoutParams(lp);
        box.setOnClickListener(v -> click.run());
        return box;
    }

    private void renderBottomNav() {
        bottomNav.removeAllViews();
        addNavItem(TAB_TASKS, RelationIconView.TASK, "任务");
        addNavItem(TAB_OPPORTUNITIES, RelationIconView.OPPORTUNITY, "商机");
        addNavItem(TAB_PERSONS, RelationIconView.PERSON, "人脉");
        addNavItem(TAB_COMPANIES, RelationIconView.COMPANY, "公司");
        addNavItem(TAB_MORE, RelationIconView.MORE, "其他");
    }

    private void addNavItem(int tab, int iconType, String label) {
        LinearLayout item = Ui.vertical(this);
        item.setGravity(Gravity.CENTER);
        item.setPadding(0, Ui.dp(this, 2), 0, 0);
        boolean active = currentTab == tab;
        RelationIconView icon = new RelationIconView(this, iconType);
        icon.setIconColor(active ? Ui.PRIMARY : Ui.SECONDARY);
        TextView text = Ui.text(this, label, 11, active ? Ui.PRIMARY : Ui.SECONDARY, active ? Typeface.BOLD : Typeface.NORMAL);
        text.setGravity(Gravity.CENTER);
        item.addView(icon, new LinearLayout.LayoutParams(Ui.dp(this, 25), Ui.dp(this, 25)));
        item.addView(text, new LinearLayout.LayoutParams(-2, -2));
        item.setOnClickListener(v -> switchTab(tab));
        bottomNav.addView(item, new LinearLayout.LayoutParams(0, -1, 1));
    }

    private void switchTab(int tab) {
        currentTab = tab;
        renderBottomNav();
        renderLoading();
        loadCurrentTab();
    }

    private void loadCurrentTab() {
        switch (currentTab) {
            case TAB_TASKS:
                loadTasks();
                break;
            case TAB_OPPORTUNITIES:
                loadOpportunities();
                break;
            case TAB_PERSONS:
                loadPersons();
                break;
            case TAB_COMPANIES:
                loadCompanies();
                break;
            case TAB_MORE:
                renderMore();
                break;
            default:
                loadTasks();
        }
    }

    private void renderLoading() {
        content.removeAllViews();
        LinearLayout box = Ui.vertical(this);
        box.setGravity(Gravity.CENTER);
        ProgressBar progress = new ProgressBar(this);
        box.addView(progress, new LinearLayout.LayoutParams(Ui.dp(this, 42), Ui.dp(this, 42)));
        TextView text = Ui.text(this, "加载中", 13, Ui.SECONDARY, Typeface.NORMAL);
        text.setGravity(Gravity.CENTER);
        box.addView(text);
        content.addView(box, new LinearLayout.LayoutParams(-1, -1));
    }

    private void loadTasks() {
        final List<MobileItem> items = new ArrayList<>();
        String normalPath = "/tasks";
        if ("mine".equals(taskFilter)) normalPath += "?mine=1";
        if ("done".equals(taskFilter)) normalPath += "?status=done";
        api.get(normalPath, new ApiCallback() {
            @Override
            public void onSuccess(String body) {
                items.addAll(parseNormalTasks(body));
                String followPath = "/follow-up-tasks";
                if ("done".equals(taskFilter)) followPath += "?status=done";
                api.get(followPath, new ApiCallback() {
                    @Override
                    public void onSuccess(String followBody) {
                        items.addAll(parseFollowTasks(followBody));
                        if ("open".equals(taskFilter) || "mine".equals(taskFilter)) {
                            List<MobileItem> filtered = new ArrayList<>();
                            for (MobileItem item : items) {
                                String status = item.status == null ? "" : item.status;
                                if (!"done".equals(status)) filtered.add(item);
                            }
                            renderList(filtered, "暂无待处理任务");
                        } else {
                            renderList(items, "暂无任务");
                        }
                    }

                    @Override
                    public void onError(String message) {
                        renderList(items, items.isEmpty() ? message : "暂无任务");
                    }
                });
            }

            @Override
            public void onError(String message) {
                renderError(message, () -> loadTasks());
            }
        });
    }

    private List<MobileItem> parseNormalTasks(String body) {
        List<MobileItem> items = new ArrayList<>();
        JSONArray array = safeArray(body);
        int me = session.userId();
        for (int i = 0; i < array.length(); i++) {
            JSONObject o = array.optJSONObject(i);
            if (o == null) continue;
            MobileItem item = new MobileItem(o.optInt("id"), "task", o.optString("title", "未命名任务"));
            item.subtitle = "负责人：" + nonEmpty(o.optString("assigned_to_name"), "未指派");
            item.status = o.optString("status");
            item.statusLabel = taskStatus(item.status);
            item.meta = join(" · ", priorityLabel(o.optString("priority")), o.optString("date"), o.optString("created_by_name"));
            item.body = o.optString("description", "");
            boolean canOperate = o.optInt("assigned_to") == me || o.optInt("created_by") == me;
            item.canStart = "pending".equals(item.status) && canOperate;
            item.canDone = "in_progress".equals(item.status) && canOperate;
            item.raw = o;
            items.add(item);
        }
        return items;
    }

    private List<MobileItem> parseFollowTasks(String body) {
        List<MobileItem> items = new ArrayList<>();
        JSONArray array = safeArray(body);
        int me = session.userId();
        for (int i = 0; i < array.length(); i++) {
            JSONObject o = array.optJSONObject(i);
            if (o == null) continue;
            MobileItem item = new MobileItem(o.optInt("id"), "follow", o.optString("title", "商机跟进任务"));
            item.subtitle = join(" / ", o.optString("person_name"), o.optString("company_name"), o.optString("company"), o.optString("current_company"));
            item.status = o.optString("status");
            item.statusLabel = followStatus(item.status);
            item.meta = join(" · ", "指派人：" + nonEmpty(o.optString("assigned_by_name"), "-"), "截止：" + nonEmpty(o.optString("due_date"), "-"));
            item.body = nonEmpty(o.optString("opportunity_title"), o.optString("opportunity_note"));
            item.canStart = "pending".equals(item.status) && o.optInt("assigned_to") == me;
            item.canDone = "in_progress".equals(item.status) && o.optInt("assigned_to") == me;
            item.raw = o;
            items.add(item);
        }
        return items;
    }

    private void loadOpportunities() {
        String path = "/opportunities";
        if (!opportunityStatusFilter.isEmpty()) path += "?status=" + enc(opportunityStatusFilter);
        api.get(path, new ApiCallback() {
            @Override
            public void onSuccess(String body) {
                List<MobileItem> items = new ArrayList<>();
                JSONArray array = safeArray(body);
                for (int i = 0; i < array.length(); i++) {
                    JSONObject o = array.optJSONObject(i);
                    if (o == null) continue;
                    MobileItem item = new MobileItem(o.optInt("id"), "opportunity", o.optString("opportunity_title", "未命名商机"));
                    item.subtitle = "competitor_research".equals(o.optString("source_type"))
                        ? nonEmpty(o.optString("company_name"), "公司")
                        : join(" / ", o.optString("person_name"), o.optString("company"), o.optString("current_company"));
                    item.status = o.optString("opportunity_status", "new");
                    item.statusLabel = opportunityStatus(item.status);
                    item.meta = join(" · ", "跟进人：" + nonEmpty(o.optString("assignee_name"), "未指派"), o.optString("date"), "创建：" + nonEmpty(o.optString("created_by_name"), "-"));
                    item.body = stripHtml(o.optString("opportunity_note", ""));
                    item.raw = o;
                    items.add(item);
                }
                renderList(items, "暂无商机");
            }

            @Override
            public void onError(String message) {
                renderError(message, () -> loadOpportunities());
            }
        });
    }

    private void loadPersons() {
        StringBuilder path = new StringBuilder("/persons");
        List<String> params = new ArrayList<>();
        if (!personsSearch.isEmpty()) params.add("search=" + enc(personsSearch));
        if (!selectedBudgetFilter.isEmpty()) params.add("counterparty_budget_categories=" + enc(selectedBudgetFilter));
        if (!selectedOwnedTrafficFilter.isEmpty()) params.add("owned_traffic_scenarios=" + enc(selectedOwnedTrafficFilter));
        if (!selectedAgencyTrafficFilter.isEmpty()) params.add("agency_traffic_scenarios=" + enc(selectedAgencyTrafficFilter));
        if (!params.isEmpty()) path.append("?").append(TextUtils.join("&", params));

        api.get(path.toString(), new ApiCallback() {
            @Override
            public void onSuccess(String body) {
                List<MobileItem> items = new ArrayList<>();
                JSONArray array = safeArray(body);
                for (int i = 0; i < array.length(); i++) {
                    JSONObject o = array.optJSONObject(i);
                    if (o == null) continue;
                    MobileItem item = new MobileItem(o.optInt("id"), "person", o.optString("name", "未命名人脉"));
                    item.subtitle = join(" / ", o.optString("company"), o.optString("current_company"), o.optString("position"), o.optString("current_position"));
                    item.status = o.optString("weight");
                    item.statusLabel = weightLabel(item.status);
                    item.meta = join(" · ", personCategory(o.optString("person_category")), o.optString("city"), "更新：" + dateOnly(o.optString("updated_at")));
                    item.body = join("\n",
                        readableMulti("预算", o.optString("counterparty_budget_categories"), BUDGET_OPTIONS),
                        readableMulti("自有流量", o.optString("owned_traffic_scenarios"), TRAFFIC_OPTIONS),
                        readableMulti("代理流量", o.optString("agency_traffic_scenarios"), TRAFFIC_OPTIONS));
                    item.raw = o;
                    items.add(item);
                }
                renderList(items, "暂无人脉");
            }

            @Override
            public void onError(String message) {
                renderError(message, () -> loadPersons());
            }
        });
    }

    private void loadCompanies() {
        api.get("/companies", new ApiCallback() {
            @Override
            public void onSuccess(String body) {
                List<MobileItem> items = new ArrayList<>();
                JSONArray array = safeArray(body);
                for (int i = 0; i < array.length(); i++) {
                    JSONObject o = array.optJSONObject(i);
                    if (o == null) continue;
                    MobileItem item = new MobileItem(o.optInt("id"), "company", o.optString("name", "未命名公司"));
                    item.subtitle = join(" / ", o.optString("industry"), o.optString("hq_city"), o.optString("scale"));
                    item.status = o.optString("category");
                    item.statusLabel = companyCategory(item.status);
                    item.meta = join(" · ", "更新：" + dateOnly(o.optString("updated_at")), o.optString("created_by_name"));
                    item.body = join("\n", o.optString("business"), o.optString("tags"), o.optString("notes"));
                    item.raw = o;
                    items.add(item);
                }
                renderList(items, "暂无公司");
            }

            @Override
            public void onError(String message) {
                renderError(message, () -> loadCompanies());
            }
        });
    }

    private void renderList(List<MobileItem> items, String emptyText) {
        content.removeAllViews();
        LinearLayout page = Ui.vertical(this);
        page.setPadding(Ui.dp(this, 14), 0, Ui.dp(this, 14), Ui.dp(this, 12));
        addTabHeader(page);
        if (currentTab == TAB_TASKS) addTaskSegments(page);
        if (currentTab == TAB_PERSONS) addActivePersonFilters(page);
        if (items.isEmpty()) {
            page.addView(emptyView(emptyText), new LinearLayout.LayoutParams(-1, Ui.dp(this, 220)));
        } else {
            for (MobileItem item : items) {
                page.addView(cardFor(item));
                page.addView(Ui.spacer(this, 10));
            }
        }
        ScrollView scroll = new ScrollView(this);
        scroll.addView(page, new ScrollView.LayoutParams(-1, -2));
        content.addView(scroll, new LinearLayout.LayoutParams(-1, -1));
    }

    private void addTabHeader(LinearLayout page) {
        LinearLayout row = Ui.horizontal(this);
        row.setPadding(0, Ui.dp(this, 2), 0, Ui.dp(this, 10));
        TextView greeting = Ui.text(this, headerText(), 16, Ui.TEXT, Typeface.BOLD);
        row.addView(greeting, new LinearLayout.LayoutParams(0, -2, 1));
        TextView user = Ui.text(this, session.displayName(), 13, Ui.SECONDARY, Typeface.NORMAL);
        user.setGravity(Gravity.RIGHT);
        row.addView(user, new LinearLayout.LayoutParams(-2, -2));
        page.addView(row, new LinearLayout.LayoutParams(-1, -2));
    }

    private String headerText() {
        if (currentTab == TAB_TASKS) return "今天优先处理";
        if (currentTab == TAB_OPPORTUNITIES) return "正在推进";
        if (currentTab == TAB_PERSONS) return "重点联系人";
        if (currentTab == TAB_COMPANIES) return "关注公司";
        return "常用入口";
    }

    private void addTaskSegments(LinearLayout page) {
        LinearLayout row = Ui.horizontal(this);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(0, 0, 0, Ui.dp(this, 10));
        row.addView(segment("未完成", "open".equals(taskFilter), () -> {
            taskFilter = "open";
            loadTasks();
        }));
        row.addView(segment("我的", "mine".equals(taskFilter), () -> {
            taskFilter = "mine";
            loadTasks();
        }));
        row.addView(segment("已完成", "done".equals(taskFilter), () -> {
            taskFilter = "done";
            loadTasks();
        }));
        page.addView(row, new LinearLayout.LayoutParams(-1, -2));
    }

    private TextView segment(String label, boolean active, Runnable click) {
        TextView view = Ui.text(this, label, 13, active ? Color.WHITE : Ui.SECONDARY, active ? Typeface.BOLD : Typeface.NORMAL);
        view.setGravity(Gravity.CENTER);
        view.setPadding(Ui.dp(this, 14), Ui.dp(this, 7), Ui.dp(this, 14), Ui.dp(this, 7));
        view.setBackground(active ? Ui.bg(Ui.PRIMARY, 999, this) : Ui.strokeBg(this, Color.WHITE, 999, Ui.LINE));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-2, -2);
        lp.rightMargin = Ui.dp(this, 8);
        view.setLayoutParams(lp);
        view.setOnClickListener(v -> click.run());
        return view;
    }

    private void addActivePersonFilters(LinearLayout page) {
        List<String> chips = new ArrayList<>();
        if (!personsSearch.isEmpty()) chips.add("搜索：" + personsSearch);
        if (!selectedBudgetFilter.isEmpty()) chips.add("预算：" + multiLabel(selectedBudgetFilter, BUDGET_OPTIONS));
        if (!selectedOwnedTrafficFilter.isEmpty()) chips.add("自有：" + multiLabel(selectedOwnedTrafficFilter, TRAFFIC_OPTIONS));
        if (!selectedAgencyTrafficFilter.isEmpty()) chips.add("代理：" + multiLabel(selectedAgencyTrafficFilter, TRAFFIC_OPTIONS));
        if (chips.isEmpty()) return;
        HorizontalScrollView hsv = new HorizontalScrollView(this);
        hsv.setHorizontalScrollBarEnabled(false);
        LinearLayout row = Ui.horizontal(this);
        for (String chip : chips) {
            TextView view = Ui.chip(this, chip, Ui.SOFT_GREEN, Ui.PRIMARY);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-2, -2);
            lp.rightMargin = Ui.dp(this, 8);
            row.addView(view, lp);
        }
        TextView clear = Ui.chip(this, "清空", Color.rgb(245, 246, 248), Ui.SECONDARY);
        clear.setOnClickListener(v -> {
            personsSearch = "";
            selectedBudgetFilter = "";
            selectedOwnedTrafficFilter = "";
            selectedAgencyTrafficFilter = "";
            loadPersons();
        });
        row.addView(clear);
        hsv.addView(row);
        page.addView(hsv, new LinearLayout.LayoutParams(-1, Ui.dp(this, 38)));
    }

    private View emptyView(String text) {
        LinearLayout box = Ui.vertical(this);
        box.setGravity(Gravity.CENTER);
        box.setBackground(Ui.bg(Color.WHITE, 10, this));
        TextView title = Ui.text(this, text, 15, Ui.SECONDARY, Typeface.NORMAL);
        title.setGravity(Gravity.CENTER);
        box.addView(title);
        return box;
    }

    private View cardFor(MobileItem item) {
        LinearLayout card = Ui.vertical(this);
        card.setPadding(Ui.dp(this, 14), Ui.dp(this, 13), Ui.dp(this, 14), Ui.dp(this, 13));
        card.setBackground(Ui.strokeBg(this, Color.WHITE, 10, Ui.LINE));

        LinearLayout top = Ui.horizontal(this);
        top.setGravity(Gravity.TOP);
        LinearLayout titleCol = Ui.vertical(this);
        TextView title = Ui.ellipsize(Ui.text(this, item.title, 16, Ui.TEXT, Typeface.BOLD), 2);
        titleCol.addView(title);
        if (!empty(item.subtitle)) {
            TextView sub = Ui.ellipsize(Ui.text(this, item.subtitle, 13, Ui.SECONDARY, Typeface.NORMAL), 2);
            titleCol.addView(sub);
        }
        top.addView(titleCol, new LinearLayout.LayoutParams(0, -2, 1));
        if (!empty(item.statusLabel)) {
            top.addView(statusChip(item.statusLabel, item.status));
        }
        card.addView(top);

        if (!empty(item.meta)) {
            TextView meta = Ui.ellipsize(Ui.text(this, item.meta, 12, Ui.SECONDARY, Typeface.NORMAL), 2);
            meta.setPadding(0, Ui.dp(this, 8), 0, 0);
            card.addView(meta);
        }
        if (!empty(item.body)) {
            TextView body = Ui.ellipsize(Ui.text(this, item.body, 13, Color.rgb(74, 80, 92), Typeface.NORMAL), 3);
            body.setPadding(0, Ui.dp(this, 8), 0, 0);
            card.addView(body);
        }

        if (item.canStart || item.canDone) {
            LinearLayout actions = Ui.horizontal(this);
            actions.setGravity(Gravity.RIGHT);
            actions.setPadding(0, Ui.dp(this, 12), 0, 0);
            if (item.canStart) {
                Button start = Ui.actionButton(this, "开始", false);
                start.setOnClickListener(v -> updateTaskStatus(item, "in_progress"));
                actions.addView(start);
            }
            if (item.canDone) {
                Button done = Ui.actionButton(this, "完成", true);
                LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-2, Ui.dp(this, 34));
                lp.leftMargin = Ui.dp(this, 8);
                done.setLayoutParams(lp);
                done.setOnClickListener(v -> askDone(item));
                actions.addView(done);
            }
            card.addView(actions);
        }
        card.setOnClickListener(v -> showDetail(item));
        return card;
    }

    private TextView statusChip(String label, String status) {
        int bg = Color.rgb(245, 246, 248);
        int fg = Ui.SECONDARY;
        if ("in_progress".equals(status) || "following".equals(status)) {
            bg = Ui.SOFT_ORANGE;
            fg = Color.rgb(183, 98, 18);
        } else if ("done".equals(status) || "won".equals(status) || "high".equals(status)) {
            bg = Ui.SOFT_GREEN;
            fg = Ui.PRIMARY;
        } else if ("new".equals(status) || "medium".equals(status)) {
            bg = Ui.SOFT_BLUE;
            fg = Color.rgb(47, 103, 194);
        }
        return Ui.chip(this, label, bg, fg);
    }

    private void updateTaskStatus(MobileItem item, String status) {
        String path = "follow".equals(item.kind) ? "/follow-up-tasks/" + item.id : "/tasks/" + item.id;
        JSONObject payload = new JSONObject();
        try {
            payload.put("status", status);
        } catch (Exception ignored) {
        }
        api.put(path, payload, new ApiCallback() {
            @Override
            public void onSuccess(String body) {
                showToast("已更新");
                loadTasks();
            }

            @Override
            public void onError(String message) {
                showToast(message);
            }
        });
    }

    private void askDone(MobileItem item) {
        EditText note = input("完成备注", "", EditorInfo.IME_ACTION_DONE);
        note.setSingleLine(false);
        note.setMinLines(3);
        new AlertDialog.Builder(this)
            .setTitle("完成任务")
            .setView(note)
            .setNegativeButton("取消", null)
            .setPositiveButton("完成", (dialog, which) -> {
                String path = "follow".equals(item.kind) ? "/follow-up-tasks/" + item.id : "/tasks/" + item.id;
                JSONObject payload = new JSONObject();
                try {
                    payload.put("status", "done");
                    if ("follow".equals(item.kind)) payload.put("done_note", note.getText().toString());
                    else payload.put("result", note.getText().toString());
                } catch (Exception ignored) {
                }
                api.put(path, payload, new ApiCallback() {
                    @Override
                    public void onSuccess(String body) {
                        showToast("已完成");
                        loadTasks();
                    }

                    @Override
                    public void onError(String message) {
                        showToast(message);
                    }
                });
            })
            .show();
    }

    private void showDetail(MobileItem item) {
        LinearLayout box = Ui.vertical(this);
        box.setPadding(Ui.dp(this, 20), Ui.dp(this, 8), Ui.dp(this, 20), Ui.dp(this, 2));
        box.addView(detailLine("标题", item.title));
        box.addView(detailLine("对象", item.subtitle));
        box.addView(detailLine("状态", item.statusLabel));
        box.addView(detailLine("信息", item.meta));
        box.addView(detailLine("说明", item.body));
        new AlertDialog.Builder(this)
            .setTitle(detailTitle(item.kind))
            .setView(box)
            .setPositiveButton("关闭", null)
            .show();
    }

    private TextView detailLine(String label, String value) {
        TextView view = Ui.text(this, label + "：" + nonEmpty(value, "-"), 14, Ui.TEXT, Typeface.NORMAL);
        view.setPadding(0, Ui.dp(this, 6), 0, Ui.dp(this, 6));
        return view;
    }

    private String detailTitle(String kind) {
        if ("follow".equals(kind)) return "商机跟进";
        if ("task".equals(kind)) return "任务详情";
        if ("opportunity".equals(kind)) return "商机详情";
        if ("person".equals(kind)) return "人脉详情";
        if ("company".equals(kind)) return "公司详情";
        return "详情";
    }

    private void renderMore() {
        content.removeAllViews();
        LinearLayout page = Ui.vertical(this);
        page.setPadding(Ui.dp(this, 14), 0, Ui.dp(this, 14), Ui.dp(this, 12));
        addTabHeader(page);
        page.addView(moreEntry("目标", "目标计划里的目标拆解与进度", RelationIconView.TASK, "/goals"));
        page.addView(Ui.spacer(this, 10));
        page.addView(moreEntry("周报", "查看和维护业务周报", RelationIconView.TASK, "/weekly-reports"));
        page.addView(Ui.spacer(this, 10));
        page.addView(moreEntry("策略", "业务流转里的策略管理", RelationIconView.OPPORTUNITY, "/strategies"));
        page.addView(Ui.spacer(this, 10));
        page.addView(moreEntry("需求", "业务流转里的研发需求", RelationIconView.TASK, "/dev-tasks"));
        page.addView(Ui.spacer(this, 10));
        page.addView(moreEntry("文档中心", "制度、SOP、项目资料", RelationIconView.COMPANY, "/documents"));
        page.addView(Ui.spacer(this, 18));
        Button logout = Ui.actionButton(this, "退出登录", false);
        logout.setOnClickListener(v -> new AlertDialog.Builder(this)
            .setTitle("退出登录")
            .setMessage("确认退出当前账号？")
            .setNegativeButton("取消", null)
            .setPositiveButton("退出", (d, w) -> {
                session.clearLogin();
                showLogin();
            })
            .show());
        page.addView(logout, new LinearLayout.LayoutParams(-1, Ui.dp(this, 42)));
        ScrollView scroll = new ScrollView(this);
        scroll.addView(page);
        content.addView(scroll, new LinearLayout.LayoutParams(-1, -1));
    }

    private View moreEntry(String title, String desc, int iconType, String path) {
        LinearLayout card = Ui.horizontal(this);
        card.setPadding(Ui.dp(this, 14), Ui.dp(this, 12), Ui.dp(this, 14), Ui.dp(this, 12));
        card.setBackground(Ui.strokeBg(this, Color.WHITE, 10, Ui.LINE));
        RelationIconView icon = new RelationIconView(this, iconType);
        icon.setIconColor(Ui.PRIMARY);
        card.addView(icon, new LinearLayout.LayoutParams(Ui.dp(this, 36), Ui.dp(this, 36)));
        LinearLayout textCol = Ui.vertical(this);
        textCol.setPadding(Ui.dp(this, 12), 0, 0, 0);
        textCol.addView(Ui.text(this, title, 16, Ui.TEXT, Typeface.BOLD));
        textCol.addView(Ui.text(this, desc, 13, Ui.SECONDARY, Typeface.NORMAL));
        card.addView(textCol, new LinearLayout.LayoutParams(0, -2, 1));
        card.setOnClickListener(v -> loadAuxiliaryList(title, path));
        return card;
    }

    private void loadAuxiliaryList(String title, String path) {
        renderLoading();
        api.get(path, new ApiCallback() {
            @Override
            public void onSuccess(String body) {
                List<MobileItem> items = parseAuxiliary(title, path, body);
                currentTab = TAB_MORE;
                renderList(items, "暂无" + title);
            }

            @Override
            public void onError(String message) {
                renderError(message, () -> renderMore());
            }
        });
    }

    private List<MobileItem> parseAuxiliary(String title, String path, String body) {
        List<MobileItem> items = new ArrayList<>();
        JSONArray array = safeArray(body);
        for (int i = 0; i < array.length(); i++) {
            JSONObject o = array.optJSONObject(i);
            if (o == null) continue;
            MobileItem item = new MobileItem(o.optInt("id"), "more", firstNonEmpty(o, "title", "document_no", "week_start", "name"));
            if ("/weekly-reports".equals(path)) {
                item.title = nonEmpty(o.optString("week_start"), "周报") + " 周报";
                item.subtitle = o.optString("user_name");
                item.body = join("\n", o.optString("completed"), o.optString("next_week_plan"), o.optString("risks"));
            } else if ("/documents".equals(path)) {
                item.subtitle = join(" / ", o.optString("domain"), o.optString("doc_type"), o.optString("folder_name"));
                item.body = o.optString("summary");
            } else {
                item.subtitle = join(" / ", o.optString("owner_name"), o.optString("assignee_name"), o.optString("status"));
                item.status = o.optString("status");
                item.statusLabel = nonEmpty(o.optString("status"), "");
                item.body = join("\n", o.optString("description"), o.optString("result"), o.optString("completion_note"));
            }
            item.meta = "来自：" + title;
            item.raw = o;
            items.add(item);
        }
        return items;
    }

    private void renderError(String message, Runnable retry) {
        content.removeAllViews();
        LinearLayout box = Ui.vertical(this);
        box.setGravity(Gravity.CENTER);
        box.setPadding(Ui.dp(this, 24), Ui.dp(this, 24), Ui.dp(this, 24), Ui.dp(this, 24));
        TextView text = Ui.text(this, nonEmpty(message, "加载失败"), 14, Ui.SECONDARY, Typeface.NORMAL);
        text.setGravity(Gravity.CENTER);
        box.addView(text);
        box.addView(Ui.spacer(this, 14));
        Button button = Ui.actionButton(this, "重试", true);
        button.setOnClickListener(v -> retry.run());
        box.addView(button);
        content.addView(box, new LinearLayout.LayoutParams(-1, -1));
    }

    private void showSearchDialog() {
        if (currentTab != TAB_PERSONS) {
            showToast("首版先支持人脉搜索");
            return;
        }
        EditText input = input("姓名、公司、标签", personsSearch, EditorInfo.IME_ACTION_SEARCH);
        new AlertDialog.Builder(this)
            .setTitle("搜索人脉")
            .setView(input)
            .setNegativeButton("取消", null)
            .setNeutralButton("清空", (d, w) -> {
                personsSearch = "";
                loadPersons();
            })
            .setPositiveButton("搜索", (d, w) -> {
                personsSearch = input.getText().toString().trim();
                loadPersons();
            })
            .show();
    }

    private void showFilterDialog() {
        if (currentTab == TAB_TASKS) {
            final String[] labels = {"未完成", "我的", "已完成"};
            final String[] values = {"open", "mine", "done"};
            int checked = "mine".equals(taskFilter) ? 1 : ("done".equals(taskFilter) ? 2 : 0);
            new AlertDialog.Builder(this)
                .setTitle("任务筛选")
                .setSingleChoiceItems(labels, checked, (dialog, which) -> {
                    taskFilter = values[which];
                    dialog.dismiss();
                    loadTasks();
                })
                .show();
        } else if (currentTab == TAB_OPPORTUNITIES) {
            final String[] labels = {"全部", "新商机", "跟进中", "已成交", "已关闭"};
            final String[] values = {"", "new", "following", "won", "lost"};
            int checked = 0;
            for (int i = 0; i < values.length; i++) if (values[i].equals(opportunityStatusFilter)) checked = i;
            new AlertDialog.Builder(this)
                .setTitle("商机筛选")
                .setSingleChoiceItems(labels, checked, (dialog, which) -> {
                    opportunityStatusFilter = values[which];
                    dialog.dismiss();
                    loadOpportunities();
                })
                .show();
        } else if (currentTab == TAB_PERSONS) {
            showPersonFilterDialog();
        } else {
            showToast("当前页面暂无筛选项");
        }
    }

    private void showPersonFilterDialog() {
        LinearLayout box = Ui.vertical(this);
        box.setPadding(Ui.dp(this, 20), Ui.dp(this, 8), Ui.dp(this, 20), 0);
        TextView budgetRow = createPickerText("对方预算分类", selectedBudgetFilter, BUDGET_OPTIONS);
        TextView ownedRow = createPickerText("自有流量场景", selectedOwnedTrafficFilter, TRAFFIC_OPTIONS);
        TextView agencyRow = createPickerText("代理流量场景", selectedAgencyTrafficFilter, TRAFFIC_OPTIONS);
        budgetRow.setOnClickListener(v -> showMultiPicker("对方预算分类", selectedBudgetFilter, BUDGET_OPTIONS, value -> {
            selectedBudgetFilter = value;
            budgetRow.setText(pickerText("对方预算分类", selectedBudgetFilter, BUDGET_OPTIONS));
        }, () -> {}));
        ownedRow.setOnClickListener(v -> showMultiPicker("自有流量场景", selectedOwnedTrafficFilter, TRAFFIC_OPTIONS, value -> {
            selectedOwnedTrafficFilter = value;
            ownedRow.setText(pickerText("自有流量场景", selectedOwnedTrafficFilter, TRAFFIC_OPTIONS));
        }, () -> {}));
        agencyRow.setOnClickListener(v -> showMultiPicker("代理流量场景", selectedAgencyTrafficFilter, TRAFFIC_OPTIONS, value -> {
            selectedAgencyTrafficFilter = value;
            agencyRow.setText(pickerText("代理流量场景", selectedAgencyTrafficFilter, TRAFFIC_OPTIONS));
        }, () -> {}));
        box.addView(budgetRow);
        box.addView(Ui.spacer(this, 8));
        box.addView(ownedRow);
        box.addView(Ui.spacer(this, 8));
        box.addView(agencyRow);
        new AlertDialog.Builder(this)
            .setTitle("人脉筛选")
            .setView(box)
            .setNegativeButton("取消", null)
            .setNeutralButton("清空", (d, w) -> {
                selectedBudgetFilter = "";
                selectedOwnedTrafficFilter = "";
                selectedAgencyTrafficFilter = "";
                loadPersons();
            })
            .setPositiveButton("应用", (d, w) -> loadPersons())
            .show();
    }

    private void showMultiPicker(String title, String current, String[][] options, ValueSetter setter, Runnable after) {
        String[] labels = new String[options.length];
        boolean[] checked = new boolean[options.length];
        for (int i = 0; i < options.length; i++) {
            labels[i] = options[i][1];
            checked[i] = csvContains(current, options[i][0]);
        }
        new AlertDialog.Builder(this)
            .setTitle(title)
            .setMultiChoiceItems(labels, checked, (dialog, which, isChecked) -> checked[which] = isChecked)
            .setNegativeButton("取消", null)
            .setPositiveButton("确定", (dialog, which) -> {
                List<String> values = new ArrayList<>();
                for (int i = 0; i < options.length; i++) if (checked[i]) values.add(options[i][0]);
                setter.set(TextUtils.join(",", values));
                after.run();
            })
            .show();
    }

    private void showCreateDialog() {
        if (currentTab == TAB_PERSONS) {
            showCreatePersonDialog();
        } else if (currentTab == TAB_TASKS) {
            showCreateTaskDialog();
        } else {
            showToast("首版先支持新增任务和人脉");
        }
    }

    private void showCreateTaskDialog() {
        LinearLayout box = Ui.vertical(this);
        box.setPadding(Ui.dp(this, 20), Ui.dp(this, 8), Ui.dp(this, 20), 0);
        EditText title = input("任务标题", "", EditorInfo.IME_ACTION_NEXT);
        EditText date = input("日期 YYYY-MM-DD", today(), EditorInfo.IME_ACTION_NEXT);
        EditText assignee = input("负责人用户ID", String.valueOf(session.userId()), EditorInfo.IME_ACTION_DONE);
        box.addView(label("任务标题"));
        box.addView(title);
        box.addView(Ui.spacer(this, 10));
        box.addView(label("日期"));
        box.addView(date);
        date.setOnClickListener(v -> pickDate(date));
        box.addView(Ui.spacer(this, 10));
        box.addView(label("负责人用户ID"));
        box.addView(assignee);
        new AlertDialog.Builder(this)
            .setTitle("新增任务")
            .setView(box)
            .setNegativeButton("取消", null)
            .setPositiveButton("保存", (dialog, which) -> {
                JSONObject payload = new JSONObject();
                try {
                    payload.put("title", title.getText().toString().trim());
                    payload.put("date", date.getText().toString().trim());
                    payload.put("assigned_to", Integer.parseInt(nonEmpty(assignee.getText().toString().trim(), "0")));
                    payload.put("status", "pending");
                    payload.put("priority", "medium");
                } catch (Exception ignored) {
                }
                if (payload.optString("title").isEmpty() || payload.optInt("assigned_to") <= 0) {
                    showToast("请填写标题和负责人");
                    return;
                }
                api.post("/tasks", payload, new ApiCallback() {
                    @Override
                    public void onSuccess(String body) {
                        showToast("已新增任务");
                        loadTasks();
                    }

                    @Override
                    public void onError(String message) {
                        showToast(message);
                    }
                });
            })
            .show();
    }

    private void showCreatePersonDialog() {
        LinearLayout box = Ui.vertical(this);
        box.setPadding(Ui.dp(this, 20), Ui.dp(this, 8), Ui.dp(this, 20), 0);
        EditText name = input("姓名", "", EditorInfo.IME_ACTION_NEXT);
        EditText company = input("公司", "", EditorInfo.IME_ACTION_NEXT);
        EditText city = input("城市", "", EditorInfo.IME_ACTION_DONE);
        final String[] budget = {""};
        final String[] owned = {""};
        final String[] agency = {""};
        box.addView(label("姓名"));
        box.addView(name);
        box.addView(Ui.spacer(this, 10));
        box.addView(label("公司"));
        box.addView(company);
        box.addView(Ui.spacer(this, 10));
        box.addView(label("城市"));
        box.addView(city);
        box.addView(Ui.spacer(this, 10));
        TextView budgetRow = createPickerText("对方预算分类", budget[0], BUDGET_OPTIONS);
        TextView ownedRow = createPickerText("自有流量场景", owned[0], TRAFFIC_OPTIONS);
        TextView agencyRow = createPickerText("代理流量场景", agency[0], TRAFFIC_OPTIONS);
        budgetRow.setOnClickListener(v -> showMultiPicker("对方预算分类", budget[0], BUDGET_OPTIONS, value -> {
            budget[0] = value;
            budgetRow.setText(pickerText("对方预算分类", budget[0], BUDGET_OPTIONS));
        }, () -> {}));
        ownedRow.setOnClickListener(v -> showMultiPicker("自有流量场景", owned[0], TRAFFIC_OPTIONS, value -> {
            owned[0] = value;
            ownedRow.setText(pickerText("自有流量场景", owned[0], TRAFFIC_OPTIONS));
        }, () -> {}));
        agencyRow.setOnClickListener(v -> showMultiPicker("代理流量场景", agency[0], TRAFFIC_OPTIONS, value -> {
            agency[0] = value;
            agencyRow.setText(pickerText("代理流量场景", agency[0], TRAFFIC_OPTIONS));
        }, () -> {}));
        box.addView(budgetRow);
        box.addView(Ui.spacer(this, 8));
        box.addView(ownedRow);
        box.addView(Ui.spacer(this, 8));
        box.addView(agencyRow);
        new AlertDialog.Builder(this)
            .setTitle("新增人脉")
            .setView(box)
            .setNegativeButton("取消", null)
            .setPositiveButton("保存", (dialog, which) -> {
                JSONObject payload = new JSONObject();
                try {
                    payload.put("name", name.getText().toString().trim());
                    payload.put("company", company.getText().toString().trim());
                    payload.put("city", city.getText().toString().trim());
                    payload.put("person_category", "business");
                    payload.put("counterparty_budget_categories", budget[0]);
                    payload.put("owned_traffic_scenarios", owned[0]);
                    payload.put("agency_traffic_scenarios", agency[0]);
                } catch (Exception ignored) {
                }
                if (payload.optString("name").isEmpty()) {
                    showToast("姓名必填");
                    return;
                }
                api.post("/persons", payload, new ApiCallback() {
                    @Override
                    public void onSuccess(String body) {
                        showToast("已新增人脉");
                        loadPersons();
                    }

                    @Override
                    public void onError(String message) {
                        showToast(message);
                    }
                });
            })
            .show();
    }

    private TextView createPickerText(String title, String value, String[][] options) {
        TextView view = Ui.text(this, pickerText(title, value, options), 14, Ui.TEXT, Typeface.NORMAL);
        view.setPadding(Ui.dp(this, 12), Ui.dp(this, 10), Ui.dp(this, 12), Ui.dp(this, 10));
        view.setBackground(Ui.strokeBg(this, Color.WHITE, 8, Ui.LINE));
        return view;
    }

    private String pickerText(String title, String value, String[][] options) {
        return title + "： " + (empty(value) ? "请选择" : multiLabel(value, options));
    }

    private void pickDate(EditText target) {
        Calendar c = Calendar.getInstance();
        DatePickerDialog dialog = new DatePickerDialog(this, (DatePicker view, int year, int month, int dayOfMonth) -> {
            String value = year + "-" + two(month + 1) + "-" + two(dayOfMonth);
            target.setText(value);
        }, c.get(Calendar.YEAR), c.get(Calendar.MONTH), c.get(Calendar.DAY_OF_MONTH));
        dialog.show();
    }

    private JSONArray safeArray(String body) {
        try {
            return new JSONArray(body);
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    private String enc(String value) {
        try {
            return URLEncoder.encode(value, StandardCharsets.UTF_8.name());
        } catch (Exception e) {
            return value;
        }
    }

    private String join(String separator, String... values) {
        List<String> parts = new ArrayList<>();
        for (String value : values) {
            if (!empty(value) && !"-".equals(value.trim())) parts.add(value.trim());
        }
        return TextUtils.join(separator, parts);
    }

    private String nonEmpty(String value, String fallback) {
        return empty(value) ? fallback : value;
    }

    private boolean empty(String value) {
        return value == null || value.trim().isEmpty() || "null".equalsIgnoreCase(value.trim());
    }

    private String stripHtml(String value) {
        if (value == null) return "";
        return value.replaceAll("<[^>]*>", "").replace("&nbsp;", " ").trim();
    }

    private String dateOnly(String value) {
        if (empty(value)) return "";
        return value.length() >= 10 ? value.substring(0, 10) : value;
    }

    private String today() {
        Calendar c = Calendar.getInstance();
        return c.get(Calendar.YEAR) + "-" + two(c.get(Calendar.MONTH) + 1) + "-" + two(c.get(Calendar.DAY_OF_MONTH));
    }

    private String two(int value) {
        return value < 10 ? "0" + value : String.valueOf(value);
    }

    private String taskStatus(String status) {
        if ("pending".equals(status)) return "待处理";
        if ("in_progress".equals(status)) return "进行中";
        if ("done".equals(status)) return "已完成";
        if ("suspended".equals(status)) return "挂起";
        return nonEmpty(status, "-");
    }

    private String followStatus(String status) {
        if ("pending".equals(status)) return "待跟进";
        if ("in_progress".equals(status)) return "跟进中";
        if ("done".equals(status)) return "已完成";
        return nonEmpty(status, "-");
    }

    private String opportunityStatus(String status) {
        if ("new".equals(status)) return "新商机";
        if ("following".equals(status)) return "跟进中";
        if ("won".equals(status)) return "已成交";
        if ("lost".equals(status)) return "已关闭";
        return nonEmpty(status, "-");
    }

    private String priorityLabel(String priority) {
        if ("high".equals(priority)) return "高优先级";
        if ("low".equals(priority)) return "低优先级";
        return "中优先级";
    }

    private String weightLabel(String weight) {
        if ("high".equals(weight)) return "高权重";
        if ("low".equals(weight)) return "低权重";
        if ("medium".equals(weight)) return "中权重";
        return "";
    }

    private String personCategory(String category) {
        if ("business".equals(category)) return "商务圈";
        if ("talent".equals(category)) return "人才圈";
        if ("startup".equals(category)) return "创业圈";
        if ("social".equals(category)) return "社交圈";
        return "";
    }

    private String companyCategory(String category) {
        if ("client".equals(category)) return "客户";
        if ("partner".equals(category)) return "伙伴";
        if ("competitor".equals(category)) return "竞品";
        return nonEmpty(category, "");
    }

    private String readableMulti(String prefix, String csv, String[][] options) {
        if (empty(csv)) return "";
        return prefix + "：" + multiLabel(csv, options);
    }

    private String multiLabel(String csv, String[][] options) {
        Map<String, String> labels = new LinkedHashMap<>();
        for (String[] option : options) labels.put(option[0], option[1]);
        List<String> result = new ArrayList<>();
        String[] parts = csv.split(",");
        for (String part : parts) {
            String key = part.trim();
            if (!key.isEmpty()) result.add(labels.containsKey(key) ? labels.get(key) : key);
        }
        return TextUtils.join("、", result);
    }

    private boolean csvContains(String csv, String key) {
        if (empty(csv)) return false;
        String[] parts = csv.split(",");
        for (String part : parts) {
            if (key.equals(part.trim())) return true;
        }
        return false;
    }

    private String firstNonEmpty(JSONObject o, String... keys) {
        for (String key : keys) {
            String value = o.optString(key);
            if (!empty(value)) return value;
        }
        return "未命名";
    }

    private void showToast(String message) {
        Toast.makeText(this, nonEmpty(message, "操作失败"), Toast.LENGTH_SHORT).show();
    }

    interface ValueSetter {
        void set(String value);
    }
}
