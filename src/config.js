/**
 * @file config.js
 * @description 应用配置模块 - 从环境变量读取并解析为结构化配置对象
 *              支持 HTTP/HTTPS 服务配置、Meting API 配置及 Cookie 安全策略
 */

/**
 * 将环境变量值转换为布尔类型
 * 支持的真值: '1', 'true', 'yes', 'on'（不区分大小写）
 * @param {string|undefined} value - 环境变量值
 * @returns {boolean} 布尔结果
 */
const toBoolean = value => {
  if (value === undefined) return false
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase())
}

/**
 * 将环境变量值转换为数字，解析失败时返回默认值
 * @param {string|undefined} value - 环境变量值
 * @param {number} fallback - 解析失败时的默认值
 * @returns {number} 解析后的数字或默认值
 */
const toNumber = (value, fallback) => {
  const parsed = Number.parseInt(value, 10)
  return Number.isNaN(parsed) ? fallback : parsed
}

export default {
  // HTTP 服务配置
  http: {
    prefix: process.env.HTTP_PREFIX || '', // 路由前缀（如设为 '/v1' 则访问 /v1/api）
    port: toNumber(process.env.HTTP_PORT, 80) // HTTP 监听端口，默认 80
  },
  // HTTPS 服务配置
  https: {
    enabled: toBoolean(process.env.HTTPS_ENABLED), // 是否启用 HTTPS
    port: toNumber(process.env.HTTPS_PORT, 443), // HTTPS 监听端口，默认 443
    keyPath: process.env.SSL_KEY_PATH || '', // SSL 私钥文件路径
    certPath: process.env.SSL_CERT_PATH || '' // SSL 证书文件路径
  },
  // Meting API 相关配置
  meting: {
    url: process.env.METING_URL || '', // 公网访问地址，用于生成回调 URL
    token: process.env.METING_TOKEN || 'token', // HMAC 签名密钥，用于敏感操作的鉴权 token 计算
    // Cookie 安全策略配置
    cookie: {
      // Cookie referrer 白名单：限制哪些来源域名可使用 Cookie，空数组表示不限制
      allowHosts: process.env.METING_COOKIE_ALLOW_HOSTS
        ? (process.env.METING_COOKIE_ALLOW_HOSTS).split(',').map(h => h.trim().toLowerCase())
        : []
    }
  }
}
