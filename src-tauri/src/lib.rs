use std::sync::Mutex;
use tauri::menu::{ContextMenu, Menu, MenuItem};
use tauri::webview::WebviewBuilder;
use tauri::window::WindowBuilder;
use tauri::{
    Emitter, LogicalPosition, LogicalSize, Manager, Position, Rect, Size, WebviewUrl, WindowEvent,
};

const TOOLBAR_HEIGHT: f64 = 50.0;
const INITIAL_WIDTH: f64 = 1280.0;
const INITIAL_HEIGHT: f64 = 800.0;

/// Holds the browser webview handle so commands can drive it.
struct BrowserWebview(pub tauri::webview::Webview);

unsafe impl Send for BrowserWebview {}
unsafe impl Sync for BrowserWebview {}

// ── Tauri commands ────────────────────────────────────────────────────────────

#[tauri::command]
async fn navigate(
    url: String,
    state: tauri::State<'_, Mutex<Option<BrowserWebview>>>,
) -> Result<(), String> {
    let normalized = if url.starts_with("http://") || url.starts_with("https://") {
        url
    } else {
        format!("https://{}", url)
    };
    let parsed = normalized
        .parse::<tauri::Url>()
        .map_err(|e| e.to_string())?;
    let guard = state.lock().unwrap();
    if let Some(bv) = guard.as_ref() {
        bv.0.navigate(parsed).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn go_back(state: tauri::State<'_, Mutex<Option<BrowserWebview>>>) -> Result<(), String> {
    let guard = state.lock().unwrap();
    if let Some(bv) = guard.as_ref() {
        bv.0.eval("history.back()").map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn go_forward(state: tauri::State<'_, Mutex<Option<BrowserWebview>>>) -> Result<(), String> {
    let guard = state.lock().unwrap();
    if let Some(bv) = guard.as_ref() {
        bv.0.eval("history.forward()").map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn reload(state: tauri::State<'_, Mutex<Option<BrowserWebview>>>) -> Result<(), String> {
    let guard = state.lock().unwrap();
    if let Some(bv) = guard.as_ref() {
        bv.0.reload().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn get_page_title(
    state: tauri::State<'_, Mutex<Option<BrowserWebview>>>,
) -> Result<String, String> {
    let guard = state.lock().unwrap();
    if let Some(bv) = guard.as_ref() {
        // Eval returns nothing directly; use a navigation intercept to get the title.
        // Instead, we eval a script that navigates to xrview.internal with the title.
        bv.0.eval(
            "window.location.href='http://xrview.internal/page-title?t='+encodeURIComponent(document.title||'')"
        ).map_err(|e| e.to_string())?;
    }
    Ok(String::new())
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
async fn show_bookmark_editor(
    id: String,
    label: String,
    url: String,
    state: tauri::State<'_, Mutex<Option<BrowserWebview>>>,
) -> Result<(), String> {
    let escape_js = |s: &str| -> String {
        let mut out = String::with_capacity(s.len() + 2);
        out.push('\'');
        for ch in s.chars() {
            match ch {
                '\\' => out.push_str("\\\\"),
                '\'' => out.push_str("\\'"),
                '\n' => out.push_str("\\n"),
                '\r' => {}
                _ => out.push(ch),
            }
        }
        out.push('\'');
        out
    };

    let mode = if id.is_empty() { "add" } else { "edit" };

    let script = format!(
        "{}\n{}",
        include_str!("../overlays/shared.js"),
        include_str!("../overlays/bookmark-edit.js")
            .replace("__BM_MODE__", &escape_js(mode))
            .replace("__BM_ID__", &escape_js(&id))
            .replace("__BM_LABEL__", &escape_js(&label))
            .replace("__BM_URL__", &escape_js(&url))
    );

    let guard = state.lock().unwrap();
    if let Some(bv) = guard.as_ref() {
        bv.0.eval(&script).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn show_help(state: tauri::State<'_, Mutex<Option<BrowserWebview>>>) -> Result<(), String> {
    let script = format!(
        "{}\n{}",
        include_str!("../overlays/shared.js"),
        include_str!("../overlays/help.js")
    );
    let guard = state.lock().unwrap();
    if let Some(bv) = guard.as_ref() {
        bv.0.eval(&script).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn show_about(
    licenses: String,
    state: tauri::State<'_, Mutex<Option<BrowserWebview>>>,
) -> Result<(), String> {
    // Build a JS string literal from the licenses text, escaping special chars.
    let mut escaped = String::with_capacity(licenses.len() + 2);
    escaped.push('\'');
    for ch in licenses.chars() {
        match ch {
            '\\' => escaped.push_str("\\\\"),
            '\'' => escaped.push_str("\\'"),
            '\n' => escaped.push_str("\\n"),
            '\r' => {}
            _ => escaped.push(ch),
        }
    }
    escaped.push('\'');

    let script = format!(
        "{}\n{}",
        include_str!("../overlays/shared.js"),
        include_str!("../overlays/about.js").replace("__LICENSES__", &escaped)
    );

    let guard = state.lock().unwrap();
    if let Some(bv) = guard.as_ref() {
        bv.0.eval(&script).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn toggle_devtools(
    state: tauri::State<'_, Mutex<Option<BrowserWebview>>>,
) -> Result<(), String> {
    let guard = state.lock().unwrap();
    if let Some(bv) = guard.as_ref() {
        if bv.0.is_devtools_open() {
            bv.0.close_devtools();
        } else {
            bv.0.open_devtools();
        }
    }
    Ok(())
}

// ── App entry point ───────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(Mutex::new(None::<BrowserWebview>))
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
                // Intercept internal commands from browser overlays
                if url.host_str() == Some("xrview.internal") {
                    let params: std::collections::HashMap<String, String> =
                        url.query_pairs()
                            .map(|(k, v)| (k.to_string(), v.to_string()))
                            .collect();
                    match url.path() {
                        "/save-bookmark" => {
                            let _ = app_handle.emit("bookmark-edited", params);
                        }
                        "/delete-bookmark" => {
                            let _ = app_handle.emit("bookmark-deleted", params);
                        }
                        "/page-title" => {
                            let _ = app_handle.emit("page-title", params);
                        }
                        _ => {}
                    }
                    return false;
                }
                let s = url.scheme();
                if s == "http" || s == "https" {
                    let _ = app_handle.emit("browser-navigated", url.to_string());
                }
                true
            });

            let browser = win.add_child(
                browser_builder,
                LogicalPosition::new(0.0, TOOLBAR_HEIGHT),
                LogicalSize::new(INITIAL_WIDTH, INITIAL_HEIGHT - TOOLBAR_HEIGHT),
            )?;

            // 5. Store handles in managed state
            let state = app.state::<Mutex<Option<BrowserWebview>>>();
            *state.lock().unwrap() = Some(BrowserWebview(browser.clone()));

            // 6. Resize handler: keep both webviews filling the window
            let browser_clone = browser.clone();
            let toolbar_clone = toolbar.clone();
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
            show_bookmark_menu,
            show_bookmark_editor,
            show_help,
            show_about,
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
