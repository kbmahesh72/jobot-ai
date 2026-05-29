import { put } from '@vercel/blob'
import { Buffer } from 'node:buffer'
import path from 'node:path'
import process from 'node:process'

const maxUploadSize = 8 * 1024 * 1024

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

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return response.status(405).json({ message: 'Method not allowed.' })
  }

  try {
    const body = await readRequestBody(request, maxUploadSize)
    const { fields, files } = parseMultipartFormData(body, request.headers['content-type'] ?? '')
    const payload = normalizePayload(fields)
    const missing = requiredFields().filter((field) => !payload[field])

    if (missing.length > 0) {
      return response.status(400).json({ message: `Missing required fields: ${missing.join(', ')}` })
    }
    if (payload.consent !== 'true') {
      return response.status(400).json({ message: 'Consent is required.' })
    }

    const resume = files.resume
    if (!resume) {
      return response.status(400).json({ message: 'Resume attachment is required.' })
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return response.status(500).json({
        message: 'Vercel Blob storage is not configured. Connect a Blob store to this project in Vercel.',
      })
    }

    const extension = path.extname(resume.fileName) || '.resume'
    const resumeFileName = `${emailFileStem(payload.email)}${extension.toLowerCase()}`
    const row = {
      createdAt: new Date().toISOString(),
      ...payload,
      resumeFileName,
    }
    const folderName = subscriptionFolderName(payload.email)
    const folderPath = `subscriptions/${folderName}/${timestampFolderName(row.createdAt)}`
    const csv = `${csvHeaders.join(',')}\n${csvHeaders.map((header) => csvValue(row[header])).join(',')}\n`
    const [jsonFile, csvFile, resumeFile] = await Promise.all([
      put(`${folderPath}/subscription.json`, JSON.stringify(row, null, 2), {
        access: 'private',
        addRandomSuffix: false,
        contentType: 'application/json; charset=UTF-8',
      }),
      put(`${folderPath}/subscription.csv`, csv, {
        access: 'private',
        addRandomSuffix: false,
        contentType: 'text/csv; charset=UTF-8',
      }),
      put(`${folderPath}/${resumeFileName}`, resume.content, {
        access: 'private',
        addRandomSuffix: false,
        contentType: resume.mimeType || contentTypeFor(resumeFileName),
      }),
    ])

    return response.status(200).json({
      message: 'Subscription saved successfully.',
      folderName,
      folderPath,
      resumeFileName,
      files: {
        formJson: jsonFile,
        formCsv: csvFile,
        resume: resumeFile,
      },
    })
  } catch (error) {
    console.error(error)
    return response.status(500).json({ message: 'Could not save subscription.' })
  }
}

async function readRequestBody(request, maxSize) {
  const chunks = []
  let size = 0

  for await (const chunk of request) {
    size += chunk.length
    if (size > maxSize) {
      throw new Error('Upload is too large.')
    }
    chunks.push(chunk)
  }

  return Buffer.concat(chunks)
}

function parseMultipartFormData(buffer, contentType) {
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/)
  const boundary = boundaryMatch?.[1] ?? boundaryMatch?.[2]
  if (!boundary) {
    throw new Error('Missing multipart boundary.')
  }

  const fields = {}
  const files = {}
  const boundaryBuffer = Buffer.from(`--${boundary}`)

  for (const rawPart of splitBuffer(buffer, boundaryBuffer)) {
    const part = trimPart(rawPart)
    if (part.length === 0 || part.equals(Buffer.from('--'))) {
      continue
    }

    const headerEnd = part.indexOf(Buffer.from('\r\n\r\n'))
    if (headerEnd < 0) {
      continue
    }

    const headerText = part.subarray(0, headerEnd).toString('utf8')
    const content = trimTrailingCrlf(part.subarray(headerEnd + 4))
    const disposition = headerText.match(/content-disposition:\s*form-data;([^\r\n]+)/i)?.[1] ?? ''
    const name = disposition.match(/name="([^"]+)"/)?.[1]
    const fileName = disposition.match(/filename="([^"]*)"/)?.[1]

    if (!name) {
      continue
    }

    if (fileName) {
      files[name] = { fileName, content, mimeType: contentTypeFromHeaders(headerText) }
    } else {
      fields[name] = content.toString('utf8')
    }
  }

  return { fields, files }
}

function splitBuffer(buffer, separator) {
  const parts = []
  let start = 0
  let index = buffer.indexOf(separator)

  while (index >= 0) {
    parts.push(buffer.subarray(start, index))
    start = index + separator.length
    index = buffer.indexOf(separator, start)
  }

  parts.push(buffer.subarray(start))
  return parts
}

function trimPart(buffer) {
  let start = 0
  let end = buffer.length
  while (start < end && (buffer[start] === 13 || buffer[start] === 10)) {
    start += 1
  }
  while (end > start && (buffer[end - 1] === 13 || buffer[end - 1] === 10)) {
    end -= 1
  }
  return buffer.subarray(start, end)
}

function trimTrailingCrlf(buffer) {
  if (buffer.length >= 2 && buffer[buffer.length - 2] === 13 && buffer[buffer.length - 1] === 10) {
    return buffer.subarray(0, buffer.length - 2)
  }
  return buffer
}

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

function csvValue(value) {
  const text = String(value ?? '')
  return `"${text.replaceAll('"', '""')}"`
}

function emailFileStem(email) {
  return email.toLowerCase().replace(/[^a-z0-9@._-]/g, '_')
}

function subscriptionFolderName(email) {
  return clean(email.split('@')[0]).replace(/[^a-z0-9._-]/gi, '_') || 'subscription'
}

function timestampFolderName(value) {
  return String(value).replace(/[^0-9a-z]/gi, '')
}

function contentTypeFromHeaders(headerText) {
  return headerText.match(/content-type:\s*([^\r\n]+)/i)?.[1]?.trim() ?? ''
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
