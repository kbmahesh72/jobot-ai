import path from 'node:path'
import process from 'node:process'
import { recruiterWorkbookPayload } from '../server/recruiterWorkbook.js'

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    return response.status(405).json({ message: 'Method not allowed.' })
  }

  try {
    const appRoot = process.cwd()
    const automationOutputDir = path.join(path.resolve(appRoot, '..'), 'automation-output')
    return response.status(200).json(await recruiterWorkbookPayload(appRoot, automationOutputDir))
  } catch (error) {
    console.error(error)
    return response.status(500).json({ message: 'Could not read today recruiter emails.' })
  }
}
