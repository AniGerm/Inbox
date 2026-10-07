import type { FaxItem } from './types'

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
}

/** True if all query tokens appear in order as substrings of haystack. */
function fuzzyTokens(haystack: string, query: string): boolean {
  const h = normalize(haystack)
  const tokens = normalize(query).split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return true
  let from = 0
  for (const token of tokens) {
    const idx = h.indexOf(token, from)
    if (idx < 0) return false
    from = idx + token.length
  }
  return true
}

/** Search name, note, tags, assignee. */
export function itemMatchesQuery(item: FaxItem, query: string): boolean {
  const q = query.trim()
  if (!q) return true
  const haystack = [
    item.name,
    item.note ?? '',
    ...(item.tags ?? []),
    item.assignedTo ?? '',
  ].join(' ')
  return fuzzyTokens(haystack, q)
}

export type ListFilters = {
  unreadOnly: boolean
  priorityOnly: boolean
  withNoteOnly: boolean
  unassignedOnly: boolean
  tag: string | null
}

export function itemMatchesFilters(item: FaxItem, filters: ListFilters): boolean {
  if (filters.unreadOnly && !(item.seenAt === null && !item.archived)) return false
  if (filters.priorityOnly && !item.priority) return false
  if (filters.withNoteOnly && !item.note?.trim()) return false
  if (filters.unassignedOnly && item.assignedTo) return false
  if (filters.tag) {
    const key = filters.tag.toLowerCase()
    if (!(item.tags ?? []).some((t) => t.toLowerCase() === key)) return false
  }
  return true
}

export function collectAllTags(items: FaxItem[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of items) {
    for (const tag of item.tags ?? []) {
      const key = tag.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(tag)
    }
  }
  return out.sort((a, b) => a.localeCompare(b, 'de'))
}
