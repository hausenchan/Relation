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
import android.os.Handler;
import android.os.Looper;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.View;
import android.view.Window;
import android.view.inputmethod.EditorInfo;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.JavascriptInterface;
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
import android.widget.EditText;
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

import org.json.JSONArray;
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
    private LinearLayout topBar;
    private EditText searchInput;
    private FrameLayout addAction;
    private FrameLayout contentFrame;
    private LinearLayout bottomNav;
    private ProgressBar pageProgress;
    private WebView webView;
    private Handler searchHandler;
    private Runnable searchRunnable;
    private boolean suppressSearchChange = false;
    private int currentTab = TAB_TASKS;
    private boolean showingMoreHome = false;
    private String lastRoute = "/";
    private String moreSearchQuery = "";
    private ValueCallback<Uri[]> filePathCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        tuneSystemBars();
        session = ((RelationApp) getApplication()).session();
        searchHandler = new Handler(Looper.getMainLooper());
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

        topBar = buildTopBar();

        contentFrame = new FrameLayout(this);
        contentFrame.setBackgroundColor(Ui.PAGE);
        pageProgress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        pageProgress.setMax(100);
        pageProgress.setVisibility(View.GONE);
        contentFrame.addView(pageProgress, new FrameLayout.LayoutParams(-1, Ui.dp(this, 2), Gravity.TOP));

        bottomNav = Ui.horizontal(this);
        bottomNav.setGravity(Gravity.CENTER);
        bottomNav.setPadding(Ui.dp(this, 2), Ui.dp(this, 3), Ui.dp(this, 2), Ui.dp(this, 2));
        bottomNav.setBackground(Ui.strokeBg(this, Color.WHITE, 0, Color.rgb(226, 226, 226)));

        root.addView(topBar, new LinearLayout.LayoutParams(-1, Ui.dp(this, 54)));
        root.addView(contentFrame, new LinearLayout.LayoutParams(-1, 0, 1));
        root.addView(bottomNav, new LinearLayout.LayoutParams(-1, Ui.dp(this, 58)));
        setContentView(root);

        renderBottomNav();
        updateTopBarForTab();
        switchTab(TAB_TASKS);
    }

    private LinearLayout buildTopBar() {
        LinearLayout bar = Ui.horizontal(this);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(Ui.dp(this, 12), Ui.dp(this, 7), Ui.dp(this, 10), Ui.dp(this, 7));
        bar.setBackgroundColor(Ui.BAR);

        LinearLayout searchBox = Ui.horizontal(this);
        searchBox.setGravity(Gravity.CENTER_VERTICAL);
        searchBox.setPadding(Ui.dp(this, 10), 0, Ui.dp(this, 8), 0);
        searchBox.setBackground(Ui.bg(Ui.SEARCH_BG, 6, this));

        RelationIconView searchIcon = new RelationIconView(this, RelationIconView.SEARCH);
        searchIcon.setIconColor(Ui.TERTIARY);
        searchBox.addView(searchIcon, new LinearLayout.LayoutParams(Ui.dp(this, 18), Ui.dp(this, 18)));

        searchInput = new EditText(this);
        searchInput.setSingleLine(true);
        searchInput.setTextSize(14);
        searchInput.setTextColor(Ui.TEXT);
        searchInput.setHintTextColor(Ui.TERTIARY);
        searchInput.setPadding(Ui.dp(this, 7), 0, 0, 0);
        searchInput.setBackground(null);
        searchInput.setImeOptions(EditorInfo.IME_ACTION_SEARCH);
        searchInput.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
            @Override public void onTextChanged(CharSequence s, int start, int before, int count) {}
            @Override public void afterTextChanged(Editable s) {
                if (suppressSearchChange) return;
                scheduleTopSearch(s == null ? "" : s.toString());
            }
        });
        searchInput.setOnEditorActionListener((v, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_SEARCH) {
                runTopSearch(searchInput.getText().toString());
                return true;
            }
            return false;
        });
        searchBox.addView(searchInput, new LinearLayout.LayoutParams(0, -1, 1));
        bar.addView(searchBox, new LinearLayout.LayoutParams(0, -1, 1));

        addAction = new FrameLayout(this);
        addAction.setPadding(Ui.dp(this, 7), Ui.dp(this, 7), Ui.dp(this, 7), Ui.dp(this, 7));
        RelationIconView plus = new RelationIconView(this, RelationIconView.PLUS);
        plus.setIconColor(Ui.TEXT);
        addAction.addView(plus, new FrameLayout.LayoutParams(Ui.dp(this, 26), Ui.dp(this, 26), Gravity.CENTER));
        addAction.setOnClickListener(v -> performTopAddAction());
        LinearLayout.LayoutParams addParams = new LinearLayout.LayoutParams(Ui.dp(this, 42), -1);
        addParams.leftMargin = Ui.dp(this, 6);
        bar.addView(addAction, addParams);

        return bar;
    }

    private void renderBottomNav() {
        if (bottomNav == null) return;
        bottomNav.removeAllViews();
        addNavItem(TAB_TASKS, RelationIconView.TASK, "任务");
        addNavItem(TAB_OPPORTUNITIES, RelationIconView.OPPORTUNITY, "商机");
        if (shouldShowPersonsTab()) {
            addNavItem(TAB_PERSONS, RelationIconView.PERSON, "人脉");
        }
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
        TextView text = Ui.text(this, label, 11, active ? Ui.PRIMARY : Ui.SECONDARY, Typeface.NORMAL);
        text.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams iconParams = new LinearLayout.LayoutParams(Ui.dp(this, 25), Ui.dp(this, 25));
        item.addView(icon, iconParams);
        LinearLayout.LayoutParams textParams = new LinearLayout.LayoutParams(-2, -2);
        textParams.topMargin = Ui.dp(this, 2);
        item.addView(text, textParams);
        item.setOnClickListener(v -> switchTab(tab));
        bottomNav.addView(item, new LinearLayout.LayoutParams(0, -1, 1));
    }

    private void switchTab(int tab) {
        if (tab == TAB_PERSONS && !shouldShowPersonsTab()) {
            tab = TAB_TASKS;
        }
        currentTab = tab;
        renderBottomNav();
        updateTopBarForTab();
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

    private void updateTopBarForTab() {
        if (topBar == null || searchInput == null || addAction == null) return;
        boolean showAdd = currentTab == TAB_OPPORTUNITIES || currentTab == TAB_PERSONS || currentTab == TAB_COMPANIES;
        addAction.setVisibility(showAdd ? View.VISIBLE : View.GONE);
        searchInput.setHint(searchHintForTab(currentTab));
        suppressSearchChange = true;
        searchInput.setText(currentTab == TAB_MORE ? moreSearchQuery : "");
        suppressSearchChange = false;
    }

    private void setShellBarsVisible(boolean visible) {
        int state = visible ? View.VISIBLE : View.GONE;
        if (topBar != null) topBar.setVisibility(state);
        if (bottomNav != null) bottomNav.setVisibility(state);
    }

    private String searchHintForTab(int tab) {
        if (tab == TAB_OPPORTUNITIES) return "搜索商机";
        if (tab == TAB_PERSONS) return "搜索人脉";
        if (tab == TAB_COMPANIES) return "搜索公司、产品";
        if (tab == TAB_MORE) return "搜索功能";
        return "搜索任务";
    }

    private void scheduleTopSearch(String keyword) {
        if (searchRunnable != null) searchHandler.removeCallbacks(searchRunnable);
        searchRunnable = () -> runTopSearch(keyword);
        searchHandler.postDelayed(searchRunnable, 260);
    }

    private void runTopSearch(String keyword) {
        String query = keyword == null ? "" : keyword.trim();
        if (currentTab == TAB_MORE) {
            moreSearchQuery = query;
            renderMoreHome();
            return;
        }
        if (webView == null) return;
        webView.evaluateJavascript(buildSearchScript(query), null);
    }

    private String buildSearchScript(String query) {
        return "(function(){"
            + "var q=" + JSONObject.quote(query) + ";"
            + "var inputs=Array.from(document.querySelectorAll('input')).filter(function(el){return (el.placeholder||'').indexOf('搜索')>=0;});"
            + "var input=inputs[0];"
            + "if(!input)return false;"
            + "var setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;"
            + "setter.call(input,q);"
            + "input.dispatchEvent(new Event('input',{bubbles:true}));"
            + "input.dispatchEvent(new Event('change',{bubbles:true}));"
            + "input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true}));"
            + "return true;"
            + "})();";
    }

    private void performTopAddAction() {
        if (webView == null) return;
        webView.evaluateJavascript(buildAddScript(), value -> {
            if (value == null || "false".equals(value) || "null".equals(value)) {
                showToast("当前页面暂无新增入口");
            }
        });
    }

    private String buildAddScript() {
        String label = addLabelForTab(currentTab);
        return "(function(){"
            + "var target=" + JSONObject.quote(label) + ";"
            + "var buttons=Array.from(document.querySelectorAll('button')).filter(function(b){return !b.closest('.ant-modal,.ant-drawer');});"
            + "var exact=buttons.find(function(b){return b.getAttribute('data-relation-mobile-add')==='true'&&(b.textContent||'').trim().indexOf(target)>=0;});"
            + "var fallback=buttons.find(function(b){var t=(b.textContent||'').trim();return t.indexOf('添加')>=0||t.indexOf('新增')>=0||t.indexOf('新建')>=0;});"
            + "var btn=exact||fallback;"
            + "if(!btn)return false;"
            + "btn.click();"
            + "return true;"
            + "})();";
    }

    private String addLabelForTab(int tab) {
        if (tab == TAB_OPPORTUNITIES) return "添加商机";
        if (tab == TAB_PERSONS) return "添加人脉";
        if (tab == TAB_COMPANIES) return "添加公司";
        return "新增";
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

        webView.addJavascriptInterface(new RelationAndroidBridge(), "RelationAndroid");
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
            handleRouteChanged(url);
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

    private final class RelationAndroidBridge {
        @JavascriptInterface
        public void onRouteChanged(String url) {
            runOnUiThread(() -> handleRouteChanged(url));
        }
    }

    private void handleRouteChanged(String url) {
        boolean loginUrl = isLoginUrl(url);
        setShellBarsVisible(!loginUrl);
        if (!loginUrl) updateTabFromUrl(url);
    }

    private void injectMobileShellCss() {
        if (webView == null) return;
        String css =
            ":root{--md-primary:#07c160;--md-primary-dark:#129611;--md-bg:#f5f5f5;--md-card:#fff;--md-text:#111;--md-sub:#808080;--md-light:#a8a8a8;--md-line:#ededed;--md-bar:#f7f7f7;--md-search:#ededed;--md-blue:#3478f6;--md-orange:#d88720;}"
            + "html,body,#root{background:var(--md-bg)!important;color:var(--md-text)!important;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif!important;-webkit-font-smoothing:antialiased!important;letter-spacing:0!important;}"
            + "body{margin:0!important;overflow-x:hidden!important;}"
            + ".ant-layout{background:var(--md-bg)!important;}"
            + ".ant-layout-sider,.app-mobile-menu-drawer{display:none!important;}"
            + "html:not([data-relation-route^='/login']) .ant-layout-header{display:none!important;}"
            + ".ant-layout-content{margin:0!important;border-radius:0!important;box-shadow:none!important;background:var(--md-bg)!important;padding:0!important;min-height:auto!important;}"
            + ".ant-layout-content::after{content:'';display:block;height:12px;}"
            + "h1,h2,h3,h4,h5,.ant-typography{letter-spacing:0!important;color:var(--md-text)!important;}"
            + ".ant-typography h4,h4.ant-typography{font-size:17px!important;line-height:1.35!important;font-weight:600!important;margin:0 0 10px!important;}"
            + ".ant-btn{height:36px!important;border-radius:7px!important;font-size:14px!important;font-weight:400!important;box-shadow:none!important;border-color:var(--md-line)!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:5px!important;}"
            + ".ant-btn-primary{background:var(--md-primary)!important;border-color:var(--md-primary)!important;color:#fff!important;box-shadow:none!important;}"
            + ".ant-btn-link{color:var(--md-primary-dark)!important;padding:0 2px!important;height:auto!important;font-weight:400!important;}"
            + ".ant-input,.ant-input-affix-wrapper,.ant-select-selector,.ant-picker{min-height:38px!important;border-radius:7px!important;border-color:#dfdfdf!important;background:#fff!important;font-size:14px!important;box-shadow:none!important;}"
            + ".ant-input::placeholder,.ant-select-selection-placeholder,.ant-picker-input>input::placeholder{color:#aaa!important;}"
            + ".ant-space{max-width:100%!important;}"
            + ".ant-card,.ant-list-item>div[role='button'],.ant-list .ant-list-item>div:not(.ant-list-item-meta),.ant-table-wrapper,.ant-collapse,.ant-descriptions,.ant-form,.ant-tabs{border-radius:0!important;}"
            + ".ant-card{border:0!important;box-shadow:none!important;background:#fff!important;}"
            + ".ant-card-body{padding:13px 16px!important;}"
            + ".ant-list{background:#fff!important;border-top:1px solid var(--md-line)!important;border-bottom:1px solid var(--md-line)!important;}"
            + ".ant-list-item{padding:0!important;margin:0!important;border:none!important;border-bottom:1px solid var(--md-line)!important;background:#fff!important;}"
            + ".ant-list-item:last-child{border-bottom:none!important;}"
            + ".ant-list-item>div[role='button'],.ant-list .ant-list-item>div:not(.ant-list-item-meta){background:#fff!important;border:0!important;border-radius:0!important;box-shadow:none!important;padding:13px 16px!important;}"
            + ".ant-list-item>div[role='button']:active,.ant-list .ant-list-item>div:not(.ant-list-item-meta):active,.ant-card:active{background:#f7f7f7!important;}"
            + ".ant-list-item .ant-typography,.ant-list-item span,.ant-list-item div{line-height:1.42!important;}"
            + ".ant-list-item strong,.ant-list-item .ant-typography strong{font-weight:600!important;color:var(--md-text)!important;}"
            + ".ant-tag{border-radius:4px!important;font-size:11px!important;line-height:19px!important;padding:0 6px!important;margin-inline-end:4px!important;background:#f7f7f7!important;border-color:#e5e5e5!important;color:#666!important;}"
            + ".ant-tag-blue,.ant-tag-processing{background:#edf5ff!important;border-color:#c9e2ff!important;color:#2f7dcc!important;}"
            + ".ant-tag-orange,.ant-tag-warning{background:#fff5e7!important;border-color:#f1d29e!important;color:#a36b18!important;}"
            + ".ant-tag-green,.ant-tag-success{background:#eff9f2!important;border-color:#c4ebd1!important;color:#148652!important;}"
            + ".ant-tag-purple{background:#f4f1ff!important;border-color:#d9d0ff!important;color:#5b45bf!important;}"
            + ".ant-tabs{background:var(--md-bg)!important;}"
            + ".ant-tabs-nav{margin:0!important;padding:0 16px!important;background:#fff!important;border-bottom:1px solid var(--md-line)!important;}"
            + ".ant-tabs-tab{padding:12px 2px!important;font-size:15px!important;font-weight:500!important;color:#444!important;}"
            + ".ant-tabs-tab-active .ant-tabs-tab-btn{color:var(--md-primary-dark)!important;font-weight:600!important;}"
            + ".ant-tabs-ink-bar{background:var(--md-primary)!important;height:2px!important;border-radius:999px!important;}"
            + ".ant-tabs-content-holder{padding-top:10px!important;}"
            + ".ant-pagination{margin:14px 0 8px!important;text-align:center!important;}"
            + ".ant-pagination-item{border-radius:6px!important;border-color:#ddd!important;}"
            + ".ant-pagination-item-active{border-color:var(--md-primary)!important;}"
            + ".ant-pagination-item-active a{color:var(--md-primary-dark)!important;}"
            + ".ant-drawer-content,.ant-modal-content{border-radius:0!important;overflow:hidden!important;background:#fff!important;}"
            + ".ant-drawer-header,.ant-modal-header{padding:14px 16px!important;border-bottom:1px solid var(--md-line)!important;background:#f7f7f7!important;}"
            + ".ant-drawer-body,.ant-modal-body{padding:14px 16px!important;background:#fff!important;}"
            + ".ant-modal,.ant-drawer{max-width:100vw!important;}"
            + ".ant-modal-footer{padding:10px 16px 14px!important;border-top:1px solid var(--md-line)!important;}"
            + ".ant-descriptions-view,.ant-table{border-radius:0!important;overflow:hidden!important;}"
            + ".ant-table-wrapper{background:#fff!important;overflow:hidden!important;border:0!important;}"
            + ".ant-table-thead>tr>th{background:#f7f7f7!important;color:#666!important;font-weight:500!important;}"
            + ".ant-table-tbody>tr>td{font-size:13px!important;}"
            + ".ql-container,.ql-toolbar{border-color:#dfdfdf!important;}"
            + "@media(max-width:768px){"
            + "  .ant-layout-content>div{padding:0!important;}"
            + "  .ant-layout-content>div>div:first-child{margin-bottom:0!important;}"
            + "  .ant-layout-content>div>div:first-child h4,.ant-layout-content>div>div:first-child .ant-typography{font-size:17px!important;}"
            + "  button[data-relation-mobile-add='true'],button[data-relation-mobile-import='true']{display:none!important;}"
            + "  [data-relation-mobile-search='true']{position:absolute!important;left:-9999px!important;width:1px!important;height:1px!important;overflow:hidden!important;opacity:0!important;pointer-events:none!important;}"
            + "  .relation-mobile-empty-action-row{display:none!important;}"
            + "  .ant-select,.ant-picker,.ant-input-affix-wrapper{width:100%!important;}"
            + "  .ant-tabs-nav{position:sticky!important;top:0!important;z-index:3!important;}"
            + "  .ant-list-item>div[role='button']{position:relative!important;min-height:62px!important;padding-left:64px!important;}"
            + "  html[data-relation-route^='/persons'] .ant-list-item>div[role='button']::before{content:'';position:absolute;left:16px;top:16px;width:36px;height:36px;border-radius:6px;background:linear-gradient(135deg,#07c160,#31d982);}"
            + "  html[data-relation-route^='/persons'] .ant-list-item>div[role='button']::after{content:'人';position:absolute;left:16px;top:16px;width:36px;height:36px;line-height:36px;text-align:center;color:#fff;font-size:15px;font-weight:600;}"
            + "  html[data-relation-route^='/companies'] .ant-list-item .ant-card{position:relative!important;padding-left:48px!important;min-height:64px!important;}"
            + "  html[data-relation-route^='/companies'] .ant-list-item .ant-card::before{content:'';position:absolute;left:16px;top:16px;width:36px;height:36px;border-radius:7px;background:linear-gradient(135deg,#4da3ff,#2f7dcc);}"
            + "  html[data-relation-route^='/companies'] .ant-list-item .ant-card::after{content:'司';position:absolute;left:16px;top:16px;width:36px;height:36px;line-height:36px;text-align:center;color:#fff;font-size:15px;font-weight:600;}"
            + "  html[data-relation-route^='/leads'] .ant-list-item .ant-card{position:relative!important;padding-left:48px!important;min-height:64px!important;}"
            + "  html[data-relation-route^='/leads'] .ant-list-item .ant-card::before{content:'';position:absolute;left:16px;top:16px;width:36px;height:36px;border-radius:7px;background:linear-gradient(135deg,#ffad42,#f08300);}"
            + "  html[data-relation-route^='/leads'] .ant-list-item .ant-card::after{content:'机';position:absolute;left:16px;top:16px;width:36px;height:36px;line-height:36px;text-align:center;color:#fff;font-size:15px;font-weight:600;}"
            + "  .ant-list-item .ant-space{row-gap:5px!important;}"
            + "  .ant-list-item .ant-btn{height:28px!important;border-radius:5px!important;font-size:12px!important;padding:0 8px!important;background:#fff!important;}"
            + "  .ant-list-item .ant-btn-link{height:auto!important;background:transparent!important;color:var(--md-primary-dark)!important;}"
            + "  .ant-list-item [style*='box-shadow']{box-shadow:none!important;}"
            + "  .ant-list-item [style*='borderRadius'],.ant-list-item [style*='border-radius']{border-radius:0!important;}"
            + "  .ant-list-item [style*='color: rgb(31, 31, 31)']{color:var(--md-text)!important;}"
            + "  .ant-list-item [style*='font-size: 15']{font-size:16px!important;line-height:1.35!important;}"
            + "  .ant-list-item [style*='color: rgb(136, 136, 136)'],.ant-typography-secondary{color:var(--md-sub)!important;}"
            + "  .ant-list-item p{font-size:13px!important;color:#555!important;margin-bottom:0!important;}"
            + "  .ant-form-item{margin-bottom:12px!important;}"
            + "  .ant-modal{top:0!important;max-width:100vw!important;padding-bottom:0!important;}"
            + "  .ant-modal-content{min-height:100vh!important;}"
            + "  .ant-drawer-body .ant-card{border:1px solid var(--md-line)!important;border-radius:7px!important;}"
            + "}"
            + ".relation-android-ready{}";
        String js = "(function(){"
            + "var css=" + JSONObject.quote(css) + ";"
            + "var styleId='relation-android-shell-style';"
            + "function isLoginRoute(){return (location.pathname||'').indexOf('/login')===0;}"
            + "function notifyRoute(){try{if(window.RelationAndroid&&window.RelationAndroid.onRouteChanged){window.RelationAndroid.onRouteChanged(location.href);}}catch(e){}}"
            + "function removeStyle(){var old=document.getElementById(styleId);if(old)old.remove();}"
            + "function ensureStyle(){var old=document.getElementById(styleId);if(old)old.remove();var style=document.createElement('style');style.id=styleId;style.textContent=css;document.head.appendChild(style);}"
            + "function tagRelationMobile(){"
            + "document.documentElement.setAttribute('data-relation-route',location.pathname||'/');"
            + "notifyRoute();"
            + "if(isLoginRoute()){removeStyle();return;}"
            + "var addButtons=[];"
            + "Array.from(document.querySelectorAll('button')).forEach(function(btn){if(btn.closest('.ant-modal,.ant-drawer'))return;var t=(btn.textContent||'').trim();if(/添加|新增|新建/.test(t)){btn.setAttribute('data-relation-mobile-add','true');addButtons.push(btn);}if(/导入/.test(t)){btn.setAttribute('data-relation-mobile-import','true');}});"
            + "addButtons.forEach(function(btn){var row=btn.parentElement;if(row&&!row.querySelector('input,.ant-select')&&row.querySelectorAll('button').length<=2){row.classList.add('relation-mobile-empty-action-row');}});"
            + "Array.from(document.querySelectorAll('.stat-card')).forEach(function(card){var grid=card.parentElement&&card.parentElement.parentElement;if(grid){grid.classList.add('relation-mobile-stat-grid');}});"
            + "Array.from(document.querySelectorAll('input')).forEach(function(input){var p=input.getAttribute('placeholder')||'';if(p.indexOf('搜索')>=0){var wrap=input.closest('.ant-input-group-wrapper,.ant-input-affix-wrapper,.ant-input-search,.ant-space')||input;wrap.setAttribute('data-relation-mobile-search','true');}});"
            + "ensureStyle();"
            + "}"
            + "function scheduleTag(){setTimeout(tagRelationMobile,0);setTimeout(tagRelationMobile,250);setTimeout(tagRelationMobile,800);}"
            + "if(!window.__relationAndroidRouteObserver){window.__relationAndroidRouteObserver=true;['pushState','replaceState'].forEach(function(name){var raw=history[name];history[name]=function(){var result=raw.apply(this,arguments);scheduleTag();return result;};});window.addEventListener('popstate',scheduleTag);}"
            + "scheduleTag();setTimeout(tagRelationMobile,1600);"
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
                    refreshBottomNavForPermissions();
                    return;
                }
                JSONObject user = userRaw.isEmpty() ? null : new JSONObject(userRaw);
                session.saveLogin(token, user);
                refreshBottomNavForPermissions();
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
        if (tab == TAB_PERSONS && !shouldShowPersonsTab()) {
            tab = TAB_TASKS;
        }
        if (tab != currentTab) {
            currentTab = tab;
            showingMoreHome = false;
            renderBottomNav();
            updateTopBarForTab();
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

    private void refreshBottomNavForPermissions() {
        if (currentTab == TAB_PERSONS && !shouldShowPersonsTab()) {
            switchTab(TAB_TASKS);
            return;
        }
        renderBottomNav();
    }

    private boolean shouldShowPersonsTab() {
        JSONObject user = session.user();
        return canAccessMenu(user, "/persons") && canAccessModule(user, "persons");
    }

    private boolean canAccessMenu(JSONObject user, String menuKey) {
        if (user == null || user.length() == 0) return false;
        if (isAdminUser(user)) return true;
        JSONArray menuPerms = user.optJSONArray("menuPerms");
        if (menuPerms == null) return false;
        for (int i = 0; i < menuPerms.length(); i++) {
            if (menuKey.equals(menuPerms.optString(i))) return true;
        }
        return false;
    }

    private boolean canAccessModule(JSONObject user, String module) {
        if (user == null || user.length() == 0) return false;
        String role = user.optString("role", "");
        if (isAdminUser(user)
            || "member".equals(role)
            || "readonly".equals(role)
            || "leader".equals(role)
            || "sales_director".equals(role)) {
            return true;
        }
        if (!"guest".equals(role)) return false;
        JSONArray modulePerms = user.optJSONArray("modulePerms");
        if (modulePerms == null) return false;
        for (int i = 0; i < modulePerms.length(); i++) {
            JSONObject perm = modulePerms.optJSONObject(i);
            if (perm != null
                && module.equals(perm.optString("module"))
                && perm.optInt("can_read", 0) == 1) {
                return true;
            }
        }
        return false;
    }

    private boolean isAdminUser(JSONObject user) {
        if (user == null) return false;
        String role = user.optString("role", "");
        String executiveRole = user.optString("executive_role", "");
        return "admin".equals(role)
            || "ceo".equals(role)
            || "coo".equals(role)
            || "cto".equals(role)
            || "cmo".equals(role)
            || "ceo".equals(executiveRole)
            || "coo".equals(executiveRole)
            || "cto".equals(executiveRole)
            || "cmo".equals(executiveRole);
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
        page.setPadding(0, Ui.dp(this, 10), 0, Ui.dp(this, 18));
        scroll.addView(page, new ScrollView.LayoutParams(-1, -2));

        LinearLayout profile = Ui.horizontal(this);
        profile.setPadding(Ui.dp(this, 18), Ui.dp(this, 18), Ui.dp(this, 16), Ui.dp(this, 18));
        profile.setBackgroundColor(Color.WHITE);
        ImageView logo = new ImageView(this);
        logo.setImageResource(getResources().getIdentifier("ic_launcher", "drawable", getPackageName()));
        profile.addView(logo, new LinearLayout.LayoutParams(Ui.dp(this, 56), Ui.dp(this, 56)));
        LinearLayout account = Ui.vertical(this);
        account.setPadding(Ui.dp(this, 14), 0, 0, 0);
        account.setGravity(Gravity.CENTER_VERTICAL);
        account.addView(Ui.text(this, session.displayName(), 19, Ui.TEXT, Typeface.BOLD));
        TextView subtitle = Ui.text(this, "幂动组织中台", 13, Ui.SECONDARY, Typeface.NORMAL);
        LinearLayout.LayoutParams subtitleParams = new LinearLayout.LayoutParams(-2, -2);
        subtitleParams.topMargin = Ui.dp(this, 7);
        account.addView(subtitle, subtitleParams);
        profile.addView(account, new LinearLayout.LayoutParams(0, -2, 1));
        RelationIconView logoutIcon = new RelationIconView(this, RelationIconView.LOGOUT);
        logoutIcon.setIconColor(Ui.SECONDARY);
        profile.addView(logoutIcon, new LinearLayout.LayoutParams(Ui.dp(this, 24), Ui.dp(this, 24)));
        profile.setOnClickListener(v -> confirmLogout());
        page.addView(profile, new LinearLayout.LayoutParams(-1, -2));
        page.addView(Ui.spacer(this, 10));

        LinearLayout group = Ui.vertical(this);
        group.setBackgroundColor(Color.WHITE);
        addMoreEntryIfMatches(group, "目标", "目标拆解与进度", RelationIconView.GOAL, Ui.SOFT_GREEN, "/goals");
        addMoreEntryIfMatches(group, "周报", "业务周报", RelationIconView.WEEKLY, Ui.SOFT_BLUE, "/weekly-reports");
        addMoreEntryIfMatches(group, "策略", "业务策略", RelationIconView.STRATEGY, Ui.SOFT_ORANGE, "/strategies");
        addMoreEntryIfMatches(group, "需求", "研发需求", RelationIconView.DEMAND, Color.rgb(242, 239, 255), "/dev-tasks");
        addMoreEntryIfMatches(group, "文档中心", "制度、SOP、项目资料", RelationIconView.DOCUMENT, Color.rgb(239, 247, 255), "/documents");
        if (group.getChildCount() == 0) {
            TextView empty = Ui.text(this, "没有匹配的功能", 14, Ui.SECONDARY, Typeface.NORMAL);
            empty.setGravity(Gravity.CENTER);
            empty.setPadding(0, Ui.dp(this, 32), 0, Ui.dp(this, 32));
            group.addView(empty, new LinearLayout.LayoutParams(-1, -2));
        }
        page.addView(group, new LinearLayout.LayoutParams(-1, -2));

        contentFrame.addView(scroll, new FrameLayout.LayoutParams(-1, -1));
    }

    private void addMoreEntryIfMatches(LinearLayout parent, String title, String desc, int iconType, int iconBg, String path) {
        if (moreSearchQuery == null || moreSearchQuery.trim().isEmpty()) {
            addMoreEntry(parent, title, desc, iconType, iconBg, path);
            return;
        }
        String q = moreSearchQuery.trim();
        if ((title + " " + desc).contains(q)) {
            addMoreEntry(parent, title, desc, iconType, iconBg, path);
        }
    }

    private void addMoreEntry(LinearLayout parent, String title, String desc, int iconType, int iconBg, String path) {
        LinearLayout row = Ui.horizontal(this);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(Ui.dp(this, 16), 0, Ui.dp(this, 14), 0);
        row.setBackgroundColor(Color.WHITE);
        row.setMinimumHeight(Ui.dp(this, 58));
        row.setTag(title + " " + desc);

        FrameLayout iconWrap = new FrameLayout(this);
        iconWrap.setBackground(Ui.bg(iconBg, 7, this));
        RelationIconView icon = new RelationIconView(this, iconType);
        icon.setIconColor(iconColorForBg(iconBg));
        iconWrap.addView(icon, new FrameLayout.LayoutParams(Ui.dp(this, 22), Ui.dp(this, 22), Gravity.CENTER));
        row.addView(iconWrap, new LinearLayout.LayoutParams(Ui.dp(this, 36), Ui.dp(this, 36)));

        LinearLayout textCol = Ui.vertical(this);
        textCol.setGravity(Gravity.CENTER_VERTICAL);
        textCol.setPadding(Ui.dp(this, 14), 0, 0, 0);
        textCol.addView(Ui.text(this, title, 16, Ui.TEXT, Typeface.NORMAL));
        TextView descView = Ui.text(this, desc, 12, Ui.SECONDARY, Typeface.NORMAL);
        LinearLayout.LayoutParams descParams = new LinearLayout.LayoutParams(-2, -2);
        descParams.topMargin = Ui.dp(this, 5);
        textCol.addView(descView, descParams);
        row.addView(textCol, new LinearLayout.LayoutParams(0, -1, 1));

        TextView arrow = Ui.text(this, "›", 26, Ui.TERTIARY, Typeface.NORMAL);
        arrow.setGravity(Gravity.CENTER);
        row.addView(arrow, new LinearLayout.LayoutParams(Ui.dp(this, 22), -1));

        row.setOnClickListener(v -> {
            currentTab = TAB_MORE;
            renderBottomNav();
            loadWebRoute(path);
        });
        parent.addView(row, new LinearLayout.LayoutParams(-1, Ui.dp(this, 64)));

        View line = new View(this);
        line.setBackgroundColor(Ui.LINE);
        LinearLayout.LayoutParams lineParams = new LinearLayout.LayoutParams(-1, Ui.dp(this, 0.5f));
        lineParams.leftMargin = Ui.dp(this, 66);
        parent.addView(line, lineParams);
    }

    private int iconColorForBg(int bg) {
        if (bg == Ui.SOFT_GREEN) return Ui.PRIMARY_DARK;
        if (bg == Ui.SOFT_BLUE) return Color.rgb(50, 120, 210);
        if (bg == Ui.SOFT_ORANGE) return Color.rgb(201, 121, 31);
        return Color.rgb(98, 91, 180);
    }

    private void confirmLogout() {
        new AlertDialog.Builder(this)
            .setTitle("退出登录")
            .setMessage("确认退出当前账号？")
            .setNegativeButton("取消", null)
            .setPositiveButton("退出", (dialog, which) -> {
                session.clearLogin();
                refreshBottomNavForPermissions();
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
        if (searchHandler != null && searchRunnable != null) {
            searchHandler.removeCallbacks(searchRunnable);
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
