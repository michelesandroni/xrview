/**
 * IWER (Immersive Web Emulation Runtime) injection script.
 * Bundled by esbuild into src-tauri/xr-emulator.js and injected into
 * every page via Tauri's initialization_script_for_all_frames.
 */

import { XRDevice, metaQuest3 } from 'iwer';
import { DevUI } from '@iwer/devui';
import { SyntheticEnvironmentModule } from '@iwer/sem';
import sceneJson from '@iwer/sem/captures/living_room.json';

// Signal to iwer that we are providing the WebXR implementation ourselves
// (suppresses its internal check for a native xr object)
(window as any).CustomWebXRPolyfill = true;

// Capture pristine builtins before page JS can tamper with them.
// __xrview_getTitle is called by the Rust get_page_title command to safely
// read document.title using the original encodeURIComponent.
const _xrviewEnc = encodeURIComponent;
Object.defineProperty(window, '__xrview_getTitle', {
    value: () => {
        window.location.href =
            'http://xrview.internal/page-title?t=' + _xrviewEnc(document.title || '');
    },
    writable: false,
    configurable: false,
    enumerable: false,
});

const xrDevice = new XRDevice(metaQuest3);
xrDevice.installRuntime();
xrDevice.installDevUI(DevUI);
xrDevice.installSEM(SyntheticEnvironmentModule);
xrDevice.sem?.loadEnvironment(sceneJson as any);
