/**
 * @file jwt.js
 * @description JWT 令牌签发与验证工具 - 手写 HMAC-SHA256 实现，无外部依赖
 *              使用 node:crypto 进行签名，支持令牌过期校验
 */

import { createHmac } from 'node:crypto'

// 密钥：优先从环境变量读取，回退到默认值
const SECRET = process.env.JWT_SECRET || 'meting-jwt-secret'

// 令牌有效期：7 天（单位：秒）
const EXPIRES_IN = 7 * 24 * 60 * 60

/**
 * 将字符串进行 base64url 编码
 * base64url 是标准 base64 的 URL 安全变体，去除填充符 '='
 *
 * @param {string} str - 待编码的字符串
 * @returns {string} base64url 编码结果
 */
function base64urlEncode (str) {
  return Buffer.from(str).toString('base64url')
}

/**
 * 签发 JWT 令牌
 * 将头部和载荷分别 base64url 编码后，用 HMAC-SHA256 生成签名，拼接为标准 JWT 格式
 *
 * @param {object} payload - 载荷数据，需包含 sub（用户ID）和 role（用户角色）
 * @param {string} payload.sub - 用户唯一标识
 * @param {string} payload.role - 用户角色
 * @returns {Promise<string>} 签发后的 JWT 令牌字符串
 */
export async function sign (payload) {
  const header = { alg: 'HS256', typ: 'JWT' }

  const now = Math.floor(Date.now() / 1000)
  const jwtPayload = {
    sub: payload.sub,
    role: payload.role,
    iat: now,
    exp: now + EXPIRES_IN
  }

  const headerB64 = base64urlEncode(JSON.stringify(header))
  const payloadB64 = base64urlEncode(JSON.stringify(jwtPayload))

  // 使用 HMAC-SHA256 对 "header.payload" 部分签名
  const signature = createHmac('sha256', SECRET)
    .update(`${headerB64}.${payloadB64}`)
    .digest('hex')
  const signatureB64 = base64urlEncode(signature)

  return `${headerB64}.${payloadB64}.${signatureB64}`
}

/**
 * 验证并解码 JWT 令牌
 * 重新计算签名并与令牌中的签名比对，同时检查 exp 过期时间
 *
 * @param {string} token - 待验证的 JWT 令牌字符串
 * @returns {Promise<object|null>} 验证通过返回解码后的载荷对象，验证失败或已过期返回 null
 */
export async function verify (token) {
  // 令牌格式校验：必须为三段式结构
  const parts = token.split('.')
  if (parts.length !== 3) return null

  const [headerB64, payloadB64, signatureB64] = parts

  // 重新计算签名并与令牌中的签名比对
  const expectedSignature = createHmac('sha256', SECRET)
    .update(`${headerB64}.${payloadB64}`)
    .digest('hex')
  const expectedSignatureB64 = base64urlEncode(expectedSignature)

  if (signatureB64 !== expectedSignatureB64) return null

  // 解码载荷并检查过期时间
  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'))
    const now = Math.floor(Date.now() / 1000)
    if (payload.exp && now > payload.exp) return null
    return payload
  } catch {
    // 载荷解析失败，视为无效令牌
    return null
  }
}
