/**
 * @file mail.js
 * @description 可插拔邮件发送服务 - 支持 BillionMail、SMTP、通用 HTTP API 三种驱动
 *              配置从数据库 mail_config 表读取，内存缓存 5 分钟
 *
 * BillionMail 驱动说明：
 *   使用 BillionMail HTTP API 发送邮件（基于模板）。
 *   需要先在 BillionMail 后台：
 *   1. 创建邮件模板，模板中包含 {{.API.code}} 变量用于验证码
 *   2. 创建 API Key 并绑定该模板
 *   配置项：apiUrl, apiKey, from
 */

import nodemailer from 'nodemailer'

import { get as getMailConfig } from '../db/mail-config.js'
import { logger } from '../middleware/logger.js'

// 内存缓存
let cachedConfig = null
const CACHE_TTL = 1000 * 60 * 5 // 缓存有效期：5 分钟

/**
 * 获取邮件配置（优先使用缓存，缓存过期则重新从数据库读取）
 *
 * @returns {Promise<Object|null>} 邮件配置对象，无配置时返回 null
 */
async function loadConfig () {
  const now = Date.now()
  if (cachedConfig && cachedConfig.timestamp + CACHE_TTL > now) {
    return cachedConfig.data
  }

  const row = await getMailConfig()
  if (!row) {
    cachedConfig = null
    return null
  }

  let configObj = {}
  try {
    configObj = typeof row.config === 'string' ? JSON.parse(row.config) : row.config
  } catch {
    logger.error({ row }, '邮件配置 JSON 解析失败')
    configObj = {}
  }

  const data = { driver: row.driver, config: configObj }
  cachedConfig = { data, timestamp: now }
  return data
}

// BillionMail 驱动（HTTP API，基于模板）

/**
 * 通过 BillionMail HTTP API 发送邮件
 * 需要在 BillionMail 后台创建模板，模板中使用 {{.API.code}} 变量
 *
 * @param {Object} cfg - 配置 { apiUrl, apiKey, from }
 * @param {string} to - 收件人地址
 * @param {string} subject - 邮件主题（通过模板变量传递）
 * @param {string} code - 验证码或内容（通过模板变量传递）
 */
async function sendViaBillionMail (cfg, to, subject, code) {
  const { apiUrl, apiKey, from } = cfg
  const body = {
    recipient: to,
    attribs: {
      code,
      subject
    }
  }
  // addresser 可选，如果配置了发件人则传递
  if (from) {
    body.addresser = from
  }

  const resp = await fetch(`${apiUrl}/api/batch_mail/api/send`, {
    method: 'POST',
    headers: {
      'X-API-Key': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body),
    tls: { rejectUnauthorized: false }
  })

  const text = await resp.text()
  logger.info({ status: resp.status, body: text }, 'BillionMail API 响应')

  let result
  try {
    result = JSON.parse(text)
  } catch {
    throw new Error(`BillionMail 返回非 JSON 响应 (HTTP ${resp.status}): ${text.substring(0, 200)}`)
  }

  if (!result.success) {
    throw new Error(`BillionMail 发送失败: ${result.msg || result.message || JSON.stringify(result)}`)
  }
}

// SMTP 驱动

/**
 * 通过 SMTP 发送邮件
 *
 * @param {Object} cfg - 配置 { host, port, user, pass, from }
 * @param {string} to - 收件人地址
 * @param {string} subject - 邮件主题
 * @param {string} html - 邮件 HTML 内容
 */
async function sendViaSMTP (cfg, to, subject, html) {
  const { host, port, user, pass, from } = cfg
  const p = Number(port) || 465

  const transporter = nodemailer.createTransport({
    host,
    port: p,
    secure: p === 465,
    auth: { user, pass },
    tls: { rejectUnauthorized: false }
  })

  await transporter.sendMail({ from, to, subject, html })
}

// 通用 HTTP API 驱动

/**
 * 通过通用 HTTP API 发送邮件
 *
 * @param {Object} cfg - 配置 { apiUrl, apiKey, authHeader, from }
 * @param {string} to - 收件人地址
 * @param {string} subject - 邮件主题
 * @param {string} html - 邮件 HTML 内容
 */
async function sendViaHttpApi (cfg, to, subject, html) {
  const { apiUrl, apiKey, authHeader = 'X-API-Key', from } = cfg
  const resp = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      [authHeader]: apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ to, subject, html, from }),
    tls: { rejectUnauthorized: false }
  })

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`HTTP API 发送失败: ${resp.status} ${text}`)
  }
}

// 驱动分发
const drivers = {
  billionmail: sendViaBillionMail,
  smtp: sendViaSMTP,
  http: sendViaHttpApi
}

/**
 * 使用指定配置发送邮件（内部方法）
 * BillionMail 驱动传 code（模板变量），其他驱动传 html
 *
 * @param {Object} mailConfig - 邮件配置 { driver, config }
 * @param {string} to - 收件人地址
 * @param {string} subject - 邮件主题
 * @param {string} content - 邮件内容
 */
async function doSend (mailConfig, to, subject, content) {
  const sender = drivers[mailConfig.driver]
  if (!sender) {
    throw new Error(`不支持的邮件驱动: ${mailConfig.driver}`)
  }
  await sender(mailConfig.config, to, subject, content)
}

/**
 * 发送邮件（使用当前数据库中配置的驱动）
 *
 * @param {Object} params - 发送参数
 * @param {string} params.to - 收件人地址
 * @param {string} params.subject - 邮件主题
 * @param {string} params.html - 邮件 HTML 内容（SMTP/HTTP 驱动使用）
 * @param {string} [params.code] - 验证码（BillionMail 驱动使用，作为模板变量）
 * @returns {Promise<true>} 发送成功返回 true
 */
export async function sendMail ({ to, subject, html, code }) {
  const mailConfig = await loadConfig()
  if (!mailConfig) {
    throw new Error('邮件服务未配置，请在管理后台设置')
  }

  // BillionMail 使用模板变量 code，其他驱动使用 html
  const content = mailConfig.driver === 'billionmail' ? (code || html) : html

  try {
    await doSend(mailConfig, to, subject, content)
    logger.info({ to, subject, driver: mailConfig.driver }, '邮件发送成功')
    return true
  } catch (err) {
    logger.error({ to, subject, driver: mailConfig.driver, err: err.message }, '邮件发送失败')
    throw err
  }
}

/**
 * 发送验证码邮件
 *
 * @param {string} email - 收件人地址
 * @param {string} code - 6 位验证码
 * @returns {Promise<true>} 发送成功返回 true
 */
export async function sendVerifyCode (email, code) {
  const html = `<!DOCTYPE html>
<html>
<head>
<title>验证码 - ws.guokel.site</title>
<style>body{margin:0;padding:0;font-family:Arial,sans-serif;background-color:#f5f7fa;line-height:1.6}.container{max-width:600px;margin:0 auto;padding:20px}.header{text-align:center;margin-bottom:30px}.logo{font-size:32px;font-weight:bold;color:#2c3e50;margin-bottom:10px}.subtitle{color:#7f8c8d;font-size:16px}.content{background-color:#ffffff;border-radius:10px;padding:30px;margin-bottom:20px;box-shadow:0 2px 10px rgba(0,0,0,0.1)}.welcome-title{font-size:24px;color:#2c3e50;margin-bottom:20px;font-weight:bold}.welcome-text{color:#34495e;font-size:16px;margin-bottom:20px}.highlight-box{background-color:#ecf0f1;border-left:4px solid #3498db;padding:15px;margin:20px 0;border-radius:0 5px 5px 0}.verification-code{background-color:#f8f9fa;border:2px dashed #bdc3c7;padding:15px;text-align:center;margin:20px 0;border-radius:5px}.code-display{font-size:24px;font-weight:bold;color:#e74c3c;letter-spacing:2px;margin-bottom:10px}.code-label{color:#7f8c8d;font-size:14px}.footer{text-align:center;color:#7f8c8d;font-size:14px;margin-top:20px}</style>
</head>
<body>
<div class="container">
<div class="header">
<div class="logo">ws.guokel.site</div>
<div class="subtitle">知识改变命运，学习成就未来</div>
</div>
<div class="content">
<h1 class="welcome-title">欢迎加入 ws.guokel.site！</h1>
<p class="welcome-text">亲爱的用户，</p>
<p class="welcome-text">非常欢迎您加入 ws.guokel.site 学习平台！我们很高兴您选择与我们一同开启知识探索的旅程。</p>
<div class="highlight-box">
<p><strong>验证码验证</strong></p>
<p>您正在进行身份验证操作，请使用以下验证码完成验证。</p>
</div>
<div class="verification-code">
<div class="code-display">${code}</div>
<div class="code-label">您的验证码（有效期 5 分钟）</div>
</div>
<p class="welcome-text">请妥善保管您的验证码，如非本人操作，请忽略此邮件。</p>
</div>
<div class="footer">
<p>本邮件由系统自动发送，请勿直接回复。</p>
</div>
</div>
</body>
</html>`

  return sendMail({ to: email, subject: '验证码 - ws.guokel.site', html, code })
}

/**
 * 测试邮件配置（用于管理后台测试发送，不影响缓存）
 *
 * @param {Object} config - 测试用的邮件配置 { driver, config }
 * @param {string} testRecipient - 测试收件人地址
 * @returns {Promise<{success: boolean, message?: string}>} 测试结果
 */
export async function testMailConfig (config, testRecipient) {
  try {
    const content = config.driver === 'billionmail'
      ? '这是一封测试邮件'
      : '<p>这是一封测试邮件，用于验证邮件服务配置是否正确。</p>'
    await doSend(config, testRecipient, '测试邮件 - Meting API', content)
    return { success: true }
  } catch (err) {
    return { success: false, message: err.message }
  }
}

/**
 * 强制刷新缓存的邮件配置
 */
export function refreshConfig () {
  cachedConfig = null
}
