import { get, list } from '@vercel/blob'
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
  const csvBlobs = blobs.filter((blob) => blob.pathname.endsWith('/subscription.csv'))

  if (csvBlobs.length === 0) {
    return response.status(404).json({ message: 'No subscription CSV files found yet.' })
  }

  const csvFiles = await Promise.all(csvBlobs.map((blob) => readPrivateBlobText(blob.pathname)))
  const [header = ''] = csvFiles[0].split(/\r?\n/)
  const rows = csvFiles.flatMap((csv) => csv.split(/\r?\n/).slice(1).filter(Boolean))
  const combinedCsv = `${header}\n${rows.join('\n')}\n`

  response.setHeader('Content-Type', 'text/csv; charset=utf-8')
  response.setHeader('Content-Disposition', 'attachment; filename="subscriptions.csv"')
  return response.status(200).send(combinedCsv)
}

async function readPrivateBlobText(pathname) {
  const result = await get(pathname, { access: 'private' })
  if (!result || result.statusCode !== 200) {
    return ''
  }

  return new Response(result.stream).text()
}
