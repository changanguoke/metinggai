/**
 * @file install-page.js
 * @description 安装向导页面服务 - 返回自包含的 HTML 安装向导页面
 *              包含数据库配置、管理员创建、邮件配置、安装完成四个步骤
 */

import config from '../config.js'

/**
 * 生成安装向导 HTML 页面
 * @returns {Response} HTML 页面响应
 */
export default async () => {
  const prefix = config.http.prefix

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Meting API - 安装向导</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }
  .wizard {
    background: #fff;
    border-radius: 16px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.15);
    width: 100%;
    max-width: 560px;
    overflow: hidden;
  }
  .wizard-header {
    background: linear-gradient(135deg, #4f46e5, #7c3aed);
    padding: 28px 32px;
    color: #fff;
  }
  .wizard-header h1 { font-size: 22px; font-weight: 600; margin-bottom: 4px; }
  .wizard-header p { font-size: 14px; opacity: 0.85; }
  .wizard-body { padding: 32px; }
  /* 步骤指示器 */
  .steps {
    display: flex;
    justify-content: space-between;
    margin-bottom: 32px;
    position: relative;
  }
  .steps::before {
    content: '';
    position: absolute;
    top: 18px;
    left: 40px;
    right: 40px;
    height: 2px;
    background: #e5e7eb;
  }
  .step {
    display: flex;
    flex-direction: column;
    align-items: center;
    position: relative;
    z-index: 1;
    flex: 1;
  }
  .step-circle {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: #e5e7eb;
    color: #9ca3af;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-weight: 600;
    margin-bottom: 8px;
    transition: all 0.3s;
  }
  .step.active .step-circle { background: #4f46e5; color: #fff; }
  .step.done .step-circle { background: #10b981; color: #fff; }
  .step-label { font-size: 12px; color: #9ca3af; }
  .step.active .step-label { color: #4f46e5; font-weight: 500; }
  .step.done .step-label { color: #10b981; }
  /* 表单 */
  .form-group { margin-bottom: 18px; }
  .form-group label {
    display: block;
    font-size: 14px;
    font-weight: 500;
    color: #374151;
    margin-bottom: 6px;
  }
  .form-group input, .form-group select {
    width: 100%;
    padding: 10px 14px;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    font-size: 14px;
    color: #1f2937;
    outline: none;
    transition: border-color 0.2s;
  }
  .form-group input:focus, .form-group select:focus { border-color: #4f46e5; box-shadow: 0 0 0 3px rgba(79,70,229,0.1); }
  .form-row { display: flex; gap: 14px; }
  .form-row .form-group { flex: 1; }
  /* 按钮 */
  .btn {
    padding: 10px 20px;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }
  .btn:disabled { opacity: 0.6; cursor: not-allowed; }
  .btn-primary { background: #4f46e5; color: #fff; }
  .btn-primary:hover:not(:disabled) { background: #4338ca; }
  .btn-secondary { background: #f3f4f6; color: #374151; }
  .btn-secondary:hover:not(:disabled) { background: #e5e7eb; }
  .btn-success { background: #10b981; color: #fff; }
  .btn-success:hover:not(:disabled) { background: #059669; }
  .btn-test { background: #f59e0b; color: #fff; padding: 10px 16px; font-size: 13px; }
  .btn-test:hover:not(:disabled) { background: #d97706; }
  .actions { display: flex; justify-content: space-between; align-items: center; margin-top: 28px; }
  .actions-right { display: flex; gap: 10px; }
  /* 消息提示 */
  .msg {
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 13px;
    margin-top: 12px;
    display: none;
  }
  .msg.error { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; display: block; }
  .msg.success { background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; display: block; }
  /* 步骤面板 */
  .step-panel { display: none; }
  .step-panel.active { display: block; }
  /* 完成页面 */
  .complete-icon {
    width: 72px; height: 72px;
    background: #10b981;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 20px;
  }
  .complete-icon svg { width: 36px; height: 36px; fill: #fff; }
  .complete-title { text-align: center; font-size: 20px; font-weight: 600; color: #1f2937; margin-bottom: 8px; }
  .complete-desc { text-align: center; font-size: 14px; color: #6b7280; margin-bottom: 24px; }
  .btn-admin {
    display: inline-block;
    background: #4f46e5;
    color: #fff;
    padding: 12px 32px;
    border-radius: 8px;
    text-decoration: none;
    font-size: 15px;
    font-weight: 500;
    text-align: center;
    transition: background 0.2s;
  }
  .btn-admin:hover { background: #4338ca; }
  .btn-center { text-align: center; }
  .inline-test { display: flex; gap: 10px; align-items: flex-end; }
  .inline-test .form-group { flex: 1; }
  .inline-test .btn-test { margin-bottom: 0; flex-shrink: 0; align-self: flex-end; height: 42px; }
  .loading { display: inline-block; width: 16px; height: 16px; border: 2px solid #fff; border-top-color: transparent; border-radius: 50%; animation: spin 0.6s linear infinite; vertical-align: middle; margin-right: 6px; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
</head>
<body>
<div class="wizard">
  <div class="wizard-header">
    <h1>Meting API 安装向导</h1>
    <p>请按步骤完成系统初始化配置</p>
  </div>
  <div class="wizard-body">
    <!-- 步骤指示器 -->
    <div class="steps">
      <div class="step active" data-step="1">
        <div class="step-circle">1</div>
        <div class="step-label">数据库</div>
      </div>
      <div class="step" data-step="2">
        <div class="step-circle">2</div>
        <div class="step-label">管理员</div>
      </div>
      <div class="step" data-step="3">
        <div class="step-circle">3</div>
        <div class="step-label">邮件</div>
      </div>
      <div class="step" data-step="4">
        <div class="step-circle">4</div>
        <div class="step-label">完成</div>
      </div>
    </div>

    <!-- 步骤1：数据库配置 -->
    <div class="step-panel active" id="step1">
      <div class="form-group">
        <label>主机地址</label>
        <input type="text" id="db-host" value="localhost" placeholder="数据库主机地址">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>端口</label>
          <input type="number" id="db-port" value="3306" placeholder="端口号">
        </div>
        <div class="form-group">
          <label>数据库名</label>
          <input type="text" id="db-database" placeholder="数据库名称">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>用户名</label>
          <input type="text" id="db-user" placeholder="数据库用户名">
        </div>
        <div class="form-group">
          <label>密码</label>
          <input type="password" id="db-password" placeholder="数据库密码">
        </div>
      </div>
      <div class="inline-test">
        <div style="flex:1"></div>
        <button class="btn btn-test" id="btn-test-db" onclick="testDb()">测试连接</button>
      </div>
      <div class="msg" id="msg-db"></div>
      <div class="actions">
        <div></div>
        <div class="actions-right">
          <button class="btn btn-primary" onclick="saveDb()">保存并继续</button>
        </div>
      </div>
    </div>

    <!-- 步骤2：管理员账户 -->
    <div class="step-panel" id="step2">
      <div class="form-group">
        <label>管理员用户名</label>
        <input type="text" id="admin-username" placeholder="至少 3 个字符">
      </div>
      <div class="form-group">
        <label>管理员邮箱</label>
        <input type="email" id="admin-email" placeholder="请输入管理员邮箱">
      </div>
      <div class="form-group">
        <label>密码</label>
        <input type="password" id="admin-password" placeholder="至少 6 位密码">
      </div>
      <div class="form-group">
        <label>确认密码</label>
        <input type="password" id="admin-password-confirm" placeholder="再次输入密码">
      </div>
      <div class="msg" id="msg-admin"></div>
      <div class="actions">
        <button class="btn btn-secondary" onclick="goStep(1)">上一步</button>
        <div class="actions-right">
          <button class="btn btn-primary" onclick="createAdmin()">创建并继续</button>
        </div>
      </div>
    </div>

    <!-- 步骤3：邮件配置 -->
    <div class="step-panel" id="step3">
      <div class="form-group">
        <label>邮件驱动</label>
        <select id="mail-driver" onchange="switchMailFields()">
          <option value="billionmail">BillionMail</option>
          <option value="smtp">SMTP</option>
          <option value="generic">Generic HTTP</option>
        </select>
      </div>
      <!-- BillionMail 字段（使用 HTTP API，基于模板）-->
      <div id="mail-billionmail">
        <div class="form-group">
          <label>API 地址</label>
          <input type="text" id="bm-api-url" placeholder="如 https://mail.yourdomain.com">
        </div>
        <div class="form-group">
          <label>API Key</label>
          <input type="text" id="bm-api-key" placeholder="在 BillionMail 后台创建 API Key">
        </div>
        <div class="form-group">
          <label>发件人邮箱</label>
          <input type="email" id="bm-from" placeholder="发件人邮箱地址">
        </div>
        <p style="font-size:12px;color:#9ca3af;margin-top:8px;">需先在 BillionMail 后台创建邮件模板，模板中包含 {{.API.code}} 变量</p>
      </div>
      <!-- SMTP 字段 -->
      <div id="mail-smtp" style="display:none">
        <div class="form-group">
          <label>服务器地址</label>
          <input type="text" id="smtp-host" placeholder="SMTP 服务器地址">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>端口</label>
            <input type="number" id="smtp-port" value="465" placeholder="端口号">
          </div>
          <div class="form-group">
            <label>用户名</label>
            <input type="text" id="smtp-user" placeholder="SMTP 用户名">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>密码</label>
            <input type="password" id="smtp-pass" placeholder="SMTP 密码">
          </div>
          <div class="form-group">
            <label>发件人邮箱</label>
            <input type="email" id="smtp-from" placeholder="发件人邮箱地址">
          </div>
        </div>
      </div>
      <!-- Generic HTTP 字段 -->
      <div id="mail-generic" style="display:none">
        <div class="form-group">
          <label>API URL</label>
          <input type="text" id="gen-api-url" placeholder="HTTP API 地址">
        </div>
        <div class="form-group">
          <label>API Key</label>
          <input type="text" id="gen-api-key" placeholder="API 密钥">
        </div>
        <div class="form-group">
          <label>认证头名称</label>
          <input type="text" id="gen-auth-header" value="X-API-Key" placeholder="如 X-API-Key">
        </div>
        <div class="form-group">
          <label>发件人邮箱</label>
          <input type="email" id="gen-from" placeholder="发件人邮箱地址">
        </div>
      </div>
      <div class="inline-test">
        <div class="form-group">
          <label>测试收件人</label>
          <input type="email" id="mail-test-recipient" placeholder="输入邮箱以测试发送">
        </div>
        <button class="btn btn-test" onclick="testMail()">发送测试</button>
      </div>
      <div class="msg" id="msg-mail"></div>
      <div class="actions">
        <button class="btn btn-secondary" onclick="goStep(2)">上一步</button>
        <div class="actions-right">
          <button class="btn btn-primary" onclick="saveMail()">保存并继续</button>
        </div>
      </div>
    </div>

    <!-- 步骤4：完成 -->
    <div class="step-panel" id="step4">
      <div class="complete-icon">
        <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>
      </div>
      <div class="complete-title">安装完成！</div>
      <div class="complete-desc">系统已成功初始化，你可以开始使用管理后台了。</div>
      <div class="btn-center">
        <a href="${prefix}/admin" class="btn-admin">进入管理后台</a>
      </div>
    </div>
  </div>
</div>

<script>
// 当前步骤
let currentStep = 1

// 切换步骤
function goStep(step) {
  currentStep = step
  // 更新面板显示
  document.querySelectorAll('.step-panel').forEach(p => p.classList.remove('active'))
  document.getElementById('step' + step).classList.add('active')
  // 更新步骤指示器
  document.querySelectorAll('.step').forEach(s => {
    const n = parseInt(s.dataset.step)
    s.classList.remove('active', 'done')
    if (n === step) s.classList.add('active')
    else if (n < step) s.classList.add('done')
  })
}

// 显示消息
function showMsg(id, type, text) {
  const el = document.getElementById(id)
  el.className = 'msg ' + type
  el.textContent = text
}
function clearMsg(id) {
  const el = document.getElementById(id)
  el.className = 'msg'
  el.textContent = ''
}

// 按钮加载状态
function setLoading(btn, loading) {
  if (loading) {
    btn.disabled = true
    btn.dataset.origText = btn.textContent
    btn.innerHTML = '<span class="loading"></span>' + btn.dataset.origText
  } else {
    btn.disabled = false
    btn.textContent = btn.dataset.origText || btn.textContent
  }
}

// 通用请求封装
async function apiPost(path, body) {
  const resp = await fetch('${prefix}/api/install' + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  return resp.json()
}

// ====== 步骤1：数据库 ======
async function testDb() {
  const btn = document.getElementById('btn-test-db')
  clearMsg('msg-db')
  setLoading(btn, true)
  try {
    const data = {
      host: document.getElementById('db-host').value,
      port: document.getElementById('db-port').value,
      user: document.getElementById('db-user').value,
      password: document.getElementById('db-password').value,
      database: document.getElementById('db-database').value
    }
    const res = await apiPost('/test-db', data)
    if (res.success) showMsg('msg-db', 'success', '数据库连接成功！')
    else showMsg('msg-db', 'error', '连接失败：' + res.message)
  } catch (err) {
    showMsg('msg-db', 'error', '请求失败：' + err.message)
  }
  setLoading(btn, false)
}

async function saveDb() {
  const btn = event.target
  clearMsg('msg-db')
  const database = document.getElementById('db-database').value.trim()
  const user = document.getElementById('db-user').value.trim()
  if (!database || !user) {
    showMsg('msg-db', 'error', '请填写数据库名和用户名')
    return
  }
  setLoading(btn, true)
  try {
    const data = {
      host: document.getElementById('db-host').value,
      port: document.getElementById('db-port').value,
      user: user,
      password: document.getElementById('db-password').value,
      database: database
    }
    const res = await apiPost('/save-db', data)
    if (res.success) {
      showMsg('msg-db', 'success', '数据库配置已保存，表已初始化！')
      // 检查是否已安装完成（数据库已有用户和邮件配置的情况）
      try {
        const statusResp = await fetch('${prefix}/api/install/status')
        const statusData = await statusResp.json()
        if (statusData.installed) {
          setTimeout(() => goStep(4), 800)
          return
        }
      } catch {}
      setTimeout(() => goStep(2), 800)
    } else {
      showMsg('msg-db', 'error', '保存失败：' + res.message)
    }
  } catch (err) {
    showMsg('msg-db', 'error', '请求失败：' + err.message)
  }
  setLoading(btn, false)
}

// ====== 步骤2：管理员 ======
async function createAdmin() {
  const btn = event.target
  clearMsg('msg-admin')
  const username = document.getElementById('admin-username').value.trim()
  const email = document.getElementById('admin-email').value.trim()
  const password = document.getElementById('admin-password').value
  const confirm = document.getElementById('admin-password-confirm').value
  if (!username || username.length < 3) { showMsg('msg-admin', 'error', '用户名至少 3 个字符'); return }
  if (!email) { showMsg('msg-admin', 'error', '请输入邮箱'); return }
  if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) { showMsg('msg-admin', 'error', '邮箱格式不正确'); return }
  if (password.length < 6) { showMsg('msg-admin', 'error', '密码长度不能少于 6 位'); return }
  if (password !== confirm) { showMsg('msg-admin', 'error', '两次输入的密码不一致'); return }
  setLoading(btn, true)
  try {
    const res = await apiPost('/create-admin', { username, email, password })
    if (res.success) {
      showMsg('msg-admin', 'success', res.message || '管理员账户创建成功！')
      setTimeout(() => goStep(3), 800)
    } else {
      showMsg('msg-admin', 'error', '创建失败：' + res.message)
    }
  } catch (err) {
    showMsg('msg-admin', 'error', '请求失败：' + err.message)
  }
  setLoading(btn, false)
}

// ====== 步骤3：邮件配置 ======
function switchMailFields() {
  const driver = document.getElementById('mail-driver').value
  document.getElementById('mail-billionmail').style.display = driver === 'billionmail' ? 'block' : 'none'
  document.getElementById('mail-smtp').style.display = driver === 'smtp' ? 'block' : 'none'
  document.getElementById('mail-generic').style.display = driver === 'generic' ? 'block' : 'none'
}

function getMailConfig() {
  const driver = document.getElementById('mail-driver').value
  let cfg = {}
  if (driver === 'billionmail') {
    cfg = {
      apiUrl: document.getElementById('bm-api-url').value,
      apiKey: document.getElementById('bm-api-key').value,
      from: document.getElementById('bm-from').value
    }
  } else if (driver === 'smtp') {
    cfg = {
      host: document.getElementById('smtp-host').value,
      port: document.getElementById('smtp-port').value,
      user: document.getElementById('smtp-user').value,
      pass: document.getElementById('smtp-pass').value,
      from: document.getElementById('smtp-from').value
    }
  } else {
    cfg = {
      apiUrl: document.getElementById('gen-api-url').value,
      apiKey: document.getElementById('gen-api-key').value,
      authHeader: document.getElementById('gen-auth-header').value,
      from: document.getElementById('gen-from').value
    }
  }
  return { driver, config: cfg }
}

async function testMail() {
  const btn = event.target
  clearMsg('msg-mail')
  const recipient = document.getElementById('mail-test-recipient').value.trim()
  if (!recipient) { showMsg('msg-mail', 'error', '请输入测试收件人邮箱'); return }
  setLoading(btn, true)
  try {
    const { driver, config } = getMailConfig()
    const res = await apiPost('/test-mail', { driver, config, recipient })
    if (res.success) showMsg('msg-mail', 'success', '测试邮件发送成功！')
    else showMsg('msg-mail', 'error', '发送失败：' + (res.message || '未知错误'))
  } catch (err) {
    showMsg('msg-mail', 'error', '请求失败：' + err.message)
  }
  setLoading(btn, false)
}

async function saveMail() {
  const btn = event.target
  clearMsg('msg-mail')
  setLoading(btn, true)
  try {
    const { driver, config } = getMailConfig()
    const res = await apiPost('/save-mail', { driver, config })
    if (res.success) {
      showMsg('msg-mail', 'success', '邮件配置已保存！')
      setTimeout(() => goStep(4), 800)
    } else {
      showMsg('msg-mail', 'error', '保存失败：' + res.message)
    }
  } catch (err) {
    showMsg('msg-mail', 'error', '请求失败：' + err.message)
  }
  setLoading(btn, false)
}

// 页面加载时检查安装状态
(async function() {
  try {
    const resp = await fetch('${prefix}/api/install/status')
    const data = await resp.json()
    if (data.installed) {
      document.querySelector('.wizard-body').innerHTML =
        '<div style="text-align:center;padding:40px 0">' +
        '<div style="font-size:18px;font-weight:600;color:#374151;margin-bottom:8px">系统已安装</div>' +
        '<div style="color:#6b7280;margin-bottom:24px">系统已完成初始化，无需重复安装。</div>' +
        '<a href="${prefix}/admin" class="btn-admin">进入管理后台</a></div>'
    }
  } catch {}
})()
</script>
</body>
</html>`

  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8' }
  })
}
