import { readFile, stat, watch } from 'node:fs/promises'
import { resolve } from 'node:path'
import { URL } from 'node:url'
import config from '../config.js'

// Cookie 缓存
const cookieCache = new Map()
const COOKIE_TTL = 1000 * 60 * 5 // 5分钟缓存过期

// 定期清除缓存，强制重新读取文件
setInterval(() => {
  cookieCache.clear()
}, COOKIE_TTL)

// 启动文件监听
const cookieDir = resolve(process.cwd(), 'cookie')
let watcher = null

async function startWatcher () {
  try {
    watcher = watch(cookieDir)
    for await (const event of watcher) {
      if (event.filename) {
        cookieCache.delete(event.filename)
      } else {
        // 无法获取文件名时清空全部缓存，确保变更即时生效
        cookieCache.clear()
      }
    }
  } catch {
    // 监听失败不影响正常运行
  }
}

// 启动监听（仅启动一次）
if (!watcher) {
  startWatcher().catch(() => {})
}

/**
 * 读取指定平台的 cookie 文件
 * @param {string} server - 平台名称 (netease, tencent 等)
 * @returns {Promise<string>} cookie 字符串，失败时返回空字符串
 */
export async function readCookieFile (server) {
  const now = Date.now()
  const cookiePath = resolve(process.cwd(), 'cookie', server)
  const cached = cookieCache.get(server)

  if (cached && now - cached.timestamp < COOKIE_TTL) {
    if (cached.source === 'file') {
      try {
        const stats = await stat(cookiePath)
        if (stats.mtimeMs === cached.mtimeMs) {
          return cached.value
        }
      } catch {
        // 文件不存在或读取失败，继续重新加载
      }
    } else {
      return cached.value
    }
  }

  try {
    const cookie = await readFile(cookiePath, 'utf-8')
    const value = cookie.trim()
    if (value) {
      let mtimeMs = 0
      try {
        const stats = await stat(cookiePath)
        mtimeMs = stats.mtimeMs
      } catch {
        // ignore
      }
      cookieCache.set(server, {
        value,
        timestamp: now,
        source: 'file',
        mtimeMs
      })
      return value
    }
  } catch {
    // 文件读取失败，继续检查环境变量
  }

  const envKey = `METING_COOKIE_${server.toUpperCase()}`
  const envCookie = process.env[envKey]
  if (envCookie) {
    const value = envCookie.trim()
    cookieCache.set(server, {
      value,
      timestamp: now,
      source: 'env'
    })
    return value
  }

  cookieCache.set(server, {
    value: '',
    timestamp: now,
    source: 'none'
  })
  return ''
}

/**
 * 验证 referrer 是否在允许的主机列表中
 * @param {string} referrer - 请求的 referrer
 * @returns {boolean} 是否允许
 */
export function isAllowedHost (referrer) {
  if (config.meting.cookie.allowHosts.length === 0) return true
  if (!referrer) return false

  try {
    const url = new URL(referrer)
    const hostname = url.hostname.toLowerCase()
    return config.meting.cookie.allowHosts.includes(hostname)
  } catch {
    return false
  }
}
