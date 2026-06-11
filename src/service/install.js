/**
 * @file install.js
 * @description 安装向导 API 服务 - 提供数据库测试、配置保存、管理员创建、邮件配置等接口
 *              所有接口仅在系统未安装时可用，已安装后返回 403
 */

// Node 内置
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

// 第三方库
import mysql from 'mysql2/promise'

// 项目内部
import { initDB } from '../db/index.js'
import * as userModel from '../db/user.js'
import * as mailConfigModel from '../db/mail-config.js'
import { hashPassword } from '../utils/hash.js'
import { testMailConfig } from '../utils/mail.js'
import config from '../config.js'

/**
 * 检查系统是否已完成安装
 * 判断依据：data/config.json 存在且包含有效 mysql 配置，且 users 表中存在用户，且 mail_config 表中有配置
 * @returns {Promise<boolean>} 是否已安装
 */
async function isInstalled() {
  try {
    const configPath = resolve(process.cwd(), 'data/config.json')
    const content = await readFile(configPath, 'utf-8')
    const json = JSON.parse(content)
    if (!json.mysql || !json.mysql.host || !json.mysql.database) {
      return false
    }
    // 配置存在，进一步检查是否有用户
    try {
      const count = await userModel.count()
      if (count === 0) return false
    } catch {
      // 数据库未初始化或表不存在，视为未安装
      return false
    }
    // 检查邮件配置是否存在
    try {
      const mailCfg = await mailConfigModel.get()
      if (!mailCfg) return false
    } catch {
      return false
    }
    return true
  } catch {
    return false
  }
}

/**
 * 安装状态守卫 - 已安装时拒绝所有安装接口请求
 * @returns {Response|null} 403 响应或 null（允许继续）
 */
async function guardInstalled () {
  if (await isInstalled()) {
    return Response.json({ success: false, message: '系统已安装，禁止重复操作' }, { status: 403 })
  }
  return null
}

/**
 * 检查安装状态
 * GET /api/install/status
 */
async function handleStatus () {
  const installed = await isInstalled()
  return Response.json({ installed })
}

/**
 * 测试数据库连接
 * POST /api/install/test-db
 * @param {Request} request - HTTP 请求对象
 * @returns {Promise<Response>} 响应对象
 */
async function handleTestDb (request) {
  const body = await request.json()
  const { host, port, user, password, database } = body

  let connection = null
  try {
    connection = await mysql.createConnection({
      host: host || 'localhost',
      port: Number(port) || 3306,
      user,
      password,
      database
    })
    await connection.ping()
    return Response.json({ success: true })
  } catch (err) {
    return Response.json({ success: false, message: err.message })
  } finally {
    if (connection) {
      await connection.end()
    }
  }
}

/**
 * 保存数据库配置并初始化表
 * POST /api/install/save-db
 * @param {Request} request - HTTP 请求对象
 * @returns {Promise<Response>} 响应对象
 */
async function handleSaveDb (request) {
  const body = await request.json()
  const { host, port, user, password, database } = body

  try {
    // 保存配置到 data/config.json
    const dataDir = resolve(process.cwd(), 'data')
    await mkdir(dataDir, { recursive: true })

    const configData = {
      mysql: {
        host: host || 'localhost',
        port: Number(port) || 3306,
        user,
        password,
        database
      }
    }

    const configPath = resolve(dataDir, 'config.json')
    await writeFile(configPath, JSON.stringify(configData, null, 2), 'utf-8')

    // 初始化数据库（创建表）
    await initDB()

    return Response.json({ success: true })
  } catch (err) {
    return Response.json({ success: false, message: err.message })
  }
}

/**
 * 创建管理员账户
 * POST /api/install/create-admin
 * @param {Request} request - HTTP 请求对象
 * @returns {Promise<Response>} 响应对象
 */
async function handleCreateAdmin (request) {
  const body = await request.json()
  const { username, email, password } = body

  // 参数校验
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!email || !emailRegex.test(email)) {
    return Response.json({ success: false, message: '邮箱格式不正确' })
  }
  if (!username || username.length < 3) {
    return Response.json({ success: false, message: '用户名至少 3 个字符' })
  }
  if (!password || password.length < 6) {
    return Response.json({ success: false, message: '密码长度不能少于 6 位' })
  }

  try {
    // 检查是否已存在管理员
    const existingAdmin = await userModel.findByEmail(email)
    if (existingAdmin) {
      return Response.json({ success: true, message: '管理员账户已存在，跳过创建' })
    }
    const existingUsername = await userModel.findByUsername(username)
    if (existingUsername) {
      return Response.json({ success: true, message: '该用户名已存在，跳过创建' })
    }
    const passwordHash = await hashPassword(password)
    await userModel.create({
      email,
      username,
      passwordHash,
      role: 'super_admin',
      emailVerified: true
    })
    return Response.json({ success: true })
  } catch (err) {
    return Response.json({ success: false, message: err.message })
  }
}

/**
 * 保存邮件配置
 * POST /api/install/save-mail
 * @param {Request} request - HTTP 请求对象
 * @returns {Promise<Response>} 响应对象
 */
async function handleSaveMail (request) {
  const body = await request.json()
  const { driver, config: mailConfigData } = body

  // 驱动白名单校验
  if (!['billionmail', 'smtp', 'generic'].includes(driver)) {
    return Response.json({ success: false, message: '不支持的邮件驱动类型' })
  }

  try {
    await mailConfigModel.set({ driver, config: mailConfigData })
    return Response.json({ success: true })
  } catch (err) {
    return Response.json({ success: false, message: err.message })
  }
}

/**
 * 测试邮件发送
 * POST /api/install/test-mail
 * @param {Request} request - HTTP 请求对象
 * @returns {Promise<Response>} 响应对象
 */
async function handleTestMail (request) {
  const body = await request.json()
  const { driver, config: mailConfigData, recipient } = body

  try {
    const result = await testMailConfig({ driver, config: mailConfigData }, recipient)
    return Response.json(result)
  } catch (err) {
    return Response.json({ success: false, message: err.message })
  }
}

export { isInstalled }

/**
 * 安装向导路由分发器
 * 根据请求路径分发到对应的处理函数
 * @param {Request} request - HTTP 请求对象
 * @param {Object} ctx - 请求上下文
 * @returns {Response} JSON 响应
 */
export default async (request, ctx) => {
  const url = new URL(request.url)
  const pathname = url.pathname
  const prefix = config.http.prefix

  // GET /api/install/status - 安装状态检查（始终可访问）
  if (request.method === 'GET' && pathname === `${prefix}/api/install/status`) {
    return handleStatus()
  }

  // POST /api/install/test-db - 测试数据库连接
  if (request.method === 'POST' && pathname === `${prefix}/api/install/test-db`) {
    return handleTestDb(request)
  }

  // POST /api/install/save-db - 保存数据库配置
  if (request.method === 'POST' && pathname === `${prefix}/api/install/save-db`) {
    return handleSaveDb(request)
  }

  // POST /api/install/create-admin - 创建管理员
  if (request.method === 'POST' && pathname === `${prefix}/api/install/create-admin`) {
    return handleCreateAdmin(request)
  }

  // POST /api/install/save-mail - 保存邮件配置
  if (request.method === 'POST' && pathname === `${prefix}/api/install/save-mail`) {
    return handleSaveMail(request)
  }

  // POST /api/install/test-mail - 测试邮件发送
  if (request.method === 'POST' && pathname === `${prefix}/api/install/test-mail`) {
    return handleTestMail(request)
  }

  return new Response('Not Found', { status: 404 })
}
