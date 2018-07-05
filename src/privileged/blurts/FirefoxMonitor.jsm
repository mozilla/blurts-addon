ChromeUtils.defineModuleGetter(this, "Services",
                               "resource://gre/modules/Services.jsm");
Cu.importGlobalProperties(["fetch"]);

let gExtension;

this.FirefoxMonitor = {
  init(aExtension, warnedSites) {
    gExtension = aExtension;
    ChromeUtils.defineModuleGetter(this, "EveryWindow",
                                   gExtension.getURL("privileged/blurts/EveryWindow.jsm"));

    if (warnedSites) {
      warnedHostSet = new Set(warnedSites);
    }

    fetch(gExtension.getURL("breaches.json")).then((response) => {
      return response.json();
    }).then((sites) => {
      for (let site of sites) {
        domainMap.set(site.Domain.toLowerCase(), { Domain: site.Domain, Name: site.Name, Title: site.Title, PwnCount: site.PwnCount, BreachDate: site.BreachDate, DataClasses: site.DataClasses, logoSrc: `${site.Name}.${site.LogoType}` });
      }
      this.startObserving();
      aExtension.callOnClose({
        close: () => {
          this.stopObserving();
        },
      });
    });
  },

  observerAdded: false,

  startObserving() {
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

    this.EveryWindow.registerCallback(
      "breach-alerts",
      (win) => {
        setupPopupPanel(win.document);
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
    this.observerAdded = true;
  },

  stopObserving() {
    if (this.observerAdded) {
      this.EveryWindow.unregisterCallback("breach-alerts");
    }
  },
};

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

  warnedHostSet.add(host);

  showPanel(browser);
}

function showPanel(browser) {
  let doc = browser.ownerDocument;

  let populatePanel = (event) => {
    if (event !== "shown") {
      return;
    }
    const icon = doc.getAnonymousElementByAttribute(doc.getElementById(`${gNotificationID}-notification`),
                                                    "class", "popup-notification-icon");
    if (icon) {
      icon.style.display = "none";
    }
  };

  doc.defaultView.PopupNotifications.show(
    browser, gNotificationID, "",
    null, panelUI.primaryAction, panelUI.secondaryActions, {persistent: true, hideClose: true, eventCallback: populatePanel});
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

const panelUI = {
  box: null,
  doc: null,
  init(doc) {
    this.doc = doc;
    let box = doc.createElementNS(XUL_NS, "vbox");
    box.setAttribute("style", "max-width: 1px;");
    let elt = doc.createElementNS(XUL_NS, "description");
    elt.setAttribute("anonid", "maindesc");
    elt.appendChild(doc.createTextNode("Have an account? It may be at risk."));
    elt.setAttribute("style", "font-size: 150%; white-space: pre; padding-bottom: 1rem; margin-bottom: 1rem; border-bottom: 1px solid rgba(0,0,0,0.10);");
    box.appendChild(elt);
    elt = doc.createElementNS(XUL_NS, "hbox");
    elt.setAttribute("style", "margin-bottom: 1rem;");
    let elt2 = doc.createElementNS(XUL_NS, "image");
    elt2.setAttribute("flex", "0");
    elt2.setAttribute("style", `width: 64px; margin-inline-start: 6px; margin-inline-end: 5px; background: url(${gExtension.getURL("PwnedLogos/Adobe.svg")}) no-repeat; background-size: contain; background-position: center;`);
    elt.appendChild(elt2);
    elt2 = doc.createElementNS(XUL_NS, "vbox");
    elt2.setAttribute("align", "start");
    let elt3 = doc.createElementNS(XUL_NS, "description");
    elt3.appendChild(doc.createTextNode("Test"));
    elt3.setAttribute("style", "font-size: 150%; white-space: pre;");
    elt2.appendChild(elt3);
    elt3 = doc.createElementNS(XUL_NS, "description");
    elt3.setAttribute("style", "color: #D10022;");
    elt3.appendChild(doc.createTextNode("Breach Date"));
    elt2.appendChild(elt3);
    elt3 = doc.createElementNS(XUL_NS, "description");
    elt3.appendChild(doc.createTextNode("Test Date"));
    elt2.appendChild(elt3);
    elt.appendChild(elt2);
    box.appendChild(elt);
    elt = doc.createElementNS(XUL_NS, "description");
    elt.setAttribute("style", "color: #D10022;");
    elt.appendChild(doc.createTextNode("Compromised Accounts"));
    box.appendChild(elt);
    elt = doc.createElementNS(XUL_NS, "description");
    elt.appendChild(doc.createTextNode("Test Pwn Count"));
    box.appendChild(elt);
    elt = doc.createElementNS(XUL_NS, "description");
    elt.setAttribute("style", "color: #D10022;");
    elt.appendChild(doc.createTextNode("Compromised Data"));
    box.appendChild(elt);
    elt = doc.createElementNS(XUL_NS, "description");
    elt.appendChild(doc.createTextNode("Test Data Classes"));
    elt.setAttribute("style", "margin-bottom: 1rem; padding-bottom: 1rem; border-bottom: 1px solid rgba(0,0,0,0.10);");
    box.appendChild(elt);
    elt = doc.createElementNS(XUL_NS, "description");
    let strings = [
      {str: "This website was reported to "},
      {str: "Firefox Monitor", link: `https://monitor.firefox.com/?breach=Adobe`},
      {str: ", a service that collects information about data breaches and other ways hackers can steal your information."},
    ];
    elt.appendChild(makeSpanWithLinks(strings, doc));
    elt.appendChild(doc.createTextNode("This website was reported to Firefox Monitor, a service that collects information about data breaches and other ways hackers can steal your information."));
    elt.setAttribute("style", "white-space: pre-wrap; padding-bottom: 1rem;");
    box.appendChild(elt);
    delete this.box;
    this.box = box;
  },
  primaryAction: {
    label: "Go to Firefox Monitor",
    accessKey: "f",
    callback() {
      panelUI.doc.defaultView.openTrustedLinkIn(`https://monitor.firefox.com/?breach=Adobe`, "tab", { });
    },
  },
  secondaryActions: [
    {
      label: "Dismiss",
      accessKey: "d",
      callback: () => { },
    }, {
      label: "Never show breach alerts",
      accessKey: "n",
      callback: () => {
        blurtsDisabled = true;
      },
    },
  ],
};

function setupPopupPanel(doc) {
  let parentElt = doc.defaultView.PopupNotifications.panel.parentNode;
  let pn = doc.createElementNS(XUL_NS, "popupnotification");
  let pnContent = doc.createElementNS(XUL_NS, "popupnotificationcontent");
  panelUI.init(doc);
  pnContent.appendChild(panelUI.box);
  pn.appendChild(pnContent);
  pn.setAttribute("id", `${gNotificationID}-notification`);
  pn.setAttribute("hidden", "true");
  parentElt.appendChild(pn);
}

const EXPORTED_SYMBOLS = ["FirefoxMonitor"];
