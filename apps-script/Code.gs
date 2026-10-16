/**
 * Team Live Ride Tracker: Google Apps Script (bind to a Google Sheet).
 *
 * Reads ride-tracking emails from the team Gmail inbox, stores active links in the
 * "Rides" sheet, posts new rides to Slack, and serves a small web page that lists
 * active rides (embedded on a password-protected Wix page).
 *
 * See PLAN.md for setup.
 */

const CONFIG = {
  // Gmail search for candidate messages. Keep it narrow and recent.
  SEARCH_QUERY: 'newer_than:1d',
  // A ride is shown as active for at most this many hours after the start email.
  EXPIRE_HOURS: 8,
  // Rows older than this are deleted.
  RETENTION_DAYS: 7,
  // Minutes between Gmail checks (1, 5, 10, 15 or 30).
  TRIGGER_MINUTES: 1,
  // If true, any link in an email from a rider listed in Roster counts as a tracking link.
  FALLBACK_ANY_LINK_FROM_ROSTER: false,
};

// URL patterns that identify live-tracking links. Verify with real emails (see PLAN.md).
const PROVIDERS = [
  { name: 'Garmin LiveTrack', re: /https?:\/\/livetrack\.garmin\.com\/[^\s"'<>)]+/i },
  { name: 'Garmin MapShare', re: /https?:\/\/share\.garmin\.com\/[^\s"'<>)]+/i },
  { name: 'Strava Beacon', re: /https?:\/\/(?:www\.)?strava\.com\/beacon\/[^\s"'<>)]+/i },
  { name: 'Wahoo', re: /https?:\/\/[a-z0-9.-]*wahoofitness\.com\/[^\s"'<>)]*live[^\s"'<>)]*/i },
  { name: 'Hammerhead', re: /https?:\/\/[a-z0-9.-]*hammerhead\.io\/[^\s"'<>)]+/i },
];

// Subject/body wording that means a ride has ended (only if a provider sends such emails).
const END_PATTERNS = [/livetrack (?:has )?ended/i, /activity (?:has )?ended/i, /beacon (?:has )?ended/i];

const RIDES_SHEET = 'Rides';
const ROSTER_SHEET = 'Roster';
const RIDE_HEADERS = ['Received', 'Rider', 'Provider', 'Link', 'Source', 'MessageId', 'EndedAt'];
const COL = { RECEIVED: 0, RIDER: 1, PROVIDER: 2, LINK: 3, SOURCE: 4, MESSAGE_ID: 5, ENDED_AT: 6 };
const SEEN_KEY = 'SEEN_MESSAGE_IDS';
const MAX_SEEN = 500;

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

/** Run once from the Apps Script editor. */
function setup() {
  const ss = getSpreadsheet_();
  ss.getSheetByName(RIDES_SHEET) || ss.insertSheet(RIDES_SHEET).appendRow(RIDE_HEADERS);
  if (!ss.getSheetByName(ROSTER_SHEET)) {
    const roster = ss.insertSheet(ROSTER_SHEET);
    roster.appendRow(['Match text (name / email / phone as it appears in the message)', 'Display name']);
    roster.appendRow(['Jane Doe', 'Jane']);
  }

  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('ACCESS_KEY')) {
    props.setProperty('ACCESS_KEY', Utilities.getUuid().replace(/-/g, ''));
  }
  if (!props.getProperty('SHEET_ID')) props.setProperty('SHEET_ID', ss.getId());

  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'checkMail')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('checkMail').timeBased().everyMinutes(CONFIG.TRIGGER_MINUTES).create();

  Logger.log('Setup done. ACCESS_KEY = ' + props.getProperty('ACCESS_KEY'));
}

// ---------------------------------------------------------------------------
// Mail processing (runs on the time trigger)
// ---------------------------------------------------------------------------

function checkMail() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10 * 1000)) return;
  try {
    const props = PropertiesService.getScriptProperties();
    const seen = JSON.parse(props.getProperty(SEEN_KEY) || '[]');
    const seenSet = new Set(seen);
    const sheet = getSpreadsheet_().getSheetByName(RIDES_SHEET);
    const roster = loadRoster_();

    const threads = GmailApp.search(CONFIG.SEARCH_QUERY, 0, 50);
    threads.forEach((thread) => {
      thread.getMessages().forEach((msg) => {
        const id = msg.getId();
        if (seenSet.has(id)) return;
        seenSet.add(id);
        seen.push(id);
        processMessage_(msg, sheet, roster);
      });
    });

    props.setProperty(SEEN_KEY, JSON.stringify(seen.slice(-MAX_SEEN)));
    purgeOldRows_(sheet);
  } finally {
    lock.releaseLock();
  }
}

function processMessage_(msg, sheet, roster) {
  const from = msg.getFrom();
  const subject = msg.getSubject();
  const plain = msg.getPlainBody() || '';
  const html = (msg.getBody() || '').replace(/&amp;/g, '&');
  const haystack = [from, subject, plain].join('\n');

  const rider = findRider_(haystack, roster);
  const link = findLink_(plain + '\n' + html, rider.inRoster);
  const source = /voice\.google\.com/i.test(from) ? 'SMS (Google Voice)' : 'Email';

  if (END_PATTERNS.some((re) => re.test(subject) || re.test(plain))) {
    endRides_(sheet, (row) => (link && row[COL.LINK] === link.url) || row[COL.RIDER] === rider.name);
    return;
  }
  if (!link) return;

  // A new ride from the same rider replaces their previous one.
  endRides_(sheet, (row) => row[COL.RIDER] === rider.name);

  sheet.appendRow([msg.getDate(), rider.name, link.provider, link.url, source, msg.getId(), '']);
  notifySlack_(rider.name, link);
}

function findLink_(text, fromRosterRider) {
  for (const p of PROVIDERS) {
    const m = text.match(p.re);
    if (m) return { provider: p.name, url: m[0] };
  }
  if (CONFIG.FALLBACK_ANY_LINK_FROM_ROSTER && fromRosterRider) {
    const m = text.match(/https?:\/\/[^\s"'<>)]+/i);
    if (m) return { provider: 'Link', url: m[0] };
  }
  return null;
}

function loadRoster_() {
  const sheet = getSpreadsheet_().getSheetByName(ROSTER_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet
    .getRange(2, 1, sheet.getLastRow() - 1, 2)
    .getValues()
    .filter((r) => String(r[0]).trim())
    .map((r) => ({ match: String(r[0]).trim(), name: String(r[1]).trim() || String(r[0]).trim() }));
}

function findRider_(haystack, roster) {
  const lower = haystack.toLowerCase();
  const digits = haystack.replace(/\D/g, '');
  for (const r of roster) {
    const matchDigits = r.match.replace(/\D/g, '');
    const isPhone = matchDigits.length >= 7 && !/[a-z@]/i.test(r.match);
    if (isPhone ? digits.includes(matchDigits) : lower.includes(r.match.toLowerCase())) {
      return { name: r.name, inRoster: true };
    }
  }
  // Fallback: sender display name, e.g. "Jane Doe <jane@x.com>" -> "Jane Doe".
  const display = haystack.split('\n')[0].replace(/<.*>/, '').replace(/"/g, '').trim();
  return { name: display || 'Unknown rider', inRoster: false };
}

function endRides_(sheet, predicate) {
  const last = sheet.getLastRow();
  if (last < 2) return;
  const values = sheet.getRange(2, 1, last - 1, RIDE_HEADERS.length).getValues();
  const now = new Date();
  values.forEach((row, i) => {
    if (!row[COL.ENDED_AT] && predicate(row)) {
      sheet.getRange(i + 2, COL.ENDED_AT + 1).setValue(now);
    }
  });
}

function purgeOldRows_(sheet) {
  const last = sheet.getLastRow();
  if (last < 2) return;
  const cutoff = Date.now() - CONFIG.RETENTION_DAYS * 24 * 3600 * 1000;
  const received = sheet.getRange(2, 1, last - 1, 1).getValues();
  // Delete bottom-up so row indexes stay valid.
  for (let i = received.length - 1; i >= 0; i--) {
    const t = new Date(received[i][0]).getTime();
    if (t && t < cutoff) sheet.deleteRow(i + 2);
  }
}

function notifySlack_(rider, link) {
  const url = PropertiesService.getScriptProperties().getProperty('SLACK_WEBHOOK_URL');
  if (!url) return;
  try {
    UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ text: `:bicyclist: *${rider}* started a ride (${link.provider}): <${link.url}|live tracking>` }),
      muteHttpExceptions: true,
    });
  } catch (e) {
    console.warn('Slack post failed: ' + e);
  }
}

// ---------------------------------------------------------------------------
// Web app
// ---------------------------------------------------------------------------

function doGet(e) {
  const key = (e && e.parameter && e.parameter.key) || '';
  if (!isValidKey_(key)) {
    return HtmlService.createHtmlOutput('<p>Not authorized.</p>')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  if (e.parameter.format === 'json') {
    return ContentService.createTextOutput(JSON.stringify(getActiveRides(key)))
      .setMimeType(ContentService.MimeType.JSON);
  }
  const t = HtmlService.createTemplateFromFile('Page');
  t.key = key;
  return t
    .evaluate()
    .setTitle('Live Rides')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL); // allow Wix iframe
}

/** Called from the page via google.script.run (and by the JSON endpoint). */
function getActiveRides(key) {
  if (!isValidKey_(key)) throw new Error('Not authorized');
  const sheet = getSpreadsheet_().getSheetByName(RIDES_SHEET);
  const last = sheet.getLastRow();
  if (last < 2) return [];
  const cutoff = Date.now() - CONFIG.EXPIRE_HOURS * 3600 * 1000;
  return sheet
    .getRange(2, 1, last - 1, RIDE_HEADERS.length)
    .getValues()
    .filter((r) => !r[COL.ENDED_AT] && new Date(r[COL.RECEIVED]).getTime() > cutoff)
    .map((r) => ({
      rider: r[COL.RIDER],
      provider: r[COL.PROVIDER],
      link: r[COL.LINK],
      source: r[COL.SOURCE],
      startedAt: new Date(r[COL.RECEIVED]).toISOString(),
    }))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

function isValidKey_(key) {
  const expected = PropertiesService.getScriptProperties().getProperty('ACCESS_KEY');
  return Boolean(expected) && key === expected;
}

function getSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}
