/**
 * @file index.js
 * @description MySQL 数据库模块 - 负责连接池初始化、表自动创建
 *              从 data/config.json 读取 MySQL 配置，使用 mysql2/promise 实现异步操作
 */

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import mysql from 'mysql2/promise'

import { logger } from '../middleware/logger.js'

// MySQL 连接池实例
let pool = null

// ====== 建表 SQL 语句 ======
const CREATE_TABLES = {
  // 用户表
  users: `
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(100) UNIQUE NOT NULL,
      username VARCHAR(50) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role ENUM('super_admin', 'admin', 'user') DEFAULT 'user',
      status ENUM('active', 'disabled') DEFAULT 'active',
      email_verified BOOLEAN DEFAULT FALSE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `,
  // 验证码表
  verify_codes: `
    CREATE TABLE IF NOT EXISTS verify_codes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(100) NOT NULL,
      code VARCHAR(6) NOT NULL,
      type ENUM('register', 'reset') NOT NULL,
      expires_at DATETIME NOT NULL,
      used BOOLEAN DEFAULT FALSE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `,
  // 播放历史表
  play_history: `
    CREATE TABLE IF NOT EXISTS play_history (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      server VARCHAR(20) NOT NULL,
      song_id VARCHAR(50) NOT NULL,
      song_name VARCHAR(200),
      artist VARCHAR(200),
      album VARCHAR(200),
      played_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_user_played (user_id, played_at)
    )
  `,
  // 收藏表
  favorites: `
    CREATE TABLE IF NOT EXISTS favorites (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      server VARCHAR(20) NOT NULL,
      song_id VARCHAR(50) NOT NULL,
      song_name VARCHAR(200),
      artist VARCHAR(200),
      album VARCHAR(200),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE INDEX idx_user_song (user_id, server, song_id)
    )
  `,
  // 邮件配置表
  mail_config: `
    CREATE TABLE IF NOT EXISTS mail_config (
      id INT AUTO_INCREMENT PRIMARY KEY,
      driver VARCHAR(20) NOT NULL,
      config JSON NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `,
  // 验证码配置表
  captcha_config: `
    CREATE TABLE IF NOT EXISTS captcha_config (
      id INT AUTO_INCREMENT PRIMARY KEY,
      enabled BOOLEAN DEFAULT FALSE,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `,
  // 备份配置表
  backup_config: `
    CREATE TABLE IF NOT EXISTS backup_config (
      id INT AUTO_INCREMENT PRIMARY KEY,
      enabled BOOLEAN DEFAULT FALSE,
      hour TINYINT DEFAULT 3,
      keep_count INT DEFAULT 7,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `
}

/**
 * 从 data/config.json 读取 MySQL 配置
 * @returns {Promise<Object>} MySQL 配置对象
 */
async function readConfig () {
  const configPath = resolve(process.cwd(), 'data/config.json')
  const content = await readFile(configPath, 'utf-8')
  const json = JSON.parse(content)
  if (!json.mysql) {
    throw new Error('data/config.json 中缺少 mysql 配置')
  }
  return json.mysql
}

/**
 * 初始化数据库连接池并自动创建表
 * @returns {Promise<mysql.Pool>} MySQL 连接池实例
 */
export async function initDB () {
  if (pool) return pool

  const mysqlConfig = await readConfig()
  logger.info({ mysql: { host: mysqlConfig.host, port: mysqlConfig.port, database: mysqlConfig.database } }, '正在初始化 MySQL 连接池')

  // 创建连接池
  pool = mysql.createPool({
    host: mysqlConfig.host || 'localhost',
    port: mysqlConfig.port || 3306,
    user: mysqlConfig.user,
    password: mysqlConfig.password,
    database: mysqlConfig.database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  })

  // 自动创建所有表
  for (const [tableName, sql] of Object.entries(CREATE_TABLES)) {
    await pool.execute(sql)
    logger.info({ table: tableName }, '数据表已就绪')
  }

  logger.info('数据库初始化完成')
  return pool
}

export { pool }
