export interface GhConfig {
  owner: string
  repo: string
  /** Empty means the repository's default branch. */
  branch: string
  token: string
}

export class ConflictError extends Error {}

export class GhError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function toBase64(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

export function fromBase64(b: string): string {
  return new TextDecoder().decode(Uint8Array.from(atob(b.replace(/\s/g, '')), (c) => c.charCodeAt(0)))
}

async function gh(cfg: GhConfig, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`https://api.github.com/repos/${cfg.owner}/${cfg.repo}${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${cfg.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  })
}

async function fail(res: Response): Promise<never> {
  let msg = res.statusText
  try {
    msg = ((await res.json()) as { message?: string }).message ?? msg
  } catch {
    /* body was not JSON */
  }
  throw new GhError(res.status, `GitHub ${res.status}: ${msg}`)
}

const refQuery = (cfg: GhConfig) => (cfg.branch ? `?ref=${encodeURIComponent(cfg.branch)}` : '')

export interface RepoInfo {
  private: boolean
  canWrite: boolean
  defaultBranch: string
}

export async function repoInfo(cfg: GhConfig): Promise<RepoInfo> {
  const res = await gh(cfg, '')
  if (!res.ok) await fail(res)
  const j = (await res.json()) as { private: boolean; default_branch: string; permissions?: { push?: boolean } }
  return { private: j.private, canWrite: !!j.permissions?.push, defaultBranch: j.default_branch }
}

export interface RemoteFile {
  sha: string
  text: string
}

/** Reads a file; files over 1 MB come back without content, so they are fetched as a blob. */
export async function getFile(cfg: GhConfig, path: string): Promise<RemoteFile | null> {
  // The object media type also works for 1–100 MB files (with empty content); the default one fails.
  const res = await gh(cfg, `/contents/${path}${refQuery(cfg)}`, { headers: { Accept: 'application/vnd.github.object+json' } })
  if (res.status === 404) return null
  if (!res.ok) await fail(res)
  const j = (await res.json()) as { sha: string; content?: string; encoding?: string; size: number }
  if (j.encoding === 'base64' && (j.content || j.size === 0)) return { sha: j.sha, text: fromBase64(j.content ?? '') }
  const blob = await gh(cfg, `/git/blobs/${j.sha}`)
  if (!blob.ok) await fail(blob)
  const b = (await blob.json()) as { content: string }
  return { sha: j.sha, text: fromBase64(b.content) }
}

export async function listDir(cfg: GhConfig, path: string): Promise<string[]> {
  const res = await gh(cfg, `/contents/${path}${refQuery(cfg)}`)
  if (res.status === 404) return []
  if (!res.ok) await fail(res)
  const j = (await res.json()) as { name: string; type: string }[] | object
  return Array.isArray(j) ? j.filter((f) => f.type === 'file').map((f) => f.name) : []
}

export async function putFile(cfg: GhConfig, path: string, text: string, sha: string | undefined, message: string) {
  const res = await gh(cfg, `/contents/${path}`, {
    method: 'PUT',
    body: JSON.stringify({ message, content: toBase64(text), sha, ...(cfg.branch ? { branch: cfg.branch } : {}) }),
  })
  if (res.status === 409 || (res.status === 422 && !sha)) throw new ConflictError(`${path} changed on GitHub`)
  if (!res.ok) await fail(res)
}
