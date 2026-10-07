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
const USER_AGENT = 'Inbox-Updater'

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

/** Prefer clean Inbox-*.deb; accept legacy Fax-Inbox-*.deb as fallback. */
function findDebAsset(assets: GithubAsset[] | undefined): GithubAsset | undefined {
  const list = assets ?? []
  return (
    list.find((a) => /^Inbox-.*\.deb$/i.test(a.name)) ??
    list.find((a) => /^Fax-Inbox-.*\.deb$/i.test(a.name))
  )
}

function releaseToDebInfo(release: GithubRelease): DebReleaseInfo | null {
  const asset = findDebAsset(release.assets)
  if (!asset) return null
  return {
    version: release.tag_name.replace(/^v/i, ''),
    debUrl: asset.browser_download_url,
    debName: asset.name,
    size: asset.size,
  }
}

export async function fetchLatestDebRelease(): Promise<DebReleaseInfo | null> {
  const release = await httpsGetJson<GithubRelease>(
    `https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`,
  )
  return releaseToDebInfo(release)
}

/** Bridge release for clients that cannot see newer Inbox-*.deb assets. */
export const BRIDGE_DEB_TAG = 'v0.4.0'

export async function fetchDebReleaseByTag(tag: string): Promise<DebReleaseInfo | null> {
  const release = await httpsGetJson<GithubRelease>(
    `https://api.github.com/repos/${OWNER}/${REPO}/releases/tags/${encodeURIComponent(tag)}`,
  )
  return releaseToDebInfo(release)
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
 * Uses setsid + a script file so the installer survives Electron's process exit.
 */
export function quitAndInstallDeb(
  debPath: string,
  prepareForQuit: () => void,
): void {
  const qDeb = shellSingleQuote(debPath)
  const qDisplay = shellSingleQuote(process.env.DISPLAY || ':0')
  const qXdg = shellSingleQuote(
    process.env.XDG_RUNTIME_DIR || `/run/user/${typeof process.getuid === 'function' ? process.getuid() : 1000}`,
  )
  const qHome = shellSingleQuote(process.env.HOME || '')
  const qUser = shellSingleQuote(process.env.USER || process.env.LOGNAME || '')
  const qDbus = process.env.DBUS_SESSION_BUS_ADDRESS
    ? `export DBUS_SESSION_BUS_ADDRESS=${shellSingleQuote(process.env.DBUS_SESSION_BUS_ADDRESS)}`
    : ''
  const qWayland = process.env.WAYLAND_DISPLAY
    ? `export WAYLAND_DISPLAY=${shellSingleQuote(process.env.WAYLAND_DISPLAY)}`
    : ''

  const script = `#!/bin/bash
# Keep running after Inbox exits
trap '' HUP
exec >>/tmp/fax-inbox-update.log 2>&1
echo "==== $(date -Is) update install start ===="
set -x

DEB=${qDeb}
export DISPLAY=${qDisplay}
export XDG_RUNTIME_DIR=${qXdg}
export HOME=${qHome}
export USER=${qUser}
export LOGNAME=${qUser}
${qDbus}
${qWayland}

# Install (shows password dialog). Do not use set -e — we always try to relaunch.
if command -v apt-get >/dev/null 2>&1; then
  pkexec env DEBIAN_FRONTEND=noninteractive apt-get install -y --reinstall "$DEB" \\
    || pkexec dpkg -i "$DEB" \\
    || true
else
  pkexec dpkg -i "$DEB" || true
fi

# Give postinst / desktop database a moment
sleep 2

# Relaunch as the original user session (never as root)
relaunch() {
  if command -v gio >/dev/null 2>&1 && [ -f /usr/share/applications/fax-inbox.desktop ]; then
    gio launch /usr/share/applications/fax-inbox.desktop && return 0
  fi
  if command -v gtk-launch >/dev/null 2>&1; then
    gtk-launch fax-inbox && return 0
  fi
  if [ -x /usr/bin/fax-inbox ]; then
    nohup /usr/bin/fax-inbox >/tmp/fax-inbox-relaunch.log 2>&1 &
    disown || true
    return 0
  fi
  if command -v fax-inbox >/dev/null 2>&1; then
    nohup fax-inbox >/tmp/fax-inbox-relaunch.log 2>&1 &
    disown || true
    return 0
  fi
  return 1
}

for _try in 1 2 3 4 5; do
  if relaunch; then
    echo "relaunch ok (try $_try)"
    exit 0
  fi
  sleep 1
done

echo "relaunch failed"
exit 1
`

  const scriptPath = path.join(app.getPath('temp'), 'fax-inbox-install-update.sh')
  fs.writeFileSync(scriptPath, script, { encoding: 'utf8', mode: 0o755 })

  prepareForQuit()

  // setsid: new session so Electron quitting does not SIGHUP the installer
  const child = spawn('setsid', ['bash', scriptPath], {
    detached: true,
    stdio: 'ignore',
    env: process.env,
  })
  child.unref()

  // Brief delay so setsid/bash is running before we tear down the app
  setTimeout(() => {
    app.quit()
  }, 400)
}
