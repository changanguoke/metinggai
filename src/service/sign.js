import { createHmac } from 'node:crypto'
import { validateSession } from '../utils/session.js'
import { HTTPException } from '../utils/http-exception.js'
import config from '../config.js'

export default async (request) => {
  const sessionToken = request.headers.get('X-Session-Token')
  if (!validateSession(sessionToken)) {
    throw new HTTPException(401, { message: 'session 无效或已过期' })
  }

  const url = new URL(request.url)
  const server = url.searchParams.get('server')
  const type = url.searchParams.get('type')
  const id = url.searchParams.get('id')

  if (!server || !type || !id) {
    throw new HTTPException(400, { message: '缺少必要参数 server/type/id' })
  }

  if (!['netease', 'tencent', 'kugou', 'baidu', 'kuwo'].includes(server)) {
    throw new HTTPException(400, { message: 'server 参数不合法' })
  }

  const token = createHmac('sha1', config.meting.token).update(`${server}${type}${id}`).digest('hex')
  return Response.json({ token })
}