// Napture Comprehensive Localization System
// Supports:
// - en-US: English (United States)
// - en-CA: English (Canadian)
// - cute: Cute Engwish (UwU / OwO style matching user specifications)

const LANGUAGES = {
  'en-US': { code: 'en-US', name: 'English (United States)', completeness: '100.0%' },
  'en-CA': { code: 'en-CA', name: 'English (Canadian)', completeness: '100.0%' },
  'cute': { code: 'cute', name: 'Cute Engwish', completeness: '100.0%' }
};

const TRANSLATIONS = {
  'en-US': {
    // Settings Navigation
    nav_appearance: 'Appearance & Features',
    nav_snippets: 'Snippets',
    nav_toolbar: 'Toolbar Settings',
    nav_sync: 'Sync',
    nav_search: 'Search Engine',
    nav_privacy: 'Privacy & Security',
    nav_downloads: 'Downloads',
    nav_languages: 'Languages',
    nav_system: 'System & Performance',
    nav_protocols: 'Protocols',
    nav_default_browser: 'Default Browser',
    nav_bookmarks: 'Bookmarks Manager',
    nav_reset: 'Reset & Maintenance',
    nav_about: 'About Napture',
    settings_title: 'Settings',
    search_settings_placeholder: 'Search settings...',

    // Snippets Section
    sec_snippets: 'Quick Site Snippets',
    add_snippet_btn: 'Add Snippet',
    snippet_label: 'Snippet',
    description_label: 'Description',
    url_label: 'URL',
    snippets_desc: 'Type a snippet (e.g. .mail or .yt) into the address bar to jump directly to your shortcut URL',

    // Appearance Section
    sec_appearance: 'Appearance & Features',
    theme_label: 'Theme Accent Color',
    theme_desc: 'Select a primary color scheme for active tabs, buttons, and highlight rings',
    dynamic_bg_label: 'Dynamic Background Tone',
    dynamic_bg_desc: 'Extract dominant color from active webpage and tint titlebar background',
    zoom_label: 'Default Page Zoom',
    zoom_desc: 'Set the initial magnification percentage for new pages and views',
    folder_hover_label: 'Hover to Open Folders',
    folder_hover_desc: 'Hover over bookmark folders in the sidebar to open or close them quickly',
    switch_to_existing_tab_label: 'Switch to existing tab or bookmark',
    switch_to_existing_tab_desc: 'Automatically switch to an open tab or bookmark when opening a duplicate URL',

    // Toolbar Section
    sec_toolbar: 'Toolbar & Navigation Bar',
    home_btn_label: 'Show Home Button',
    home_btn_desc: 'Display home icon button next to navigation controls in the address bar',
    home_url_label: 'Custom Home URL',
    home_url_desc: 'Web page or internal address to load when clicking the Home button',
    suggestions_label: 'Address Bar Search Suggestions',
    suggestions_desc: 'Display matching search recommendations from selected search engine as you type',
    full_url_label: 'Show Full URL in Address Display',
    full_url_desc: 'Display full protocol schemes and paths instead of simplified domain representations',
    customize_toolbar_label: 'Customize Toolbar',
    customize_toolbar_desc: 'Customize toolbar button visibility, order, custom link items, spacers, and configuration code',
    customize_toolbar_btn: 'Customize Toolbar',

    // Search Engine Section
    sec_search: 'Search Engine',
    search_engine_label: 'Default Search Engine',
    search_engine_desc: 'Search provider used when queries are entered directly in the address bar',

    // Downloads Section
    sec_downloads: 'Downloads',
    download_location_label: 'Download Location',
    download_location_desc: 'Folder path on disk where downloaded files are saved automatically',
    change_folder: 'Change Folder',
    ask_download_label: 'Ask where to save each file before downloading',
    ask_download_desc: 'Prompt a file save dialog for every download request',

    // Privacy & Security Section
    sec_privacy: 'Privacy & Security',
    clear_browsing_data: 'Clear Browsing Data',
    clear_browsing_desc: 'Erase cached images, stored cookies, browsing history, and local storage data',
    clear_data_btn: 'Clear Data',
    safe_browsing_label: 'Safe Browsing Protection',
    safe_browsing_desc: 'Defend against malicious domains, malware distribution vectors, and phishing scams',
    sb_standard_title: 'Standard Protection',
    sb_standard_desc: 'Real-time defense against known threats and malicious URLs',
    sb_strict_title: 'Strict Protection',
    sb_strict_desc: 'Proactively block deceptive content and unverified redirects',
    sb_disabled_title: 'Turn Off Protection',
    sb_disabled_desc: 'No security protection (Not recommended)',
    dnt_label: 'Send "Do Not Track" Request',
    dnt_desc: 'Send a DNT header with outgoing HTTP/HTTPS web requests',
    https_only_label: 'Always Use Secure Connections (HTTPS-Only)',
    https_only_desc: 'Automatically upgrade all HTTP site requests to secure HTTPS encryption',

    // Languages Section
    sec_languages: 'Languages',
    interface_lang_label: 'Interface Language',
    interface_lang_desc: 'Primary locale used across browser menus and system dialogs',
    lang_feedback_note: "Don't see your language or the quality is poor? Help us with translations!",
    lang_completeness: 'Completeness',

    // System Section
    sec_system: 'System & Performance',
    perf_profile_label: 'Power & CPU Performance Profile',
    perf_profile_desc: 'Configure CPU cycle conservation, background tab throttling, and rendering frame rates',
    perf_battery_title: 'Battery Saver',
    perf_battery_sub: 'Limits rendering to 30 FPS and aggressively throttles background tabs & timers to save CPU cycles',
    perf_balanced_title: 'Balanced',
    perf_balanced_sub: 'Standard balanced execution optimized for daily browsing efficiency',
    perf_perf_title: 'Max Performance',
    perf_perf_sub: 'Unthrottled frame rates, high-priority background tab processing, and immediate rendering',
    hw_accel_label: 'Use Hardware Acceleration When Available',
    hw_accel_desc: 'Leverage GPU graphics hardware to render complex animations and WebGL contexts faster',

    // Protocols Section
    sec_protocols: 'Decentralized Protocols (ne://)',
    ne_protocol_label: 'Enable Neweb (ne://) Protocol',
    ne_protocol_desc: 'Enable resolution of decentralized .ne domains via Anycast DNS nodes',
    dns_nodes_label: 'Authoritative DNS Nodes',
    dns_nodes_desc: 'Configure the redundant Playit.gg Anycast DNS tunnels used for resolving .ne domains',
    add_node: 'Add Node',
    flush_dns_cache: 'Flush DNS Cache',
    reset_factory_nodes: 'Restore Factory Nodes',

    // Default Browser Section
    sec_default_browser: 'Default Browser',
    default_browser_label: 'Make Napture Default',
    default_browser_desc: 'Set Napture as your default application for opening web links and HTML documents',
    make_default_btn: 'Set as Default',

    // Bookmarks Section
    sec_bookmarks: 'Bookmarks Manager',
    search_bookmarks_placeholder: 'Search saved bookmarks...',
    add_bookmark_btn: 'Add Bookmark',
    export_bookmarks_btn: 'Export (HTML)',
    import_bookmarks_btn: 'Import (HTML/JSON)',

    // Reset Section
    sec_reset: 'Reset & Maintenance',
    restore_defaults_label: 'Restore Default Settings',
    restore_defaults_desc: 'Reset all customized preferences to original factory default values',
    restore_defaults_btn: 'Restore Defaults',
    reset_all_label: 'Reset All Data',
    reset_all_desc: 'Permanently erase all bookmarks, history, open tabs, pinned sites, and restore factory defaults',
    reset_all_btn: 'Reset All',

    // About Section
    sec_about: 'About Napture',
    about_desc: 'A modern, ultra-lightweight web browser crafted with speed, privacy, and full desktop extensibility.',
    version: 'Version',
    runtime_environment: 'Runtime Environment',
    license: 'License',
    license_desc: 'Licensed under MIT Open Source',
    update_channel: 'Update Channel',
    update_channel_desc: 'Stable Rolling Release',
    check_updates_btn: 'Check for Updates',

    // Header & Main Chrome
    app_menu_tooltip: 'Napture Menu',
    new_tab: 'New Tab',
    history: 'History',
    settings: 'Settings',
    shortcuts: 'Keyboard Shortcuts',
    about_napture: 'About Napture',
    go_back: 'Go Back',
    go_forward: 'Go Forward',
    reload_page: 'Reload Page',
    go_home: 'Go Home',
    search_or_type_url: 'Search or type URL...',
    minimize: 'Minimize',
    maximize: 'Maximize',
    restore: 'Restore',
    close: 'Close',
    default_browser_card_title: 'Make Napture Default',
    set_as_default: 'Set as default',
    dismiss: 'Dismiss',

    // History Page
    history_title: 'Browsing History',
    search_history_placeholder: 'Search browsing history...',
    clear_all_history: 'Clear History',
    delete_selected: 'Delete Selected',
    select_all: 'Select All',
    no_history_title: 'No browsing history yet',
    no_history_desc: 'Pages you visit in Napture will appear here.',

    // Modals & General Actions
    confirm: 'Confirm',
    cancel: 'Cancel',
    save: 'Save',
    edit: 'Edit',
    delete: 'Delete',
    done: 'Done',
    copy: 'Copy',
    export: 'Export',
    import: 'Import'
  },

  'en-CA': {
    // Settings Navigation
    nav_appearance: 'Appearance & Features',
    nav_snippets: 'Snippets, eh?',
    nav_toolbar: 'Toolbar Preferences',
    nav_sync: 'Sync',
    nav_search: 'Search Engine',
    nav_privacy: 'Privacy & Security',
    nav_downloads: 'Downloads (sorry!)',
    nav_languages: 'Languages',
    nav_system: 'System & Performance',
    nav_protocols: 'Protocols',
    nav_default_browser: 'Default Browser, eh?',
    nav_bookmarks: 'Bookmarks & Favourites',
    nav_reset: 'Reset & Maintenance',
    nav_about: 'About Napture, eh?',
    settings_title: 'Settings',
    search_settings_placeholder: 'Search settings, eh?...',

    // Snippets Section
    sec_snippets: 'Quick Site Snippets',
    add_snippet_btn: 'Add Snippet',
    snippet_label: 'Snippet',
    description_label: 'Description',
    url_label: 'URL',
    snippets_desc: 'Type a snippet (e.g. .mail or .yt) into the address bar to jump directly to your shortcut URL, eh?',

    // Appearance Section
    sec_appearance: 'Appearance & Features',
    theme_label: 'Theme Accent Colour',
    theme_desc: 'Select a primary colour scheme for active tabs, buttons, and highlight rings',
    dynamic_bg_label: 'Dynamic Background Tone',
    dynamic_bg_desc: 'Extract dominant colour from active webpage and tint titlebar background',
    zoom_label: 'Default Page Zoom',
    zoom_desc: 'Set the initial magnification percentage for new pages and views',
    folder_hover_label: 'Hover to Open Folders',
    folder_hover_desc: 'Hover over bookmark folders in the sidebar to open or close them quickly, eh?',
    switch_to_existing_tab_label: 'Switch to existing tab or bookmark',
    switch_to_existing_tab_desc: 'Automatically switch to an open tab or bookmark when opening a duplicate URL, eh?',

    // Toolbar Section
    sec_toolbar: 'Toolbar & Navigation Bar',
    home_btn_label: 'Show Home Button',
    home_btn_desc: 'Display home icon button next to navigation controls in the address bar',
    home_url_label: 'Custom Home URL',
    home_url_desc: 'Web page or internal address to load when clicking the Home button',
    suggestions_label: 'Address Bar Search Suggestions',
    suggestions_desc: 'Display matching search recommendations from selected search engine as you type',
    full_url_label: 'Show Full URL in Address Display',
    full_url_desc: 'Display full protocol schemes and paths instead of simplified domain representations',
    customize_toolbar_label: 'Customize Toolbar',
    customize_toolbar_desc: 'Customize toolbar button visibility, order, custom link items, spacers, and configuration code, eh?',
    customize_toolbar_btn: 'Customize Toolbar',

    // Search Engine Section
    sec_search: 'Search Engine',
    search_engine_label: 'Default Search Engine',
    search_engine_desc: 'Search provider used when queries are entered directly in the address bar',

    // Downloads Section
    sec_downloads: 'Downloads (sorry!)',
    download_location_label: 'Download Location',
    download_location_desc: 'Folder path on disk where downloaded files are saved automatically',
    change_folder: 'Change Folder',
    ask_download_label: 'Ask where to save each file before downloading',
    ask_download_desc: 'Prompt a file save dialogue for every download request',

    // Privacy & Security Section
    sec_privacy: 'Privacy & Security',
    clear_browsing_data: 'Clear Browsing Data (sorry!)',
    clear_browsing_desc: 'Erase cached images, stored cookies, browsing history, and local storage data',
    clear_data_btn: 'Clear Data',
    safe_browsing_label: 'Safe Browsing Protection',
    safe_browsing_desc: 'Defend against malicious domains, malware distribution vectors, and phishing scams',
    sb_standard_title: 'Standard Protection',
    sb_standard_desc: 'Real-time defence against known threats and malicious URLs',
    sb_strict_title: 'Strict Protection',
    sb_strict_desc: 'Proactively block deceptive content and unverified redirects',
    sb_disabled_title: 'Turn Off Protection',
    sb_disabled_desc: 'No security protection (Not recommended, eh?)',
    dnt_label: 'Send "Do Not Track" Request',
    dnt_desc: 'Send a DNT header with outgoing HTTP/HTTPS web requests',
    https_only_label: 'Always Use Secure Connections (HTTPS-Only)',
    https_only_desc: 'Automatically upgrade all HTTP site requests to secure HTTPS encryption',

    // Languages Section
    sec_languages: 'Languages',
    interface_lang_label: 'Interface Language',
    interface_lang_desc: 'Primary locale used across browser menus and system dialogues',
    lang_feedback_note: "Don't see your language or the quality is poor? Help us with translations!",
    lang_completeness: 'Completeness',

    // System Section
    sec_system: 'System & Performance',
    perf_profile_label: 'Power & CPU Performance Profile',
    perf_profile_desc: 'Configure CPU cycle conservation, background tab throttling, and rendering frame rates',
    perf_battery_title: 'Battery Saver',
    perf_battery_sub: 'Limits rendering to 30 FPS and aggressively throttles background tabs & timers to save CPU cycles',
    perf_balanced_title: 'Balanced',
    perf_balanced_sub: 'Standard balanced execution optimised for daily browsing efficiency',
    perf_perf_title: 'Max Performance',
    perf_perf_sub: 'Unthrottled frame rates, high-priority background tab processing, and immediate rendering',
    hw_accel_label: 'Use Hardware Acceleration When Available',
    hw_accel_desc: 'Leverage GPU graphics hardware to render complex animations and WebGL contexts faster',

    // Protocols Section
    sec_protocols: 'Decentralised Protocols (ne://)',
    ne_protocol_label: 'Enable Neweb (ne://) Protocol',
    ne_protocol_desc: 'Enable resolution of decentralised .ne domains via Anycast DNS nodes',
    dns_nodes_label: 'Authoritative DNS Nodes',
    dns_nodes_desc: 'Configure the redundant Playit.gg Anycast DNS tunnels used for resolving .ne domains',
    add_node: 'Add Node',
    flush_dns_cache: 'Flush DNS Cache',
    reset_factory_nodes: 'Restore Factory Nodes',

    // Default Browser Section
    sec_default_browser: 'Default Browser',
    default_browser_label: 'Make Napture Default, eh?',
    default_browser_desc: 'Set Napture as your default application for opening web links and HTML documents',
    make_default_btn: 'Set as Default, eh?',

    // Bookmarks Section
    sec_bookmarks: 'Bookmarks & Favourites',
    search_bookmarks_placeholder: 'Search saved bookmarks...',
    add_bookmark_btn: 'Add Bookmark',
    export_bookmarks_btn: 'Export (HTML)',
    import_bookmarks_btn: 'Import (HTML/JSON)',

    // Reset Section
    sec_reset: 'Reset & Maintenance',
    restore_defaults_label: 'Restore Default Preferences',
    restore_defaults_desc: 'Reset all customised preferences to original factory default values',
    restore_defaults_btn: 'Restore Defaults',
    reset_all_label: 'Reset All Data, eh?',
    reset_all_desc: 'Permanently erase all bookmarks, history, open tabs, pinned sites, and restore factory defaults (sorry!)',
    reset_all_btn: 'Reset All',

    // About Section
    sec_about: 'About Napture, eh?',
    about_desc: 'A modern, ultra-lightweight web browser crafted with speed, privacy, and full desktop extensibility.',
    version: 'Version',
    runtime_environment: 'Runtime Environment',
    license: 'Licence',
    license_desc: 'Licenced under MIT Open Source',
    update_channel: 'Update Channel',
    update_channel_desc: 'Stable Rolling Release',
    check_updates_btn: 'Check for Updates',

    // Header & Main Chrome
    app_menu_tooltip: 'Napture Menu',
    new_tab: 'New Tab',
    history: 'Browsing History',
    settings: 'Settings',
    shortcuts: 'Keyboard Shortcuts',
    about_napture: 'About Napture, eh?',
    go_back: 'Go Back',
    go_forward: 'Go Forward',
    reload_page: 'Reload Page',
    go_home: 'Go Home, eh?',
    search_or_type_url: 'Search or type URL, eh?...',
    minimize: 'Minimize',
    maximize: 'Maximize',
    restore: 'Restore',
    close: 'Close',
    default_browser_card_title: 'Make Napture Default, eh?',
    set_as_default: 'Set as default',
    dismiss: 'Dismiss',

    // History Page
    history_title: 'Browsing History',
    search_history_placeholder: 'Search browsing history (sorry!)...',
    clear_all_history: 'Clear History',
    delete_selected: 'Delete Selected',
    select_all: 'Select All',
    no_history_title: 'No browsing history yet',
    no_history_desc: 'Pages you visit in Napture will appear here.',

    // Modals & General Actions
    confirm: 'Confirm',
    cancel: 'Cancel',
    save: 'Save',
    edit: 'Edit',
    delete: 'Delete',
    done: 'Done',
    copy: 'Copy',
    export: 'Export',
    import: 'Import'
  },

  'cute': {
    // Settings Navigation
    nav_appearance: 'Appeawance & Featwwes',
    nav_snippets: 'Snippets (owo)',
    nav_toolbar: 'Toowbaw Settings',
    nav_sync: 'Sync :3',
    nav_search: 'Seawch Engine',
    nav_privacy: 'Pwivacy & Secwwity',
    nav_downloads: 'D-Downwoads',
    nav_languages: 'Wanguage',
    nav_system: 'System & Pewfowmance',
    nav_protocols: 'Pwotocows',
    nav_default_browser: 'Defauwt Bwowsew',
    nav_bookmarks: 'Bookmawks Managew',
    nav_reset: 'Weset & Maintenance',
    nav_about: 'Abowt Naptwwe',
    settings_title: 'Settingws',
    search_settings_placeholder: 'Seawch settingws... (owo)',

    // Snippets Section
    sec_snippets: 'Kwick Site Snippets',
    add_snippet_btn: 'Add Snippet :3',
    snippet_label: 'Snippet',
    description_label: 'Discwipshun',
    url_label: 'UWW',
    snippets_desc: 'Type a snippet (e.g. .mail ow .yt) into the addwess baw to jump diwectwy! (uwu)',

    // Appearance Section
    sec_appearance: 'Appeawance & Featwwes',
    theme_label: 'Theme Accent Cowow',
    theme_desc: 'Sewect a pwimawy cowow scheme fow active tabs, bwttons, and highwight wings (◕‿◕)',
    dynamic_bg_label: 'Dynamic Backgwound Tone',
    dynamic_bg_desc: 'Extwact dominant cowow fwom active webpage and tint titwebaw backgwound (✿◠‿◠)',
    zoom_label: 'Defauwt Page Zoom',
    zoom_desc: 'Set the initiaw magnification pewcentage fow nyew pages and views',
    folder_hover_label: 'Huvvew to Open Fowdews',
    folder_hover_desc: 'Huvvew ovew bookmawk fowdews in the sidebaw to open ow cwose them quickwy (owo)',
    switch_to_existing_tab_label: 'Switch to existing tab ow bookmawk',
    switch_to_existing_tab_desc: 'Automaticawwy switch to an open tab ow bookmawk when opening a dupwicate UWW (｡♥‿♥｡)',

    // Toolbar Section
    sec_toolbar: 'Toowbaw & Navigation Baw',
    home_btn_label: 'Show Hyome Bwtton',
    home_btn_desc: 'Dispway hyome icon bwtton nyext to navigation contwows in the addwess baw',
    home_url_label: 'Cwwstom Hyome UWW',
    home_url_desc: 'Web page ow intewnaw addwess to woad when cwicking the Hyome bwtton',
    suggestions_label: 'Addwess Baw Seawch Swggestions',
    suggestions_desc: 'Dispway matching seawch wecommendations as u type (uwu)',
    full_url_label: 'Show Fuww UWW in Addwess Dispway',
    full_url_desc: 'Dispway fuww pwotocow schemes and paths instead of simpwified domain wepwesentations',
    customize_toolbar_label: 'Cwwstomize Toowbaw',
    customize_toolbar_desc: 'Cwwstomize toowbaw bwtton visibiwity, owdew, cwwstom winks, spaceews, and code (owo)',
    customize_toolbar_btn: 'Cwwstomize Toowbaw',

    // Search Engine Section
    sec_search: 'Seawch Engine',
    search_engine_label: 'Defauwt Seawch Engine',
    search_engine_desc: 'Seawch pwovidew used when quewies awe entewed diwectwy in the addwess baw',

    // Downloads Section
    sec_downloads: 'D-Downwoads & Fowdews',
    download_location_label: 'Downwoad Wocation',
    download_location_desc: 'Fowdew path on disk whewe downwoaded fiwes awe saved automaticawwy',
    change_folder: 'Change Fowdew',
    ask_download_label: '*blushes* Ask whewe to save each fiwe befowe downwoading?',
    ask_download_desc: 'Pwwmpt a fiwe save diawog fow evewy downwoad wequest :3',

    // Privacy & Security Section
    sec_privacy: 'Pwivacy & Secwwity',
    clear_browsing_data: 'Cweaw Bwowsing Data',
    clear_browsing_desc: 'Ewase cached images, stowwd cookies, bwowsing histowy, and wocaw stowage data',
    clear_data_btn: 'Cweaw Data',
    safe_browsing_label: 'Safe Bwowsing Pwotection',
    safe_browsing_desc: 'Defend against mawicious domains, mawwawe distwibwtion vectows, and phishing scams',
    sb_standard_title: 'Standawd Pwotection',
    sb_standard_desc: 'Weaw-time defense against knyown thweats and mawicious UWWs',
    sb_strict_title: 'Stwict Pwotection',
    sb_strict_desc: 'Pwoactivewy bwwck deceptive content and unwvewified wediwects (ò_ó)',
    sb_disabled_title: 'Tuwn Off Pwotection',
    sb_disabled_desc: 'Nyo secwwity pwotection (N-Not wecommended >_<)',
    dnt_label: 'Send "Do Nyot Twack" Wequest',
    dnt_desc: 'Send a DNT headew with outgoing HTTP/HTTPS web wequests',
    https_only_label: 'Awwways Use Secwwe Connections (HTTPS-Onwy)',
    https_only_desc: 'Automaticawwy upgwade aww HTTP site wequests to secwwe HTTPS encwyption',

    // Languages Section
    sec_languages: 'Wanguage',
    interface_lang_label: 'Intewface Wanguage',
    interface_lang_desc: 'Pwimawy wocawe used acwoss bwowsew menyus and system diawogs',
    lang_feedback_note: "Don't see ur wanguwage ow the quwawity is poow? Hewp uws with twanswations!",
    lang_completeness: 'Compwetenewss',

    // System Section
    sec_system: 'System & Pewfowmance',
    perf_profile_label: 'Powew & CPU Pewfowmance Pwofiwe',
    perf_profile_desc: 'Configwwe CPU cycwe consewvation, backgwound tab thwottwing, and wendewing fwame wates',
    perf_battery_title: 'Battewy Savew',
    perf_battery_sub: 'Wimits wendewing to 30 FPS and aggwessivewy thwottwes backgwound tabs to save CPU cycwes (˘ω˘)',
    perf_balanced_title: 'Bawanced',
    perf_balanced_sub: 'Standawd bawanced execution optimized fow daiwy bwowsing efficiency :3',
    perf_perf_title: 'Max Pewfowmance',
    perf_perf_sub: 'Unthwottwed fwame wates, high-pwiowity backgwound tab pwocessing, and zoomies! ⚡',
    hw_accel_label: 'Use Hawdwawe Accewewation When Avaiwabwe',
    hw_accel_desc: 'Wevewage GPU gwaphics hawdwawe to wendew compwex animations fasteew! (◕‿◕✿)',

    // Protocols Section
    sec_protocols: 'Decentwawized Pwotocows (ne://)',
    ne_protocol_label: 'Enabwe Nyeweb (ne://) Pwotocow',
    ne_protocol_desc: 'Enabwe wesowution of decentwawized .ne domains via Anycast DNS nyodes',
    dns_nodes_label: 'Authowitative DNS Nyodes',
    dns_nodes_desc: 'Configwwe the wedundant Pwayit.gg Anycast DNS tunnyews used fow wesowving .ne domains',
    add_node: 'Add Nyode',
    flush_dns_cache: 'Fwwsh DNS Cache',
    reset_factory_nodes: 'Westowe Factowy Nyodes',

    // Default Browser Section
    sec_default_browser: 'Defauwt Bwowsew',
    default_browser_label: 'Make Naptwwe Defauwt (pls!)',
    default_browser_desc: 'Set Naptwwe as ur defauwt appwication fow opening web winks and HTMW documents :3',
    make_default_btn: 'Set as Defauwt :3',

    // Bookmarks Section
    sec_bookmarks: 'Bookmawks Managew',
    search_bookmarks_placeholder: 'Seawch saved bookmawks... (owo)',
    add_bookmark_btn: 'Add Bookmawk',
    export_bookmarks_btn: 'Expowt (HTMW)',
    import_bookmarks_btn: 'Impowt (HTMW/JSON)',

    // Reset Section
    sec_reset: 'Weset & Maintenance',
    restore_defaults_label: 'Westowe Defauwt Settingws',
    restore_defaults_desc: 'Weset aww customized pwefewences to owiginaw factowy defauwt vawues',
    restore_defaults_btn: 'Westowe Defauwts',
    reset_all_label: 'Weset Aww Data >_<',
    reset_all_desc: 'Pewmanentwy ewase aww bookmawks, histowy, open tabs, pinned sites, and westowe factowy defauwts',
    reset_all_btn: 'Weset Aww',

    // About Section
    sec_about: 'Abowt Naptwwe',
    about_desc: 'A modewn, uwtwa-wightweight web bwowsew cwafted with speed, pwivacy, and fuww desktop extensibiwity (✿◠‿◠)',
    version: 'Vewsion',
    runtime_environment: 'Wuntime Enviwonment',
    license: 'Wicense',
    license_desc: 'Wicensed undew MIT Open Souwce',
    update_channel: 'UwUpdate Channyew',
    update_channel_desc: 'Stabwe Wowwing Wewease',
    check_updates_btn: '*blushes* C-Can I check fow updates automaticawwy?',

    // Header & Main Chrome
    app_menu_tooltip: 'Naptwwe Menyu',
    new_tab: 'Nyew Tab',
    history: 'Histowy',
    settings: 'Settingws',
    shortcuts: 'Keyboawd Showtcuts',
    about_napture: 'Abowt Naptwwe',
    go_back: 'Go Bawck',
    go_forward: 'Go Fowwawd',
    reload_page: 'Wewoad Page',
    go_home: 'Go Hyome',
    search_or_type_url: 'Seawch ow type UWW...',
    minimize: 'Minimyize',
    maximize: 'Maximyize',
    restore: 'Westowe',
    close: 'Cwose',
    default_browser_card_title: 'Make Naptwwe Defauwt (pls!)',
    set_as_default: 'Set as defauwt :3',
    dismiss: 'Dismiss (nuu)',

    // History Page
    history_title: 'Bwowsing Histowy',
    search_history_placeholder: 'Seawch bwowsing histowy... (owo)',
    clear_all_history: 'Cweaw Histowy',
    delete_selected: 'Dewete Sewected',
    select_all: 'Sewect Aww',
    no_history_title: 'Nyo bwowsing histowy yet (uwu)',
    no_history_desc: 'Pages u visit in Naptwwe wiww appeaw hewe :3',

    // Modals & General Actions
    confirm: 'Confiwm',
    cancel: 'Cancew',
    save: 'Save',
    edit: 'E-Edit',
    delete: 'Dewete',
    done: 'Donye',
    copy: 'Copy',
    export: 'Expowt',
    import: 'Impowt'
  }
};

function normalizeLang(lang) {
  if (!lang) return 'en-US';
  const l = String(lang).trim();
  if (l === 'cute' || l === 'en-UWU' || l === 'cute-en' || l === 'uwu') return 'cute';
  if (l === 'en-CA' || l === 'en_CA' || l.toLowerCase() === 'ca' || l.toLowerCase().startsWith('en-ca')) return 'en-CA';
  return 'en-US';
}

function t(key, lang = 'en-US') {
  const code = normalizeLang(lang);
  const locale = TRANSLATIONS[code] || TRANSLATIONS['en-US'];
  if (locale && locale[key] !== undefined) {
    return locale[key];
  }
  return TRANSLATIONS['en-US'][key] || key;
}

function getLocale(lang = 'en-US') {
  const code = normalizeLang(lang);
  return TRANSLATIONS[code] || TRANSLATIONS['en-US'];
}

function getLanguages() {
  return [
    { code: 'en-US', name: 'English (United States)', completeness: '100.0%' },
    { code: 'en-CA', name: 'English (Canadian)', completeness: '100.0%' },
    { code: 'cute', name: 'Cute Engwish', completeness: '100.0%' }
  ];
}

module.exports = {
  LANGUAGES,
  TRANSLATIONS,
  normalizeLang,
  t,
  getLocale,
  getLanguages
};
