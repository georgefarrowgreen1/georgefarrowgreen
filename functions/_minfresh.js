// Which minified copies (min/) are still of their files as they are, worked out when the Workers are built
// (.tools/workers/build.mjs writes the list here for the build, then puts this back): the files and this code are
// deployed together, so what was true at the build is true for that deploy, and functions/_min.js needn't read and
// fingerprint each file again in every new copy of the server. null (as here, in the repository and the local test
// stack): not known, so _min.js checks each one as it's first asked for.
export const FRESH = null;

// Exact bytes served by the bundled Worker, including the unminified standalone scripts.
export const HOME_FILES = ["styles.css", "app.js", "404.js", "signedin.js", "loader.js", "loader-portrait.js"];
export const HOME_STAMPS = null;

// Public release numbers extracted from the same assets as the deployed Worker.
export const APP_BUILDS = null;
