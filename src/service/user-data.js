/**
 * @file user-data.js
 * @description 用户数据 API 服务 - 处理播放历史和收藏的增删查操作
 *              所有接口均需 JWT 认证（ctx.user 由 auth 中间件注入）
 */

// 项目内部
import { findByUserId as findHistory, create as createHistory, deleteByUserId as deleteHistory } from '../db/play-history.js'
import { findByUserId as findFavorites, create as createFavorite, deleteById as deleteFavoriteById, exists as favoriteExists } from '../db/favorite.js'
import { HTTPException } from '../utils/http-exception.js'

// 允许的音乐平台白名单
const VALID_SERVERS = ['netease', 'kugou']

/**
 * 用户数据路由入口 - 根据路径分派到对应处理器
 * @param {Request} request - HTTP 请求对象
 * @param {Object} ctx - 请求上下文（含 ctx.user 认证信息）
 * @returns {Promise<Response>} 响应对象
 */
export default async (request, ctx) => {
  const url = new URL(request.url)
  const pathname = url.pathname
  const method = request.method

  // 路由分派：根据路径和方法调用对应处理函数
  if (pathname.startsWith('/api/user/history')) {
    return handleHistory(request, ctx, method)
  }

  if (pathname.startsWith('/api/user/favorites')) {
    return handleFavorites(request, ctx, method, pathname)
  }

  throw new HTTPException(404, { message: '接口不存在' })
}

/**
 * 处理播放历史相关请求
 * @param {Request} request - HTTP 请求对象
 * @param {Object} ctx - 请求上下文
 * @param {string} method - HTTP 方法
 * @returns {Promise<Response>} 响应对象
 */
async function handleHistory (request, ctx, method) {
  // 获取播放历史
  if (method === 'GET') {
    const rows = await findHistory(ctx.user.id)
    const history = rows.map(row => ({
      id: row.id,
      server: row.server,
      songId: row.song_id,
      songName: row.song_name,
      artist: row.artist,
      album: row.album,
      playedAt: row.played_at
    }))
    return Response.json({ history })
  }

  // 添加播放记录
  if (method === 'POST') {
    const body = await request.json()
    const { server, songId, songName, artist, album } = body

    // 参数校验
    if (!VALID_SERVERS.includes(server)) {
      throw new HTTPException(400, { message: 'server 参数不合法' })
    }
    if (!songId) {
      throw new HTTPException(400, { message: 'songId 不能为空' })
    }

    await createHistory({ userId: ctx.user.id, server, songId, songName, artist, album })
    return Response.json({ success: true })
  }

  // 清空播放历史
  if (method === 'DELETE') {
    await deleteHistory(ctx.user.id)
    return Response.json({ success: true })
  }

  throw new HTTPException(405, { message: '请求方法不允许' })
}

/**
 * 处理收藏相关请求
 * @param {Request} request - HTTP 请求对象
 * @param {Object} ctx - 请求上下文
 * @param {string} method - HTTP 方法
 * @param {string} pathname - 请求路径
 * @returns {Promise<Response>} 响应对象
 */
async function handleFavorites (request, ctx, method, pathname) {
  // 获取收藏列表
  if (method === 'GET') {
    const rows = await findFavorites(ctx.user.id)
    const favorites = rows.map(row => ({
      id: row.id,
      server: row.server,
      songId: row.song_id,
      songName: row.song_name,
      artist: row.artist,
      album: row.album,
      createdAt: row.created_at
    }))
    return Response.json({ favorites })
  }

  // 添加收藏
  if (method === 'POST') {
    const body = await request.json()
    const { server, songId, songName, artist, album } = body

    // 参数校验
    if (!VALID_SERVERS.includes(server)) {
      throw new HTTPException(400, { message: 'server 参数不合法' })
    }
    if (!songId) {
      throw new HTTPException(400, { message: 'songId 不能为空' })
    }

    // 检查是否已收藏
    const alreadyExists = await favoriteExists(ctx.user.id, server, songId)
    if (alreadyExists) {
      return Response.json({ success: false, message: '已收藏该歌曲' }, { status: 400 })
    }

    await createFavorite({ userId: ctx.user.id, server, songId, songName, artist, album })
    return Response.json({ success: true })
  }

  // 删除收藏（路径格式：/api/user/favorites/:id）
  if (method === 'DELETE') {
    // 从路径中提取收藏记录 ID
    const idStr = pathname.replace('/api/user/favorites/', '')
    const id = Number(idStr)

    if (!id || Number.isNaN(id)) {
      throw new HTTPException(400, { message: '收藏记录 ID 无效' })
    }

    const deleted = await deleteFavoriteById(id, ctx.user.id)
    if (!deleted) {
      return Response.json({ success: false, message: '收藏记录不存在' }, { status: 404 })
    }

    return Response.json({ success: true })
  }

  throw new HTTPException(405, { message: '请求方法不允许' })
}
