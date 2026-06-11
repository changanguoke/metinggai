/**
 * @file demo.js
 * @description Demo 演示服务 - 返回嵌入 APlayer 音乐播放器和 Meting.js 的 HTML 页面
 *              用于快速验证 API 功能是否正常工作，无需前端开发即可测试播放
 */

// 项目内部
import config from '../config.js'

/**
 * 处理 Demo 页面请求，生成包含 APlayer + Meting.js 的 HTML
 * Meting.js 会自动调用本服务的 /api 接口获取歌曲数据并驱动 APlayer 播放
 *
 * @param {Request} request - HTTP 请求对象
 * @returns {Response} HTML 页面响应
 */
export default async (request) => {
  // 1. 从查询参数读取初始播放配置
  const url = new URL(request.url)
  const server = url.searchParams.get('server') || 'netease'  // 默认网易云
  const type = url.searchParams.get('type') || 'search'        // 默认搜索模式
  const id = url.searchParams.get('id') || 'hello'            // 默认搜索关键词

  // 2. 构建包含 APlayer 和 Meting.js 的 HTML 页面
  // Meting-js 组件会根据 server/type/id 参数自动请求 /api 接口获取歌曲列表
  // api 属性中的 :server/:type/:id/:r 是 Meting.js 的模板变量，会在运行时替换为实际值
  const body = `<html>
<head>
  <meta charset="UTF-8">
  <!-- 引入 APlayer CSS 样式 -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/aplayer@1.10.1/dist/APlayer.min.css">
  <!-- 引入 APlayer JS 播放器核心 -->
  <script src="https://cdn.jsdelivr.net/npm/aplayer@1.10.1/dist/APlayer.min.js"></script>
  <!-- 引入 Meting.js（APlayer 的 Meting API 适配层，自动处理 API 调用和数据转换） -->
  <script src="https://cdn.jsdelivr.net/npm/meting@2.0.2/dist/Meting.min.js"></script>
</head>
<body>
  <!-- Meting-js 自定义元素：声明式配置播放器数据源 -->
  <meting-js
    server="${server}"
    type="${type}"
    id="${id}"
    api="${config.meting.url}/api?server=:server&type=:type&id=:id&r=:r"
  />
</body>
</html>`

  return new Response(body, {
    headers: { 'content-type': 'text/html; charset=utf-8' }
  })
}
