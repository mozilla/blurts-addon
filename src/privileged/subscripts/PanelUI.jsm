/* globals XUL_NS */

function PanelUI(doc) {
  this.site = null;
  this.doc = doc;

  const box = doc.createElementNS(XUL_NS, "vbox");

  let elt;

  elt = doc.createElementNS(XUL_NS, "description");
  elt.appendChild(doc.createTextNode(this.getString("fxmonitor.popupHeader")));
  elt.classList.add("headerText");
  box.appendChild(elt);


  elt = doc.createElementNS(XUL_NS, "description");
  elt.classList.add("popupText");
  box.appendChild(elt);

  this.box = box;
}

PanelUI.prototype = {
  get FirefoxMonitorUtils() {
    // Set on every window by FirefoxMonitor.jsm for PanelUI to use.
    // Because sharing is caring.
    return this.doc.defaultView.FirefoxMonitorUtils;
  },

  getString(aKey) {
    return this.FirefoxMonitorUtils.getString(aKey);
  },

  getFormattedString(aKey, args) {
    return this.FirefoxMonitorUtils.getFormattedString(aKey, args);
  },

  get brandString() {
    delete this.brandString;
    return this.brandString = this.getString("fxmonitor.FirefoxMonitor");
  },

  get primaryAction() {
    delete this.primaryAction;
    return this.primaryAction = {
      label: this.getFormattedString("fxmonitor.checkButton.label", [this.brandString]),
      accessKey: this.getString("fxmonitor.checkButton.accessKey"),
      callback: () => {
        this.doc.defaultView.openTrustedLinkIn(
          `https://monitor.firefox.com/?breach=${this.site.Name}`, "tab", { });
      },
    };
  },

  get secondaryActions() {
    delete this.secondaryActions;
    return this.secondaryActions = [
      {
        label: this.getString("fxmonitor.dismissButton.label"),
        accessKey: this.getString("fxmonitor.dismissButton.accessKey"),
        callback: () => { },
      }, {
        label: this.getFormattedString("fxmonitor.neverShowButton.label", [this.brandString]),
        accessKey: this.getString("fxmonitor.neverShowButton.accessKey"),
        callback: () => {
          this.FirefoxMonitorUtils.disable();
        },
      },
    ];
  },

  refresh(site) {
    this.site = site;

    let elt = this.box.querySelector(".popupText");

    while (elt.firstChild) {
      elt.firstChild.remove();
    }

    elt.appendChild(this.doc.createTextNode(this.getFormattedString(
      "fxmonitor.popupText", [site.PwnCount, site.Name, site.Year, this.brandString])));
  },
};
