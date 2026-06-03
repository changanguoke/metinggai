import { logger as baseLogger } from './logger.js'

export function withErrorHandler (handler) {
  return async (request, ctx) => {
    try {
      return await handler(request, ctx)
    } catch (err) {
      if (err?.kind === 'ObjectId') {
        err.status = 404
      }
      const status = err.status || 500

      // 获取请求级 logger，如未设置则回退到全局 logger
      const requestLogger = ctx.logger ?? baseLogger
      const url = new URL(request.url)

      // 记录结构化错误日志
      const logPayload = {
        error: {
          message: err.message,
          stack: err.stack,
          name: err.name,
          status
        },
        request: {
          method: request.method,
          path: url.pathname,
          query: Object.fromEntries(url.searchParams),
          userAgent: request.headers.get('user-agent'),
          ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
        }
      }

      if (ctx.requestId) {
        logPayload.request.requestId = ctx.requestId
      }

      requestLogger.error(logPayload, 'Request error occurred')

      ctx.responseHeaders.set('x-error-message', encodeURIComponent(err.message))
      ctx.error = err

      return new Response('服务器未知异常', {
        status,
        headers: { 'content-type': 'text/plain; charset=utf-8' }
      })
    }
  }
}
