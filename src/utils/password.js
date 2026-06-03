import { readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'

const PASSWORD_FILE = resolve(process.cwd(), 'password')
const cache = { value: null, timestamp: 0 }
const TTL = 1000 * 60 * 5 // 5分钟缓存

setInterval(() => {
  cache.value = null
  cache.timestamp = 0
}, TTL)

export async function readPassword () {
  const now = Date.now()
  if (cache.value !== null && now - cache.timestamp < TTL) {
    return cache.value
  }

  try {
    const content = await readFile(PASSWORD_FILE, 'utf-8')
    const value = content.trim()
    if (!value) return ''
    let mtimeMs = 0
    try {
      const stats = await stat(PASSWORD_FILE)
      mtimeMs = stats.mtimeMs
    } catch {}
    if (cache.value === value && cache.mtimeMs === mtimeMs && now - cache.timestamp < TTL) {
      return cache.value
    }
    cache.value = value
    cache.timestamp = now
    cache.mtimeMs = mtimeMs
    return value
  } catch {
    return ''
  }
}
