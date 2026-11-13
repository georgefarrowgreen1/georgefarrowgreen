// Explicit optional asset boundary. Every new path is deliberately reviewed;
// unrelated roof files still count toward the ordinary core/cache checks.
export const OS_FILES_JS = Object.freeze(['workspace-files.js', 'files-service.js', 'files-apps.js', 'files-metadata.js', 'files-location.js', 'files-drive.js', 'files-explorer.js', 'files-view.js']);
export const OS_FILES_CSS = Object.freeze(['workspace-files.css', 'files-view.css']);
export const OS_CORE_JS = Object.freeze(['workspace.js', 'workspace-view.js', 'workspace-state.js', 'workspace-catalog.js', 'workspace-context.js', 'workspace-windows.js', 'workspace-commands.js', ...OS_FILES_JS]);
export const OS_FILES = Object.freeze([...OS_CORE_JS.map(f => '/roof/' + f), '/roof/workspace.css', '/roof/workspace-commands.css', ...OS_FILES_CSS.map(f => '/roof/' + f), '/os.webmanifest']);
// Quick picker is a public optional primitive beside the Explorer host entry.
export const OS_ENTRIES = Object.freeze(['/roof/workspace.js', '/roof/workspace-files.js']);
export const OS_BRIDGES = Object.freeze(['fitness', 'weather', 'markets', 'chats', 'mail'].flatMap(app => [`/${app}/roof/workspace.js`, `/${app}/roof/workspace.css`]));
