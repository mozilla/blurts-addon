const studySetup = {
  activeExperimentName: browser.runtime.id,
  studyType: "shield",
  allowEnroll: true,

  telemetry: {
    send: true,
    removeTestingFlag: false,
  },

  endings: {
    "user-disable": {
      baseUrls: [""],
    },
    ineligible: {
      baseUrls: [""],
    },
    expired: {
      baseUrls: [""],
    },
    dataPermissionsRevoked: {
      baseUrls: [""],
      category: "ended-neutral",
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
    {
      name: "variation 3",
      weight: 1,
    },
    {
      name: "variation 4",
      weight: 1,
    },
  ],

  expire: {
    days: 7,
  },
}

async function run() {
  const study = await browser.study.setup(studySetup);
  browser.blurts.start(study);
}

run();
