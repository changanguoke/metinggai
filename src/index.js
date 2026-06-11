/**
 * @file index.js
 * @description 应用入口文件 - 使用 Bun.serve 启动 HTTP/HTTPS 服务器
 *              负责中间件组合、CORS 处理、路由分派及服务启动
 */

// Node 内置模块
import { readFileSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

// 项目内部模块
import { withRequestLogger, logger } from './middleware/logger.js'
import { withErrorHandler } from './middleware/errors.js'
import { withAuth, optionalAuth } from './middleware/auth.js'
import { withAdmin } from './middleware/admin.js'
import apiService from './service/api.js'
import demoService from './service/demo.js'
import signService from './service/sign.js'
import authService from './service/auth.js'
import userDataService from './service/user-data.js'
import adminService from './service/admin.js'
import adminPageService from './service/admin-page.js'
import installService from './service/install.js'
import installPageService from './service/install-page.js'
import { isInstalled } from './service/install.js'
import config from './config.js'
import { initDB } from './db/index.js'
import { startAutoBackup } from './service/backup.js'

// 安装状态缓存（10秒TTL，避免每次请求都查数据库）
let _installedCache = null
let _installedCacheTime = 0

/**
 * 检查系统是否已完成安装，带 10 秒缓存
 * @returns {Promise<boolean>} 是否已安装
 */
async function checkInstalled () {
  const now = Date.now()
  if (_installedCache !== null && now - _installedCacheTime < 10000) {
    return _installedCache
  }
  try {
    _installedCache = await isInstalled()
    _installedCacheTime = now
  } catch {
    _installedCache = false
    _installedCacheTime = now
  }
  return _installedCache
}

// CORS 跨域响应头配置
const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, HEAD, POST, PUT, DELETE, OPTIONS',
  'access-control-allow-headers': 'Content-Type, Authorization',
  'access-control-max-age': '86400' // 预检请求缓存时间（24 小时）
}

// Cross-Origin 隔离头（ffmpeg.wasm 需要 SharedArrayBuffer）
// 使用 credentialless 而非 require-corp，允许加载无 CORP 头的跨域资源
const COI_HEADERS = {
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-embedder-policy': 'credentialless'
}

/**
 * 为响应添加 CORS 响应头
 * @param {Response} response - 原始响应对象
 * @returns {Response} 添加了 CORS 头的新响应对象
 */
function addCorsHeaders (response) {
  const headers = new Headers(response.headers)
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value)
  }
  // 对 HTML 页面添加 Cross-Origin 隔离头，使 ffmpeg.wasm 可用 SharedArrayBuffer
  const contentType = headers.get('content-type') || ''
  if (contentType.includes('text/html') || contentType.includes('application/javascript') || contentType.includes('image/svg+xml')) {
    for (const [key, value] of Object.entries(COI_HEADERS)) {
      headers.set(key, value)
    }
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  })
}

// MIME 类型映射
const MIME_TYPES = {
  '.js': 'application/javascript',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.html': 'text/html',
  '.css': 'text/css'
}

// 静态文件缓存（启动时读取，避免每次请求读磁盘）
const staticFileCache = new Map()

/**
 * 静态文件服务 - 提供 /static/ 下的文件
 * ffmpeg.wasm 文件需要从同源加载，否则 Worker 创建会被浏览器安全策略阻止
 * @param {string} pathname - 请求路径
 * @returns {Response|null} 文件响应或 null
 */
function serveStatic (pathname) {
  if (!pathname.startsWith('/static/')) return null
  // 安全检查：防止路径遍历
  const relativePath = pathname.replace(/^\/static\//, '')
  if (relativePath.includes('..')) return null

  // 从缓存获取
  const cached = staticFileCache.get(relativePath)
  if (cached) return new Response(cached.data, { headers: cached.headers })

  const filePath = join(import.meta.dir, '..', 'static', relativePath)
  try {
    if (!statSync(filePath).isFile()) return null
    const data = readFileSync(filePath)
    const ext = extname(filePath)
    const contentType = MIME_TYPES[ext] || 'application/octet-stream'
    const headers = { 'Content-Type': contentType }
    // JS 和 WASM 文件添加 COI 头，确保 ffmpeg.wasm 可用 SharedArrayBuffer
    if (ext === '.js' || ext === '.wasm') {
      headers['cross-origin-opener-policy'] = 'same-origin'
      headers['cross-origin-embedder-policy'] = 'credentialless'
    }
    // 缓存文件内容
    staticFileCache.set(relativePath, { data, headers })
    return new Response(data, { headers })
  } catch {
    return null
  }
}

/**
 * 路由调度器 - 根据请求方法和路径分发到对应的服务处理函数
 * @param {Request} request - 请求对象
 * @param {object} ctx - 请求上下文
 * @returns {Promise<Response>} 响应对象
 */
async function router (request, ctx) {
  const url = new URL(request.url)
  const pathname = url.pathname

  // 静态文件路由（无需安装检查和认证）
  const staticResponse = serveStatic(pathname)
  if (staticResponse) return staticResponse

  // 安装向导页面路由（无需认证）
  if (pathname === `${config.http.prefix}/install`) {
    return installPageService()
  }

  // 安装向导 API 路由（无需认证）
  if (pathname.startsWith(`${config.http.prefix}/api/install`)) {
    const result = await installService(request, ctx)
    // 安装操作后清除缓存，使安装状态守卫立即生效
    _installedCache = null
    return result
  }

  // 安装状态检查 - 未安装时所有其他请求重定向到 /install
  if (!await checkInstalled()) {
    // API 请求返回 JSON，页面请求重定向
    if (pathname.startsWith('/api/')) {
      return Response.json({ success: false, message: '请先完成系统安装' }, { status: 403 })
    }
    return new Response(null, {
      status: 302,
      headers: { Location: `${config.http.prefix}/install` }
    })
  }

  // 认证服务路由（无需认证，由 authService 内部判断）
  if (pathname.startsWith(`${config.http.prefix}/api/auth/`)) {
    return authService(request, ctx)
  }

  // 用户数据路由（需要认证）
  if (pathname.startsWith(`${config.http.prefix}/api/user/`)) {
    return withAuth(userDataService)(request, ctx)
  }

  // 管理后台 API 路由（需要认证 + 管理员权限）
  if (pathname.startsWith(`${config.http.prefix}/api/admin/`)) {
    return withAuth(withAdmin(adminService))(request, ctx)
  }

  // 管理后台页面路由
  if (pathname === `${config.http.prefix}/admin`) {
    return adminPageService(request)
  }

  // 核心 API 路由 - 音乐搜索、歌曲、专辑等
  if (request.method === 'GET' && pathname === `${config.http.prefix}/api`) {
    return apiService(request, ctx)
  }

  // Demo 演示页面路由
  if (request.method === 'GET' && pathname === `${config.http.prefix}/demo`) {
    return demoService(request)
  }

  // 签名获取路由 - 管理员获取 HMAC 鉴权 token
  if (request.method === 'GET' && pathname === `${config.http.prefix}/api/sign`) {
    return signService(request)
  }

  // 未匹配的路由返回 404
  return new Response('Not Found', { status: 404 })
}

// 组合中间件链: 日志记录 → 错误处理 → 路由调度
const handler = withRequestLogger(withErrorHandler(router))

// HTTP 服务器启动
Bun.serve({
  port: config.http.port,
  async fetch (request) {
    // OPTIONS 预检请求直接返回 204 No Content
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS })
    }
    // 经过中间件处理后，统一添加 CORS 响应头
    const response = await handler(request)
    return addCorsHeaders(response)
  }
})

logger.info({ port: config.http.port }, 'HTTP server started')

// 初始化数据库（首次部署时可能尚未配置，失败不阻塞启动，用户需通过 /install 向导配置）
initDB().then(() => {
  logger.info('数据库初始化完成')
  // 启动自动备份定时器
  startAutoBackup()
}).catch(err => {
  logger.warn({ error: err.message }, '数据库初始化失败，如首次部署请访问 /install 进行配置')
})

// HTTPS 服务器启动（可选）
if (config.https.enabled) {
  // 校验 SSL 证书文件路径是否已配置
  if (!config.https.keyPath || !config.https.certPath) {
    logger.error('HTTPS_ENABLED is true but SSL_KEY_PATH or SSL_CERT_PATH is not configured')
    process.exit(1)
  }

  let key
  let cert

  // 同步读取 SSL 证书文件
  try {
    key = readFileSync(config.https.keyPath)
    cert = readFileSync(config.https.certPath)
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to read SSL certificate files')
    process.exit(1)
  }

  // 启动 HTTPS 服务器，使用 TLS 加密
  Bun.serve({
    port: config.https.port,
    tls: { key, cert },
    async fetch (request) {
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS_HEADERS })
      }
      const response = await handler(request)
      return addCorsHeaders(response)
    }
  })

  logger.info({ port: config.https.port }, 'HTTPS server started')
} else {
  logger.info('HTTPS server is disabled')
}
