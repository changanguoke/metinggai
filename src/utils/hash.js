/**
 * @file hash.js
 * @description 密码哈希与验证工具 - 基于 Bun.password 的 bcrypt 实现
 *              提供密码哈希生成和哈希比对两个异步方法
 */

/**
 * 对明文密码进行哈希处理
 * 使用 Bun.password.hash 配合 bcrypt 算法生成安全的密码哈希值
 *
 * @param {string} password - 待哈希的明文密码
 * @returns {Promise<string>} bcrypt 哈希字符串
 */
export async function hashPassword (password) {
  return Bun.password.hash(password, { algorithm: 'bcrypt' })
}

/**
 * 验证明文密码与哈希值是否匹配
 * 使用 Bun.password.verify 进行安全的恒定时间比对
 *
 * @param {string} password - 待验证的明文密码
 * @param {string} hash - 之前生成的 bcrypt 哈希值
 * @returns {Promise<boolean>} 密码匹配返回 true，不匹配返回 false
 */
export async function verifyPassword (password, hash) {
  return Bun.password.verify(password, hash)
}
