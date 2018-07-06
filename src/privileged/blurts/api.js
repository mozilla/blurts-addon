ChromeUtils.defineModuleGetter(this, "Services",
                               "resource://gre/modules/Services.jsm");

this.blurts = class extends ExtensionAPI {
  getAPI(context) {
    const FirefoxMonitorContainer = {};
    Services.scriptloader.loadSubScript(context.extension.getURL("privileged/blurts/FirefoxMonitor.jsm"),
                                        FirefoxMonitorContainer);
    return {
      blurts: {
        async start() {
          FirefoxMonitorContainer.FirefoxMonitor.init(context.extension);
        },
      },
    };
  }
};
