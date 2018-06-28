/* eslint-env node */

const defaultConfig = {
  // Global options:
  sourceDir: "./src/",
  artifactsDir: "./dist/",
  ignoreFiles: [".DS_Store"],
  // Command options:
  build: {
    overwriteDest: true,
  },
  run: {
    firefox: process.env.FIREFOX_BINARY || "firefox",
    browserConsole: false,
    startUrl: ["about:debugging"],
    pref: [`extensions.fxmonitor_shield_mozilla_org.variationName=${process.env.VARIATION_NAME}`, "shieldStudy.logLevel=All"],
  },
};

module.exports = defaultConfig;
