# Request for data collection review form

## See-also: Telemetry.md

1) What questions will you answer with this data?

* How often does user encounter the feature?
* How does user respond to the feature?


2) Why does Mozilla need to answer these questions?  Are there benefits for users? Do we need this information to address product or business requirements?

* Provide information essential for advancing a business objective such as supporting OKRs.
* Determine whether a product or platform change has an effect on user or browser behavior.

3) What alternative methods did you consider to answer these questions? Why were they not sufficient?

* There are no alternatives other than the event telemetry to learn how user interacts with this UI.

4) Can current instrumentation answer these questions?

* No.

5) List all proposed measurements and indicate the category of data collection for each measurement, using the Firefox [data collection categories](https://wiki.mozilla.org/Firefox/Data_Collection) on the Mozilla wiki.

* Technical and interaction data

<table>
  <tr>
    <td>Measurement Description</td>
    <td>Data Collection Category</td>
    <td>Tracking Bug #</td>
  </tr>
  <tr>
    <td>Scalars to measure user engagement with the doorhanger UI</td>
    <td>Interaction data</td>
    <td>Bug 1485651</td>
  </tr>
</table>


6) How long will this data be collected?
* I want this data to be collected for 6 months initially (potentially renewable).

7) What populations will you measure?

* Which release channels?
  * Release 62 (after 9/25)

* Which countries?
  * N/A

* Which locales?
  * en_US

* Any other filters?
  * No.

8) If this data collection is default on, what is the opt-out mechanism for users?
* User can opt out under about:preferences#privacy.

9) Please provide a general description of how you will analyze this data.
* Follow our general practice to analyze event telemetry.

10) Where do you intend to share the results of your analysis?
* To Firefox team. Results will likely be shared on a mailing list and/or Bugzilla (bug 1485651)
