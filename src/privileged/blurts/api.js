ChromeUtils.defineModuleGetter(this, "Services",
                               "resource://gre/modules/Services.jsm");
ChromeUtils.defineModuleGetter(this, "ExtensionCommon",
                               "resource://gre/modules/ExtensionCommon.jsm");

this.blurts = class extends ExtensionAPI {
  getAPI(context) {
    let FirefoxMonitorContainer = {};
    ChromeUtils.defineModuleGetter(FirefoxMonitorContainer, "FirefoxMonitor",
                                   context.extension.getURL("privileged/blurts/FirefoxMonitor.jsm"));
    return {
      blurts: {
        async start(variation, warnedSites, firstRunTimestamp) {
          FirefoxMonitorContainer.FirefoxMonitor.init(context.extension,
                                                      variation,
                                                      warnedSites.split(","),
                                                      firstRunTimestamp);
        },

        onEvent: new ExtensionCommon.EventManager(
          context,
          "blurts.onEvent",
          (fire) => {
            let listener = (id) => {
              fire.async(id);
            };

            FirefoxMonitorContainer.FirefoxMonitor.addEventListener(listener);

            return () => {
              FirefoxMonitorContainer.FirefoxMonitor.removeEventListener(listener);
            };
          }).api(),
      },
    };
  }
};
