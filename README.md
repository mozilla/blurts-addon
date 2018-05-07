# blurts-addon
Code for the client-side add-on for Firefox Monitor. Communicates with the
[blurts-server](https://github.com/mozilla/blurts-server) service.

## Requirements
* Firefox 60+ with `extensions.legacy.enabled` set to `true`
* (To build) `node` v6.x (LTS) and [`jpm`](https://www.npmjs.com/package/jpm)

## Install
1. Go to `about:debugging`
2. Click "Load Temporary Add-on"
3. Navigate to and select `install.rdf`

## Running
Once you've installed the add-on, visit a site that is in [the list of breached
sites on HIBP](https://haveibeenpwned.com/PwnedWebsites).

## Building
1. `cd src/`
2. `jpm xpi`
