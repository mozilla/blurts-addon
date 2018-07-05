ChromeUtils.defineModuleGetter(this, "Services",
                               "resource://gre/modules/Services.jsm");
Cu.importGlobalProperties(["fetch"]);

const gNotificationID = "fxmonitor_alert";

let gExtension;

this.FirefoxMonitor = {
  domainMap: new Map(),
  warnedHostSet: new Set(),
  blurtsDisabled: false,
  observerAdded: false,
  newtabURL: "about:newtab",

  init(aExtension, warnedSites) {
    gExtension = aExtension;
    ChromeUtils.defineModuleGetter(this, "EveryWindow",
                                   gExtension.getURL("privileged/blurts/EveryWindow.jsm"));

    if (warnedSites) {
      this.warnedHostSet = new Set(warnedSites);
    }

    fetch(gExtension.getURL("breaches.json")).then((response) => {
      return response.json();
    }).then((sites) => {
      for (let site of sites) {
        this.domainMap.set(site.Domain.toLowerCase(), { Domain: site.Domain, Name: site.Name, Title: site.Title, PwnCount: site.PwnCount, BreachDate: site.BreachDate, DataClasses: site.DataClasses.join(", "), logoSrc: `${site.Name}.${site.LogoType}` });
      }
      this.startObserving();
      aExtension.callOnClose({
        close: () => {
          this.stopObserving();
        },
      });
    });
  },

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
    this.warnIfNeeded(aBrowser, host);
  },

  onLocationChange(aBrowser, aWebProgress, aRequest, aLocation) {
    if (!aWebProgress.isTopLevel || aLocation.spec !== this.newtabURL) {
      return;
    }
    this.warnIfNeeded(aBrowser, this.newtabURL);
  },

  startObserving() {
    const tol = (event) => {
      const browser = event.target.linkedBrowser;
      if (browser.currentURI.spec !== this.newtabURL) {
        return;
      }
      this.warnIfNeeded(browser, this.newtabURL);
    };
    this.EveryWindow.registerCallback(
      "breach-alerts",
      (win) => {
        // Inject our stylesheet.
        const DOMWindowUtils =
          win.QueryInterface(Ci.nsIInterfaceRequestor)
             .getInterface(Ci.nsIDOMWindowUtils);
        DOMWindowUtils.loadSheetUsingURIString(gExtension.getURL("privileged/blurts/FirefoxMonitor.css"),
                                               DOMWindowUtils.AUTHOR_SHEET);

        // Setup the popup notification.
        let doc = win.document;
        let parentElt = doc.defaultView.PopupNotifications.panel.parentNode;
        let pn = doc.createElementNS(XUL_NS, "popupnotification");
        let pnContent = doc.createElementNS(XUL_NS, "popupnotificationcontent");

        let panelUI = new PanelUI(doc);
        pnContent.appendChild(panelUI.box);
        pn.appendChild(pnContent);
        pn.setAttribute("id", `${gNotificationID}-notification`);
        pn.setAttribute("hidden", "true");
        parentElt.appendChild(pn);
        win.FirefoxMonitorPanelUI = panelUI;

        // Start listening!
        win.gBrowser.addTabsProgressListener(this);
        win.gBrowser.tabContainer.addEventListener("TabOpen", tol);
      },
      (win) => {
        if (!win.gBrowser) {
          return;
        }
        win.gBrowser.removeTabsProgressListener(this);
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

  warnIfNeeded(browser, host) {
    if (this.blurtsDisabled || this.warnedHostSet.has(host)) {
      return;
    }

    if (!this.domainMap.has(host)) {
      return;
    }

    this.warnedHostSet.add(host);

    let doc = browser.ownerDocument;
    let panelUI = doc.defaultView.FirefoxMonitorPanelUI;

    let populatePanel = (event) => {
      if (event !== "showing") {
        return;
      }
      panelUI.refresh(this.domainMap.get(host));
    };

    doc.defaultView.PopupNotifications.show(
      browser, gNotificationID, "",
      null, panelUI.primaryAction, panelUI.secondaryActions,
      {persistent: true, hideClose: true, eventCallback: populatePanel});
  },
};

const XUL_NS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
const HTML_NS = "http://www.w3.org/1999/xhtml";

function PanelUI(doc) {
  this.doc = doc;
  const box = doc.createElementNS(XUL_NS, "vbox");
  box.className = "container";

  let elt, elt2, elt3;

  elt = doc.createElementNS(XUL_NS, "description");
  elt.appendChild(doc.createTextNode("Have an account? It may be at risk."));
  elt.classList.add("headerText", "bottomBorder");
  box.appendChild(elt);

  elt = doc.createElementNS(XUL_NS, "hbox");
    elt2 = doc.createElementNS(XUL_NS, "image");
    elt2.setAttribute("flex", "0");
    elt2.className = "breachLogo";
    this.logoElt = elt2;
    elt.appendChild(elt2);

    elt2 = doc.createElementNS(XUL_NS, "vbox");
    elt2.setAttribute("align", "start");
      elt3 = doc.createElementNS(XUL_NS, "description");
      elt3.className = "headerText";
      this.breachNameElt = elt3;
      elt2.appendChild(elt3);

      elt3 = doc.createElementNS(XUL_NS, "description");
      elt3.className = "redText";
      elt3.appendChild(doc.createTextNode("Breach Date"));
      elt2.appendChild(elt3);

      elt3 = doc.createElementNS(XUL_NS, "description");
      this.breachDateElt = elt3;
      elt2.appendChild(elt3);
    elt.appendChild(elt2);
  box.appendChild(elt);

  elt = doc.createElementNS(XUL_NS, "description");
  elt.className = "redText";
  elt.appendChild(doc.createTextNode("Compromised Accounts"));
  box.appendChild(elt);

  elt = doc.createElementNS(XUL_NS, "description");
  this.pwnCountElt = elt;
  box.appendChild(elt);

  elt = doc.createElementNS(XUL_NS, "description");
  elt.className = "redText";
  elt.appendChild(doc.createTextNode("Compromised Data"));
  box.appendChild(elt);

  elt = doc.createElementNS(XUL_NS, "description");
  elt.className = "bottomBorder";
  this.breachDataElt = elt;
  box.appendChild(elt);

  elt = doc.createElementNS(XUL_NS, "description");
  elt2 = doc.createElementNS(HTML_NS, "span");
    elt2.appendChild(doc.createTextNode("This website was reported to "));

    elt3 = doc.createElementNS(HTML_NS, "a");
      elt3.addEventListener("click", (event) => {
        event.preventDefault();
        doc.defaultView.openTrustedLinkIn(`https://monitor.firefox.com/?breach=${this.site.Name}`, "tab", {});
      });
      elt3.appendChild(doc.createTextNode("Firefox Monitor"));
      this.monitorLink = elt3;
    elt2.appendChild(elt3);

    elt2.appendChild(doc.createTextNode(", a service that collects information about data breaches and other ways hackers can steal your information."));
  elt.appendChild(elt2);
  elt.appendChild(doc.createTextNode("This website was reported to Firefox Monitor, a service that collects information about data breaches and other ways hackers can steal your information."));
  elt.className = "specialStuff";
  box.appendChild(elt);

  this.box = box;
}

PanelUI.prototype = {
  box: null,
  logoElt: null,
  breachNameElt: null,
  breachDateElt: null,
  pwnCountElt: null,
  breachDataElt: null,
  monitorLink: null,
  doc: null,
  site: null,

  get primaryAction() {
    return {
      label: "Go to Firefox Monitor",
      accessKey: "f",
      callback: () => {
        this.doc.defaultView.openTrustedLinkIn(`https://monitor.firefox.com/?breach=${this.site.Name}`, "tab", { });
      },
    };
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
        FirefoxMonitor.blurtsDisabled = true;
      },
    },
  ],

  refresh(site) {
    this.site = site;

    const doc = this.doc;

    this.logoElt.style.backgroundImage = `url(${gExtension.getURL(`PwnedLogos/${site.logoSrc}`)}`;

    function clearChildren(elt) {
      while (elt.firstChild) elt.firstChild.remove();
    }

    clearChildren(this.breachNameElt);
    this.breachNameElt.appendChild(doc.createTextNode(site.Name));

    clearChildren(this.breachDateElt);
    this.breachDateElt.appendChild(doc.createTextNode(site.BreachDate));

    clearChildren(this.pwnCountElt);
    this.pwnCountElt.appendChild(doc.createTextNode(site.PwnCount.toLocaleString()));

    clearChildren(this.breachDataElt);
    this.breachDataElt.appendChild(doc.createTextNode(site.DataClasses));

    this.monitorLink.setAttribute("href", `https://monitor.firefox.com/?breach=${site.Name}`);
  },
};

const EXPORTED_SYMBOLS = ["FirefoxMonitor"];
