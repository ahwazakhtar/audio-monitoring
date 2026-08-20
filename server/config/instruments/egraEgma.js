'use strict';

const { SECTIONS } = require('../sections');

const DISPLAY_FIELDS = [
  { key: 'unique_id_calc', label: 'Unique ID' },
  { key: 'enumerator_name', label: 'Enumerator' },
  { key: 'school_name', label: 'School' },
  { key: 'emis_code', label: 'EMIS Code' },
  { key: 'SubmissionDate', label: 'Submission Date' },
  { key: 'stu_gender', label: 'Student Gender' },
  { key: 'class_grade_a', label: 'Class / Grade' },
];

module.exports = {
  key: 'egra_egma',
  label: 'EGRA / EGMA',
  csvPathEnvVar: 'CSV_PATH_EGRA',
  csvPathFallbackEnvVar: 'CSV_PATH',
  driveFolderIdEnvVar: 'GOOGLE_DRIVE_FOLDER_ID',
  // Master data file on Drive — synced to csvPath on first load per process
  // and on manual refresh (see services/csvLoader.js). Local file is a cache.
  dataFileIdEnvVar: 'GOOGLE_DRIVE_DATA_FILE_ID_EGRA',
  idField: 'unique_id_calc',
  // Canonical summary field name -> actual CSV column name. Identity map —
  // EGRA/EGMA's CSV already uses the canonical names the rest of the app expects.
  fieldMap: {
    unique_id_calc: 'unique_id_calc',
    enumerator_name: 'enumerator_name',
    school_name: 'school_name',
    emis_code: 'emis_code',
    caseid: 'caseid',
    SubmissionDate: 'SubmissionDate',
    audio_comp: 'audio_comp',
  },
  displayFields: DISPLAY_FIELDS,
  sections: SECTIONS,
};
