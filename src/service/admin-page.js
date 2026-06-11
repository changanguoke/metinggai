/**
 * @file admin-page.js
 * @description 管理后台页面服务 - 返回自包含的 HTML SPA 管理后台页面
 *              包含登录、仪表盘、用户管理、缓存管理、Cookie 配置、邮件配置等功能
 */

import config from '../config.js'

/**
 * 生成管理后台 HTML 页面
 * @param {Request} request - HTTP 请求对象
 * @returns {Response} HTML 页面响应
 */
export default async (request) => {
  const prefix = config.http.prefix

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Meting API - 管理后台</title>
<style>
  /* ====== 基础重置 ====== */
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    background: #F9FAFB;
    color: #1F2937;
    min-height: 100vh;
  }

  /* ====== 登录页 ====== */
  .login-wrapper {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%);
    padding: 20px;
  }
  .login-card {
    background: #fff;
    border-radius: 16px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.15);
    width: 100%;
    max-width: 420px;
    overflow: hidden;
  }
  .login-header {
    background: linear-gradient(135deg, #4F46E5, #7C3AED);
    padding: 32px;
    text-align: center;
    color: #fff;
  }
  .login-header h1 { font-size: 22px; font-weight: 600; margin-bottom: 4px; }
  .login-header p { font-size: 14px; opacity: 0.85; }
  .login-body { padding: 32px; }
  .login-body .form-group { margin-bottom: 18px; }
  .login-body .form-group label {
    display: block; font-size: 14px; font-weight: 500;
    color: #374151; margin-bottom: 6px;
  }
  .login-body .form-group input {
    width: 100%; padding: 10px 14px; border: 1px solid #d1d5db;
    border-radius: 8px; font-size: 14px; color: #1F2937; outline: none;
    transition: border-color 0.2s;
  }
  .login-body .form-group input:focus {
    border-color: #4F46E5; box-shadow: 0 0 0 3px rgba(79,70,229,0.1);
  }
  .login-btn {
    width: 100%; padding: 12px; border: none; border-radius: 8px;
    background: #4F46E5; color: #fff; font-size: 15px; font-weight: 500;
    cursor: pointer; transition: background 0.2s;
  }
  .login-btn:hover { background: #4338CA; }
  .login-btn:disabled { opacity: 0.6; cursor: not-allowed; }

  /* ====== 仪表盘布局 ====== */
  .app { display: none; min-height: 100vh; }
  .app.active { display: flex; }

  /* 侧边栏 */
  .sidebar {
    width: 240px; background: #1F2937; color: #fff;
    display: flex; flex-direction: column; flex-shrink: 0;
    position: fixed; top: 0; left: 0; bottom: 0; z-index: 100;
  }
  .sidebar-brand {
    padding: 20px 24px; border-bottom: 1px solid rgba(255,255,255,0.1);
    font-size: 18px; font-weight: 600; white-space: nowrap;
  }
  .sidebar-brand span { color: #818CF8; }
  .sidebar-nav { flex: 1; padding: 12px 0; overflow-y: auto; }
  .nav-item {
    display: flex; align-items: center; gap: 12px;
    padding: 12px 24px; color: #D1D5DB; font-size: 14px;
    cursor: pointer; transition: all 0.2s; border-left: 3px solid transparent;
  }
  .nav-item:hover { background: rgba(255,255,255,0.05); color: #fff; }
  .nav-item.active {
    background: rgba(79,70,229,0.15); color: #818CF8;
    border-left-color: #818CF8;
  }
  .nav-item svg { width: 20px; height: 20px; flex-shrink: 0; }
  .sidebar-footer {
    padding: 16px 24px; border-top: 1px solid rgba(255,255,255,0.1);
    font-size: 12px; color: #9CA3AF;
  }

  /* 主内容区 */
  .main-wrapper {
    flex: 1; margin-left: 240px; display: flex; flex-direction: column; min-height: 100vh;
  }

  /* 顶部栏 */
  .topbar {
    height: 60px; background: #fff; border-bottom: 1px solid #E5E7EB;
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 24px; position: sticky; top: 0; z-index: 50;
  }
  .topbar-title { font-size: 16px; font-weight: 600; color: #1F2937; }
  .topbar-right { display: flex; align-items: center; gap: 16px; }
  .topbar-user { font-size: 14px; color: #6B7280; }
  .btn-logout {
    padding: 6px 16px; border: 1px solid #d1d5db; border-radius: 6px;
    background: #fff; color: #374151; font-size: 13px; cursor: pointer;
    transition: all 0.2s;
  }
  .btn-logout:hover { background: #FEE2E2; color: #DC2626; border-color: #FECACA; }

  /* 内容区 */
  .content { flex: 1; padding: 24px; }

  /* ====== 通用组件 ====== */
  /* 卡片 */
  .card {
    background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.08);
    padding: 24px; margin-bottom: 20px;
  }
  .card-title {
    font-size: 16px; font-weight: 600; color: #1F2937;
    margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid #F3F4F6;
  }

  /* 统计卡片 */
  .stats-grid {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px; margin-bottom: 20px;
  }
  .stat-card {
    background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.08);
    padding: 20px; display: flex; align-items: center; gap: 16px;
  }
  .stat-icon {
    width: 48px; height: 48px; border-radius: 12px;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  }
  .stat-icon svg { width: 24px; height: 24px; }
  .stat-icon.blue { background: #EEF2FF; color: #4F46E5; }
  .stat-icon.green { background: #ECFDF5; color: #059669; }
  .stat-icon.amber { background: #FFFBEB; color: #D97706; }
  .stat-icon.purple { background: #F5F3FF; color: #7C3AED; }
  .stat-info { flex: 1; }
  .stat-label { font-size: 13px; color: #6B7280; margin-bottom: 4px; }
  .stat-value { font-size: 24px; font-weight: 700; color: #1F2937; }

  /* 表格 */
  .table-wrapper { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  thead th {
    text-align: left; padding: 12px 16px; background: #F9FAFB;
    color: #6B7280; font-weight: 500; font-size: 13px;
    border-bottom: 1px solid #E5E7EB; white-space: nowrap;
  }
  tbody td {
    padding: 12px 16px; border-bottom: 1px solid #F3F4F6; color: #374151;
  }
  tbody tr:hover { background: #F9FAFB; }

  /* 按钮 */
  .btn {
    padding: 8px 16px; border: none; border-radius: 6px;
    font-size: 13px; font-weight: 500; cursor: pointer;
    transition: all 0.2s; display: inline-flex; align-items: center; gap: 6px;
  }
  .btn:disabled { opacity: 0.6; cursor: not-allowed; }
  .btn-primary { background: #4F46E5; color: #fff; }
  .btn-primary:hover:not(:disabled) { background: #4338CA; }
  .btn-danger { background: #EF4444; color: #fff; }
  .btn-danger:hover:not(:disabled) { background: #DC2626; }
  .btn-warning { background: #F59E0B; color: #fff; }
  .btn-warning:hover:not(:disabled) { background: #D97706; }
  .btn-success { background: #10B981; color: #fff; }
  .btn-success:hover:not(:disabled) { background: #059669; }
  .btn-sm { padding: 5px 12px; font-size: 12px; }
  .btn-outline {
    background: #fff; color: #374151; border: 1px solid #D1D5DB;
  }
  .btn-outline:hover:not(:disabled) { background: #F9FAFB; }

  /* 表单 */
  .form-group { margin-bottom: 16px; }
  .form-group label {
    display: block; font-size: 14px; font-weight: 500;
    color: #374151; margin-bottom: 6px;
  }
  .form-group input, .form-group select, .form-group textarea {
    width: 100%; padding: 9px 14px; border: 1px solid #D1D5DB;
    border-radius: 8px; font-size: 14px; color: #1F2937; outline: none;
    transition: border-color 0.2s; background: #fff;
  }
  .form-group input:focus, .form-group select:focus, .form-group textarea:focus {
    border-color: #4F46E5; box-shadow: 0 0 0 3px rgba(79,70,229,0.1);
  }
  .form-group textarea { resize: vertical; min-height: 80px; }
  .form-row { display: flex; gap: 14px; }
  .form-row .form-group { flex: 1; }
  .form-hint { font-size: 12px; color: #9CA3AF; margin-top: 4px; }

  /* 状态标签 */
  .badge {
    display: inline-block; padding: 3px 10px; border-radius: 20px;
    font-size: 12px; font-weight: 500;
  }
  .badge-green { background: #ECFDF5; color: #059669; }
  .badge-red { background: #FEF2F2; color: #DC2626; }
  .badge-blue { background: #EEF2FF; color: #4F46E5; }
  .badge-amber { background: #FFFBEB; color: #D97706; }
  .badge-gray { background: #F3F4F6; color: #6B7280; }

  /* 消息提示 */
  .toast {
    position: fixed; top: 20px; right: 20px; z-index: 9999;
    padding: 14px 20px; border-radius: 10px; font-size: 14px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.12);
    transform: translateX(120%); transition: transform 0.3s ease;
    max-width: 400px;
  }
  .toast.show { transform: translateX(0); }
  .toast-success { background: #ECFDF5; color: #059669; border: 1px solid #A7F3D0; }
  .toast-error { background: #FEF2F2; color: #DC2626; border: 1px solid #FECACA; }
  .toast-info { background: #EEF2FF; color: #4F46E5; border: 1px solid #C7D2FE; }

  /* 加载动画 */
  .spinner {
    display: inline-block; width: 16px; height: 16px;
    border: 2px solid currentColor; border-top-color: transparent;
    border-radius: 50%; animation: spin 0.6s linear infinite;
    vertical-align: middle; margin-right: 6px;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* 空状态 */
  .empty-state {
    text-align: center; padding: 40px 20px; color: #9CA3AF;
  }
  .empty-state svg { width: 48px; height: 48px; margin-bottom: 12px; }
  .empty-state p { font-size: 14px; }

  /* 操作栏 */
  .action-bar {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 16px;
  }

  /* Cookie 平台列表 */
  .platform-list { display: flex; flex-direction: column; gap: 12px; }
  .platform-item {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 20px; background: #F9FAFB; border-radius: 10px;
    border: 1px solid #E5E7EB;
  }
  .platform-info { display: flex; align-items: center; gap: 12px; }
  .platform-name { font-size: 15px; font-weight: 500; color: #1F2937; }
  .platform-status { font-size: 13px; color: #6B7280; }
  .platform-actions { display: flex; gap: 8px; }

  /* 模态框 */
  .modal-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,0.4);
    display: flex; align-items: center; justify-content: center;
    z-index: 200; opacity: 0; pointer-events: none; transition: opacity 0.2s;
  }
  .modal-overlay.active { opacity: 1; pointer-events: auto; }
  .modal {
    background: #fff; border-radius: 14px; box-shadow: 0 20px 60px rgba(0,0,0,0.2);
    width: 100%; max-width: 480px; max-height: 90vh; overflow-y: auto;
  }
  .modal-header {
    padding: 20px 24px; border-bottom: 1px solid #E5E7EB;
    font-size: 16px; font-weight: 600;
  }
  .modal-body { padding: 24px; }
  .modal-footer {
    padding: 16px 24px; border-top: 1px solid #E5E7EB;
    display: flex; justify-content: flex-end; gap: 10px;
  }

  /* 确认对话框 */
  .confirm-text { font-size: 14px; color: #374151; line-height: 1.6; }

  /* 页面区域 */
  .page { display: none; }
  .page.active { display: block; }

  /* 邮件配置展示 */
  .config-display {
    display: grid; grid-template-columns: 140px 1fr; gap: 8px 16px;
    font-size: 14px;
  }
  .config-label { color: #6B7280; font-weight: 500; }
  .config-value { color: #1F2937; word-break: break-all; }

  /* 响应式 */
  @media (max-width: 768px) {
    .sidebar { width: 200px; }
    .main-wrapper { margin-left: 200px; }
    .stats-grid { grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); }
  }
  @media (max-width: 640px) {
    .sidebar {
      width: 100%; position: relative; flex-direction: row; overflow-x: auto;
    }
    .sidebar-brand { display: none; }
    .sidebar-nav { display: flex; flex-direction: row; padding: 0; }
    .nav-item {
      padding: 12px 16px; border-left: none; border-bottom: 3px solid transparent;
      white-space: nowrap; font-size: 13px;
    }
    .nav-item.active { border-left-color: transparent; border-bottom-color: #818CF8; }
    .sidebar-footer { display: none; }
    .main-wrapper { margin-left: 0; }
    .app.active { flex-direction: column; }
  }
</style>
</head>
<body>

<!-- ====== 登录页 ====== -->
<div id="loginPage" class="login-wrapper">
  <div class="login-card">
    <div class="login-header">
      <h1>Meting API</h1>
      <p>管理后台登录</p>
    </div>
    <div class="login-body">
      <div class="form-group">
        <label>邮箱</label>
        <input type="email" id="login-email" placeholder="请输入管理员邮箱" autocomplete="email">
      </div>
      <div class="form-group">
        <label>密码</label>
        <input type="password" id="login-password" placeholder="请输入密码" autocomplete="current-password">
      </div>
      <div id="login-error" style="color:#DC2626;font-size:13px;margin-bottom:12px;display:none"></div>
      <button class="login-btn" id="btn-login" onclick="handleLogin()">登 录</button>
    </div>
  </div>
</div>

<!-- ====== 管理后台主体 ====== -->
<div id="app" class="app">
  <!-- 侧边栏 -->
  <aside class="sidebar">
    <div class="sidebar-brand">Meting <span>Admin</span></div>
    <nav class="sidebar-nav">
      <div class="nav-item active" data-page="dashboard" onclick="switchPage('dashboard')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
        仪表盘
      </div>
      <div class="nav-item" data-page="users" onclick="switchPage('users')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        用户管理
      </div>
      <div class="nav-item" data-page="cache" onclick="switchPage('cache')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
        缓存管理
      </div>
      <div class="nav-item" data-page="cookies" onclick="switchPage('cookies')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-4-4 4 4 0 0 1-4-4 10 10 0 0 0-2-2z"/><circle cx="12" cy="12" r="1"/><circle cx="8" cy="8" r="1"/><circle cx="16" cy="10" r="1"/></svg>
        Cookie 配置
      </div>
      <div class="nav-item" data-page="mail" onclick="switchPage('mail')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
        邮件配置
      </div>
      <div class="nav-item" data-page="turnstile" onclick="switchPage('turnstile')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>
        安全验证
      </div>
      <div class="nav-item" data-page="backup" onclick="switchPage('backup')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        数据备份
      </div>
    </nav>
    <div class="sidebar-footer">Meting API v1.0</div>
  </aside>

  <!-- 主内容 -->
  <div class="main-wrapper">
    <!-- 顶部栏 -->
    <header class="topbar">
      <div class="topbar-title" id="topbar-title">仪表盘</div>
      <div class="topbar-right">
        <span class="topbar-user" id="topbar-user"></span>
        <button class="btn-logout" onclick="handleLogout()">退出登录</button>
      </div>
    </header>

    <!-- 内容区 -->
    <main class="content">
      <!-- 仪表盘页面 -->
      <div class="page active" id="page-dashboard">
        <div class="stats-grid" id="stats-grid">
          <div class="stat-card">
            <div class="stat-icon blue">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
            </div>
            <div class="stat-info">
              <div class="stat-label">用户总数</div>
              <div class="stat-value" id="stat-users">--</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon green">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
            </div>
            <div class="stat-info">
              <div class="stat-label">缓存条目</div>
              <div class="stat-value" id="stat-cache">--</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon amber">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </div>
            <div class="stat-info">
              <div class="stat-label">运行时间</div>
              <div class="stat-value" id="stat-uptime">--</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon purple">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
            </div>
            <div class="stat-info">
              <div class="stat-label">版本号</div>
              <div class="stat-value" id="stat-version">--</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 用户管理页面 -->
      <div class="page" id="page-users">
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
            <div class="card-title" style="margin-bottom:0">用户列表</div>
            <button class="btn btn-primary" onclick="showAddUser()">+ 添加用户</button>
          </div>
          <div class="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>邮箱</th>
                  <th>用户名</th>
                  <th>角色</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody id="users-tbody">
                <tr><td colspan="6" class="empty-state">加载中...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- 缓存管理页面 -->
      <div class="page" id="page-cache">
        <div class="card">
          <div class="card-title">缓存状态</div>
          <div id="cache-info" style="margin-bottom:16px">
            <p style="color:#6B7280;font-size:14px">加载中...</p>
          </div>
          <button class="btn btn-danger super-admin-only" id="btn-clear-cache" onclick="clearCache()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            清空缓存
          </button>
        </div>
        <div class="card super-admin-only" style="margin-top:16px">
          <div class="card-title">缓存配置</div>
          <div class="form-group">
            <label>最大缓存条目数</label>
            <input type="number" id="cache-max" min="10" max="100000" placeholder="1000">
            <p style="font-size:12px;color:#9CA3AF;margin-top:4px">范围：10 ~ 100000，超出后自动淘汰最久未使用的条目</p>
          </div>
          <div class="form-group">
            <label>默认过期时间（秒）</label>
            <input type="number" id="cache-ttl" min="5" max="86400" placeholder="30">
            <p style="font-size:12px;color:#9CA3AF;margin-top:4px">范围：5 ~ 86400 秒，过期后自动清理</p>
          </div>
          <div class="form-group">
            <label>自动清理间隔（秒）</label>
            <input type="number" id="cache-purge-interval" min="10" max="3600" placeholder="300">
            <p style="font-size:12px;color:#9CA3AF;margin-top:4px">范围：10 ~ 3600 秒，定时清理过期缓存条目的间隔</p>
          </div>
          <button class="btn btn-primary super-admin-only" onclick="saveCacheConfig()">保存配置</button>
        </div>
      </div>

      <!-- Cookie 配置页面 -->
      <div class="page" id="page-cookies">
        <div class="card">
          <div class="card-title">平台 Cookie 配置</div>
          <div class="platform-list" id="platform-list">
            <p style="color:#6B7280;font-size:14px">加载中...</p>
          </div>
        </div>
      </div>

      <!-- 邮件配置页面 -->
      <div class="page" id="page-mail">
        <div class="card">
          <div class="card-title">当前邮件配置</div>
          <div id="mail-current" style="margin-bottom:20px">
            <p style="color:#6B7280;font-size:14px">加载中...</p>
          </div>
        </div>
        <div class="card super-admin-only">
          <div class="card-title">更新邮件配置</div>
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
          <div style="display:flex;gap:10px;margin-top:8px">
            <button class="btn btn-primary super-admin-only" onclick="saveMailConfig()">保存配置</button>
            <button class="btn btn-warning super-admin-only" onclick="testMail()">发送测试邮件</button>
          </div>
          <div class="form-group" style="margin-top:16px">
            <label>测试收件人</label>
            <input type="email" id="mail-test-recipient" placeholder="输入邮箱以测试发送">
          </div>
        </div>
      </div>
      <!-- 图形验证码配置页面 -->
      <div class="page" id="page-turnstile">
        <div class="card">
          <div class="card-title">当前验证码配置</div>
          <div id="turnstile-current" style="margin-bottom:20px">
            <p style="color:#6B7280;font-size:14px">加载中...</p>
          </div>
        </div>
        <div class="card super-admin-only">
          <div class="card-title">更新验证码配置</div>
          <div class="form-group">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
              <input type="checkbox" id="ts-enabled" style="width:auto">
              启用图形验证码
            </label>
            <p style="font-size:12px;color:#9ca3af;margin-top:4px">启用后，发送邮箱验证码前需先输入图形验证码，防止恶意刷验证码</p>
          </div>
          <button class="btn btn-primary super-admin-only" onclick="saveTurnstileConfig()">保存配置</button>
        </div>
      </div>

      <!-- 数据备份页面 -->
      <div class="page" id="page-backup">
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
            <div class="card-title" style="margin-bottom:0">备份列表</div>
            <div style="display:flex;gap:8px">
              <button class="btn btn-primary" onclick="createBackup()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                手动备份
              </button>
              <button class="btn btn-warning super-admin-only" onclick="showRestoreModal()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                恢复备份
              </button>
            </div>
          </div>
          <div class="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>文件名</th>
                  <th>类型</th>
                  <th>大小</th>
                  <th>创建时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody id="backup-tbody">
                <tr><td colspan="5" class="empty-state">加载中...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
        <div class="card super-admin-only">
          <div class="card-title">自动备份配置</div>
          <div id="backup-config-info" style="margin-bottom:16px">
            <p style="color:#6B7280;font-size:14px">加载中...</p>
          </div>
          <div class="form-group">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
              <input type="checkbox" id="bk-enabled" style="width:auto">
              启用自动备份
            </label>
            <p style="font-size:12px;color:#9ca3af;margin-top:4px">启用后，系统将在每天指定时间自动创建备份</p>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>执行时间（小时）</label>
              <select id="bk-hour">
                ${Array.from({length:24},(_,i)=>'<option value="'+i+'">'+String(i).padStart(2,'0')+':00</option>').join('')}
              </select>
              <p style="font-size:12px;color:#9ca3af;margin-top:4px">每天在此时间自动执行备份</p>
            </div>
            <div class="form-group">
              <label>保留备份数</label>
              <input type="number" id="bk-keep-count" min="1" max="30" placeholder="7">
              <p style="font-size:12px;color:#9ca3af;margin-top:4px">超出后自动删除最旧的备份（1~30）</p>
            </div>
          </div>
          <button class="btn btn-primary super-admin-only" onclick="saveBackupConfig()">保存配置</button>
        </div>
      </div>
    </main>
  </div>
</div>

<!-- ====== 模态框 ====== -->
<div class="modal-overlay" id="modal-overlay" onclick="closeModalOnOverlay(event)">
  <div class="modal" id="modal">
    <div class="modal-header" id="modal-title"></div>
    <div class="modal-body" id="modal-body"></div>
    <div class="modal-footer" id="modal-footer"></div>
  </div>
</div>

<!-- ====== Toast ====== -->
<div class="toast" id="toast"></div>

<script>
// ====== 全局状态 ======
let token = localStorage.getItem('admin_token') || ''
let currentUser = null
const PREFIX = '${prefix}'

// ====== 页面标题映射 ======
const PAGE_TITLES = {
  dashboard: '仪表盘',
  users: '用户管理',
  cache: '缓存管理',
  cookies: 'Cookie 配置',
  mail: '邮件配置',
  turnstile: '安全验证',
  backup: '数据备份'
}

// ====== 初始化 ======
;(async function init() {
  if (token) {
    // 尝试用已有 token 获取用户信息
    try {
      const res = await apiGet('/api/admin/stats')
      if (res.ok) {
        showApp()
        return
      }
    } catch {}
    // token 无效，清除并显示登录
    token = ''
    localStorage.removeItem('admin_token')
  }
  showLogin()
})()

// ====== 登录/登出 ======
function showLogin() {
  document.getElementById('loginPage').style.display = 'flex'
  document.getElementById('app').classList.remove('active')
}

function showApp() {
  document.getElementById('loginPage').style.display = 'none'
  document.getElementById('app').classList.add('active')
  // 从 token 解析用户信息（JWT payload）
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    currentUser = payload
    document.getElementById('topbar-user').textContent = payload.email || payload.username || '管理员'
    // 系统配置操作仅超级管理员可见
    if (payload.role !== 'super_admin') {
      document.querySelectorAll('.super-admin-only').forEach(el => el.style.display = 'none')
    }
  } catch {
    document.getElementById('topbar-user').textContent = '管理员'
  }
  loadDashboard()
}

async function handleLogin() {
  const btn = document.getElementById('btn-login')
  const email = document.getElementById('login-email').value.trim()
  const password = document.getElementById('login-password').value
  const errEl = document.getElementById('login-error')

  errEl.style.display = 'none'
  if (!email || !password) {
    errEl.textContent = '请输入邮箱和密码'
    errEl.style.display = 'block'
    return
  }

  btn.disabled = true
  btn.innerHTML = '<span class="spinner"></span>登录中...'

  try {
    const resp = await fetch(PREFIX + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    })
    const data = await resp.json()
    if (resp.ok && data.token) {
      token = data.token
      localStorage.setItem('admin_token', token)
      showApp()
    } else {
      errEl.textContent = data.message || '登录失败'
      errEl.style.display = 'block'
    }
  } catch (e) {
    errEl.textContent = '网络错误：' + e.message
    errEl.style.display = 'block'
  }

  btn.disabled = false
  btn.textContent = '登 录'
}

function handleLogout() {
  token = ''
  localStorage.removeItem('admin_token')
  currentUser = null
  showLogin()
}

// 回车登录
document.getElementById('login-password').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') handleLogin()
})

// ====== API 请求封装 ======
async function apiGet(path) {
  const resp = await fetch(PREFIX + path, {
    headers: { 'Authorization': 'Bearer ' + token }
  })
  if (resp.status === 401) {
    handleLogout()
    showToast('登录已过期，请重新登录', 'error')
    throw new Error('未授权')
  }
  return resp
}

async function apiDelete(path) {
  const resp = await fetch(PREFIX + path, {
    method: 'DELETE',
    headers: { 'Authorization': 'Bearer ' + token }
  })
  if (resp.status === 401) {
    handleLogout()
    showToast('登录已过期，请重新登录', 'error')
    throw new Error('未授权')
  }
  return resp
}

async function apiPut(path, body) {
  const resp = await fetch(PREFIX + path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
    body: JSON.stringify(body)
  })
  if (resp.status === 401) {
    handleLogout()
    showToast('登录已过期，请重新登录', 'error')
    throw new Error('未授权')
  }
  return resp
}

async function apiPost(path, body) {
  const resp = await fetch(PREFIX + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
    body: JSON.stringify(body)
  })
  if (resp.status === 401) {
    handleLogout()
    showToast('登录已过期，请重新登录', 'error')
    throw new Error('未授权')
  }
  return resp
}

// ====== Toast 提示 ======
let toastTimer = null
function showToast(msg, type) {
  const el = document.getElementById('toast')
  el.textContent = msg
  el.className = 'toast toast-' + (type || 'info')
  // 触发重排以重新播放动画
  void el.offsetWidth
  el.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => el.classList.remove('show'), 3000)
}

// ====== 模态框 ======
function openModal(title, bodyHtml, footerHtml) {
  document.getElementById('modal-title').textContent = title
  document.getElementById('modal-body').innerHTML = bodyHtml
  document.getElementById('modal-footer').innerHTML = footerHtml
  document.getElementById('modal-overlay').classList.add('active')
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('active')
}

function closeModalOnOverlay(e) {
  if (e.target === document.getElementById('modal-overlay')) closeModal()
}

// ====== 页面切换 ======
function switchPage(page) {
  // 更新导航高亮
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === page)
  })
  // 更新页面显示
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  document.getElementById('page-' + page).classList.add('active')
  // 更新顶部标题
  document.getElementById('topbar-title').textContent = PAGE_TITLES[page] || page
  // 加载页面数据
  switch (page) {
    case 'dashboard': loadDashboard(); break
    case 'users': loadUsers(); break
    case 'cache': loadCache(); break
    case 'cookies': loadCookies(); break
    case 'mail': loadMailConfig(); break
    case 'turnstile': loadTurnstileConfig(); break
    case 'backup': loadBackups(); loadBackupConfig(); break
  }
}

// ====== 仪表盘 ======
async function loadDashboard() {
  try {
    const resp = await apiGet('/api/admin/stats')
    const data = await resp.json()
    document.getElementById('stat-users').textContent = data.userCount ?? '--'
    document.getElementById('stat-cache').textContent = data.cacheSize ?? '--'
    document.getElementById('stat-uptime').textContent = formatUptime(data.uptime)
    document.getElementById('stat-version').textContent = data.version ?? '--'
  } catch (e) {
    showToast('获取统计数据失败', 'error')
  }
}

function formatUptime(seconds) {
  if (!seconds && seconds !== 0) return '--'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return d + '天' + h + '小时'
  if (h > 0) return h + '小时' + m + '分'
  return m + '分钟'
}

// ====== 用户管理 ======
async function loadUsers() {
  const tbody = document.getElementById('users-tbody')
  tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><span class="spinner"></span>加载中...</td></tr>'
  try {
    const resp = await apiGet('/api/admin/users')
    const data = await resp.json()
    if (!data.users || data.users.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><p>暂无用户数据</p></td></tr>'
      return
    }
    tbody.innerHTML = data.users.map(u => {
      const statusBadge = u.status === 'active'
        ? '<span class="badge badge-green">正常</span>'
        : '<span class="badge badge-red">禁用</span>'
      const roleBadge = u.role === 'super_admin'
        ? '<span class="badge badge-blue">超级管理员</span>'
        : u.role === 'admin'
        ? '<span class="badge badge-blue">管理员</span>'
        : '<span class="badge badge-gray">普通用户</span>'
      const isSuperAdmin = u.role === 'super_admin'
      const toggleBtn = u.status === 'active'
        ? '<button class="btn btn-warning btn-sm" onclick="toggleUser(' + u.id + ',\\'disabled\\')">禁用</button>'
        : '<button class="btn btn-success btn-sm" onclick="toggleUser(' + u.id + ',\\'active\\')">启用</button>'
      const actionBtns = isSuperAdmin
        ? '<span style="color:#9CA3AF;font-size:12px">不可操作</span>'
        : toggleBtn +
          '<button class="btn btn-outline btn-sm" onclick="changeRole(' + u.id + ',\\'' + escHtml(u.role) + '\\')">修改角色</button>' +
          '<button class="btn btn-danger btn-sm" onclick="deleteUser(' + u.id + ',\\'' + escHtml(u.email) + '\\')">删除</button>'
      return '<tr>' +
        '<td>' + u.id + '</td>' +
        '<td>' + escHtml(u.email) + '</td>' +
        '<td>' + escHtml(u.username || '-') + '</td>' +
        '<td>' + roleBadge + '</td>' +
        '<td>' + statusBadge + '</td>' +
        '<td style="display:flex;gap:6px;flex-wrap:wrap">' + actionBtns + '</td>' +
      '</tr>'
    }).join('')
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><p>加载失败</p></td></tr>'
  }
}

async function toggleUser(id, newStatus) {
  try {
    const resp = await apiPut('/api/admin/users/' + id + '/status', { status: newStatus })
    const data = await resp.json()
    if (resp.ok) {
      showToast('用户状态已更新', 'success')
      loadUsers()
    } else {
      showToast(data.message || '操作失败', 'error')
    }
  } catch (e) {
    showToast('请求失败：' + (e.message || '网络错误'), 'error')
  }
}

function changeRole(id, currentRole) {
  const isSuperAdmin = currentUser && currentUser.role === 'super_admin'
  // 非超级管理员只能在 user 之间切换（不能提升为 admin）
  let options = '<option value="user">普通用户</option>'
  if (isSuperAdmin) {
    options += '<option value="admin">管理员</option>'
  }
  const defaultRole = currentRole === 'admin' ? 'admin' : 'user'
  openModal('修改用户角色',
    '<div class="form-group"><label>选择角色</label><select id="modal-role-select">' + options + '</select></div>' +
    '<div id="change-role-msg" class="auth-msg"></div>',
    '<button class="btn btn-outline" onclick="closeModal()">取消</button>' +
    '<button class="btn btn-primary" onclick="doChangeRole(' + id + ')">确定</button>'
  )
  document.getElementById('modal-role-select').value = defaultRole
}

async function doChangeRole(id) {
  const role = document.getElementById('modal-role-select').value
  closeModal()
  try {
    const resp = await apiPut('/api/admin/users/' + id + '/role', { role: role })
    const data = await resp.json()
    if (resp.ok) {
      showToast('角色已更新', 'success')
      loadUsers()
    } else {
      showToast(data.message || '操作失败', 'error')
    }
  } catch (e) {
    showToast('请求失败：' + (e.message || '网络错误'), 'error')
  }
}

function deleteUser(id, email) {
  openModal('确认删除',
    '<p class="confirm-text">确定要删除用户 <strong>' + escHtml(email) + '</strong> 吗？此操作不可撤销。</p>',
    '<button class="btn btn-outline" onclick="closeModal()">取消</button>' +
    '<button class="btn btn-danger" onclick="doDeleteUser(' + id + ')">删除</button>'
  )
}

async function doDeleteUser(id) {
  closeModal()
  try {
    const resp = await apiDelete('/api/admin/users/' + id)
    const data = await resp.json()
    if (resp.ok) {
      showToast('用户已删除', 'success')
      loadUsers()
    } else {
      showToast(data.message || '删除失败', 'error')
    }
  } catch (e) {
    showToast('请求失败：' + (e.message || '网络错误'), 'error')
  }
}

function showAddUser() {
  const isSuperAdmin = currentUser && currentUser.role === 'super_admin'
  const roleOptions = isSuperAdmin
    ? '<option value="user">普通用户</option><option value="admin">管理员</option>'
    : '<option value="user">普通用户</option>'
  openModal('添加用户',
    '<div class="form-group"><label>邮箱</label><input type="email" id="add-email" placeholder="用户邮箱"></div>' +
    '<div class="form-group"><label>用户名</label><input type="text" id="add-username" placeholder="至少3个字符"></div>' +
    '<div class="form-group"><label>密码</label><input type="password" id="add-password" placeholder="至少6个字符"></div>' +
    '<div class="form-group"><label>角色</label><select id="add-role">' + roleOptions + '</select></div>' +
    '<div id="add-user-msg" class="auth-msg"></div>',
    '<button class="btn btn-outline" onclick="closeModal()">取消</button>' +
    '<button class="btn btn-primary" onclick="doAddUser()">创建</button>'
  )
}

async function doAddUser() {
  const email = document.getElementById('add-email').value.trim()
  const username = document.getElementById('add-username').value.trim()
  const password = document.getElementById('add-password').value
  const role = document.getElementById('add-role').value
  const msg = document.getElementById('add-user-msg')
  msg.textContent = ''; msg.className = 'auth-msg'

  if (!email || !username || !password) {
    msg.textContent = '请填写所有字段'; msg.className = 'auth-msg error'; return
  }
  try {
    const resp = await apiPost('/api/admin/users', { email, username, password, role })
    const data = await resp.json()
    if (resp.ok) {
      showToast('用户创建成功', 'success')
      closeModal()
      loadUsers()
    } else {
      msg.textContent = data.message || '创建失败'; msg.className = 'auth-msg error'
    }
  } catch (e) {
    msg.textContent = '请求失败：' + (e.message || '网络错误'); msg.className = 'auth-msg error'
  }
}

// ====== 缓存管理 ======
async function loadCache() {
  const info = document.getElementById('cache-info')
  info.innerHTML = '<p style="color:#6B7280;font-size:14px"><span class="spinner"></span>加载中...</p>'
  try {
    const resp = await apiGet('/api/admin/cache-config')
    const data = await resp.json()
    info.innerHTML =
      '<div style="display:flex;gap:24px;flex-wrap:wrap">' +
        '<div><span style="color:#6B7280;font-size:13px">缓存条目数</span><br><span style="font-size:20px;font-weight:600;color:#1F2937">' + (data.size ?? '--') + '</span></div>' +
        '<div><span style="color:#6B7280;font-size:13px">最大容量</span><br><span style="font-size:20px;font-weight:600;color:#1F2937">' + (data.max ?? '--') + '</span></div>' +
        '<div><span style="color:#6B7280;font-size:13px">过期时间</span><br><span style="font-size:20px;font-weight:600;color:#1F2937">' + (data.ttl ?? '--') + 's</span></div>' +
        '<div><span style="color:#6B7280;font-size:13px">清理间隔</span><br><span style="font-size:20px;font-weight:600;color:#1F2937">' + (data.purgeInterval ?? '--') + 's</span></div>' +
      '</div>'
    // 回填配置表单
    document.getElementById('cache-max').value = data.max || ''
    document.getElementById('cache-ttl').value = data.ttl || ''
    document.getElementById('cache-purge-interval').value = data.purgeInterval || ''
  } catch (e) {
    info.innerHTML = '<p style="color:#DC2626;font-size:14px">加载失败</p>'
  }
}

async function saveCacheConfig() {
  const max = Number(document.getElementById('cache-max').value)
  const ttl = Number(document.getElementById('cache-ttl').value)
  const purgeInterval = Number(document.getElementById('cache-purge-interval').value)
  if (!max || !ttl || !purgeInterval) { showToast('请填写完整的缓存配置', 'error'); return }
  try {
    const resp = await apiPut('/api/admin/cache-config', { max, ttl, purgeInterval })
    const data = await resp.json()
    if (resp.ok) {
      showToast('缓存配置已保存', 'success')
      loadCache()
    } else {
      showToast(data.message || '保存失败', 'error')
    }
  } catch (e) {
    showToast('请求失败：' + (e.message || '网络错误'), 'error')
  }
}

function clearCache() {
  openModal('确认清空缓存',
    '<p class="confirm-text">确定要清空所有缓存吗？清空后，后续请求将直接访问上游 API，响应速度可能暂时变慢。</p>',
    '<button class="btn btn-outline" onclick="closeModal()">取消</button>' +
    '<button class="btn btn-danger" onclick="doClearCache()">清空</button>'
  )
}

async function doClearCache() {
  closeModal()
  try {
    const resp = await apiDelete('/api/admin/cache')
    const data = await resp.json()
    if (resp.ok) {
      showToast('缓存已清空', 'success')
      loadCache()
    } else {
      showToast(data.message || '清空失败', 'error')
    }
  } catch (e) {
    showToast('请求失败：' + (e.message || '网络错误'), 'error')
  }
}

// ====== Cookie 配置 ======
const PLATFORMS = ['netease', 'kugou']
const PLATFORM_NAMES = {
  netease: '网易云',
  kugou: '酷狗音乐'
}

async function loadCookies() {
  const list = document.getElementById('platform-list')
  list.innerHTML = '<p style="color:#6B7280;font-size:14px"><span class="spinner"></span>加载中...</p>'
  const isSuperAdmin = currentUser && currentUser.role === 'super_admin'
  try {
    const resp = await apiGet('/api/admin/cookies')
    const data = await resp.json()
    const cookies = data.cookies || {}
    list.innerHTML = PLATFORMS.map(p => {
      const info = cookies[p] || {}
      const hasCookie = !!info.configured
      const statusBadge = hasCookie
        ? '<span class="badge badge-green">已配置</span>'
        : '<span class="badge badge-gray">未配置</span>'
      const editBtn = isSuperAdmin
        ? '<button class="btn btn-outline btn-sm" onclick="editCookie(\\'' + p + '\\')">编辑</button>'
        : ''
      return '<div class="platform-item">' +
        '<div class="platform-info">' +
          '<span class="platform-name">' + PLATFORM_NAMES[p] + '</span>' +
          statusBadge +
        '</div>' +
        '<div class="platform-actions">' + editBtn + '</div>' +
      '</div>'
    }).join('')
  } catch (e) {
    list.innerHTML = '<p style="color:#DC2626;font-size:14px">加载失败</p>'
  }
}

function editCookie(server) {
  openModal('编辑 Cookie - ' + PLATFORM_NAMES[server],
    '<div class="form-group">' +
      '<label>Cookie 值</label>' +
      '<textarea id="edit-cookie-value" rows="5" placeholder="请输入 ' + PLATFORM_NAMES[server] + ' 的 Cookie 值"></textarea>' +
      '<div class="form-hint">留空则清除该平台的 Cookie 配置</div>' +
    '</div>',
    '<button class="btn btn-outline" onclick="closeModal()">取消</button>' +
    '<button class="btn btn-primary" onclick="saveCookie(\\'' + server + '\\')">保存</button>'
  )
}

async function saveCookie(server) {
  const value = document.getElementById('edit-cookie-value').value
  closeModal()
  try {
    const resp = await apiPut('/api/admin/cookies/' + server, { cookie: value })
    const data = await resp.json()
    if (resp.ok) {
      showToast(PLATFORM_NAMES[server] + ' Cookie 已保存', 'success')
      loadCookies()
    } else {
      showToast(data.message || '保存失败', 'error')
    }
  } catch (e) {
    showToast('请求失败：' + (e.message || '网络错误'), 'error')
  }
}

// ====== 邮件配置 ======
async function loadMailConfig() {
  const el = document.getElementById('mail-current')
  el.innerHTML = '<p style="color:#6B7280;font-size:14px"><span class="spinner"></span>加载中...</p>'
  try {
    const resp = await apiGet('/api/admin/mail-config')
    const data = await resp.json()
    const driver = data.driver || '未配置'
    const driverLabel = { billionmail: 'BillionMail', smtp: 'SMTP', generic: 'Generic HTTP' }[driver] || driver
    const cfg = data.config || {}

    let detailsHtml = '<div class="config-display">' +
      '<div class="config-label">邮件驱动</div><div class="config-value">' + escHtml(driverLabel) + '</div>'

    if (driver === 'billionmail') {
      detailsHtml += '<div class="config-label">API 地址</div><div class="config-value">' + escHtml(cfg.apiUrl || '-') + '</div>'
      detailsHtml += '<div class="config-label">API Key</div><div class="config-value">' + maskStr(cfg.apiKey) + '</div>'
      detailsHtml += '<div class="config-label">发件人邮箱</div><div class="config-value">' + escHtml(cfg.from || '-') + '</div>'
    } else if (driver === 'smtp') {
      detailsHtml += '<div class="config-label">服务器</div><div class="config-value">' + escHtml(cfg.host || '-') + ':' + (cfg.port || '-') + '</div>'
      detailsHtml += '<div class="config-label">用户名</div><div class="config-value">' + escHtml(cfg.user || '-') + '</div>'
      detailsHtml += '<div class="config-label">密码</div><div class="config-value">' + maskStr(cfg.pass) + '</div>'
      detailsHtml += '<div class="config-label">发件人</div><div class="config-value">' + escHtml(cfg.from || '-') + '</div>'
    } else if (driver === 'generic') {
      detailsHtml += '<div class="config-label">API URL</div><div class="config-value">' + escHtml(cfg.apiUrl || '-') + '</div>'
      detailsHtml += '<div class="config-label">API Key</div><div class="config-value">' + maskStr(cfg.apiKey) + '</div>'
      detailsHtml += '<div class="config-label">认证头</div><div class="config-value">' + escHtml(cfg.authHeader || '-') + '</div>'
      detailsHtml += '<div class="config-label">发件人</div><div class="config-value">' + escHtml(cfg.from || '-') + '</div>'
    }

    detailsHtml += '</div>'
    el.innerHTML = detailsHtml

    // 回填表单
    if (data.driver) {
      document.getElementById('mail-driver').value = data.driver
      switchMailFields()
    }
    if (data.config) {
      if (data.driver === 'billionmail') {
        if (cfg.apiUrl) document.getElementById('bm-api-url').value = cfg.apiUrl
        if (cfg.from) document.getElementById('bm-from').value = cfg.from
      } else if (data.driver === 'smtp') {
        if (cfg.host) document.getElementById('smtp-host').value = cfg.host
        if (cfg.port) document.getElementById('smtp-port').value = cfg.port
        if (cfg.user) document.getElementById('smtp-user').value = cfg.user
        if (cfg.from) document.getElementById('smtp-from').value = cfg.from
      } else if (data.driver === 'generic') {
        if (cfg.apiUrl) document.getElementById('gen-api-url').value = cfg.apiUrl
        if (cfg.authHeader) document.getElementById('gen-auth-header').value = cfg.authHeader
        if (cfg.from) document.getElementById('gen-from').value = cfg.from
      }
    }
  } catch (e) {
    el.innerHTML = '<p style="color:#DC2626;font-size:14px">加载失败</p>'
  }
}

function switchMailFields() {
  const driver = document.getElementById('mail-driver').value
  document.getElementById('mail-billionmail').style.display = driver === 'billionmail' ? 'block' : 'none'
  document.getElementById('mail-smtp').style.display = driver === 'smtp' ? 'block' : 'none'
  document.getElementById('mail-generic').style.display = driver === 'generic' ? 'block' : 'none'
}

function getMailFormConfig() {
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

async function saveMailConfig() {
  const { driver, config } = getMailFormConfig()
  try {
    const resp = await apiPut('/api/admin/mail-config', { driver, config })
    const data = await resp.json()
    if (resp.ok) {
      showToast('邮件配置已保存', 'success')
      loadMailConfig()
    } else {
      showToast(data.message || '保存失败', 'error')
    }
  } catch (e) {
    showToast('请求失败：' + (e.message || '网络错误'), 'error')
  }
}

async function testMail() {
  const recipient = document.getElementById('mail-test-recipient').value.trim()
  if (!recipient) {
    showToast('请输入测试收件人邮箱', 'error')
    return
  }
  const { driver, config } = getMailFormConfig()
  try {
    const resp = await apiPost('/api/admin/mail-config/test', { driver, config, recipient })
    const data = await resp.json()
    if (resp.ok) {
      showToast('测试邮件发送成功', 'success')
    } else {
      showToast(data.message || '发送失败', 'error')
    }
  } catch (e) {
    showToast('请求失败：' + (e.message || '网络错误'), 'error')
  }
}

// ====== 图形验证码配置 ======
async function loadTurnstileConfig() {
  const el = document.getElementById('turnstile-current')
  el.innerHTML = '<p style="color:#6B7280;font-size:14px"><span class="spinner"></span>加载中...</p>'
  try {
    const resp = await apiGet('/api/admin/captcha-config')
    const data = await resp.json()

    if (!data.configured) {
      el.innerHTML = '<div class="config-display"><div class="config-label">状态</div><div class="config-value">未配置</div></div>'
      return
    }

    let detailsHtml = '<div class="config-display">' +
      '<div class="config-label">状态</div><div class="config-value">' + (data.enabled ? '<span style="color:#22c55e">已启用</span>' : '<span style="color:#9ca3af">未启用</span>') + '</div>' +
      '</div>'
    el.innerHTML = detailsHtml

    document.getElementById('ts-enabled').checked = !!data.enabled
  } catch (e) {
    el.innerHTML = '<p style="color:#DC2626;font-size:14px">加载失败</p>'
  }
}

async function saveTurnstileConfig() {
  const enabled = document.getElementById('ts-enabled').checked

  try {
    const resp = await apiPut('/api/admin/captcha-config', { enabled })
    const data = await resp.json()
    if (resp.ok) {
      showToast('验证码配置已保存', 'success')
      loadTurnstileConfig()
    } else {
      showToast(data.message || '保存失败', 'error')
    }
  } catch (e) {
    showToast('请求失败：' + (e.message || '网络错误'), 'error')
  }
}

// ====== 数据备份 ======
async function loadBackups() {
  const tbody = document.getElementById('backup-tbody')
  tbody.innerHTML = '<tr><td colspan="5" class="empty-state"><span class="spinner"></span>加载中...</td></tr>'
  try {
    const resp = await apiGet('/api/admin/backup')
    const data = await resp.json()
    if (!data.backups || data.backups.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-state"><p>暂无备份数据</p></td></tr>'
      return
    }
    tbody.innerHTML = data.backups.map(b => {
      const typeLabel = b.type === 'auto' ? '<span class="badge badge-blue">自动</span>' : '<span class="badge badge-green">手动</span>'
      return '<tr>' +
        '<td style="font-family:monospace;font-size:12px">' + escHtml(b.filename) + '</td>' +
        '<td>' + typeLabel + '</td>' +
        '<td>' + formatSize(b.size) + '</td>' +
        '<td>' + escHtml(b.createdAt || '-') + '</td>' +
        '<td style="display:flex;gap:6px;flex-wrap:wrap">' +
          '<button class="btn btn-outline btn-sm" onclick="downloadBackup(\\'' + escHtml(b.filename) + '\\')">下载</button>' +
          '<button class="btn btn-danger btn-sm super-admin-only" onclick="deleteBackup(\\'' + escHtml(b.filename) + '\\')">删除</button>' +
        '</td>' +
      '</tr>'
    }).join('')
    // 非超级管理员隐藏操作按钮
    if (currentUser && currentUser.role !== 'super_admin') {
      tbody.querySelectorAll('.super-admin-only').forEach(el => el.style.display = 'none')
    }
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state"><p>加载失败</p></td></tr>'
  }
}

async function createBackup() {
  showToast('正在创建备份...', 'info')
  try {
    const resp = await apiPost('/api/admin/backup', { type: 'manual' })
    const data = await resp.json()
    if (resp.ok) {
      showToast('备份创建成功', 'success')
      loadBackups()
    } else {
      showToast(data.message || '备份失败', 'error')
    }
  } catch (e) {
    showToast('请求失败：' + (e.message || '网络错误'), 'error')
  }
}

async function downloadBackup(filename) {
  try {
    const resp = await fetch(PREFIX + '/api/admin/backup/download?file=' + encodeURIComponent(filename), {
      headers: { 'Authorization': 'Bearer ' + token }
    })
    if (!resp.ok) {
      showToast('下载失败', 'error')
      return
    }
    const blob = await resp.blob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
  } catch (e) {
    showToast('下载失败：' + (e.message || '网络错误'), 'error')
  }
}

function deleteBackup(filename) {
  openModal('确认删除',
    '<p class="confirm-text">确定要删除备份 <strong>' + escHtml(filename) + '</strong> 吗？此操作不可撤销。</p>',
    '<button class="btn btn-outline" onclick="closeModal()">取消</button>' +
    '<button class="btn btn-danger" onclick="doDeleteBackup(\\'' + escHtml(filename) + '\\')">删除</button>'
  )
}

async function doDeleteBackup(filename) {
  closeModal()
  try {
    const resp = await apiDelete('/api/admin/backup?file=' + encodeURIComponent(filename))
    const data = await resp.json()
    if (resp.ok) {
      showToast('备份已删除', 'success')
      loadBackups()
    } else {
      showToast(data.message || '删除失败', 'error')
    }
  } catch (e) {
    showToast('请求失败：' + (e.message || '网络错误'), 'error')
  }
}

function showRestoreModal() {
  openModal('恢复备份',
    '<div class="form-group">' +
      '<label>选择备份文件</label>' +
      '<input type="file" id="restore-file" accept=".gz,.json.gz" style="padding:8px">' +
      '<p style="font-size:12px;color:#9ca3af;margin-top:4px">上传 .gz 备份文件以恢复数据</p>' +
    '</div>' +
    '<div style="margin-top:8px;padding:12px;background:#FEF3C7;border-radius:8px;font-size:13px;color:#92400E">' +
      '<strong>警告：</strong>恢复备份将覆盖当前数据库和文件，此操作不可撤销！' +
    '</div>' +
    '<div id="restore-msg" style="margin-top:8px"></div>',
    '<button class="btn btn-outline" onclick="closeModal()">取消</button>' +
    '<button class="btn btn-danger" onclick="doRestore()">恢复</button>'
  )
}

async function doRestore() {
  const fileInput = document.getElementById('restore-file')
  const msg = document.getElementById('restore-msg')
  if (!fileInput.files || !fileInput.files[0]) {
    msg.innerHTML = '<span style="color:#DC2626;font-size:13px">请选择备份文件</span>'
    return
  }
  const file = fileInput.files[0]
  msg.innerHTML = '<span style="color:#4F46E5;font-size:13px"><span class="spinner"></span>正在恢复，请勿关闭页面...</span>'
  try {
    const formData = new FormData()
    formData.append('file', file)
    const resp = await fetch(PREFIX + '/api/admin/backup/restore', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: formData
    })
    const data = await resp.json()
    if (resp.ok) {
      closeModal()
      showToast('备份恢复成功，建议重启服务', 'success')
      loadBackups()
    } else {
      msg.innerHTML = '<span style="color:#DC2626;font-size:13px">' + escHtml(data.message || '恢复失败') + '</span>'
    }
  } catch (e) {
    msg.innerHTML = '<span style="color:#DC2626;font-size:13px">请求失败：' + escHtml(e.message || '网络错误') + '</span>'
  }
}

async function loadBackupConfig() {
  const el = document.getElementById('backup-config-info')
  el.innerHTML = '<p style="color:#6B7280;font-size:14px"><span class="spinner"></span>加载中...</p>'
  try {
    const resp = await apiGet('/api/admin/backup-config')
    const data = await resp.json()
    const statusText = data.enabled ? '<span style="color:#22c55e">已启用</span>' : '<span style="color:#9ca3af">未启用</span>'
    el.innerHTML = '<div style="display:flex;gap:24px;flex-wrap:wrap">' +
      '<div><span style="color:#6B7280;font-size:13px">状态</span><br>' + statusText + '</div>' +
      '<div><span style="color:#6B7280;font-size:13px">执行时间</span><br><span style="font-size:16px;font-weight:600;color:#1F2937">' + String(data.hour ?? 3).padStart(2, '0') + ':00</span></div>' +
      '<div><span style="color:#6B7280;font-size:13px">保留数量</span><br><span style="font-size:16px;font-weight:600;color:#1F2937">' + (data.keepCount ?? 7) + ' 份</span></div>' +
    '</div>'
    document.getElementById('bk-enabled').checked = !!data.enabled
    document.getElementById('bk-hour').value = data.hour ?? 3
    document.getElementById('bk-keep-count').value = data.keepCount ?? 7
  } catch (e) {
    el.innerHTML = '<p style="color:#DC2626;font-size:14px">加载失败</p>'
  }
}

async function saveBackupConfig() {
  const enabled = document.getElementById('bk-enabled').checked
  const hour = Number(document.getElementById('bk-hour').value)
  const keepCount = Number(document.getElementById('bk-keep-count').value)
  if (!keepCount || keepCount < 1 || keepCount > 30) {
    showToast('保留数量需在 1~30 之间', 'error')
    return
  }
  try {
    const resp = await apiPut('/api/admin/backup-config', { enabled, hour, keepCount })
    const data = await resp.json()
    if (resp.ok) {
      showToast('自动备份配置已保存', 'success')
      loadBackupConfig()
    } else {
      showToast(data.message || '保存失败', 'error')
    }
  } catch (e) {
    showToast('请求失败：' + (e.message || '网络错误'), 'error')
  }
}

function formatSize(bytes) {
  if (!bytes && bytes !== 0) return '-'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
}

// ====== 工具函数 ======
function escHtml(str) {
  if (!str) return ''
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function maskStr(str) {
  if (!str) return '-'
  if (str.length <= 4) return '****'
  return str.substring(0, 2) + '****' + str.substring(str.length - 2)
}
</script>
</body>
</html>`

  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8' }
  })
}
