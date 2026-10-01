import { app } from 'electron'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import https from 'node:https'
import http from 'node:http'
import { pipeline } from 'node:stream/promises'
import { createWriteStream } from 'node:fs'

const OWNER = 'AniGerm'
const REPO = 'Inbox'
const USER_AGENT = 'Fax-Inbox-Updater'

export type DebReleaseInfo = {
  version: string
  debUrl: string
  debName: string
  size: number
}

type GithubAsset = {
  name: string
  browser_download_url: string
  size: number
}

type GithubRelease = {
  tag_name: string
  assets: GithubAsset[]
}

function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/** Compare dotted versions; true if remote > local. */
export function isVersionNewer(remote: string, local: string): boolean {
  const parse = (v: string): number[] =>
    v
      .replace(/^v/i, '')
      .split(/[.+-]/)
      .map((p) => {
        const n = Number.parseInt(p, 10)
        return Number.isFinite(n) ? n : 0
      })
  const a = parse(remote)
  const b = parse(local)
  const len = Math.max(a.length, b.length)
  for (let i = 0; i < len; i++) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    if (x > y) return true
    if (x < y) return false
  }
  return false
}

function httpsGetJson<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': USER_AGENT,
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume()
          httpsGetJson<T>(res.headers.location).then(resolve, reject)
          return
        }
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          res.resume()
          reject(new Error(`GitHub API HTTP ${res.statusCode ?? '?'}`))
          return
        }
        const chunks: Buffer[] = []
        res.on('data', (c) => chunks.push(c as Buffer))
        res.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as T)
          } catch (err) {
            reject(err)
          }
        })
      },
    )
    req.on('error', reject)
  })
}

function downloadFile(
  url: string,
  dest: string,
  onProgress?: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const get = url.startsWith('http://') ? http.get : https.get
    const req = get(
      url,
      {
        headers: { 'User-Agent': USER_AGENT },
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume()
          downloadFile(res.headers.location, dest, onProgress).then(resolve, reject)
          return
        }
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          res.resume()
          reject(new Error(`Download HTTP ${res.statusCode ?? '?'}`))
          return
        }
        const total = Number(res.headers['content-length'] || 0)
        let received = 0
        res.on('data', (chunk: Buffer) => {
          received += chunk.length
          if (total > 0 && onProgress) {
            onProgress(Math.max(0, Math.min(100, Math.round((received / total) * 100))))
          }
        })
        const out = createWriteStream(dest)
        pipeline(res, out).then(resolve, reject)
      },
    )
    req.on('error', reject)
  })
}

export async function fetchLatestDebRelease(): Promise<DebReleaseInfo | null> {
  const release = await httpsGetJson<GithubRelease>(
    `https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`,
  )
  const version = release.tag_name.replace(/^v/i, '')
  const asset = (release.assets || []).find((a) => /^Fax-Inbox-.*\.deb$/i.test(a.name))
  if (!asset) return null
  return {
    version,
    debUrl: asset.browser_download_url,
    debName: asset.name,
    size: asset.size,
  }
}

export function debDownloadPath(debName: string): string {
  const dir = path.join(app.getPath('userData'), 'updates')
  fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, debName)
}

export async function downloadDebUpdate(
  info: DebReleaseInfo,
  onProgress?: (percent: number) => void,
): Promise<string> {
  const dest = debDownloadPath(info.debName)
  // Remove stale partial downloads
  try {
    if (fs.existsSync(dest)) fs.unlinkSync(dest)
  } catch {
    /* ignore */
  }
  await downloadFile(info.debUrl, dest, onProgress)
  return dest
}

/**
 * Quit the app and install the .deb via pkexec (password dialog), then relaunch.
 */
export function quitAndInstallDeb(
  debPath: string,
  prepareForQuit: () => void,
): void {
  const qDeb = shellSingleQuote(debPath)
  const script = [
    'set -e',
    `DEB=${qDeb}`,
    'if command -v apt-get >/dev/null 2>&1; then',
    '  pkexec apt-get install -y --reinstall "$DEB"',
    'else',
    '  pkexec dpkg -i "$DEB"',
    'fi',
    'sleep 1',
    'if command -v gtk-launch >/dev/null 2>&1; then',
    '  gtk-launch fax-inbox >/dev/null 2>&1 &',
    'elif command -v fax-inbox >/dev/null 2>&1; then',
    '  nohup fax-inbox --no-sandbox >/dev/null 2>&1 &',
    'fi',
  ].join('\n')

  prepareForQuit()
  const child = spawn('bash', ['-c', script], {
    detached: true,
    stdio: 'ignore',
    env: process.env,
  })
  child.unref()
  app.quit()
}
