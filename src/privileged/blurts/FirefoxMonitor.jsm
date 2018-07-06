this.FirefoxMonitor = {
  domainMap: new Map(),
  warnedHostSet: new Set(),
  extension: null,
  observerAdded: false,
  kNewtabURL: "about:newtab",
  kDisabledPref: "browser.firefoxMonitor.disabled",

  init(aExtension, warnedSites) {
    this.extension = aExtension;
    Services.scriptloader.loadSubScript(
      this.getURL("privileged/blurts/subscripts/Globals.jsm"));
    Services.scriptloader.loadSubScript(
      this.getURL("privileged/blurts/subscripts/EveryWindow.jsm"));
    Services.scriptloader.loadSubScript(
      this.getURL("privileged/blurts/subscripts/PanelUI.jsm"));

    if (warnedSites) {
      this.warnedHostSet = new Set(warnedSites);
    }

    fetch(this.getURL("breaches.json")).then((response) => {
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
    if (!aWebProgress.isTopLevel || aLocation.spec !== this.kNewtabURL) {
      return;
    }
    this.warnIfNeeded(aBrowser, this.kNewtabURL);
  },

  startObserving() {
    const tol = (event) => {
      const browser = event.target.linkedBrowser;
      if (browser.currentURI.spec !== this.kNewtabURL) {
        return;
      }
      this.warnIfNeeded(browser, this.kNewtabURL);
    };

    EveryWindow.registerCallback(
      "breach-alerts",
      (win) => {
        // Inject our stylesheet.
        const DOMWindowUtils =
          win.QueryInterface(Ci.nsIInterfaceRequestor)
             .getInterface(Ci.nsIDOMWindowUtils);
        DOMWindowUtils.loadSheetUsingURIString(this.getURL("privileged/blurts/FirefoxMonitor.css"),
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
        win.FirefoxMonitorUtils = {
          getURL: (aPath) => {
            return this.getURL(aPath);
          },
          disableBlurts: () => {
            this.disableBlurts();
          },
        };

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
      EveryWindow.unregisterCallback("breach-alerts");
    }
  },

  get blurtsDisabled() {
    return Preferences.get(this.kDisabledPref, false);
  },

  disableBlurts() {
    Preferences.set(this.kDisabledPref, true);
  },

  getURL(aPath) {
    return this.extension.getURL(aPath);
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
