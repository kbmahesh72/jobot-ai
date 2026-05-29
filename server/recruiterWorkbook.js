import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

export const recruiterEmailTextFile = 'recruiter-emails.txt'

export async function recruiterWorkbookPayload(appRoot, automationOutputDir) {
  const localTextPath = path.join(appRoot, recruiterEmailTextFile)
  const automationTextPath = path.join(automationOutputDir, recruiterEmailTextFile)
  const emailTextPath = existsSync(localTextPath) ? localTextPath : automationTextPath

  if (!existsSync(emailTextPath)) {
    return {
      date: '20260528',
      source: recruiterEmailTextFile,
      emailTextPath,
      recruiters: [],
    }
  }

  return {
    date: '20260528',
    source: recruiterEmailTextFile,
    emailTextPath,
    recruiters: await readRecruitersFromText(emailTextPath),
  }
}

async function readRecruitersFromText(emailTextPath) {
  const text = await readFile(emailTextPath, 'utf8')
  const seen = new Set()

  return text
    .split(/\r?\n/)
    .map((line) => line.trim().toLowerCase())
    .filter((email) => {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || seen.has(email)) {
        return false
      }
      seen.add(email)
      return true
    })
    .map((email) => ({ email }))
}
