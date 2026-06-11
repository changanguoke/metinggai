/**
 * @file auth.js
 * @description JWT 认证中间件 - 为需要登录的接口提供身份验证能力，
 *              从请求头中提取并验证 JWT 令牌，将解码后的用户信息注入上下文
 */

import { verify } from '../utils/jwt.js'
import { HTTPException } from '../utils/http-exception.js'

/**
 * 高阶函数：为业务处理器添加强制 JWT 认证
 * 从 Authorization 头提取 Bearer 令牌并验证，验证失败则拒绝请求
 *
 * @param {Function} handler - 业务处理函数
 * @returns {Function} 包装后的处理函数，未认证请求将返回 401 错误
 */
export function withAuth (handler) {
  return async (request, ctx) => {
    // 从 Authorization 头提取 Bearer 令牌
    const authHeader = request.headers.get('authorization')
    let token = null

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7)
    }

    // 缺少令牌，拒绝请求
    if (!token) {
      throw new HTTPException(401, { message: '认证失败或 token 已过期' })
    }

    // 验证 JWT 令牌
    const payload = await verify(token)
    if (!payload) {
      throw new HTTPException(401, { message: '认证失败或 token 已过期' })
    }

    // 将解码后的用户信息注入上下文，供后续处理器使用
    ctx.user = { id: payload.sub, role: payload.role }

    return handler(request, ctx)
  }
}

/**
 * 高阶函数：为业务处理器添加可选 JWT 认证
 * 与 withAuth 逻辑相同，但令牌缺失或无效时不拒绝请求，仅将 ctx.user 置为 null
 *
 * @param {Function} handler - 业务处理函数
 * @returns {Function} 包装后的处理函数，无论认证是否成功均放行
 */
export function optionalAuth (handler) {
  return async (request, ctx) => {
    // 从 Authorization 头提取 Bearer 令牌
    const authHeader = request.headers.get('authorization')
    let token = null

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7)
    }

    // 无令牌时直接放行，ctx.user 置为 null
    if (!token) {
      ctx.user = null
      return handler(request, ctx)
    }

    // 验证 JWT 令牌，验证失败同样放行
    const payload = await verify(token)
    if (!payload) {
      ctx.user = null
      return handler(request, ctx)
    }

    // 将解码后的用户信息注入上下文
    ctx.user = { id: payload.sub, role: payload.role }

    return handler(request, ctx)
  }
}
