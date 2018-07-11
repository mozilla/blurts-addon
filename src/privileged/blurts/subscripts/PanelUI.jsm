class PanelUI {
  constructor(doc) {
    this.site = null;
    this.doc = doc;

    const box = doc.createElementNS(XUL_NS, "vbox");
    box.className = "container";

    let elt, elt2, elt3;

    elt = doc.createElementNS(XUL_NS, "description");
    elt.appendChild(doc.createTextNode(this.getString("monitor.popupHeader")));
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
        elt3.appendChild(doc.createTextNode(this.getString("monitor.breachDateHeader")));
        elt2.appendChild(elt3);

        elt3 = doc.createElementNS(XUL_NS, "description");
        this.breachDateElt = elt3;
        elt2.appendChild(elt3);
      elt.appendChild(elt2);
    box.appendChild(elt);

    elt = doc.createElementNS(XUL_NS, "description");
    elt.className = "redText";
    elt.appendChild(doc.createTextNode(this.getString("monitor.pwnCountHeader")));
    box.appendChild(elt);

    elt = doc.createElementNS(XUL_NS, "description");
    this.pwnCountElt = elt;
    box.appendChild(elt);

    elt = doc.createElementNS(XUL_NS, "description");
    elt.className = "redText";
    elt.appendChild(doc.createTextNode(this.getString("monitor.dataClassesHeader")));
    box.appendChild(elt);

    elt = doc.createElementNS(XUL_NS, "description");
    elt.className = "bottomBorder";
    this.breachDataElt = elt;
    box.appendChild(elt);

    elt = doc.createElementNS(XUL_NS, "description");
    elt2 = doc.createElementNS(HTML_NS, "span");
      elt2.appendChild(doc.createTextNode(`${this.getString("monitor.siteReportedTo")} `));

      elt3 = doc.createElementNS(HTML_NS, "a");
        elt3.addEventListener("click", (event) => {
          event.preventDefault();
          doc.defaultView.openTrustedLinkIn(`https://monitor.firefox.com/?breach=${this.site.Name}`, "tab", {});
        });
        elt3.appendChild(doc.createTextNode(this.getString("monitor.FirefoxMonitor")));
        this.monitorLink = elt3;
      elt2.appendChild(elt3);

      elt2.appendChild(doc.createTextNode(this.getString("monitor.end")));
    elt.appendChild(elt2);
    elt.className = "specialStuff";
    box.appendChild(elt);

    this.box = box;
  }

  get FirefoxMonitorUtils() {
    return this.doc.defaultView.FirefoxMonitorUtils;
  }

  getString(aKey) {
    return this.FirefoxMonitorUtils.getString(aKey);
  }

  getFormattedString(aKey, args) {
    return this.FirefoxMonitorUtils.getFormattedString(aKey, args);
  }

  get primaryAction() {
    return {
      label: "Go to Firefox Monitor",
      accessKey: "f",
      callback: () => {
        this.doc.defaultView.openTrustedLinkIn(`https://monitor.firefox.com/?breach=${this.site.Name}`, "tab", { });
      },
    };
  }

  get secondaryActions() {
    return [
      {
        label: "Dismiss",
        accessKey: "d",
        callback: () => { },
      }, {
        label: "Never show breach alerts",
        accessKey: "n",
        callback: () => {
          this.FirefoxMonitorUtils.disableBlurts();
        },
      },
    ];
  }

  refresh(site) {
    this.site = site;

    const doc = this.doc;

    this.logoElt.style.backgroundImage = `url(${this.FirefoxMonitorUtils.getURL(`PwnedLogos/${site.logoSrc}`)}`;

    function clearChildren(elt) {
      while (elt.firstChild) {
        elt.firstChild.remove();
      }
    }

    for (const elt of [this.breachNameElt, this.breachDateElt, this.pwnCountElt, this.breachDataElt]) {
      clearChildren(elt);
    }

    this.breachNameElt.appendChild(doc.createTextNode(site.Name));

    this.breachDateElt.appendChild(doc.createTextNode(site.BreachDate));

    this.pwnCountElt.appendChild(doc.createTextNode(site.PwnCount.toLocaleString()));

    this.breachDataElt.appendChild(doc.createTextNode(site.DataClasses));

    this.monitorLink.setAttribute("href", `https://monitor.firefox.com/?breach=${site.Name}`);
  }
}
