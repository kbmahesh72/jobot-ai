import express from 'express'
import multer from 'multer'
import { existsSync } from 'node:fs'
import { appendFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { recruiterWorkbookPayload } from './recruiterWorkbook.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const appRoot = path.resolve(__dirname, '..')
const projectRoot = path.resolve(appRoot, '..')
const automationOutputDir = path.join(projectRoot, 'automation-output')
const dataDir = process.env.VERCEL ? path.join('/tmp', 'jobot-ai-data') : path.join(appRoot, 'data')
const resumeDir = path.join(dataDir, 'resumes')
const csvPath = path.join(dataDir, 'subscriptions.csv')

const app = express()
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024,
  },
})

const csvHeaders = [
  'createdAt',
  'fullName',
  'email',
  'phone',
  'linkedinUrl',
  'targetRole',
  'location',
  'keyword',
  'jobType',
  'frequency',
  'subject',
  'subjectVariants',
  'body',
  'signature',
  'resumeFileName',
  'consent',
]

app.post('/api/subscriptions', upload.single('resume'), async (request, response) => {
  try {
    await mkdir(resumeDir, { recursive: true })

    const payload = normalizePayload(request.body)
    const missing = requiredFields().filter((field) => !payload[field])
    if (missing.length > 0) {
      return response.status(400).json({ message: `Missing required fields: ${missing.join(', ')}` })
    }
    if (payload.consent !== 'true') {
      return response.status(400).json({ message: 'Consent is required.' })
    }
    if (!request.file) {
      return response.status(400).json({ message: 'Resume attachment is required.' })
    }

    const extension = path.extname(request.file.originalname) || '.resume'
    const resumeFileName = `${emailFileStem(payload.email)}${extension.toLowerCase()}`
    await writeFile(path.join(resumeDir, resumeFileName), request.file.buffer)

    const row = {
      createdAt: new Date().toISOString(),
      ...payload,
      resumeFileName,
    }

    await ensureCsv()
    await appendFile(csvPath, `${csvHeaders.map((header) => csvValue(row[header])).join(',')}\n`, 'utf8')

    response.json({
      message: 'Subscription saved successfully.',
      csvPath,
      resumeFileName,
    })
  } catch (error) {
    console.error(error)
    response.status(500).json({ message: 'Could not save subscription.' })
  }
})

app.get('/api/todays-recruiters', async (request, response) => {
  try {
    response.json(await recruiterWorkbookPayload(appRoot, automationOutputDir))
  } catch (error) {
    console.error(error)
    response.status(500).json({ message: 'Could not read today recruiter emails.' })
  }
})

const port = Number(process.env.PORT || 4174)
app.listen(port, '127.0.0.1', () => {
  console.log(`Subscription API listening on http://127.0.0.1:${port}`)
})

function normalizePayload(body) {
  return {
    fullName: clean(body.fullName),
    email: clean(body.email).toLowerCase(),
    phone: clean(body.phone),
    linkedinUrl: clean(body.linkedinUrl),
    targetRole: clean(body.targetRole),
    location: clean(body.location),
    keyword: clean(body.keyword),
    jobType: clean(body.jobType),
    frequency: clean(body.frequency),
    subject: clean(body.subject),
    subjectVariants: clean(body.subjectVariants),
    body: clean(body.body),
    signature: clean(body.signature),
    consent: clean(body.consent) === 'true' ? 'true' : 'false',
  }
}

function clean(value) {
  return String(value ?? '').trim()
}

function requiredFields() {
  return [
    'fullName',
    'email',
    'phone',
    'linkedinUrl',
    'targetRole',
    'location',
    'keyword',
    'jobType',
    'frequency',
    'subject',
    'subjectVariants',
    'body',
    'signature',
  ]
}

async function ensureCsv() {
  await mkdir(dataDir, { recursive: true })
  if (!existsSync(csvPath)) {
    await writeFile(csvPath, `${csvHeaders.join(',')}\n`, 'utf8')
  }
}

function csvValue(value) {
  const text = String(value ?? '')
  return `"${text.replaceAll('"', '""')}"`
}

function emailFileStem(email) {
  return email.toLowerCase().replace(/[^a-z0-9@._-]/g, '_')
}
