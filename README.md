# Meting-API

基于 Hono.js 的多平台音乐 API 代理服务,封装 [@meting/core](https://www.npmjs.com/package/@meting/core) 提供的统一音乐 API。

## 特性

- 🎵 支持多个音乐平台:网易云、QQ音乐、酷狗、百度、酷我
- 🚀 基于 Hono.js 高性能框架
- 💾 内置 LRU 缓存机制,减少上游 API 调用
- 🔐 HMAC-SHA1 令牌鉴权,保护敏感接口
- 🐳 Docker 部署支持
- 📝 结构化 JSON 日志输出

## 支持的平台

| 平台 | server 参数 | 说明 |
|------|------------|------|
| 网易云音乐 | `netease` | - |
| QQ音乐 | `tencent` | - |
| 酷狗音乐 | `kugou` | - |
| 百度音乐 | `baidu` | - |
| 酷我音乐 | `kuwo` | - |

## 快速开始

### 一键部署

|平台|链接|
|---|---|
|Koyeb|[![Deploy to Koyeb](https://www.koyeb.com/static/images/deploy/button.svg)](https://app.koyeb.com/deploy?name=meting-api&type=docker&image=ghcr.io%2Fmetowolf%2Fmeting-api%3Alatest&instance_type=free&regions=was&instances_min=0&autoscaling_sleep_idle_delay=300&env%5BMETING_URL%5D=https%3A%2F%2F%7B%7B+KOYEB_PUBLIC_DOMAIN+%7D%7D&ports=80%3Bhttp%3B%2F&hc_protocol%5B80%5D=tcp&hc_grace_period%5B80%5D=5&hc_interval%5B80%5D=30&hc_restart_limit%5B80%5D=3&hc_timeout%5B80%5D=5&hc_path%5B80%5D=%2F&hc_method%5B80%5D=get)|


### 本地运行

```bash
# 安装依赖
yarn install

# 配置环境变量(可选)
cp .env.example .env
# 编辑 .env 文件配置参数

# 开发模式(热重载)
yarn dev

# 生产模式
yarn start
```

### Docker 部署

```bash
# 构建镜像
docker build -t meting-api1 .

# 运行容器
# 注意：cookie 文件会在镜像构建时复制到容器内，修改宿主机文件后需要挂载宿主机目录才能即时生效。
docker run -d \
  -p 4000:80 \
  -v "$(pwd)/cookie:/app/cookie:ro" \
  -e METING_URL=https://ce.guokeil.cn \
  -e METING_TOKEN=77U%vwSuwcnIVhcc \
  -e METING_COOKIE_NETEASE="" \
  --name meting-api1 \
  meting-api1
```
修改管理后台路径需要改两个地方：

1. 后端路由 — src/index.js

把 /admin 改成你想要的路径：


JavaScript

// 第128行
if (pathname === `${config.http.prefix}/admin`) {
2. 前端跳转链接 — 在 pc.html 和 mobile.html 中搜索 /admin，把登录后下拉菜单的管理后台链接也同步修改。



使用 Docker Compose:

```yaml
version: '3.8'
services:
  meting-api:
    image: ghcr.io/metowolf/meting-api:latest
    ports:
      - "80:80"
    volumes:
      - ./cookie:/app/cookie:ro
    environment:
      - METING_URL=https://your-domain.com
      - METING_TOKEN=your-secret-token
    restart: unless-stopped
```

### 宝塔面板反向代理配置

如果您使用宝塔面板管理服务器，可以通过 Nginx 配置反向代理：

1. 确保 Meting-API 服务正在运行（例如通过 Docker 或直接运行在某个端口，如 3000）。

2. 在宝塔面板中进入网站设置 -> 配置文件。

3. 在 `server` 块中添加以下配置（根据您的实际端口修改 `proxy_pass`）：

```nginx
location / {
    proxy_pass http://127.0.0.1:80;  # 修改为您的 Meting-API 地址和端口
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # CORS 头
    add_header Access-Control-Allow-Origin * always;
    add_header Access-Control-Allow-Methods "GET, POST, OPTIONS" always;
    add_header Access-Control-Allow-Headers "Content-Type" always;

    # 处理 OPTIONS 请求
    if ($request_method = 'OPTIONS') {
        return 204;
    }
}
```

4. 保存配置并重载 Nginx。

详细配置请参考项目中的 `nginx-reverse-proxy.conf` 文件。

## HTTPS 配置

### 开发环境

使用自签名证书进行本地调试:

```bash
mkdir -p certs
openssl req -x509 -nodes -days 365 \
  -newkey rsa:2048 \
  -keyout certs/local.key \
  -out certs/local.crt \
  -subj "/CN=localhost"
```

在启动服务时配置:

```bash
HTTPS_ENABLED=true \
SSL_KEY_PATH=certs/local.key \
SSL_CERT_PATH=certs/local.crt \
yarn start
```

### 生产环境

推荐使用 [Let's Encrypt](https://letsencrypt.org/) 提供的免费证书,通过 [Certbot](https://certbot.eff.org/) 自动签发与续期。例如在 Nginx 部署的服务器上:

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot certonly --nginx -d your-domain.com
```

证书获取后,将 `fullchain.pem` 和 `privkey.pem` 文件路径配置到对应环境变量。

### Docker HTTPS 部署示例

```bash
docker run -d \
  -p 3000:80 \
  -p 443:443 \
  -v /etc/letsencrypt/live/your-domain.com:/certs:ro \
  -e HTTPS_ENABLED=true \
  -e SSL_KEY_PATH=/certs/privkey.pem \
  -e SSL_CERT_PATH=/certs/fullchain.pem \
  -e METING_URL=https://your-domain.com \
  --name meting-api \
  meting-api
```

### 反向代理推荐

生产环境可搭配 Nginx 或 Caddy 作为反向代理,实现自动证书管理和负载均衡:
- [Nginx HTTPS 配置示例](https://docs.nginx.com/nginx/admin-guide/security-controls/terminating-ssl-http/)
- [Caddy 自动 HTTPS 说明](https://caddyserver.com/docs/automatic-https)


## 环境变量配置

创建 `.env` 文件或通过环境变量传递:

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `HTTP_PREFIX` | HTTP 路由前缀 | `` (空) |
| `HTTP_PORT` | HTTP 服务监听端口 | `80` |
| `HTTPS_ENABLED` | 是否启用 HTTPS 服务 | `false` |
| `HTTPS_PORT` | HTTPS 服务监听端口 | `443` |
| `SSL_KEY_PATH` | HTTPS 私钥文件路径 | - |
| `SSL_CERT_PATH` | HTTPS 证书文件路径 | - |
| `METING_URL` | API 服务的公网访问地址(用于生成回调 URL) | - |
| `METING_TOKEN` | HMAC 签名密钥 | `token` |
| `METING_COOKIE_ALLOW_HOSTS` | 允许使用 cookie 的 referrer 域名白名单(逗号分隔) | `` (空,不限制) |
| `METING_COOKIE_NETEASE` | 网易云音乐 Cookie | - |
| `METING_COOKIE_TENCENT` | QQ音乐 Cookie | - |
| `METING_COOKIE_KUGOU` | 酷狗音乐 Cookie | - |
| `METING_COOKIE_BAIDU` | 百度音乐 Cookie | - |
| `METING_COOKIE_KUWO` | 酷我音乐 Cookie | - |

## API 接口文档

### 基础接口

```
GET /api
```

### 请求参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `server` | string | 是 | 音乐平台:`netease`/`tencent`/`kugou`/`baidu`/`kuwo` |
| `type` | string | 是 | 操作类型:`search`/`song`/`album`/`artist`/`playlist`/`lrc`/`url`/`pic` |
| `id` | string | 是 | 资源 ID |
| `token` 或 `auth` | string | 条件 | 认证令牌(仅 `lrc`/`url`/`pic` 类型需要) |

### 操作类型说明

| type | 说明 | 需要鉴权 | 返回格式 |
|------|------|----------|----------|
| `search` | 搜索歌曲 | 否 | JSON 数组 |
| `song` | 获取歌曲详情 | 否 | JSON 数组 |
| `album` | 获取专辑 | 否 | JSON 数组 |
| `artist` | 获取歌手 | 否 | JSON 数组 |
| `playlist` | 获取歌单 | 否 | JSON 数组 |
| `lrc` | 获取歌词 | 是 | 纯文本(LRC 格式) |
| `url` | 获取播放链接 | 是 | 302 重定向 |
| `pic` | 获取封面图片 | 是 | 302 重定向 |

### 响应格式

**列表数据** (search/song/album/artist/playlist):

```json
[
  {
    "title": "歌曲名称",
    "author": "艺术家1 / 艺术家2",
    "url": "https://your-domain.com/api?server=netease&type=url&id=xxx&auth=xxx",
    "pic": "https://your-domain.com/api?server=netease&type=pic&id=xxx&auth=xxx",
    "lrc": "https://your-domain.com/api?server=netease&type=lrc&id=xxx&auth=xxx"
  }
]
```

**歌词数据** (lrc):

```
[00:00.000] 歌词第一行
[00:05.123] 歌词第二行 (翻译内容)
[00:10.456] 歌词第三行
```

**音频/图片** (url/pic):
- 成功:302 重定向到实际资源 URL
- 失败:404 Not Found

### 请求示例

搜索歌曲:
```bash
curl "http://localhost:80/api?server=netease&type=search&id=周杰伦"
```

获取歌曲详情:
```bash
curl "http://localhost:80/api?server=netease&type=song&id=歌曲ID"
```

获取歌词(需要 token):
```bash
curl "http://localhost:80/api?server=netease&type=lrc&id=歌曲ID&auth=计算的token"
```

### 鉴权机制

敏感操作(`lrc`、`url`、`pic`)需要提供 HMAC-SHA1 签名的 token:

```javascript
// Token 计算公式
token = HMAC-SHA1(METING_TOKEN, server + type + id)
```

示例(使用 Node.js):
```javascript
const crypto = require('crypto');

function generateToken(server, type, id, secret = 'token') {
  const message = `${server}${type}${id}`;
  return crypto.createHmac('sha1', secret).update(message).digest('hex');
}

const token = generateToken('netease', 'url', '123456');
```

## 缓存策略

- 默认缓存容量:1000 条记录
- 缓存时长:
  - `url` 类型:10 分钟
  - 其他类型:1 小时
- 响应头 `x-cache`:
  - `miss`:缓存未命中,调用上游 API
  - 无此头:缓存命中

## Cookie 配置

部分音乐平台的 API 需要登录态才能访问完整数据。可以通过以下两种方式配置 Cookie:

### 方式一:环境变量(推荐)

通过环境变量 `METING_COOKIE_大写平台名` 配置:

```bash
# Docker 部署示例
docker run -d \
  -p 80:80 \
  -e METING_COOKIE_NETEASE="your_netease_cookie" \
  -e METING_COOKIE_TENCENT="your_tencent_cookie" \
  --name meting-api \
  meting-api
```

### 方式二:文件存储

在项目根目录 `cookie/` 文件夹下创建以平台名命名的文件(无扩展名):

```
cookie/
  ├── netease    # 网易云音乐 Cookie
  ├── tencent    # QQ音乐 Cookie
  ├── kugou      # 酷狗音乐 Cookie
  └── ...
```

每个文件存储对应平台的 Cookie 字符串。

### Cookie 优先级

1. 优先从文件读取(`cookie/netease` 等)
2. 文件不存在或为空时从环境变量读取(`METING_COOKIE_NETEASE` 等)

### Cookie 缓存

- Cookie 内容会在内存中缓存 5 分钟,减少文件系统读取
- 每 5 分钟自动清除缓存，强制重新从文件读取，确保 cookie 更新
- 使用文件存储时,修改 cookie 文件会自动清除缓存,立即生效
- 环境变量方式需要重启服务才能更新

### Referrer 白名单

通过 `METING_COOKIE_ALLOW_HOSTS` 环境变量限制哪些来源可以使用 Cookie:

```bash
# 仅允许特定域名使用 Cookie
METING_COOKIE_ALLOW_HOSTS=example.com,music.example.com
```

不设置时不限制来源。这可以防止 Cookie 被第三方滥用。

## 错误处理

API 返回标准 HTTP 状态码:

| 状态码 | 说明 |
|--------|------|
| 200 | 请求成功 |
| 302 | 重定向到资源(url/pic 类型) |
| 400 | 参数错误 |
| 401 | 鉴权失败 |
| 404 | 资源不存在 |
| 500 | 上游 API 调用失败或返回格式异常 |

错误信息通过响应头 `x-error-message` 返回。

## 开发

### 代码规范

项目使用 ESLint Standard 规范:

```bash
yarn lint
```

### 技术栈

- **运行时**: Node.js 22+ (ES Module)
- **框架**: [Hono](https://hono.dev/) 4.x
- **核心库**: [@meting/core](https://www.npmjs.com/package/@meting/core) 1.5+
- **缓存**: lru-cache 11.x
- **日志**: pino (JSON 格式)
- **加密**: hash.js (HMAC-SHA1)

## 许可证

MIT License

## 相关项目

- [@meting/core](https://www.npmjs.com/package/@meting/core) - Meting 核心库
- [Meting](https://github.com/metowolf/Meting) - PHP 版本
