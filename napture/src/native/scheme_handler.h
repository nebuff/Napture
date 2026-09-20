#ifndef NAPTURE_SCHEME_HANDLER_H_
#define NAPTURE_SCHEME_HANDLER_H_

#include "include/cef_scheme.h"
#include "include/cef_resource_handler.h"
#include <string>

// Scheme handler for napture:// and ne:// protocols
class NaptureSchemeHandlerFactory : public CefSchemeHandlerFactory {
public:
    explicit NaptureSchemeHandlerFactory(const std::string& app_root_path);

    CefRefPtr<CefResourceHandler> Create(
        CefRefPtr<CefBrowser> browser,
        CefRefPtr<CefFrame> frame,
        const CefString& scheme_name,
        CefRefPtr<CefRequest> request) override;

private:
    std::string app_root_path_;
    IMPLEMENT_REFCOUNTING(NaptureSchemeHandlerFactory);
};

void RegisterNaptureCustomSchemes(CefRawPtr<CefSchemeRegistrar> registrar);

#endif // NAPTURE_SCHEME_HANDLER_H_
