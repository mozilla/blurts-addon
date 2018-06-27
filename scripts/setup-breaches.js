/* eslint-env node */

const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");

async function download(url, relativeDestPath) {
  const contents = await (await fetch(url)).text();
  return new Promise((resolve, reject) => {
    fs.writeFile(path.join(path.dirname(__dirname), relativeDestPath), contents, (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(contents);
    });
  });
}

async function run() {
  const breachFileText = await download(
    "https://haveibeenpwned.com/api/v2/breaches",
    path.join("src", "breaches.json"));
  const logoFilenames = JSON.parse(breachFileText).map(breach => {
    return `${breach.Name}.${breach.LogoType}`;
  });
  for (const logo of logoFilenames) {
    const destPath = path.join("src", "PwnedLogos", logo);
    await download(`https://haveibeenpwned.com/Content/Images/PwnedLogos/${logo}`, destPath);
  }
}

run();
