import { readPassword } from '../utils/password.js'
import { createSession } from '../utils/session.js'

export default async (request) => {
  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ success: false, message: '请求体格式错误' }, { status: 400 })
  }

  const inputPassword = body.password
  if (!inputPassword || typeof inputPassword !== 'string') {
    return Response.json({ success: false, message: '请输入密码' }, { status: 400 })
  }

  const storedPassword = await readPassword()
  if (!storedPassword) {
    return Response.json({ success: false, message: '服务器未配置密码' }, { status: 500 })
  }

  if (inputPassword.trim() !== storedPassword) {
    return Response.json({ success: false, message: '密码错误' }, { status: 401 })
  }

  const sessionToken = createSession()
  return Response.json({ success: true, sessionToken })
}