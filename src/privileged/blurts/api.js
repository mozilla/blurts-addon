this.blurts = class extends ExtensionAPI {
  getAPI(context) {
    let FirefoxMonitorContainer = {};
    ChromeUtils.defineModuleGetter(FirefoxMonitorContainer, "FirefoxMonitor",
                                   context.extension.getURL("privileged/blurts/FirefoxMonitor.jsm"));
    return {
      blurts: {
        async start() {
          FirefoxMonitorContainer.FirefoxMonitor.init(context.extension);
        },
      },
    };
  }
};
