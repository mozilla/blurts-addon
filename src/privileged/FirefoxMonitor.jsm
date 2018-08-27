/* globals Services, XPCOMUtils */

this.FirefoxMonitor = {
  // Map of breached site host -> breach metadata.
  domainMap: new Map(),

  // Set of hosts for which the user has already been shown,
  // and interacted with, the popup.
  warnedHostsSet: new Set(),

  // The above set is persisted as a JSON string in this pref.
  kWarnedHostsPref: "extensions.fxmonitor.warnedHosts",

  // Reference to the extension object from the WebExtension context.
  // Used for getting URIs for resources packaged in the extension.
  extension: null,

  // Whether we've started observing for the user visiting a breached site.
  observerAdded: false,

  // loadStrings loads a stringbundle into this property.
  strings: null,

  // This is here for documentation, will be redefined to a pref getter
  // using XPCOMUtils.defineLazyPreferenceGetter in init().
  enabled: null,

  kEnabledPref: "extensions.fxmonitor.enabled",

  kNotificationID: "fxmonitor",

  // This is here for documentation, will be redefined to a pref getter
  // using XPCOMUtils.defineLazyPreferenceGetter in delayedInit().
  // The value of this property is used as the URL from which to fetch
  // the list of breached sites.
  breachListURL: null,
  kBreachListURLPref: "extensions.fxmonitor.breachListURL",
  kDefaultBreachListURL: "https://monitor.firefox.com/hibp/breaches",

  // This is here for documentation, will be redefined to a pref getter
  // using XPCOMUtils.defineLazyPreferenceGetter in delayedInit().
  // The value of this property is used as the timeout after which to
  // refresh our list of breached sites.
  breachRefreshTimeout: null,
  kBreachRefreshTimeoutPref: "extensions.fxmonitor.breachRefreshTimeout",
  kDefaultBreachRefreshTimeout: 10 * 60 * 1000, // 10 minutes

  // This is here for documentation, will be redefined to a pref getter
  // using XPCOMUtils.defineLazyPreferenceGetter in delayedInit().
  // The value of this property is used as the URL to which the user
  // is directed when they click "Check Firefox Monitor".
  FirefoxMonitorURL: null,
  kFirefoxMonitorURLPref: "extensions.fxmonitor.FirefoxMonitorURL",
  kDefaultFirefoxMonitorURL: "https://monitor.firefox.com",

  disable() {
    Preferences.set(this.kEnabledPref, false);
  },

  getURL(aPath) {
    return this.extension.getURL(aPath);
  },

  getString(aKey) {
    return this.strings.GetStringFromName(aKey);
  },

  getFormattedString(aKey, args) {
    return this.strings.formatStringFromName(aKey, args, args.length);
  },

  async init(aExtension) {
    this.extension = aExtension;

    XPCOMUtils.defineLazyPreferenceGetter(
      this, "enabled", this.kEnabledPref, false,
      async (pref, oldVal, newVal) => {
        if (newVal) {
          this.startObserving();
        } else {
          this.stopObserving();
        }
      }
    );

    if (this.enabled) {
      this.startObserving();
    }
  },


  // Used to enforce idempotency of delayedInit. delayedInit is
  // called in startObserving() to ensure we load our strings, etc.
  _delayedInited: false,
  async delayedInit() {
    if (this._delayedInited) {
      return;
    }

    /* globals AddonManager, Preferences, fetch, btoa, XUL_NS */
    Services.scriptloader.loadSubScript(
      this.getURL("privileged/subscripts/Globals.jsm"));

    /* globals EveryWindow */
    Services.scriptloader.loadSubScript(
      this.getURL("privileged/subscripts/EveryWindow.jsm"));

    /* globals PanelUI */
    Services.scriptloader.loadSubScript(
      this.getURL("privileged/subscripts/PanelUI.jsm"));

    Services.telemetry.registerScalars("fxmonitor", {
      "doorhanger_shown": {
        kind: Ci.nsITelemetry.SCALAR_TYPE_COUNT,
        keyed: false,
        record_on_release: true,
      },
      "doorhanger_removed": {
        kind: Ci.nsITelemetry.SCALAR_TYPE_COUNT,
        keyed: false,
        record_on_release: true,
      },
      "check_btn_clicked": {
        kind: Ci.nsITelemetry.SCALAR_TYPE_COUNT,
        keyed: false,
        record_on_release: true,
      },
      "dismiss_btn_clicked": {
        kind: Ci.nsITelemetry.SCALAR_TYPE_COUNT,
        keyed: false,
        record_on_release: true,
      },
      "never_show_btn_clicked": {
        kind: Ci.nsITelemetry.SCALAR_TYPE_COUNT,
        keyed: false,
        record_on_release: true,
      },
    });

    let warnedHostsJSON = Preferences.get(this.kWarnedHostsPref, "");
    if (warnedHostsJSON) {
      try {
        let json = JSON.parse(warnedHostsJSON);
        this.warnedHostsSet = new Set(json);
      } catch (ex) {
        // Invalid JSON, invalidate the pref.
        Preferences.reset(this.kWarnedHostsPref);
      }
    }

    XPCOMUtils.defineLazyPreferenceGetter(this, "breachListURL",
      this.kBreachListURLPref, this.kDefaultBreachListURL);

    XPCOMUtils.defineLazyPreferenceGetter(this, "breachRefreshTimeout",
      this.kBreachRefreshTimeoutPref, this.kDefaultBreachRefreshTimeout);

    XPCOMUtils.defineLazyPreferenceGetter(this, "FirefoxMonitorURL",
      this.kFirefoxMonitorURLPref, this.kDefaultFirefoxMonitorURL);

    await this.loadStrings();
    await this.loadBreaches();

    AddonManager.addAddonListener(this);

    this._delayedInited = true;
  },

  onUninstalled(aAddon) {
    if (aAddon.id !== this.extension.id) {
      return;
    }

    this.stopObserving();
    AddonManager.removeAddonListener(this);
  },

  async loadStrings() {
    // Services.strings.createBundle has a whitelist of URL schemes that it
    // accepts. moz-extension: is not one of them, so we work around that
    // by reading the file manually and creating a data: URL (allowed).
    // TODO:
    // - Check locale and load relevant file
    // - Optimize?
    let response = await fetch(this.getURL("locales/en_US/strings.properties"));
    let buffer = await response.arrayBuffer();
    let binary = "";
    let bytes = new Uint8Array(buffer);
    let len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    let b64 = btoa(binary);
    this.strings = Services.strings.createBundle(`data:text/plain;base64,${b64}`);
  },

  _loadBreachesTimer: null,
  _breachesLastModified: 0,
  async loadBreaches() {
    let response = await fetch(this.breachListURL, {
      headers: {
        "If-Modified-Since": this._breachesLastModified,
      },
    });

    // Arm the refresh timer already, since we may return early if we 304'd.
    this._loadBreachesTimer = setTimeout(() => this.loadBreaches(), this.breachRefreshTimeout);

    // If the list hasn't been updated since we last checked, the server
    // will send a 304 response. In any case, we don't handle anything
    // except a 200 OK.
    if (response.status !== 200) {
      return;
    }

    this._breachesLastModified = response.headers.get("Last-Modified");

    let sites = await response.json();

    this.domainMap.clear();
    sites.forEach(site => {
      // Round the PwnCount:
      // If < 100k: keep as is; e.g. 12,345 -> 12,345
      // If < 1M: round to nearest 100k; e.g. 234,567 -> 200,000
      // If < 1B: round to nearest millions; e.g. 123,456,789 -> 123 million
      // If >= 1B: round to nearest billions; e.g. 9,123,456,789 -> 9 billion
      let k100k = 100000;
      let k1m = 1000000;
      let k1b = 1000000000;
      if (site.PwnCount < k100k) {
        site.PwnCount = site.PwnCount.toLocaleString();
      } else if (site.PwnCount < k1m) {
        let pwnCount = site.PwnCount - site.PwnCount%k100k;
        site.PwnCount = pwnCount.toLocaleString();
      } else if (site.PwnCount < k1b) {
        let pwnCount = Math.floor(site.PwnCount / k1m);
        site.PwnCount = this.getFormattedString("fxmonitor.popupText.millionUnit",
                                                [pwnCount.toLocaleString()]);
      } else {
        let pwnCount = Math.floor(site.PwnCount / k1b);
        site.PwnCount = this.getFormattedString("fxmonitor.popupText.billionUnit",
                                                [pwnCount.toLocaleString()]);
      }

      this.domainMap.set(site.Domain, {
        Name: site.Name,
        PwnCount: site.PwnCount,
        Year: (new Date(site.BreachDate)).getFullYear(),
      });
    });
  },

  // nsIWebProgressListener implementation.
  onStateChange(aBrowser, aWebProgress, aRequest, aStateFlags, aStatus) {
    if (!aWebProgress.isTopLevel || aWebProgress.isLoadingDocument ||
        !Components.isSuccessCode(aStatus)) {
      return;
    }

    let host;
    try {
      host = Services.eTLD.getBaseDomain(aRequest.URI);
    } catch (e) {
      // If we can't get the host for the URL, it's not one we
      // care about for breach alerts anyway.
      return;
    }

    this.warnIfNeeded(aBrowser, host);
  },

  async startObserving() {
    if (this.observerAdded) {
      return;
    }

    await this.delayedInit();

    EveryWindow.registerCallback(
      this.kNotificationID,
      (win) => {
        // Inject our stylesheet.
        let DOMWindowUtils = win.windowUtils;
        if (!DOMWindowUtils) {
          // win.windowUtils was added in 63, fallback if it's not available.
          DOMWindowUtils = win.QueryInterface(Ci.nsIInterfaceRequestor)
                              .getInterface(Ci.nsIDOMWindowUtils);
        }
        DOMWindowUtils.loadSheetUsingURIString(this.getURL("privileged/FirefoxMonitor.css"),
                                               DOMWindowUtils.AUTHOR_SHEET);

        // Set up some helper functions on the window object
        // for the popup notification to use.
        win.FirefoxMonitorUtils = {
          // Keeps track of all notifications currently shown,
          // so that we can clear them out properly if we get
          // disabled.
          notifications: new Set(),
          disable: () => {
            this.disable();
          },
          getString: (aKey) => {
            return this.getString(aKey);
          },
          getFormattedString: (aKey, args) => {
            return this.getFormattedString(aKey, args);
          },
          getFirefoxMonitorURL: (aSiteName) => {
            return `${this.FirefoxMonitorURL}/?breach=${encodeURIComponent(aSiteName)}&utm_source=firefox&utm_medium=popup`;
          },
        };

        // Setup the popup notification stuff. First, the URL bar icon:
        let doc = win.document;
        let box = doc.getElementById("notification-popup-box");
        // We create a box to use as the anchor, and put an icon image
        // inside it. This way, when we animate the icon, its scale change
        // does not cause the popup notification to bounce due to the anchor
        // point moving.
        let box2 = doc.createElementNS(XUL_NS, "box");
        box2.setAttribute("id", `${this.kNotificationID}-notification-anchor`);
        box2.classList.add("notification-anchor-icon");
        let img = doc.createElementNS(XUL_NS, "image");
        img.setAttribute("role", "button");
        img.classList.add(`${this.kNotificationID}-icon`);
        img.style.listStyleImage = `url(${this.getURL("assets/alert.svg")})`;
        box2.appendChild(img);
        box.appendChild(box2);
        // TODO: Add a tooltip to the image once content is provided by UX.

        // Now, the popupnotificationcontent:
        let parentElt = doc.defaultView.PopupNotifications.panel.parentNode;
        let pn = doc.createElementNS(XUL_NS, "popupnotification");
        let pnContent = doc.createElementNS(XUL_NS, "popupnotificationcontent");
        let panelUI = new PanelUI(doc);
        pnContent.appendChild(panelUI.box);
        pn.appendChild(pnContent);
        pn.setAttribute("id", `${this.kNotificationID}-notification`);
        pn.setAttribute("hidden", "true");
        parentElt.appendChild(pn);
        win.FirefoxMonitorPanelUI = panelUI;

        // Start listening across all tabs!
        win.gBrowser.addTabsProgressListener(this);
      },
      (win) => {
        // If the window is being destroyed and gBrowser no longer exists,
        // don't bother doing anything.
        if (!win.gBrowser) {
          return;
        }

        let DOMWindowUtils = win.windowUtils;
        if (!DOMWindowUtils) {
          // win.windowUtils was added in 63, fallback if it's not available.
          DOMWindowUtils = win.QueryInterface(Ci.nsIInterfaceRequestor)
                              .getInterface(Ci.nsIDOMWindowUtils);
        }
        DOMWindowUtils.removeSheetUsingURIString(this.getURL("privileged/FirefoxMonitor.css"),
                                                 DOMWindowUtils.AUTHOR_SHEET);

        win.FirefoxMonitorUtils.notifications.forEach(n => {
          n.remove();
        });
        delete win.FirefoxMonitorUtils;

        let doc = win.document;
        doc.getElementById(`${this.kNotificationID}-notification-anchor`).remove();
        doc.getElementById(`${this.kNotificationID}-notification`).remove();
        delete win.FirefoxMonitorPanelUI;

        win.gBrowser.removeTabsProgressListener(this);
      },
    );

    this.observerAdded = true;
  },

  stopObserving() {
    if (!this.observerAdded) {
      return;
    }

    EveryWindow.unregisterCallback(this.kNotificationID);

    if (this._loadBreachesTimer) {
      clearTimeout(this._loadBreachesTimer);
    }

    this.observerAdded = false;
  },

  warnIfNeeded(browser, host) {
    if (!this.enabled || this.warnedHostsSet.has(host) || !this.domainMap.has(host)) {
      return;
    }

    this.warnedHostsSet.add(host);
    Preferences.set(this.kWarnedHostsPref, JSON.stringify([...this.warnedHostsSet]));

    let doc = browser.ownerDocument;
    let win = doc.defaultView;
    let panelUI = doc.defaultView.FirefoxMonitorPanelUI;

    let animatedOnce = false;
    let populatePanel = (event) => {
      switch (event) {
        case "showing":
          panelUI.refresh(this.domainMap.get(host));
          if (animatedOnce) {
            // If we've already animated once for this site, don't animate again.
            doc.getElementById("notification-popup")
               .setAttribute("fxmonitoranimationdone", "true");
            doc.getElementById(`${this.kNotificationID}-notification-anchor`)
               .setAttribute("fxmonitoranimationdone", "true");
            break;
          }
          // Make sure we animate if we're coming from another tab that has
          // this attribute set.
          doc.getElementById("notification-popup")
             .removeAttribute("fxmonitoranimationdone");
          doc.getElementById(`${this.kNotificationID}-notification-anchor`)
             .removeAttribute("fxmonitoranimationdone");
          break;
        case "shown":
          animatedOnce = true;
          break;
        case "removed":
          win.FirefoxMonitorUtils.notifications.delete(
            win.PopupNotifications.getNotification(this.kNotificationID, browser));
          Services.telemetry.scalarAdd("fxmonitor.doorhanger_removed", 1);
          break;
      }
    };

    let n = win.PopupNotifications.show(
      browser, this.kNotificationID, "",
      `${this.kNotificationID}-notification-anchor`,
      panelUI.primaryAction, panelUI.secondaryActions, {
        persistent: true,
        hideClose: true,
        eventCallback: populatePanel,
        popupIconURL: this.getURL("assets/alert.svg")
      }
    );

    Services.telemetry.scalarAdd("fxmonitor.doorhanger_shown", 1);

    win.FirefoxMonitorUtils.notifications.add(n);
  },
};
