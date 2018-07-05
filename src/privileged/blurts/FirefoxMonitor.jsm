ChromeUtils.defineModuleGetter(this, "Services",
                               "resource://gre/modules/Services.jsm");
ChromeUtils.defineModuleGetter(this, "AddonManager",
                               "resource://gre/modules/AddonManager.jsm");
Cu.importGlobalProperties(["fetch"]);

let gExtension;

this.FirefoxMonitor = {
  init(aExtension, aVariation, warnedSites, firstRunTimestamp) {
    gExtension = aExtension;
    ChromeUtils.defineModuleGetter(this, "EveryWindow",
                                   gExtension.getURL("privileged/blurts/EveryWindow.jsm"));

    if (warnedSites) {
      warnedHostSet = new Set(warnedSites);
    }

    fetch(gExtension.getURL("breaches.json")).then(function(response) {
      return response.json();
    }).then(function(sites) {
      for (let site of sites) {
        domainMap.set(site.Domain.toLowerCase(), { Domain: site.Domain, Name: site.Name, Title: site.Title, PwnCount: site.PwnCount, BreachDate: site.BreachDate, DataClasses: site.DataClasses, logoSrc: `${site.Name}.${site.LogoType}` });
      }
      startObserving();
      aExtension.callOnClose({
        close: () => {
          stopObserving();
        },
      });
    });

    AddonManager.addAddonListener(this);
  },

  onUninstalling(addon) {
    this.handleDisableOrUninstall(addon);
  },

  onDisabled(addon) {
    this.handleDisableOrUninstall(addon);
  },

  handleDisableOrUninstall(addon) {
    if (addon.id !== gExtension.id) {
      return;
    }
    AddonManager.removeAddonListener(this);
    // This is needed even for onUninstalling, because it nukes the addon
    // from UI. If we don't do this, the user has a chance to "undo".
    addon.uninstall();
  },

  eventListeners: new Set(),

  addEventListener(aListener) {
    this.eventListeners.add(aListener);
  },

  removeEventListener(aListener) {
    this.eventListeners.delete(aListener);
  },

  notifyEventListeners(id) {
    for (let cb of this.eventListeners) {
      cb(id);
    }
  },
};


let observerAdded = false;

function startObserving() {
  const newtabURL = "about:newtab";

  const tpl = {
    onStateChange(aBrowser, aWebProgress, aRequest, aStateFlags, aStatus) {
      let location = aRequest.URI;
      if (!aWebProgress.isTopLevel || aWebProgress.isLoadingDocument ||
          !Components.isSuccessCode(aStatus)) {
        return;
      }
      let host;
      try {
        host = Services.eTLD.getBaseDomain(location);
      } catch (e) {
      }
      if (!host) return;
      warnIfNeeded(aBrowser, host);
    },
    onLocationChange(aBrowser, aWebProgress, aRequest, aLocation) {
      if (!aWebProgress.isTopLevel || aLocation.spec !== newtabURL) {
        return;
      }
      warnIfNeeded(aBrowser, newtabURL);
    },
  };

  function tol(openEvent) {
    const browser = openEvent.target.linkedBrowser;
    if (browser.currentURI.spec !== newtabURL) {
      return;
    }
    warnIfNeeded(browser, newtabURL);
  }

  FirefoxMonitor.EveryWindow.registerCallback(
    "breach-alerts",
    (win) => {
      win.gBrowser.addTabsProgressListener(tpl);
      win.gBrowser.tabContainer.addEventListener("TabOpen", tol);
    },
    (win) => {
      if (!win.gBrowser) {
        return;
      }
      win.gBrowser.removeTabsProgressListener(tpl);
      win.gBrowser.tabContainer.removeEventListener("TabOpen", tol);
    },
  );
  observerAdded = true;
}

function stopObserving() {
  if (observerAdded) {
    FirefoxMonitor.EveryWindow.unregisterCallback("breach-alerts");
  }
}

let domainMap = new Map();
let warnedHostSet = new Set();
let blurtsDisabled = false;

const gNotificationID = "fxmonitor_alert";

function warnIfNeeded(browser, host) {
  if (blurtsDisabled || warnedHostSet.has(host)) {
    return;
  }

  if (!domainMap.has(host)) {
    return;
  }

  let doc = browser.ownerDocument;

  warnedHostSet.add(host);
  FirefoxMonitor.notifyEventListeners("warned_site_" + host);

  const ui = UIFactory[0](browser, doc, host, domainMap.get(host)); // get from pref

  showPanel(browser, ui, gNotificationID);
}

function showPanel(browser, ui, notificationID) {
  let doc = browser.ownerDocument;

  let populatePanel = (event) => {
    if (event !== "shown") {
      return;
    }
    let n = doc.getElementById(notificationID + "-notification");
    let body = doc.getAnonymousElementByAttribute(n, "class", "popup-notification-body");
    let box = body.querySelector(".blurtsbox");
    if (box) {
      box.remove();
    }
    box = ui.box;
    box.setAttribute("class", "blurtsbox");
    box.setAttribute("style", "font-size: 110%");
    body.appendChild(box);
    let icon = doc.getAnonymousElementByAttribute(n, "class", "popup-notification-icon");
    if (icon) {
      icon.remove();
    }
    if (ui._textbox) {
      doc.getAnonymousElementByAttribute(n, "anonid", "button").setAttribute("disabled", "true");
    }
  };

  doc.defaultView.PopupNotifications.show(
    browser, notificationID, "",
    null, ui.primaryAction, ui.secondaryActions, {persistent: true, hideClose: true, eventCallback: populatePanel});
  FirefoxMonitor.notifyEventListeners(`${notificationID}_shown`);
}

function makeSpanWithLinks(aStrParts, doc) {
  let spanElt = doc.createElementNS(HTML_NS, "span");
  for (let str of aStrParts) {
    if (!str.link) {
      spanElt.appendChild(doc.createTextNode(str.str));
      continue;
    }
    let anchor = doc.createElementNS(HTML_NS, "a");
    anchor.setAttribute("style", "color: #0060DF");
    anchor.setAttribute("href", str.link);
    anchor.addEventListener("click", (event) => {
      event.preventDefault();
      doc.defaultView.openTrustedLinkIn(str.link, "tab", {});
    });
    anchor.appendChild(doc.createTextNode(str.str));
    spanElt.appendChild(anchor);
  }
  return spanElt;
}

const XUL_NS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
const HTML_NS = "http://www.w3.org/1999/xhtml";
let UIFactory = [
  function(browser, doc, host, site) {
    let retval = {
      get box() {
        let box = doc.createElementNS(XUL_NS, "vbox");
        let elt = doc.createElementNS(XUL_NS, "description");
        elt.setAttribute("anonid", "maindesc");
        elt.appendChild(doc.createTextNode("Have an account? It may be at risk."));
        elt.setAttribute("style", "font-size: 150%; white-space: pre; padding-bottom: 1rem; margin-bottom: 1rem; border-bottom: 1px solid rgba(0,0,0,0.10);");
        box.appendChild(elt);
        elt = doc.createElementNS(XUL_NS, "hbox");
        elt.setAttribute("style", "margin-bottom: 1rem;");
        let elt2 = doc.createElementNS(XUL_NS, "image");
        elt2.setAttribute("flex", "0");
        elt2.setAttribute("style", `width: 64px; margin-inline-start: 6px; margin-inline-end: 5px; background: url(${gExtension.getURL("PwnedLogos/" + domainMap.get(host).logoSrc)}) no-repeat; background-size: contain; background-position: center;`);
        elt.appendChild(elt2);
        elt2 = doc.createElementNS(XUL_NS, "vbox");
        elt2.setAttribute("align", "start");
        let elt3 = doc.createElementNS(XUL_NS, "description");
        elt3.appendChild(doc.createTextNode(site.Title));
        elt3.setAttribute("style", "font-size: 150%; white-space: pre;");
        elt2.appendChild(elt3);
        elt3 = doc.createElementNS(XUL_NS, "description");
        elt3.setAttribute("style", "color: #D10022;");
        elt3.appendChild(doc.createTextNode("Breach Date"));
        elt2.appendChild(elt3);
        elt3 = doc.createElementNS(XUL_NS, "description");
        elt3.appendChild(doc.createTextNode(site.BreachDate));
        elt2.appendChild(elt3);
        elt.appendChild(elt2);
        box.appendChild(elt);
        elt = doc.createElementNS(XUL_NS, "description");
        elt.setAttribute("style", "color: #D10022;");
        elt.appendChild(doc.createTextNode("Compromised Accounts"));
        box.appendChild(elt);
        elt = doc.createElementNS(XUL_NS, "description");
        elt.appendChild(doc.createTextNode(site.PwnCount.toLocaleString()));
        box.appendChild(elt);
        elt = doc.createElementNS(XUL_NS, "description");
        elt.setAttribute("style", "color: #D10022;");
        elt.appendChild(doc.createTextNode("Compromised Data"));
        box.appendChild(elt);
        elt = doc.createElementNS(XUL_NS, "description");
        elt.appendChild(doc.createTextNode(site.DataClasses.join(", ")));
        elt.setAttribute("style", "margin-bottom: 1rem; padding-bottom: 1rem; border-bottom: 1px solid rgba(0,0,0,0.10);");
        box.appendChild(elt);
        elt = doc.createElementNS(XUL_NS, "description");
        let strings = [
          {str: "This website was reported to "},
          {str: "Firefox Monitor", link: `https://monitor.firefox.com/?breach=${site.Name}`},
          {str: ", a service that collects information about data breaches and other ways hackers can steal your information."},
        ];
        elt.appendChild(makeSpanWithLinks(strings, doc));
        elt.appendChild(doc.createTextNode("This website was reported to Firefox Monitor, a service that collects information about data breaches and other ways hackers can steal your information."));
        elt.setAttribute("style", "white-space: pre-wrap; padding-bottom: 1rem;");
        box.appendChild(elt);
        return box;
      },
    };
    retval.primaryAction = {
      label: "Go to Firefox Monitor",
      accessKey: "f",
      callback() {
        FirefoxMonitor.notifyEventListeners(`${gNotificationID}_submit`);
        doc.defaultView.openTrustedLinkIn(`https://monitor.firefox.com/?breach=${site.Name}`, "tab", { });
      },
    };
    retval.secondaryActions = [
      {
        label: "Dismiss",
        accessKey: "d",
        callback: () => {
          FirefoxMonitor.notifyEventListeners(`${gNotificationID}_dismiss`);
        },
      }, {
        label: "Never show breach alerts",
        accessKey: "n",
        callback: () => {
          FirefoxMonitor.notifyEventListeners(`${gNotificationID}_dismiss_permanent`);
          blurtsDisabled = true;
        },
      },
    ];
    return retval;
  },
];

const EXPORTED_SYMBOLS = ["FirefoxMonitor"];
