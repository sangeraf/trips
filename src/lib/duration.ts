export function parseTime(t: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

/** Minutes between two HH:MM times; an arrival before departure means the trip passed midnight. */
export function calcDuration(dep: string, arr: string): number | null {
  const d = parseTime(dep)
  const a = parseTime(arr)
  if (d === null || a === null) return null
  return a >= d ? a - d : a + 1440 - d
}

/** Accepts "85", "1:25" or "1h 25m" style input. */
export function parseDuration(s: string): number | null {
  const t = s.trim().toLowerCase()
  if (!t) return null
  let m = /^(\d+)$/.exec(t)
  if (m) return Number(m[1])
  m = /^(\d+):(\d{1,2})$/.exec(t)
  if (m) return Number(m[1]) * 60 + Number(m[2])
  m = /^(?:(\d+)\s*[hó])?\s*(?:(\d+)\s*(?:m|p|min|perc)?)?$/.exec(t)
  if (m && (m[1] || m[2])) return Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0)
  return null
}

export function formatDuration(min: number | null | undefined): string {
  if (min === null || min === undefined) return ''
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return `${h}:${String(m).padStart(2, '0')}`
}

/** Turns typed times like "815", "8.15" or "8:15" into "08:15"; null when not a valid 24-hour time. */
export function normalizeTime(s: string): string | null {
  const t = s.trim()
  const m = /^(\d{1,2})[:.](\d{2})$/.exec(t) ?? /^(\d{1,2})(\d{2})$/.exec(t) ?? /^(\d{1,2})()$/.exec(t)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2] || 0)
  if (h > 23 || min > 59) return null
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}
