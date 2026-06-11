/**
 * @file verify-code.js
 * @description 验证码 CRUD 操作 - 提供验证码的创建、查询、标记已使用和清理功能
 */

import { pool } from './index.js'

// 验证码有效期：5 分钟
const CODE_TTL_MS = 5 * 60 * 1000

/**
 * 创建验证码
 * @param {Object} data - 验证码数据
 * @param {string} data.email - 邮箱
 * @param {string} data.code - 验证码
 * @param {string} data.type - 类型（register/reset）
 * @returns {Promise<Object>} 插入的验证码记录
 */
export async function create ({ email, code, type }) {
  const [result] = await pool.execute(
    'INSERT INTO verify_codes (email, code, type, expires_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 5 MINUTE))',
    [email, code, type]
  )
  const [rows] = await pool.execute(
    'SELECT * FROM verify_codes WHERE id = ?',
    [result.insertId]
  )
  return rows[0]
}

/**
 * 查找有效的验证码（未使用且未过期）
 * @param {string} email - 邮箱
 * @param {string} code - 验证码
 * @param {string} type - 类型（register/reset）
 * @returns {Promise<Object|null>} 验证码记录，未找到返回 null
 */
export async function findValid (email, code, type) {
  const [rows] = await pool.execute(
    'SELECT * FROM verify_codes WHERE email = ? AND code = ? AND type = ? AND used = FALSE AND expires_at > NOW()',
    [email, code, type]
  )
  return rows[0] || null
}

/**
 * 标记验证码为已使用
 * @param {number} id - 验证码 ID
 * @returns {Promise<void>}
 */
export async function markUsed (id) {
  await pool.execute(
    'UPDATE verify_codes SET used = TRUE WHERE id = ?',
    [id]
  )
}

/**
 * 查找某邮箱最新发送的验证码（用于频率限制）
 * @param {string} email - 邮箱
 * @param {string} type - 类型（register/reset）
 * @returns {Promise<Object|null>} 最新的验证码记录，未找到返回 null
 */
export async function findLatestByEmail (email, type) {
  const [rows] = await pool.execute(
    'SELECT * FROM verify_codes WHERE email = ? AND type = ? ORDER BY created_at DESC LIMIT 1',
    [email, type]
  )
  return rows[0] || null
}

/**
 * 清理已过期的验证码
 * @returns {Promise<number>} 删除的记录数
 */
export async function cleanExpired () {
  const [result] = await pool.execute(
    'DELETE FROM verify_codes WHERE expires_at < NOW()'
  )
  return result.affectedRows
}
