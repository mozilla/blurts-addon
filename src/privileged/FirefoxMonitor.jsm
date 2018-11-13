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
  // The value of this property is used as the URL to which the user
  // is directed when they click "Check Firefox Monitor".
  FirefoxMonitorURL: null,
  kFirefoxMonitorURLPref: "extensions.fxmonitor.FirefoxMonitorURL",
  kDefaultFirefoxMonitorURL: "https://monitor.firefox.com",

  // This is here for documentation, will be redefined to a pref getter
  // using XPCOMUtils.defineLazyPreferenceGetter in delayedInit().
  // The pref stores whether the user has seen a breach alert already.
  // The value is used in warnIfNeeded.
  firstAlertShown: null,
  kFirstAlertShownPref: "extensions.fxmonitor.firstAlertShown",

  kDebugPref: "extensions.fxmonitor.debug",
  get debug() {
    return Preferences.get(this.kDebugPref, false);
  },

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

    /* globals Preferences, fetch, btoa, XUL_NS */
    Services.scriptloader.loadSubScript(
      this.getURL("privileged/subscripts/Globals.jsm"));

    /* globals EveryWindow */
    Services.scriptloader.loadSubScript(
      this.getURL("privileged/subscripts/EveryWindow.jsm"));

    /* globals PanelUI */
    Services.scriptloader.loadSubScript(
      this.getURL("privileged/subscripts/PanelUI.jsm"));

    Services.telemetry.registerEvents("fxmonitor", {
      "interaction": {
        methods: ["interaction"],
        objects: [
          "doorhanger_shown",
          "doorhanger_removed",
          "check_btn",
          "dismiss_btn",
          "never_show_btn",
        ],
        record_on_release: true,
      },
    });

    Services.telemetry.setEventRecordingEnabled("fxmonitor", true);

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

    XPCOMUtils.defineLazyPreferenceGetter(this, "FirefoxMonitorURL",
      this.kFirefoxMonitorURLPref, this.kDefaultFirefoxMonitorURL);

    XPCOMUtils.defineLazyPreferenceGetter(this, "firstAlertShown",
      this.kFirstAlertShownPref, false);

    await this.loadStrings();
    await this.loadBreaches();

    this._delayedInited = true;
  },

  async loadStrings() {
    // Services.strings.createBundle has a whitelist of URL schemes that it
    // accepts. moz-extension: is not one of them, so we work around that
    // by reading the file manually and creating a data: URL (allowed).
    // TODO:
    // - Optimize?
    let response;
    try {
      let locale = Services.locale.defaultLocale;
      response = await fetch(this.getURL(`locales/${locale}/strings.properties`));
    } catch (e) {
      Cu.reportError("Firefox Monitor: no strings available for default locale. Falling back to en-US.");
      response = await fetch(this.getURL(`locales/en-US/strings.properties`));
    }
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

  kRemoteSettingsKey: "fxmonitor-breaches",
  async loadBreaches() {
    const { RemoteSettings } = ChromeUtils.import("resource://services-settings/remote-settings.js", {});

    let populateSites = (data) => {
      this.domainMap.clear();
      data.forEach(site => {
        if (!site.Domain || !site.Name || !site.PwnCount || !site.BreachDate || !site.AddedDate) {
          Cu.reportError(`Firefox Monitor: malformed breach entry.\nSite:\n${JSON.stringify(site)}`);
          return;
        }

        try {
          this.domainMap.set(site.Domain, {
            Name: site.Name,
            PwnCount: site.PwnCount,
            Year: (new Date(site.BreachDate)).getFullYear(),
            AddedDate: site.AddedDate.split("T")[0],
          });
        } catch (e) {
          Cu.reportError(`Firefox Monitor: malformed breach entry.\nSite:\n${JSON.stringify(site)}\nError:\n${e}`);
        }
      });
    }

    RemoteSettings(this.kRemoteSettingsKey).on("sync", (event) => {
      const { data: { current } } = event;
      populateSites(current);
    });

    const data = await RemoteSettings(this.kRemoteSettingsKey).get();
    if (data && data.length) {
      populateSites(data);
    } else if (this.debug) {
      // Force a sync if we're debugging. This will trigger the on("sync") callback.
      RemoteSettings(this.kRemoteSettingsKey).maybeSync(Infinity, Date.now());
    }
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
        img.style.listStyleImage = `url(${this.getURL("assets/monitor32.svg")})`;
        box2.appendChild(img);
        box.appendChild(box2);
        img.setAttribute("tooltiptext",
          this.getFormattedString("fxmonitor.anchorIcon.tooltiptext",
                                  [this.getString("fxmonitor.brandName")]));

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

    this.observerAdded = false;
  },

  warnIfNeeded(browser, host) {
    if (!this.enabled || this.warnedHostsSet.has(host) || !this.domainMap.has(host)) {
      return;
    }

    let site = this.domainMap.get(host);

    // We only alert for breaches that were found up to 2 months ago,
    // except for the very first alert we show the user - in which case,
    // we include breaches found in the last three years.
    let breachDateThreshold = new Date();
    if (this.firstAlertShown) {
      breachDateThreshold.setMonth(breachDateThreshold.getMonth() - 2);
    } else {
      breachDateThreshold.setFullYear(breachDateThreshold.getFullYear() - 1);
    }

    if (new Date(site.AddedDate).getTime() < breachDateThreshold.getTime()) {
      return;
    } else if (!this.firstAlertShown) {
      Preferences.set(this.kFirstAlertShownPref, true);
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
          panelUI.refresh(site);
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
          Services.telemetry.recordEvent("fxmonitor", "interaction", "doorhanger_removed");
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
        popupIconURL: this.getURL("assets/monitor32.svg")
      }
    );

    Services.telemetry.recordEvent("fxmonitor", "interaction", "doorhanger_shown");

    win.FirefoxMonitorUtils.notifications.add(n);
  },
};
