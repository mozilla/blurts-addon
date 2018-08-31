/* globals ExtensionAPI */

ChromeUtils.defineModuleGetter(this, "Services",
                               "resource://gre/modules/Services.jsm");

let FirefoxMonitorContainer = {};

this.fxmonitor = class extends ExtensionAPI {
  getAPI(context) {
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

  onShutdown(shutdownReason) {
    if (!FirefoxMonitorContainer.FirefoxMonitor) {
      return;
    }

    FirefoxMonitorContainer.FirefoxMonitor.stopObserving();
  }
};
