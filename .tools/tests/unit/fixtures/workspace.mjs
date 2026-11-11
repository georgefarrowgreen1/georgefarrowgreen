// Explicit optional asset boundary. New unrelated roof files remain part of the
// core budget/cache checks until this contract is deliberately reviewed.
export const OS_CORE_JS = Object.freeze(['workspace.js', 'workspace-view.js', 'workspace-state.js', 'workspace-catalog.js', 'workspace-context.js', 'workspace-windows.js', 'workspace-commands.js', 'workspace-files.js']);
export const OS_FILES = Object.freeze([...OS_CORE_JS.map(f => '/roof/' + f), '/roof/workspace.css', '/roof/workspace-commands.css', '/roof/workspace-files.css', '/os.webmanifest']);
export const OS_BRIDGES = Object.freeze(['fitness', 'weather', 'markets', 'chats', 'mail'].flatMap(app => [`/${app}/roof/workspace.js`, `/${app}/roof/workspace.css`]));
