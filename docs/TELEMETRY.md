# Telemetry sent by this add-on

<!-- START doctoc generated TOC please keep comment here to allow auto update -->

<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->

**Contents**

* [Usual Firefox Telemetry is mostly unaffected](#usual-firefox-telemetry-is-mostly-unaffected)
* [Study-specific endings](#study-specific-endings)
* [`shield-study` pings (common to all shield-studies)](#shield-study-pings-common-to-all-shield-studies)
* [`shield-study-addon` pings, specific to THIS study.](#shield-study-addon-pings-specific-to-this-study)
* [Example sequence for a 'voted => not sure' interaction](#example-sequence-for-a-voted--not-sure-interaction)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->


* No change: `main` and other pings are UNAFFECTED by this add-on, except that [shield-studies-addon-utils](https://github.com/mozilla/shield-studies-addon-utils) adds the add-on id as an active experiment in the telemetry environment.
## Usual Firefox Telemetry is mostly unaffected
* Respects telemetry preferences. If user has disabled telemetry, no telemetry will be sent.

## Study-specific endings

(TODO)

## `shield-study` pings (common to all shield-studies)

[shield-studies-addon-utils](https://github.com/mozilla/shield-studies-addon-utils) sends the usual packets.

## `shield-study-addon` pings, specific to THIS study.

Events instrumented in this study:

* UI

  * When popups are shown:
    * fxmonitor_alert_shown
    * fxmonitor_survey_shown
    * fxmonitor_survey_gratitude_shown

* Interactions
  * When popup notification primary action is triggered: fxmonitor_alert_submit
  * When the "Dismiss" secondary action is triggered: fxmonitor_alert_dismiss
  * when the "Never show breach alerts" secondary action is triggered: fxmonitor_alert_dismiss_permanent
  * When the survey popup is submitted, there's one sent for every selected checkbox: fxmonitor_survey_checkbox_<checkboxid>
  * When the survey popup is dismissed: fxmonitor_survey_dismissed
  * When the thank you popup is dismissed: fxmonitor_survey_gratitude_dismissed

All interactions with the UI create sequences of Telemetry Pings.

## Example sequence for a 'voted => not sure' interaction

(TODO: Update the template below)

These are the `payload` fields from all pings in the `shield-study` and `shield-study-addon` buckets.

```
// common fields

branch        up-to-expectations-1        // should describe Question text
study_name    57-perception-shield-study
addon_version 1.0.0
version       3

2017-10-09T14:16:18.042Z shield-study
{
  "study_state": "enter"
}

2017-10-09T14:16:18.055Z shield-study
{
  "study_state": "installed"
}

2017-10-09T14:16:18.066Z shield-study-addon
{
  "attributes": {
    "event": "prompted",
    "promptType": "notificationBox-strings-1"
  }
}

2017-10-09T16:29:44.109Z shield-study-addon
{
  "attributes": {
    "promptType": "notificationBox-strings-1",
    "event": "answered",
    "yesFirst": "1",
    "score": "0",
    "label": "not sure",
    "branch": "up-to-expectations-1",
    "message": "Is Firefox performing up to your expectations?"
  }
}

2017-10-09T16:29:44.188Z shield-study
{
  "study_state": "ended-neutral",
  "study_state_fullname": "voted"
}

2017-10-09T16:29:44.191Z shield-study
{
  "study_state": "exit"
}
```
