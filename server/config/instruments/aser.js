'use strict';

// ASER section/item grouping is a first pass drawn directly from the ASER
// XLSForm's own begin_group boundaries (Urdu/English/Math/GK x Grade 1-3/4-5).
// The Grade 4-5 groups are NOT a clean rename-mirror of the Grade 1-3 groups —
// several G4-5 items (masculine/feminine, grammar, extra comprehension
// questions) have no G1-3 counterpart — so this grouping should get a quick
// domain sign-off before being treated as final.

const GRADE_BANDS = {
  '1-3': [1, 2, 3],
  '4-5': [4, 5],
};

const SECTIONS = {
  aser_ud_g1_3: {
    label: 'Urdu Reading (Grade 1-3)',
    group: 'Urdu',
    gradeBand: '1-3',
    items: [
      'ud_read_5_letters',
      'ud_read_5_words',
      'ud_sentence_fluency',
      'ud_read_story_fluency',
      'ud_comprehension_q1',
      'ud_comprehension_q2',
    ],
    verifyFields: [
      { key: 'ud_read_5_letters', label: '5 Letters Read Correctly (count)' },
      { key: 'ud_read_5_words', label: '5 Words Read Correctly (count)' },
      { key: 'ud_sentence_fluency', label: 'Sentence Fluency' },
      { key: 'ud_read_story_fluency', label: 'Story Fluency' },
      { key: 'ud_comprehension_q1', label: 'Comprehension Q1' },
      { key: 'ud_comprehension_q2', label: 'Comprehension Q2' },
    ],
  },
  aser_eng_g1_3: {
    label: 'English Reading (Grade 1-3)',
    group: 'English',
    gradeBand: '1-3',
    items: ['eng_5_small_letters', 'eng_5_capital_letters', 'eng_5_words', 'eng_sentence_fluency'],
    verifyFields: [
      { key: 'eng_5_small_letters', label: '5 Small Letters Read (count)' },
      { key: 'eng_5_capital_letters', label: '5 Capital Letters Read (count)' },
      { key: 'eng_5_words', label: '5 Words Read (count)' },
      { key: 'eng_sentence_fluency', label: 'Sentence Fluency' },
    ],
  },
  aser_maths_g1_3: {
    label: 'Math (Grade 1-3)',
    group: 'Math',
    gradeBand: '1-3',
    items: [
      'maths_minus_2digit',
      'maths_minus_3digit',
      'maths_5_numbers_100_200',
      'maths_5_numbers_10_99',
      'maths_5_numbers_1_9',
      'maths_1_division',
      'maths_time',
      'maths_word_problem',
      'maths_shape_name',
    ],
    verifyFields: [
      { key: 'maths_minus_2digit', label: '2-digit Subtraction' },
      { key: 'maths_minus_3digit', label: '3-digit Subtraction' },
      { key: 'maths_5_numbers_100_200', label: '5 Numbers (100-200) Read' },
      { key: 'maths_5_numbers_10_99', label: '5 Numbers (10-99) Read' },
      { key: 'maths_5_numbers_1_9', label: '5 Numbers (1-9) Read' },
      { key: 'maths_1_division', label: 'Division Problem' },
      { key: 'maths_time', label: 'Tell Time' },
      { key: 'maths_word_problem', label: 'Word Problem' },
      { key: 'maths_shape_name', label: 'Shape Naming' },
    ],
  },
  aser_gk_g1_3: {
    label: 'General Knowledge (Grade 1-3)',
    group: 'General Knowledge',
    gradeBand: '1-3',
    items: [
      'gk_picture_action_word_01',
      'gk_picture_action_word_02',
      'gk_picture_word_01',
      'gk_picture_word_02',
      'gk_picture_word_03',
    ],
    verifyFields: [
      { key: 'gk_picture_action_word_01', label: 'Picture Q1: Action Word' },
      { key: 'gk_picture_action_word_02', label: 'Picture Q2: Action Word' },
      { key: 'gk_picture_word_01', label: 'Complete the Sentence #1' },
      { key: 'gk_picture_word_02', label: 'Complete the Sentence #2' },
      { key: 'gk_picture_word_03', label: 'Complete the Sentence #3' },
    ],
  },
  aser_ud_g4_5: {
    label: 'Urdu Reading (Grade 4-5)',
    group: 'Urdu',
    gradeBand: '4-5',
    items: [
      'ud_story_fluency_G4_5',
      'ud_comprehension_G4_5_q1',
      'ud_comprehension_G4_5_q2',
      'ud_read_5_letters_G4_5',
      'ud_read_5_words_G4_5',
      'ud_sentence_fluency_G4_5',
      'ud_read_story_fluency_G4_5',
      'ud_comprehension_q1_G4_5',
      'ud_comprehension_q2_G4_5',
      'masculine_feminine_G4_5_q1',
      'masculine_feminine_G4_5_q2',
      'grammar_G4_5',
      'word_sentences_G4_5',
    ],
    verifyFields: [
      { key: 'ud_story_fluency_G4_5', label: 'Story Fluency' },
      { key: 'ud_comprehension_G4_5_q1', label: 'Comprehension Q1' },
      { key: 'ud_comprehension_G4_5_q2', label: 'Comprehension Q2' },
      { key: 'ud_read_5_letters_G4_5', label: '5 Letters Read Correctly (count) — Grade 1-3 fallback' },
      { key: 'ud_read_5_words_G4_5', label: '5 Words Read Correctly (count) — Grade 1-3 fallback' },
      { key: 'ud_sentence_fluency_G4_5', label: 'Sentence Fluency — Grade 1-3 fallback' },
      { key: 'ud_read_story_fluency_G4_5', label: 'Story Fluency — Grade 1-3 fallback' },
      { key: 'ud_comprehension_q1_G4_5', label: 'Comprehension Q1 — Grade 1-3 fallback' },
      { key: 'ud_comprehension_q2_G4_5', label: 'Comprehension Q2 — Grade 1-3 fallback' },
      { key: 'masculine_feminine_G4_5_q1', label: 'Masculine/Feminine Q1' },
      { key: 'masculine_feminine_G4_5_q2', label: 'Masculine/Feminine Q2' },
      { key: 'grammar_G4_5', label: 'Grammar (Object Identification)' },
      { key: 'word_sentences_G4_5', label: 'Words into Sentences (count)' },
    ],
  },
  aser_eng_g4_5: {
    label: 'English Reading (Grade 4-5)',
    group: 'English',
    gradeBand: '4-5',
    items: [
      'eng_read_sentences_G4_5_set1',
      'eng_read_sentences_G4_5_set2',
      'eng_5_small_letters_G4_5',
      'eng_5_capital_letters_G4_5',
      'eng_5_words_G4_5',
      'eng_sentence_fluency_G4_5',
      'eng_read_story_fluency_G4_5',
      'eng_comprehension_1',
      'eng_comprehension_2',
      'eng_comprehension_3',
      'eng_comprehension_4',
    ],
    verifyFields: [
      { key: 'eng_read_sentences_G4_5_set1', label: 'Sentence Set 1 Fluency' },
      { key: 'eng_read_sentences_G4_5_set2', label: 'Sentence Set 2 Fluency' },
      { key: 'eng_5_small_letters_G4_5', label: '5 Small Letters Read (count) — Grade 1-3 fallback' },
      { key: 'eng_5_capital_letters_G4_5', label: '5 Capital Letters Read (count) — Grade 1-3 fallback' },
      { key: 'eng_5_words_G4_5', label: '5 Words Read (count) — Grade 1-3 fallback' },
      { key: 'eng_sentence_fluency_G4_5', label: 'Sentence Fluency — Grade 1-3 fallback' },
      { key: 'eng_read_story_fluency_G4_5', label: 'Story/Passage Fluency' },
      { key: 'eng_comprehension_1', label: 'Comprehension Q1' },
      { key: 'eng_comprehension_2', label: 'Comprehension Q2' },
      { key: 'eng_comprehension_3', label: 'Comprehension Q3' },
      { key: 'eng_comprehension_4', label: 'Comprehension Q4' },
    ],
  },
  aser_maths_g4_5: {
    label: 'Math (Grade 4-5)',
    group: 'Math',
    gradeBand: '4-5',
    items: [
      'maths_minus_4digit',
      'maths_minus_5digit',
      'maths_G4_5_division',
      'maths_5digit_nums',
      'maths_decimals',
      'maths_minus_2digit_G4_5',
      'maths_minus_3digit_G4_5',
      'maths_5_numbers_100_200_G4_5',
      'maths_5_numbers_10_99_G4_5',
      'maths_5_numbers_1_9_G4_5',
      'maths_1_division_G4_5',
      'maths_time_G4_5',
      'maths_word_problem_G4_5',
      'maths_shape_name_G4_5',
    ],
    verifyFields: [
      { key: 'maths_minus_4digit', label: '4-digit Subtraction' },
      { key: 'maths_minus_5digit', label: '5-digit Subtraction' },
      { key: 'maths_G4_5_division', label: 'Division Problem' },
      { key: 'maths_5digit_nums', label: '5 Numbers (5-digit) Read' },
      { key: 'maths_decimals', label: '5 Decimal Numbers Read' },
      { key: 'maths_minus_2digit_G4_5', label: '2-digit Subtraction — Grade 1-3 fallback' },
      { key: 'maths_minus_3digit_G4_5', label: '3-digit Subtraction — Grade 1-3 fallback' },
      { key: 'maths_5_numbers_100_200_G4_5', label: '5 Numbers (100-200) Read — Grade 1-3 fallback' },
      { key: 'maths_5_numbers_10_99_G4_5', label: '5 Numbers (10-99) Read — Grade 1-3 fallback' },
      { key: 'maths_5_numbers_1_9_G4_5', label: '5 Numbers (1-9) Read — Grade 1-3 fallback' },
      { key: 'maths_1_division_G4_5', label: 'Division Problem — Grade 1-3 fallback' },
      { key: 'maths_time_G4_5', label: 'Tell Time — Grade 1-3 fallback' },
      { key: 'maths_word_problem_G4_5', label: 'Word Problem — Grade 1-3 fallback' },
      { key: 'maths_shape_name_G4_5', label: 'Shape Naming — Grade 1-3 fallback' },
    ],
  },
  aser_gk_g4_5: {
    label: 'General Knowledge (Grade 4-5)',
    group: 'General Knowledge',
    gradeBand: '4-5',
    items: [
      'gk_picture_action_word_1_G4_5',
      'gk_picture_action_word_2_G4_5',
      'gk_complete_sentence_01',
      'gk_complete_sentence_02',
      'gk_complete_sentence_03',
    ],
    verifyFields: [
      { key: 'gk_picture_action_word_1_G4_5', label: 'Picture Q1: Action Word' },
      { key: 'gk_picture_action_word_2_G4_5', label: 'Picture Q2: Action Word' },
      { key: 'gk_complete_sentence_01', label: 'Complete the Sentence #1' },
      { key: 'gk_complete_sentence_02', label: 'Complete the Sentence #2' },
      { key: 'gk_complete_sentence_03', label: 'Complete the Sentence #3' },
    ],
  },
};

// Each section's verifyFields doubles as its summaryFields (ASER's raw
// columns are already per-item, unlike EGRA/EGMA's 100-item letter grids
// that collapse into a handful of aggregate score columns).
for (const section of Object.values(SECTIONS)) {
  section.summaryFields = section.items;
}

const DISPLAY_FIELDS = [
  { key: 'unique_id_calc', label: 'Unique ID' },
  { key: 'enumerator_name', label: 'Enumerator' },
  { key: 'school_name', label: 'School' },
  { key: 'emis_code', label: 'EMIS Code' },
  { key: 'SubmissionDate', label: 'Submission Date' },
  { key: 'student_name', label: 'Student Name' },
  { key: 'grade', label: 'Grade' },
  { key: 'stu_gender', label: 'Student Gender' },
];

module.exports = {
  key: 'aser',
  label: 'ASER',
  csvPathEnvVar: 'CSV_PATH_ASER',
  driveFolderIdEnvVar: 'GOOGLE_DRIVE_FOLDER_ID_ASER', // separate Drive folder from EGRA/EGMA
  // Master data file on Drive — synced to csvPath on first load per process
  // and on manual refresh (see services/csvLoader.js). Local file is a cache.
  dataFileIdEnvVar: 'GOOGLE_DRIVE_DATA_FILE_ID_ASER',
  idField: 'unique_id_calc',
  // Canonical summary field name -> actual ASER CSV column name.
  // caseid is present as a column but blank in every row — kept for shape
  // parity, not relied on for matching.
  fieldMap: {
    unique_id_calc: 'unique_id_calc',
    enumerator_name: 'Enumerator_Name',
    school_name: 'emis_name',
    emis_code: 'emis_code',
    caseid: 'caseid',
    SubmissionDate: 'SubmissionDate',
    audio_comp: 'audio_comp',
  },
  displayFields: DISPLAY_FIELDS,
  gradeField: 'grade',
  gradeBands: GRADE_BANDS,
  sections: SECTIONS,
};
