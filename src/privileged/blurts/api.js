Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "ExtensionCommon",
                                  "resource://gre/modules/ExtensionCommon.jsm");

this.blurts = class extends ExtensionAPI {
  getAPI(context) {
    Cu.import(context.extension.getURL("privileged/blurts/FirefoxMonitor.jsm"));
    return {
      blurts: {
        async start() {
          FirefoxMonitor.init(context.extension);
        },

        onTelemetryEvent: new ExtensionCommon.EventManager(
          context,
          "blurts.onTelemetryEvent",
          (fire) => {
            let listener = (id) => {
              fire.async(id);
            };

            FirefoxMonitor.addTelemetryListener(listener);

            return () => {
              FirefoxMonitor.removeTelemetryListener(listener);
            };
          }).api(),
      }
    };
  }
}
