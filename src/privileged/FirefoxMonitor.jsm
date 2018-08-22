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
          if (!this._delayedInited) {
            await this.delayedInit();
          }
          this.startObserving();
        } else {
          this.stopObserving();
        }
      }
    );

    if (!this.enabled) {
      return;
    }

    await this.delayedInit();
    this.startObserving();
  },

  async delayedInit() {
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
        Preferences.set(this.kWarnedHostsPref, "");
      }
    }

    await this.loadStrings();
    await this.loadBreaches();

    AddonManager.addAddonListener(this);

    this._delayedInited = true;
  },

  onUninstalled(aAddon) {
    if (aAddon.id === this.extension.id) {
      this.stopObserving();
    }
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
  async loadBreaches() {
    // TODO: check first if the list of breaches was updated
    //       since we last checked, before downloading it.
    //       (pending repsonse from Troy about how to do this)
    let response = await fetch("https://haveibeenpwned.com/api/v2/breaches");
    let sites = await response.json();

    this.domainMap.clear();
    sites.forEach(site => {
      this.domainMap.set(site.Domain, {
        Name: site.Name,
        PwnCount: site.PwnCount.toLocaleString(),
        Year: (new Date(site.BreachDate)).getFullYear(),
      });
    });

    // Refresh every hour.
    let one_hour = 60 * 60 * 1000;
    this._loadBreachesTimer = setTimeout(() => this.loadBreaches(), one_hour);
  },

  // nsIWebProgressListener implementation.
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
      // If we can't get the host for the URL, it's not one we
      // care about for breach alerts anyway.
      return;
    }

    this.warnIfNeeded(aBrowser, host);
  },

  startObserving() {
    if (this.observerAdded) {
      return;
    }

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
    if (!this.enabled || this.warnedHostsSet.has(host)) {
      return;
    }

    if (!this.domainMap.has(host)) {
      return;
    }

    this.warnedHostsSet.add(host);
    Preferences.set(this.kWarnedHostsPref, JSON.stringify([...this.warnedHostsSet]));

    let doc = browser.ownerDocument;
    let win = doc.defaultView;
    let panelUI = doc.defaultView.FirefoxMonitorPanelUI;

    let populatePanel = (event) => {
      switch (event) {
        case "showing":
          panelUI.refresh(this.domainMap.get(host));
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
      `${this.kNotificationID}-notification-anchor`, panelUI.primaryAction, panelUI.secondaryActions,
      {persistent: true, hideClose: true, eventCallback: populatePanel});

    Services.telemetry.scalarAdd("fxmonitor.doorhanger_shown", 1);

    win.FirefoxMonitorUtils.notifications.add(n);
  },
};
