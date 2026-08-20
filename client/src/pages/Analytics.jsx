import React, { useState, useEffect } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { useSearchParams } from 'react-router-dom'
import NavBar from '../components/NavBar.jsx'
import { getAnalytics, getInstruments } from '../api/client.js'

const COMPLIANCE_THRESHOLD = 85
const DEFAULT_INSTRUMENT = 'egra_egma'

function InstrumentPicker({ instruments, value, onChange }) {
  if (instruments.length < 2) return null
  return (
    <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1">
      {instruments.map(i => (
        <button
          key={i.key}
          onClick={() => onChange(i.key)}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            value === i.key
              ? 'bg-indigo-600 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          {i.label}
        </button>
      ))}
    </div>
  )
}

function StatCard({ label, value, sub, colorClass }) {
  return (
    <div className={`bg-white rounded-xl border shadow-sm p-5 ${colorClass || 'border-slate-200'}`}>
      <div className="text-3xl font-bold text-slate-800">{value}</div>
      <div className="text-sm font-medium text-slate-600 mt-0.5">{label}</div>
      {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
    </div>
  )
}

function ComplianceBar({ value }) {
  const pct = Math.round(value || 0)
  let color = 'bg-green-500'
  if (pct < 60) color = 'bg-red-500'
  else if (pct < 85) color = 'bg-yellow-400'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-slate-100 rounded-full h-2">
        <div className={`h-2 rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold text-slate-700 w-9 text-right">{pct}%</span>
    </div>
  )
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null
  const val = payload[0].value
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-sm">
      <div className="font-semibold text-slate-700 mb-1">{label}</div>
      <div className={`font-bold ${val >= 85 ? 'text-green-600' : val >= 60 ? 'text-yellow-600' : 'text-red-600'}`}>
        {Math.round(val)}% compliance
      </div>
    </div>
  )
}

function getBarColor(value) {
  if (value >= COMPLIANCE_THRESHOLD) return '#16a34a'
  if (value >= 60) return '#ca8a04'
  return '#dc2626'
}

export default function Analytics() {
  const [searchParams, setSearchParams] = useSearchParams()
  const instrument = searchParams.get('instrument') || DEFAULT_INSTRUMENT
  const [instruments, setInstruments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState(null)

  function handleInstrumentChange(key) {
    setSearchParams({ instrument: key })
  }

  useEffect(() => {
    getInstruments().then(res => setInstruments(res.data || [])).catch(() => {})
  }, [])

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError('')
      try {
        const res = await getAnalytics(instrument)
        setData(res.data)
      } catch (err) {
        if (err.response?.status !== 401) {
          setError('Failed to load analytics data.')
        }
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [instrument])

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
            <span className="text-sm font-medium">Loading analytics...</span>
          </div>
        </div>
      </div>
    )
  }

  const byEnumerator = data?.by_enumerator || []
  const bySection = data?.by_section || []
  const byReviewer = data?.by_reviewer || []
  const flagged = data?.flagged_observations || []
  const totalReviewed = data?.total_reviewed ?? 0
  const avgCompliance = data?.avg_compliance ?? null
  const flaggedCount = data?.flagged_count ?? flagged.length

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      <NavBar />
      <main className="flex-1 max-w-screen-2xl mx-auto w-full px-4 py-6">

        {/* Page title */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Analytics Dashboard</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Survey compliance summary across reviewed audio files
            </p>
          </div>
          <InstrumentPicker instruments={instruments} value={instrument} onChange={handleInstrumentChange} />
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            {error}
          </div>
        )}

        {/* Stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <StatCard
            label="Total Reviewed"
            value={totalReviewed}
            sub="Submitted reviews"
            colorClass="border-blue-200"
          />
          <StatCard
            label="Average Compliance"
            value={avgCompliance !== null ? `${Math.round(avgCompliance)}%` : '—'}
            sub={`Threshold: ${COMPLIANCE_THRESHOLD}%`}
            colorClass={
              avgCompliance === null
                ? 'border-slate-200'
                : avgCompliance >= COMPLIANCE_THRESHOLD
                ? 'border-green-200'
                : 'border-red-200'
            }
          />
          <StatCard
            label="Flagged"
            value={flaggedCount}
            sub={`Below ${COMPLIANCE_THRESHOLD}% compliance`}
            colorClass={flaggedCount > 0 ? 'border-red-200' : 'border-green-200'}
          />
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">

          {/* By Enumerator */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h2 className="font-semibold text-slate-800 mb-1">Compliance by Enumerator</h2>
            <p className="text-xs text-slate-400 mb-4">Average compliance % per enumerator · Red line = 85% threshold</p>
            {byEnumerator.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-slate-400 text-sm">
                No data available
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={byEnumerator}
                  margin={{ top: 5, right: 10, left: 0, bottom: 60 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis
                    dataKey="enumerator_name"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    angle={-35}
                    textAnchor="end"
                    interval={0}
                    height={70}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    tickFormatter={v => `${v}%`}
                    width={40}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine
                    y={COMPLIANCE_THRESHOLD}
                    stroke="#ef4444"
                    strokeDasharray="4 3"
                    strokeWidth={1.5}
                    label={{ value: '85%', position: 'right', fontSize: 11, fill: '#ef4444' }}
                  />
                  <Bar dataKey="avg_compliance" radius={[3, 3, 0, 0]} maxBarSize={48}>
                    {byEnumerator.map((entry, idx) => (
                      <Cell key={idx} fill={getBarColor(entry.avg_compliance)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* By Section */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h2 className="font-semibold text-slate-800 mb-1">Compliance by Section</h2>
            <p className="text-xs text-slate-400 mb-4">Average compliance % per survey section · Red line = 85% threshold</p>
            {bySection.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-slate-400 text-sm">
                No data available
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={bySection}
                  margin={{ top: 5, right: 10, left: 0, bottom: 60 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: '#64748b' }}
                    angle={-35}
                    textAnchor="end"
                    interval={0}
                    height={70}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    tickFormatter={v => `${v}%`}
                    width={40}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine
                    y={COMPLIANCE_THRESHOLD}
                    stroke="#ef4444"
                    strokeDasharray="4 3"
                    strokeWidth={1.5}
                    label={{ value: '85%', position: 'right', fontSize: 11, fill: '#ef4444' }}
                  />
                  <Bar dataKey="avg_compliance" radius={[3, 3, 0, 0]} maxBarSize={36}>
                    {bySection.map((entry, idx) => (
                      <Cell key={idx} fill={getBarColor(entry.avg_compliance)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Reviews by reviewer */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-6">
          <div className="px-5 py-4 border-b border-slate-200">
            <h2 className="font-semibold text-slate-800">Reviews by Reviewer</h2>
            <p className="text-xs text-slate-400 mt-0.5">Number of submissions per officer</p>
          </div>
          {byReviewer.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400">No data available</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Reviewer</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Reviews</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Avg Compliance</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Flagged</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {byReviewer.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-slate-700">{row.reviewer}</td>
                      <td className="px-4 py-3 text-sm text-slate-700 font-semibold">{row.reviewed}</td>
                      <td className="px-4 py-3 min-w-[140px]">
                        <ComplianceBar value={row.avg_compliance} />
                      </td>
                      <td className="px-4 py-3">
                        {row.flagged > 0 ? (
                          <span className="text-xs font-semibold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                            {row.flagged}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Flagged observations table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-800 flex items-center gap-2">
                <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l1.664 1.664M21 21l-1.5-1.5m-5.485-1.242L12 17.25 4.5 21V8.742m.164-4.078a2.15 2.15 0 011.743-1.342 48.507 48.507 0 0111.186 0c1.1.128 1.907 1.077 1.907 2.185V19.5M4.664 4.664L19.5 19.5" />
                </svg>
                Flagged Observations
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">Below {COMPLIANCE_THRESHOLD}% compliance threshold</p>
            </div>
            <span className="text-xs font-semibold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
              {flagged.length} flagged
            </span>
          </div>

          {flagged.length === 0 ? (
            <div className="py-12 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-green-100 rounded-full mb-3">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-sm text-slate-500 font-medium">No flagged observations</p>
              <p className="text-xs text-slate-400 mt-1">All reviewed submissions meet the compliance threshold</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Unique ID</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">School</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Enumerator</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Compliance</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Reviewer</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {flagged.map((row, idx) => {
                    const pct = Math.round(row.overall_compliance_pct || 0)
                    const dateStr = row.review_timestamp
                      ? new Date(row.review_timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                      : '—'
                    return (
                      <tr key={idx} className="hover:bg-red-50 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs text-slate-700 font-semibold">
                          {row.unique_id_calc || '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          {row.school_name || '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          {row.enumerator_name || '—'}
                        </td>
                        <td className="px-4 py-3 min-w-[120px]">
                          <ComplianceBar value={pct} />
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          {row.reviewer || '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">
                          {dateStr}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </main>
    </div>
  )
}
