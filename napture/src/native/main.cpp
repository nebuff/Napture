#include <iostream>
#include <string>
#include "include/cef_app.h"
#include "include/cef_client.h"
#include "include/cef_scheme.h"
#include "include/cef_v8.h"
#include "browser_window.h"
#include "scheme_handler.h"

#if defined(OS_WIN) || defined(_WIN32)
#include <windows.h>
#include <direct.h>
#define GetCurrentDir _getcwd
#else
#include <unistd.h>
#define GetCurrentDir getcwd
#endif

namespace {

std::string GetCurrentWorkingDirectory() {
    char buff[FILENAME_MAX];
    if (GetCurrentDir(buff, FILENAME_MAX)) {
        return std::string(buff);
    }
    return "";
}

// V8 JavaScript Bridge Handler for naptureAPI in the UI
class NaptureV8Handler : public CefV8Handler {
public:
    NaptureV8Handler() {}

    bool Execute(const CefString& name,
                 CefRefPtr<CefV8Value> object,
                 const CefV8ValueList& arguments,
                 CefRefPtr<CefV8Value>& retval,
                 CefString& exception) override {
        
        CefRefPtr<CefBrowser> browser = CefV8Context::GetCurrentContext()->GetBrowser();
        if (!browser) return false;

        CefRefPtr<CefProcessMessage> msg = CefProcessMessage::Create(name);
        CefRefPtr<CefListValue> args = msg->GetArgumentList();

        for (size_t i = 0; i < arguments.size(); ++i) {
            if (arguments[i]->IsString()) {
                args->SetString(i, arguments[i]->GetStringValue());
            } else if (arguments[i]->IsInt()) {
                args->SetInt(i, arguments[i]->GetIntValue());
            } else if (arguments[i]->IsBool()) {
                args->SetBool(i, arguments[i]->GetBoolValue());
            }
        }

        browser->GetMainFrame()->SendProcessMessage(PID_BROWSER, msg);
        return true;
    }

private:
    IMPLEMENT_REFCOUNTING(NaptureV8Handler);
};

} // namespace

class NaptureApp : public CefApp,
                   public CefBrowserProcessHandler,
                   public CefRenderProcessHandler {
public:
    NaptureApp() : app_root_(GetCurrentWorkingDirectory()) {}

    // CefApp methods
    CefRefPtr<CefBrowserProcessHandler> GetBrowserProcessHandler() override { return this; }
    CefRefPtr<CefRenderProcessHandler> GetRenderProcessHandler() override { return this; }

    void OnRegisterCustomSchemes(CefRawPtr<CefSchemeRegistrar> registrar) override {
        RegisterNaptureCustomSchemes(registrar);
    }

    // CefBrowserProcessHandler methods
    void OnContextInitialized() override {
        std::cout << "[Napture Engine] Registering custom scheme factory..." << std::endl;
        CefRegisterSchemeHandlerFactory("napture", "chrome", new NaptureSchemeHandlerFactory(app_root_));
        CefRegisterSchemeHandlerFactory("ne", "", new NaptureSchemeHandlerFactory(app_root_));

        std::cout << "[Napture Engine] Creating primary browser window..." << std::endl;
        CefBrowserSettings browser_settings;
        CefWindowInfo window_info;

#if defined(OS_WIN) || defined(_WIN32)
        window_info.SetAsPopup(NULL, "Napture");
        window_info.width = 1280;
        window_info.height = 800;
#endif

        browser_client_ = new NaptureBrowserClient();
        CefString url = "napture://chrome/index.html";

        CefBrowserHost::CreateBrowser(window_info, browser_client_, url, browser_settings, nullptr, nullptr);
    }

    // CefRenderProcessHandler methods
    void OnContextCreated(CefRefPtr<CefBrowser> browser,
                          CefRefPtr<CefFrame> frame,
                          CefRefPtr<CefV8Context> context) override {
        
        std::string current_url = frame->GetURL().ToString();

        // Strictly expose naptureAPI only to internal napture:// pages, protecting external websites
        if (current_url.find("napture://") == 0 || current_url.find("ne://") == 0) {
            CefRefPtr<CefV8Value> global = context->GetGlobal();
            CefRefPtr<CefV8Value> api_obj = CefV8Value::CreateObject(nullptr, nullptr);
            CefRefPtr<CefV8Handler> handler = new NaptureV8Handler();

            const std::vector<std::string> methods = {
                "createTab", "switchTab", "closeTab", "navigate",
                "goBack", "goForward", "reload", "resizeViewContents"
            };

            for (const auto& method : methods) {
                CefRefPtr<CefV8Value> func = CefV8Value::CreateFunction(method, handler);
                api_obj->SetValue(method, func, V8_PROPERTY_ATTRIBUTE_READONLY);
            }

            global->SetValue("naptureAPI", api_obj, V8_PROPERTY_ATTRIBUTE_READONLY);
        }
    }

private:
    std::string app_root_;
    CefRefPtr<NaptureBrowserClient> browser_client_;

    IMPLEMENT_REFCOUNTING(NaptureApp);
};

#if defined(OS_WIN) || defined(_WIN32)
int APIENTRY wWinMain(HINSTANCE hInstance, HINSTANCE hPrevInstance, LPTSTR lpCmdLine, int nCmdShow) {
    CefMainArgs main_args(hInstance);
#else
int main(int argc, char* argv[]) {
    CefMainArgs main_args(argc, argv);
#endif

    std::cout << "[Napture Engine] Starting Napture Chromium Core..." << std::endl;

    int exit_code = CefExecuteProcess(main_args, nullptr, nullptr);
    if (exit_code >= 0) {
        return exit_code;
    }

    CefSettings settings;
    settings.no_sandbox = true;
    settings.multi_threaded_message_loop = false;

    CefRefPtr<NaptureApp> app(new NaptureApp);

    if (!CefInitialize(main_args, settings, app.get(), nullptr)) {
        std::cerr << "[Napture Engine] Failed to initialize CEF." << std::endl;
        return -1;
    }

    std::cout << "[Napture Engine] Message loop running..." << std::endl;
    CefRunMessageLoop();

    std::cout << "[Napture Engine] Shutting down..." << std::endl;
    CefShutdown();
    return 0;
}
