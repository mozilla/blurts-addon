# blurts-addon
Code for the client-side add-on for Firefox Monitor. Communicates with the
[blurts-server](https://github.com/mozilla/blurts-server) service.

## Requirements
* Firefox 60+

## Install
1. Go to `about:debugging`
2. Click "Load Temporary Add-on"
3. Navigate to and select `manifest.json` or `blurts.xpi` if built

## Running
Once you've installed the add-on, visit a site that is in [the list of breached
sites on HIBP](https://haveibeenpwned.com/PwnedWebsites).

## Building
Use
[`web-ext`](https://developer.mozilla.org/Add-ons/WebExtensions/Getting_started_with_web-ext)
to build the add-on:
```
web-ext build
```
