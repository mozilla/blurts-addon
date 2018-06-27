let gEventListener = async function(event) {
  if (event.endsWith("dismiss_permanent")) {
    browser.storage.local.set({
      disabled: true,
    });
  }
  browser.study.sendTelemetry({event});
}

async function init() {
  const result = await browser.storage.local.get("disabled");
  if (result.disabled) {
    return;
  }
  browser.study.onEndStudy.addListener((ending) => {

  });
  browser.study.onReady.addListener((studyInfo) => {
    browser.blurts.start(studyInfo.variation.name);
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
          "https://qsurvey.mozilla.com/s3/Shield-Study-Example-Survey/?reason=user-disable",
        ],
      },
      ineligible: {
        baseUrls: [
          "https://qsurvey.mozilla.com/s3/Shield-Study-Example-Survey/?reason=ineligible",
        ],
      },
      expired: {
        baseUrls: [
          "https://qsurvey.mozilla.com/s3/Shield-Study-Example-Survey/?reason=expired",
        ],
      },
    },
    expire: {
      days: 14,
    },
  });
}

init();
