#include "scheme_handler.h"
#include "include/wrapper/cef_stream_resource_handler.h"
#include <fstream>
#include <sstream>
#include <iostream>

namespace {

std::string GetMimeType(const std::string& extension) {
    if (extension == ".html" || extension == ".htm") return "text/html";
    if (extension == ".css") return "text/css";
    if (extension == ".js") return "application/javascript";
    if (extension == ".json") return "application/json";
    if (extension == ".png") return "image/png";
    if (extension == ".jpg" || extension == ".jpeg") return "image/jpeg";
    if (extension == ".svg") return "image/svg+xml";
    if (extension == ".ico") return "image/x-icon";
    if (extension == ".woff2") return "font/woff2";
    if (extension == ".woff") return "font/woff";
    if (extension == ".ttf") return "font/ttf";
    return "text/plain";
}

std::string GetFileExtension(const std::string& path) {
    size_t dot_pos = path.find_last_of('.');
    if (dot_pos == std::string::npos) return "";
    return path.substr(dot_pos);
}

} // namespace

NaptureSchemeHandlerFactory::NaptureSchemeHandlerFactory(const std::string& app_root_path)
    : app_root_path_(app_root_path) {}

CefRefPtr<CefResourceHandler> NaptureSchemeHandlerFactory::Create(
    CefRefPtr<CefBrowser> browser,
    CefRefPtr<CefFrame> frame,
    const CefString& scheme_name,
    CefRefPtr<CefRequest> request) {
    
    std::string url = request->GetURL().ToString();
    std::string scheme = scheme_name.ToString();

    // Map napture://chrome/... and ne://... to disk resources
    std::string sub_path;
    if (url.find("napture://chrome/") == 0) {
        sub_path = url.substr(17);
    } else if (url.find("ne://") == 0) {
        sub_path = url.substr(5);
    } else {
        return nullptr;
    }

    // Strip query parameters and hash fragments
    size_t query_pos = sub_path.find_first_of("?#");
    if (query_pos != std::string::npos) {
        sub_path = sub_path.substr(0, query_pos);
    }

    if (sub_path.empty() || sub_path == "index.html") {
        sub_path = "renderer/index.html";
    }

    // Security check: Prevent path traversal (..)
    if (sub_path.find("..") != std::string::npos) {
        return nullptr;
    }

    std::string full_path = app_root_path_ + "/" + sub_path;
    std::ifstream file(full_path, std::ios::binary);
    if (!file.is_open()) {
        std::cerr << "[Napture Scheme] File not found: " << full_path << std::endl;
        return nullptr;
    }

    std::stringstream buffer;
    buffer << file.rdbuf();
    std::string content = buffer.str();
    file.close();

    std::string mime_type = GetMimeType(GetFileExtension(sub_path));

    CefRefPtr<CefStreamReader> stream = CefStreamReader::CreateForData(
        static_cast<void*>(const_cast<char*>(content.data())),
        content.size()
    );

    CefResponseHeaders headers;
    headers.insert(std::make_pair("Access-Control-Allow-Origin", "*"));

    return new CefStreamResourceHandler(200, "OK", mime_type, headers, stream);
}

void RegisterNaptureCustomSchemes(CefRawPtr<CefSchemeRegistrar> registrar) {
    int options = CEF_SCHEME_OPTION_STANDARD | 
                  CEF_SCHEME_OPTION_SECURE | 
                  CEF_SCHEME_OPTION_CORS_ENABLED | 
                  CEF_SCHEME_OPTION_FETCH_ENABLED;
    
    registrar->AddCustomScheme("napture", options);
    registrar->AddCustomScheme("ne", options);
}
