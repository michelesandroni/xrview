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

const xrDevice = new XRDevice(metaQuest3);
xrDevice.installRuntime();
xrDevice.installDevUI(DevUI);
xrDevice.installSEM(SyntheticEnvironmentModule);
xrDevice.sem?.loadEnvironment(sceneJson as any);
