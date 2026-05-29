import { existsSync } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'

const resumeDir = path.join('/tmp', 'jobot-ai-data', 'resumes')

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    return response.status(405).json({ message: 'Method not allowed.' })
  }

  if (!existsSync(resumeDir)) {
    return response.status(200).json({ resumes: [] })
  }

  const fileNames = await readdir(resumeDir)
  const resumes = await Promise.all(
    fileNames.map(async (fileName) => {
      const filePath = path.join(resumeDir, fileName)
      const fileStat = await stat(filePath)
      return {
        fileName,
        size: fileStat.size,
        downloadUrl: `/api/download-resume?file=${encodeURIComponent(fileName)}`,
      }
    }),
  )

  return response.status(200).json({ resumes })
}
