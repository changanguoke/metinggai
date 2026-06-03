import pino from 'pino'

const logger = pino({
  level: process.env.LOG_LEVEL || 'debug',
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty' }
    : undefined
})

const generateRequestId = () => Math.random().toString(36).substring(7)

const withRequestLogger = (handler) => {
  return async (request) => {
    const requestId = generateRequestId()
    const startTime = performance.now()
    const url = new URL(request.url)

    const reqInfo = {
      method: request.method,
      url: url.pathname,
      headers: Object.fromEntries(request.headers)
    }

    const requestScopedLogger = logger.child({ req: reqInfo })

    // 构建上下文对象
    const ctx = {
      logger: requestScopedLogger,
      requestId,
      responseHeaders: new Headers(),
      error: null
    }

    // 执行实际的处理逻辑
    let response = await handler(request, ctx)

    // 将 ctx.responseHeaders 合并到 response 中
    const mergedHeaders = new Headers(response.headers)
    for (const [key, value] of ctx.responseHeaders) {
      mergedHeaders.set(key, value)
    }
    mergedHeaders.set('x-request-id', requestId)

    response = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: mergedHeaders
    })

    // 记录响应日志
    const responseTime = Math.round(performance.now() - startTime)

    const responseHeaders = {}
    for (const [key, value] of response.headers.entries()) {
      responseHeaders[key] = value
    }

    const bindings = {
      reqId: requestId,
      res: {
        status: response.status,
        headers: responseHeaders
      },
      responseTime
    }

    const level = ctx.error ? 'error' : 'info'
    const message = ctx.error?.message || 'Request completed'

    requestScopedLogger[level](bindings, message)

    return response
  }
}

export {
  withRequestLogger,
  logger
}
