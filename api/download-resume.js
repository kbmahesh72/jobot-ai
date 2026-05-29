import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const resumeDir = path.join('/tmp', 'jobot-ai-data', 'resumes')

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    return response.status(405).json({ message: 'Method not allowed.' })
  }

  const fileName = path.basename(String(request.query.file ?? ''))
  if (!fileName) {
    return response.status(400).json({ message: 'Missing resume file name.' })
  }

  const filePath = path.join(resumeDir, fileName)
  if (!existsSync(filePath)) {
    return response.status(404).json({ message: 'Resume not found.' })
  }

  const file = await readFile(filePath)
  response.setHeader('Content-Type', contentTypeFor(fileName))
  response.setHeader('Content-Disposition', `attachment; filename="${fileName.replaceAll('"', '')}"`)
  return response.status(200).send(file)
}

function contentTypeFor(fileName) {
  const extension = path.extname(fileName).toLowerCase()
  if (extension === '.pdf') {
    return 'application/pdf'
  }
  if (extension === '.doc') {
    return 'application/msword'
  }
  if (extension === '.docx') {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  }
  return 'application/octet-stream'
}
