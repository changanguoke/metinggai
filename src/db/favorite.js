/**
 * @file favorite.js
 * @description 收藏 CRUD 操作 - 提供收藏的创建、查询、删除和存在性检查功能
 */

import { pool } from './index.js'

/**
 * 添加收藏
 * @param {Object} data - 收藏数据
 * @param {number} data.userId - 用户 ID
 * @param {string} data.server - 音乐平台
 * @param {string} data.songId - 歌曲 ID
 * @param {string} [data.songName] - 歌曲名称
 * @param {string} [data.artist] - 歌手
 * @param {string} [data.album] - 专辑
 * @returns {Promise<Object>} 插入的收藏记录
 * @throws {Error} 重复收藏时抛出错误
 */
export async function create ({ userId, server, songId, songName, artist, album }) {
  const [result] = await pool.execute(
    'INSERT INTO favorites (user_id, server, song_id, song_name, artist, album) VALUES (?, ?, ?, ?, ?, ?)',
    [userId, server, songId, songName, artist, album]
  )
  const [rows] = await pool.execute(
    'SELECT * FROM favorites WHERE id = ?',
    [result.insertId]
  )
  return rows[0]
}

/**
 * 获取用户的收藏列表
 * @param {number} userId - 用户 ID
 * @returns {Promise<Array>} 收藏列表，按创建时间倒序排列
 */
export async function findByUserId (userId) {
  const [rows] = await pool.execute(
    'SELECT * FROM favorites WHERE user_id = ? ORDER BY created_at DESC',
    [userId]
  )
  return rows
}

/**
 * 删除收藏（仅允许删除自己的收藏）
 * @param {number} id - 收藏记录 ID
 * @param {number} userId - 用户 ID（用于权限校验）
 * @returns {Promise<boolean>} 是否删除成功
 */
export async function deleteById (id, userId) {
  const [result] = await pool.execute(
    'DELETE FROM favorites WHERE id = ? AND user_id = ?',
    [id, userId]
  )
  return result.affectedRows > 0
}

/**
 * 检查收藏是否已存在
 * @param {number} userId - 用户 ID
 * @param {string} server - 音乐平台
 * @param {string} songId - 歌曲 ID
 * @returns {Promise<boolean>} 是否已收藏
 */
export async function exists (userId, server, songId) {
  const [rows] = await pool.execute(
    'SELECT 1 AS found FROM favorites WHERE user_id = ? AND server = ? AND song_id = ? LIMIT 1',
    [userId, server, songId]
  )
  return rows.length > 0
}

/**
 * 删除用户的所有收藏
 * @param {number} userId - 用户 ID
 * @returns {Promise<number>} 删除的记录数
 */
export async function deleteByUserId (userId) {
  const [result] = await pool.execute(
    'DELETE FROM favorites WHERE user_id = ?',
    [userId]
  )
  return result.affectedRows
}
