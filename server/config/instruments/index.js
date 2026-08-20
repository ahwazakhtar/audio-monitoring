'use strict';

const egraEgma = require('./egraEgma');
const aser = require('./aser');

const INSTRUMENTS = {
  [egraEgma.key]: egraEgma,
  [aser.key]: aser,
};

const DEFAULT_INSTRUMENT_KEY = egraEgma.key;

/**
 * Resolves an instrument config by key. Falls back to the default (EGRA/EGMA)
 * for back-compat when key is missing/unknown, so existing callers that don't
 * pass ?instrument= keep working exactly as before this change.
 */
function getInstrument(key) {
  return INSTRUMENTS[key] || INSTRUMENTS[DEFAULT_INSTRUMENT_KEY];
}

function listInstruments() {
  return Object.values(INSTRUMENTS).map((i) => ({ key: i.key, label: i.label }));
}

module.exports = { INSTRUMENTS, DEFAULT_INSTRUMENT_KEY, getInstrument, listInstruments };
