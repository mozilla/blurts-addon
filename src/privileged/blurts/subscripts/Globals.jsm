ChromeUtils.defineModuleGetter(this, "Preferences",
                               "resource://gre/modules/Preferences.jsm");
Cu.importGlobalProperties(["fetch", "btoa"]);

const gNotificationID = "fxmonitor_alert";

const XUL_NS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
const HTML_NS = "http://www.w3.org/1999/xhtml";
