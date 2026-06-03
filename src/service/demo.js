import config from '../config.js'

export default async (request) => {
  // 1. 初始化参数
  const url = new URL(request.url)
  const server = url.searchParams.get('server') || 'netease'
  const type = url.searchParams.get('type') || 'search'
  const id = url.searchParams.get('id') || 'hello'

  // 2. 生成 HTML
  const body = `<html>
<head>
  <meta charset="UTF-8">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/aplayer@1.10.1/dist/APlayer.min.css">
  <script src="https://cdn.jsdelivr.net/npm/aplayer@1.10.1/dist/APlayer.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/meting@2.0.2/dist/Meting.min.js"></script>
</head>
<body>
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
