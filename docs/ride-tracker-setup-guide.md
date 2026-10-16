# Team Live Ride Tracker: Scope & Setup Guide

A free way for a cycling team to see **who's out riding right now**, with a live-tracking
link for each rider. It also posts each ride start to a **Discord** channel.

Two files come with this guide: **`Code.gs`** and **`Page.html`**. Setup takes about an hour,
and you don't need to know how to code.

---

## 1. Scope

### What it does
- Riders' GPS units (Garmin, Wahoo, etc.) email a live-tracking link to a team Gmail
  address when a ride starts. This is a built-in feature of most head units and apps.
- A free Google Apps Script checks that inbox every minute, finds the tracking link, works
  out who the rider is from your team roster, and logs the ride in a Google Sheet.
- A simple web page lists every active ride with a **Live map** button. You can embed it
  on your team website behind a password, or just share the link.
- Each new ride gets one post in a Discord channel, for example: *🚴 **Jane Doe** started a ride
  (Garmin LiveTrack): live tracking*.

### What it doesn't do
- **It shows a list of links, not one combined map.** Merging everyone onto a single map
  would need Garmin's and Wahoo's private data access, which isn't free or public.
- **It doesn't know exactly when a ride ends.** Garmin and Wahoo send a "started" email
  but no "ended" email. A ride drops off the list after **8 hours** (adjustable), when the
  same rider starts another ride, or when someone marks it ended in the Sheet.
- **Nothing is posted when a ride ends.** It never @mentions anyone.

### Cost: $0
| Piece | Tool |
|---|---|
| Inbox for tracking emails | A free Gmail account (a dedicated team account is best) |
| Parser, storage and web page | Google Apps Script + Google Sheets (free) |
| Team page | Any website builder that can embed a page (Wix, Squarespace, Google Sites…) or none at all |
| Chat alerts | Discord channel webhook (free) |
| Texts instead of email (optional, US only) | Google Voice number, with texts forwarded to Gmail |

### How it fits together
```
GPS unit / phone app ──email──▶ Team Gmail ──(every minute)──▶ Apps Script
                                                               │   │   │
                         Google Sheet "Rides" tab ◀────────────┘   │   └──▶ Discord #live-rides
                                                                   ▼
                                         Web page (list of active rides)
                                                                   │
                                     Embedded on a password-protected team web page
```

---

## 2. Before you start

You need:
- [ ] A **Gmail account** the team controls, e.g. `yourteam.rides@gmail.com`.
- [ ] A **team roster in Google Sheets**, with column headers in row 1. Only a name column is required.
      Email and phone columns help with matching.
      - If you don't have one, make a sheet with headers `Name | Email | Phone Number`.
      - If your roster is in Excel, upload it to Google Drive, open it, and choose **File → Save as Google Sheets**.
- [ ] **Manage Webhooks** permission on your Discord server, or a server admin who can do step 7.
- [ ] Optional: a team website where you can add a password-protected page.

Do every step below **while signed into the team Gmail account**.

---

## 3. Install the script

1. Open the roster in Google Sheets and choose **Extensions → Apps Script**.
   - If the roster is shared beyond your team, you may not want ride links stored in it. In that case, make a separate
     blank sheet and do these steps there instead. Share the roster with the team Gmail as
     *Viewer*, and in `Code.gs` set `ROSTER_SPREADSHEET_ID` to the roster's ID. The ID is the long
     string in the roster's URL, between `/d/` and `/edit`.
2. Rename the project (top left) to **Ride Tracker**.
3. Replace everything in **Code.gs** with the contents of the supplied `Code.gs`.
4. Click **+** next to "Files", then **HTML**, and name it `Page` (without ".html").
   Replace its contents with the supplied `Page.html`.
5. Click **Save** (💾).

## 4. Run setup

1. Choose **`setup`** in the function dropdown and click **▶ Run**.
2. Approve the permissions:
   - Click **Review permissions** and choose the team account.
   - At **"Google hasn't verified this app"**, click **Advanced**, then **Go to Ride Tracker (unsafe)**, then **Allow**.
   - This warning is normal for scripts you write yourself.
3. Check the **Execution log**. It should list the roster columns it found and the first few
   riders, e.g. `Columns used: name → "Name", email → "Email", phone → "Phone Number"`.
   - If it says **"No name column found"**, open `Code.gs`, find `ROSTER_COLUMNS` near the top,
     add your header text (lowercase) to the `name` list, save, and run `setup` again.
4. A **Rides** tab now appears at the end of the spreadsheet.

> 🔑 The log also shows an **ACCESS_KEY**. Treat it like a password: it's what keeps the ride
> list private. Don't paste it into chats or emails. If it leaks, go to **⚙ Project Settings → Script
> Properties**, delete `ACCESS_KEY`, and run `setup` again to get a new one. Then update the
> link on your website.

## 5. Publish the ride list page

1. Click **Deploy → New deployment**, click the ⚙ next to "Select type", and choose **Web app**.
2. Set **Execute as: Me** and **Who has access: Anyone**, then click **Deploy**.
3. Copy the **Web app URL** (it ends in `/exec`) and add `?key=YOUR_ACCESS_KEY` to the end:
   ```
   https://script.google.com/macros/s/AKfy..../exec?key=YOUR_ACCESS_KEY
   ```
4. Open it in a private/incognito window. You should see **"Live rides: Nobody is out riding right
   now."** A grey "created by a Google Apps Script user" banner at the top is normal.

## 6. Test it

1. From a personal email account, send the team Gmail an email with this in the body:
   `https://livetrack.garmin.com/session/test123/token/test456`
2. Within 1–2 minutes, a row should appear in the **Rides** tab and on the page.
3. Type any date into that row's **EndedAt** cell to clear it.
4. If nothing appears, open **Executions** (☰ icon) in Apps Script and click the latest
   `checkMail` run to see the error.

## 7. Connect Discord

1. In Discord, create a channel, e.g. `#live-rides`.
2. Open **Server Settings → Integrations → Webhooks → New Webhook**. Name it **Ride Tracker**,
   choose `#live-rides`, and click **Copy Webhook URL**.
   - Or use the channel's ⚙ **Edit Channel → Integrations → Webhooks**.
3. In Apps Script, go to **⚙ Project Settings → Script Properties → Add script property**.
   Enter `DISCORD_WEBHOOK_URL` as the property, paste the URL as the value, and click **Save**.
4. Send another test email as in step 6. A post should appear in `#live-rides`.

Posts link to the live map without a big preview card, and never ping anyone. Members can
change their own notification level for the channel. Keep the webhook URL private: anyone who
has it can post into that channel.

> Using Slack instead? Set `SLACK_WEBHOOK_URL` the same way, using a Slack **Incoming Webhook**.
> If both properties are set, it posts to both.

## 8. Put the page on your website (optional)

The URL from step 5 works on its own, so you can simply pin it in Discord. To put it on
your website instead:

**Wix**
1. Go to **Pages & Menu → + Add Page** and name it e.g. **Live Rides**.
2. On the page, click **⋯ → Settings**:
   - Under **Access** (or **Permissions**), choose **Password holders** and set a password.
   - Under **SEO basics**, turn off search-engine indexing.
3. Click **⋯ → Hide from menu** if you don't want it in the site navigation.
4. Click **Add → Embed Code → Embed a site**, paste the full URL including `?key=...`, and size the box to
   full width and about 800px tall.
5. Click **Publish**. Settings like the page password only take effect after you publish.

**Squarespace / Google Sites / others:** add an **embed** or **iframe** block with the same URL,
and put the page behind the site's own password or member protection.

> **Testing the password:** close *all* incognito windows first. If the editor is open in
> another incognito tab, the site may recognise you as the owner and skip the password prompt.

## 9. Keep the inbox tidy (optional)

In Gmail, open the search-bar filter icon:
- **From:** `noreply@garmin.com OR no-reply@wahooligan.com`
- **Subject:** `LiveTrack OR "Live Track"`
- Click **Create filter**. Tick **Skip the Inbox** and **Apply the label** "Ride Links".

The script searches all mail, not just the inbox, so archived and labelled emails still work.
**Don't** have the filter delete the emails or send them to Spam; the script doesn't look in Trash or Spam.

Optional: to make the script look only at that label, change `SEARCH_QUERY` near the top of
`Code.gs` to `'label:ride-links newer_than:1d'`. Spaces in label names become hyphens.

## 10. Tell the riders

Send the team:
1. **The team Gmail address**, to add as a tracking contact.
   - **Garmin Connect app:** Safety & Tracking → LiveTrack → add the address as a contact, and
     turn on **Auto Start** so it emails on every ride.
   - **Wahoo app:** Profile → Live Track → add the address and turn on auto-share.
   - Menu names change between app versions, so look for "LiveTrack" / "Live Track".
2. **The website page and password**, or the direct link.
3. **A note on privacy:** it's opt-in, links only work during the ride, and the Sheet deletes rows
   after 7 days.

---

## Reference

### Email formats the script recognises
| Brand | Link | How the rider is identified | Status |
|---|---|---|---|
| Garmin LiveTrack | `livetrack.garmin.com/session/…/token/…` | Subject: "Watch **Jane Doe**'s LiveTrack" | ✅ Verified |
| Wahoo | `wahooligan.com/users/live/…` | Body: "**Jane D** is starting an activity…" | ✅ Verified |
| Garmin inReach MapShare | `share.garmin.com/…` | Roster name/email/phone found anywhere in the email | Untested |
| Strava Beacon | `strava.com/beacon/…` | Roster name/email/phone found anywhere in the email | Untested |
| Hammerhead | `*.hammerhead.io/…` | Roster name/email/phone found anywhere in the email | Untested |

- **Short names** like Wahoo's "Jane D" are matched to the roster by first name + last
  initial. If two riders share both, the name is shown exactly as written.
- **Forwarded emails** are credited to the rider named in the email, not to the person who forwarded it.
- **Different name in the GPS app:** if a rider's Garmin or Wahoo profile name doesn't match the roster, add a
  **Tracking Name** column to the roster with the name the app uses.
- **New brand:** if a brand's link isn't picked up, open the email in Gmail and choose **⋮ → Show original**.
  Find the tracking URL and add a pattern to `PROVIDERS` at the top of `Code.gs`.

### Settings (top of `Code.gs`)
| Setting | Default | Meaning |
|---|---|---|
| `SEARCH_QUERY` | `newer_than:1d` | Which emails to check |
| `EXPIRE_HOURS` | `8` | How long a ride stays listed without a newer ride from the same rider |
| `RETENTION_DAYS` | `7` | When old rows are deleted |
| `TRIGGER_MINUTES` | `1` | How often to check email (change it, then re-run `setup`) |
| `ROSTER_SPREADSHEET_ID` / `ROSTER_TAB` | blank | Where the roster is (blank = this spreadsheet, first tab) |
| `ROSTER_COLUMNS` | common headers | Header names to look for |

### When do I need to redeploy?
- **Changes to `Code.gs` that affect email checking** (patterns, roster, Discord): just **Save**. The
  every-minute check always runs the latest saved code.
- **Changes to `Page.html` or `EXPIRE_HOURS`:** click **Deploy → Manage deployments → ✏️ → Version:
  New version → Deploy**. The URL stays the same.

### Troubleshooting
| Symptom | Fix |
|---|---|
| Page says "Not authorized" | The `?key=` value doesn't match `ACCESS_KEY` in Script Properties |
| Ride doesn't appear | Check **Executions** for errors. Check the email isn't in Spam or Trash. If you changed `SEARCH_QUERY` to a label, check the email got that label |
| Rider shows as "Garmin" / wrong name | Add a **Tracking Name** column to the roster |
| Same ride shows twice | The email arrived twice (e.g. sent directly and also forwarded). Set **EndedAt** on one |
| Website page doesn't ask for a password | Republish the site, check the page address, and close all incognito windows (see step 8) |
| No Discord post | Check that `DISCORD_WEBHOOK_URL` is set correctly and that the webhook wasn't deleted in Discord |

### Free-tier limits
Checking every minute uses about 25 of Google's 90 free script-minutes per day. Gmail and
URL-fetch quotas (20,000/day) are far more than a team needs. If you ever hit a limit, set
`TRIGGER_MINUTES` to `5` and re-run `setup`.
