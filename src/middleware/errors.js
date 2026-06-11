/**
 * @file errors.js
 * @description 统一错误处理中间件 - 捕获业务逻辑中抛出的所有异常，
 *              记录结构化错误日志，并通过 x-error-message 响应头向客户端传递错误信息
 */

import { logger as baseLogger } from './logger.js'

/**
 * 高阶函数：包装业务处理器，为其添加统一的异常捕获和处理能力
 *
 * @param {Function} handler - 业务处理函数
 * @returns {Function} 包装后的处理函数，任何未捕获异常都会被友好地转换为 HTTP 错误响应
 */
export function withErrorHandler (handler) {
  return async (request, ctx) => {
    try {
      return await handler(request, ctx)
    } catch (err) {
      // 特殊处理 MongoDB ObjectId 格式错误（如路由参数中的无效 ID）
      if (err?.kind === 'ObjectId') {
        err.status = 404
      }

      // 默认使用 500 作为错误状态码（除非异常对象自带 status 属性）
      const status = err.status || 500

      // 获取请求级 logger（如果中间件链中已创建），否则回退到全局 logger
      const requestLogger = ctx.logger ?? baseLogger
      const url = new URL(request.url)

      // 构建结构化错误日志 payload，包含完整的错误栈和请求上下文
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

      // 关联请求 ID，方便在日志系统中按请求追踪
      if (ctx.requestId) {
        logPayload.request.requestId = ctx.requestId
      }

      // 输出错误日志（JSON 格式，便于日志采集系统分析）
      requestLogger.error(logPayload, 'Request error occurred')

      // 通过自定义响应头传递错误消息（URL 编码，防止特殊字符破坏 HTTP 协议）
      ctx.responseHeaders.set('x-error-message', encodeURIComponent(err.message))
      // 标记上下文中有错误发生（供 logger 中间件选择日志级别）
      ctx.error = err

      // 返回 JSON 格式的错误响应（前端统一按 JSON 解析）
      return Response.json({ success: false, message: err.message || '服务器未知异常' }, { status })
    }
  }
}
