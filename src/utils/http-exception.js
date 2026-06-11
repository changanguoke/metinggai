/**
 * @file http-exception.js
 * @description 自定义 HTTP 异常类 - 用于在业务逻辑中抛出带有 HTTP 状态码的错误
 *              被 errors 中间件捕获后转换为对应的 HTTP 错误响应
 */

export class HTTPException extends Error {
  /**
   * 创建 HTTP 异常实例
   *
   * @param {number} status - HTTP 状态码（如 400/401/404/500）
   * @param {object} options - 配置选项
   * @param {string} options.message - 错误消息（会通过 x-error-message 响应头传递给客户端）
   */
  constructor (status, options = {}) {
    super(options.message || 'Unknown Error')
    this.status = status // HTTP 状态码，供 errors 中间件读取
    this.name = 'HTTPException' // 固定错误类名，便于日志中识别异常类型
  }
}
