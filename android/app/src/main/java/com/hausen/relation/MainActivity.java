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
import android.view.Gravity;
import android.view.View;
import android.view.Window;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.URLUtil;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import com.hausen.relation.data.SessionStore;
import com.hausen.relation.ui.RelationIconView;
import com.hausen.relation.ui.Ui;

import org.json.JSONObject;
import org.json.JSONTokener;

public class MainActivity extends Activity {
    private static final int TAB_TASKS = 0;
    private static final int TAB_OPPORTUNITIES = 1;
    private static final int TAB_PERSONS = 2;
    private static final int TAB_COMPANIES = 3;
    private static final int TAB_MORE = 4;
    private static final int FILE_CHOOSER_REQUEST = 7001;
    private static final String WEB_BASE_URL = "https://relation.midongtech.com";
    private static final String LOGIN_ROUTE = "/login";

    private SessionStore session;
    private FrameLayout contentFrame;
    private LinearLayout bottomNav;
    private ProgressBar pageProgress;
    private WebView webView;
    private int currentTab = TAB_TASKS;
    private boolean showingMoreHome = false;
    private String lastRoute = "/";
    private ValueCallback<Uri[]> filePathCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        tuneSystemBars();
        session = ((RelationApp) getApplication()).session();
        showMain();
    }

    private void tuneSystemBars() {
        Window window = getWindow();
        window.setStatusBarColor(Ui.PAGE);
        window.setNavigationBarColor(Color.WHITE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            window.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        }
    }

    private void showMain() {
        LinearLayout root = Ui.vertical(this);
        root.setBackgroundColor(Ui.PAGE);

        contentFrame = new FrameLayout(this);
        contentFrame.setBackgroundColor(Ui.PAGE);
        pageProgress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        pageProgress.setMax(100);
        pageProgress.setVisibility(View.GONE);
        contentFrame.addView(pageProgress, new FrameLayout.LayoutParams(-1, Ui.dp(this, 2), Gravity.TOP));

        bottomNav = Ui.horizontal(this);
        bottomNav.setGravity(Gravity.CENTER);
        bottomNav.setPadding(Ui.dp(this, 4), Ui.dp(this, 4), Ui.dp(this, 4), Ui.dp(this, 4));
        bottomNav.setBackground(Ui.strokeBg(this, Color.WHITE, 0, Ui.LINE));

        root.addView(contentFrame, new LinearLayout.LayoutParams(-1, 0, 1));
        root.addView(bottomNav, new LinearLayout.LayoutParams(-1, Ui.dp(this, 60)));
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
        item.setPadding(0, Ui.dp(this, 3), 0, 0);
        boolean active = currentTab == tab;
        RelationIconView icon = new RelationIconView(this, iconType);
        icon.setIconColor(active ? Ui.PRIMARY : Ui.SECONDARY);
        TextView text = Ui.text(this, label, 11, active ? Ui.PRIMARY : Ui.SECONDARY, active ? Typeface.BOLD : Typeface.NORMAL);
        text.setGravity(Gravity.CENTER);
        item.addView(icon, new LinearLayout.LayoutParams(Ui.dp(this, 24), Ui.dp(this, 24)));
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
        if (tab == TAB_OPPORTUNITIES) return "/leads";
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
        lastRoute = route;
        webView.loadUrl(WEB_BASE_URL + route);
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
            syncWebSession();
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            super.onReceivedError(view, request, error);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP && request != null && !request.isForMainFrame()) return;
            String message = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && error != null
                ? String.valueOf(error.getDescription())
                : "页面加载失败";
            renderWebError(message);
        }

        @Override
        public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {
            super.onReceivedHttpError(view, request, errorResponse);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP && request != null && !request.isForMainFrame()) return;
            int statusCode = errorResponse == null ? 0 : errorResponse.getStatusCode();
            if (statusCode >= 500) renderWebError("服务器响应异常 (" + statusCode + ")");
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
        String css =
            ":root{--md-primary:#07c160;--md-primary-dark:#12945b;--md-bg:#f5f6f7;--md-card:#fff;--md-text:#111827;--md-sub:#8a8f98;--md-line:#e8eaed;--md-blue:#2f7dcc;}"
            + "html,body,#root{background:var(--md-bg)!important;color:var(--md-text)!important;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif!important;-webkit-font-smoothing:antialiased!important;letter-spacing:0!important;}"
            + "body{margin:0!important;overflow-x:hidden!important;}"
            + ".ant-layout{background:var(--md-bg)!important;}"
            + ".ant-layout-sider,.app-mobile-menu-drawer{display:none!important;}"
            + ".ant-layout-header{height:auto!important;min-height:48px!important;line-height:normal!important;padding:10px 14px 6px!important;background:rgba(245,246,247,.96)!important;border-bottom:0!important;box-shadow:none!important;backdrop-filter:blur(12px)!important;}"
            + ".ant-layout-header>span:first-child{width:30px!important;height:30px!important;margin-right:6px!important;border-radius:8px!important;}"
            + ".ant-layout-header .ant-avatar{box-shadow:none!important;}"
            + ".ant-layout-content{margin:0!important;border-radius:0!important;box-shadow:none!important;background:var(--md-bg)!important;padding:12px 14px 26px!important;min-height:auto!important;}"
            + ".ant-layout-content::after{content:'';display:block;height:10px;}"
            + "h1,h2,h3,h4,h5,.ant-typography{letter-spacing:0!important;color:var(--md-text)!important;}"
            + ".ant-typography h4,h4.ant-typography{font-size:18px!important;line-height:1.35!important;font-weight:700!important;margin:2px 0 12px!important;}"
            + ".ant-btn{height:40px!important;border-radius:10px!important;font-size:15px!important;font-weight:500!important;box-shadow:none!important;border-color:var(--md-line)!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:6px!important;}"
            + ".ant-btn-primary{background:var(--md-primary)!important;border-color:var(--md-primary)!important;color:#fff!important;box-shadow:0 4px 10px rgba(7,193,96,.12)!important;}"
            + ".ant-btn-primary:hover,.ant-btn-primary:active{background:var(--md-primary-dark)!important;border-color:var(--md-primary-dark)!important;}"
            + ".ant-btn-link{color:var(--md-primary-dark)!important;padding:0 4px!important;height:auto!important;font-weight:500!important;}"
            + ".ant-input,.ant-input-affix-wrapper,.ant-select-selector,.ant-picker{min-height:42px!important;border-radius:10px!important;border-color:#dfe3e8!important;background:#fff!important;font-size:15px!important;box-shadow:none!important;}"
            + ".ant-input::placeholder{color:#b0b6bf!important;}"
            + ".ant-select-selection-placeholder,.ant-picker-input>input::placeholder{color:#b0b6bf!important;}"
            + ".ant-space{max-width:100%!important;}"
            + ".ant-space.ant-space-vertical{gap:10px!important;}"
            + ".ant-card,.ant-list-item>div[role='button'],.ant-list .ant-list-item>div:not(.ant-list-item-meta),.ant-table-wrapper,.ant-collapse,.ant-descriptions,.ant-form,.ant-tabs{border-radius:12px!important;}"
            + ".ant-card{border:1px solid var(--md-line)!important;box-shadow:0 3px 10px rgba(15,23,42,.035)!important;}"
            + ".ant-card-body{padding:14px!important;}"
            + ".ant-list{background:transparent!important;}"
            + ".ant-list-item{padding:0!important;margin:0 0 10px!important;border:none!important;}"
            + ".ant-list-item>div[role='button'],.ant-list .ant-list-item>div:not(.ant-list-item-meta){background:var(--md-card)!important;border:1px solid var(--md-line)!important;border-radius:12px!important;box-shadow:0 3px 10px rgba(15,23,42,.035)!important;padding:14px!important;}"
            + ".ant-list-item>div[role='button']:active,.ant-list .ant-list-item>div:not(.ant-list-item-meta):active{background:#fdfdfd!important;}"
            + ".ant-list-item .ant-typography,.ant-list-item span,.ant-list-item div{line-height:1.5!important;}"
            + ".ant-list-item strong,.ant-list-item .ant-typography strong{font-weight:700!important;color:var(--md-text)!important;}"
            + ".ant-tag{border-radius:7px!important;font-size:13px!important;line-height:24px!important;padding:0 8px!important;margin-inline-end:6px!important;background:#f7f8fa!important;border-color:#e3e6ea!important;color:#59616c!important;}"
            + ".ant-tag-blue,.ant-tag-processing{background:#edf7ff!important;border-color:#b8def8!important;color:#2f7dcc!important;}"
            + ".ant-tag-orange,.ant-tag-warning{background:#fff7e8!important;border-color:#f2d29a!important;color:#a56b18!important;}"
            + ".ant-tag-green,.ant-tag-success{background:#edf9f2!important;border-color:#b9e7cd!important;color:#148652!important;}"
            + ".ant-tag-purple{background:#f4f1ff!important;border-color:#d9d0ff!important;color:#5b45bf!important;}"
            + ".ant-tabs{background:transparent!important;}"
            + ".ant-tabs-nav{margin:4px 0 14px!important;}"
            + ".ant-tabs-tab{padding:10px 2px!important;font-size:16px!important;font-weight:600!important;color:#3f4652!important;}"
            + ".ant-tabs-tab-active .ant-tabs-tab-btn{color:var(--md-primary-dark)!important;font-weight:700!important;}"
            + ".ant-tabs-ink-bar{background:var(--md-primary)!important;height:3px!important;border-radius:999px!important;}"
            + ".ant-pagination{margin:18px 0 8px!important;}"
            + ".ant-pagination-item{border-radius:10px!important;border-color:#dfe3e8!important;}"
            + ".ant-pagination-item-active{border-color:var(--md-primary)!important;}"
            + ".ant-pagination-item-active a{color:var(--md-primary-dark)!important;}"
            + ".ant-drawer-content,.ant-modal-content{border-radius:14px 14px 0 0!important;overflow:hidden!important;}"
            + ".ant-drawer-header,.ant-modal-header{padding:14px 16px!important;border-bottom:1px solid var(--md-line)!important;}"
            + ".ant-drawer-body,.ant-modal-body{padding:14px!important;background:#fff!important;}"
            + ".ant-modal,.ant-drawer{max-width:100vw!important;}"
            + ".ant-descriptions-view,.ant-table{border-radius:10px!important;overflow:hidden!important;}"
            + ".ant-table-wrapper{background:#fff!important;overflow:hidden!important;border:1px solid var(--md-line)!important;}"
            + ".ant-table-thead>tr>th{background:#f7f8fa!important;color:#59616c!important;font-weight:600!important;}"
            + ".ant-table-tbody>tr>td{font-size:14px!important;}"
            + ".ql-container,.ql-toolbar{border-color:#dfe3e8!important;}"
            + ".ql-toolbar{border-radius:10px 10px 0 0!important;}"
            + ".ql-container{border-radius:0 0 10px 10px!important;}"
            + "@media(max-width:768px){"
            + "  .ant-layout-content{padding:12px 14px 26px!important;}"
            + "  .ant-layout-content>div{padding:0!important;}"
            + "  .ant-layout-content>div>div:first-child{margin-bottom:12px!important;}"
            + "  .ant-layout-content>div>div:first-child h4,.ant-layout-content>div>div:first-child .ant-typography{font-size:18px!important;}"
            + "  .ant-btn-primary{width:100%!important;height:44px!important;border-radius:11px!important;}"
            + "  .ant-space[style*='width: 100%'],.ant-space[style*='width:100%']{gap:10px!important;}"
            + "  .ant-select,.ant-picker,.ant-input-affix-wrapper{width:100%!important;}"
            + "  .ant-list-item>div[role='button']{padding:14px!important;border-radius:12px!important;}"
            + "  .ant-list-item .ant-space{row-gap:8px!important;}"
            + "  .ant-list-item .ant-btn{height:34px!important;border-radius:9px!important;font-size:14px!important;padding:0 10px!important;background:#fff!important;}"
            + "  .ant-list-item .ant-btn-link{height:auto!important;background:transparent!important;color:var(--md-primary-dark)!important;}"
            + "  .ant-list-item [style*='box-shadow']{box-shadow:0 3px 10px rgba(15,23,42,.035)!important;}"
            + "  .ant-list-item [style*='borderRadius: 12'],.ant-list-item [style*='border-radius: 12']{border-radius:12px!important;}"
            + "  .ant-list-item [style*='color: rgb(31, 31, 31)']{color:var(--md-text)!important;}"
            + "  .ant-list-item [style*='font-size: 15']{font-size:16px!important;line-height:1.45!important;}"
            + "  .ant-list-item [style*='color: rgb(136, 136, 136)'],.ant-typography-secondary{color:var(--md-sub)!important;}"
            + "  .ant-form-item{margin-bottom:12px!important;}"
            + "  .ant-modal-footer{padding:10px 14px 14px!important;}"
            + "}"
            + ".relation-android-ready{}";
        String js = "(function(){"
            + "var id='relation-android-shell-style';"
            + "var old=document.getElementById(id);if(old)old.remove();"
            + "var style=document.createElement('style');"
            + "style.id=id;"
            + "style.textContent=" + JSONObject.quote(css) + ";"
            + "document.head.appendChild(style);"
            + "})();";
        webView.evaluateJavascript(js, null);
    }

    private void syncWebSession() {
        if (webView == null) return;
        String js = "(function(){return JSON.stringify({token:localStorage.getItem('token')||'',user:localStorage.getItem('user')||''});})();";
        webView.evaluateJavascript(js, value -> {
            try {
                if (value == null || "null".equals(value)) return;
                Object parsed = new JSONTokener(value).nextValue();
                if (!(parsed instanceof String)) return;
                JSONObject state = new JSONObject((String) parsed);
                String token = state.optString("token", "");
                String userRaw = state.optString("user", "");
                if (token.isEmpty()) {
                    session.clearLogin();
                    return;
                }
                JSONObject user = userRaw.isEmpty() ? null : new JSONObject(userRaw);
                session.saveLogin(token, user);
            } catch (Exception ignored) {
            }
        });
    }

    private void renderWebError(String message) {
        if (contentFrame == null) return;
        contentFrame.removeAllViews();
        LinearLayout box = Ui.vertical(this);
        box.setGravity(Gravity.CENTER);
        box.setPadding(Ui.dp(this, 24), Ui.dp(this, 24), Ui.dp(this, 24), Ui.dp(this, 24));
        TextView title = Ui.text(this, "页面加载失败", 18, Ui.TEXT, Typeface.BOLD);
        title.setGravity(Gravity.CENTER);
        TextView desc = Ui.text(this, message == null || message.trim().isEmpty() ? "请检查网络后重试" : message, 14, Ui.SECONDARY, Typeface.NORMAL);
        desc.setGravity(Gravity.CENTER);
        Button retry = Ui.actionButton(this, "重新加载", true);
        retry.setOnClickListener(v -> loadWebRoute(lastRoute));
        box.addView(title);
        box.addView(Ui.spacer(this, 8));
        box.addView(desc);
        box.addView(Ui.spacer(this, 16));
        box.addView(retry, new LinearLayout.LayoutParams(-2, Ui.dp(this, 38)));
        contentFrame.addView(box, new FrameLayout.LayoutParams(-1, -1));
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
        if (path.startsWith("/leads") || path.startsWith("/opportunities")) return TAB_OPPORTUNITIES;
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
        page.setPadding(Ui.dp(this, 16), Ui.dp(this, 12), Ui.dp(this, 16), Ui.dp(this, 18));
        scroll.addView(page, new ScrollView.LayoutParams(-1, -2));

        LinearLayout profile = Ui.horizontal(this);
        profile.setPadding(Ui.dp(this, 16), Ui.dp(this, 14), Ui.dp(this, 14), Ui.dp(this, 14));
        profile.setBackground(Ui.strokeBg(this, Color.WHITE, 8, Ui.LINE));
        ImageView logo = new ImageView(this);
        logo.setImageResource(getResources().getIdentifier("ic_launcher", "drawable", getPackageName()));
        profile.addView(logo, new LinearLayout.LayoutParams(Ui.dp(this, 46), Ui.dp(this, 46)));
        LinearLayout account = Ui.vertical(this);
        account.setPadding(Ui.dp(this, 12), 0, 0, 0);
        account.addView(Ui.text(this, "幂动组织中台", 18, Ui.TEXT, Typeface.BOLD));
        account.addView(Ui.text(this, session.displayName(), 14, Ui.SECONDARY, Typeface.NORMAL));
        profile.addView(account, new LinearLayout.LayoutParams(0, -2, 1));
        RelationIconView logoutIcon = new RelationIconView(this, RelationIconView.LOGOUT);
        logoutIcon.setIconColor(Ui.SECONDARY);
        profile.addView(logoutIcon, new LinearLayout.LayoutParams(Ui.dp(this, 26), Ui.dp(this, 26)));
        profile.setOnClickListener(v -> confirmLogout());
        page.addView(profile, new LinearLayout.LayoutParams(-1, -2));
        page.addView(Ui.spacer(this, 14));

        page.addView(moreEntry("目标", "目标计划里的目标拆解与进度", RelationIconView.TASK, "/goals"));
        page.addView(Ui.spacer(this, 8));
        page.addView(moreEntry("周报", "查看和维护业务周报", RelationIconView.TASK, "/weekly-reports"));
        page.addView(Ui.spacer(this, 8));
        page.addView(moreEntry("策略", "业务流转里的策略管理", RelationIconView.OPPORTUNITY, "/strategies"));
        page.addView(Ui.spacer(this, 8));
        page.addView(moreEntry("需求", "业务流转里的研发需求", RelationIconView.TASK, "/dev-tasks"));
        page.addView(Ui.spacer(this, 8));
        page.addView(moreEntry("文档中心", "制度、SOP、项目资料", RelationIconView.COMPANY, "/documents"));

        contentFrame.addView(scroll, new FrameLayout.LayoutParams(-1, -1));
    }

    private View moreEntry(String title, String desc, int iconType, String path) {
        LinearLayout card = Ui.horizontal(this);
        card.setPadding(Ui.dp(this, 16), Ui.dp(this, 14), Ui.dp(this, 12), Ui.dp(this, 14));
        card.setBackground(Ui.strokeBg(this, Color.WHITE, 8, Ui.LINE));

        RelationIconView icon = new RelationIconView(this, iconType);
        icon.setIconColor(Ui.PRIMARY);
        card.addView(icon, new LinearLayout.LayoutParams(Ui.dp(this, 30), Ui.dp(this, 30)));

        LinearLayout textCol = Ui.vertical(this);
        textCol.setPadding(Ui.dp(this, 14), 0, 0, 0);
        textCol.addView(Ui.text(this, title, 17, Ui.TEXT, Typeface.BOLD));
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
                    webView.evaluateJavascript("localStorage.removeItem('token');localStorage.removeItem('user');", value -> {
                        webView.clearHistory();
                        loadWebRoute(LOGIN_ROUTE);
                    });
                } else {
                    loadWebRoute(LOGIN_ROUTE);
                }
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
