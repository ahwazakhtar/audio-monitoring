'use strict';

const { google } = require('googleapis');
const { getAuth } = require('./googleAuth');

const SHEET_ID = process.env.GOOGLE_SHEET_ID;

// Tab names
const REVIEWS_TAB = 'Reviews';
const CLAIMS_TAB = 'Claims';

// Column definitions (order matters — this is what gets written to the sheet)
// `instrument` is appended (not inserted) so existing data rows stay aligned
// with the new header; legacy rows written before this column existed are
// treated as 'egra_egma' wherever they're read back (see getSessionState).
const REVIEWS_HEADERS = [
  'review_id',
  'unique_id_calc',
  'audio_filename',
  'reviewer',
  'review_timestamp',
  'status',
  'sections_reviewed',
  'overall_compliance_pct',
  'flagged',
  'overall_comment',
  'verdicts_json',
  'comments_json',
  'instrument',
];

const CLAIMS_HEADERS = [
  'unique_id_calc',
  'audio_filename',
  'audio_file_id',
  'reviewer',
  'claimed_at',
  'status',
  'draft_data_json', // extra column for draft state
  'instrument',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getSheetsClient() {
  const auth = getAuth();
  const client = await auth.getClient();
  return google.sheets({ version: 'v4', auth: client });
}

/**
 * Returns the meta for all sheets in the spreadsheet.
 */
async function getSheetsMeta(sheets) {
  const resp = await sheets.spreadsheets.get({
    spreadsheetId: SHEET_ID,
    fields: 'sheets.properties',
  });
  return resp.data.sheets.map((s) => s.properties);
}

/**
 * Creates a new tab with the given title.
 */
async function createTab(sheets, title) {
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [
        {
          addSheet: {
            properties: { title },
          },
        },
      ],
    },
  });
}

/**
 * Reads all values from a tab. Returns [] if tab is empty.
 */
async function readTab(sheets, tabName) {
  try {
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${tabName}`,
    });
    return resp.data.values || [];
  } catch (err) {
    if (err.code === 400 || err.code === 404) return [];
    throw err;
  }
}

/**
 * Converts a 2-D array (rows × cols) to an array of objects using the first
 * row as headers. Missing cells become empty strings.
 */
function rowsToObjects(rows) {
  if (!rows || rows.length < 1) return [];
  const headers = rows[0];
  return rows.slice(1).map((row) => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = row[i] !== undefined ? row[i] : '';
    });
    return obj;
  });
}

/**
 * Converts an object to a row array in the order of `headers`.
 */
function objectToRow(obj, headers) {
  return headers.map((h) => (obj[h] !== undefined && obj[h] !== null ? String(obj[h]) : ''));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Ensures both the Reviews and Claims tabs exist and have correct header rows.
 * Safe to call on every startup.
 */
async function ensureSheetSetup() {
  const sheets = await getSheetsClient();
  const sheetsMeta = await getSheetsMeta(sheets);
  const existingTitles = sheetsMeta.map((s) => s.title);

  // Create missing tabs
  for (const tabName of [REVIEWS_TAB, CLAIMS_TAB]) {
    if (!existingTitles.includes(tabName)) {
      console.log(`Creating missing sheet tab: ${tabName}`);
      await createTab(sheets, tabName);
    }
  }

  // Ensure header rows exist
  const tabConfig = [
    { name: REVIEWS_TAB, headers: REVIEWS_HEADERS },
    { name: CLAIMS_TAB, headers: CLAIMS_HEADERS },
  ];

  for (const { name, headers } of tabConfig) {
    const rows = await readTab(sheets, name);
    // Full-array comparison — a positional check (e.g. rows[0][0] !== headers[0])
    // would never notice a trailing column (like `instrument`) being added.
    if (rows.length === 0 || JSON.stringify(rows[0]) !== JSON.stringify(headers)) {
      // Write header row at A1. Existing data rows are untouched — appending
      // a header is safe; it just means those rows read back with the new
      // trailing column(s) empty until rewritten.
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${name}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: [headers] },
      });
      console.log(`Wrote header row for tab: ${name}`);
    }
  }
}

/**
 * Returns the current session state:
 *   completed: unique_id_calcs with a "complete" review
 *   claimed:   active claim records
 *   drafts:    claim records with status "draft"
 */
async function getSessionState() {
  const sheets = await getSheetsClient();

  const [reviewRows, claimRows] = await Promise.all([
    readTab(sheets, REVIEWS_TAB),
    readTab(sheets, CLAIMS_TAB),
  ]);

  const reviews = rowsToObjects(reviewRows);
  const claims = rowsToObjects(claimRows);

  const completed = reviews
    .filter((r) => r.status === 'complete')
    .map((r) => ({
      unique_id_calc: r.unique_id_calc,
      audio_filename: r.audio_filename,
      reviewer: r.reviewer,
      review_timestamp: r.review_timestamp,
      instrument: r.instrument || 'egra_egma', // back-compat for rows written before this column existed
    }));

  const claimed = claims
    .filter((c) => c.status === 'claimed')
    .map((c) => ({
      unique_id_calc: c.unique_id_calc,
      reviewer: c.reviewer,
      audio_filename: c.audio_filename,
      audio_file_id: c.audio_file_id,
      claimed_at: c.claimed_at,
      instrument: c.instrument || 'egra_egma',
    }));

  const drafts = claims
    .filter((c) => c.status === 'draft')
    .map((c) => ({
      unique_id_calc: c.unique_id_calc,
      reviewer: c.reviewer,
      audio_filename: c.audio_filename,
      audio_file_id: c.audio_file_id,
      claimed_at: c.claimed_at,
      instrument: c.instrument || 'egra_egma',
      draft_data: c.draft_data_json ? (() => {
        try { return JSON.parse(c.draft_data_json); } catch { return null; }
      })() : null,
    }));

  return { completed, claimed, drafts };
}

/**
 * Returns all complete review rows as objects.
 */
async function getCompletedReviews() {
  const sheets = await getSheetsClient();
  const rows = await readTab(sheets, REVIEWS_TAB);
  return rowsToObjects(rows).filter((r) => r.status === 'complete');
}

/**
 * Returns the complete review row for a given audio_filename, or null if not found.
 */
async function getReviewByFilename(audio_filename) {
  const all = await getCompletedReviews();
  return all.find((r) => r.audio_filename === audio_filename) || null;
}

/**
 * Appends a new row to the Reviews tab.
 */
async function appendReview(reviewData) {
  const sheets = await getSheetsClient();
  const row = objectToRow(reviewData, REVIEWS_HEADERS);
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${REVIEWS_TAB}!A1`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] },
  });
}

/**
 * Finds the 1-based row index of a claim by audio_filename (the true
 * per-submission key — unique_id_calc has confirmed duplicate groups within
 * a single instrument's CSV, so it can't be used to identify one claim).
 * Returns -1 if not found. Accounts for the header row (row 1 = headers, row 2 = first data row).
 */
async function findClaimRowIndex(sheets, audio_filename) {
  const rows = await readTab(sheets, CLAIMS_TAB);
  if (rows.length < 2) return -1;
  const colIndex = rows[0].indexOf('audio_filename');
  if (colIndex === -1) return -1;
  // rows[0] = headers, rows[1..] = data; sheet row index = array index + 1
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][colIndex] === audio_filename) {
      return i + 1; // 1-based sheet row
    }
  }
  return -1;
}

/**
 * Upserts a claim row in the Claims tab.
 * If a row with the same audio_filename exists, update it; otherwise append.
 */
async function upsertClaim(claimData) {
  const sheets = await getSheetsClient();
  const existingRowIndex = await findClaimRowIndex(sheets, claimData.audio_filename);
  const row = objectToRow(claimData, CLAIMS_HEADERS);

  if (existingRowIndex === -1) {
    // Append new row
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${CLAIMS_TAB}!A1`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    });
  } else {
    // Update existing row
    const colEnd = String.fromCharCode(64 + CLAIMS_HEADERS.length); // A=65, so offset by 1
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${CLAIMS_TAB}!A${existingRowIndex}:${colEnd}${existingRowIndex}`,
      valueInputOption: 'RAW',
      requestBody: { values: [row] },
    });
  }
}

/**
 * Returns a single claim object by audio_filename, or null if not found.
 */
async function getClaim(audio_filename) {
  const sheets = await getSheetsClient();
  const rows = await readTab(sheets, CLAIMS_TAB);
  const objects = rowsToObjects(rows);
  return objects.find((c) => c.audio_filename === audio_filename) || null;
}

/**
 * Deletes a claim row from the Claims tab by audio_filename.
 * Returns true if deleted, false if not found.
 */
async function deleteClaim(audio_filename) {
  const sheets = await getSheetsClient();

  // Get the sheet's internal ID (sheetId) for the Claims tab
  const sheetsMeta = await getSheetsMeta(sheets);
  const claimsSheet = sheetsMeta.find((s) => s.title === CLAIMS_TAB);
  if (!claimsSheet) return false;

  const claimsSheetId = claimsSheet.sheetId;
  const rowIndex = await findClaimRowIndex(sheets, audio_filename);
  if (rowIndex === -1) return false;

  // Delete the row using batchUpdate (0-based start index)
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId: claimsSheetId,
              dimension: 'ROWS',
              startIndex: rowIndex - 1, // 0-based
              endIndex: rowIndex,       // exclusive
            },
          },
        },
      ],
    },
  });

  return true;
}

module.exports = {
  ensureSheetSetup,
  getSessionState,
  getCompletedReviews,
  getReviewByFilename,
  appendReview,
  upsertClaim,
  deleteClaim,
  getClaim,
};
