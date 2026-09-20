#include "browser_window.h"
#include "include/cef_app.h"
#include "include/cef_parser.h"
#include <iostream>
#include <sstream>

#if defined(OS_WIN) || defined(_WIN32)
#include <windows.h>
#endif

NaptureBrowserClient::NaptureBrowserClient() {}

void NaptureBrowserClient::OnAfterCreated(CefRefPtr<CefBrowser> browser) {
    browser_count_++;

    if (!ui_browser_) {
        ui_browser_ = browser;
        std::cout << "[Napture Engine] UI Browser created with ID: " << browser->GetIdentifier() << std::endl;
    }
}

bool NaptureBrowserClient::DoClose(CefRefPtr<CefBrowser> browser) {
    return false;
}

void NaptureBrowserClient::OnBeforeClose(CefRefPtr<CefBrowser> browser) {
    browser_count_--;

    int browser_id = browser->GetIdentifier();
    auto it = browser_id_to_tab_id_.find(browser_id);
    if (it != browser_id_to_tab_id_.end()) {
        std::string tab_id = it->second;
        tab_browsers_.erase(tab_id);
        browser_id_to_tab_id_.erase(it);
        if (active_tab_id_ == tab_id) {
            active_tab_id_.clear();
        }
    }

    if (ui_browser_ && ui_browser_->IsSame(browser)) {
        ui_browser_ = nullptr;
    }
}

void NaptureBrowserClient::OnTitleChange(CefRefPtr<CefBrowser> browser, const CefString& title) {
    if (ui_browser_ && browser->IsSame(ui_browser_)) {
        // Set main window title if applicable
        return;
    }

    int browser_id = browser->GetIdentifier();
    auto it = browser_id_to_tab_id_.find(browser_id);
    if (it != browser_id_to_tab_id_.end()) {
        std::stringstream ss;
        ss << "{\"tabId\":\"" << it->second << "\",\"title\":\"" << title.ToString() << "\"}";
        SendToUI("tab-title-updated", ss.str());
    }
}

void NaptureBrowserClient::OnAddressChange(CefRefPtr<CefBrowser> browser, CefRefPtr<CefFrame> frame, const CefString& url) {
    if (ui_browser_ && browser->IsSame(ui_browser_)) return;

    if (frame->IsMain()) {
        int browser_id = browser->GetIdentifier();
        auto it = browser_id_to_tab_id_.find(browser_id);
        if (it != browser_id_to_tab_id_.end()) {
            std::stringstream ss;
            ss << "{\"tabId\":\"" << it->second << "\",\"url\":\"" << url.ToString() << "\"}";
            SendToUI("tab-navigated", ss.str());
        }
    }
}

void NaptureBrowserClient::OnFaviconURLChange(CefRefPtr<CefBrowser> browser, const std::vector<CefString>& icon_urls) {
    if (ui_browser_ && browser->IsSame(ui_browser_)) return;

    if (!icon_urls.empty()) {
        int browser_id = browser->GetIdentifier();
        auto it = browser_id_to_tab_id_.find(browser_id);
        if (it != browser_id_to_tab_id_.end()) {
            std::stringstream ss;
            ss << "{\"tabId\":\"" << it->second << "\",\"favicon\":\"" << icon_urls[0].ToString() << "\"}";
            SendToUI("tab-favicon-updated", ss.str());
        }
    }
}

void NaptureBrowserClient::OnLoadingStateChange(CefRefPtr<CefBrowser> browser, bool isLoading, bool canGoBack, bool canGoForward) {
    if (ui_browser_ && browser->IsSame(ui_browser_)) return;

    int browser_id = browser->GetIdentifier();
    auto it = browser_id_to_tab_id_.find(browser_id);
    if (it != browser_id_to_tab_id_.end()) {
        std::stringstream ss;
        ss << "{\"tabId\":\"" << it->second << "\",\"loading\":" << (isLoading ? "true" : "false") 
           << ",\"canGoBack\":" << (canGoBack ? "true" : "false") 
           << ",\"canGoForward\":" << (canGoForward ? "true" : "false") << "}";
        SendToUI("tab-loading-state", ss.str());
    }
}

bool NaptureBrowserClient::OnProcessMessageReceived(
    CefRefPtr<CefBrowser> browser,
    CefRefPtr<CefFrame> frame,
    CefProcessId source_process,
    CefRefPtr<CefProcessMessage> message) {
    
    std::string name = message->GetName().ToString();
    CefRefPtr<CefListValue> args = message->GetArgumentList();

    if (name == "create-tab") {
        std::string tab_id = args->GetString(0).ToString();
        std::string url = args->GetString(1).ToString();
        CreateTab(tab_id, url);
        return true;
    } else if (name == "switch-tab") {
        std::string tab_id = args->GetString(0).ToString();
        SwitchTab(tab_id);
        return true;
    } else if (name == "close-tab") {
        std::string tab_id = args->GetString(0).ToString();
        CloseTab(tab_id);
        return true;
    } else if (name == "navigate") {
        std::string url = args->GetString(0).ToString();
        Navigate(url);
        return true;
    } else if (name == "go-back") {
        GoBack();
        return true;
    } else if (name == "go-forward") {
        GoForward();
        return true;
    } else if (name == "reload") {
        Reload();
        return true;
    } else if (name == "resize-view-contents") {
        int x = args->GetInt(0);
        int y = args->GetInt(1);
        int w = args->GetInt(2);
        int h = args->GetInt(3);
        ResizeView(x, y, w, h);
        return true;
    }

    return false;
}

void NaptureBrowserClient::CreateTab(const std::string& tab_id, const std::string& url) {
    CefWindowInfo window_info;
    CefBrowserSettings settings;

#if defined(OS_WIN) || defined(_WIN32)
    if (ui_browser_) {
        HWND parent_hwnd = ui_browser_->GetHost()->GetWindowHandle();
        RECT rect = { view_bounds_.x, view_bounds_.y, view_bounds_.x + view_bounds_.width, view_bounds_.y + view_bounds_.height };
        window_info.SetAsChild(parent_hwnd, rect);
    }
#endif

    std::string target_url = url.empty() ? "https://www.google.com" : url;
    CefBrowserHost::CreateBrowser(window_info, this, target_url, settings, nullptr, nullptr);
    active_tab_id_ = tab_id;
}

void NaptureBrowserClient::SwitchTab(const std::string& tab_id) {
    active_tab_id_ = tab_id;
    auto it = tab_browsers_.find(tab_id);
    if (it != tab_browsers_.end() && it->second) {
#if defined(OS_WIN) || defined(_WIN32)
        HWND hwnd = it->second->GetHost()->GetWindowHandle();
        ShowWindow(hwnd, SW_SHOW);
        SetWindowPos(hwnd, HWND_TOP, view_bounds_.x, view_bounds_.y, view_bounds_.width, view_bounds_.height, SWP_SHOWWINDOW);
#endif
    }
}

void NaptureBrowserClient::CloseTab(const std::string& tab_id) {
    auto it = tab_browsers_.find(tab_id);
    if (it != tab_browsers_.end() && it->second) {
        it->second->GetHost()->CloseBrowser(true);
        tab_browsers_.erase(it);
    }
}

void NaptureBrowserClient::Navigate(const std::string& url) {
    CefRefPtr<CefBrowser> active = GetActiveTabBrowser();
    if (active && active->GetMainFrame()) {
        active->GetMainFrame()->LoadURL(url);
    }
}

void NaptureBrowserClient::GoBack() {
    CefRefPtr<CefBrowser> active = GetActiveTabBrowser();
    if (active && active->CanGoBack()) {
        active->GoBack();
    }
}

void NaptureBrowserClient::GoForward() {
    CefRefPtr<CefBrowser> active = GetActiveTabBrowser();
    if (active && active->CanGoForward()) {
        active->GoForward();
    }
}

void NaptureBrowserClient::Reload() {
    CefRefPtr<CefBrowser> active = GetActiveTabBrowser();
    if (active) {
        active->Reload();
    }
}

void NaptureBrowserClient::ResizeView(int x, int y, int width, int height) {
    view_bounds_.x = x;
    view_bounds_.y = y;
    view_bounds_.width = width;
    view_bounds_.height = height;

    CefRefPtr<CefBrowser> active = GetActiveTabBrowser();
    if (active) {
#if defined(OS_WIN) || defined(_WIN32)
        HWND hwnd = active->GetHost()->GetWindowHandle();
        SetWindowPos(hwnd, nullptr, x, y, width, height, SWP_NOZORDER | SWP_NOACTIVATE);
#endif
    }
}

CefRefPtr<CefBrowser> NaptureBrowserClient::GetActiveTabBrowser() {
    if (active_tab_id_.empty()) return nullptr;
    auto it = tab_browsers_.find(active_tab_id_);
    if (it != tab_browsers_.end()) {
        return it->second;
    }
    return nullptr;
}

void NaptureBrowserClient::SendToUI(const std::string& event_name, const std::string& json_payload) {
    if (ui_browser_ && ui_browser_->GetMainFrame()) {
        std::stringstream js;
        js << "if (window.__naptureNativeEmit) { window.__naptureNativeEmit('" << event_name << "', " << json_payload << "); }";
        ui_browser_->GetMainFrame()->ExecuteJavaScript(js.str(), ui_browser_->GetMainFrame()->GetURL(), 0);
    }
}
