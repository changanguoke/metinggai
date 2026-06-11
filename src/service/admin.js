/**
 * @file admin.js
 * @description 管理 API 服务 - 处理所有 /api/admin/* 路由
 *              所有接口均要求 JWT 认证且用户角色为 admin
 */

// Node 内置
import { access, mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

// 项目内部
import * as userDB from '../db/user.js'
import * as playHistoryDB from '../db/play-history.js'
import * as favoriteDB from '../db/favorite.js'
import * as mailConfigDB from '../db/mail-config.js'
import * as captchaConfigDB from '../db/captcha-config.js'
import { testMailConfig, refreshConfig } from '../utils/mail.js'
import { HTTPException } from '../utils/http-exception.js'
import { hashPassword } from '../utils/hash.js'
import { cache, getCacheConfig, setCacheConfig } from './api.js'
import * as backupService from './backup.js'

// 支持的音乐平台列表
const PLATFORMS = ['netease', 'kugou']

// 合法的用户状态值
const VALID_STATUSES = ['active', 'disabled']

// 合法的用户角色值
const VALID_ROLES = ['super_admin', 'admin', 'user']

// 合法的邮件驱动
const VALID_MAIL_DRIVERS = ['billionmail', 'smtp', 'generic']

// 邮箱格式正则
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * 敏感字段脱敏处理
 * 保留前 2 位和后 2 位字符，中间用 ****** 替代
 * 长度不超过 4 时全部替换为 ******
 * @param {Object} obj - 需要脱敏的对象
 * @returns {Object} 脱敏后的新对象
 */
function maskSensitiveFields (obj) {
  if (!obj || typeof obj !== 'object') return obj
  const result = {}
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string' && /apiKey|pass|password/i.test(key)) {
      if (value.length > 4) {
        result[key] = value.slice(0, 2) + '******' + value.slice(-2)
      } else {
        result[key] = '******'
      }
    } else {
      result[key] = value
    }
  }
  return result
}

/**
 * 管理 API 路由处理
 * @param {Request} request - 请求对象
 * @param {Object} ctx - 上下文对象（含 ctx.user 认证信息）
 * @returns {Promise<Response>} 响应对象
 */
export default async (request, ctx) => {
  const url = new URL(request.url)
  const pathname = url.pathname
  const method = request.method

  // 权限校验：admin 或 super_admin 角色可访问
  if (!ctx.user || (ctx.user.role !== 'admin' && ctx.user.role !== 'super_admin')) {
    throw new HTTPException(403, { message: '权限不足，需要管理员角色' })
  }

  // 系统配置写操作仅超级管理员可执行（缓存配置、Cookie 配置、邮件配置、Turnstile 配置）
  const isSystemConfigWrite =
    (pathname === '/api/admin/cache-config' && method === 'PUT') ||
    (pathname === '/api/admin/cache' && method === 'DELETE') ||
    (pathname.startsWith('/api/admin/cookies/') && method === 'PUT') ||
    (pathname === '/api/admin/mail-config' && method === 'PUT') ||
    (pathname === '/api/admin/mail-config/test' && method === 'POST') ||
    (pathname === '/api/admin/captcha-config' && method === 'PUT') ||
    (pathname === '/api/admin/backup-config' && method === 'PUT') ||
    (pathname === '/api/admin/backup/restore' && method === 'POST')
  if (isSystemConfigWrite && ctx.user.role !== 'super_admin') {
    throw new HTTPException(403, { message: '系统配置仅超级管理员可修改' })
  }

  // ====== GET /api/admin/users - 获取用户列表 ======
  if (pathname === '/api/admin/users' && method === 'GET') {
    const rows = await userDB.findAll()
    const users = rows.map(row => ({
      id: row.id,
      email: row.email,
      username: row.username,
      role: row.role,
      status: row.status,
      emailVerified: row.email_verified,
      createdAt: row.created_at
    }))
    return Response.json({ users })
  }

  // ====== PUT /api/admin/users/:id/status - 更新用户状态 ======
  if (pathname.startsWith('/api/admin/users/') && pathname.endsWith('/status') && method === 'PUT') {
    const segments = pathname.split('/')
    const id = Number(segments[4])
    const body = await request.json()
    const { status } = body

    if (!VALID_STATUSES.includes(status)) {
      throw new HTTPException(400, { message: 'status 参数不合法，仅支持 active 或 disabled' })
    }

    // 不能禁用超级管理员
    const targetUser = await userDB.findById(id)
    if (targetUser && targetUser.role === 'super_admin') {
      throw new HTTPException(403, { message: '不能修改超级管理员状态' })
    }
    // 普通管理员不能禁用其他管理员
    if (targetUser && targetUser.role === 'admin' && ctx.user.role === 'admin') {
      throw new HTTPException(403, { message: '不能修改其他管理员状态' })
    }

    await userDB.updateStatus(id, status)
    return Response.json({ success: true })
  }

  // ====== PUT /api/admin/users/:id/role - 更新用户角色 ======
  if (pathname.startsWith('/api/admin/users/') && pathname.endsWith('/role') && method === 'PUT') {
    const segments = pathname.split('/')
    const id = Number(segments[4])
    const body = await request.json()
    const { role } = body

    if (!VALID_ROLES.includes(role)) {
      throw new HTTPException(400, { message: 'role 参数不合法，仅支持 super_admin、admin 或 user' })
    }

    // 只有超级管理员才能授予 admin 或 super_admin 角色
    if ((role === 'admin' || role === 'super_admin') && ctx.user.role !== 'super_admin') {
      throw new HTTPException(403, { message: '仅超级管理员可授予管理员权限' })
    }

    // 不能修改自己的角色
    if (id === Number(ctx.user.id)) {
      throw new HTTPException(400, { message: '不能修改自己的角色' })
    }

    // 不能降级超级管理员
    const targetUser = await userDB.findById(id)
    if (!targetUser) {
      throw new HTTPException(404, { message: '用户不存在' })
    }
    if (targetUser.role === 'super_admin' && ctx.user.role !== 'super_admin') {
      throw new HTTPException(403, { message: '不能修改超级管理员角色' })
    }
    // 普通管理员不能修改其他管理员的角色
    if (targetUser.role === 'admin' && ctx.user.role === 'admin') {
      throw new HTTPException(403, { message: '不能修改其他管理员的角色' })
    }

    await userDB.updateRole(id, role)
    return Response.json({ success: true })
  }

  // ====== DELETE /api/admin/users/:id - 删除用户 ======
  if (pathname.startsWith('/api/admin/users/') && method === 'DELETE') {
    const segments = pathname.split('/')
    const id = Number(segments[4])

    // 不能删除自己
    if (id === Number(ctx.user.id)) {
      return Response.json({ success: false, message: '不能删除自己' }, { status: 400 })
    }

    // 不能删除超级管理员
    const targetUser = await userDB.findById(id)
    if (targetUser && targetUser.role === 'super_admin') {
      throw new HTTPException(403, { message: '不能删除超级管理员' })
    }
    // 普通管理员不能删除其他管理员
    if (targetUser && targetUser.role === 'admin' && ctx.user.role === 'admin') {
      throw new HTTPException(403, { message: '不能删除其他管理员' })
    }

    await userDB.deleteById(id)
    // 同时删除该用户的播放历史和收藏
    await playHistoryDB.deleteByUserId(id)
    await favoriteDB.deleteByUserId(id)
    return Response.json({ success: true })
  }

  // ====== POST /api/admin/users - 管理员创建用户 ======
  if (pathname === '/api/admin/users' && method === 'POST') {
    const body = await request.json()
    const { email, username, password, role } = body

    if (!email || !username || !password) {
      throw new HTTPException(400, { message: '邮箱、用户名和密码不能为空' })
    }
    if (!EMAIL_REGEX.test(email)) {
      throw new HTTPException(400, { message: '邮箱格式不正确' })
    }
    if (username.length < 3) {
      throw new HTTPException(400, { message: '用户名至少3个字符' })
    }
    if (password.length < 6) {
      throw new HTTPException(400, { message: '密码至少6个字符' })
    }

    // 检查邮箱是否已存在
    const existing = await userDB.findByEmail(email)
    if (existing) {
      throw new HTTPException(400, { message: '该邮箱已被注册' })
    }

    const userRole = VALID_ROLES.includes(role) ? role : 'user'

    // 只有超级管理员才能创建管理员角色用户
    if ((userRole === 'admin' || userRole === 'super_admin') && ctx.user.role !== 'super_admin') {
      throw new HTTPException(403, { message: '仅超级管理员可创建管理员账户' })
    }

    const passwordHash = await hashPassword(password)
    const user = await userDB.create({
      email,
      username,
      passwordHash,
      role: userRole,
      emailVerified: true
    })

    return Response.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role
      }
    })
  }

  // ====== GET /api/admin/stats - 获取系统统计 ======
  if (pathname === '/api/admin/stats' && method === 'GET') {
    const userCount = await userDB.count()
    const uptime = process.uptime()
    return Response.json({
      userCount,
      cacheSize: cache.size,
      uptime,
      version: '1.11.0'
    })
  }

  // ====== GET /api/admin/cache - 获取缓存状态 ======
  if (pathname === '/api/admin/cache' && method === 'GET') {
    return Response.json({ size: cache.size, max: cache.max })
  }

  // ====== DELETE /api/admin/cache - 清除缓存 ======
  if (pathname === '/api/admin/cache' && method === 'DELETE') {
    cache.clear()
    return Response.json({ success: true })
  }

  // ====== GET /api/admin/cache-config - 获取缓存配置 ======
  if (pathname === '/api/admin/cache-config' && method === 'GET') {
    return Response.json(getCacheConfig())
  }

  // ====== PUT /api/admin/cache-config - 更新缓存配置 ======
  if (pathname === '/api/admin/cache-config' && method === 'PUT') {
    const body = await request.json()
    const { max, ttl, purgeInterval } = body

    if (max !== undefined) {
      const newMax = Number(max)
      if (isNaN(newMax) || newMax < 10 || newMax > 100000) {
        throw new HTTPException(400, { message: '缓存容量范围：10 ~ 100000' })
      }
    }
    if (ttl !== undefined) {
      const newTtl = Number(ttl)
      if (isNaN(newTtl) || newTtl < 5 || newTtl > 86400) {
        throw new HTTPException(400, { message: 'TTL 范围：5 ~ 86400 秒' })
      }
    }
    if (purgeInterval !== undefined) {
      const newPi = Number(purgeInterval)
      if (isNaN(newPi) || newPi < 10 || newPi > 3600) {
        throw new HTTPException(400, { message: '清理间隔范围：10 ~ 3600 秒' })
      }
    }

    const result = setCacheConfig({ max, ttl, purgeInterval })
    return Response.json({ success: true, ...result })
  }

  // ====== GET /api/admin/cookies - 获取各平台 Cookie 配置状态 ======
  if (pathname === '/api/admin/cookies' && method === 'GET') {
    const cookies = {}
    for (const server of PLATFORMS) {
      // 检查环境变量
      const envKey = `METING_COOKIE_${server.toUpperCase()}`
      const hasEnv = !!process.env[envKey]
      // 检查文件是否存在
      const cookiePath = resolve(process.cwd(), 'cookie', server)
      let hasFile = false
      try {
        await access(cookiePath)
        hasFile = true
      } catch {
        // 文件不存在
      }
      cookies[server] = { configured: hasEnv || hasFile }
    }
    return Response.json({ cookies })
  }

  // ====== PUT /api/admin/cookies/:server - 更新平台 Cookie ======
  if (pathname.startsWith('/api/admin/cookies/') && method === 'PUT') {
    const segments = pathname.split('/')
    const server = segments[4]
    const body = await request.json()
    const { cookie } = body

    if (!PLATFORMS.includes(server)) {
      throw new HTTPException(400, { message: 'server 参数不合法' })
    }

    // 确保 cookie 目录存在
    const cookieDir = resolve(process.cwd(), 'cookie')
    await mkdir(cookieDir, { recursive: true })

    // 写入 cookie 文件
    const cookiePath = resolve(cookieDir, server)
    await writeFile(cookiePath, cookie, 'utf-8')

    // TODO: 更新 utils/cookie.js 中的内存缓存

    return Response.json({ success: true })
  }

  // ====== GET /api/admin/mail-config - 获取邮件配置 ======
  if (pathname === '/api/admin/mail-config' && method === 'GET') {
    const row = await mailConfigDB.get()
    if (!row) {
      return Response.json({ configured: false })
    }

    let configObj = {}
    try {
      configObj = typeof row.config === 'string' ? JSON.parse(row.config) : row.config
    } catch {
      configObj = {}
    }

    return Response.json({
      configured: true,
      driver: row.driver,
      config: maskSensitiveFields(configObj)
    })
  }

  // ====== PUT /api/admin/mail-config - 更新邮件配置 ======
  if (pathname === '/api/admin/mail-config' && method === 'PUT') {
    const body = await request.json()
    const { driver, config } = body

    if (!VALID_MAIL_DRIVERS.includes(driver)) {
      throw new HTTPException(400, { message: 'driver 参数不合法，仅支持 billionmail、smtp、generic' })
    }

    await mailConfigDB.set({ driver, config })
    // 刷新邮件服务内存缓存
    refreshConfig()
    return Response.json({ success: true })
  }

  // ====== POST /api/admin/mail-config/test - 测试邮件发送 ======
  if (pathname === '/api/admin/mail-config/test' && method === 'POST') {
    const body = await request.json()
    const { recipient } = body

    if (!recipient || !EMAIL_REGEX.test(recipient)) {
      throw new HTTPException(400, { message: '收件人邮箱格式不正确' })
    }

    const row = await mailConfigDB.get()
    if (!row) {
      return Response.json({ success: false, message: '邮件服务未配置' })
    }

    let configObj = {}
    try {
      configObj = typeof row.config === 'string' ? JSON.parse(row.config) : row.config
    } catch {
      configObj = {}
    }

    const result = await testMailConfig({ driver: row.driver, config: configObj }, recipient)
    return Response.json(result)
  }

  // ====== GET /api/admin/captcha-config - 获取验证码配置 ======
  if (pathname === '/api/admin/captcha-config' && method === 'GET') {
    const row = await captchaConfigDB.get()
    if (!row) {
      return Response.json({ configured: false })
    }
    return Response.json({
      configured: true,
      enabled: !!row.enabled
    })
  }

  // ====== PUT /api/admin/captcha-config - 更新验证码配置 ======
  if (pathname === '/api/admin/captcha-config' && method === 'PUT') {
    const body = await request.json()
    const { enabled } = body

    await captchaConfigDB.set({ enabled: !!enabled })
    return Response.json({ success: true })
  }

  // ====== POST /api/admin/backup - 手动创建备份 ======
  if (pathname === '/api/admin/backup' && method === 'POST') {
    const result = await backupService.createBackup('manual')
    return Response.json({ success: true, ...result })
  }

  // ====== GET /api/admin/backup - 获取备份列表 ======
  if (pathname === '/api/admin/backup' && method === 'GET') {
    const backups = await backupService.listBackups()
    return Response.json({ backups })
  }

  // ====== GET /api/admin/backup/download - 下载备份文件 ======
  if (pathname === '/api/admin/backup/download' && method === 'GET') {
    const filename = url.searchParams.get('file')
    if (!filename) {
      throw new HTTPException(400, { message: '缺少 file 参数' })
    }
    const data = await backupService.getBackupFile(filename)
    if (!data) {
      throw new HTTPException(404, { message: '备份文件不存在' })
    }
    return new Response(data, {
      headers: {
        'content-type': 'application/gzip',
        'content-disposition': `attachment; filename="${filename}"`,
        'content-length': data.length
      }
    })
  }

  // ====== DELETE /api/admin/backup - 删除备份文件 ======
  if (pathname === '/api/admin/backup' && method === 'DELETE') {
    const filename = url.searchParams.get('file')
    if (!filename) {
      throw new HTTPException(400, { message: '缺少 file 参数' })
    }
    const ok = await backupService.deleteBackup(filename)
    if (!ok) {
      throw new HTTPException(404, { message: '备份文件不存在' })
    }
    return Response.json({ success: true })
  }

  // ====== POST /api/admin/backup/restore - 从备份恢复 ======
  if (pathname === '/api/admin/backup/restore' && method === 'POST') {
    const contentType = request.headers.get('content-type') || ''
    let gzBuffer

    if (contentType.includes('multipart/form-data')) {
      // 从上传文件读取
      const formData = await request.formData()
      const file = formData.get('file')
      if (!file) {
        throw new HTTPException(400, { message: '请上传备份文件' })
      }
      gzBuffer = Buffer.from(await file.arrayBuffer())
    } else {
      // 从 JSON body 读取（filename 指定服务器上的备份文件）
      const body = await request.json()
      const { filename } = body
      if (!filename) {
        throw new HTTPException(400, { message: '缺少 filename 参数' })
      }
      const data = await backupService.getBackupFile(filename)
      if (!data) {
        throw new HTTPException(404, { message: '备份文件不存在' })
      }
      gzBuffer = data
    }

    const result = await backupService.restoreBackup(gzBuffer)
    return Response.json(result)
  }

  // ====== GET /api/admin/backup-config - 获取自动备份配置 ======
  if (pathname === '/api/admin/backup-config' && method === 'GET') {
    const cfg = await backupService.getAutoBackupConfig()
    return Response.json(cfg)
  }

  // ====== PUT /api/admin/backup-config - 更新自动备份配置 ======
  if (pathname === '/api/admin/backup-config' && method === 'PUT') {
    const body = await request.json()
    const cfg = await backupService.setAutoBackupConfig(body)
    return Response.json({ success: true, ...cfg })
  }

  // 未匹配的路由
  throw new HTTPException(404, { message: '接口不存在' })
}
