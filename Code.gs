/**
 * ============================================================
 *  REMC Route Tool — Google Apps Script Backend
 *  File: Code.gs
 *
 *  QUICK START:
 *  1. Open your Google Sheet → Extensions → Apps Script
 *  2. Paste this entire file, replacing any existing code
 *  3. Edit the CONFIG section below
 *  4. Deploy as a Web App:
 *       Deploy → New Deployment → Type: Web App
 *       Execute as: Me
 *       Who has access: Anyone
 *  5. Copy the Web App URL into index.html and admin.html
 * ============================================================
 */

// ============================================================
// ▶ CONFIGURATION — Edit before deploying
// ============================================================

const CONFIG = {

  /**
   * The Spreadsheet ID from the URL of your Google Sheet.
   * Example URL: https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit
   */
  SPREADSHEET_ID: 'PASTE_YOUR_SPREADSHEET_ID_HERE',

  /**
   * Name of the sheet tab that holds route data.
   * Default: "Routes"
   */
  ROUTES_SHEET: 'Routes',

  /**
   * Google Drive folder ID where delivery photos will be saved.
   * Create a folder in Drive, open it, and copy the ID from the URL.
   * Leave blank ('') to skip photo saving.
   */
  PHOTO_FOLDER_ID: 'PASTE_YOUR_DRIVE_FOLDER_ID_HERE',

  /**
   * Days of the week your REMC runs deliveries.
   * Remove any day you do NOT deliver.
   * Stops whose "Route Day" column does not match today are excluded.
   */
  DELIVERY_DAYS: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],

};

// ============================================================
// COLUMN MAPPING
// These numbers (0-based) correspond to columns A, B, C, etc.
// in your Routes sheet. Change them only if you rearrange columns.
// ============================================================

const COL = {
  ROUTE_DAY:      0,   // A — Day of week (Monday, Tuesday…)
  STOP_ORDER:     1,   // B — Stop sequence number (1, 2, 3…)
  NAME:           2,   // C — Location / school name
  ADDRESS:        3,   // D — Full street address
  LAT:            4,   // E — Latitude  (decimal, e.g. 41.9765)
  LNG:            5,   // F — Longitude (decimal, e.g. -86.1234)
  DELIVERY_NOTE:  6,   // G — Special instructions / delivery note
  STATUS:         7,   // H — Status (blank = Pending | Complete | Skipped)
  NOTES:          8,   // I — Driver notes / skip reason
  PHOTO_URL:      9,   // J — Google Drive photo link (set by script)
  COMPLETED_AT:   10,  // K — Timestamp when marked complete/skipped
  COMPLETED_DATE: 11,  // L — Date only, for admin date filter (yyyy-MM-dd)
};

// ============================================================
// ENTRY POINTS
// ============================================================

/**
 * Handles GET requests.
 *
 *   No params        → returns today's pending route stops
 *   ?mode=dailySummary&date=2025-06-10
 *                    → returns ALL stops (all statuses) for that date
 *   ?rowID=5&status=Complete&note=&routeDay=Monday
 *                    → simple (no-photo) status update; returns {success:true}
 */
function doGet(e) {
  try {
    const p = e.parameter || {};

    if (p.mode === 'dailySummary') {
      return respond(getDailySummary(p.date || ''));
    }

    if (p.rowID) {
      const result = updateStop({
        rowID:    p.rowID,
        status:   p.status  || 'Complete',
        note:     p.note    || '',
        routeDay: p.routeDay || '',
        photo:    null,
      });
      return respond(result);
    }

    // Default: return today's route
    return respond(getTodayRoute());

  } catch (err) {
    Logger.log('doGet error: ' + err.message);
    return respond({ error: err.message });
  }
}

/**
 * Handles POST requests (used when a photo is attached).
 *
 * Expected JSON body:
 * {
 *   rowID:    <number>,
 *   status:   "Complete" | "Skipped",
 *   note:     <string>,
 *   stopName: <string>,
 *   routeDay: <string>,
 *   photo:    <base64 data URL or null>
 * }
 */
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    return respond(updateStop(payload));
  } catch (err) {
    Logger.log('doPost error: ' + err.message);
    return respond({ error: err.message });
  }
}

// ============================================================
// ROUTE DATA
// ============================================================

/**
 * Returns today's stops ordered by Stop Order.
 * Only returns rows whose Route Day matches today
 * AND whose Status is blank or "Pending".
 */
function getTodayRoute() {
  const sheet  = getRoutesSheet();
  const data   = sheet.getDataRange().getValues();
  const today  = getDayName();
  const result = [];

  for (let i = 1; i < data.length; i++) {          // skip header row
    const row = data[i];
    const day = (row[COL.ROUTE_DAY] || '').toString().trim();
    if (day !== today) continue;

    const status = (row[COL.STATUS] || '').toString().trim().toLowerCase();
    if (status !== '' && status !== 'pending') continue;

    result.push({
      actualRow:       i + 1,                        // 1-based sheet row
      routeDay:        row[COL.ROUTE_DAY],
      stopOrder:       row[COL.STOP_ORDER],
      Name:            row[COL.NAME],
      Address:         row[COL.ADDRESS],
      Lat:             row[COL.LAT],
      Lng:             row[COL.LNG],
      'Delivery Note': row[COL.DELIVERY_NOTE],
      Status:          row[COL.STATUS],
    });
  }

  // Sort ascending by stop order
  result.sort((a, b) => Number(a.stopOrder) - Number(b.stopOrder));
  return result;
}

/**
 * Returns ALL stops that were completed/skipped on a given date,
 * PLUS any still-pending stops that are scheduled for that weekday.
 * Used by the admin map.
 *
 * @param {string} dateStr - ISO date string, e.g. "2025-06-10"
 */
function getDailySummary(dateStr) {
  const sheet  = getRoutesSheet();
  const data   = sheet.getDataRange().getValues();
  const result = [];

  // Determine the day of the week for the requested date
  const targetDay = dateStr
    ? getDayNameForDate(new Date(dateStr + 'T12:00:00'))  // noon to avoid TZ edge cases
    : getDayName();

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const day = (row[COL.ROUTE_DAY] || '').toString().trim();

    if (day !== targetDay) continue;

    const completedDate = (row[COL.COMPLETED_DATE] || '').toString().trim();
    const status        = (row[COL.STATUS] || 'Pending').toString().trim();

    // Include if: completed on that date OR still pending (for today's view)
    const dateMatch = !dateStr || completedDate === dateStr;
    if (!dateMatch && status !== 'Pending' && status !== '') continue;

    result.push({
      name:    row[COL.NAME],
      address: row[COL.ADDRESS],
      lat:     row[COL.LAT],
      lng:     row[COL.LNG],
      status:  status || 'Pending',
      note:    row[COL.NOTES],
      photo:   row[COL.PHOTO_URL],
    });
  }

  // Sort by stop order
  const orders = data.slice(1).map(r => r[COL.STOP_ORDER]);
  result.sort((a, b) => {
    const ai = data.findIndex(r => r[COL.NAME] === a.name && r[COL.ROUTE_DAY] === targetDay);
    const bi = data.findIndex(r => r[COL.NAME] === b.name && r[COL.ROUTE_DAY] === targetDay);
    return Number(data[ai] ? data[ai][COL.STOP_ORDER] : 0) -
           Number(data[bi] ? data[bi][COL.STOP_ORDER] : 0);
  });

  return result;
}

// ============================================================
// STATUS UPDATE
// ============================================================

/**
 * Updates a row in the Routes sheet with the new status,
 * optionally saves a photo to Google Drive.
 *
 * @param {Object} payload
 * @returns {{ success: boolean, rowID: number }}
 */
function updateStop(payload) {
  const rowIndex = Number(payload.rowID);
  if (!rowIndex || rowIndex < 2) throw new Error('Invalid rowID: ' + payload.rowID);

  const sheet = getRoutesSheet();
  const now   = new Date();
  const tz    = Session.getScriptTimeZone();

  sheet.getRange(rowIndex, COL.STATUS        + 1).setValue(payload.status || '');
  sheet.getRange(rowIndex, COL.NOTES         + 1).setValue(payload.note   || '');
  sheet.getRange(rowIndex, COL.COMPLETED_AT  + 1).setValue(now);
  sheet.getRange(rowIndex, COL.COMPLETED_DATE+ 1).setValue(
    Utilities.formatDate(now, tz, 'yyyy-MM-dd')
  );

  // Save photo to Drive if provided and folder is configured
  if (payload.photo && CONFIG.PHOTO_FOLDER_ID) {
    try {
      const photoUrl = savePhotoToDrive(
        payload.photo,
        payload.stopName || 'stop',
        rowIndex
      );
      sheet.getRange(rowIndex, COL.PHOTO_URL + 1).setValue(photoUrl);
    } catch (photoErr) {
      Logger.log('Photo save failed (non-fatal): ' + photoErr.message);
    }
  }

  SpreadsheetApp.flush();
  return { success: true, rowID: rowIndex };
}

// ============================================================
// PHOTO HELPER
// ============================================================

/**
 * Decodes a base64 data URL and saves it as a file in Google Drive.
 * Sets the file to be viewable by anyone with the link.
 *
 * @param {string} base64DataUrl - e.g. "data:image/jpeg;base64,/9j/4AAQ..."
 * @param {string} stopName
 * @param {number} rowIndex
 * @returns {string} Public URL of the saved image
 */
function savePhotoToDrive(base64DataUrl, stopName, rowIndex) {
  const folder = DriveApp.getFolderById(CONFIG.PHOTO_FOLDER_ID);

  const match = base64DataUrl.match(/^data:image\/(\w+);base64,(.+)$/s);
  if (!match) throw new Error('Invalid image data URL format');

  const ext      = match[1].toLowerCase();
  const rawData  = Utilities.base64Decode(match[2]);
  const mimeType = `image/${ext}`;
  const safeName = stopName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `${safeName}_row${rowIndex}_${Date.now()}.${ext}`;

  const blob = Utilities.newBlob(rawData, mimeType, filename);
  const file = folder.createFile(blob);

  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  // Return a direct-view URL (works in <img> tags)
  return `https://drive.google.com/uc?export=view&id=${file.getId()}`;
}

// ============================================================
// UTILITY
// ============================================================

function getRoutesSheet() {
  const ss    = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(CONFIG.ROUTES_SHEET);
  if (!sheet) throw new Error(`Sheet "${CONFIG.ROUTES_SHEET}" not found in spreadsheet.`);
  return sheet;
}

function getDayName() {
  return getDayNameForDate(new Date());
}

function getDayNameForDate(date) {
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  return days[date.getDay()];
}

function respond(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// OPTIONAL: SCHEDULED DAILY RESET
// ============================================================

/**
 * Resets the Status column for all stops each morning.
 * Set up a time-driven trigger:
 *   Triggers → + Add Trigger → dailyReset → Time-driven → Day timer → 5am-6am
 *
 * Remove or comment out this function if you prefer NOT to auto-reset.
 */
function dailyReset() {
  const sheet = getRoutesSheet();
  const data  = sheet.getDataRange().getValues();
  const today = getDayName();

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const day = (row[COL.ROUTE_DAY] || '').toString().trim();
    if (day !== today) continue;

    // Only reset if previously completed/skipped (leave blanks alone)
    const status = (row[COL.STATUS] || '').toString().trim();
    if (status !== '') {
      sheet.getRange(i + 1, COL.STATUS + 1).setValue('');
    }
  }

  Logger.log('Daily reset complete for ' + today);
}

// ============================================================
// OPTIONAL: TEST FUNCTION (run from Apps Script editor)
// ============================================================

/**
 * Run this function in the Apps Script editor to verify your
 * sheet connection and column mapping are correct.
 * Check "Execution log" below for output.
 */
function testConnection() {
  try {
    const sheet = getRoutesSheet();
    const rows  = sheet.getLastRow() - 1; // subtract header
    Logger.log(`✅ Connected to sheet "${CONFIG.ROUTES_SHEET}". Found ${rows} data row(s).`);

    const route = getTodayRoute();
    Logger.log(`📍 Today (${getDayName()}): ${route.length} pending stop(s).`);
    route.forEach((s, i) => Logger.log(`  ${i+1}. ${s.Name} — ${s.Address}`));
  } catch (err) {
    Logger.log('❌ Error: ' + err.message);
  }
}
