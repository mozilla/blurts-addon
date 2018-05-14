const { utils: Cu } = Components;


Cu.import("resource://gre/modules/Services.jsm");

Components.utils.importGlobalProperties(["XMLHttpRequest"]);

const kBreachListURL = "https://stage.haveibeenpwned.com/api/v2/breaches";

function initSiteList() {
  let xhr = new XMLHttpRequest();
  xhr.onreadystatechange = function() {
    if (this.readyState == 4 && this.status == 200) {
      let sites = JSON.parse(xhr.responseText);
      siteSet = new Set(sites.map(site => site.Domain));
      siteSet.add("haveibeenpwned.com");
      startObserving();
    }
  };
  xhr.open("GET", kBreachListURL, true);
  xhr.send();
}

var observerAdded = false;

var tpl = {
  onLocationChange: function(aBrowser, aWebProgress, aRequest, aLocation) {
    warnIfNeeded(aBrowser, aLocation.host);
  }
}

function startObserving() {
  EveryWindow.registerCallback(
    "breach-alerts",
    (win) => {
      win.gBrowser.addTabsProgressListener(tpl);
    },
    () => {}
  );
  observerAdded = true;
}

function stopObserving() {
  if (observerAdded) {
    EveryWindow.unregisterCallback("breach-alerts");
  }
}

var siteSet = new Set();
var warnedHostSet = new Set();

function warnIfNeeded(browser, host) {
  if (host.startsWith("www.")) {
    host = host.substring(4);
  }

  if (warnedHostSet.has(host) || !siteSet.has(host)) {
    return;
  }

  let doc = browser.ownerDocument;

  warnedHostSet.add(host);

  let panel = doc.defaultView.PopupNotifications.panel;
  panel.addEventListener("popupshown", function() {
    let n = doc.getElementById("breach-alerts-notification");
    let box = doc.getAnonymousElementByAttribute(n, "class", "popup-notification-body");
    let elt = doc.createElementNS("http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul", "description");
    elt.setAttribute("value", "This website has been breached!");
    elt.setAttribute("style", "font-size: 1.3rem;");
    box.appendChild(elt);
    elt = doc.createElementNS("http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul", "description");
    elt.setAttribute("value", "Quick information about what a breach is, what it means and how it affects people.");
    box.appendChild(elt);
    elt = doc.createElementNS("http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul", "description");
    elt.setAttribute("value", "Why you should go to the website and scan all of your usernames. Lorem ipsum dolor sit amet, consectetur adipiscing elit.");
    box.appendChild(elt);
  }, { once: true });

  doc.defaultView.PopupNotifications.show(
    browser, "breach-alerts", "",
    null, {
      label: "Find Out More",
      accessKey: "f",
      callback: () => {
        doc.defaultView.openTrustedLinkIn("http://fx-breach-alerts.herokuapp.com/?breach=" + host, "tab");
      },
    }, [{label: "Dismiss", accessKey: "d", callback: () => {}}], {persistent: true});
}

function startup(aData, aReason) {
  initSiteList();
}

function shutdown(aData, aReason) {
  stopObserving();
}

var EveryWindow = {
  _callbacks: new Map(),
  _initialized: false,

  registerCallback: function EW_registerCallback(id, init, uninit) {
    if (this._callbacks.has(id)) {
      return;
    }

    this._callForEveryWindow(init);
    this._callbacks.set(id, {id, init, uninit});

    if (!this._initialized) {
      Services.obs.addObserver(this._onOpenWindow.bind(this),
                               "browser-delayed-startup-finished");
      this._initialized = true;
    }
  },

  unregisterCallback: function EW_unregisterCallback(aId, aCallUninit = true) {
    if (!this._callbacks.has(aId)) {
      return;
    }

    if (aCallUninit) {
      this._callForEveryWindow(this._callbacks.get(aId).uninit);
    }

    this._callbacks.delete(aId);
  },

  _callForEveryWindow(aFunction) {
    let windowList = Services.wm.getEnumerator("navigator:browser");
    while (windowList.hasMoreElements()) {
      let win = windowList.getNext();
      win.delayedStartupPromise.then(() => { aFunction(win) });
    }
  },

  _onOpenWindow(aWindow) {
    for (let c of this._callbacks.values()) {
      c.init(aWindow);
    }

    aWindow.addEventListener("unload",
                             this._onWindowClosing.bind(this),
                             { once: true });
  },

  _onWindowClosing(aEvent) {
    let win = aEvent.target;
    for (let c of this._callbacks.values()) {
      c.uninit(win);
    }
  },
};

this.blurts = class extends ExtensionAPI {
  getAPI(context) {
    return {
      blurts: {
        async start() {
          startup();
          context.extension.callOnClose({
            close: () => {
              shutdown();
            }
          });
        }
      }
    };
  }
}
