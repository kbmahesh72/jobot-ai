import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { inflateRawSync } from 'node:zlib'

export const recruiterPreviewWorkbook = '20260528.xlsx'

export async function recruiterWorkbookPayload(appRoot, automationOutputDir) {
  const localWorkbookPath = path.join(appRoot, recruiterPreviewWorkbook)
  const automationWorkbookPath = path.join(automationOutputDir, recruiterPreviewWorkbook)
  const workbookPath = existsSync(localWorkbookPath) ? localWorkbookPath : automationWorkbookPath
  const date = path.basename(recruiterPreviewWorkbook, '.xlsx')

  if (!existsSync(workbookPath)) {
    return {
      date,
      workbookPath,
      recruiters: [],
    }
  }

  return {
    date,
    workbookPath,
    recruiters: await readRecruitersFromWorkbook(workbookPath),
  }
}

async function readRecruitersFromWorkbook(workbookPath) {
  const zipEntries = readZipEntries(await readFile(workbookPath))
  const sharedStrings = readSharedStrings(zipEntries.get('xl/sharedStrings.xml')?.toString('utf8') ?? '')
  const sheetXml = zipEntries.get('xl/worksheets/sheet1.xml')?.toString('utf8') ?? ''
  const rows = readWorksheetRows(sheetXml, sharedStrings)
  if (rows.length < 2) {
    return []
  }

  const headers = rows[0].map((value) => value.toLowerCase())
  const emailIndex = headers.indexOf('email')
  const timestampIndex = headers.indexOf('timestamp')
  if (emailIndex < 0) {
    return []
  }

  return rows
    .slice(1)
    .map((row) => ({
      email: clean(row[emailIndex]),
      timestamp: timestampIndex >= 0 ? clean(row[timestampIndex]) : '',
    }))
    .filter((item) => item.email)
}

function clean(value) {
  return String(value ?? '').trim()
}

function readZipEntries(buffer) {
  const entries = new Map()
  const endOffset = findEndOfCentralDirectory(buffer)
  if (endOffset < 0) {
    return entries
  }

  const entryCount = buffer.readUInt16LE(endOffset + 10)
  const centralDirectoryOffset = buffer.readUInt32LE(endOffset + 16)
  let offset = centralDirectoryOffset
  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      break
    }
    const compressionMethod = buffer.readUInt16LE(offset + 10)
    const compressedSize = buffer.readUInt32LE(offset + 20)
    const fileNameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    const localHeaderOffset = buffer.readUInt32LE(offset + 42)
    const fileName = buffer.toString('utf8', offset + 46, offset + 46 + fileNameLength)
    const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26)
    const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28)
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength
    const data = buffer.subarray(dataStart, dataStart + compressedSize)

    if (compressionMethod === 0) {
      entries.set(fileName, data)
    } else if (compressionMethod === 8) {
      entries.set(fileName, inflateRawSync(data))
    }

    offset += 46 + fileNameLength + extraLength + commentLength
  }
  return entries
}

function findEndOfCentralDirectory(buffer) {
  for (let offset = buffer.length - 22; offset >= 0; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      return offset
    }
  }
  return -1
}

function readSharedStrings(xml) {
  return [...xml.matchAll(/<si[^>]*>([\s\S]*?)<\/si>/g)].map((match) =>
    decodeXml([...match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((textMatch) => textMatch[1]).join('')),
  )
}

function readWorksheetRows(xml, sharedStrings) {
  return [...xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((rowMatch) => {
    const row = []
    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attributes = cellMatch[1]
      const body = cellMatch[2]
      const columnIndex = columnIndexFromRef((attributes.match(/\br="([A-Z]+)\d+"/)?.[1] ?? 'A'))
      row[columnIndex] = readCellValue(attributes, body, sharedStrings)
    }
    return row.map((value) => value ?? '')
  })
}

function readCellValue(attributes, body, sharedStrings) {
  const type = attributes.match(/\bt="([^"]+)"/)?.[1] ?? ''
  if (type === 'inlineStr') {
    return decodeXml([...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((match) => match[1]).join(''))
  }
  const rawValue = body.match(/<v[^>]*>([\s\S]*?)<\/v>/)?.[1] ?? ''
  if (type === 's') {
    return sharedStrings[Number(rawValue)] ?? ''
  }
  return decodeXml(rawValue)
}

function columnIndexFromRef(ref) {
  return [...ref].reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1
}

function decodeXml(value) {
  return String(value ?? '')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&')
}
