/**
 * @file cookie.js
 * @description Cookie 管理工具 - 负责各音乐平台 Cookie 的读取、缓存和白名单校验
 *              Cookie 来源优先级：环境变量 > 文件系统（./cookie/{server}）
 *              支持 5 分钟 TTL 缓存、文件变更监听和 referrer 白名单安全策略
 */

import { readFile, stat, watch } from 'node:fs/promises'
import { resolve } from 'node:path'
import { URL } from 'node:url'

import config from '../config.js'

// Cookie 内存缓存（Map 结构，key 为平台名称）
const cookieCache = new Map()
const COOKIE_TTL = 1000 * 60 * 5 // 缓存有效期：5 分钟

// 定期清除全部缓存，强制下次读取时重新从文件/环境变量加载
// 这是一种兜底机制，确保 Cookie 变更最多在 5 分钟后生效
setInterval(() => {
  cookieCache.clear()
}, COOKIE_TTL)

// 文件变更监听
// 监听 cookie 目录下的文件变更，实现近实时的缓存失效
const cookieDir = resolve(process.cwd(), 'cookie')
let watcher = null

/**
 * 启动文件系统监听器，当 cookie 文件被修改时立即清除对应缓存
 */
async function startWatcher () {
  try {
    watcher = watch(cookieDir)
    for await (const event of watcher) {
      if (event.filename) {
        // 知道具体是哪个文件变更，只清除该文件的缓存
        cookieCache.delete(event.filename)
      } else {
        // 无法确定具体文件时清空全部缓存，确保变更即时生效
        cookieCache.clear()
      }
    }
  } catch {
    // cookie 目录不存在或监听失败不影响主流程正常运行
  }
}

// 启动监听（仅执行一次，防止重复创建 watcher）
if (!watcher) {
  startWatcher().catch(() => {})
}

/**
 * 读取指定平台的 Cookie
 * 读取优先级：1. 文件系统 ./cookie/{server}  2. 环境变量 METING_COOKIE_{SERVER}
 * 结果会被缓存，支持 TTL 过期和文件 mtime 变更检测
 *
 * @param {string} server - 平台名称（netease/tencent/kugou/baidu/kuwo）
 * @returns {Promise<string>} Cookie 字符串，无可用 Cookie 时返回空字符串
 */
export async function readCookieFile (server) {
  const now = Date.now()
  const cookiePath = resolve(process.cwd(), 'cookie', server)
  const cached = cookieCache.get(server)

  // 检查内存缓存是否有效
  if (cached && now - cached.timestamp < COOKIE_TTL) {
    if (cached.source === 'file') {
      // 文件来源的缓存额外检查文件修改时间，文件变更则重新加载
      try {
        const stats = await stat(cookiePath)
        if (stats.mtimeMs === cached.mtimeMs) {
          return cached.value
        }
      } catch {
        // 文件不存在或读取失败，继续走重新加载流程
      }
    } else {
      // 环境变量来源的缓存无需检查 mtime，直接返回
      return cached.value
    }
  }

  // 第一优先级：从文件系统读取 Cookie
  try {
    const cookie = await readFile(cookiePath, 'utf-8')
    const value = cookie.trim()
    if (value) {
      // 记录文件修改时间，用于后续缓存有效性判断
      let mtimeMs = 0
      try {
        const stats = await stat(cookiePath)
        mtimeMs = stats.mtimeMs
      } catch {
        // 文件状态读取失败，使用默认值
      }
      cookieCache.set(server, {
        value,
        timestamp: now,
        source: 'file', // 标记来源为文件
        mtimeMs
      })
      return value
    }
  } catch {
    // 文件读取失败（可能文件不存在），继续检查环境变量
  }

  // 第二优先级：从环境变量读取 Cookie
  // 环境变量命名规则：METING_COOKIE_{SERVER}（如 METING_COOKIE_NETEASE）
  const envKey = `METING_COOKIE_${server.toUpperCase()}`
  const envCookie = process.env[envKey]
  if (envCookie) {
    const value = envCookie.trim()
    cookieCache.set(server, {
      value,
      timestamp: now,
      source: 'env' // 标记来源为环境变量
    })
    return value
  }

  // 无可用 Cookie，缓存空结果避免频繁重复尝试
  cookieCache.set(server, {
    value: '',
    timestamp: now,
    source: 'none' // 标记无来源
  })
  return ''
}

/**
 * 验证请求的 referrer 是否在允许的主机白名单中
 * 用于安全控制：只有白名单内的域名来源才能使用 Cookie，防止 Cookie 被第三方网站窃取利用
 *
 * @param {string} referrer - 请求头中的 referer 值
 * @returns {boolean} true 表示允许使用 Cookie，false 表示拒绝
 */
export function isAllowedHost (referrer) {
  // 白名单为空表示不限制（允许所有来源）
  if (config.meting.cookie.allowHosts.length === 0) return true
  // 无 referrer 信息时不允许使用 Cookie
  if (!referrer) return false

  try {
    const url = new URL(referrer)
    const hostname = url.hostname.toLowerCase()
    return config.meting.cookie.allowHosts.includes(hostname)
  } catch {
    // referrer 不是合法 URL 时拒绝
    return false
  }
}
