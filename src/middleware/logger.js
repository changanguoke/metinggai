/**
 * @file logger.js
 * @description 请求日志中间件 - 基于 pino 日志库实现
 *              为每个请求生成唯一 requestId，记录请求/响应信息及耗时，
 *              并支持在上下文中传递请求级 logger 实例
 */

import pino from 'pino'

// 创建全局 pino logger 实例
// 生产环境输出 JSON 格式日志（便于 ELK 等日志系统采集）
// 开发环境使用 pino-pretty 插件输出可读性更好的彩色日志
const logger = pino({
  level: process.env.LOG_LEVEL || 'debug',
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty' }
    : undefined
})

/**
 * 生成随机请求 ID（7 位随机字符串，用于关联同一请求的所有日志）
 * @returns {string} 随机请求 ID
 */
const generateRequestId = () => Math.random().toString(36).substring(7)

/**
 * 高阶函数：包装业务处理器，为其注入请求日志能力
 *
 * @param {Function} handler - 业务处理函数 (request, ctx) => Response
 * @returns {Function} 包装后的处理函数，自动完成日志记录和上下文注入
 */
const withRequestLogger = (handler) => {
  return async (request) => {
    // 生成本次请求的唯一标识
    const requestId = generateRequestId()
    // 记录请求开始时间，用于计算响应耗时
    const startTime = performance.now()
    const url = new URL(request.url)

    // 提取请求基本信息
    const reqInfo = {
      method: request.method,
      url: url.pathname,
      headers: Object.fromEntries(request.headers)
    }

    // 创建请求级 logger（携带请求信息的子 logger，方便追踪单个请求的完整日志链路）
    const requestScopedLogger = logger.child({ req: reqInfo })

    // 构建请求上下文对象，供下游中间件和服务共享状态
    const ctx = {
      logger: requestScopedLogger,
      requestId,
      responseHeaders: new Headers(),
      error: null
    }

    // 执行实际的处理逻辑（可能是 router 或其他中间件包装后的函数）
    let response = await handler(request, ctx)

    // 将 ctx 中收集的自定义响应头合并到最终响应中
    const mergedHeaders = new Headers(response.headers)
    for (const [key, value] of ctx.responseHeaders) {
      mergedHeaders.set(key, value)
    }
    // 写入请求 ID 到响应头，方便客户端排查问题
    mergedHeaders.set('x-request-id', requestId)

    // 用合并后的响应头重新构建 Response 对象
    response = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: mergedHeaders
    })

    // 记录响应日志：包含状态码、响应头和耗时
    const responseTime = Math.round(performance.now() - startTime)

    // 序列化响应头为普通对象（Headers 对象无法直接 JSON 序列化）
    const responseHeaders = {}
    for (const [key, value] of response.headers.entries()) {
      responseHeaders[key] = value
    }

    // 构建日志绑定数据
    const bindings = {
      reqId: requestId,
      res: {
        status: response.status,
        headers: responseHeaders
      },
      responseTime
    }

    // 根据是否有错误选择日志级别：有错用 error，正常用 info
    const level = ctx.error ? 'error' : 'info'
    const message = ctx.error?.message || 'Request completed'

    requestScopedLogger[level](bindings, message)

    return response
  }
}

export { withRequestLogger, logger }
