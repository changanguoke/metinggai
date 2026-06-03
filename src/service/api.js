import Meting from '@meting/core'
import { createHmac } from 'node:crypto'
import { HTTPException } from '../utils/http-exception.js'
import config from '../config.js'
import { format as lyricFormat } from '../utils/lyric.js'
import { readCookieFile, isAllowedHost } from '../utils/cookie.js'
import { LRUCache } from 'lru-cache'

const cache = new LRUCache({
  max: 1000,
  ttl: 1000 * 30
})
const METING_METHODS = {
  search: 'search',
  song: 'song',
  album: 'album',
  artist: 'artist',
  playlist: 'playlist',
  lrc: 'lyric',
  url: 'url',
  pic: 'pic'
}

let kugouPicQueue = Promise.resolve()
function kugouPicRateLimit(fn) {
  kugouPicQueue = kugouPicQueue.then(() => new Promise(resolve => setTimeout(resolve, 1200))).then(fn)
  return kugouPicQueue
}

export default async (request, ctx) => {
  const url = new URL(request.url)
  const query = Object.fromEntries(url.searchParams)
  const server = query.server || 'netease'
  const type = query.type || 'search'
  const id = query.id || 'hello'

  const offset = parseInt(query.offset) || 0
  const token = query.token || query.auth || 'token'

  if (!['netease', 'tencent', 'kugou', 'baidu', 'kuwo'].includes(server)) {
    throw new HTTPException(400, { message: 'server 参数不合法' })
  }
  if (!['song', 'album', 'search', 'artist', 'playlist', 'lrc', 'url', 'pic'].includes(type)) {
    throw new HTTPException(400, { message: 'type 参数不合法' })
  }

  if (['lrc', 'url', 'pic'].includes(type)) {
    if (auth(server, type, id) !== token) {
      throw new HTTPException(401, { message: '鉴权失败,非法调用' })
    }
  }

  const referrer = request.headers.get('referer')
  let cookie = ''
  let cacheKey

  if (isAllowedHost(referrer)) {
    cookie = await readCookieFile(server)
  }

  if (cookie) {
    const cookieHash = createHmac('sha1', config.meting.token).update(cookie).digest('hex')
    cacheKey = `${server}/${type}/${id}/cookie:${cookieHash}`
  } else {
    cacheKey = `${server}/${type}/${id}/nocookie`
  }

  let data = cache.get(cacheKey)
  if (data === undefined) {
    ctx.responseHeaders.set('x-cache', 'miss')
    const meting = new Meting(server)
    meting.format(true)

    if (cookie) {
      meting.cookie(cookie)
    }

    const method = METING_METHODS[type]
    let response
    try {
      if (type === 'pic' && server === 'kugou') {
        const result = await kugouPicRateLimit(async () => {
          try {
            const resp = await new Meting('kugou').format(false).song(id)
            const songData = JSON.parse(resp)
            let img = songData.imgUrl || ''
            if (img) { return img.replace('{size}', '400') }
            console.error('[pic] kugou no imgUrl id=' + id + ' raw=' + String(resp).substring(0, 300))
          } catch(e) {
            console.error('[pic] FAIL server=kugou id=' + id + ' err=' + String(e.message || e).substring(0, 200))
          }
          return null
        })
        if (result) {
          data = { url: result }
        } else {
          return new Response(null, { status: 404 })
        }
      } else if (type === 'search' && offset > 0) {
        response = await meting.search(id, Math.floor(offset / 30) + 1)
      } else {
        response = await meting[method](id)
      }
    } catch (e) {
      if (type === 'pic') {
        console.error('[pic] FAIL server=' + server + ' id=' + id + ' err=' + String(e.message || e).substring(0, 200))
        return new Response(null, { status: 404 })
      }
      throw new HTTPException(500, { message: '上游 API 调用失败' })
    }
    if (data === undefined) {
      try {
        data = JSON.parse(response)
      } catch {
        throw new HTTPException(500, { message: '上游 API 返回格式异常' })
      }
    }
    cache.set(cacheKey, data, {
      ttl: type === 'url' ? 1000 * 60 * 10 : 1000 * 60 * 60
    })
  }

  if (type === 'url') {
    let url = data.url
    if (!url) {
      return new Response(null, { status: 404 })
    }
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
    if (server === 'tencent') {
      url = url
        .replace('http://', 'https://')
        .replace('://ws.stream.qqmusic.qq.com', '://dl.stream.qqmusic.qq.com')
    }
    if (server === 'baidu') {
      url = url
        .replace('http://zhangmenshiting.qianqian.com', 'https://gss3.baidu.com/y0s1hSulBw92lNKgpU_Z2jR7b2w6buu')
    }
    return new Response(null, { status: 302, headers: { location: url } })
  }

  if (type === 'pic') {
    const url = data.url
    if (!url) {
      return new Response(null, { status: 404 })
    }
    return new Response(null, { status: 302, headers: { location: url } })
  }

  if (type === 'lrc') {
    return new Response(lyricFormat(data.lyric, data.tlyric || ''), {
      headers: { 'content-type': 'text/plain; charset=utf-8' }
    })
  }

  return Response.json(await Promise.all(data.map(async x => {
    let producer = ''
    if (x.pic_id) {
      try {
        const albumMeting = new Meting(server)
        if (cookie) albumMeting.cookie(cookie)
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
    return {
      title: x.name,
      author: x.artist ? (Array.isArray(x.artist) ? x.artist.join(' / ') : x.artist) : '',
      album: x.album || '',
      producer: producer,
      url: `${config.meting.url}/api?server=${server}&type=url&id=${x.url_id}&auth=${auth(server, 'url', x.url_id)}`,
      pic: `${config.meting.url}/api?server=${server}&type=pic&id=${x.pic_id}&auth=${auth(server, 'pic', x.pic_id)}`,
      lrc: `${config.meting.url}/api?server=${server}&type=lrc&id=${x.lyric_id}&auth=${auth(server, 'lrc', x.lyric_id)}`
    }
  })))
}

const auth = (server, type, id) => {
  return createHmac('sha1', config.meting.token).update(`${server}${type}${id}`).digest('hex')
}
