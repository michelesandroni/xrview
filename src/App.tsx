import { useState, useCallback, useEffect, useMemo } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "./App.css";

import { Button, ButtonGroup, InputGroup, Toolbar } from "@heroui/react";
import {
  IconArrowLeft, IconArrowRight, IconRefresh, IconBookmark,
  IconStar, IconStarFilled,
  IconHelp, IconInfoCircle, IconBug,
} from "@tabler/icons-react";
import { storageGet, storageSet } from "./storage";

interface Bookmark {
  id: string;
  label: string;
  url: string;
}

const BOOKMARKS_KEY = "bookmarks";

const DEFAULT_BOOKMARKS: Bookmark[] = [
  { id: "default-1", label: "Three.js | Ballshooter", url: "https://threejs.org/examples/?q=ballshooter" },
  { id: "default-2", label: "Three.js | WebXR Examples", url: "https://threejs.org/examples/?q=webxr" },
  { id: "default-3", label: "Babylon.js | WebXR Demos and Examples", url: "https://doc.babylonjs.com/features/featuresDeepDive/webXR/webXRDemos" },
];

function App() {
  const [url, setUrl] = useState("");
  const [licenses, setLicenses] = useState<string | null>(null);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);

  // Load bookmarks from storage on mount
  useEffect(() => {
    storageGet<Bookmark[]>(BOOKMARKS_KEY).then((bms) => {
      if (bms && bms.length > 0) {
        setBookmarks(bms);
      } else {
        setBookmarks(DEFAULT_BOOKMARKS);
        storageSet(BOOKMARKS_KEY, DEFAULT_BOOKMARKS);
      }
    });
  }, []);

  // Listen for browser navigation events to keep the URL bar in sync
  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    const promise = listen<string>("browser-navigated", (event) => {
      if (!cancelled) setUrl(event.payload);
    });
    return () => {
      cancelled = true;
      promise.then((fn) => fn());
    };
  }, []);

  const navigateTo = useCallback(async (target: string) => {
    try {
      await invoke("navigate", { url: target });
    } catch (e) {
      console.error("navigate failed:", e);
    }
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = url.trim();
      if (trimmed) navigateTo(trimmed);
    },
    [url, navigateTo],
  );

  // Derive whether the current URL matches a bookmark
  const matchedBookmark = useMemo(
    () => bookmarks.find((b) => b.url === url.trim()) ?? null,
    [bookmarks, url],
  );

  const handleBookmarkSelect = useCallback(
    (bm: Bookmark) => {
      setUrl(bm.url);
      navigateTo(bm.url);
    },
    [navigateTo],
  );

  // Listen for bookmark selection from the native OS popup menu
  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    const unlisten = listen<string>("bookmark-selected", (event) => {
      if (cancelled) return;
      const bm = bookmarks.find((b) => b.id === event.payload);
      if (bm) handleBookmarkSelect(bm);
    });
    return () => {
      cancelled = true;
      unlisten.then((fn) => fn());
    };
  }, [bookmarks, handleBookmarkSelect]);

  // Listen for bookmark edit/add results from the browser overlay
  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    const unlistenEdit = listen<{ id: string; label: string; url: string }>("bookmark-edited", (event) => {
      if (cancelled) return;
      const { id, label, url: newUrl } = event.payload;
      setBookmarks((prev) => {
        const existing = prev.find((b) => b.id === id);
        const next = existing
          ? prev.map((b) => (b.id === id ? { ...b, label, url: newUrl } : b))
          : [...prev, { id: id || crypto.randomUUID(), label, url: newUrl }];
        storageSet(BOOKMARKS_KEY, next);
        return next;
      });
    });
    const unlistenDel = listen<{ id: string }>("bookmark-deleted", (event) => {
      if (cancelled) return;
      setBookmarks((prev) => {
        const next = prev.filter((b) => b.id !== event.payload.id);
        storageSet(BOOKMARKS_KEY, next);
        return next;
      });
    });
    return () => {
      cancelled = true;
      unlistenEdit.then((fn) => fn());
      unlistenDel.then((fn) => fn());
    };
  }, []);

  // Star button: opens the bookmark editor overlay in the browser webview.
  // If the URL matches a bookmark → edit mode; otherwise → add mode (grabs page title).
  const handleStarPress = useCallback(async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    if (matchedBookmark) {
      invoke("show_bookmark_editor", {
        id: matchedBookmark.id,
        label: matchedBookmark.label,
        url: matchedBookmark.url,
      }).catch(console.error);
    } else {
      // Ask the browser webview for its page title via the internal nav trick.
      // We listen for the page-title event, then open the editor.
      let handled = false;
      const unlisten = await listen<{ t?: string }>("page-title", (event) => {
        if (handled) return;
        handled = true;
        unlisten();
        const pageTitle = event.payload.t || trimmed.replace(/^https?:\/\//, "");
        invoke("show_bookmark_editor", {
          id: "",
          label: pageTitle,
          url: trimmed,
        }).catch(console.error);
      });
      // Timeout fallback if the page doesn't have a title or navigation is blocked
      setTimeout(() => {
        if (!handled) {
          handled = true;
          unlisten();
          invoke("show_bookmark_editor", {
            id: "",
            label: trimmed.replace(/^https?:\/\//, ""),
            url: trimmed,
          }).catch(console.error);
        }
      }, 500);
      invoke("get_page_title").catch(() => {
        if (!handled) {
          handled = true;
          unlisten();
          invoke("show_bookmark_editor", {
            id: "",
            label: trimmed.replace(/^https?:\/\//, ""),
            url: trimmed,
          }).catch(console.error);
        }
      });
    }
  }, [url, matchedBookmark]);

  return (
    <Toolbar aria-label="XR View toolbar" className="h-12.5 w-full flex">
      <ButtonGroup variant="tertiary">
        <Button isIconOnly aria-label="Back" onPress={() => invoke("go_back").catch(console.error)}>
          <IconArrowLeft size={18} />
        </Button>
        <Button isIconOnly aria-label="Forward" onPress={() => invoke("go_forward").catch(console.error)}>
          <ButtonGroup.Separator />
          <IconArrowRight size={18} />
        </Button>
        <Button isIconOnly aria-label="Reload" onPress={() => invoke("reload").catch(console.error)}>
          <ButtonGroup.Separator />
          <IconRefresh size={18} />
        </Button>
      </ButtonGroup>

      <Button isIconOnly variant="tertiary" aria-label="Bookmarks" onPress={() => invoke("show_bookmark_menu", { bookmarks: bookmarks.map(b => ({ id: b.id, label: b.label })) }).catch(console.error)}>
        <IconBookmark size={18} />
      </Button>

      <form className="flex-1 min-w-0 flex items-center" onSubmit={handleSubmit}>
        <InputGroup className="w-full">
          <InputGroup.Input
            type="text"
            aria-label="URL"
            placeholder="Enter URL..."
            spellCheck={false}
            autoComplete="off"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <InputGroup.Suffix className="pr-2">
            <button
              type="button"
              aria-label={matchedBookmark ? "Edit bookmark" : "Add bookmark"}
              onClick={handleStarPress}
              disabled={!url.trim()}
              className="star-button"
            >
              {matchedBookmark
                ? <IconStarFilled size={18} className="text-yellow-400" />
                : <IconStar size={18} className="text-default-400" />}
            </button>
          </InputGroup.Suffix>
        </InputGroup>
      </form>

      <ButtonGroup variant="tertiary">
        <Button isIconOnly aria-label="Toggle DevTools" onPress={() => invoke("toggle_devtools").catch(console.error)}>
          <IconBug size={18} />
        </Button>
        <Button isIconOnly aria-label="XR Controls Help" onPress={() => invoke("show_help").catch(console.error)}>
          <ButtonGroup.Separator />
          <IconHelp size={18} />
        </Button>
        <Button isIconOnly aria-label="About XR View"
          onPress={async () => {
            let text = licenses;
            if (!text) {
              try {
                const r = await fetch("/licenses.txt");
                const ct = r.headers.get("content-type") || "";
                text = r.ok && !ct.includes("text/html")
                  ? await r.text()
                  : "(licenses.txt not available - run a production build)";
              } catch {
                text = "(licenses.txt not available - run a production build)";
              }
              setLicenses(text);
            }
            invoke("show_about", { licenses: text }).catch(console.error);
          }}
        >
          <ButtonGroup.Separator />
          <IconInfoCircle size={18} />
        </Button>
      </ButtonGroup>
    </Toolbar>
  );
}

export default App;
