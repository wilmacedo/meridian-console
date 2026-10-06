import { createHash, createHmac } from 'node:crypto'

export interface TuyaResponse<T = unknown> {
  success: boolean
  code?: number
  msg?: string
  result?: T
}

const requireEnv = (name: string): string => {
  const value = process.env[name]
  if (!value) throw new Error(`missing env var ${name}`)
  return value
}

export async function tuya<T = unknown>(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
  token = '',
): Promise<TuyaResponse<T>> {
  const accessId = requireEnv('TUYA_ACCESS_ID')
  const secret = requireEnv('TUYA_ACCESS_SECRET')
  const timestamp = Date.now().toString()
  const payload = body ? JSON.stringify(body) : ''
  const stringToSign = [method, createHash('sha256').update(payload).digest('hex'), '', path].join('\n')
  const sign = createHmac('sha256', secret)
    .update(accessId + token + timestamp + stringToSign)
    .digest('hex')
    .toUpperCase()

  const res = await fetch(requireEnv('TUYA_API_ENDPOINT') + path, {
    method,
    headers: {
      client_id: accessId,
      sign,
      t: timestamp,
      sign_method: 'HMAC-SHA256',
      ...(token && { access_token: token }),
      'Content-Type': 'application/json',
    },
    body: payload || undefined,
  })
  return (await res.json()) as TuyaResponse<T>
}

const TOKEN_EXPIRY_MARGIN_MS = 60_000

let cachedToken: { value: string; expiresAt: number } | undefined

export async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.value

  const res = await tuya<{ access_token: string; expire_time: number }>('GET', '/v1.0/token?grant_type=1')
  if (!res.success || !res.result) throw new Error(`token failed: code=${res.code} msg=${res.msg}`)

  cachedToken = {
    value: res.result.access_token,
    expiresAt: Date.now() + res.result.expire_time * 1000 - TOKEN_EXPIRY_MARGIN_MS,
  }
  return cachedToken.value
}
