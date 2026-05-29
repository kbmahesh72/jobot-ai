import { get, list } from '@vercel/blob'
import { Buffer } from 'node:buffer'
import process from 'node:process'

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    return response.status(405).json({ message: 'Method not allowed.' })
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return response.status(500).json({ message: 'Vercel Blob storage is not configured.' })
  }

  const requestedFile = String(request.query.file ?? '').replace(/^\/+/, '')
  if (!requestedFile || requestedFile.includes('..')) {
    return response.status(400).json({ message: 'Missing resume file name.' })
  }

  const { blobs } = await list({ prefix: 'subscriptions/', limit: 1000 })
  const resume = blobs.find(
    (blob) =>
      blob.pathname === requestedFile ||
      blob.pathname.endsWith(`/${requestedFile}`) ||
      blob.pathname.endsWith(`/${requestedFile.split('/').pop()}`),
  )

  if (!resume) {
    return response.status(404).json({ message: 'Resume not found.' })
  }

  const result = await get(resume.pathname, { access: 'private' })
  if (!result || result.statusCode !== 200) {
    return response.status(404).json({ message: 'Resume not found.' })
  }

  const file = Buffer.from(await new Response(result.stream).arrayBuffer())
  const fileName = resume.pathname.split('/').pop() ?? 'resume'
  response.setHeader('Content-Type', result.blob.contentType || 'application/octet-stream')
  response.setHeader('Content-Disposition', `attachment; filename="${fileName.replaceAll('"', '')}"`)
  return response.status(200).send(file)
}
