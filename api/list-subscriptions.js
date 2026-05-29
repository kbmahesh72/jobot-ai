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

  const { blobs } = await list({ prefix: 'subscriptions/', limit: 1000 })
  const subscriptions = blobs
    .filter((blob) => blob.pathname.endsWith('/subscription.json') || blob.pathname.endsWith('/subscription.csv'))
    .map((blob) => ({
      path: blob.pathname,
      subscriber: blob.pathname.split('/')[1] ?? '',
      fileName: blob.pathname.split('/').pop(),
      size: blob.size,
      uploadedAt: blob.uploadedAt,
      downloadUrl:
        blob.pathname.endsWith('/subscription.csv') ? '/api/download-subscriptions' : undefined,
    }))

  return response.status(200).json({ subscriptions })
}
