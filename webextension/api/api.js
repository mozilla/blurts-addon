const { utils: Cu } = Components;

this.blurts = class extends ExtensionAPI {
  getAPI(context) {
    return {
      blurts: {
        async start() {
          Cu.import(context.extension.getURL("api/FirefoxMonitor.jsm"));
          FirefoxMonitor.init(context.extension);
        }
      }
    };
  }
}
