ChromeUtils.defineModuleGetter(this, "Services",
                               "resource://gre/modules/Services.jsm");
ChromeUtils.defineModuleGetter(this, "AddonManager",
                               "resource://gre/modules/AddonManager.jsm");
Cu.importGlobalProperties(["fetch"]);

let gExtension;

function sha1(str) {
  let converter =
    Cc["@mozilla.org/intl/scriptableunicodeconverter"]
      .createInstance(Ci.nsIScriptableUnicodeConverter);
  converter.charset = "UTF-8";
  let result = {};
  let data = converter.convertToByteArray(str, result);
  let ch = Cc["@mozilla.org/security/hash;1"].createInstance(Ci.nsICryptoHash);
  ch.init(ch.SHA1);
  ch.update(data, data.length);
  let hash = ch.finish(false);
  function toHexString(charCode) {
    return ("0" + charCode.toString(16)).slice(-2);
  }
  return Array.from(hash, (c, i) => toHexString(hash.charCodeAt(i))).join("");
}

function isEmailValid(val) {
  // https://stackoverflow.com/a/46181
  const re = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
  return re.test(String(val).toLowerCase());
}

const handleInputs = function(event, textbox, doc, browser, checkboxChecked) {
  function showInvalidMessage() {
    textbox.style.borderStyle = "solid";
    textbox.style.borderColor = "#d70022cc";
    textbox.style.borderWidth = "1px";
    textbox.placeholder = "Please enter a valid email.";
    textbox.style.boxShadow = "1px 0px 4px #d7002233";
    textbox.style.transition = "all 0.2s ease";
  }

  function clearInvalidMessage() {
    textbox.style.borderStyle = "solid";
    textbox.style.borderColor = "rgba(12, 12, 13, 0.30)";
    textbox.style.borderWidth = "1px";
    textbox.placeholder = "Please enter a valid email.";
    textbox.style.boxShadow = "1px 0px 4px rgba(12, 12, 13, 0.05)";
    textbox.style.transition = "all 0.2s ease";
  }

  function submit(emailString) {
    doc.defaultView.PopupNotifications.getNotification(gNotificationID, browser).remove();
    if (emailString) {
      let stringStream = Cc["@mozilla.org/io/string-input-stream;1"].
      createInstance(Ci.nsIStringInputStream);
      let hashedEmail = sha1(emailString);
      stringStream.data = `emailHash=${hashedEmail}&signup=${checkboxChecked || ""}`;
      let postData = Cc["@mozilla.org/network/mime-input-stream;1"].
        createInstance(Ci.nsIMIMEInputStream);
      postData.addHeader("Content-Type", "application/x-www-form-urlencoded");
      postData.setData(stringStream);
      doc.defaultView.openTrustedLinkIn("https://monitor.firefox.com/scan", "tab", { postData });
    } else {
      doc.defaultView.openTrustedLinkIn("https://monitor.firefox.com/", "tab", {});
    }
    FirefoxMonitor.notifyEventListeners(`${gNotificationID}_submit${checkboxChecked ? "_checked" : ""}`);
  }

  clearInvalidMessage(textbox);
  // Make sure we don't show the "x" button, it's problematic because it fires
  // a command event that we can't really distinguish from an "enter" keypress.
  textbox._searchIcons.selectedIndex = 0;
  const button = doc.getAnonymousElementByAttribute(
    doc.getElementById(`${gNotificationID}-notification`), "anonid", "button");
  const evtWasCommand = event.type === "command";
  const email = textbox.value;
  if (email && isEmailValid(email)) {
    if (evtWasCommand) {
      submit(email);
      return;
    }
    button.removeAttribute("disabled");
    return;
  }
  if (evtWasCommand) {
    showInvalidMessage(textbox);
  }
  button.setAttribute("disabled", "true");
};


this.FirefoxMonitor = {
  init(aExtension, aVariation, warnedSites, firstRunTimestamp) {
    gExtension = aExtension;

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

  EveryWindow.registerCallback(
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
    EveryWindow.unregisterCallback("breach-alerts");
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
      _textbox: null,
      get box() {
        let box = doc.createElementNS(XUL_NS, "vbox");
        let elt = doc.createElementNS(XUL_NS, "description");
        elt.setAttribute("anonid", "maindesc");
        elt.appendChild(doc.createTextNode("Have an account? It may be at risk."));
        elt.setAttribute("style", "font-size: 150%; white-space: pre; margin-bottom: 1rem;");
        box.appendChild(elt);
        elt = doc.createElementNS(XUL_NS, "description");
        let strings = [
          {str: "This website was reported to "},
          {str: "Firefox Monitor", link: `https://monitor.firefox.com/?breach=${site.Name}`},
          {str: ", a service that collects information about data breaches and other ways hackers can steal your information."},
        ];
        elt.appendChild(makeSpanWithLinks(strings, doc));
        elt.appendChild(doc.createTextNode("This website was reported to Firefox Monitor, a service that collects information about data breaches and other ways hackers can steal your information."));
        elt.setAttribute("style", "white-space: pre-wrap; margin-bottom: 1rem; padding-bottom: 1rem; border-bottom: 1px solid rgba(0,0,0,0.10);");
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
        strings = [
          {str: "Enter your email to find out if your account was included in a data breach."},
          {str: "\n(Note: Your email will not be stored.)"},
        ];
        elt.appendChild(makeSpanWithLinks(strings, doc));
        box.appendChild(elt);
        elt = doc.createElementNS(XUL_NS, "textbox");
        elt.setAttribute("type", "search");
        elt.setAttribute("searchbutton", "true");
        elt.setAttribute("style", "-moz-appearance: none; height: 2.75rem; line-height: 2.5rem; white-space:nowrap; overflow:hidden; padding: 0.5rem; box-sizing: border-box; background: #FFFFFF; border: 1px solid rgba(12,12,13,0.30); border-radius: 2px;");
        elt.setAttribute("placeholder", "Enter Email");
        elt.setAttribute("id", "emailToHash");
        elt.addEventListener("input", function listener(event) {
          handleInputs(event, elt, doc, browser);
        });
        elt.addEventListener("command", function listener(event) {
          handleInputs(event, elt, doc, browser);
        });
        this._textbox = elt;
        box.appendChild(elt);
        return box;
      },
    };
    retval.primaryAction = {
      label: "Search Firefox Monitor",
      accessKey: "f",
      callback: function() {
        FirefoxMonitor.notifyEventListeners(`${gNotificationID}_submit`);
        let stringStream = Cc["@mozilla.org/io/string-input-stream;1"].
          createInstance(Ci.nsIStringInputStream);
        stringStream.data = `emailHash=${sha1(this._textbox.value)}`;

        let postData = Cc["@mozilla.org/network/mime-input-stream;1"].
          createInstance(Ci.nsIMIMEInputStream);
        postData.addHeader("Content-Type", "application/x-www-form-urlencoded");
        postData.setData(stringStream);
        doc.defaultView.openTrustedLinkIn("https://monitor.firefox.com/scan", "tab", { postData });
      }.bind(retval),
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

let EveryWindow = {
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
      win.delayedStartupPromise.then(() => { aFunction(win); });
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

const EXPORTED_SYMBOLS = ["FirefoxMonitor"];
