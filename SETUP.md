# REMC Route Tool — Setup Guide

A mobile-first Progressive Web App (PWA) for field delivery staff. Drivers open it on their phone, tap through each stop, mark deliveries complete or skipped, and optionally attach a photo. Supervisors use the Admin Dashboard to see a live map of the day's route.

---

## What's Included

| File | Purpose |
|---|---|
| `index.html` | Field driver app (mobile PWA) |
| `admin.html` | Admin map dashboard (desktop/tablet) |
| `manifest.json` | Makes the app installable on phones |
| `Code.gs` | Google Apps Script backend (connects to your Google Sheet) |
| `icon-192.png` | App icon (replace with your own) |
| `icon-512.png` | App icon large (replace with your own) |

---

## Overview of How It Works

```
Google Sheet (route data)
        ↕  Apps Script (Code.gs)
        ↕  Web App URL
   index.html  ←→  Driver's Phone
   admin.html  ←→  Supervisor's Browser
```

The Google Sheet is the single source of truth. The Apps Script exposes it as a simple API. The HTML files talk to that API — no server required.

---

## Step 1 — Create the Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a new spreadsheet.
2. Name it something like **"REMC [Unit] Routes"**.
3. Rename the first tab to **`Routes`** (must match `ROUTES_SHEET` in `Code.gs`).
4. Add this exact header row in **Row 1**:

```
Route Day | Stop Order | Name | Address | Lat | Lng | Delivery Note | Status | Notes | Photo URL | Completed At | Completed Date
```

> Column letters: A through L

### Column Descriptions

| Column | Example | Notes |
|---|---|---|
| **Route Day** | `Monday` | Must match exactly: Monday, Tuesday, Wednesday, Thursday, Friday |
| **Stop Order** | `1` | Determines the sequence stops appear in the app |
| **Name** | `Lincoln Elementary` | Display name shown to the driver |
| **Address** | `123 Main St, City, MI` | Used for navigation fallback if no coordinates |
| **Lat** | `41.9765` | Decimal latitude — enables GPS routing & distance display |
| **Lng** | `-86.1234` | Decimal longitude |
| **Delivery Note** | `Leave at side door` | Optional. Shown as a yellow callout in the app |
| **Status** | _(leave blank)_ | Leave blank when setting up. App writes: Complete or Skipped |
| **Notes** | _(leave blank)_ | App writes skip reasons here |
| **Photo URL** | _(leave blank)_ | Script fills this automatically when a photo is uploaded |
| **Completed At** | _(leave blank)_ | Script fills timestamp |
| **Completed Date** | _(leave blank)_ | Script fills date (yyyy-MM-dd) — used by Admin map filter |

### Getting Lat/Lng Coordinates

The easiest way: in the address column, right-click an address in Google Maps → "What's here?" to see coordinates.

You can also use a batch geocoder. A Google Sheet add-on like **Geocode by Awesome Table** can fill Lat/Lng for all addresses at once.

---

## Step 2 — Create a Google Drive Folder for Photos

1. Open [drive.google.com](https://drive.google.com).
2. Create a new folder, e.g., **"REMC Route Photos"**.
3. Open the folder and copy the **folder ID** from the URL:
   ```
   https://drive.google.com/drive/folders/FOLDER_ID_IS_HERE
   ```
4. Save this ID — you'll paste it into `Code.gs`.

---

## Step 3 — Set Up the Google Apps Script

1. In your Google Sheet, go to **Extensions → Apps Script**.
2. Delete any existing code in the editor.
3. Open `Code.gs` from this package and **paste the entire file** into the editor.
4. Edit the `CONFIG` block near the top:

```javascript
const CONFIG = {
  SPREADSHEET_ID: 'PASTE_YOUR_SPREADSHEET_ID_HERE',  // from Sheet URL
  ROUTES_SHEET:   'Routes',                           // tab name
  PHOTO_FOLDER_ID: 'PASTE_YOUR_DRIVE_FOLDER_ID_HERE', // from Step 2
  DELIVERY_DAYS:  ['Monday','Tuesday','Thursday','Friday'], // your delivery days
};
```

**Finding your Spreadsheet ID:** It's the long string in the Sheet URL between `/d/` and `/edit`.

5. Click **Save** (disk icon or Ctrl+S).

### Test the Connection (optional but recommended)

1. In the Apps Script editor, select `testConnection` from the function dropdown.
2. Click **Run**.
3. Check the **Execution log** at the bottom — you should see your sheet name and stop count.

---

## Step 4 — Deploy the Apps Script as a Web App

1. In the Apps Script editor, click **Deploy → New Deployment**.
2. Click the gear icon ⚙ next to "Select type" → choose **Web App**.
3. Set:
   - **Description:** `REMC Route Tool v1` (or anything)
   - **Execute as:** `Me`
   - **Who has access:** `Anyone`
4. Click **Deploy**.
5. **Copy the Web App URL** — it looks like:
   ```
   https://script.google.com/macros/s/AKfycb.../exec
   ```

> **Important:** Any time you change `Code.gs`, you must create a **New Deployment** (not edit existing) for changes to take effect. Always copy the new URL.

---

## Step 5 — Configure the HTML Files

Open `index.html` in a text editor and find the CONFIG section near the bottom (inside the `<script>` tag):

```javascript
const UNIT_NAME  = "REMC";                   // ← Change to your unit, e.g. "REMC 4"
const SCRIPT_URL = "PASTE_YOUR_APPS_SCRIPT_URL_HERE";  // ← Paste from Step 4
```

Open `admin.html` and do the same:

```javascript
const UNIT_NAME  = "REMC";
const SCRIPT_URL = "PASTE_YOUR_APPS_SCRIPT_URL_HERE";

// Also update the map center to your service area:
const MAP_CENTER = [42.0, -86.0];  // [latitude, longitude]
const MAP_ZOOM   = 10;
```

---

## Step 6 — Host the Web App

The HTML files need to be served over HTTPS for the PWA install prompt and camera access to work. Options:

### Option A: GitHub Pages (Free, Recommended)

1. Create a free account at [github.com](https://github.com).
2. Create a new **public** repository, e.g., `remc4-route-tool`.
3. Upload all files (`index.html`, `admin.html`, `manifest.json`, `Code.gs`, `icon-192.png`, `icon-512.png`).
4. Go to **Settings → Pages → Branch: main → Save**.
5. Your app will be live at:
   ```
   https://YOUR_USERNAME.github.io/remc4-route-tool/
   ```
   Admin map: `https://YOUR_USERNAME.github.io/remc4-route-tool/admin.html`

### Option B: Your District Web Server

Upload all files to any HTTPS web server your district manages. The app has no server-side dependencies — it's all static files.

### Option C: Netlify Drop (Instant, Free)

1. Go to [app.netlify.com/drop](https://app.netlify.com/drop).
2. Drag your folder of files onto the page.
3. Get an instant HTTPS URL.

---

## Step 7 — Install on Phones (Optional)

To give drivers an app-like experience:

**On Android (Chrome):**
1. Open the app URL in Chrome.
2. Tap the three-dot menu → **Add to Home screen**.
3. The app opens full-screen without browser chrome.

**On iPhone (Safari):**
1. Open the app URL in Safari.
2. Tap the Share button → **Add to Home Screen**.

---

## Step 8 — Optional Daily Auto-Reset

The `dailyReset()` function in `Code.gs` clears the Status column each morning so stops show as pending again for the new day.

To enable it:
1. In Apps Script, go to **Triggers** (clock icon in left sidebar).
2. Click **+ Add Trigger**.
3. Configure:
   - Function: `dailyReset`
   - Event source: `Time-driven`
   - Type: `Day timer`
   - Time: `5am to 6am`
4. Click Save.

If you do NOT want auto-reset (e.g., you manage status manually or reset it yourself), skip this step.

---

## Admin Dashboard

Open `admin.html` on a desktop or tablet browser. It is not meant to be installed as a PWA.

**Features:**
- Date picker to view any day's route
- Color-coded markers: green = Complete, red = Skipped, yellow = Pending
- Stop sequence numbers on each marker
- Dashed blue route line connecting stops in order
- Status filter (All / Complete / Skipped / Pending)
- Popup for each stop showing name, address, status, driver notes, and delivery photo

---

## Customizing for a New REMC Unit — Checklist

- [ ] Create a new Google Sheet (Step 1)
- [ ] Create a new Drive folder for photos (Step 2)
- [ ] Paste `Code.gs` into Apps Script, update CONFIG (Step 3)
- [ ] Deploy as Web App, copy URL (Step 4)
- [ ] Paste URL and unit name into `index.html` (Step 5)
- [ ] Paste URL, unit name, and map center into `admin.html` (Step 5)
- [ ] Replace `icon-192.png` and `icon-512.png` with unit-branded icons (optional)
- [ ] Update `manifest.json` name fields if desired
- [ ] Host the files (Step 6)
- [ ] Test on a phone — load the URL, try a stop, check the Sheet for the update
- [ ] Set up daily reset trigger (Step 8, optional)

---

## Troubleshooting

**"Connection Error / No cached data"**
- Confirm the `SCRIPT_URL` in `index.html` is correct and ends with `/exec`.
- Confirm the deployment is set to "Anyone" access.
- Open the script URL directly in a browser — you should see JSON data.

**No stops showing up**
- Check the "Route Day" column in the sheet — it must match exactly (e.g., `Monday`, not `monday`).
- Confirm there are rows with a blank or "Pending" Status for today's day.
- Run `testConnection()` in the Apps Script editor to see what's returned.

**Photos not uploading**
- Confirm `PHOTO_FOLDER_ID` is set in `Code.gs` (not left as the placeholder).
- Confirm the Drive folder exists and the script owner has access to it.
- Check the Apps Script execution log for photo-related errors.

**Admin map shows no markers**
- Confirm the Lat/Lng columns have valid decimal values (not empty, not addresses).
- Open browser DevTools (F12) → Console tab to see any errors.

**App not installing on phone**
- The page must be served over HTTPS (not HTTP).
- On iPhone, must use Safari (not Chrome) to get the "Add to Home Screen" option.

---

## File Reference

### `index.html` — Driver App
- CONFIG lines: `UNIT_NAME`, `SCRIPT_URL`
- Features: current stop view, all-stops list, navigation, photo capture, complete/skip, offline queue, GPS distance display

### `admin.html` — Supervisor Map
- CONFIG lines: `UNIT_NAME`, `SCRIPT_URL`, `MAP_CENTER`, `MAP_ZOOM`
- Features: date picker, status filter, Leaflet map with numbered markers, stats strip, route polyline, photo popups

### `Code.gs` — Apps Script
- CONFIG block: `SPREADSHEET_ID`, `ROUTES_SHEET`, `PHOTO_FOLDER_ID`, `DELIVERY_DAYS`
- Key functions: `getTodayRoute()`, `getDailySummary()`, `updateStop()`, `dailyReset()`, `testConnection()`

### `manifest.json`
- Update `"name"` and `"short_name"` if desired (displayed on phone home screen)

---

*This tool was originally built for REMC 11 and generalized for use across REMC units.*
