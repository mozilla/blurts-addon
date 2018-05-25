const studySetup = {
  activeExperimentName: browser.runtime.id,
  studyType: "shield",
  expire: {
    days: 7,
  },

  endings: {
    "user-disable": {
      baseUrls: ["https://monitor.firefox.com/"],
    },
    "ineligible": {
      baseUrls: ["https://monitor.firefox.com/"],
    },
    "expired": {
      baseUrls: ["https://monitor.firefox.com/"],
    },
    "dataPermissionsRevoked": {
      baseUrls: ["https://monitor.firefox.com/"],
    },
  },

  weightedVariations: [
    {
      name: "variation 1",
      weight: 1,
    },
    {
      name: "variation 2",
      weight: 1,
    },
  ],

  telemetry: {
    send: true,
    removeTestingFlag: false,
  },
}

async function run() {
  console.log("run, studySetup: ", studySetup);
  console.log("run, browser.study: ", browser.study);
  const study = await browser.study.setup(studySetup);
  console.log("background.js, study: ", study);
}

run();
