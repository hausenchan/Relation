package com.hausen.relation;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.inputmethod.EditorInfo;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.URLUtil;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import com.hausen.relation.api.ApiCallback;
import com.hausen.relation.api.ApiClient;
import com.hausen.relation.data.SessionStore;
import com.hausen.relation.ui.RelationIconView;
import com.hausen.relation.ui.Ui;

import org.json.JSONObject;

public class MainActivity extends Activity {
    private static final int TAB_TASKS = 0;
    private static final int TAB_OPPORTUNITIES = 1;
    private static final int TAB_PERSONS = 2;
    private static final int TAB_COMPANIES = 3;
    private static final int TAB_MORE = 4;
    private static final int FILE_CHOOSER_REQUEST = 7001;
    private static final String WEB_BASE_URL = "https://relation.midongtech.com";

    private RelationApp app;
    private SessionStore session;
    private ApiClient api;
    private FrameLayout contentFrame;
    private LinearLayout bottomNav;
    private ProgressBar pageProgress;
    private WebView webView;
    private int currentTab = TAB_TASKS;
    private boolean showingMoreHome = false;
    private ValueCallback<Uri[]> filePathCallback;

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

        TextView desc = Ui.text(this, "连接线上系统，移动端同步 Web 完整功能。", 14, Ui.SECONDARY, Typeface.NORMAL);
        desc.setGravity(Gravity.CENTER);
        page.addView(desc, new LinearLayout.LayoutParams(-1, -2));
        page.addView(Ui.spacer(this, 28));

        LinearLayout card = Ui.vertical(this);
        card.setPadding(Ui.dp(this, 18), Ui.dp(this, 18), Ui.dp(this, 18), Ui.dp(this, 18));
        card.setBackground(Ui.bg(Color.WHITE, 12, this));
        page.addView(card, new LinearLayout.LayoutParams(-1, -2));

        EditText username = input("用户名", EditorInfo.IME_ACTION_NEXT);
        EditText password = input("密码", EditorInfo.IME_ACTION_DONE);
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

    private EditText input(String hint, int imeAction) {
        EditText edit = new EditText(this);
        edit.setSingleLine(true);
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
        LinearLayout root = Ui.vertical(this);
        root.setBackgroundColor(Color.WHITE);

        contentFrame = new FrameLayout(this);
        pageProgress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        pageProgress.setMax(100);
        pageProgress.setVisibility(View.GONE);
        contentFrame.addView(pageProgress, new FrameLayout.LayoutParams(-1, Ui.dp(this, 2), Gravity.TOP));

        bottomNav = Ui.horizontal(this);
        bottomNav.setGravity(Gravity.CENTER);
        bottomNav.setPadding(Ui.dp(this, 4), Ui.dp(this, 3), Ui.dp(this, 4), Ui.dp(this, 5));
        bottomNav.setBackground(Ui.strokeBg(this, Color.WHITE, 0, Ui.LINE));

        root.addView(contentFrame, new LinearLayout.LayoutParams(-1, 0, 1));
        root.addView(bottomNav, new LinearLayout.LayoutParams(-1, Ui.dp(this, 62)));
        setContentView(root);

        renderBottomNav();
        switchTab(TAB_TASKS);
    }

    private void renderBottomNav() {
        if (bottomNav == null) return;
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
        if (tab == TAB_MORE) {
            renderMoreHome();
            return;
        }
        showingMoreHome = false;
        loadWebRoute(routeForTab(tab));
    }

    private String routeForTab(int tab) {
        if (tab == TAB_OPPORTUNITIES) return "/opportunities";
        if (tab == TAB_PERSONS) return "/persons";
        if (tab == TAB_COMPANIES) return "/companies";
        return "/";
    }

    private void loadWebRoute(String path) {
        showingMoreHome = false;
        ensureWebView();
        contentFrame.removeAllViews();
        contentFrame.addView(webView, new FrameLayout.LayoutParams(-1, -1));
        contentFrame.addView(pageProgress, new FrameLayout.LayoutParams(-1, Ui.dp(this, 2), Gravity.TOP));

        String route = normalizeRoute(path);
        String targetUrl = WEB_BASE_URL + route;
        String token = session.token();
        String user = session.user().toString();
        String html = "<!doctype html><html><head><meta charset=\"utf-8\">"
            + "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
            + "<style>body{font-family:sans-serif;color:#767c87;background:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}</style>"
            + "</head><body>正在进入...</body><script>"
            + "localStorage.setItem('token'," + JSONObject.quote(token) + ");"
            + "localStorage.setItem('user'," + JSONObject.quote(user) + ");"
            + "location.replace(" + JSONObject.quote(targetUrl) + ");"
            + "</script></html>";
        webView.loadDataWithBaseURL(WEB_BASE_URL + "/", html, "text/html", "UTF-8", null);
    }

    private String normalizeRoute(String path) {
        if (path == null || path.trim().isEmpty()) return "/";
        String route = path.trim();
        if (!route.startsWith("/")) route = "/" + route;
        return route;
    }

    private void ensureWebView() {
        if (webView != null) return;

        webView = new WebView(this);
        webView.setBackgroundColor(Color.WHITE);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setTextZoom(100);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
            CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);
        }
        CookieManager.getInstance().setAcceptCookie(true);

        webView.setWebViewClient(new RelationWebViewClient());
        webView.setWebChromeClient(new RelationWebChromeClient());
        webView.setDownloadListener(new RelationDownloadListener());
    }

    private final class RelationWebViewClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return handleUrl(request.getUrl());
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            return handleUrl(Uri.parse(url));
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);
            updateTabFromUrl(url);
            injectMobileShellCss();
            if (isLoginUrl(url)) {
                session.clearLogin();
                showToast("登录已过期，请重新登录");
                showLogin();
            }
        }
    }

    private boolean handleUrl(Uri uri) {
        if (uri == null) return false;
        String scheme = uri.getScheme();
        String host = uri.getHost();
        if (("http".equals(scheme) || "https".equals(scheme)) && "relation.midongtech.com".equals(host)) {
            return false;
        }
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException e) {
            showToast("无法打开链接");
        }
        return true;
    }

    private final class RelationWebChromeClient extends WebChromeClient {
        @Override
        public void onProgressChanged(WebView view, int newProgress) {
            super.onProgressChanged(view, newProgress);
            if (pageProgress == null) return;
            pageProgress.setProgress(newProgress);
            pageProgress.setVisibility(newProgress >= 100 ? View.GONE : View.VISIBLE);
        }

        @Override
        public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (filePathCallback != null) {
                filePathCallback.onReceiveValue(null);
            }
            filePathCallback = callback;
            try {
                Intent intent = params.createIntent();
                startActivityForResult(intent, FILE_CHOOSER_REQUEST);
                return true;
            } catch (ActivityNotFoundException e) {
                filePathCallback = null;
                showToast("未找到文件选择器");
                return false;
            }
        }
    }

    private final class RelationDownloadListener implements DownloadListener {
        @Override
        public void onDownloadStart(String url, String userAgent, String contentDisposition, String mimeType, long contentLength) {
            try {
                DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
                request.setMimeType(mimeType);
                request.addRequestHeader("User-Agent", userAgent);
                request.addRequestHeader("Authorization", "Bearer " + session.token());
                String cookies = CookieManager.getInstance().getCookie(url);
                if (cookies != null) request.addRequestHeader("Cookie", cookies);
                String fileName = URLUtil.guessFileName(url, contentDisposition, mimeType);
                request.setTitle(fileName);
                request.setDescription("正在下载");
                request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                request.setDestinationInExternalFilesDir(MainActivity.this, Environment.DIRECTORY_DOWNLOADS, fileName);
                DownloadManager manager = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                if (manager != null) {
                    manager.enqueue(request);
                    showToast("已开始下载");
                }
            } catch (Exception e) {
                showToast("下载失败");
            }
        }
    }

    private void injectMobileShellCss() {
        if (webView == null) return;
        String css = "header.ant-layout-header{display:none!important;}"
            + ".app-mobile-menu-drawer{display:none!important;}"
            + ".ant-layout-sider{display:none!important;}"
            + ".ant-layout-content{margin:0!important;border-radius:0!important;box-shadow:none!important;padding:12px!important;}"
            + "body{background:#fff!important;}"
            + ".ant-modal,.ant-drawer{max-width:100vw!important;}";
        String js = "(function(){"
            + "var id='relation-android-shell-style';"
            + "if(document.getElementById(id))return;"
            + "var style=document.createElement('style');"
            + "style.id=id;"
            + "style.textContent=" + JSONObject.quote(css) + ";"
            + "document.head.appendChild(style);"
            + "})();";
        webView.evaluateJavascript(js, null);
    }

    private void updateTabFromUrl(String url) {
        Uri uri = Uri.parse(url);
        if (!"relation.midongtech.com".equals(uri.getHost())) return;
        if (isLoginUrl(url)) return;
        String path = uri.getPath();
        int tab = tabForPath(path == null ? "/" : path);
        if (tab != currentTab) {
            currentTab = tab;
            showingMoreHome = false;
            renderBottomNav();
        }
    }

    private int tabForPath(String path) {
        if (path == null || path.isEmpty() || "/".equals(path)
            || path.startsWith("/follow-up-tasks") || path.startsWith("/my-tasks") || path.startsWith("/task-board")) {
            return TAB_TASKS;
        }
        if (path.startsWith("/opportunities")) return TAB_OPPORTUNITIES;
        if (path.startsWith("/persons") || path.startsWith("/interactions")) return TAB_PERSONS;
        if (path.startsWith("/companies")) return TAB_COMPANIES;
        return TAB_MORE;
    }

    private boolean isLoginUrl(String url) {
        Uri uri = Uri.parse(url);
        return "relation.midongtech.com".equals(uri.getHost()) && uri.getPath() != null && uri.getPath().startsWith("/login");
    }

    private void renderMoreHome() {
        showingMoreHome = true;
        contentFrame.removeAllViews();

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(Ui.PAGE);
        LinearLayout page = Ui.vertical(this);
        page.setPadding(Ui.dp(this, 14), Ui.dp(this, 14), Ui.dp(this, 14), Ui.dp(this, 18));
        scroll.addView(page, new ScrollView.LayoutParams(-1, -2));

        LinearLayout profile = Ui.horizontal(this);
        profile.setPadding(Ui.dp(this, 14), Ui.dp(this, 12), Ui.dp(this, 14), Ui.dp(this, 12));
        profile.setBackground(Ui.strokeBg(this, Color.WHITE, 10, Ui.LINE));
        ImageView logo = new ImageView(this);
        logo.setImageResource(getResources().getIdentifier("ic_launcher", "drawable", getPackageName()));
        profile.addView(logo, new LinearLayout.LayoutParams(Ui.dp(this, 40), Ui.dp(this, 40)));
        LinearLayout account = Ui.vertical(this);
        account.setPadding(Ui.dp(this, 12), 0, 0, 0);
        account.addView(Ui.text(this, "幂动组织中台", 16, Ui.TEXT, Typeface.BOLD));
        account.addView(Ui.text(this, session.displayName(), 13, Ui.SECONDARY, Typeface.NORMAL));
        profile.addView(account, new LinearLayout.LayoutParams(0, -2, 1));
        RelationIconView logoutIcon = new RelationIconView(this, RelationIconView.LOGOUT);
        logoutIcon.setIconColor(Ui.SECONDARY);
        profile.addView(logoutIcon, new LinearLayout.LayoutParams(Ui.dp(this, 28), Ui.dp(this, 28)));
        profile.setOnClickListener(v -> confirmLogout());
        page.addView(profile, new LinearLayout.LayoutParams(-1, -2));
        page.addView(Ui.spacer(this, 12));

        page.addView(moreEntry("目标", "目标计划里的目标拆解与进度", RelationIconView.TASK, "/goals"));
        page.addView(Ui.spacer(this, 10));
        page.addView(moreEntry("周报", "查看和维护业务周报", RelationIconView.TASK, "/weekly-reports"));
        page.addView(Ui.spacer(this, 10));
        page.addView(moreEntry("策略", "业务流转里的策略管理", RelationIconView.OPPORTUNITY, "/strategies"));
        page.addView(Ui.spacer(this, 10));
        page.addView(moreEntry("需求", "业务流转里的研发需求", RelationIconView.TASK, "/dev-tasks"));
        page.addView(Ui.spacer(this, 10));
        page.addView(moreEntry("文档中心", "制度、SOP、项目资料", RelationIconView.COMPANY, "/documents"));

        contentFrame.addView(scroll, new FrameLayout.LayoutParams(-1, -1));
    }

    private View moreEntry(String title, String desc, int iconType, String path) {
        LinearLayout card = Ui.horizontal(this);
        card.setPadding(Ui.dp(this, 14), Ui.dp(this, 12), Ui.dp(this, 14), Ui.dp(this, 12));
        card.setBackground(Ui.strokeBg(this, Color.WHITE, 10, Ui.LINE));

        RelationIconView icon = new RelationIconView(this, iconType);
        icon.setIconColor(Ui.PRIMARY);
        card.addView(icon, new LinearLayout.LayoutParams(Ui.dp(this, 34), Ui.dp(this, 34)));

        LinearLayout textCol = Ui.vertical(this);
        textCol.setPadding(Ui.dp(this, 12), 0, 0, 0);
        textCol.addView(Ui.text(this, title, 16, Ui.TEXT, Typeface.BOLD));
        textCol.addView(Ui.text(this, desc, 13, Ui.SECONDARY, Typeface.NORMAL));
        card.addView(textCol, new LinearLayout.LayoutParams(0, -2, 1));

        TextView arrow = Ui.text(this, ">", 20, Ui.SECONDARY, Typeface.NORMAL);
        arrow.setGravity(Gravity.CENTER);
        card.addView(arrow, new LinearLayout.LayoutParams(Ui.dp(this, 24), -1));

        card.setOnClickListener(v -> {
            currentTab = TAB_MORE;
            renderBottomNav();
            loadWebRoute(path);
        });
        return card;
    }

    private void confirmLogout() {
        new AlertDialog.Builder(this)
            .setTitle("退出登录")
            .setMessage("确认退出当前账号？")
            .setNegativeButton("取消", null)
            .setPositiveButton("退出", (dialog, which) -> {
                session.clearLogin();
                if (webView != null) {
                    webView.clearHistory();
                    webView.clearCache(false);
                }
                showLogin();
            })
            .show();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != FILE_CHOOSER_REQUEST || filePathCallback == null) return;

        Uri[] results = null;
        if (resultCode == RESULT_OK) {
            if (data != null && data.getClipData() != null) {
                int count = data.getClipData().getItemCount();
                results = new Uri[count];
                for (int i = 0; i < count; i++) {
                    results[i] = data.getClipData().getItemAt(i).getUri();
                }
            } else if (data != null && data.getData() != null) {
                results = new Uri[]{data.getData()};
            }
        }
        filePathCallback.onReceiveValue(results);
        filePathCallback = null;
    }

    @Override
    public void onBackPressed() {
        if (currentTab == TAB_MORE && showingMoreHome) {
            switchTab(TAB_TASKS);
            return;
        }
        if (currentTab == TAB_MORE && !showingMoreHome) {
            currentTab = TAB_MORE;
            renderBottomNav();
            renderMoreHome();
            return;
        }
        if (webView != null && webView.getParent() != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }
        if (currentTab != TAB_TASKS) {
            switchTab(TAB_TASKS);
            return;
        }
        super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (filePathCallback != null) {
            filePathCallback.onReceiveValue(null);
            filePathCallback = null;
        }
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    private void showToast(String message) {
        Toast.makeText(this, message == null ? "" : message, Toast.LENGTH_SHORT).show();
    }
}
