/**
 * @file mail-config.js
 * @description 邮件配置 CRUD 操作 - 提供邮件配置的读取和更新功能
 *              邮件配置为单行记录，使用 INSERT ... ON DUPLICATE KEY UPDATE 实现 upsert
 */

import { pool } from './index.js'

/**
 * 获取当前邮件配置
 * @returns {Promise<Object|null>} 邮件配置记录，无配置时返回 null
 */
export async function get () {
  const [rows] = await pool.execute(
    'SELECT * FROM mail_config LIMIT 1'
  )
  return rows[0] || null
}

/**
 * 设置邮件配置（插入或更新）
 * @param {Object} data - 邮件配置数据
 * @param {string} data.driver - 邮件驱动（如 smtp）
 * @param {Object} data.config - 邮件配置对象（将序列化为 JSON 存储）
 * @returns {Promise<Object>} 更新后的邮件配置记录
 */
export async function set ({ driver, config }) {
  // 使用 INSERT ... ON DUPLICATE KEY UPDATE 实现 upsert
  // id=1 固定为单行配置，已存在时更新 driver 和 config
  await pool.execute(
    'INSERT INTO mail_config (id, driver, config) VALUES (1, ?, ?) ON DUPLICATE KEY UPDATE driver = ?, config = ?',
    [driver, JSON.stringify(config), driver, JSON.stringify(config)]
  )
  return get()
}
