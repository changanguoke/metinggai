/**
 * @file admin.js
 * @description 管理员权限校验中间件 - 检查当前用户是否具备管理员角色，
 *              需配合 auth 中间件使用，确保 ctx.user 已被正确注入
 */

import { HTTPException } from '../utils/http-exception.js'

/**
 * 高阶函数：为业务处理器添加管理员权限校验
 * 检查上下文中的用户信息，非管理员用户将收到 403 错误
 *
 * @param {Function} handler - 业务处理函数
 * @returns {Function} 包装后的处理函数，非管理员请求将返回 403 错误
 */
export function withAdmin (handler) {
  return async (request, ctx) => {
    // 检查用户是否已认证且角色为管理员（super_admin 或 admin 均可）
    if (!ctx.user || (ctx.user.role !== 'admin' && ctx.user.role !== 'super_admin')) {
      throw new HTTPException(403, { message: '需要管理员权限' })
    }

    return handler(request, ctx)
  }
}
