/**
 * @file auth.js
 * @description 用户认证 API 服务 - 处理所有 /api/auth/* 路由
 *              提供验证码发送、注册、登录、登出、获取当前用户信息等功能
 */

// 项目内部
import * as userModel from '../db/user.js'
import * as verifyCodeModel from '../db/verify-code.js'
import * as captchaConfigModel from '../db/captcha-config.js'
import { sign, verify as verifyJwt } from '../utils/jwt.js'
import { hashPassword, verifyPassword } from '../utils/hash.js'
import { sendVerifyCode } from '../utils/mail.js'
import { logger } from '../middleware/logger.js'

// 邮箱格式正则
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// 图形验证码内存存储：key → { code, expires }
const captchaStore = new Map()
const CAPTCHA_TTL = 5 * 60 * 1000 // 验证码有效期 5 分钟

// 定期清理过期验证码
setInterval(() => {
  const now = Date.now()
  for (const [key, val] of captchaStore) {
    if (val.expires < now) captchaStore.delete(key)
  }
}, 60 * 1000)

/**
 * 解析请求 JSON 体
 * @param {Request} request - 原始请求对象
 * @returns {Promise<Object>} 解析后的 JSON 对象
 */
async function parseBody (request) {
  try {
    return await request.json()
  } catch {
    return {}
  }
}

/**
 * 验证邮箱格式
 * @param {string} email - 邮箱地址
 * @returns {boolean} 是否合法
 */
function isValidEmail (email) {
  return typeof email === 'string' && EMAIL_REGEX.test(email)
}

/**
 * 生成随机验证码文本（4位字母数字，排除易混淆字符）
 * @returns {string} 验证码文本
 */
function generateCaptchaCode () {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

/**
 * 生成 SVG 图形验证码
 * @param {string} code - 验证码文本
 * @returns {string} SVG 字符串
 */
function generateCaptchaSVG (code) {
  const width = 120
  const height = 40
  const fontSize = 28

  // 生成干扰线
  let lines = ''
  for (let i = 0; i < 5; i++) {
    const x1 = Math.random() * width
    const y1 = Math.random() * height
    const x2 = Math.random() * width
    const y2 = Math.random() * height
    const color = `hsl(${Math.random() * 360}, 60%, 60%)`
    lines += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="1" opacity="0.5"/>`
  }

  // 生成干扰点
  let dots = ''
  for (let i = 0; i < 30; i++) {
    const x = Math.random() * width
    const y = Math.random() * height
    const color = `hsl(${Math.random() * 360}, 60%, 60%)`
    dots += `<circle cx="${x}" cy="${y}" r="1" fill="${color}" opacity="0.5"/>`
  }

  // 生成每个字符，随机旋转和偏移
  let chars = ''
  for (let i = 0; i < code.length; i++) {
    const x = 15 + i * 26
    const y = 28 + (Math.random() - 0.5) * 8
    const rotate = (Math.random() - 0.5) * 30
    const color = `hsl(${Math.random() * 360}, 70%, 40%)`
    chars += `<text x="${x}" y="${y}" font-family="Arial,sans-serif" font-size="${fontSize}" font-weight="bold" fill="${color}" transform="rotate(${rotate},${x},${y})">${code[i]}</text>`
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="${width}" height="${height}" fill="#f0f0f0" rx="4"/>
    ${lines}${dots}${chars}
  </svg>`
}

/**
 * 获取图形验证码
 * GET /api/auth/captcha
 */
async function handleCaptcha (request) {
  const cfg = await captchaConfigModel.get()
  if (!cfg || !cfg.enabled) {
    return Response.json({ enabled: false })
  }

  const code = generateCaptchaCode()
  const key = 'cap_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)

  captchaStore.set(key, { code, expires: Date.now() + CAPTCHA_TTL })

  const svg = generateCaptchaSVG(code)

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'no-store, no-cache',
      'X-Captcha-Key': key
    }
  })
}

/**
 * 发送验证码
 * POST /api/auth/send-code
 */
async function handleSendCode (request) {
  const { email, type, captchaKey, captchaCode } = await parseBody(request)

  // 参数校验
  if (!isValidEmail(email)) {
    return Response.json({ success: false, message: '邮箱格式不正确' }, { status: 400 })
  }
  if (!['register', 'reset', 'login'].includes(type)) {
    return Response.json({ success: false, message: 'type 参数不合法' }, { status: 400 })
  }

  // 图形验证码校验（启用时校验）
  const captchaCfg = await captchaConfigModel.get()
  if (captchaCfg && captchaCfg.enabled) {
    if (!captchaKey || !captchaCode) {
      return Response.json({ success: false, message: '请输入图形验证码' }, { status: 400 })
    }
    const stored = captchaStore.get(captchaKey)
    captchaStore.delete(captchaKey) // 一次性使用
    if (!stored || stored.expires < Date.now()) {
      return Response.json({ success: false, message: '验证码已过期，请刷新' }, { status: 400 })
    }
    if (stored.code.toUpperCase() !== captchaCode.toUpperCase()) {
      return Response.json({ success: false, message: '图形验证码错误' }, { status: 400 })
    }
  }

  // 频率限制：60 秒内不能重复发送
  const latest = await verifyCodeModel.findLatestByEmail(email, type)
  if (latest) {
    const elapsed = Date.now() - new Date(latest.created_at).getTime()
    if (elapsed < 60 * 1000) {
      return Response.json({ success: false, message: '发送过于频繁，请60秒后重试' }, { status: 429 })
    }
  }

  // 生成 6 位随机验证码
  const code = String(Math.floor(100000 + Math.random() * 900000))

  // 保存验证码到数据库
  await verifyCodeModel.create({ email, code, type })

  // 发送验证码邮件（异步不阻塞，接口立即返回）
  sendVerifyCode(email, code).catch(err => {
    logger.error({ email, err: err.message }, '验证码邮件发送失败')
  })

  return Response.json({ success: true, message: '验证码已发送' })
}

/**
 * 注册
 * POST /api/auth/register
 */
async function handleRegister (request) {
  const { email, code, username, password } = await parseBody(request)

  // 参数校验
  if (!isValidEmail(email)) {
    return Response.json({ success: false, message: '邮箱格式不正确' }, { status: 400 })
  }
  if (!/^\d{6}$/.test(code)) {
    return Response.json({ success: false, message: '验证码格式不正确' }, { status: 400 })
  }
  if (typeof username !== 'string' || username.length < 3) {
    return Response.json({ success: false, message: '用户名至少3个字符' }, { status: 400 })
  }
  if (typeof password !== 'string' || password.length < 6) {
    return Response.json({ success: false, message: '密码至少6个字符' }, { status: 400 })
  }

  // 检查邮箱是否已注册
  const existingUser = await userModel.findByEmail(email)
  if (existingUser) {
    return Response.json({ success: false, message: '该邮箱已注册' }, { status: 400 })
  }

  // 验证验证码
  const codeRecord = await verifyCodeModel.findValid(email, code, 'register')
  if (!codeRecord) {
    return Response.json({ success: false, message: '验证码错误或已过期' }, { status: 400 })
  }

  // 标记验证码为已使用
  await verifyCodeModel.markUsed(codeRecord.id)

  // 哈希密码
  const passwordHash = await hashPassword(password)

  // 创建用户，通过捕获 MySQL 唯一键冲突来处理用户名重复
  let user
  try {
    user = await userModel.create({
      email,
      username,
      passwordHash,
      role: 'user',
      emailVerified: true
    })
  } catch (err) {
    // MySQL 唯一键冲突错误码 ER_DUP_ENTRY
    if (err.code === 'ER_DUP_ENTRY') {
      // 判断是用户名冲突还是邮箱冲突
      if (err.message.includes('username')) {
        return Response.json({ success: false, message: '用户名已存在' }, { status: 400 })
      }
      return Response.json({ success: false, message: '邮箱已注册' }, { status: 400 })
    }
    throw err
  }

  // 签发 JWT
  const token = await sign({ sub: user.id, role: user.role })

  return Response.json({
    success: true,
    token,
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role
    }
  })
}

/**
 * 登录
 * POST /api/auth/login
 */
async function handleLogin (request) {
  const { email, password } = await parseBody(request)

  // 参数校验
  if (!email || !password) {
    return Response.json({ success: false, message: '用户名/邮箱和密码不能为空' }, { status: 400 })
  }

  // 支持用户名或邮箱登录
  const user = email.includes('@')
    ? await userModel.findByEmail(email)
    : await userModel.findByUsername(email)
  if (!user) {
    return Response.json({ success: false, message: '用户名/邮箱或密码错误' }, { status: 401 })
  }

  // 检查账号状态
  if (user.status === 'disabled') {
    return Response.json({ success: false, message: '账号已被禁用' }, { status: 403 })
  }

  // 验证密码
  const valid = await verifyPassword(password, user.password_hash)
  if (!valid) {
    return Response.json({ success: false, message: '用户名/邮箱或密码错误' }, { status: 401 })
  }

  // 签发 JWT
  const token = await sign({ sub: user.id, role: user.role })

  return Response.json({
    success: true,
    token,
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role
    }
  })
}

/**
 * 邮箱验证码登录
 * POST /api/auth/login-code
 */
async function handleLoginByCode (request) {
  const { email, code } = await parseBody(request)

  // 参数校验
  if (!isValidEmail(email)) {
    return Response.json({ success: false, message: '邮箱格式不正确' }, { status: 400 })
  }
  if (!/^\d{6}$/.test(code)) {
    return Response.json({ success: false, message: '验证码格式不正确' }, { status: 400 })
  }

  // 查找用户
  const user = await userModel.findByEmail(email)
  if (!user) {
    return Response.json({ success: false, message: '该邮箱未注册' }, { status: 401 })
  }

  // 检查账号状态
  if (user.status === 'disabled') {
    return Response.json({ success: false, message: '账号已被禁用' }, { status: 403 })
  }

  // 验证验证码
  const codeRecord = await verifyCodeModel.findValid(email, code, 'login')
  if (!codeRecord) {
    return Response.json({ success: false, message: '验证码错误或已过期' }, { status: 400 })
  }

  // 标记验证码为已使用
  await verifyCodeModel.markUsed(codeRecord.id)

  // 签发 JWT
  const token = await sign({ sub: user.id, role: user.role })

  return Response.json({
    success: true,
    token,
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role
    }
  })
}

/**
 * 从请求头解析 JWT 认证用户信息
 * @param {Request} request - 请求对象
 * @returns {Object|null} 用户信息 { id, role } 或 null
 */
function getAuthUser (request) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null
  const token = authHeader.substring(7)
  return verifyJwt(token)
}

/**
 * 登出
 * POST /api/auth/logout
 */
async function handleLogout (request, ctx) {
  // 优先使用 ctx.user（中间件已设置），否则自行解析
  const user = ctx.user || getAuthUser(request)
  if (!user) {
    return Response.json({ success: false, message: '未登录' }, { status: 401 })
  }

  // JWT 无状态，登出由客户端删除 token 即可
  return Response.json({ success: true, message: '已登出' })
}

/**
 * 获取当前用户信息
 * GET /api/auth/me
 */
async function handleMe (request, ctx) {
  // 优先使用 ctx.user（中间件已设置），否则自行解析
  const authUser = ctx.user || getAuthUser(request)
  if (!authUser) {
    return Response.json({ success: false, message: '未登录' }, { status: 401 })
  }

  // 查询最新用户信息
  const user = await userModel.findById(authUser.id)
  if (!user) {
    return Response.json({ success: false, message: '用户不存在' }, { status: 404 })
  }

  return Response.json({
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      emailVerified: user.email_verified,
      createdAt: user.created_at
    }
  })
}

/**
 * 认证路由入口 - 根据路径分派到不同处理器
 * @param {Request} request - 请求对象
 * @param {Object} ctx - 请求上下文（含 user、logger 等）
 * @returns {Promise<Response>} 响应对象
 */
export default async (request, ctx) => {
  const url = new URL(request.url)
  const pathname = url.pathname

  // 路由分派
  if (pathname === '/api/auth/captcha' && request.method === 'GET') {
    return handleCaptcha(request)
  }

  if (pathname === '/api/auth/captcha-enabled' && request.method === 'GET') {
    const cfg = await captchaConfigModel.get()
    return Response.json({ enabled: !!(cfg && cfg.enabled) })
  }

  if (pathname === '/api/auth/send-code' && request.method === 'POST') {
    return handleSendCode(request)
  }

  if (pathname === '/api/auth/register' && request.method === 'POST') {
    return handleRegister(request)
  }

  if (pathname === '/api/auth/login' && request.method === 'POST') {
    return handleLogin(request)
  }

  if (pathname === '/api/auth/login-code' && request.method === 'POST') {
    return handleLoginByCode(request)
  }

  if (pathname === '/api/auth/logout' && request.method === 'POST') {
    return handleLogout(request, ctx)
  }

  if (pathname === '/api/auth/me' && request.method === 'GET') {
    return handleMe(request, ctx)
  }

  return Response.json({ success: false, message: '接口不存在' }, { status: 404 })
}
