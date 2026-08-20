'use strict';

const express = require('express');
const authMiddleware = require('../middleware/auth');
const { getInstrument, listInstruments } = require('../config/instruments');
const { refreshInstrumentData } = require('../services/csvLoader');

const router = express.Router();

/**
 * GET /api/instruments
 * Auth required.
 * Returns the list of available instruments: [{key, label}].
 */
router.get('/', authMiddleware, (req, res) => {
  return res.json(listInstruments());
});

/**
 * GET /api/instruments/:key/config
 * Auth required.
 * Returns the full config the client needs to render a review screen for
 * one instrument: sections, display fields, and (for grade-banded
 * instruments like ASER) the grade field/bands.
 */
router.get('/:key/config', authMiddleware, (req, res) => {
  const instrument = getInstrument(req.params.key);
  return res.json({
    key: instrument.key,
    label: instrument.label,
    sections: instrument.sections,
    displayFields: instrument.displayFields,
    gradeField: instrument.gradeField || null,
    gradeBands: instrument.gradeBands || null,
  });
});

/**
 * POST /api/instruments/:key/refresh-data
 * Auth required.
 * Forces a fresh download of this instrument's master data file from Drive
 * and re-parses it, discarding any cached observations. Lets officers pull
 * the latest export mid-session without waiting for a server restart.
 */
router.post('/:key/refresh-data', authMiddleware, async (req, res) => {
  try {
    const instrument = getInstrument(req.params.key);
    const observationCount = await refreshInstrumentData(instrument.key);
    return res.json({
      instrument: instrument.key,
      observations: observationCount,
      refreshed_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('POST /instruments/:key/refresh-data error:', err);
    return res.status(500).json({ error: err.message || 'Failed to refresh data' });
  }
});

module.exports = router;
