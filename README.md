# blurts-addon
Code for the client-side add-on for Firefox Monitor. Communicates with the
[blurts-server](https://github.com/mozilla/blurts-server) service.

## Requirements
* Firefox 62 (use an unbranded build for testing - see https://wiki.mozilla.org/Add-ons/Extension_Signing#Unbranded_Builds)

## Setup
1. Clone the repo
2. $npm install

## Running
1. $export FIREFOX_BINARY=/path/to/unbranded/firefox/binary
3. $npm start

## Building
$npm run build
