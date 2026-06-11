# Meting-API Docker 部署指南

本指南面向零基础用户，手把手教你从零部署 Meting-API 音乐代理服务。

---

## 目录

1. [环境准备](#1-环境准备)
2. [获取项目代码](#2-获取项目代码)
3. [配置说明](#3-配置说明)
4. [构建与启动](#4-构建与启动)
5. [首次安装向导](#5-首次安装向导)
6. [反向代理配置](#6-反向代理配置)
7. [Cookie 配置（可选）](#7-cookie-配置可选)
8. [与 BillionMail 邮件系统联动](#8-与-billionmail-邮件系统联动)
9. [数据备份](#9-数据备份)
10. [常见问题](#10-常见问题)

---

## 1. 环境准备

你需要在服务器上安装以下软件：

| 软件 | 作用 | 安装方式 |
|------|------|---------|
| Docker | 容器运行环境 | `curl -fsSL https://get.docker.com \| sh` |
| Docker Compose | 编排多个容器 | Docker 新版已自带 |

安装完成后验证：

```bash
docker --version
docker compose version
```

---

## 2. 获取项目代码

```bash
# 克隆项目到服务器
git clone https://github.com/你的用户名/Meting-API.git /opt/meting-api

# 进入项目目录
cd /opt/meting-api
```

---

## 3. 配置说明

项目通过 `docker-compose.yml` 中的环境变量进行配置。下面逐项解释每个配置的含义和获取方法。

### 3.1 创建 docker-compose.yml

```bash
cp docker-compose.yml.example docker-compose.yml
```

然后编辑 `docker-compose.yml`：

```yaml
version: '3.8'

services:
  app:
    image: meting-api
    restart: always
    ports:
      - "3000:80"
    volumes:
      - ./cookie:/app/cookie
      - ./data:/app/data
    environment:
      - METING_URL=https://你的域名
      - METING_TOKEN=你的签名密钥
      - JWT_SECRET=你的JWT密钥
      - METING_COOKIE_NETEASE=
    networks:
      - default
      # 如果需要和 BillionMail 联动，取消下面两行注释
      # - billionmail-net

# 如果需要和 BillionMail 联动，取消下面注释
# networks:
#   billionmail-net:
#     external: true
#     name: billionmail_billionmail-network
```

### 3.2 环境变量详解

#### 必填配置

| 变量 | 说明 | 示例 | 获取方法 |
|------|------|------|---------|
| `METING_URL` | 你的公网访问地址，用于生成回调 URL | `https://music.example.com` | 你的域名，需提前解析到服务器 IP |
| `METING_TOKEN` | HMAC 签名密钥，保护敏感操作（获取URL/歌词/封面） | `MyS3cr3tK3y!` | **自己随机生成**，方法见下方 |

#### 安全配置（强烈建议填写）

| 变量 | 说明 | 示例 | 获取方法 |
|------|------|------|---------|
| `JWT_SECRET` | JWT 令牌签名密钥，保护用户登录状态 | `jwT_s3cr3t_k3y!` | **自己随机生成**，方法见下方 |

#### 可选配置

| 变量 | 说明 | 默认值 | 获取方法 |
|------|------|--------|---------|
| `HTTP_PORT` | 容器内 HTTP 端口 | `80` | 一般不需要改 |
| `HTTPS_ENABLED` | 是否启用 HTTPS | `false` | 如需容器内直接提供 HTTPS，设为 `true` |
| `HTTPS_PORT` | 容器内 HTTPS 端口 | `443` | 一般不需要改 |
| `SSL_KEY_PATH` | SSL 私钥路径 | - | 你的 SSL 证书私钥文件路径 |
| `SSL_CERT_PATH` | SSL 证书路径 | - | 你的 SSL 证书文件路径 |
| `HTTP_PREFIX` | 路由前缀 | `` (空) | 如需 API 路径前加 `/v1`，设为 `/v1` |
| `METING_COOKIE_ALLOW_HOSTS` | Cookie 允许的来源域名 | `` (不限制) | 逗号分隔的域名，如 `example.com,www.example.com` |
| `METING_COOKIE_NETEASE` | 网易云音乐 Cookie | - | 见 [Cookie 配置](#7-cookie-配置可选) |
| `METING_COOKIE_TENCENT` | QQ音乐 Cookie | - | 见 [Cookie 配置](#7-cookie-配置可选) |
| `METING_COOKIE_KUGOU` | 酷狗音乐 Cookie | - | 见 [Cookie 配置](#7-cookie-配置可选) |
| `METING_COOKIE_BAIDU` | 百度音乐 Cookie | - | 见 [Cookie 配置](#7-cookie-配置可选) |
| `METING_COOKIE_KUWO` | 酷我音乐 Cookie | - | 见 [Cookie 配置](#7-cookie-配置可选) |

### 3.3 如何生成随机密钥

`METING_TOKEN` 和 `JWT_SECRET` 需要随机字符串，**不要使用默认值**！

方法一：使用 OpenSSL（推荐）
```bash
openssl rand -hex 16
# 输出示例：a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6
```

方法二：使用 /dev/urandom
```bash
cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 32 | head -n1
# 输出示例：Xk9mP2qR7vW4nL8jF5hT3yB6
```

生成后分别填入 `METING_TOKEN` 和 `JWT_SECRET`。

### 3.4 端口映射说明

```yaml
ports:
  - "3000:80"
```

- **3000**：服务器对外暴露的端口，浏览器通过 `http://你的IP:3000` 访问
- **80**：容器内部端口，一般不需要改

如果你想用 80 端口直接访问（不需要输端口号），改为 `"80:80"`。

---

## 4. 构建与启动

### 4.1 构建镜像

```bash
cd /opt/meting-api
docker build -t meting-api .
```

首次构建需要下载依赖，可能需要几分钟。

### 4.2 启动服务

```bash
docker compose up -d
```

- `-d` 表示后台运行

### 4.3 查看运行状态

```bash
# 查看容器状态
docker compose ps

# 查看实时日志
docker compose logs -f

# 只看最近 50 行日志
docker compose logs --tail 50
```

### 4.4 停止与重启

```bash
# 停止服务
docker compose down

# 重启服务
docker compose restart

# 更新代码后重新构建并启动
docker compose up -d --build
```

---

## 5. 首次安装向导

服务启动后，浏览器访问 `http://你的IP:3000`，会自动跳转到安装向导。

### 步骤 1：数据库配置

你需要一个 MySQL 数据库。如果没有，可以用 Docker 快速创建：

```bash
# 创建一个 MySQL 容器
docker run -d \
  --name mysql \
  -e MYSQL_ROOT_PASSWORD=你的MySQL密码 \
  -e MYSQL_DATABASE=meting \
  -v mysql_data:/var/lib/mysql \
  --restart always \
  mysql:8.0
```

然后在安装向导中填写：

| 字段 | 说明 | 示例 |
|------|------|------|
| 主机 | MySQL 服务器地址 | 如果在同一服务器用 Docker 运行，填宿主机 IP（见下方说明） |
| 端口 | MySQL 端口 | `3306` |
| 数据库名 | 数据库名称 | `meting` |
| 用户名 | 数据库用户名 | `root` |
| 密码 | 数据库密码 | 你设置的密码 |

> **如何获取 Docker 内 MySQL 的宿主机 IP？**
>
> 如果 Meting-API 和 MySQL 都在 Docker 中运行，需要让 Meting-API 能访问 MySQL。
> 最简单的方式是让 MySQL 暴露端口到宿主机，然后 Meting-API 用宿主机 IP 连接。
>
> ```bash
> # 查看宿主机 Docker 网桥 IP（通常是 172.17.0.1）
> ip addr show docker0 | grep inet
> ```
>
> 在安装向导的主机字段填这个 IP（如 `172.17.0.1`）。

### 步骤 2：创建管理员

设置超级管理员账号：

| 字段 | 说明 |
|------|------|
| 用户名 | 管理员登录名 |
| 邮箱 | 管理员邮箱，用于接收验证码和登录 |
| 密码 | 管理员密码 |

### 步骤 3：邮件配置

配置 SMTP 邮件服务，用于发送验证码。如果暂时不需要邮箱验证码功能，可以跳过。

| 字段 | 说明 | 示例 | 获取方法 |
|------|------|------|---------|
| SMTP 主机 | 邮件服务器地址 | `smtp.gmail.com` | 你的邮箱服务商提供 |
| SMTP 端口 | 邮件服务器端口 | `465`(SSL) / `587`(TLS) | 你的邮箱服务商提供 |
| 发件人邮箱 | 发送验证码的邮箱 | `noreply@example.com` | 你自己的邮箱 |
| 邮箱密码 | SMTP 授权码 | `abcd efgh ijkl` | 见下方说明 |

> **如何获取 SMTP 授权码？**
>
> SMTP 授权码不是你的邮箱登录密码，而是专门给第三方客户端用的密码。
>
> - **QQ 邮箱**：设置 → 账户 → POP3/SMTP 服务 → 开启 → 生成授权码
> - **163 邮箱**：设置 → POP3/SMTP/IMAP → 开启 → 设置授权密码
> - **Gmail**：Google 账号 → 安全性 → 两步验证 → 应用专用密码
> - **BillionMail**：使用你 BillionMail 中创建的邮箱账号和密码

安装完成后，系统会自动跳转到主页面。

---

## 6. 反向代理配置

如果你有域名并希望使用 HTTPS（强烈推荐），需要配置反向代理。

### 6.1 使用 Nginx（推荐）

```nginx
server {
    listen 80;
    server_name music.example.com;

    # 强制跳转 HTTPS
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name music.example.com;

    # SSL 证书（免费证书可从 Let's Encrypt 获取）
    ssl_certificate     /etc/letsencrypt/live/music.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/music.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

> **如何获取免费 SSL 证书？**
>
> ```bash
> # 安装 certbot
> apt install certbot
>
> # 获取证书（先确保域名已解析到服务器，且 80 端口可访问）
> certbot certonly --standalone -d music.example.com
>
> # 证书保存在 /etc/letsencrypt/live/music.example.com/
> ```

### 6.2 使用 Cloudflare（最简单）

如果你的域名使用 Cloudflare DNS：

1. 在 Cloudflare 添加 A 记录，指向服务器 IP
2. 开启 Cloudflare 的代理（橙色云朵图标）
3. Cloudflare 自动提供 HTTPS
4. `METING_URL` 填 `https://music.example.com`

---

## 7. Cookie 配置（可选）

Cookie 可以提升音乐获取质量（更高音质、更多歌曲）。不配置也能正常使用。

### 7.1 获取网易云音乐 Cookie

1. 打开浏览器，访问 `https://music.163.com`
2. 登录你的账号
3. 按 `F12` 打开开发者工具 → 切换到「网络」(Network) 标签
4. 刷新页面，点击任意一个请求
5. 在请求头中找到 `Cookie` 字段，复制整个值

### 7.2 配置方式

**方式一：环境变量**（推荐）

在 `docker-compose.yml` 中设置：

```yaml
environment:
  - METING_COOKIE_NETEASE=你复制的Cookie值
```

**方式二：文件**

创建 `cookie/netease` 文件，把 Cookie 值写入：

```bash
mkdir -p cookie
echo "你复制的Cookie值" > cookie/netease
```

文件优先级高于环境变量。

### 7.3 Cookie 安全策略

默认情况下，所有来源都可以使用 Cookie。如果你想限制只有特定网站能使用：

```yaml
environment:
  - METING_COOKIE_ALLOW_HOSTS=music.example.com,www.example.com
```

---

## 8. 与 BillionMail 邮件系统联动

如果你已经部署了 BillionMail，可以让 Meting-API 使用 BillionMail 的邮件服务发送验证码，并且共享网络。

### 8.1 修改 docker-compose.yml

```yaml
version: '3.8'

services:
  app:
    image: meting-api
    restart: always
    ports:
      - "3000:80"
    volumes:
      - ./cookie:/app/cookie
      - ./data:/app/data
    environment:
      - METING_URL=https://music.example.com
      - METING_TOKEN=你的签名密钥
      - JWT_SECRET=你的JWT密钥
    networks:
      - default
      - billionmail-net    # 加入 BillionMail 网络

networks:
  billionmail-net:
    external: true         # 使用外部已存在的网络
    name: billionmail_billionmail-network  # BillionMail 的网络名称
```

### 8.2 如何获取 BillionMail 网络名称

```bash
docker network ls | grep billionmail
# 输出示例：billionmail_billionmail-network
```

### 8.3 在安装向导中使用 BillionMail 邮箱

在邮件配置步骤中：

| 字段 | 填写 |
|------|------|
| SMTP 主机 | `postfix`（BillionMail 内部网络主机名） |
| SMTP 端口 | `25` |
| 发件人邮箱 | 你在 BillionMail 中创建的邮箱地址 |
| 邮箱密码 | 该邮箱的密码 |

---

## 9. 数据备份

系统内置了数据备份功能，支持手动和自动备份。

### 9.1 手动备份

1. 登录管理员账号
2. 访问管理后台 → 数据备份
3. 点击「手动备份」

### 9.2 自动备份

1. 管理后台 → 数据备份 → 自动备份配置
2. 开启自动备份
3. 设置执行时间（建议凌晨 3 点）
4. 设置保留数量（建议 7 份）

### 9.3 备份内容

| 内容 | 说明 |
|------|------|
| 数据库 | 所有用户数据、播放历史、收藏、配置等 |
| Cookie 文件 | `cookie/` 目录下的平台 Cookie |
| 数据目录 | `data/` 目录下的配置文件和备份文件 |

### 9.4 恢复备份

1. 管理后台 → 数据备份 → 恢复备份
2. 上传 `.gz` 备份文件
3. 确认恢复

> **注意**：恢复操作会覆盖当前数据，请谨慎操作！

---

## 10. 常见问题

### Q: 启动后显示「数据库初始化失败」

**A**: 这是正常的首次部署提示。访问 `http://你的IP:3000` 进入安装向导配置数据库即可。

### Q: 每次重启容器后都要重新安装

**A**: `data/` 目录没有持久化。确保 `docker-compose.yml` 中有：

```yaml
volumes:
  - ./data:/app/data
```

### Q: 酷狗音乐没有封面

**A**: 酷狗音乐封面有防盗链，系统已自动代理获取。部分歌曲可能本身没有封面数据，属于正常现象。

### Q: 搜索结果无法加载更多

**A**: 确保你使用的是最新版本的镜像：

```bash
docker compose up -d --build
```

### Q: 如何查看错误日志

```bash
# 实时查看日志
docker compose logs -f

# 只看错误
docker compose logs | grep -i error

# 查看最近 100 行
docker compose logs --tail 100
```

### Q: 如何更新到最新版本

```bash
cd /opt/meting-api
git pull
docker compose up -d --build
```

### Q: 忘记管理员密码怎么办

**A**: 直接在数据库中重置：

```bash
# 进入 MySQL 容器
docker exec -it mysql mysql -u root -p

# 重置密码（密码会被自动加密）
USE meting;
-- 需要通过注册新账号或重新运行安装向导来创建新管理员
```

或者删除 `data/config.json` 后重新走安装向导（数据库数据不会丢失）。

### Q: 服务器重启后 BillionMail 网络连接丢失

**A**: 创建一个开机启动脚本：

```bash
cat > /opt/startup.sh << 'EOF'
#!/bin/bash
sleep 10
cd /opt/meting-api && docker compose up -d
EOF

chmod +x /opt/startup.sh
```

然后添加 systemd 服务：

```bash
cat > /etc/systemd/system/meting-startup.service << 'EOF'
[Unit]
Description=Meting-API Startup
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
ExecStart=/opt/startup.sh
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF

systemctl enable meting-startup.service
```

---

## 快速部署命令汇总

```bash
# 1. 安装 Docker
curl -fsSL https://get.docker.com | sh

# 2. 获取代码
git clone https://github.com/你的用户名/Meting-API.git /opt/meting-api
cd /opt/meting-api

# 3. 生成密钥
echo "METING_TOKEN=$(openssl rand -hex 16)"
echo "JWT_SECRET=$(openssl rand -hex 16)"

# 4. 编辑配置（填入上面生成的密钥和你的域名）
nano docker-compose.yml

# 5. 构建并启动
docker build -t meting-api .
docker compose up -d

# 6. 查看状态
docker compose logs -f

# 7. 浏览器访问 http://你的IP:3000 完成安装向导
```
