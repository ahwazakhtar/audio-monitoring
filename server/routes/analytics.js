'use strict';

const express = require('express');
const authMiddleware = require('../middleware/auth');
const { getCompletedReviews } = require('../services/googleSheets');
const { getAllObservations } = require('../services/csvLoader');
const { getInstrument } = require('../config/instruments');

const router = express.Router();

function safeParseJSON(str, fallback) {
  if (!str) return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
}

/**
 * GET /api/analytics?instrument=
 * Auth required.
 * Returns aggregate stats across all completed reviews for one instrument,
 * cross-referenced with that instrument's CSV data (defaults to EGRA/EGMA
 * if omitted, for back-compat).
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const instrument = getInstrument(req.query.instrument);
    const SECTIONS = instrument.sections;

    const [allReviews, observations] = await Promise.all([
      getCompletedReviews(),
      getAllObservations(instrument.key),
    ]);

    // The Reviews tab is shared across instruments — scope to this one.
    const reviews = allReviews.filter((r) => (r.instrument || 'egra_egma') === instrument.key);

    // Build observation lookup by unique_id_calc
    const obsMap = new Map(observations.map((o) => [o.unique_id_calc, o]));

    const total_observations = observations.length;
    const total_reviewed = reviews.length;

    // ---------- Overall stats ----------
    const complianceValues = reviews
      .map((r) => parseFloat(r.overall_compliance_pct))
      .filter((v) => !isNaN(v));

    const avg_compliance =
      complianceValues.length > 0
        ? Math.round(
            (complianceValues.reduce((sum, v) => sum + v, 0) / complianceValues.length) * 10
          ) / 10
        : 0;

    const flagged_count = reviews.filter((r) => r.flagged === 'true').length;

    // ---------- By enumerator ----------
    const enumeratorMap = new Map();
    for (const review of reviews) {
      const obs = obsMap.get(review.unique_id_calc);
      const enumeratorName = obs ? obs.enumerator_name || 'Unknown' : 'Unknown';
      if (!enumeratorMap.has(enumeratorName)) {
        enumeratorMap.set(enumeratorName, { reviewed: 0, compliance: [], flagged: 0 });
      }
      const entry = enumeratorMap.get(enumeratorName);
      entry.reviewed++;
      const pct = parseFloat(review.overall_compliance_pct);
      if (!isNaN(pct)) entry.compliance.push(pct);
      if (review.flagged === 'true') entry.flagged++;
    }

    const by_enumerator = Array.from(enumeratorMap.entries())
      .map(([enumerator_name, data]) => ({
        enumerator_name,
        reviewed: data.reviewed,
        avg_compliance:
          data.compliance.length > 0
            ? Math.round(
                (data.compliance.reduce((s, v) => s + v, 0) / data.compliance.length) * 10
              ) / 10
            : 0,
        flagged: data.flagged,
      }))
      .sort((a, b) => b.reviewed - a.reviewed);

    // ---------- By school ----------
    const schoolMap = new Map();
    for (const review of reviews) {
      const obs = obsMap.get(review.unique_id_calc);
      const schoolName = obs ? obs.school_name || 'Unknown' : 'Unknown';
      if (!schoolMap.has(schoolName)) {
        schoolMap.set(schoolName, { reviewed: 0, compliance: [], flagged: 0 });
      }
      const entry = schoolMap.get(schoolName);
      entry.reviewed++;
      const pct = parseFloat(review.overall_compliance_pct);
      if (!isNaN(pct)) entry.compliance.push(pct);
      if (review.flagged === 'true') entry.flagged++;
    }

    const by_school = Array.from(schoolMap.entries())
      .map(([school_name, data]) => ({
        school_name,
        reviewed: data.reviewed,
        avg_compliance:
          data.compliance.length > 0
            ? Math.round(
                (data.compliance.reduce((s, v) => s + v, 0) / data.compliance.length) * 10
              ) / 10
            : 0,
        flagged: data.flagged,
      }))
      .sort((a, b) => b.reviewed - a.reviewed);

    // ---------- By section ----------
    // For each section, aggregate the compliance of items in that section across all reviews
    const sectionStats = {};
    for (const sectionKey of Object.keys(SECTIONS)) {
      sectionStats[sectionKey] = { totalItems: 0, correctItems: 0, reviewCount: 0 };
    }

    for (const review of reviews) {
      const verdicts = safeParseJSON(review.verdicts_json, {});
      for (const sectionKey of Object.keys(verdicts)) {
        if (!sectionStats[sectionKey]) continue;
        const sectionVerdicts = verdicts[sectionKey];
        if (!sectionVerdicts || typeof sectionVerdicts !== 'object') continue;

        let sectionTotal = 0;
        let sectionCorrect = 0;
        for (const verdict of Object.values(sectionVerdicts)) {
          if (verdict === 'correct' || verdict === 'incorrect') {
            sectionTotal++;
            if (verdict === 'correct') sectionCorrect++;
          }
        }
        if (sectionTotal > 0) {
          sectionStats[sectionKey].totalItems += sectionTotal;
          sectionStats[sectionKey].correctItems += sectionCorrect;
          sectionStats[sectionKey].reviewCount++;
        }
      }
    }

    const by_section = Object.entries(SECTIONS).map(([sectionKey, sectionDef]) => {
      const stats = sectionStats[sectionKey];
      const avg_compliance =
        stats.totalItems > 0
          ? Math.round((stats.correctItems / stats.totalItems) * 1000) / 10
          : null;
      return {
        section: sectionKey,
        label: sectionDef.label,
        group: sectionDef.group,
        review_count: stats.reviewCount,
        avg_compliance,
      };
    });

    // ---------- By reviewer ----------
    const reviewerMap = new Map();
    for (const review of reviews) {
      const name = review.reviewer || 'Unknown';
      if (!reviewerMap.has(name)) {
        reviewerMap.set(name, { reviewed: 0, compliance: [], flagged: 0 });
      }
      const entry = reviewerMap.get(name);
      entry.reviewed++;
      const pct = parseFloat(review.overall_compliance_pct);
      if (!isNaN(pct)) entry.compliance.push(pct);
      if (review.flagged === 'true') entry.flagged++;
    }

    const by_reviewer = Array.from(reviewerMap.entries())
      .map(([reviewer, data]) => ({
        reviewer,
        reviewed: data.reviewed,
        avg_compliance:
          data.compliance.length > 0
            ? Math.round(
                (data.compliance.reduce((s, v) => s + v, 0) / data.compliance.length) * 10
              ) / 10
            : 0,
        flagged: data.flagged,
      }))
      .sort((a, b) => b.reviewed - a.reviewed);

    // ---------- Flagged observations ----------
    const flagged_observations = reviews
      .filter((r) => r.flagged === 'true')
      .map((r) => {
        const obs = obsMap.get(r.unique_id_calc);
        return {
          review_id: r.review_id,
          unique_id_calc: r.unique_id_calc,
          audio_filename: r.audio_filename,
          reviewer: r.reviewer,
          review_timestamp: r.review_timestamp,
          overall_compliance_pct: parseFloat(r.overall_compliance_pct) || 0,
          overall_comment: r.overall_comment,
          enumerator_name: obs ? obs.enumerator_name || '' : '',
          school_name: obs ? obs.school_name || '' : '',
          emis_code: obs ? obs.emis_code || '' : '',
        };
      });

    return res.json({
      total_observations,
      total_reviewed,
      avg_compliance,
      flagged_count,
      by_enumerator,
      by_school,
      by_section,
      by_reviewer,
      flagged_observations,
    });
  } catch (err) {
    console.error('GET /analytics error:', err);
    return res.status(500).json({ error: err.message || 'Failed to compute analytics' });
  }
});

module.exports = router;
