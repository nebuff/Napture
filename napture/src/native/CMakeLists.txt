cmake_minimum_required(VERSION 3.15)
project(NaptureNative)

set(CMAKE_CXX_STANDARD 17)

# Set CEF Root
set(CEF_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/../../../.deps/cef_binary_154.0.23+g062ebe4+chromium-154.0.8037.17_linux64_beta_minimal")
set(CMAKE_MODULE_PATH ${CMAKE_MODULE_PATH} "${CEF_ROOT}/cmake")

# Find CEF
find_package(CEF REQUIRED)

if(NOT WIN32)
    string(REPLACE ";" " " CEF_COMPILER_FLAGS_SPACE "${CEF_COMPILER_FLAGS}")
    set(CMAKE_C_FLAGS "")
    set(CMAKE_CXX_FLAGS "")
endif()

add_subdirectory(${CEF_ROOT}/libcef_dll libcef_dll_wrapper)

# CEF binary targets
if(WIN32)
    add_library(libcef SHARED IMPORTED)
    set_target_properties(libcef PROPERTIES IMPORTED_LOCATION "${CEF_ROOT}/Release/libcef.dll")
    set_target_properties(libcef PROPERTIES IMPORTED_IMPLIB "${CEF_ROOT}/Release/libcef.lib")
elseif(APPLE)
    add_library(libcef SHARED IMPORTED)
    set_target_properties(libcef PROPERTIES IMPORTED_LOCATION "${CEF_ROOT}/Release/Chromium Embedded Framework.framework/Chromium Embedded Framework")
else()
    add_library(libcef SHARED IMPORTED)
    set_target_properties(libcef PROPERTIES IMPORTED_LOCATION "${CEF_ROOT}/Release/libcef.so")
endif()

# Source files
set(NAPTURE_SOURCES
    main.cpp
    browser_window.cpp
    scheme_handler.cpp
)

# Add executable
if(WIN32)
    add_executable(napture-native WIN32 ${NAPTURE_SOURCES})
else()
    add_executable(napture-native ${NAPTURE_SOURCES})
endif()

# Link CEF
target_link_libraries(napture-native PRIVATE libcef_dll_wrapper libcef ${CEF_STANDARD_LIBS})

# Add CEF target properties
set_target_properties(napture-native PROPERTIES
    COMPILE_DEFINITIONS "${CEF_COMPILER_DEFINES}"
    INCLUDE_DIRECTORIES "${CEF_INCLUDE_PATH}"
)

# Apply CEF compiler flags
if(NOT MSVC)
    separate_arguments(CEF_COMPILER_FLAGS_LIST UNIX_COMMAND "${CEF_COMPILER_FLAGS_SPACE}")
    target_compile_options(napture-native PRIVATE ${CEF_COMPILER_FLAGS_LIST})
endif()

# Copy CEF Release binaries and Resources to the build output directory
if(WIN32)
    add_custom_command(
        TARGET napture-native POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_directory
        "${CEF_ROOT}/Release/" "$<TARGET_FILE_DIR:napture-native>"
        COMMAND ${CMAKE_COMMAND} -E copy_directory
        "${CEF_ROOT}/Resources/" "$<TARGET_FILE_DIR:napture-native>"
    )
elseif(UNIX AND NOT APPLE)
    add_custom_command(
        TARGET napture-native POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_directory
        "${CEF_ROOT}/Release/" "$<TARGET_FILE_DIR:napture-native>"
        COMMAND ${CMAKE_COMMAND} -E copy_directory
        "${CEF_ROOT}/Resources/" "$<TARGET_FILE_DIR:napture-native>"
    )
endif()
