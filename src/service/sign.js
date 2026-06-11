/**
 * @file sign.js
 * @description 签名服务 - 为客户端提供 HMAC-SHA1 鉴权 token 的安全获取接口
 *              仅管理员（admin/super_admin）可调用，需要有效的 JWT Bearer Token
 */

// Node 内置
import { createHmac } from 'node:crypto'

// 项目内部
import config from '../config.js'
import { verify as verifyJwt } from '../utils/jwt.js'
import { HTTPException } from '../utils/http-exception.js'

/**
 * 处理签名获取请求
 * 验证 JWT 管理员身份 → 校验参数 → 生成 HMAC token 并返回
 *
 * @param {Request} request - HTTP 请求对象（需携带 Authorization Bearer token）
 * @returns {Response} JSON 响应，包含生成的 token 字符串
 */
export default async (request) => {
  // 1. 认证校验 - 需要管理员 JWT token
  const authHeader = request.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new HTTPException(401, { message: '认证失败，请先登录' })
  }

  const jwtToken = authHeader.substring(7)
  const payload = await verifyJwt(jwtToken)
  if (!payload || (payload.role !== 'admin' && payload.role !== 'super_admin')) {
    throw new HTTPException(403, { message: '权限不足，需要管理员权限' })
  }

  // 2. 解析查询参数
  const url = new URL(request.url)
  const server = url.searchParams.get('server')
  const type = url.searchParams.get('type')
  const id = url.searchParams.get('id')

  // 3. 必要参数校验
  if (!server || !type || !id) {
    throw new HTTPException(400, { message: '缺少必要参数 server/type/id' })
  }

  // 4. 平台白名单校验（与 api.js 保持一致的安全策略）
  if (!['netease', 'kugou'].includes(server)) {
    throw new HTTPException(400, { message: 'server 参数不合法' })
  }

  // 5. 使用 HMAC-SHA1 生成鉴权 token
  const token = createHmac('sha1', config.meting.token).update(`${server}${type}${id}`).digest('hex')

  return Response.json({ token })
}
