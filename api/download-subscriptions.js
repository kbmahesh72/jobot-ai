import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const csvPath = path.join('/tmp', 'jobot-ai-data', 'subscriptions.csv')

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    return response.status(405).json({ message: 'Method not allowed.' })
  }

  if (!existsSync(csvPath)) {
    return response.status(404).json({ message: 'No subscriptions CSV found yet.' })
  }

  const csv = await readFile(csvPath, 'utf8')
  response.setHeader('Content-Type', 'text/csv; charset=utf-8')
  response.setHeader('Content-Disposition', 'attachment; filename="subscriptions.csv"')
  return response.status(200).send(csv)
}
