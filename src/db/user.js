/**
 * @file user.js
 * @description 用户 CRUD 操作 - 提供用户的创建、查询、更新和删除功能
 */

import { pool } from './index.js'

/**
 * 创建用户
 * @param {Object} data - 用户数据
 * @param {string} data.email - 邮箱
 * @param {string} data.username - 用户名
 * @param {string} data.passwordHash - 密码哈希
 * @param {string} [data.role='user'] - 角色（admin/user）
 * @param {boolean} [data.emailVerified=false] - 邮箱是否已验证
 * @returns {Promise<Object>} 插入的用户记录（含 id）
 */
export async function create ({ email, username, passwordHash, role = 'user', emailVerified = false }) {
  const [result] = await pool.execute(
    'INSERT INTO users (email, username, password_hash, role, email_verified) VALUES (?, ?, ?, ?, ?)',
    [email, username, passwordHash, role, emailVerified]
  )
  return findById(result.insertId)
}

/**
 * 根据邮箱查找用户
 * @param {string} email - 邮箱
 * @returns {Promise<Object|null>} 用户记录，未找到返回 null
 */
export async function findByEmail (email) {
  const [rows] = await pool.execute(
    'SELECT * FROM users WHERE email = ?',
    [email]
  )
  return rows[0] || null
}

/**
 * 根据用户名查找用户
 * @param {string} username - 用户名
 * @returns {Promise<Object|null>} 用户记录，未找到返回 null
 */
export async function findByUsername (username) {
  const [rows] = await pool.execute(
    'SELECT * FROM users WHERE username = ?',
    [username]
  )
  return rows[0] || null
}

/**
 * 根据 ID 查找用户
 * @param {number} id - 用户 ID
 * @returns {Promise<Object|null>} 用户记录，未找到返回 null
 */
export async function findById (id) {
  const [rows] = await pool.execute(
    'SELECT * FROM users WHERE id = ?',
    [id]
  )
  return rows[0] || null
}

/**
 * 获取所有用户（不含密码哈希）
 * @returns {Promise<Array>} 用户列表
 */
export async function findAll () {
  const [rows] = await pool.execute(
    'SELECT id, email, username, role, status, email_verified, created_at FROM users'
  )
  return rows
}

/**
 * 更新用户状态
 * @param {number} id - 用户 ID
 * @param {string} status - 状态（active/disabled）
 * @returns {Promise<Object|null>} 更新后的用户记录
 */
export async function updateStatus (id, status) {
  await pool.execute(
    'UPDATE users SET status = ? WHERE id = ?',
    [status, id]
  )
  return findById(id)
}

/**
 * 更新用户角色
 * @param {number} id - 用户 ID
 * @param {string} role - 角色（admin/user）
 * @returns {Promise<Object|null>} 更新后的用户记录
 */
export async function updateRole (id, role) {
  await pool.execute(
    'UPDATE users SET role = ? WHERE id = ?',
    [role, id]
  )
  return findById(id)
}

/**
 * 根据 ID 删除用户
 * @param {number} id - 用户 ID
 * @returns {Promise<boolean>} 是否删除成功
 */
export async function deleteById (id) {
  const [result] = await pool.execute(
    'DELETE FROM users WHERE id = ?',
    [id]
  )
  return result.affectedRows > 0
}

/**
 * 获取用户总数
 * @returns {Promise<number>} 用户数量
 */
export async function count () {
  const [rows] = await pool.execute('SELECT COUNT(*) AS total FROM users')
  return rows[0].total
}
