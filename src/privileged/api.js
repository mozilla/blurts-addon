/* globals ExtensionAPI */

ChromeUtils.defineModuleGetter(this, "Services",
                               "resource://gre/modules/Services.jsm");

this.fxmonitor = class extends ExtensionAPI {
  getAPI(context) {
    let FirefoxMonitorContainer = {};
    Services.scriptloader.loadSubScript(context.extension.getURL("privileged/FirefoxMonitor.jsm"),
                                        FirefoxMonitorContainer);
    return {
      fxmonitor: {
        async start() {
          await FirefoxMonitorContainer.FirefoxMonitor.init(context.extension);
        },
      },
    };
  }
};
