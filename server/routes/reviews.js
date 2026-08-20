'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const authMiddleware = require('../middleware/auth');
const {
  getSessionState,
  appendReview,
  upsertClaim,
  deleteClaim,
  getClaim,
  getCompletedReviews,
  getReviewByFilename,
} = require('../services/googleSheets');

const router = express.Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Calculates overall compliance percentage from a verdicts object.
 * verdicts = { sectionKey: { itemKey: "correct" | "incorrect" | "skip", ... }, ... }
 * Returns a number 0-100 rounded to 1 decimal place.
 */
function calculateCompliance(verdicts) {
  if (!verdicts || typeof verdicts !== 'object') return 0;

  let totalItems = 0;
  let correctItems = 0;

  for (const sectionKey of Object.keys(verdicts)) {
    const sectionVerdicts = verdicts[sectionKey];
    if (!sectionVerdicts || typeof sectionVerdicts !== 'object') continue;

    for (const itemKey of Object.keys(sectionVerdicts)) {
      const verdict = sectionVerdicts[itemKey];
      // Only count non-skipped items
      if (verdict === 'correct' || verdict === 'incorrect') {
        totalItems++;
        if (verdict === 'correct') correctItems++;
      }
    }
  }

  if (totalItems === 0) return 0;
  return Math.round((correctItems / totalItems) * 1000) / 10; // round to 1 decimal
}

// ---------------------------------------------------------------------------
// GET /api/session
// ---------------------------------------------------------------------------

/**
 * GET /api/session
 * Auth required.
 * Returns current session state: completed reviews, active claims, drafts.
 */
router.get('/session', authMiddleware, async (req, res) => {
  try {
    const state = await getSessionState();
    return res.json(state);
  } catch (err) {
    console.error('GET /session error:', err);
    return res.status(500).json({ error: err.message || 'Failed to get session state' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/claim
// ---------------------------------------------------------------------------

/**
 * POST /api/claim
 * Auth required.
 * Body: { unique_id_calc, audio_filename, audio_file_id, instrument }
 */
router.post('/claim', authMiddleware, async (req, res) => {
  try {
    const { unique_id_calc, audio_filename, audio_file_id, instrument } = req.body;
    const reviewer = req.user.username;
    const instrumentKey = instrument || 'egra_egma';

    if (!unique_id_calc || !audio_filename || !audio_file_id) {
      return res.status(400).json({
        error: 'unique_id_calc, audio_filename, and audio_file_id are required',
      });
    }

    // Check if already claimed or completed. Keyed by audio_filename — the
    // true per-submission key (unique_id_calc has confirmed duplicate groups
    // within a CSV, so it can't reliably identify one physical recording).
    const state = await getSessionState();

    const alreadyCompleted = state.completed.find((c) => c.audio_filename === audio_filename);
    if (alreadyCompleted) {
      return res.status(409).json({ error: 'This observation has already been completed' });
    }

    const existingClaim = state.claimed.find((c) => c.audio_filename === audio_filename);
    if (existingClaim) {
      return res.status(409).json({
        error: `This observation is already claimed by ${existingClaim.reviewer}`,
      });
    }

    const existingDraft = state.drafts.find((c) => c.audio_filename === audio_filename);
    if (existingDraft) {
      return res.status(409).json({
        error: `This observation has a draft in progress by ${existingDraft.reviewer}`,
      });
    }

    const claimRecord = {
      unique_id_calc,
      audio_filename,
      audio_file_id,
      reviewer,
      claimed_at: new Date().toISOString(),
      status: 'claimed',
      draft_data_json: '',
      instrument: instrumentKey,
    };

    await upsertClaim(claimRecord);

    return res.status(201).json(claimRecord);
  } catch (err) {
    console.error('POST /claim error:', err);
    return res.status(500).json({ error: err.message || 'Failed to create claim' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/claim/:audio_filename
// ---------------------------------------------------------------------------

/**
 * DELETE /api/claim/:audio_filename
 * Auth required. Only the owning reviewer can delete their claim.
 */
router.delete('/claim/:audio_filename', authMiddleware, async (req, res) => {
  try {
    const { audio_filename } = req.params;
    const reviewer = req.user.username;

    const claim = await getClaim(audio_filename);
    if (!claim) {
      return res.status(404).json({ error: 'Claim not found' });
    }

    if (claim.reviewer !== reviewer) {
      return res.status(403).json({ error: 'You can only delete your own claims' });
    }

    await deleteClaim(audio_filename);
    return res.json({ success: true, audio_filename });
  } catch (err) {
    console.error('DELETE /claim/:audio_filename error:', err);
    return res.status(500).json({ error: err.message || 'Failed to delete claim' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/reviews
// ---------------------------------------------------------------------------

/**
 * POST /api/reviews
 * Auth required.
 * Body: {
 *   unique_id_calc, audio_filename, status ("draft"|"complete"),
 *   sections_reviewed, verdicts, section_comments, overall_comment
 * }
 */
router.post('/reviews', authMiddleware, async (req, res) => {
  try {
    const {
      unique_id_calc,
      audio_filename,
      status,
      instrument,
      sections_reviewed = [],
      verdicts = {},
      section_comments = {},
      overall_comment = '',
    } = req.body;

    const reviewer = req.user.username;
    const instrumentKey = instrument || 'egra_egma';

    if (!unique_id_calc || !audio_filename) {
      return res.status(400).json({ error: 'unique_id_calc and audio_filename are required' });
    }

    if (!['draft', 'complete'].includes(status)) {
      return res.status(400).json({ error: 'status must be "draft" or "complete"' });
    }

    // Calculate compliance
    const overall_compliance_pct = calculateCompliance(verdicts);
    const flagged = overall_compliance_pct < 85;

    const review_timestamp = new Date().toISOString();

    if (status === 'draft') {
      // Upsert a draft into the Claims tab (keyed by audio_filename)
      const existingClaim = await getClaim(audio_filename);
      const claimed_at = existingClaim ? existingClaim.claimed_at : review_timestamp;
      const audio_file_id = existingClaim ? existingClaim.audio_file_id : '';

      const draftData = {
        sections_reviewed,
        verdicts,
        section_comments,
        overall_comment,
        overall_compliance_pct,
        flagged,
        updated_at: review_timestamp,
      };

      const claimRecord = {
        unique_id_calc,
        audio_filename,
        audio_file_id,
        reviewer,
        claimed_at,
        status: 'draft',
        draft_data_json: JSON.stringify(draftData),
        instrument: instrumentKey,
      };

      await upsertClaim(claimRecord);

      return res.json({
        unique_id_calc,
        audio_filename,
        reviewer,
        status: 'draft',
        instrument: instrumentKey,
        overall_compliance_pct,
        flagged,
        sections_reviewed,
        verdicts,
        section_comments,
        overall_comment,
        updated_at: review_timestamp,
      });
    }

    // status === 'complete'
    const review_id = uuidv4();

    const reviewRow = {
      review_id,
      unique_id_calc,
      audio_filename,
      reviewer,
      review_timestamp,
      status: 'complete',
      sections_reviewed: sections_reviewed.join(','),
      overall_compliance_pct,
      flagged: flagged ? 'true' : 'false',
      overall_comment,
      verdicts_json: JSON.stringify(verdicts),
      comments_json: JSON.stringify(section_comments),
      instrument: instrumentKey,
    };

    // Append to Reviews tab and remove from Claims tab (in parallel, both
    // keyed by audio_filename)
    await Promise.all([
      appendReview(reviewRow),
      deleteClaim(audio_filename),
    ]);

    return res.status(201).json({
      review_id,
      unique_id_calc,
      audio_filename,
      reviewer,
      review_timestamp,
      status: 'complete',
      instrument: instrumentKey,
      sections_reviewed,
      overall_compliance_pct,
      flagged,
      overall_comment,
      verdicts,
      section_comments,
    });
  } catch (err) {
    console.error('POST /reviews error:', err);
    return res.status(500).json({ error: err.message || 'Failed to save review' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/reviews/by-file/:audio_filename
// ---------------------------------------------------------------------------

/**
 * GET /api/reviews/by-file/:audio_filename
 * Auth required.
 * Returns the completed review row for a specific audio file, with verdicts
 * and comments parsed back into objects for form restoration.
 */
router.get('/reviews/by-file/:audio_filename', authMiddleware, async (req, res) => {
  try {
    const { audio_filename } = req.params;
    const review = await getReviewByFilename(audio_filename);
    if (!review) {
      return res.status(404).json({ error: 'No completed review found for this file' });
    }
    return res.json({
      ...review,
      sections_reviewed: review.sections_reviewed
        ? review.sections_reviewed.split(',').filter(Boolean)
        : [],
      verdicts: safeParseJSON(review.verdicts_json, {}),
      section_comments: safeParseJSON(review.comments_json, {}),
      flagged: review.flagged === 'true',
      overall_compliance_pct: parseFloat(review.overall_compliance_pct) || 0,
    });
  } catch (err) {
    console.error('GET /reviews/by-file error:', err);
    return res.status(500).json({ error: err.message || 'Failed to load review' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/reviews/mine
// ---------------------------------------------------------------------------

/**
 * GET /api/reviews/mine
 * Auth required.
 * Returns all complete reviews + drafts belonging to the current user.
 */
router.get('/reviews/mine', authMiddleware, async (req, res) => {
  try {
    const reviewer = req.user.username;
    const [state, allReviews] = await Promise.all([
      getSessionState(),
      getCompletedReviews(),
    ]);
    const myCompleted = allReviews
      .filter((r) => r.reviewer === reviewer)
      .map((r) => ({
        ...r,
        sections_reviewed: r.sections_reviewed
          ? r.sections_reviewed.split(',').filter(Boolean)
          : [],
        verdicts: safeParseJSON(r.verdicts_json, {}),
        section_comments: safeParseJSON(r.comments_json, {}),
        flagged: r.flagged === 'true',
        overall_compliance_pct: parseFloat(r.overall_compliance_pct) || 0,
      }));

    const myDrafts = state.drafts
      .filter((d) => d.reviewer === reviewer)
      .map((d) => ({
        unique_id_calc: d.unique_id_calc,
        audio_filename: d.audio_filename,
        reviewer: d.reviewer,
        status: 'draft',
        ...(d.draft_data || {}),
      }));

    return res.json({ completed: myCompleted, drafts: myDrafts });
  } catch (err) {
    console.error('GET /reviews/mine error:', err);
    return res.status(500).json({ error: err.message || 'Failed to load reviews' });
  }
});

function safeParseJSON(str, fallback) {
  if (!str) return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
}

module.exports = router;
