use tauri::menu::{ContextMenu, Menu, MenuItem};
use tauri::webview::WebviewBuilder;
use tauri::window::WindowBuilder;
use tauri::{
    Emitter, LogicalPosition, LogicalSize, Manager, Position, Rect, Size, WebviewUrl, WindowEvent,
};

const TOOLBAR_HEIGHT: f64 = 50.0;
const INITIAL_WIDTH: f64 = 1280.0;
const INITIAL_HEIGHT: f64 = 800.0;

// ── Tauri commands ────────────────────────────────────────────────────────────

#[tauri::command]
fn navigate(url: String, app: tauri::AppHandle) -> Result<(), String> {
    let normalized = if url.get(..7).is_some_and(|p| p.eq_ignore_ascii_case("http://"))
        || url.get(..8).is_some_and(|p| p.eq_ignore_ascii_case("https://"))
    {
        url
    } else {
        format!("https://{}", url)
    };
    let parsed = normalized
        .parse::<tauri::Url>()
        .map_err(|e| e.to_string())?;
    let scheme = parsed.scheme();
    if scheme != "http" && scheme != "https" {
        return Err(format!("blocked scheme: {}", scheme));
    }
    if let Some(browser) = app.get_webview("browser") {
        browser.navigate(parsed).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn go_back(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(browser) = app.get_webview("browser") {
        browser.eval("history.back()").map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn go_forward(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(browser) = app.get_webview("browser") {
        browser.eval("history.forward()").map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn reload(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(browser) = app.get_webview("browser") {
        browser.reload().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn get_page_title(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(browser) = app.get_webview("browser") {
        // Uses __xrview_getTitle defined in the init script, which captures
        // pristine encodeURIComponent before page JS can tamper with it.
        browser.eval(
            "typeof __xrview_getTitle==='function'&&__xrview_getTitle()"
        ).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn set_toolbar_expanded(expanded: bool, app: tauri::AppHandle) -> Result<(), String> {
    let toolbar = app.get_webview("toolbar").ok_or("toolbar not found")?;
    let win = app.get_window("main").ok_or("window not found")?;
    let scale = win.scale_factor().unwrap_or(1.0);
    let phys = win.inner_size().map_err(|e| e.to_string())?;
    let lw = phys.width as f64 / scale;
    let lh = phys.height as f64 / scale;

    if expanded {
        // Toolbar takes full window, browser is hidden (zero height)
        toolbar.set_bounds(Rect {
            position: Position::Logical(LogicalPosition::new(0.0, 0.0)),
            size: Size::Logical(LogicalSize::new(lw, lh)),
        }).map_err(|e| e.to_string())?;
        if let Some(browser) = app.get_webview("browser") {
            browser.set_bounds(Rect {
                position: Position::Logical(LogicalPosition::new(0.0, lh)),
                size: Size::Logical(LogicalSize::new(lw, 0.0)),
            }).map_err(|e| e.to_string())?;
        }
    } else {
        // Restore normal layout
        toolbar.set_bounds(Rect {
            position: Position::Logical(LogicalPosition::new(0.0, 0.0)),
            size: Size::Logical(LogicalSize::new(lw, TOOLBAR_HEIGHT)),
        }).map_err(|e| e.to_string())?;
        if let Some(browser) = app.get_webview("browser") {
            browser.set_bounds(Rect {
                position: Position::Logical(LogicalPosition::new(0.0, TOOLBAR_HEIGHT)),
                size: Size::Logical(LogicalSize::new(lw, lh - TOOLBAR_HEIGHT)),
            }).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[derive(serde::Deserialize)]
struct BookmarkItem {
    id: String,
    label: String,
}

#[tauri::command]
async fn show_bookmark_menu(
    app: tauri::AppHandle,
    bookmarks: Vec<BookmarkItem>,
) -> Result<(), String> {
    let app2 = app.clone();
    app.run_on_main_thread(move || {
        let Some(window) = app2.get_window("main") else {
            return;
        };
        let Ok(menu) = Menu::new(&app2) else { return };
        if bookmarks.is_empty() {
            if let Ok(item) = MenuItem::new(&app2, "(no bookmarks)", false, None::<&str>) {
                let _ = menu.append(&item);
            }
        } else {
            for bm in &bookmarks {
                if let Ok(item) = MenuItem::with_id(
                    &app2,
                    format!("bm:{}", bm.id),
                    &bm.label,
                    true,
                    None::<&str>,
                ) {
                    let _ = menu.append(&item);
                }
            }
        }
        let _ = menu.popup(window);
    })
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn toggle_devtools(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(browser) = app.get_webview("browser") {
        if browser.is_devtools_open() {
            browser.close_devtools();
        } else {
            browser.open_devtools();
        }
    }
    Ok(())
}

// ── App entry point ───────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            // 1. Create the OS window (no default webview)
            let win = WindowBuilder::new(app, "main")
                .title("XR View")
                .inner_size(INITIAL_WIDTH, INITIAL_HEIGHT)
                .build()?;

            // 2. IWER init script - bundled by esbuild from src/xr-inject.ts
            let init_script = include_str!("../xr-emulator.js").to_string();

            // 3. Toolbar webview (loads our React SPA)
            let toolbar_builder =
                WebviewBuilder::new("toolbar", WebviewUrl::App("index.html".into()));
            let toolbar = win.add_child(
                toolbar_builder,
                LogicalPosition::new(0.0, 0.0),
                LogicalSize::new(INITIAL_WIDTH, TOOLBAR_HEIGHT),
            )?;

            // 4. Browser webview (navigates real URLs + XR polyfill)
            //    No Tauri capabilities - the "browser" label is absent from
            //    capabilities/default.json, so this webview has zero IPC access.
            let app_handle = app.handle().clone();
            let browser_builder = WebviewBuilder::new(
                "browser",
                WebviewUrl::External(
                    "about:blank"
                        .parse::<tauri::Url>()
                        .expect("hardcoded URL is valid"),
                ),
            )
            .initialization_script_for_all_frames(init_script)
            .devtools(true)
            .on_navigation(move |url| {
                // Block non-HTTP(S) schemes first (javascript:, data:, blob:, file:, etc.)
                // This MUST come before the host check so that crafted URLs like
                // data://xrview.internal/... cannot reach the internal route handler.
                let s = url.scheme();
                if s != "http" && s != "https" {
                    return false;
                }
                // Intercept internal page-title readback
                if url.host_str() == Some("xrview.internal") {
                    if url.path() == "/page-title" {
                        let title = url.query_pairs()
                            .find(|(k, _)| k == "t")
                            .map(|(_, v)| v.to_string())
                            .unwrap_or_default();
                        let _ = app_handle.emit("page-title", title);
                    }
                    return false;
                }
                let _ = app_handle.emit("browser-navigated", url.to_string());
                true
            });

            let browser = win.add_child(
                browser_builder,
                LogicalPosition::new(0.0, TOOLBAR_HEIGHT),
                LogicalSize::new(INITIAL_WIDTH, INITIAL_HEIGHT - TOOLBAR_HEIGHT),
            )?;

            // 5. Resize handler: keep both webviews filling the window
            //    (commands look them up via app.get_webview() instead)
            let browser_clone = browser;
            let toolbar_clone = toolbar;
            win.on_window_event(move |event| {
                if let WindowEvent::Resized(phys) = event {
                    let scale = browser_clone.window().scale_factor().unwrap_or(1.0);
                    let lw = phys.width as f64 / scale;
                    let lh = phys.height as f64 / scale;

                    let _ = toolbar_clone.set_bounds(Rect {
                        position: Position::Logical(LogicalPosition::new(0.0, 0.0)),
                        size: Size::Logical(LogicalSize::new(lw, TOOLBAR_HEIGHT)),
                    });
                    let _ = browser_clone.set_bounds(Rect {
                        position: Position::Logical(LogicalPosition::new(0.0, TOOLBAR_HEIGHT)),
                        size: Size::Logical(LogicalSize::new(lw, lh - TOOLBAR_HEIGHT)),
                    });
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            navigate,
            go_back,
            go_forward,
            reload,
            get_page_title,
            set_toolbar_expanded,
            show_bookmark_menu,
            toggle_devtools
        ])
        .on_menu_event(|app, event| {
            let id: &str = event.id().as_ref();
            if let Some(bm_id) = id.strip_prefix("bm:") {
                let _ = app.emit("bookmark-selected", bm_id.to_string());
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
