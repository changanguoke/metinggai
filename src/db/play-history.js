/**
 * @file play-history.js
 * @description 播放历史 CRUD 操作 - 提供播放记录的创建、查询和删除功能
 *              每个用户最多保留 500 条播放历史，超出后自动删除最旧的记录
 */

import { pool } from './index.js'

// 每个用户最多保留的播放历史条数
const MAX_HISTORY_PER_USER = 500

/**
 * 创建播放记录
 * 插入后检查用户播放历史数量，超过上限则删除最旧的记录
 * @param {Object} data - 播放记录数据
 * @param {number} data.userId - 用户 ID
 * @param {string} data.server - 音乐平台
 * @param {string} data.songId - 歌曲 ID
 * @param {string} [data.songName] - 歌曲名称
 * @param {string} [data.artist] - 歌手
 * @param {string} [data.album] - 专辑
 * @returns {Promise<Object>} 插入的播放记录
 */
export async function create ({ userId, server, songId, songName, artist, album }) {
  const [result] = await pool.execute(
    'INSERT INTO play_history (user_id, server, song_id, song_name, artist, album) VALUES (?, ?, ?, ?, ?, ?)',
    [userId, server, songId, songName, artist, album]
  )

  // 检查用户播放历史数量，超出上限则删除最旧的记录
  const [rows] = await pool.execute(
    'SELECT COUNT(*) AS total FROM play_history WHERE user_id = ?',
    [userId]
  )
  if (rows[0].total > MAX_HISTORY_PER_USER) {
    // 删除最旧的记录，保留最新的 500 条
    await pool.execute(
      'DELETE FROM play_history WHERE user_id = ? ORDER BY played_at ASC LIMIT ?',
      [userId, rows[0].total - MAX_HISTORY_PER_USER]
    )
  }

  const [inserted] = await pool.execute(
    'SELECT * FROM play_history WHERE id = ?',
    [result.insertId]
  )
  return inserted[0]
}

/**
 * 获取用户的播放历史
 * @param {number} userId - 用户 ID
 * @param {number} [limit=500] - 返回条数上限
 * @returns {Promise<Array>} 播放历史列表，按播放时间倒序排列
 */
export async function findByUserId (userId, limit = 500) {
  const [rows] = await pool.execute(
    'SELECT * FROM play_history WHERE user_id = ? ORDER BY played_at DESC LIMIT ?',
    [userId, limit]
  )
  return rows
}

/**
 * 删除用户的所有播放历史
 * @param {number} userId - 用户 ID
 * @returns {Promise<number>} 删除的记录数
 */
export async function deleteByUserId (userId) {
  const [result] = await pool.execute(
    'DELETE FROM play_history WHERE user_id = ?',
    [userId]
  )
  return result.affectedRows
}

/**
 * 统计用户的播放历史数量
 * @param {number} userId - 用户 ID
 * @returns {Promise<number>} 播放历史数量
 */
export async function countByUserId (userId) {
  const [rows] = await pool.execute(
    'SELECT COUNT(*) AS total FROM play_history WHERE user_id = ?',
    [userId]
  )
  return rows[0].total
}
