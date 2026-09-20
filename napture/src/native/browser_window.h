#ifndef NAPTURE_BROWSER_WINDOW_H_
#define NAPTURE_BROWSER_WINDOW_H_

#include "include/cef_client.h"
#include "include/cef_life_span_handler.h"
#include "include/cef_display_handler.h"
#include "include/cef_load_handler.h"
#include "include/cef_context_menu_handler.h"
#include <map>
#include <string>
#include <vector>

class NaptureBrowserClient : public CefClient,
                             public CefLifeSpanHandler,
                             public CefDisplayHandler,
                             public CefLoadHandler,
                             public CefContextMenuHandler {
public:
    NaptureBrowserClient();

    // CefClient methods
    CefRefPtr<CefLifeSpanHandler> GetLifeSpanHandler() override { return this; }
    CefRefPtr<CefDisplayHandler> GetDisplayHandler() override { return this; }
    CefRefPtr<CefLoadHandler> GetLoadHandler() override { return this; }
    CefRefPtr<CefContextMenuHandler> GetContextMenuHandler() override { return this; }
    bool OnProcessMessageReceived(CefRefPtr<CefBrowser> browser,
                                 CefRefPtr<CefFrame> frame,
                                 CefProcessId source_process,
                                 CefRefPtr<CefProcessMessage> message) override;

    // CefLifeSpanHandler methods
    void OnAfterCreated(CefRefPtr<CefBrowser> browser) override;
    bool DoClose(CefRefPtr<CefBrowser> browser) override;
    void OnBeforeClose(CefRefPtr<CefBrowser> browser) override;

    // CefDisplayHandler methods
    void OnTitleChange(CefRefPtr<CefBrowser> browser, const CefString& title) override;
    void OnAddressChange(CefRefPtr<CefBrowser> browser, CefRefPtr<CefFrame> frame, const CefString& url) override;
    void OnFaviconURLChange(CefRefPtr<CefBrowser> browser, const std::vector<CefString>& icon_urls) override;

    // CefLoadHandler methods
    void OnLoadingStateChange(CefRefPtr<CefBrowser> browser, bool isLoading, bool canGoBack, bool canGoForward) override;

    // Tab Management & Viewport
    void CreateTab(const std::string& tab_id, const std::string& url);
    void SwitchTab(const std::string& tab_id);
    void CloseTab(const std::string& tab_id);
    void Navigate(const std::string& url);
    void GoBack();
    void GoForward();
    void Reload();
    void ResizeView(int x, int y, int width, int height);

    CefRefPtr<CefBrowser> GetActiveTabBrowser();
    CefRefPtr<CefBrowser> GetUIBrowser() { return ui_browser_; }
    void SetUIBrowser(CefRefPtr<CefBrowser> browser) { ui_browser_ = browser; }

    int GetBrowserCount() const { return browser_count_; }

private:
    void SendToUI(const std::string& event_name, const std::string& json_payload);

    CefRefPtr<CefBrowser> ui_browser_;
    std::map<std::string, CefRefPtr<CefBrowser>> tab_browsers_;
    std::map<int, std::string> browser_id_to_tab_id_;
    std::string active_tab_id_;
    int browser_count_ = 0;

    struct ViewBounds {
        int x = 0;
        int y = 80;
        int width = 1200;
        int height = 720;
    } view_bounds_;

    IMPLEMENT_REFCOUNTING(NaptureBrowserClient);
};

#endif // NAPTURE_BROWSER_WINDOW_H_
