const { app } = require("electron");
if (/-local\./.test(app.getVersion())) {
  process.env.T3CODE_HOME = require("node:path").join(require("node:os").homedir(), ".t3-local");
  process.env.T3CODE_DISABLE_AUTO_UPDATE = "true";
}

// Enables the compile cache before the main bundle loads, so the cache also
// covers main.cjs itself.
require("./compileCache.cjs");
require("./main.cjs");
