import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import NavBar from '../components/NavBar.jsx'
import AudioPlayer from '../components/AudioPlayer.jsx'
import ObservationPanel from '../components/ObservationPanel.jsx'
import SectionVerifier from '../components/SectionVerifier.jsx'
import {
  getObservation,
  getAudioFiles,
  saveReview,
  releaseClaim,
  audioStreamUrl,
  getReviewByFile,
  getInstrumentConfig,
} from '../api/client.js'

const DEFAULT_INSTRUMENT = 'egra_egma'

const GROUP_COLORS = {
  Urdu: 'bg-purple-100 text-purple-700',
  English: 'bg-blue-100 text-blue-700',
  Math: 'bg-emerald-100 text-emerald-700',
  'General Knowledge': 'bg-amber-100 text-amber-700',
}

function GroupLabel({ group }) {
  return (
    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${GROUP_COLORS[group] || 'bg-slate-100 text-slate-600'}`}>
      {group}
    </span>
  )
}

function computeCompliance(verdicts, selectedSections, sectionConfig) {
  let totalCorrect = 0
  let totalVerdicted = 0
  for (const sectionKey of selectedSections) {
    const fields = sectionConfig[sectionKey]?.verifyFields || []
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

// For grade-banded instruments (ASER), resolves which section gradeBand an
// observation belongs to so only the relevant sections are offered. Returns
// null for non-grade-banded instruments or when grade can't be resolved
// (in which case all sections stay visible — safer than hiding everything).
function resolveGradeBand(instrumentConfig, observation) {
  if (!instrumentConfig?.gradeField || !instrumentConfig?.gradeBands || !observation) return null
  const gradeNum = parseInt(observation[instrumentConfig.gradeField], 10)
  if (isNaN(gradeNum)) return null
  for (const [band, grades] of Object.entries(instrumentConfig.gradeBands)) {
    if (grades.includes(gradeNum)) return band
  }
  return null
}

export default function ReviewScreen() {
  const { fileId } = useParams()
  const [searchParams] = useSearchParams()
  const instrument = searchParams.get('instrument') || DEFAULT_INSTRUMENT
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [instrumentConfig, setInstrumentConfig] = useState(null)
  const [observation, setObservation] = useState(null)
  const [audioFile, setAudioFile] = useState(null)
  const [submitting, setSaving] = useState(false)
  const [submitDone, setSubmitDone] = useState(false)
  const [isCompleted, setIsCompleted] = useState(false)

  // Which sections the officer wants to verify
  const [selectedSections, setSelectedSections] = useState([])

  // Verdicts: { [sectionKey]: { [itemKey]: 'correct' | 'incorrect' | null, __comment_item: '...' } }
  const [verdicts, setVerdicts] = useState({})

  // Section-level comments
  const [sectionComments, setSectionComments] = useState({})

  // Overall comment
  const [overallComment, setOverallComment] = useState('')

  const streamUrl = useMemo(() => audioStreamUrl(fileId), [fileId])

  const sectionConfig = instrumentConfig?.sections || {}
  const gradeBand = useMemo(() => resolveGradeBand(instrumentConfig, observation), [instrumentConfig, observation])

  // Sections relevant to this observation — for grade-banded instruments,
  // only the matching grade band's sections; otherwise all sections.
  const visibleSectionKeys = useMemo(() => {
    const keys = Object.keys(sectionConfig)
    if (!gradeBand) return keys
    return keys.filter(k => !sectionConfig[k].gradeBand || sectionConfig[k].gradeBand === gradeBand)
  }, [sectionConfig, gradeBand])

  const groups = useMemo(() => {
    const seen = []
    for (const k of visibleSectionKeys) {
      const g = sectionConfig[k]?.group
      if (g && !seen.includes(g)) seen.push(g)
    }
    return seen
  }, [visibleSectionKeys, sectionConfig])

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [configRes, filesRes] = await Promise.all([
        getInstrumentConfig(instrument),
        getAudioFiles(instrument),
      ])
      setInstrumentConfig(configRes.data)

      const files = filesRes.data || []
      const file = files.find(f => f.audio_file_id === fileId)
      if (!file) {
        setError('Audio file not found.')
        setLoading(false)
        return
      }
      setAudioFile(file)

      let visibleKeysForDefault = Object.keys(configRes.data.sections || {})

      if (file.unique_id_calc) {
        const obsRes = await getObservation(file.unique_id_calc, instrument, file.audio_filename_segment || undefined)
        setObservation(obsRes.data)
        const band = resolveGradeBand(configRes.data, obsRes.data)
        if (band) {
          visibleKeysForDefault = visibleKeysForDefault.filter(
            k => !configRes.data.sections[k].gradeBand || configRes.data.sections[k].gradeBand === band
          )
        }
      }

      // Default selection: all sections relevant to this observation
      setSelectedSections(visibleKeysForDefault)

      // Restore draft if present; otherwise check for a completed review
      if (file.draft_data) {
        const draft = typeof file.draft_data === 'string' ? JSON.parse(file.draft_data) : file.draft_data
        if (draft.sections_reviewed?.length) setSelectedSections(draft.sections_reviewed)
        if (draft.verdicts) setVerdicts(draft.verdicts)
        if (draft.section_comments) setSectionComments(draft.section_comments)
        if (draft.overall_comment) setOverallComment(draft.overall_comment)
      } else if (file.status === 'complete') {
        try {
          const reviewRes = await getReviewByFile(file.audio_filename)
          const review = reviewRes.data
          if (review.sections_reviewed?.length) setSelectedSections(review.sections_reviewed)
          if (review.verdicts) setVerdicts(review.verdicts)
          if (review.section_comments) setSectionComments(review.section_comments)
          if (review.overall_comment) setOverallComment(review.overall_comment)
        } catch {
          // review data unavailable — form stays empty but still read-only
        }
        setIsCompleted(true)
      }
    } catch (err) {
      if (err.response?.status !== 401) {
        setError('Failed to load review data. Please go back and try again.')
      }
    } finally {
      setLoading(false)
    }
  }, [fileId, instrument])

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
        instrument,
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
        instrument,
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
      await releaseClaim(audioFile?.audio_filename)
      navigate('/')
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to release claim.')
    }
  }

  const compliancePct = useMemo(
    () => computeCompliance(verdicts, selectedSections, sectionConfig),
    [verdicts, selectedSections, sectionConfig]
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
          <ObservationPanel observation={observation} displayFields={instrumentConfig?.displayFields} />

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
            {isCompleted && (
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700 border border-green-200">
                Submitted
              </span>
            )}
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
              {gradeBand && (
                <p className="text-xs text-slate-400 mb-3">
                  Showing sections for Grade {gradeBand} based on this observation's recorded grade.
                </p>
              )}
              <div className="space-y-3">
                {groups.map(group => {
                  const groupSections = visibleSectionKeys.filter(k => sectionConfig[k].group === group)
                  return (
                    <div key={group}>
                      <div className="flex items-center gap-2 mb-2">
                        <GroupLabel group={group} />
                        <div className="h-px flex-1 bg-slate-100"></div>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {groupSections.map(sectionKey => {
                          const isSelected = selectedSections.includes(sectionKey)
                          const { label } = sectionConfig[sectionKey]
                          const sectionVerdicts = verdicts[sectionKey] || {}
                          const fields = sectionConfig[sectionKey].verifyFields || []
                          const verdictedCount = fields.filter(({ key }) =>
                            sectionVerdicts[key] === 'correct' || sectionVerdicts[key] === 'incorrect'
                          ).length
                          return (
                            <label
                              key={sectionKey}
                              className={`flex items-start gap-2 p-2 rounded-lg border text-xs ${
                                isCompleted ? 'cursor-default' : 'cursor-pointer transition-colors'
                              } ${
                                isSelected
                                  ? 'border-indigo-300 bg-indigo-50 text-indigo-800'
                                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => !isCompleted && toggleSection(sectionKey)}
                                disabled={isCompleted}
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
                sectionConfig[sectionKey] && (
                  <SectionVerifier
                    key={sectionKey}
                    sectionKey={sectionKey}
                    sectionConfig={sectionConfig[sectionKey]}
                    observation={observation}
                    verdicts={verdicts[sectionKey] || {}}
                    onVerdictsChange={(v) => handleVerdictsChange(sectionKey, v)}
                    comment={sectionComments[sectionKey] || ''}
                    onCommentChange={(c) => handleSectionCommentChange(sectionKey, c)}
                    readOnly={isCompleted}
                  />
                )
              ))
            )}

            {/* Overall comment */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm mt-2">
              <label className="text-sm font-semibold text-slate-800 block mb-2">
                Overall Review Comment
              </label>
              <textarea
                value={overallComment}
                onChange={e => !isCompleted && setOverallComment(e.target.value)}
                readOnly={isCompleted}
                rows={3}
                placeholder="Any overall notes, concerns, or observations about this recording and survey data..."
                className={`w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none ${isCompleted ? 'bg-slate-50 text-slate-600' : ''}`}
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
            {isCompleted ? (
              <div className="flex items-center gap-2 text-sm text-green-700 font-medium">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Review already submitted
              </div>
            ) : (
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
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
