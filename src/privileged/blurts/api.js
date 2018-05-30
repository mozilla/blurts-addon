Cu.import("resource://gre/modules/XPCOMUtils.jsm");
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

        onTelemetryEvent: new ExtensionCommon.EventManager({
          context,
          name: "blurts.onTelemetryEvent",
          register: (fire) => {
            let listener = (id) => {
              fire.sync(id);
            };

            FirefoxMonitor.addTelemetryListener(listener);

            return () => {
              FirefoxMonitor.removeTelemetryListener(listener);
            };
          },
        }).api(),
      }
    };
  }
}
