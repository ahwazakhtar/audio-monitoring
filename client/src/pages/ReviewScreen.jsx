import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import NavBar from '../components/NavBar.jsx'
import AudioPlayer from '../components/AudioPlayer.jsx'
import ObservationPanel from '../components/ObservationPanel.jsx'
import SectionVerifier from '../components/SectionVerifier.jsx'
import { getObservation, getAudioFiles, getSession, saveReview, releaseClaim, audioStreamUrl } from '../api/client.js'

// ─── Section configuration ──────────────────────────────────────────────────
// 18 sections grouped by subject. Customize item lists to match your survey variables.

const SECTION_CONFIG = {
  // ── Urdu ────────────────────────────────────────────────────────────────
  listcomp_urd: {
    label: 'Listening Comprehension (Urdu)',
    group: 'Urdu',
    verifyFields: [{ key: 'listcomp_numcorrect_urd', label: 'Number Correct' }],
  },
  letterid_urd: {
    label: 'Letter Identification (Urdu)',
    group: 'Urdu',
    verifyFields: [
      { key: 'lid_reading_correct_urd', label: 'Letters Correct' },
      { key: 'lid_reading_attempted_urd', label: 'Letters Attempted' },
    ],
  },
  idwrd_urd: {
    label: 'Word Reading (Urdu)',
    group: 'Urdu',
    verifyFields: [
      { key: 'idwrd_60s_correct_urd', label: 'Words Correct (60s)' },
      { key: 'idwrd_60s_attempted_urd', label: 'Words Attempted (60s)' },
    ],
  },
  orf_urd: {
    label: 'Oral Reading Fluency (Urdu)',
    group: 'Urdu',
    verifyFields: [
      { key: 'orf_60s_correct_urd', label: 'Words Correct (60s)' },
      { key: 'orf_60s_attempted_urd', label: 'Words Attempted (60s)' },
      { key: 'orf_reading_sentences_urd', label: 'Sentences Read' },
    ],
  },
  rdcomp_urd: {
    label: 'Reading Comprehension (Urdu)',
    group: 'Urdu',
    verifyFields: [{ key: 'rdcomp_numcorrect_urd', label: 'Number Correct' }],
  },

  // ── English ──────────────────────────────────────────────────────────────
  listcomp_eng: {
    label: 'Listening Comprehension (English)',
    group: 'English',
    verifyFields: [{ key: 'listcomp_numcorrect_eng', label: 'Number Correct' }],
  },
  letterid_eng: {
    label: 'Letter Identification (English)',
    group: 'English',
    verifyFields: [
      { key: 'lid_reading_correct_eng', label: 'Letters Correct' },
      { key: 'lid_reading_attempted_eng', label: 'Letters Attempted' },
    ],
  },
  pw_eng: {
    label: 'Pseudoword Reading (English)',
    group: 'English',
    verifyFields: [
      { key: 'pw_60s_correct_eng', label: 'Words Correct (60s)' },
      { key: 'pw_60s_attempted_eng', label: 'Words Attempted (60s)' },
    ],
  },
  idwrd_eng: {
    label: 'Word Reading (English)',
    group: 'English',
    verifyFields: [
      { key: 'idwrd_60s_correct_eng', label: 'Words Correct (60s)' },
      { key: 'idwrd_60s_attempted_eng', label: 'Words Attempted (60s)' },
    ],
  },
  orf_eng: {
    label: 'Oral Reading Fluency (English)',
    group: 'English',
    verifyFields: [
      { key: 'orf_60s_correct_eng', label: 'Words Correct (60s)' },
      { key: 'orf_60s_attempted_eng', label: 'Words Attempted (60s)' },
      { key: 'orf_reading_sentences_eng', label: 'Sentences Read' },
    ],
  },
  rdcomp_eng: {
    label: 'Reading Comprehension (English)',
    group: 'English',
    verifyFields: [{ key: 'rdcomp_numcorrect_eng', label: 'Number Correct' }],
  },

  // ── Math ─────────────────────────────────────────────────────────────────
  idnummag: {
    label: 'Number Identification',
    group: 'Math',
    verifyFields: [{ key: 'idnummag_numcorrect', label: 'Number Correct' }],
  },
  numrep: {
    label: 'Number Representation',
    group: 'Math',
    verifyFields: [{ key: 'numrep_numcorrect', label: 'Number Correct' }],
  },
  blfluency_l1: {
    label: 'Basic Letter Fluency (L1)',
    group: 'Math',
    verifyFields: [{ key: 'blfl1_s1ore', label: 'Score' }],
  },
  blfluency_l4: {
    label: 'Basic Letter Fluency (L4)',
    group: 'Math',
    verifyFields: [{ key: 'blfl4_s1ore', label: 'Score' }],
  },
  computation: {
    label: 'Computation',
    group: 'Math',
    verifyFields: [{ key: 'comp_numcorrect', label: 'Number Correct' }],
  },
  word_problems: {
    label: 'Word Problems',
    group: 'Math',
    verifyFields: [{ key: 'wrdpblm_numcorrect', label: 'Number Correct' }],
  },
  patterns: {
    label: 'Patterns',
    group: 'Math',
    verifyFields: [{ key: 'patterns_numcorrect', label: 'Number Correct' }],
  },
}

const SECTION_KEYS = Object.keys(SECTION_CONFIG)
const GROUPS = ['Urdu', 'English', 'Math']

function GroupLabel({ group }) {
  const colors = {
    Urdu: 'bg-purple-100 text-purple-700',
    English: 'bg-blue-100 text-blue-700',
    Math: 'bg-emerald-100 text-emerald-700',
  }
  return (
    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${colors[group] || 'bg-slate-100 text-slate-600'}`}>
      {group}
    </span>
  )
}

function computeCompliance(verdicts, selectedSections) {
  let totalCorrect = 0
  let totalVerdicted = 0
  for (const sectionKey of selectedSections) {
    const fields = SECTION_CONFIG[sectionKey]?.verifyFields || []
    for (const { key } of fields) {
      const v = verdicts[sectionKey]?.[key]
      if (v === 'correct' || v === 'incorrect') {
        totalVerdicted++
        if (v === 'correct') totalCorrect++
      }
    }
  }
  if (totalVerdicted === 0) return null
  return Math.round((totalCorrect / totalVerdicted) * 100)
}

export default function ReviewScreen() {
  const { fileId } = useParams()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [observation, setObservation] = useState(null)
  const [audioFile, setAudioFile] = useState(null)
  const [submitting, setSaving] = useState(false)
  const [submitDone, setSubmitDone] = useState(false)

  // Which sections the officer wants to verify — all on by default
  const [selectedSections, setSelectedSections] = useState(SECTION_KEYS)

  // Verdicts: { [sectionKey]: { [itemKey]: 'correct' | 'incorrect' | null, __comment_item: '...' } }
  const [verdicts, setVerdicts] = useState({})

  // Section-level comments
  const [sectionComments, setSectionComments] = useState({})

  // Overall comment
  const [overallComment, setOverallComment] = useState('')

  const streamUrl = useMemo(() => audioStreamUrl(fileId), [fileId])

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [filesRes, sessionRes] = await Promise.all([
        getAudioFiles(),
        getSession(),
      ])
      const files = filesRes.data || []
      const file = files.find(f => f.audio_file_id === fileId)
      if (!file) {
        setError('Audio file not found.')
        setLoading(false)
        return
      }
      setAudioFile(file)

      if (file.unique_id_calc) {
        const obsRes = await getObservation(file.unique_id_calc)
        setObservation(obsRes.data)
      }

      // Restore draft if present; otherwise all sections stay selected
      const draftRecord = (sessionRes.data?.drafts || []).find(
        d => d.unique_id_calc === file.unique_id_calc
      )
      const draftRaw = draftRecord?.draft_data ?? file.draft_data
      if (draftRaw) {
        const draft = typeof draftRaw === 'string' ? JSON.parse(draftRaw) : draftRaw
        if (draft.sections_reviewed?.length) setSelectedSections(draft.sections_reviewed)
        if (draft.verdicts) setVerdicts(draft.verdicts)
        if (draft.section_comments) setSectionComments(draft.section_comments)
        if (draft.overall_comment) setOverallComment(draft.overall_comment)
      }
    } catch (err) {
      if (err.response?.status !== 401) {
        setError('Failed to load review data. Please go back and try again.')
      }
    } finally {
      setLoading(false)
    }
  }, [fileId])

  useEffect(() => {
    loadData()
  }, [loadData])

  function toggleSection(sectionKey) {
    setSelectedSections(prev =>
      prev.includes(sectionKey)
        ? prev.filter(k => k !== sectionKey)
        : [...prev, sectionKey]
    )
  }

  function handleVerdictsChange(sectionKey, newVerdicts) {
    setVerdicts(prev => ({ ...prev, [sectionKey]: newVerdicts }))
  }

  function handleSectionCommentChange(sectionKey, comment) {
    setSectionComments(prev => ({ ...prev, [sectionKey]: comment }))
  }

  async function handleSaveDraft() {
    setSaving(true)
    setError('')
    try {
      await saveReview({
        unique_id_calc: audioFile?.unique_id_calc,
        audio_filename: audioFile?.audio_filename,
        status: 'draft',
        sections_reviewed: selectedSections,
        verdicts,
        section_comments: sectionComments,
        overall_comment: overallComment,
      })
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Failed to save draft.')
    } finally {
      setSaving(false)
    }
  }

  async function handleSubmit() {
    if (selectedSections.length === 0) {
      setError('Please select at least one section to verify before submitting.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await saveReview({
        unique_id_calc: audioFile?.unique_id_calc,
        audio_filename: audioFile?.audio_filename,
        status: 'complete',
        sections_reviewed: selectedSections,
        verdicts,
        section_comments: sectionComments,
        overall_comment: overallComment,
      })
      setSubmitDone(true)
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Failed to submit review.')
    } finally {
      setSaving(false)
    }
  }

  async function handleRelease() {
    if (!window.confirm('Release your claim on this file? Your draft will be lost.')) return
    try {
      await releaseClaim(audioFile?.unique_id_calc)
      navigate('/')
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to release claim.')
    }
  }

  const compliancePct = useMemo(
    () => computeCompliance(verdicts, selectedSections),
    [verdicts, selectedSections]
  )

  if (loading) {
    return (
      <div className="flex flex-col h-screen">
        <NavBar />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-slate-500">
            <svg className="w-8 h-8 animate-spin text-indigo-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-sm font-medium">Loading review...</span>
          </div>
        </div>
      </div>
    )
  }

  if (submitDone) {
    return (
      <div className="flex flex-col h-screen">
        <NavBar />
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center max-w-sm">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">Review Submitted!</h2>
            <p className="text-sm text-slate-500 mb-2">
              Your compliance review has been recorded.
            </p>
            {compliancePct !== null && (
              <div className={`text-2xl font-bold mb-4 ${
                compliancePct >= 85 ? 'text-green-600' : compliancePct >= 60 ? 'text-yellow-600' : 'text-red-600'
              }`}>
                {compliancePct}% Compliance
              </div>
            )}
            <button
              onClick={() => navigate('/')}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold transition-colors"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-100">
      <NavBar />

      {/* Full-height two-column layout */}
      <div className="flex-1 flex overflow-hidden">

        {/* LEFT PANEL — 35% */}
        <div className="w-[35%] min-w-[280px] max-w-[420px] flex flex-col gap-3 p-4 border-r border-slate-200 bg-white overflow-y-auto">
          {/* Back button */}
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors self-start"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Dashboard
          </button>

          {/* File info */}
          {audioFile && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              <div className="text-xs text-slate-500 font-medium mb-0.5">Audio File</div>
              <div className="text-sm font-semibold text-slate-800 break-words">{audioFile.audio_filename}</div>
            </div>
          )}

          {/* Audio player */}
          <AudioPlayer src={streamUrl} />

          {/* Observation info */}
          <ObservationPanel observation={observation} />

          {/* Release claim */}
          <button
            onClick={handleRelease}
            className="text-xs text-red-500 hover:text-red-700 underline self-start mt-1 transition-colors"
          >
            Release claim
          </button>
        </div>

        {/* RIGHT PANEL — 65% */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Header bar */}
          <div className="flex-shrink-0 bg-white border-b border-slate-200 px-5 py-3 flex items-center justify-between gap-4">
            <div>
              <h1 className="text-base font-bold text-slate-800">Compliance Review</h1>
              <p className="text-xs text-slate-500">
                {audioFile?.unique_id_calc || 'No matched observation'} · {selectedSections.length} sections selected
              </p>
            </div>
            <div className="flex items-center gap-3">
              {compliancePct !== null && (
                <div className={`px-3 py-1 rounded-full text-sm font-bold border ${
                  compliancePct >= 85
                    ? 'bg-green-100 text-green-700 border-green-200'
                    : compliancePct >= 60
                    ? 'bg-yellow-100 text-yellow-700 border-yellow-200'
                    : 'bg-red-100 text-red-700 border-red-200'
                }`}>
                  {compliancePct}% Compliant
                </div>
              )}
            </div>
          </div>

          {error && (
            <div className="flex-shrink-0 mx-5 mt-3 flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2.5 text-sm">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <span>{error}</span>
              <button onClick={() => setError('')} className="ml-auto text-red-500 hover:text-red-700">✕</button>
            </div>
          )}

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto px-5 py-4">

            {/* Section selector */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-800 mb-3">Select Sections to Verify</h2>
              <div className="space-y-3">
                {GROUPS.map(group => {
                  const groupSections = SECTION_KEYS.filter(k => SECTION_CONFIG[k].group === group)
                  return (
                    <div key={group}>
                      <div className="flex items-center gap-2 mb-2">
                        <GroupLabel group={group} />
                        <div className="h-px flex-1 bg-slate-100"></div>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {groupSections.map(sectionKey => {
                          const isSelected = selectedSections.includes(sectionKey)
                          const { label } = SECTION_CONFIG[sectionKey]
                          const sectionVerdicts = verdicts[sectionKey] || {}
                          const fields = SECTION_CONFIG[sectionKey].verifyFields || []
                          const verdictedCount = fields.filter(({ key }) =>
                            sectionVerdicts[key] === 'correct' || sectionVerdicts[key] === 'incorrect'
                          ).length
                          return (
                            <label
                              key={sectionKey}
                              className={`flex items-start gap-2 p-2 rounded-lg border cursor-pointer transition-colors text-xs ${
                                isSelected
                                  ? 'border-indigo-300 bg-indigo-50 text-indigo-800'
                                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSection(sectionKey)}
                                className="mt-0.5 rounded accent-indigo-600"
                              />
                              <div className="min-w-0">
                                <div className="font-medium leading-tight">{label}</div>
                                {isSelected && verdictedCount > 0 && (
                                  <div className="text-indigo-500 mt-0.5">{verdictedCount}/{fields.length} done</div>
                                )}
                              </div>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Section verifiers */}
            {selectedSections.length === 0 ? (
              <div className="bg-white border border-dashed border-slate-300 rounded-xl p-8 text-center text-slate-400">
                <svg className="w-8 h-8 mx-auto mb-2 opacity-40" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h7" />
                </svg>
                <p className="text-sm">Select one or more sections above to begin verifying items</p>
              </div>
            ) : (
              selectedSections.map(sectionKey => (
                <SectionVerifier
                  key={sectionKey}
                  sectionKey={sectionKey}
                  sectionConfig={SECTION_CONFIG[sectionKey]}
                  observation={observation}
                  verdicts={verdicts[sectionKey] || {}}
                  onVerdictsChange={(v) => handleVerdictsChange(sectionKey, v)}
                  comment={sectionComments[sectionKey] || ''}
                  onCommentChange={(c) => handleSectionCommentChange(sectionKey, c)}
                />
              ))
            )}

            {/* Overall comment */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm mt-2">
              <label className="text-sm font-semibold text-slate-800 block mb-2">
                Overall Review Comment
              </label>
              <textarea
                value={overallComment}
                onChange={e => setOverallComment(e.target.value)}
                rows={3}
                placeholder="Any overall notes, concerns, or observations about this recording and survey data..."
                className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
              />
            </div>

            {/* Bottom padding for action bar */}
            <div className="h-20" />
          </div>

          {/* Sticky action bar */}
          <div className="flex-shrink-0 border-t border-slate-200 bg-white px-5 py-3 flex items-center justify-between gap-3">
            <div className="text-xs text-slate-400">
              {selectedSections.length} section{selectedSections.length !== 1 ? 's' : ''} selected
              {compliancePct !== null && ` · ${compliancePct}% compliance`}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleSaveDraft}
                disabled={submitting}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 disabled:bg-slate-50 text-slate-700 disabled:text-slate-400 border border-slate-300 text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                {submitting ? (
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : null}
                Save Draft
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting || selectedSections.length === 0}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2"
              >
                {submitting ? (
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : null}
                Submit Review
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
