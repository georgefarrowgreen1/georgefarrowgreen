// Explicit optional asset boundary. Every new path is deliberately reviewed;
// unrelated roof files still count toward the ordinary core/cache checks.
import { existsSync, readFileSync } from 'node:fs';
import { ROOF } from './roof.mjs';
const host = ROOF && new URL('workspace.js', ROOF);
const savedLayouts = host && existsSync(host) && /import\s*\{\s*createWorkspaceStore\s*\}/.test(readFileSync(host, 'utf8'));
// Keep compatibility tests independent of which repository deploys first.
export const OS_RETIRED_JS = Object.freeze(['workspace-state.js', 'workspace-context.js', 'workspace-sync.js', 'workspace-sync-view.js']);
export const OS_FILES_JS = Object.freeze(['workspace-files.js', 'files-service.js', 'files-apps.js', 'files-metadata.js', 'files-location.js', 'files-drive.js', 'files-explorer.js', 'files-view.js']);
export const OS_FILES_CSS = Object.freeze(['workspace-files.css', 'files-view.css']);
export const OS_DIALOG_JS = Object.freeze(['files-dialogs.js']);
export const OS_DIALOG_CSS = Object.freeze(['files-dialogs.css']);
export const OS_ACTIVITY_JS = Object.freeze(['workspace-activity.js', 'workspace-activity-state.js']);
export const OS_ACTIVITY_CSS = Object.freeze(['workspace-activity.css']);
export const OS_SYNC_JS = Object.freeze(savedLayouts ? ['workspace-sync.js', 'workspace-sync-view.js'] : []);
export const OS_RECOVERY_JS = Object.freeze(['workspace-recovery.js', 'workspace-recovery-view.js', 'connection.js']);
export const OS_HANDOFF_JS = Object.freeze(['handoffs.js']);
export const OS_RECOVERY_CSS = Object.freeze(['workspace-recovery.css']);
export const OS_CONTINUITY_JS = Object.freeze(["continuity.js","offline-store.js","offline-prefs.js","ride-overview.js","files-history.js"].filter(f=>ROOF&&existsSync(new URL(f,ROOF))));
export const OS_SYSTEM350_JS=Object.freeze(['system350.js', 'system-client.js', 'actions-store.js', 'actions-ui.js', 'device-id.js', 'devices-ui.js', 'discovery350.js', 'files-viewer350.js', 'files-recovery350.js']);
export const OS_SYSTEM350_CSS=Object.freeze(['system350.css', 'files-viewer350.css']);
export const OS_SECURITY_JS=Object.freeze(['security-module.js','security-client.js']);
export const OS_SECURITY_CSS=Object.freeze(['security-module.css']);
export const OS_LIFE_JS=Object.freeze(['life410.js']);
export const OS_CAPTURE_FILES=Object.freeze([ROOF&&existsSync(new URL('../organise/releases/4.30/store.js',ROOF))?'/organise/releases/4.30/store.js':'/organise/releases/4.10/store.js']);
export const OS_LIFE_CSS=Object.freeze(['life410.css']);
const launcher420=ROOF&&existsSync(new URL('launcher-model.js',ROOF));
export const OS_LAUNCHER_JS=Object.freeze(launcher420?['launcher-model.js','launcher-motion.js',...(existsSync(new URL('launcher-input.js',ROOF))?['launcher-input.js']:[])]:[]);
export const OS_LAUNCHER_CSS=Object.freeze(launcher420?['launcher.css']:[]);
export const OS_CORE_JS = Object.freeze([...OS_LAUNCHER_JS,...OS_SECURITY_JS,...OS_LIFE_JS,...OS_SYSTEM350_JS,...OS_CONTINUITY_JS,'workspace.js', 'workspace-view.js', ...(savedLayouts ? ['workspace-state.js'] : []), 'workspace-catalog.js', ...(savedLayouts ? ['workspace-context.js'] : []), 'workspace-windows.js', 'workspace-commands.js', ...OS_FILES_JS, ...OS_DIALOG_JS, ...OS_ACTIVITY_JS, ...OS_SYNC_JS, ...OS_RECOVERY_JS, ...OS_HANDOFF_JS]);
export const OS_FILES = Object.freeze([...OS_CORE_JS.map(f => '/roof/' + f), ...OS_LAUNCHER_CSS.map(f=>'/roof/'+f), ...OS_SECURITY_CSS.map(f=>'/roof/'+f), ...OS_LIFE_CSS.map(f=>'/roof/'+f), ...OS_SYSTEM350_CSS.map(f=>'/roof/'+f), '/roof/workspace.css', '/roof/workspace-commands.css', ...OS_FILES_CSS.map(f => '/roof/' + f), ...OS_DIALOG_CSS.map(f => '/roof/' + f), ...OS_ACTIVITY_CSS.map(f => '/roof/' + f), ...OS_RECOVERY_CSS.map(f => '/roof/' + f), ...OS_CAPTURE_FILES, '/os.webmanifest']);
// Quick picker is a public optional primitive beside the Explorer host entry.
export const OS_ENTRIES = Object.freeze(['/roof/workspace.js', '/roof/workspace-files.js', ...OS_CONTINUITY_JS.filter(f=>['continuity.js','offline-prefs.js','ride-overview.js'].includes(f)).map(f=>'/roof/'+f)]);
export const OS_BRIDGES = Object.freeze(['fitness', 'weather', 'markets', 'chats', 'mail'].flatMap(app => [`/${app}/roof/workspace.js`, `/${app}/roof/workspace.css`]));
