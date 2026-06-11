/**
 * @file api.js
 * @description 核心 API 服务 - 封装 @meting/core 库，提供多平台音乐搜索、
 *              歌曲、专辑、歌手、歌单、歌词、URL 和封面图片获取功能。
 *              包含参数校验、HMAC 鉴权、LRU 缓存、URL 转换及响应组装等完整流程。
 */

// Node 内置
import { createHmac } from 'node:crypto'

// 第三方库
import Meting from '@meting/core'
import { LRUCache } from 'lru-cache'

// 项目内部
import config from '../config.js'
import { logger } from '../middleware/logger.js'
import { HTTPException } from '../utils/http-exception.js'
import { format as lyricFormat } from '../utils/lyric.js'
import { readCookieFile, isAllowedHost } from '../utils/cookie.js'

// ====== LRU 缓存初始化 ======
let cacheMax = 1000
let cacheTtl = 1000 * 60 * 60 // 默认 1 小时
let purgeInterval = 5 * 60 * 1000 // 自动清理间隔（毫秒）

let cache = new LRUCache({
  max: cacheMax,
  ttl: cacheTtl
})

// 缓存自动清理定时器
let purgeTimer = setInterval(() => {
  cache.purgeStale()
}, purgeInterval)

/**
 * 获取当前缓存配置
 * @returns {Object} 缓存配置对象 { max, ttl, size, purgeInterval }
 */
export function getCacheConfig () {
  return { max: cache.max, ttl: cacheTtl / 1000, size: cache.size, purgeInterval: purgeInterval / 1000 }
}

/**
 * 更新缓存配置
 * @param {Object} options - 配置项
 * @param {number} [options.max] - 最大缓存条数（10 ~ 100000）
 * @param {number} [options.ttl] - 默认 TTL 秒数（5 ~ 86400）
 * @param {number} [options.purgeInterval] - 清理间隔秒数（10 ~ 3600）
 * @returns {Object} 更新后的缓存配置
 */
export function setCacheConfig ({ max, ttl, purgeInterval: pi }) {
  if (max !== undefined) {
    const v = Number(max)
    if (!isNaN(v) && v >= 10 && v <= 100000) {
      // lru-cache v11 的 max 是只读属性，需重建实例
      const newCache = new LRUCache({ max: v, ttl: cacheTtl })
      for (const [key, value] of cache) {
        newCache.set(key, value)
      }
      cache = newCache
      cacheMax = v
    }
  }
  if (ttl !== undefined) {
    const v = Number(ttl)
    if (!isNaN(v) && v >= 5 && v <= 86400) cacheTtl = v * 1000
  }
  if (pi !== undefined) {
    const v = Number(pi)
    if (!isNaN(v) && v >= 10 && v <= 3600) {
      purgeInterval = v * 1000
      clearInterval(purgeTimer)
      purgeTimer = setInterval(() => { cache.purgeStale() }, purgeInterval)
    }
  }
  return getCacheConfig()
}

// API 类型与 @meting/core 方法名的映射表
const METING_METHODS = {
  search: 'search',     // 搜索
  song: 'song',         // 歌曲详情
  album: 'album',       // 专辑详情
  artist: 'artist',     // 歌手信息
  playlist: 'playlist', // 歌单
  lrc: 'lyric',         // 歌词
  url: 'url',           // 音频 URL
  pic: 'pic'            // 封面图片
}

// ====== 酷狗封面限流机制 ======
// 酷狗平台对 song 接口有频率限制，使用 Promise 队列实现串行限流（仅兜底使用）
let kugouPicQueue = Promise.resolve()

/**
 * 酷狗封面请求限流包装（兜底方案，正常情况下不会触发）
 * @param {Function} fn - 实际请求函数
 * @returns {Promise} 限流后的 Promise
 */
function kugouPicRateLimit(fn) {
  kugouPicQueue = kugouPicQueue.then(() => new Promise(resolve => setTimeout(resolve, 2000))).then(fn)
  return kugouPicQueue
}

/**
 * 酷狗原始数据手动格式化
 * 从搜索/列表原始数据中提取标准化字段 + 封面 URL（union_cover）
 * @param {Object} item - 酷狗原始数据项
 * @returns {Object} 标准化数据，含 cover_url 字段
 */
function formatKugouItem (item) {
  // 过滤错误响应（如 { errcode: 2, error: "..." }）
  if (!item || !item.hash) return null
  const filename = item.filename || item.fileName || ''
  const parts = filename.split(' - ')
  const name = parts.length >= 2 ? parts.slice(1).join(' - ') : filename
  const artist = parts.length >= 2 ? parts[0].split('、') : []
  // 从 trans_param.union_cover 提取封面 URL
  const unionCover = item.trans_param?.union_cover || item.imgUrl || ''
  const coverUrl = unionCover ? unionCover.replace('{size}', '400').replace('http://', 'https://') : ''
  return {
    id: item.hash,
    name,
    artist,
    album: item.album_name || '',
    pic_id: item.hash,
    url_id: item.hash,
    lyric_id: item.hash,
    source: 'kugou',
    cover_url: coverUrl
  }
}

/**
 * 核心 API 请求处理
 * 解析参数 → 校验 → 鉴权 → 缓存查找 → 上游 API 调用 → URL 转换 → 响应组装
 *
 * @param {Request} request - HTTP 请求对象
 * @param {Object} ctx - 请求上下文（含 responseHeaders 等）
 * @returns {Promise<Response>} 响应对象
 */
export default async (request, ctx) => {
  // ====== 1. 解析查询参数 ======
  const url = new URL(request.url)
  const query = Object.fromEntries(url.searchParams)
  // 音乐平台：默认网易云
  const server = query.server || 'netease'
  // API 类型：默认搜索
  const type = query.type || 'search'
  // 资源 ID：默认 hello
  const id = query.id || 'hello'
  // 搜索分页偏移量
  const offset = parseInt(query.offset) || 0
  // 鉴权 token：支持 token 或 auth 两种参数名
  const token = query.token || query.auth || 'token'

  // ====== 2. 参数白名单校验 ======
  // 仅允许以下音乐平台
  if (!['netease', 'kugou'].includes(server)) {
    throw new HTTPException(400, { message: 'server 参数不合法' })
  }
  // 仅允许以下 API 类型
  if (!['song', 'album', 'search', 'artist', 'playlist', 'lrc', 'url', 'pic'].includes(type)) {
    throw new HTTPException(400, { message: 'type 参数不合法' })
  }

  // ====== 3. 敏感操作鉴权 ======
  // lrc（歌词）、url（音频地址）、pic（封面）属于敏感操作，需要 HMAC-SHA1 签名校验
  if (['lrc', 'url', 'pic'].includes(type)) {
    if (auth(server, type, id) !== token) {
      throw new HTTPException(401, { message: '鉴权失败,非法调用' })
    }
  }

  // ====== 4. Cookie 读取（受 referrer 白名单保护） ======
  const referrer = request.headers.get('referer')
  let cookie = ''
  let cacheKey

  // 只有当请求来源在白名单内时才读取 Cookie（防止 Cookie 泄露）
  if (isAllowedHost(referrer)) {
    cookie = await readCookieFile(server)
  }

  // ====== 5. 构建缓存键 ======
  // 有 Cookie 时将 cookie hash 加入键中（不同 Cookie 可能返回不同数据）
  if (cookie) {
    const cookieHash = createHmac('sha1', config.meting.token).update(cookie).digest('hex')
    cacheKey = `${server}/${type}/${id}/cookie:${cookieHash}`
  } else {
    cacheKey = `${server}/${type}/${id}/nocookie`
  }

  // ====== 6. 缓存查找或上游 API 调用 ======
  let data = cache.get(cacheKey)
  if (data === undefined) {
    // 缓存未命中，设置响应头标记
    ctx.responseHeaders.set('x-cache', 'miss')

    // 创建 Meting 实例，format(true) 返回标准化格式
    const meting = new Meting(server)
    meting.format(true)

    // 设置 Cookie（如有），用于 VIP 歌曲、高音质资源等需要登录态的场景
    if (cookie) {
      meting.cookie(cookie)
    }

    const method = METING_METHODS[type]
    let response
    try {
      // ----- 特殊处理：酷狗封面图片 -----
      // 优先级：从搜索缓存中查找 cover_url > 限流队列请求 song 接口 > 搜索 API 兜底
      if (type === 'pic' && server === 'kugou') {
        // 1. 尝试从搜索缓存中查找 cover_url
        let coverUrl = ''
        let searchName = ''
        for (const [key, value] of cache.entries()) {
          // 查找包含该 hash 的搜索结果缓存
          if (key.startsWith('kugou/') && Array.isArray(value)) {
            const item = value.find(v => v.pic_id === id && v.cover_url)
            if (item) { coverUrl = item.cover_url; break }
            // 记录歌曲名，用于搜索兜底
            if (!searchName) {
              const nameItem = value.find(v => v.pic_id === id)
              if (nameItem) searchName = nameItem.name
            }
          }
        }
        if (coverUrl) {
          data = { url: coverUrl }
        } else {
          // 2. 缓存中没有，通过限流队列获取
          const result = await kugouPicRateLimit(async () => {
            try {
              const resp = await new Meting('kugou').format(false).song(id)
              const songData = JSON.parse(resp)
              let img = songData.imgUrl || ''
              if (img) { return img.replace('{size}', '400').replace('http://', 'https://') }
              logger.warn({ id, raw: String(resp).substring(0, 300) }, '[pic] kugou song no imgUrl')
            } catch(e) {
              logger.warn({ id, err: String(e.message || e).substring(0, 200) }, '[pic] kugou song fail')
            }
            return null
          })
          if (result) {
            data = { url: result }
          } else if (searchName) {
            // 3. song 接口也失败，用搜索 API 兜底
            try {
              const searchResp = await new Meting('kugou').format(false).search(searchName)
              const searchData = JSON.parse(searchResp)
              if (Array.isArray(searchData)) {
                const match = searchData.find(s => s.hash === id && (s.trans_param?.union_cover || s.imgUrl))
                if (match) {
                  const unionCover = match.trans_param?.union_cover || match.imgUrl || ''
                  const url = unionCover.replace('{size}', '400').replace('http://', 'https://')
                  if (url) { data = { url } }
                }
              }
            } catch(e) {
              logger.warn({ id, name: searchName, err: String(e.message || e).substring(0, 200) }, '[pic] kugou search fallback fail')
            }
            if (!data) data = { url: '' }
          } else {
            data = { url: '' }
          }
        }
      // ----- 特殊处理：酷狗搜索/列表（format(false) + 手动格式化，保留封面 URL） -----
      } else if (server === 'kugou' && ['search', 'song', 'album', 'artist', 'playlist'].includes(type)) {
        const rawMeting = new Meting('kugou')
        rawMeting.format(false)
        if (cookie) rawMeting.cookie(cookie)
        if (type === 'search' && offset > 0) {
          response = await rawMeting.search(id, { page: Math.floor(offset / 30) + 1 })
        } else {
          response = await rawMeting[method](id)
        }
        // 手动格式化，保留 trans_param.union_cover 作为封面 URL
        const rawData = JSON.parse(response)
        // format(false) 返回原始 API 响应，需要提取 data.info 数组
        let kugouItems = []
        if (Array.isArray(rawData)) {
          kugouItems = rawData
        } else if (rawData && rawData.data && Array.isArray(rawData.data.info)) {
          kugouItems = rawData.data.info
        } else if (rawData && rawData.hash) {
          kugouItems = [rawData]
        } else {
          // 搜索/列表返回错误对象（如 errcode:2），回退到 format(true) 标准化
          logger.warn({ type, id, raw: String(response).substring(0, 200) }, '[kugou] raw API error, fallback to format(true)')
          const fallbackMeting = new Meting('kugou')
          fallbackMeting.format(true)
          if (cookie) fallbackMeting.cookie(cookie)
          const fallbackResp = type === 'search' && offset > 0
            ? await fallbackMeting.search(id, { page: Math.floor(offset / 30) + 1 })
            : await fallbackMeting[method](id)
          data = JSON.parse(fallbackResp)
        }
        if (kugouItems.length > 0) {
          data = kugouItems.map(formatKugouItem).filter(Boolean)
        }
      // ----- 特殊处理：带分页偏移的搜索（非酷狗） -----
      } else if (type === 'search' && offset > 0) {
        response = await meting.search(id, { page: Math.floor(offset / 30) + 1 })
      // ----- 通用情况：直接调用对应方法 -----
      } else {
        response = await meting[method](id)
      }
    } catch (e) {
      // 封面获取失败返回 404（而非 500），因为部分歌曲可能确实无封面
      if (type === 'pic') {
        logger.error({ server, id, err: String(e.message || e).substring(0, 200) }, '[pic] FAIL')
        return new Response(null, { status: 404 })
      }
      throw new HTTPException(500, { message: '上游 API 调用失败' })
    }

    // 解析上游返回的 JSON 数据
    if (data === undefined) {
      try {
        data = JSON.parse(response)
      } catch {
        throw new HTTPException(500, { message: '上游 API 返回格式异常' })
      }
    }

    // 写入缓存：url 类型缓存 10 分钟（音频链接可能失效快），其他类型使用配置的默认 TTL
    cache.set(cacheKey, data, {
      ttl: type === 'url' ? 1000 * 60 * 10 : cacheTtl
    })
  }

  // ====== 7. 根据类型组装响应 ======

  // --- 音频 URL 类型：302 重定向到实际音频地址 ---
  if (type === 'url') {
    let url = data.url
    if (!url) {
      return new Response(null, { status: 404 })
    }
    // 网易云 URL 转换：
    // m7c/m8c → m7/m8（CDN 节点优化）、强制 HTTPS、移除 vuutv 参数（防盗链参数）
    if (server === 'netease') {
      url = url
        .replace('://m7c.', '://m7.')
        .replace('://m8c.', '://m8.')
        .replace('http://', 'https://')
      if (url.includes('vuutv=')) {
        const tempUrl = new URL(url)
        tempUrl.search = ''
        url = tempUrl.toString()
      }
    }
    // 返回 302 重定向，让客户端直接请求实际的音频 CDN 地址
    return new Response(null, { status: 302, headers: { location: url } })
  }

  // --- 封面图片类型 ---
  if (type === 'pic') {
    let url = data.url
    if (!url) {
      // 返回 1x1 透明 SVG 占位图，避免浏览器显示破损图片
      return new Response('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>', {
        status: 200,
        headers: { 'content-type': 'image/svg+xml', 'cache-control': 'no-store' }
      })
    }
    // 强制 HTTPS
    url = url.replace('http://', 'https://')
    // 酷狗封面：服务器代理获取图片，避免 CDN 防盗链导致浏览器无法加载
    if (server === 'kugou') {
      try {
        const imgResp = await fetch(url, {
          headers: { 'Referer': 'https://www.kugou.com/' },
          signal: AbortSignal.timeout(10000)
        })
        if (imgResp.ok) {
          const imgData = await imgResp.arrayBuffer()
          return new Response(imgData, {
            status: 200,
            headers: {
              'content-type': imgResp.headers.get('content-type') || 'image/jpeg',
              'cache-control': 'public, max-age=3600'
            }
          })
        }
      } catch(e) {
        logger.warn({ url, err: String(e.message || e).substring(0, 200) }, '[pic] kugou proxy fetch failed')
      }
      // 代理失败，返回占位图
      return new Response('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>', {
        status: 200,
        headers: { 'content-type': 'image/svg+xml', 'cache-control': 'no-store' }
      })
    }
    // 其他平台：302 重定向到封面 URL
    return new Response(null, { status: 302, headers: { location: url } })
  }

  // --- 歌词类型：返回合并后的 LRC 格式纯文本 ---
  // 注意：使用 new Response() 而非 Response.json()，避免 JSON 序列化导致歌词被双引号包裹
  if (type === 'lrc') {
    // 容错处理：确保 lyric 存在且为字符串
    const rawLyric = typeof data.lyric === 'string' ? data.lyric : ''
    const rawTlyric = typeof data.tlyric === 'string' ? data.tlyric : ''
    // 酷狗等平台可能返回含 BOM 或特殊字符的歌词，需清理
    const cleanLyric = rawLyric.replace(/^\uFEFF/, '').trim()
    const cleanTlyric = rawTlyric.replace(/^\uFEFF/, '').trim()
    const lrcText = lyricFormat(cleanLyric, cleanTlyric)
    return new Response(lrcText, {
      status: 200,
      headers: { 'content-type': 'text/plain; charset=utf-8' }
    })
  }

  // --- 其他类型（search/song/album/artist/playlist）：返回标准化 JSON ---
  // 遍历每条数据，补充 producer（唱片公司）信息和带签名的子资源 URL
  return Response.json(await Promise.all(data.map(async x => {
    let producer = ''
    // 如果有专辑 ID，尝试获取唱片公司信息
    if (x.pic_id && server !== 'kugou') {
      try {
        const albumMeting = new Meting(server)
        if (cookie) albumMeting.cookie(cookie)
        // 必须使用 format(false) 获取原始数据
        // 原因：format(true) 会丢弃 company（唱片公司）字段，
        // 而 APlayer 等播放器需要展示该信息，所以必须用原始格式保留完整字段
        albumMeting.format(false)
        const albumResp = await albumMeting.album(x.pic_id)
        const albumRaw = JSON.parse(albumResp)
        // 原始 API 返回格式: { album: { name, company, ... }, songs: [...] }
        // format(true) 会丢弃 company 字段，必须用 format(false) 取原始数据
        if (albumRaw && albumRaw.album) {
          producer = albumRaw.album.company || ''
        }
      } catch(e) { /* album 信息获取失败时 producer 保持空 */ }
    }

    // 封面 URL：统一走 API 代理（302 重定向），避免酷狗 CDN 防盗链问题
    const picUrl = `${config.meting.url}/api?server=${server}&type=pic&id=${x.pic_id}&auth=${auth(server, 'pic', x.pic_id)}`

    // 组装 APlayer 兼容的标准格式响应
    return {
      title: x.name,                                                                                   // 歌曲名称
      author: x.artist ? (Array.isArray(x.artist) ? x.artist.join(' / ') : x.artist) : '',             // 歌手（多位歌手用 / 分隔）
      album: x.album || '',                                                                            // 专辑名称
      producer: producer,                                                                              // 唱片公司
      // 以下 URL 均附带 HMAC 签名，客户端可直接使用而无需自行计算
      url: `${config.meting.url}/api?server=${server}&type=url&id=${x.url_id}&auth=${auth(server, 'url', x.url_id)}`,   // 音频地址
      pic: picUrl,                                                                                     // 封面地址
      lrc: `${config.meting.url}/api?server=${server}&type=lrc&id=${x.lyric_id}&auth=${auth(server, 'lrc', x.lyric_id)}` // 歌词地址
    }
  })))
}

/**
 * 生成 HMAC-SHA1 鉴权 token
 * 用于敏感操作（lrc/url/pic）的调用权限验证
 * @param {string} server - 音乐平台标识
 * @param {string} type - API 类型
 * @param {string} id - 资源 ID
 * @returns {string} 十六进制签名字符串
 */
const auth = (server, type, id) => {
  return createHmac('sha1', config.meting.token).update(`${server}${type}${id}`).digest('hex')
}

export { cache }
