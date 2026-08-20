'use strict';

const express = require('express');
const authMiddleware = require('../middleware/auth');
const { listAudioFiles, streamFile } = require('../services/googleDrive');
const { getAllObservations, extractAudioFilenameSegment } = require('../services/csvLoader');
const { getSessionState } = require('../services/googleSheets');
const { getInstrument } = require('../config/instruments');

const router = express.Router();

/**
 * GET /api/audio/files?instrument=
 * Auth required.
 * Lists all files in the instrument's Drive folder and attempts to match
 * each to an observation in that instrument's CSV.
 *
 * Matching logic:
 *   Drive filename.contains(audio_filename_segment extracted from audio_comp)
 */
router.get('/files', authMiddleware, async (req, res) => {
  try {
    const instrument = getInstrument(req.query.instrument);
    const folderId = process.env[instrument.driveFolderIdEnvVar];

    const [driveFiles, observations, sessionState] = await Promise.all([
      listAudioFiles(folderId),
      getAllObservations(instrument.key),
      getSessionState(),
    ]);

    // Scope session state to this instrument (defense in depth — the shared
    // Reviews/Claims tabs hold rows for every instrument).
    const drafts = (sessionState.drafts || []).filter((d) => (d.instrument || 'egra_egma') === instrument.key);
    const completed = (sessionState.completed || []).filter((r) => (r.instrument || 'egra_egma') === instrument.key);
    const claimed = (sessionState.claimed || []).filter((c) => (c.instrument || 'egra_egma') === instrument.key);

    // Claims/reviews are keyed by audio_filename — the true per-submission
    // key (unique_id_calc has confirmed duplicate groups within a CSV).
    const draftMap = new Map();
    for (const draft of drafts) {
      if (draft.audio_filename) draftMap.set(draft.audio_filename, draft.draft_data);
    }
    const completedMap = new Map(completed.map((r) => [r.audio_filename, r]));
    const claimedMap = new Map(claimed.map((c) => [c.audio_filename, c]));

    // Build a lookup: audio_filename_segment -> unique_id_calc
    // (segment is the "AA_<UUID>_enumerator.m4a" part)
    const segmentMap = new Map();
    for (const obs of observations) {
      if (obs.audio_filename_segment) {
        segmentMap.set(obs.audio_filename_segment, obs.unique_id_calc);
      }
    }

    // Build a lookup: unique_id_calc -> observation summary (for school_name)
    const obsMap = new Map();
    for (const obs of observations) {
      obsMap.set(obs.unique_id_calc, obs);
    }

    const result = driveFiles.map((file) => {
      let unique_id_calc = null;

      for (const [segment, uid] of segmentMap.entries()) {
        if (file.filename.includes(segment)) {
          unique_id_calc = uid;
          break;
        }
      }

      const obs = unique_id_calc ? obsMap.get(unique_id_calc) : null;
      const completedReview = completedMap.get(file.filename);
      const claim = claimedMap.get(file.filename);

      const status = completedReview
        ? 'complete'
        : draftMap.has(file.filename)
        ? 'draft'
        : claim
        ? 'claimed'
        : 'available';

      return {
        audio_file_id: file.fileId,
        audio_filename: file.filename,
        unique_id_calc,
        school_name: obs ? obs.school_name : null,
        enumerator_name: obs ? obs.enumerator_name : null,
        mimeType: file.mimeType,
        size: file.size,
        status,
        draft_data: draftMap.get(file.filename) || null,
        reviewer: completedReview ? completedReview.reviewer : null,
        review_timestamp: completedReview ? completedReview.review_timestamp : null,
      };
    });

    return res.json(result);
  } catch (err) {
    console.error('GET /audio/files error:', err);
    return res.status(500).json({ error: err.message || 'Failed to list audio files' });
  }
});

/**
 * GET /api/audio/stream/:fileId
 * Auth via query param ?token=<jwt> (so it can be used as <audio src="...">).
 * Streams the audio file from Drive with Range request support.
 */
router.get('/stream/:fileId', authMiddleware, async (req, res) => {
  try {
    const { fileId } = req.params;
    const rangeHeader = req.headers['range'] || null;

    await streamFile(fileId, res, rangeHeader);
  } catch (err) {
    console.error('GET /audio/stream/:fileId error:', err);
    if (!res.headersSent) {
      return res.status(500).json({ error: err.message || 'Failed to stream audio file' });
    }
  }
});

module.exports = router;
