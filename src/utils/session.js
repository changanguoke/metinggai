const sessions = new Map()
const SESSION_TTL = 1000 * 60 * 30 // 30分钟

setInterval(() => {
  const now = Date.now()
  for (const [token, data] of sessions) {
    if (now - data.createdAt > SESSION_TTL) {
      sessions.delete(token)
    }
  }
}, 60000)

export function createSession () {
  const token = crypto.randomUUID()
  sessions.set(token, { createdAt: Date.now() })
  return token
}

export function validateSession (token) {
  if (!token || !sessions.has(token)) return false
  const data = sessions.get(token)
  if (Date.now() - data.createdAt > SESSION_TTL) {
    sessions.delete(token)
    return false
  }
  return true
}

export function destroySession (token) {
  sessions.delete(token)
}
