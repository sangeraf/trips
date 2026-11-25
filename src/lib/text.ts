/** Lower-cases, trims, collapses whitespace and strips accents so "Déli " matches "deli". */
export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function clean(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

export function newId(): string {
  return crypto.randomUUID()
}

export function todayIso(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
