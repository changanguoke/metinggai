/**
 * @file backup.js
 * @description 数据备份与恢复服务
 *              支持数据库备份（SQL dump）、文件备份（配置/Cookie）、定时自动备份
 */

import { readdir, readFile, writeFile, mkdir, unlink, stat, copyFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { createGzip, gunzipSync } from 'node:zlib'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { pool } from '../db/index.js'
import { logger } from '../middleware/logger.js'

// 备份文件存储目录
const BACKUP_DIR = resolve(process.cwd(), 'data', 'backups')

// 需要备份的文件目录
const BACKUP_FILE_DIRS = [
  { dir: 'cookie', label: 'cookie' },
  { dir: 'data', label: 'data' }
]

// 需要备份的数据库表
const BACKUP_TABLES = ['users', 'verify_codes', 'play_history', 'favorites', 'mail_config', 'captcha_config', 'backup_config']

// 自动备份定时器
let autoBackupTimer = null

/**
 * 确保备份目录存在
 */
async function ensureBackupDir () {
  if (!existsSync(BACKUP_DIR)) {
    await mkdir(BACKUP_DIR, { recursive: true })
  }
}

/**
 * 生成备份文件名
 * @param {string} type - 备份类型 manual/auto
 * @returns {string} 文件名（不含扩展名）
 */
function generateBackupName (type = 'manual') {
  const now = new Date()
  const ts = now.toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
  return `backup_${type}_${ts}`
}

/**
 * 导出数据库表为 SQL 语句
 * @returns {Promise<string>} SQL dump 内容
 */
async function dumpDatabase () {
  const lines = [
    '-- Meting API Database Backup',
    `-- Generated at: ${new Date().toISOString()}`,
    '--',
    `SET NAMES utf8mb4;`,
    `SET FOREIGN_KEY_CHECKS = 0;`,
    ''
  ]

  for (const table of BACKUP_TABLES) {
    try {
      // 获取建表语句
      const [createRows] = await pool.execute(`SHOW CREATE TABLE \`${table}\``)
      const createSql = createRows[0]?.['Create Table'] || ''
      if (createSql) {
        lines.push(`-- ----------------------------`)
        lines.push(`-- Table structure for \`${table}\``)
        lines.push(`-- ----------------------------`)
        lines.push(`DROP TABLE IF EXISTS \`${table}\`;`)
        lines.push(createSql + ';')
        lines.push('')
      }

      // 获取数据
      const [rows] = await pool.execute(`SELECT * FROM \`${table}\``)
      if (rows.length > 0) {
        lines.push(`-- ----------------------------`)
        lines.push(`-- Records of \`${table}\``)
        lines.push(`-- ----------------------------`)
        for (const row of rows) {
          const columns = Object.keys(row)
          const values = columns.map(col => {
            const val = row[col]
            if (val === null) return 'NULL'
            if (typeof val === 'number') return String(val)
            if (typeof val === 'boolean') return val ? '1' : '0'
            if (val instanceof Date) return `'${val.toISOString().slice(0, 19).replace('T', ' ')}'`
            // Buffer 类型（如 JSON 字段的二进制）
            if (Buffer.isBuffer(val)) return `X'${val.toString('hex')}'`
            return `'${String(val).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r')}'`
          })
          lines.push(`INSERT INTO \`${table}\` (\`${columns.join('`, `')}\`) VALUES (${values.join(', ')});`)
        }
        lines.push('')
      }
    } catch (e) {
      // 表可能不存在，跳过
      logger.warn({ table, err: e.message }, '[backup] table skip')
    }
  }

  lines.push('SET FOREIGN_KEY_CHECKS = 1;')
  return lines.join('\n')
}

/**
 * 导出配置文件为 JSON
 * @returns {Promise<Object>} 文件内容对象 { path: content }
 */
async function dumpFiles () {
  const files = {}
  for (const { dir } of BACKUP_FILE_DIRS) {
    const dirPath = resolve(process.cwd(), dir)
    if (!existsSync(dirPath)) continue
    try {
      const entries = await readdir(dirPath)
      for (const entry of entries) {
        const fullPath = join(dirPath, entry)
        const s = await stat(fullPath)
        if (s.isFile()) {
          const content = await readFile(fullPath, 'utf-8')
          files[`${dir}/${entry}`] = content
        }
      }
    } catch {
      // 目录读取失败，跳过
    }
  }
  return files
}

/**
 * 执行备份
 * @param {string} type - 备份类型 manual/auto
 * @returns {Promise<Object>} 备份结果 { filename, size, tables, fileCount }
 */
export async function createBackup (type = 'manual') {
  await ensureBackupDir()

  const name = generateBackupName(type)
  const filename = `${name}.json.gz`

  // 1. 导出数据库
  const sqlDump = await dumpDatabase()

  // 2. 导出文件
  const files = await dumpFiles()

  // 3. 组装备份数据
  const backupData = {
    version: '1.0.0',
    type,
    createdAt: new Date().toISOString(),
    database: sqlDump,
    files
  }

  // 4. 压缩并写入文件
  const jsonStr = JSON.stringify(backupData)
  const gzBuffer = await new Promise((resolve, reject) => {
    const chunks = []
    const gzip = createGzip()
    gzip.on('data', chunk => chunks.push(chunk))
    gzip.on('end', () => resolve(Buffer.concat(chunks)))
    gzip.on('error', reject)
    gzip.write(jsonStr)
    gzip.end()
  })

  const filePath = join(BACKUP_DIR, filename)
  await writeFile(filePath, gzBuffer)

  logger.info({ filename, size: gzBuffer.length, type }, '[backup] created')

  return {
    filename,
    size: gzBuffer.length,
    tables: BACKUP_TABLES.length,
    fileCount: Object.keys(files).length
  }
}

/**
 * 获取备份列表
 * @returns {Promise<Array>} 备份文件列表
 */
export async function listBackups () {
  await ensureBackupDir()
  const entries = await readdir(BACKUP_DIR)
  const backups = []

  for (const entry of entries) {
    if (!entry.endsWith('.json.gz')) continue
    const filePath = join(BACKUP_DIR, entry)
    try {
      const s = await stat(filePath)
      // 从文件名解析类型和时间
      const typeMatch = entry.match(/backup_(manual|auto)_(.+)\.json\.gz/)
      const backupType = typeMatch ? typeMatch[1] : 'unknown'
      const timestamp = typeMatch ? typeMatch[2].replace(/-/g, (m, i) => i > 9 ? ':' : m) : ''
      backups.push({
        filename: entry,
        size: s.size,
        type: backupType,
        createdAt: s.mtime.toISOString(),
        timestamp
      })
    } catch {
      // 文件读取失败，跳过
    }
  }

  // 按创建时间倒序
  backups.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  return backups
}

/**
 * 下载备份文件
 * @param {string} filename - 备份文件名
 * @returns {Promise<Buffer|null>} 文件内容
 */
export async function getBackupFile (filename) {
  // 安全检查：防止路径遍历
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return null
  }
  const filePath = join(BACKUP_DIR, filename)
  if (!existsSync(filePath)) return null
  return readFile(filePath)
}

/**
 * 删除备份文件
 * @param {string} filename - 备份文件名
 * @returns {Promise<boolean>} 是否删除成功
 */
export async function deleteBackup (filename) {
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return false
  }
  const filePath = join(BACKUP_DIR, filename)
  if (!existsSync(filePath)) return false
  await unlink(filePath)
  logger.info({ filename }, '[backup] deleted')
  return true
}

/**
 * 从备份数据恢复
 * @param {Buffer} gzBuffer - 备份文件内容（gzip 压缩）
 * @returns {Promise<Object>} 恢复结果
 */
export async function restoreBackup (gzBuffer) {
  try {
    // 1. 解压
    const jsonStr = gunzipSync(gzBuffer).toString('utf-8')
    const backupData = JSON.parse(jsonStr)

    if (!backupData.database) {
      return { success: false, message: '无效的备份文件：缺少数据库数据' }
    }

    // 2. 恢复数据库
    const sqlLines = backupData.database.split('\n')
    let restoredTables = 0
    let errors = 0

    // 逐条执行 SQL（跳过注释和空行）
    for (const line of sqlLines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('--')) continue
      try {
        await pool.execute(trimmed)
        if (trimmed.startsWith('INSERT INTO')) restoredTables++
      } catch (e) {
        // 忽略 "表已存在" 等非致命错误
        if (!e.message.includes('already exists') && !e.message.includes('Duplicate entry')) {
          errors++
          logger.warn({ sql: trimmed.substring(0, 100), err: e.message }, '[backup] restore sql error')
        }
      }
    }

    // 3. 恢复文件
    let restoredFiles = 0
    if (backupData.files) {
      for (const [filePath, content] of Object.entries(backupData.files)) {
        try {
          const fullPath = resolve(process.cwd(), filePath)
          // 确保目录存在
          const dir = resolve(fullPath, '..')
          if (!existsSync(dir)) await mkdir(dir, { recursive: true })
          await writeFile(fullPath, content, 'utf-8')
          restoredFiles++
        } catch (e) {
          logger.warn({ filePath, err: e.message }, '[backup] restore file error')
        }
      }
    }

    logger.info({ restoredTables, restoredFiles, errors }, '[backup] restored')
    return {
      success: true,
      restoredTables,
      restoredFiles,
      errors
    }
  } catch (e) {
    logger.error({ err: e.message }, '[backup] restore failed')
    return { success: false, message: `恢复失败: ${e.message}` }
  }
}

/**
 * 获取自动备份配置
 * @returns {Promise<Object>} 配置
 */
export async function getAutoBackupConfig () {
  try {
    const [rows] = await pool.execute('SELECT * FROM backup_config LIMIT 1')
    if (rows[0]) return rows[0]
  } catch {
    // 表可能不存在
  }
  return { enabled: false, hour: 3, keepCount: 7 }
}

/**
 * 更新自动备份配置
 * @param {Object} opts - 配置选项
 * @returns {Promise<Object>} 更新后的配置
 */
export async function setAutoBackupConfig (opts) {
  const enabled = opts.enabled ? 1 : 0
  const hour = Math.max(0, Math.min(23, Number(opts.hour) || 3))
  const keepCount = Math.max(1, Math.min(30, Number(opts.keepCount) || 7))

  await pool.execute(
    'INSERT INTO backup_config (id, enabled, hour, keep_count) VALUES (1, ?, ?, ?) ON DUPLICATE KEY UPDATE enabled=?, hour=?, keep_count=?',
    [enabled, hour, keepCount, enabled, hour, keepCount]
  )

  // 重启定时器
  restartAutoBackup()

  return getAutoBackupConfig()
}

/**
 * 清理旧备份，保留指定数量
 * @param {number} keepCount - 保留数量
 */
async function cleanupOldBackups (keepCount) {
  const backups = await listBackups()
  const autoBackups = backups.filter(b => b.type === 'auto')
  if (autoBackups.length <= keepCount) return

  const toDelete = autoBackups.slice(keepCount)
  for (const b of toDelete) {
    await deleteBackup(b.filename)
  }
  logger.info({ deleted: toDelete.length, kept: keepCount }, '[backup] auto cleanup')
}

/**
 * 启动自动备份定时器
 */
export function startAutoBackup () {
  stopAutoBackup()

  // 每分钟检查是否需要备份
  autoBackupTimer = setInterval(async () => {
    try {
      const cfg = await getAutoBackupConfig()
      if (!cfg.enabled) return

      const now = new Date()
      // 在指定小时的第 5 分钟执行（避免整点并发）
      if (now.getHours() === cfg.hour && now.getMinutes() === 5) {
        logger.info('[backup] auto backup starting')
        await createBackup('auto')
        await cleanupOldBackups(cfg.keep_count || cfg.keepCount || 7)
      }
    } catch (e) {
      logger.error({ err: e.message }, '[backup] auto backup error')
    }
  }, 60 * 1000)

  logger.info('[backup] auto backup timer started')
}

/**
 * 停止自动备份定时器
 */
function stopAutoBackup () {
  if (autoBackupTimer) {
    clearInterval(autoBackupTimer)
    autoBackupTimer = null
  }
}

/**
 * 重启自动备份定时器
 */
function restartAutoBackup () {
  stopAutoBackup()
  startAutoBackup()
}
