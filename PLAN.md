# Team Live Ride Tracker: Plan (free tools only)

## Goal

When a rider starts a ride, their GPS unit emails (or texts) a live-tracking link.
Anyone on the team can open one private page and see every ride that is active right now,
and the team Slack gets a heads-up when someone heads out.

## Why not just email Wix directly?

The Wix **Light** plan has no way to receive and parse inbound email. Wix Velo can
expose an HTTP endpoint, but something still has to receive the email and call it.
So we put a small "glue" script on the team's **free Gmail account** and let Wix
show the result. Every piece below is free:

| Piece | Tool | Cost |
|---|---|---|
| Inbox for tracking emails | Existing free Gmail account | Free |
| Inbox for tracking texts (optional, US) | Google Voice number, set to forward texts to Gmail | Free |
| Parser and database | Google Apps Script attached to the team's existing roster Google Sheet | Free (consumer quotas) |
| Live list of rides | Apps Script web app (HTML page) | Free |
| Private team page | Wix page, password-protected, with an Embed element | Included in Light |
| Ride-start alerts | Slack Incoming Webhook to `#rides` | Free tier (uses 1 of 10 app slots) |

## Architecture

```
 GPS unit / phone app
   ├─ email ─────────────────────────────┐
   └─ SMS → Google Voice → forwards ─────┤
                                         ▼
                              Team Gmail inbox
                                         │  (Apps Script runs every minute)
                                         ▼
                 Apps Script: find tracking links, identify the rider
                    │                    │                       │
                    ▼                    ▼                       ▼
       Roster sheet: new        Slack webhook → #rides   Web app (HTML list)
       "Rides" tab (log)         "Alex started a ride"            │
                                                                  ▼
                                    Wix password-protected page (Embed/iframe)
```

## How the script decides what is "active"

Most devices (Garmin LiveTrack especially) send an email when a ride **starts**
but nothing when it **ends**. The link just stops working. So a ride is shown as active until
the first of these happens:

1. **Newer ride from the same rider.** A new link replaces the old one.
2. **"Ended" email.** If a provider sends one, it's detected by keyword (configurable).
3. **Timeout.** The default is 8 hours after the start email (configurable).
4. **Manual end.** Anyone with Sheet access types a time in the `EndedAt` column.

Rows older than 7 days are deleted automatically, since these are live-location links.

## Step-by-step setup (about 45 minutes)

### 1. Gmail

1. Decide which address riders put in their device settings. A plus-address keeps
   it tidy, for example `yourteam+rides@gmail.com`. It still lands in the same inbox.
2. Optional: create a Gmail filter `to:(yourteam+rides@gmail.com)` → apply label
   `ride-links`, skip inbox. Then set `SEARCH_QUERY` in the script to
   `label:ride-links newer_than:1d`.
3. Each rider adds that address as a LiveTrack/Beacon/etc. recipient in their device's
   companion app, with **auto-start / auto-share on ride start** turned on.

### 2. (Optional) Text messages via Google Voice

Only needed for devices that can text but not email.

1. Sign up for a free Google Voice number with the team Gmail account (US only).
2. Voice settings → Messages → **Forward messages to email** = ON.
3. Riders text their link to that number. The forwarded email contains the
   link and the sender's phone number. If the team roster has a phone column, texts
   automatically show the right name.
4. Caveat: Google Voice often **does not receive texts from short codes** (5–6 digit
   senders). Texts sent from a rider's own phone work fine. Prefer email when you can.

### 3. Apps Script on the existing team roster

The script reuses the team's existing roster spreadsheet. It reads riders straight from
the roster tab without changing it, and adds one new tab, **Rides**, to log ride links.

**Option A (simplest): the team Gmail owns the roster, or can edit it.**

1. Open the roster in Google Sheets while logged into the team Gmail.
   If it's an Excel file, upload it to Drive and use File → Save as Google Sheets.
2. Go to Extensions → Apps Script. Replace `Code.gs` with `apps-script/Code.gs` from this
   repo. Add an HTML file named `Page` with the contents of `apps-script/Page.html`.

**Option B: the roster belongs to someone else and you'd rather not touch it.**

1. Share the roster with the team Gmail (*Viewer* is enough).
2. While logged into the team Gmail, create a small new sheet named **Ride Tracker** and add the script there
   as in Option A.
3. In `Code.gs`, set `ROSTER_SPREADSHEET_ID` to the roster's ID. That's the long string
   in its URL between `/d/` and `/edit`.

**Both options:**

1. In `Code.gs`, check `ROSTER_TAB` and `ROSTER_COLUMNS`:
   - Leave `ROSTER_TAB` blank to use the first tab, or type the tab's name.
   - The script finds columns by their header text in row 1, ignoring case. It
     recognises common headers such as *Name*, *First Name*/*Last Name*, *Nickname*,
     *Email*, *Phone*/*Mobile*/*Cell*. If your headers differ, add them to the lists.
   - Riders are recognised by name, email, or phone number (the phone number is used for texts). Cells holding
     several emails or numbers separated by commas work fine.
   - Optional: add a **Tracking Name** column for anyone whose GPS app shows a different
     name than the roster does (e.g. roster "Robert Smith", Garmin "Bob S").
2. Run the `setup` function once and accept the permission prompts (Gmail, Sheets,
   external requests). It:
   - adds the `Rides` tab,
   - generates a random `ACCESS_KEY`,
   - installs a trigger that runs `checkMail` every minute,
   - runs `checkRoster`, which logs which columns it found and the first few riders.
     Check that log (View → Executions) before going further.
3. Optional Slack setup: Project Settings → Script Properties → add `SLACK_WEBHOOK_URL`
   (see step 5).

> **Privacy:** in Option A, anyone who can open the roster can also see the Rides tab.
> That's normally fine, since it's the same team, and rows are purged after 7 days. Use Option B if
> the roster is shared more widely, e.g. with a sponsor or a race organiser.

### 4. Publish the list page

1. In Apps Script, go to Deploy → New deployment → type **Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**. Wix visitors aren't signed into Google, and the
     secret key in the URL is what restricts access.
2. Copy the web app URL and append `?key=<ACCESS_KEY>`. The key is listed under
   Project Settings → Script Properties.
3. Open that URL in a browser to confirm it loads. To test, send yourself a sample
   tracking email or forward an old one.

### 5. Slack (free tier)

1. Go to api.slack.com/apps → Create App → From scratch → pick your workspace.
2. Incoming Webhooks → On → Add New Webhook → choose `#rides` (or `#general`).
3. Paste the webhook URL into the `SLACK_WEBHOOK_URL` script property.
   Each new ride then posts something like: *"🚴 Alex started a ride (Garmin LiveTrack): <link>"*.
4. Free Slack only shows 90 days of history. That's fine, because these links expire anyway.

### 6. Wix page

1. In the Wix Editor, add a new page, e.g. **Live Rides**.
2. Page settings → Permissions → **Password holders**. Share the password with the team.
   (Members-only pages also work if you already use Wix Members.)
3. Add → Embed Code → **Embed a site**, and paste the web app URL including `?key=...`.
   Stretch it to full width and about 800px tall.
4. Hide the page from site navigation and search engines (Page settings → SEO → "Let
   search engines index this page" = off).
5. Publish. Team members open the page, enter the password, and see the live list. It
   refreshes itself every 60 seconds. Tapping a rider opens their live map in a new tab.

## Security & privacy notes

- Three layers protect the page: the Wix password, the unguessable web-app URL, and the
  secret `key`. If the key leaks, change `ACCESS_KEY` in Script Properties and update
  the Wix embed. That's all it takes to rotate it.
- The links themselves are only valid during a ride. Old rows are purged after 7 days.
- Tell riders what's shared and with whom. Make it opt-in.

## Free-tier limits (comfortable for a club)

- Apps Script on a consumer Gmail account allows about 90 minutes/day of trigger runtime. A 1-minute
  check takes about 1 s, so roughly 25 minutes/day. If you ever hit the limit, change the
  trigger to every 5 minutes.
- Gmail reads allow 20,000/day, Slack posts via UrlFetch allow 20,000/day, and the Sheet holds up to 10M cells. None of these will be a constraint.
- Slack free tier allows 10 app integrations, and this uses one.

## Things to verify with real emails (first ride test)

Link formats differ by brand. `Code.gs` has a `PROVIDERS` list of URL patterns:

| Provider | Pattern in script | Confidence |
|---|---|---|
| Garmin LiveTrack | `livetrack.garmin.com/session/...`, rider name from subject "Watch <Name>'s LiveTrack" | High. Verified from a real email. |
| Garmin inReach MapShare | `share.garmin.com/...` | High |
| Strava Beacon | `strava.com/beacon/...` | Medium. Verify. |
| Wahoo | `wahooligan.com/users/live/...` | High. Verified from a real email. |
| Hammerhead Karoo | `*.hammerhead.io/...` | Low. Verify. |
| Fallback | any link in an email from a rider on the roster | Off by default |

Have one rider of each brand send a test. If a link isn't picked up, open the email,
copy the tracking URL's domain, and add or adjust a pattern in `PROVIDERS`. If the email
comes from a no-reply address and names the rider in the body (Wahoo writes "Dustin S is
starting an activity"), give the provider a `nameRe` so the right rider is shown. A short name
like "Dustin S" is matched to the roster by first name + last initial; add a Tracking Name
if two riders share both. Also check
whether the provider sends an "ended" email. If so, add its wording to `END_PATTERNS`.

## Optional later improvements

- **Native Wix look.** Use Wix Velo (free in the editor) to `fetch` a JSON version of the list
  (`?key=...&format=json`, already supported) into a Wix repeater instead of an iframe.
- **Slack "ended" message** when a ride times out.
- **Map view.** Garmin's live pages can't be merged into one map without Garmin's
  private API, so a single combined map is out of scope with free tools. A list
  of links is the reliable approach.
