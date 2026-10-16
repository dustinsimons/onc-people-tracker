# ONC People Tracker

A free, private "who's out riding right now" page for the team.

GPS units email their live-tracking link to the team Gmail. A Google Apps Script collects
the links into a Google Sheet, posts a heads-up to Slack, and serves a live list that is
embedded on a password-protected Wix page.

- **[PLAN.md](PLAN.md)**: architecture, step-by-step setup, limits, and things to verify
- **[apps-script/Code.gs](apps-script/Code.gs)**: the script (paste into the Sheet's Apps Script editor)
- **[apps-script/Page.html](apps-script/Page.html)**: the list page served by the web app
