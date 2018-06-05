let gTelemetryListener = async function(event) {
  console.log(event);
  //await browser.runtime.sendMessage({ shield: true, msg: "telemetry", data: {event} });
}

browser.blurts.start();
browser.blurts.onTelemetryEvent.addListener(gTelemetryListener);
