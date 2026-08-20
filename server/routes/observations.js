'use strict';

const express = require('express');
const authMiddleware = require('../middleware/auth');
const { getAllObservations, getObservation } = require('../services/csvLoader');
const { getInstrument } = require('../config/instruments');

const router = express.Router();

/**
 * GET /api/observations?instrument=
 * Auth required.
 * Returns an array of observation summary objects for the given instrument
 * (defaults to EGRA/EGMA if omitted, for back-compat).
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const instrument = getInstrument(req.query.instrument);
    const observations = await getAllObservations(instrument.key);
    return res.json(observations);
  } catch (err) {
    console.error('GET /observations error:', err);
    return res.status(500).json({ error: err.message || 'Failed to load observations' });
  }
});

/**
 * GET /api/observations/:id?instrument=&segment=
 * Auth required.
 * Returns the full CSV row for the given unique_id_calc. `segment` (the
 * audio_filename_segment of the file being reviewed) disambiguates when
 * unique_id_calc isn't unique within the instrument's CSV.
 */
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const instrument = getInstrument(req.query.instrument);
    const observation = await getObservation(instrument.key, id, req.query.segment || null);

    if (!observation) {
      return res.status(404).json({ error: `Observation not found: ${id}` });
    }

    return res.json(observation);
  } catch (err) {
    console.error('GET /observations/:id error:', err);
    return res.status(500).json({ error: err.message || 'Failed to load observation' });
  }
});

module.exports = router;
