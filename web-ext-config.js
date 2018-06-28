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
    pref: ["shieldStudy.logLevel=All"],
  },
};

if (process.env.VARIATION_NAME) {
  defaultConfig.run.pref.push(`extensions.fxmonitor_shield_mozilla_org.variationName=${process.env.VARIATION_NAME}`);
}

module.exports = defaultConfig;
