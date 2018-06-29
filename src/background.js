let gEventListener = async function(event) {
  if (event.startsWith("warned_site_")) {
    let warnedSites = (await browser.storage.local.get("warnedSites")).warnedSites;
    if (!warnedSites) warnedSites = [];
    warnedSites.push(event.substring("warned_site_".length));
    await browser.storage.local.set({
      warnedSites,
    });
    return;
  }

  browser.study.sendTelemetry({event});

  if (event.endsWith("shown")) {
    await browser.storage.local.set({
      shown: true,
    });
    return;
  }

  if (event.endsWith("dismiss_permanent")) {
    await browser.storage.local.set({
      disabled: true,
    });
    return;
  }

  if (event === "survey_dismissed" || event === "thank_you_dismissed") {
    if ((await browser.storage.local.get("disabled")).disabled) {
      await browser.study.endStudy("user-disable");
    }
  }
};

async function init() {
  browser.study.onEndStudy.addListener(async (ending) => {
    let shown = (await browser.storage.local.get("shown")).shown;
    if (shown) {
      await browser.tabs.create({
        url: ending.urls[0],
      });
    }
    browser.management.uninstallSelf();
  });
  browser.study.onReady.addListener(async (studyInfo) => {
    if ((await browser.storage.local.get("disabled")).disabled) {
      await browser.study.endStudy("user-disable");
      return;
    }
    let warnedSites = (await browser.storage.local.get("warnedSites")).warnedSites;
    warnedSites = warnedSites ? warnedSites.join() : "";
    browser.blurts.start(studyInfo.variation.name, warnedSites, studyInfo.firstRunTimestamp);
    browser.blurts.onEvent.addListener(gEventListener);
  });
  await browser.study.setup({
    allowEnroll: true,
    activeExperimentName: browser.runtime.id,
    studyType: "shield",
    telemetry: {
      send: true,
      removeTestingFlag: false,
    },
    weightedVariations: [
      {
        name: "0",
        weight: 1,
      },
      {
        name: "1",
        weight: 1,
      },
      {
        name: "2",
        weight: 1,
      },
      {
        name: "3",
        weight: 1,
      },
      {
        name: "4",
        weight: 1,
      },
    ],
    endings: {
      "user-disable": {
        baseUrls: [
          "https://qsurvey.mozilla.com/s3/Firefox-Monitor-Shield-Study-Survey/?reason=user-disable",
        ],
      },
      expired: {
        baseUrls: [
          "https://qsurvey.mozilla.com/s3/Firefox-Monitor-Shield-Study-Survey/?reason=expired",
        ],
      },
    },
    expire: {
      days: 14,
    },
  });
}

init();
