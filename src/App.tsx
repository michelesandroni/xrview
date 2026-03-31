import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "./App.css";

import { Button, ButtonGroup, InputGroup, Modal, Toolbar } from "@heroui/react";
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

const isBookmark = (b: unknown): b is Bookmark =>
  typeof b === "object" && b !== null &&
  typeof (b as Record<string, unknown>).id === "string" &&
  typeof (b as Record<string, unknown>).label === "string" &&
  typeof (b as Record<string, unknown>).url === "string";

const DEFAULT_BOOKMARKS: Bookmark[] = [
  { id: "default-1", label: "Three.js | Ballshooter", url: "https://threejs.org/examples/?q=ballshooter" },
  { id: "default-2", label: "Three.js | WebXR Examples", url: "https://threejs.org/examples/?q=webxr" },
  { id: "default-3", label: "Babylon.js | WebXR Demos and Examples", url: "https://doc.babylonjs.com/features/featuresDeepDive/webXR/webXRDemos" },
];

function App() {
  const [url, setUrl] = useState("");
  const [licenses, setLicenses] = useState<string | null>(null);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);

  // Modal state
  const [bmEditorOpen, setBmEditorOpen] = useState(false);
  const [bmEditId, setBmEditId] = useState("");
  const [bmEditLabel, setBmEditLabel] = useState("");
  const [bmEditUrl, setBmEditUrl] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);

  // Track whether any modal is open to manage toolbar expansion
  const expandedRef = useRef(false);
  const setExpanded = useCallback(async (expanded: boolean) => {
    if (expandedRef.current === expanded) return;
    expandedRef.current = expanded;
    try {
      await invoke("set_toolbar_expanded", { expanded });
    } catch (e) {
      console.error("set_toolbar_expanded failed:", e);
    }
  }, []);

  // Expand toolbar when any modal opens, restore when all close
  useEffect(() => {
    const anyOpen = bmEditorOpen || helpOpen || aboutOpen;
    setExpanded(anyOpen);
  }, [bmEditorOpen, helpOpen, aboutOpen, setExpanded]);

  // Load bookmarks from storage on mount
  useEffect(() => {
    storageGet<Bookmark[]>(BOOKMARKS_KEY).then((bms) => {
      const validated = Array.isArray(bms) ? bms.filter(isBookmark) : [];
      if (validated.length > 0) {
        setBookmarks(validated);
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

  // Bookmark editor: save handler
  const handleBmSave = useCallback(() => {
    const label = bmEditLabel.trim();
    const newUrl = bmEditUrl.trim();
    if (!label || !newUrl) return;
    setBookmarks((prev) => {
      const existing = prev.find((b) => b.id === bmEditId);
      const next = existing
        ? prev.map((b) => (b.id === bmEditId ? { ...b, label, url: newUrl } : b))
        : [...prev, { id: bmEditId || crypto.randomUUID(), label, url: newUrl }];
      storageSet(BOOKMARKS_KEY, next);
      return next;
    });
    setBmEditorOpen(false);
  }, [bmEditId, bmEditLabel, bmEditUrl]);

  // Bookmark editor: delete handler
  const handleBmDelete = useCallback(() => {
    setBookmarks((prev) => {
      const next = prev.filter((b) => b.id !== bmEditId);
      storageSet(BOOKMARKS_KEY, next);
      return next;
    });
    setBmEditorOpen(false);
  }, [bmEditId]);

  // Star button: opens the bookmark editor modal
  const handleStarPress = useCallback(async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    if (matchedBookmark) {
      setBmEditId(matchedBookmark.id);
      setBmEditLabel(matchedBookmark.label);
      setBmEditUrl(matchedBookmark.url);
      setBmEditorOpen(true);
    } else {
      setBmEditId("");
      setBmEditUrl(trimmed);
      // Try to grab the page title from the browser webview
      const fallbackLabel = trimmed.replace(/^https?:\/\//, "");
      let handled = false;
      const unlisten = await listen<string>("page-title", (event) => {
        if (handled) return;
        handled = true;
        unlisten();
        setBmEditLabel(event.payload || fallbackLabel);
        setBmEditorOpen(true);
      });
      setTimeout(() => {
        if (!handled) {
          handled = true;
          unlisten();
          setBmEditLabel(fallbackLabel);
          setBmEditorOpen(true);
        }
      }, 500);
      invoke("get_page_title").catch(() => {
        if (!handled) {
          handled = true;
          unlisten();
          setBmEditLabel(fallbackLabel);
          setBmEditorOpen(true);
        }
      });
    }
  }, [url, matchedBookmark]);

  return (
    <>
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
          <Button isIconOnly aria-label="XR Controls Help" onPress={() => setHelpOpen(true)}>
            <ButtonGroup.Separator />
            <IconHelp size={18} />
          </Button>
          <Button isIconOnly aria-label="About XR View"
            onPress={async () => {
              if (!licenses) {
                let text: string;
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
              setAboutOpen(true);
            }}
          >
            <ButtonGroup.Separator />
            <IconInfoCircle size={18} />
          </Button>
        </ButtonGroup>
      </Toolbar>

      {/* Bookmark Editor Modal */}
      <Modal.Backdrop isOpen={bmEditorOpen} onOpenChange={setBmEditorOpen}>
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-md">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>{bmEditId ? "Edit Bookmark" : "Add Bookmark"}</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-3">
              <label className="text-sm text-muted">
                Label
                <input
                  type="text"
                  className="mt-1 w-full rounded-none bg-surface px-3 py-2 text-foreground border border-default-200 outline-none"
                  value={bmEditLabel}
                  onChange={(e) => setBmEditLabel(e.target.value)}
                  autoFocus
                />
              </label>
              <label className="text-sm text-muted">
                URL
                <input
                  type="text"
                  className="mt-1 w-full rounded-none bg-surface px-3 py-2 text-foreground border border-default-200 outline-none"
                  value={bmEditUrl}
                  onChange={(e) => setBmEditUrl(e.target.value)}
                />
              </label>
            </Modal.Body>
            <Modal.Footer>
              {bmEditId && (
                <Button variant="secondary" className="mr-auto text-danger" onPress={handleBmDelete}>
                  Delete
                </Button>
              )}
              <Button variant="secondary" slot="close">Cancel</Button>
              <Button onPress={handleBmSave}>Save</Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>

      {/* Help Modal */}
      <Modal.Backdrop isOpen={helpOpen} onOpenChange={setHelpOpen}>
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-lg">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>XR Controls</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <table className="w-full text-sm">
                <tbody>
                  {[
                    ["Enter Play Mode", "\u25B6 Play button in overlay"],
                    ["Look around", "Mouse move"],
                    ["Walk", "Hold Shift + W/A/S/D"],
                    ["Right trigger", "Left click"],
                    ["Left trigger", "Right click"],
                    ["Exit Play Mode", "Esc"],
                  ].map(([action, control]) => (
                    <tr key={action}>
                      <td className="py-1 pr-4 whitespace-nowrap text-muted">{action}</td>
                      <td className="py-1 whitespace-nowrap">{control}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Modal.Body>
            <Modal.Footer>
              <Button slot="close">Close</Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>

      {/* About Modal */}
      <Modal.Backdrop isOpen={aboutOpen} onOpenChange={setAboutOpen}>
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-2xl max-h-[85vh] flex flex-col">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>XR View</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-3 overflow-hidden">
              <p className="text-sm font-bold text-danger">
                This is an experimental developer tool, not a general-purpose web browser.
                It loads untrusted web content in an OS webview - use at your own risk.
                The author(s) make no guarantees about security, stability, or fitness for any particular purpose.
                This project is licensed under the MIT License.
              </p>
              <pre className="flex-1 overflow-auto text-xs text-muted whitespace-pre-wrap">{licenses}</pre>
            </Modal.Body>
            <Modal.Footer>
              <Button slot="close">Close</Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </>
  );
}

export default App;
