Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "ExtensionCommon",
                                  "resource://gre/modules/ExtensionCommon.jsm");

this.blurts = class extends ExtensionAPI {
  getAPI(context) {
    let loader = Components.classes["@mozilla.org/moz/jssubscript-loader;1"]
                           .getService(Components.interfaces.mozIJSSubScriptLoader);
    let FirefoxMonitorContainer = {};
    loader.loadSubScript(context.extension.getURL("privileged/blurts/FirefoxMonitor.jsm"),
                                                  FirefoxMonitorContainer);
    return {
      blurts: {
        async start(variation) {
          FirefoxMonitorContainer.FirefoxMonitor.init(context.extension, variation);
        },

        onTelemetryEvent: new ExtensionCommon.EventManager(
          context,
          "blurts.onTelemetryEvent",
          (fire) => {
            let listener = (id) => {
              fire.async(id);
            };

            FirefoxMonitorContainer.FirefoxMonitor.addTelemetryListener(listener);

            return () => {
              FirefoxMonitorContainer.FirefoxMonitor.removeTelemetryListener(listener);
            };
          }).api(),
      }
    };
  }
}
