import { Buffer } from 'node:buffer'
import crypto from 'node:crypto'
import process from 'node:process'

const driveApiBase = 'https://www.googleapis.com/drive/v3'
const driveUploadBase = 'https://www.googleapis.com/upload/drive/v3'
const tokenUrl = 'https://oauth2.googleapis.com/token'
const driveScope = 'https://www.googleapis.com/auth/drive'

let cachedToken = null

export function googleDriveConfigured() {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
      process.env.GOOGLE_PRIVATE_KEY &&
      process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID,
  )
}

export async function createSubscriptionFolder(folderName) {
  return driveRequest('/files', {
    method: 'POST',
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID],
    }),
  })
}

export async function uploadDriveFile({ folderId, fileName, content, mimeType }) {
  const boundary = `jobot_${crypto.randomUUID()}`
  const metadata = Buffer.from(
    [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      JSON.stringify({
        name: fileName,
        parents: [folderId],
      }),
      `--${boundary}`,
      `Content-Type: ${mimeType}`,
      '',
      '',
    ].join('\r\n'),
    'utf8',
  )
  const closing = Buffer.from(`\r\n--${boundary}--`, 'utf8')
  const fileContent = Buffer.isBuffer(content) ? content : Buffer.from(String(content), 'utf8')

  return driveRequest('/files?uploadType=multipart&fields=id,name,webViewLink,webContentLink', {
    baseUrl: driveUploadBase,
    method: 'POST',
    headers: {
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: Buffer.concat([metadata, fileContent, closing]),
  })
}

async function driveRequest(endpoint, options = {}) {
  const accessToken = await getGoogleAccessToken()
  const response = await fetch(`${options.baseUrl ?? driveApiBase}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
      ...(options.headers ?? {}),
    },
  })

  const text = await response.text()
  const payload = text ? JSON.parse(text) : {}

  if (!response.ok) {
    throw new Error(payload.error?.message || payload.message || 'Google Drive request failed.')
  }

  return payload
}

async function getGoogleAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60000) {
    return cachedToken.accessToken
  }

  const now = Math.floor(Date.now() / 1000)
  const assertion = signJwt({
    iss: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    scope: driveScope,
    aud: tokenUrl,
    exp: now + 3600,
    iat: now,
  })

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })
  const payload = await response.json()

  if (!response.ok) {
    throw new Error(payload.error_description || payload.error || 'Could not authenticate with Google Drive.')
  }

  cachedToken = {
    accessToken: payload.access_token,
    expiresAt: Date.now() + Number(payload.expires_in ?? 3600) * 1000,
  }

  return cachedToken.accessToken
}

function signJwt(claimSet) {
  const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = base64UrlEncode(JSON.stringify(claimSet))
  const unsignedToken = `${header}.${claims}`
  const privateKey = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
  const signature = crypto.createSign('RSA-SHA256').update(unsignedToken).sign(privateKey)

  return `${unsignedToken}.${base64UrlEncode(signature)}`
}

function base64UrlEncode(value) {
  return Buffer.from(value)
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
}
