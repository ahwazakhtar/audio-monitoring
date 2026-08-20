import React from 'react'

// Fallback used only if the caller doesn't pass an instrument-specific
// displayFields prop (e.g. fetched from GET /api/instruments/:key/config).
const DEFAULT_DISPLAY_FIELDS = [
  { key: 'unique_id_calc', label: 'Unique ID' },
  { key: 'enumerator_name', label: 'Enumerator' },
  { key: 'school_name', label: 'School' },
  { key: 'emis_code', label: 'EMIS Code' },
  { key: 'SubmissionDate', label: 'Submission Date' },
  { key: 'stu_gender', label: 'Student Gender' },
  { key: 'class_grade_a', label: 'Class / Grade' },
]

function formatValue(key, value) {
  if (value === null || value === undefined || value === '') return '—'
  if (key === 'SubmissionDate' && typeof value === 'string') {
    const d = new Date(value)
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    }
  }
  if (key === 'stu_gender') {
    if (value === 1 || value === '1') return 'Male'
    if (value === 2 || value === '2') return 'Female'
  }
  return String(value)
}

export default function ObservationPanel({ observation, displayFields }) {
  const fields = displayFields && displayFields.length ? displayFields : DEFAULT_DISPLAY_FIELDS

  if (!observation) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
        <div className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
          <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Observation
        </div>
        <p className="text-sm text-slate-400 italic">No observation matched</p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
      <div className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
        <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        Observation Details
      </div>
      <dl className="space-y-2">
        {fields.map(({ key, label }) => (
          <div key={key} className="flex justify-between items-start gap-2">
            <dt className="text-xs text-slate-500 font-medium flex-shrink-0 w-28">{label}</dt>
            <dd className="text-xs text-slate-800 font-semibold text-right break-words min-w-0">
              {formatValue(key, observation[key])}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
