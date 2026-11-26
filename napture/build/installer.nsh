; Custom NSIS script included by electron-builder (see build.nsis.include in package.json).
;
; Add installer customization in the standard electron-builder hooks, e.g.:
;
;   !macro customInstall
;     ; runs after files are installed
;   !macroend
;
;   !macro customUnInstall
;     ; runs during uninstall
;   !macroend
;
; The installer is intentionally left uncustomized: the non-one-click flow,
; installation directory picker, shortcuts and per-user install are all
; configured through the "nsis" options in package.json.
