'use strict';

const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');
const { getInstrument } = require('../config/instruments');
const { downloadFileToPath } = require('./googleDrive');

// Canonical summary field names — every instrument's fieldMap resolves these
// to that instrument's actual CSV column names, so downstream code (routes,
// client) can keep using one consistent set of field names regardless of
// which instrument produced the row.
const CANONICAL_SUMMARY_FIELDS = [
  'unique_id_calc',
  'enumerator_name',
  'school_name',
  'emis_code',
  'caseid',
  'SubmissionDate',
  'audio_comp',
];

// Per-instrument cache: instrumentKey -> { summaries, summaryById, loadPromise, syncPromise }
// Avoids holding 1000+ columns x thousands of rows in memory per instrument —
// only summary fields are cached; full rows are streamed on demand.
const _cache = new Map();

function getState(instrumentKey) {
  if (!_cache.has(instrumentKey)) {
    _cache.set(instrumentKey, { summaries: null, summaryById: null, loadPromise: null, syncPromise: null });
  }
  return _cache.get(instrumentKey);
}

/**
 * Downloads the instrument's master data file from Drive into its local
 * csvPath (the local file is a cache — Drive is the source of truth). Memoized
 * per instrument per process, so repeated calls (getAllObservations,
 * getObservation) only trigger one download. A failed sync falls back to
 * whatever's already at csvPath rather than blocking — see ensureLoaded/
 * getObservation's own missing-file handling for what happens if nothing's
 * there either. Call refreshInstrumentData() to force a fresh sync.
 */
function syncFromDrive(instrumentConfig) {
  const state = getState(instrumentConfig.key);
  if (state.syncPromise) return state.syncPromise;

  state.syncPromise = (async () => {
    const fileId = instrumentConfig.dataFileIdEnvVar && process.env[instrumentConfig.dataFileIdEnvVar];
    const csvPath = getCsvPath(instrumentConfig);
    if (!fileId || !csvPath) return;

    try {
      await downloadFileToPath(fileId, csvPath);
      console.log(`csvLoader: synced latest data from Drive for instrument "${instrumentConfig.key}"`);
    } catch (err) {
      console.error(
        `csvLoader: Drive sync failed for instrument "${instrumentConfig.key}" — falling back to local file if present:`,
        err.message
      );
    }
  })();

  return state.syncPromise;
}

function getCsvPath(instrumentConfig) {
  const primary = instrumentConfig.csvPathEnvVar && process.env[instrumentConfig.csvPathEnvVar];
  const fallback = instrumentConfig.csvPathFallbackEnvVar && process.env[instrumentConfig.csvPathFallbackEnvVar];
  const configured = primary || fallback;
  if (!configured) return null;
  return path.resolve(__dirname, '..', configured);
}

function fieldMapFor(instrumentConfig) {
  return instrumentConfig.fieldMap || {};
}

/**
 * Syncs from Drive (if configured), then streams the instrument's CSV and
 * builds the summary cache. Called once per instrument per process;
 * subsequent calls return the resolved promise — use refreshInstrumentData()
 * to force a re-sync/re-parse mid-session. A missing/misconfigured CSV path
 * fails softly (empty list + warning) rather than rejecting, since instrument
 * selection is a first-class UI flow — one instrument not being wired up yet
 * shouldn't break the others.
 */
function ensureLoaded(instrumentConfig) {
  const state = getState(instrumentConfig.key);
  if (state.summaries !== null) return Promise.resolve();
  if (state.loadPromise) return state.loadPromise;

  state.loadPromise = (async () => {
    await syncFromDrive(instrumentConfig);

    await new Promise((resolve) => {
      const csvPath = getCsvPath(instrumentConfig);

      if (!csvPath || !fs.existsSync(csvPath)) {
        console.warn(
          `csvLoader: no CSV found for instrument "${instrumentConfig.key}" (resolved path: ${csvPath || 'unset'}) — serving an empty observation list.`
        );
        state.summaries = [];
        state.summaryById = new Map();
        return resolve();
      }

      const fieldMap = fieldMapFor(instrumentConfig);
      const idColumn = fieldMap.unique_id_calc || 'unique_id_calc';
      const summaries = [];
      const stream = fs.createReadStream(csvPath, { encoding: 'utf8' });

      Papa.parse(stream, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false,
        step(results) {
          const row = results.data;
          if (!row[idColumn]) return;
          const summary = {};
          for (const canonicalField of CANONICAL_SUMMARY_FIELDS) {
            const actualColumn = fieldMap[canonicalField] || canonicalField;
            summary[canonicalField] = row[actualColumn] || '';
          }
          summary.audio_filename_segment = extractAudioFilenameSegment(summary.audio_comp);
          summaries.push(summary);
        },
        complete() {
          state.summaries = summaries;
          state.summaryById = new Map(summaries.map((s) => [s.unique_id_calc, s]));
          console.log(`csvLoader: loaded ${summaries.length} observations for instrument "${instrumentConfig.key}"`);
          resolve();
        },
        error(err) {
          console.error(`csvLoader: failed to load CSV for instrument "${instrumentConfig.key}":`, err.message);
          state.summaries = [];
          state.summaryById = new Map();
          resolve();
        },
      });
    });
  })();

  return state.loadPromise;
}

/**
 * Forces a fresh Drive sync + re-parse for one instrument, discarding any
 * cached state. Used by the manual "refresh data" action so officers can
 * pull the latest export without waiting for a server restart.
 * Returns the number of observations loaded.
 */
async function refreshInstrumentData(instrumentKey) {
  const instrumentConfig = getInstrument(instrumentKey);
  _cache.delete(instrumentConfig.key);
  await ensureLoaded(instrumentConfig);
  return getState(instrumentConfig.key).summaries.length;
}

/**
 * Extracts the `file=` query parameter from a SurveyCTO audio_comp URL.
 * Returns null if not parseable. Instrument-agnostic — both EGRA/EGMA and
 * ASER use the same SurveyCTO "audio audit" URL shape.
 */
function extractAudioFilenameSegment(audio_comp) {
  if (!audio_comp || typeof audio_comp !== 'string') return null;
  try {
    let url;
    try { url = new URL(audio_comp); } catch { url = new URL('https://' + audio_comp); }
    const fileParam = url.searchParams.get('file');
    if (fileParam) return fileParam;
    const match = audio_comp.match(/[?&]file=([^&]+)/);
    if (match) return decodeURIComponent(match[1]);
    return null;
  } catch {
    const match = audio_comp.match(/[?&]file=([^&]+)/);
    if (match) {
      try { return decodeURIComponent(match[1]); } catch { return match[1]; }
    }
    return null;
  }
}

/**
 * Returns summary objects for all observations of one instrument (key fields
 * + audio_filename_segment, canonical field names regardless of instrument).
 */
async function getAllObservations(instrumentKey) {
  const instrumentConfig = getInstrument(instrumentKey);
  await ensureLoaded(instrumentConfig);
  return getState(instrumentConfig.key).summaries;
}

/**
 * Streams the instrument's CSV to find and return the full raw row for the
 * given unique_id_calc. Does not cache full rows — avoids the memory spike
 * from 1000+ columns x thousands of rows.
 *
 * unique_id_calc is not guaranteed unique within a CSV (confirmed duplicate
 * groups in both EGRA/EGMA and ASER data) — when audioFilenameSegment is
 * passed, it's used to disambiguate by matching the row whose audio_comp URL
 * contains that exact segment; otherwise the first matching row wins (same
 * behavior as before this change).
 */
async function getObservation(instrumentKey, uniqueIdCalc, audioFilenameSegment) {
  const instrumentConfig = getInstrument(instrumentKey);
  const fieldMap = fieldMapFor(instrumentConfig);
  const idColumn = fieldMap.unique_id_calc || 'unique_id_calc';
  const audioColumn = fieldMap.audio_comp || 'audio_comp';

  // Synced at most once per instrument per process (memoized) — cheap to call
  // even when getAllObservations has already triggered it.
  await syncFromDrive(instrumentConfig);

  return new Promise((resolve, reject) => {
    const csvPath = getCsvPath(instrumentConfig);
    if (!csvPath || !fs.existsSync(csvPath)) {
      return resolve(null);
    }

    const stream = fs.createReadStream(csvPath, { encoding: 'utf8' });
    let firstMatch = null;
    let segmentMatch = null;

    Papa.parse(stream, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
      step(results, parser) {
        const row = results.data;
        if (row[idColumn] !== uniqueIdCalc) return;
        if (!firstMatch) firstMatch = row;

        if (!audioFilenameSegment) {
          parser.abort();
          return;
        }
        const rowSegment = extractAudioFilenameSegment(row[audioColumn]);
        if (rowSegment === audioFilenameSegment) {
          segmentMatch = row;
          parser.abort();
        }
      },
      complete() {
        resolve(segmentMatch || firstMatch || null);
      },
      error(err) {
        reject(err);
      },
    });
  });
}

module.exports = {
  getAllObservations,
  getObservation,
  extractAudioFilenameSegment,
  refreshInstrumentData,
};
