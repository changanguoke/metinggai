/**
 * @file captcha-config.js
 * @description 图形验证码配置 CRUD 操作
 *              配置为单行记录，使用 INSERT ... ON DUPLICATE KEY UPDATE 实现 upsert
 */

import { pool } from './index.js'

/**
 * 获取当前验证码配置
 * @returns {Promise<Object|null>} 验证码配置记录，无配置时返回 null
 */
export async function get () {
  const [rows] = await pool.execute(
    'SELECT * FROM captcha_config LIMIT 1'
  )
  return rows[0] || null
}

/**
 * 设置验证码配置（插入或更新）
 * @param {Object} data - 配置数据
 * @param {boolean} data.enabled - 是否启用
 * @returns {Promise<Object>} 更新后的配置记录
 */
export async function set ({ enabled }) {
  await pool.execute(
    'INSERT INTO captcha_config (id, enabled) VALUES (1, ?) ON DUPLICATE KEY UPDATE enabled = ?',
    [enabled, enabled]
  )
  return get()
}
