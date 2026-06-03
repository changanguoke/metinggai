import { readFileSync } from 'node:fs'
import { withRequestLogger, logger } from './middleware/logger.js'
import { withErrorHandler } from './middleware/errors.js'
import apiService from './service/api.js'
import demoService from './service/demo.js'
import verifyService from './service/verify.js'
import signService from './service/sign.js'
import config from './config.js'

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, HEAD, OPTIONS',
  'access-control-allow-headers': 'Content-Type, X-Session-Token',
  'access-control-max-age': '86400'
}

function addCorsHeaders (response) {
  const headers = new Headers(response.headers)
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value)
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  })
}

// 路由调度
async function router (request, ctx) {
  const url = new URL(request.url)
  const pathname = url.pathname

  if (request.method === 'GET' && pathname === `${config.http.prefix}/api`) {
    return apiService(request, ctx)
  }
  if (request.method === 'GET' && pathname === `${config.http.prefix}/demo`) {
    return demoService(request)
  }
  if (request.method === 'POST' && pathname === `${config.http.prefix}/api/verify`) {
    return verifyService(request)
  }
  if (request.method === 'GET' && pathname === `${config.http.prefix}/api/sign`) {
    return signService(request)
  }

  return new Response('Not Found', { status: 404 })
}

// 组合中间件: logger -> error handler -> router
const handler = withRequestLogger(withErrorHandler(router))

// HTTP 服务器
Bun.serve({
  port: config.http.port,
  async fetch (request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS })
    }
    const response = await handler(request)
    return addCorsHeaders(response)
  }
})

logger.info({ port: config.http.port }, 'HTTP server started')

// HTTPS 服务器
if (config.https.enabled) {
  if (!config.https.keyPath || !config.https.certPath) {
    logger.error('HTTPS_ENABLED is true but SSL_KEY_PATH or SSL_CERT_PATH is not configured')
    process.exit(1)
  }

  let key
  let cert

  try {
    key = readFileSync(config.https.keyPath)
    cert = readFileSync(config.https.certPath)
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to read SSL certificate files')
    process.exit(1)
  }

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
