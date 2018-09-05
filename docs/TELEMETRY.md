# Telemetry sent by this add-on

* One events category `fxmonitor` is registered, with one event type: `interaction`. The possible event objects are:
  * `doorhanger_shown`: recorded when a PopupNotification is created for a breached site.
  * `doorhanger_removed`: recorded when the notification is removed for any reason for a breached site - user interaction, location change, etc.
  * `check_btn_clicked`: recorded when the "Check Firefox Monitor" button is engaged.
  * `dismiss_btn_clicked`: recorded when the "Dismiss" button is engaged.
  * `never_show_btn_clicked`: recorded when the "Never show Firefox Monitor alerts" button is engaged.
