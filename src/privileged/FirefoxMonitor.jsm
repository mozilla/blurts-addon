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

    /* globals Preferences, fetch, btoa, gNotificationID, XUL_NS */
    Services.scriptloader.loadSubScript(
      this.getURL("privileged/subscripts/Globals.jsm"));

    /* globals EveryWindow */
    Services.scriptloader.loadSubScript(
      this.getURL("privileged/subscripts/EveryWindow.jsm"));

    /* globals PanelUI */
    Services.scriptloader.loadSubScript(
      this.getURL("privileged/subscripts/PanelUI.jsm"));

    XPCOMUtils.defineLazyPreferenceGetter(
      this, "enabled", this.kEnabledPref, false,
      (pref, oldVal, newVal) => {
        if (newVal) {
          this.startObserving();
        } else {
          this.stopObserving();
        }
      }
    );

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

    if (this.enabled) {
      this.startObserving();
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

  _lastBreachRefresh: null,
  async loadBreaches() {
    let one_hour = 60 * 60 * 1000;
    let now = Date.now();

    if (this._lastBreachRefresh &&
        (now - this._lastBreachRefresh) < one_hour) {
      return;
    }

    // TODO: investigate if/how this impacts startup perf.
    // TODO: check first if the list of breaches was updated
    //       since we last checked, before downloading it.
    //       (pending repsonse from Troy about how to do this)
    let response = await fetch("https://haveibeenpwned.com/api/v2/breaches");
    let sites = await response.json();
    sites.forEach(site => {
      this.domainMap.set(site.Domain, {
        Name: site.Name,
        PwnCount: site.PwnCount.toLocaleString(),
        Year: (new Date(site.BreachDate)).getFullYear(),
      });
    });

    this._lastBreachRefresh = now;
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
    this.loadBreaches();
  },

  startObserving() {
    if (this.observerAdded) {
      return;
    }

    EveryWindow.registerCallback(
      this.kNotificationID,
      (win) => {
        if (win.FirefoxMonitorUtils) {
          // We've already set this window up once, just add the listener
          // and we're good to go.
          win.gBrowser.addTabsProgressListener(this);
          return;
        }

        // Inject our stylesheet.
        let DOMWindowUtils = win.windowUtils;
        if (!DOMWindowUtils) {
          // win.windowUtils was added in 63, fallback if it's not available.
          DOMWindowUtils = win.QueryInterface(Ci.nsIInterfaceRequestor)
                              .getInterface(Ci.nsIDOMWindowUtils);
        }
        DOMWindowUtils.loadSheetUsingURIString(this.getURL("privileged/FirefoxMonitor.css"),
                                               DOMWindowUtils.AUTHOR_SHEET);

        win.FirefoxMonitorUtils = {
          getURL: (aPath) => {
            return this.getURL(aPath);
          },
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
        let img = doc.createElementNS(XUL_NS, "image");
        img.setAttribute("id", `${this.kNotificationID}-notification-icon`);
        img.classList.add("notification-anchor-icon", `${this.kNotificationID}-icon`);
        img.setAttribute("role", "button");
        box.appendChild(img);
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
    if (!this.enabled || this.warnedHostsSet.has(host)) {
      return;
    }

    if (!this.domainMap.has(host)) {
      return;
    }

    this.warnedHostsSet.add(host);
    Preferences.set(this.kWarnedHostsPref, JSON.stringify([...this.warnedHostsSet]));

    let doc = browser.ownerDocument;
    let panelUI = doc.defaultView.FirefoxMonitorPanelUI;

    let populatePanel = (event) => {
      if (event !== "showing") {
        return;
      }
      panelUI.refresh(this.domainMap.get(host));
    };

    doc.defaultView.PopupNotifications.show(
      browser, this.kNotificationID, "",
      `${this.kNotificationID}-notification-icon`, panelUI.primaryAction, panelUI.secondaryActions,
      {persistent: true, hideClose: true, eventCallback: populatePanel});
  },
};
