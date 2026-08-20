import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

const api = axios.create({
  baseURL: BASE_URL,
})

// Request interceptor: attach JWT token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Response interceptor: handle 401 by clearing auth and redirecting
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('username')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export function login(username, password) {
  return api.post('/api/auth/login', { username, password })
}

export function getSession() {
  return api.get('/api/session')
}

export function getObservations(instrument) {
  return api.get('/api/observations', { params: { instrument } })
}

export function getObservation(id, instrument, segment) {
  return api.get(`/api/observations/${id}`, { params: { instrument, segment } })
}

export function getAudioFiles(instrument) {
  return api.get('/api/audio/files', { params: { instrument } })
}

export function claimFile(unique_id_calc, audio_filename, audio_file_id, instrument) {
  return api.post('/api/claim', { unique_id_calc, audio_filename, audio_file_id, instrument })
}

export function releaseClaim(audio_filename) {
  return api.delete(`/api/claim/${encodeURIComponent(audio_filename)}`)
}

export function saveReview(reviewData) {
  return api.post('/api/reviews', reviewData)
}

export function getMyReviews() {
  return api.get('/api/reviews/mine')
}

export function getReviewByFile(audio_filename) {
  return api.get(`/api/reviews/by-file/${encodeURIComponent(audio_filename)}`)
}

export function getAnalytics(instrument) {
  return api.get('/api/analytics', { params: { instrument } })
}

export function getInstruments() {
  return api.get('/api/instruments')
}

export function getInstrumentConfig(instrument) {
  return api.get(`/api/instruments/${instrument}/config`)
}

export function refreshInstrumentData(instrument) {
  return api.post(`/api/instruments/${instrument}/refresh-data`)
}

export function audioStreamUrl(fileId) {
  const token = localStorage.getItem('token')
  return `${BASE_URL}/api/audio/stream/${fileId}?token=${token}`
}

export default api
