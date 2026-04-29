import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildProfileRecord, summarizeProfileRecord } from './profileRecord.js'
import { buildApprovalRequest, summarizeApprovalRequest, updateApprovalRequestStatus } from './approvalRequest.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const DEFAULT_FILE_STORAGE_DIR = path.resolve(__dirname, '../../data/agentic-profiles')

function ensureDirectory(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true })
}

function safeSlug(slug = '') {
  return String(slug).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
}

function recordPath(dataDir, slug) {
  const filename = safeSlug(slug)
  if (!filename) {
    throw new Error('profile slug is required for file storage')
  }
  return path.join(dataDir, `${filename}.json`)
}

function approvalsDir(dataDir) {
  return path.join(dataDir, 'approvals')
}

function approvalPath(dataDir, id) {
  const filename = safeSlug(id)
  if (!filename) {
    throw new Error('approval id is required for file storage')
  }
  return path.join(approvalsDir(dataDir), `${filename}.json`)
}

function readRecord(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (err) {
    if (err?.code === 'ENOENT') return null
    throw err
  }
}

function writeRecord(filePath, record) {
  const tempPath = `${filePath}.tmp`
  fs.writeFileSync(tempPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8')
  fs.renameSync(tempPath, filePath)
}

export function createFileAgenticStore(options = {}) {
  const dataDir = path.resolve(options.dataDir || DEFAULT_FILE_STORAGE_DIR)

  return {
    type: 'file',
    dataDir,

    saveProfile(input) {
      ensureDirectory(dataDir)
      const filePath = recordPath(dataDir, input.slug)
      const existing = readRecord(filePath)
      const record = buildProfileRecord(input, existing)
      writeRecord(filePath, record)
      return record
    },

    getProfile(slug) {
      const filePath = recordPath(dataDir, slug)
      return readRecord(filePath)
    },

    listProfiles() {
      ensureDirectory(dataDir)
      return fs.readdirSync(dataDir)
        .filter(filename => filename.endsWith('.json'))
        .map(filename => readRecord(path.join(dataDir, filename)))
        .filter(Boolean)
        .map(summarizeProfileRecord)
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    },

    clearProfiles() {
      ensureDirectory(dataDir)
      for (const filename of fs.readdirSync(dataDir)) {
        if (filename.endsWith('.json')) {
          fs.unlinkSync(path.join(dataDir, filename))
        }
      }
    },

    createApprovalRequest(input) {
      ensureDirectory(approvalsDir(dataDir))
      const approval = buildApprovalRequest(input)
      writeRecord(approvalPath(dataDir, approval.id), approval)
      return approval
    },

    getApprovalRequest(id) {
      return readRecord(approvalPath(dataDir, id))
    },

    listApprovalRequests(filters = {}) {
      ensureDirectory(approvalsDir(dataDir))
      return fs.readdirSync(approvalsDir(dataDir))
        .filter(filename => filename.endsWith('.json'))
        .map(filename => readRecord(path.join(approvalsDir(dataDir), filename)))
        .filter(Boolean)
        .filter(approval => !filters.status || approval.status === filters.status)
        .map(summarizeApprovalRequest)
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    },

    updateApprovalRequest(id, updates = {}) {
      ensureDirectory(approvalsDir(dataDir))
      const filePath = approvalPath(dataDir, id)
      const existing = readRecord(filePath)
      if (!existing) return null
      const approval = buildApprovalRequest({ ...existing, ...updates }, existing)
      writeRecord(filePath, approval)
      return approval
    },

    updateApprovalRequestStatus(id, status, options = {}) {
      ensureDirectory(approvalsDir(dataDir))
      const filePath = approvalPath(dataDir, id)
      const existing = readRecord(filePath)
      if (!existing) return null
      const approval = updateApprovalRequestStatus(existing, status, options)
      writeRecord(filePath, approval)
      return approval
    },

    clearApprovalRequests() {
      ensureDirectory(approvalsDir(dataDir))
      for (const filename of fs.readdirSync(approvalsDir(dataDir))) {
        if (filename.endsWith('.json')) {
          fs.unlinkSync(path.join(approvalsDir(dataDir), filename))
        }
      }
    },

    getStorageInfo() {
      return {
        type: 'file',
        path: dataDir,
        warning: 'Local JSON file storage is intended for development and single-process deployments.',
      }
    },
  }
}
