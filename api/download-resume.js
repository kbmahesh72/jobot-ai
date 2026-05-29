import { list } from '@vercel/blob'
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

  response.setHeader('Location', resume.url)
  return response.status(302).end()
}
