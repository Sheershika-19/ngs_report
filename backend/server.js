import archiver from 'archiver'
import cors from 'cors'
import { spawn } from 'child_process'
import dotenv from 'dotenv'
import express from 'express'
import fs from 'fs'
import fsPromises from 'fs/promises'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '.env') })

const app = express()
const PORT = Number(process.env.PORT) || 8787

app.use(cors({ origin: true }))
app.use(express.json({ limit: '1mb' }))

function javaExecutable() {
  if (process.env.JAVA_HOME) {
    const bin = path.join(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java')
    if (fs.existsSync(bin)) return bin
  }
  return 'java'
}

/** Classpath relative to FASTQC project root (cwd for the JVM), or full FASTQC_CLASSPATH. */
function buildClasspath(fastqcDir) {
  if (process.env.FASTQC_CLASSPATH?.trim()) {
    return process.env.FASTQC_CLASSPATH.trim()
  }
  const sep = path.delimiter
  return ['bin', 'sam-1.103.jar', 'jbzip2-0.9.jar'].join(sep)
}

function runFastqc({ fastqcDir, inputPath, outDir }) {
  const cwd = path.resolve(fastqcDir)
  const classpath = buildClasspath(fastqcDir)
  const mem = process.env.FASTQC_JAVA_MEM || '250m'
  const args = [
    `-Xmx${mem}`,
    '-classpath',
    classpath,
    'uk.ac.babraham.FastQC.FastQCApplication',
    '-o',
    outDir,
    inputPath,
  ]

  return new Promise((resolve, reject) => {
    const proc = spawn(javaExecutable(), args, {
      cwd,
      windowsHide: true,
    })
    let stderr = ''
    let stdout = ''
    proc.stdout?.on('data', (d) => {
      stdout += d.toString()
    })
    proc.stderr?.on('data', (d) => {
      stderr += d.toString()
    })
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr })
      else {
        const msg = [stderr, stdout].filter(Boolean).join('\n') || `exit ${code}`
        reject(new Error(msg))
      }
    })
  })
}

function zipDirectoryToResponse(dirPath, res) {
  return new Promise((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 6 } })
    archive.on('error', reject)
    archive.on('warning', (err) => {
      if (err.code !== 'ENOENT') console.warn('archiver:', err)
    })
    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', 'attachment; filename="fastqc-results.zip"')
    archive.pipe(res)
    archive.directory(dirPath, false)
    archive.finalize().then(resolve).catch(reject)
  })
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.post('/api/qc/run', async (req, res) => {
  const fastqcDir = process.env.FASTQC_DIR?.trim()
  if (!fastqcDir) {
    return res.status(500).json({
      error:
        'Set environment variable FASTQC_DIR to the root of your cloned FastQC project (folder containing bin and jars).',
    })
  }

  let resolvedFastqc
  try {
    resolvedFastqc = path.resolve(fastqcDir)
    await fsPromises.access(resolvedFastqc, fs.constants.R_OK)
  } catch {
    return res.status(500).json({ error: `FASTQC_DIR is not readable: ${fastqcDir}` })
  }

  const inputPath = req.body?.inputPath?.trim()
  if (!inputPath) {
    return res.status(400).json({ error: 'inputPath is required (absolute path to .fastq, .fq.gz, or other FastQC-supported input).' })
  }

  let resolvedInput
  try {
    resolvedInput = path.resolve(inputPath)
    await fsPromises.access(resolvedInput, fs.constants.R_OK)
  } catch {
    return res.status(400).json({ error: `Input file not found or not readable: ${inputPath}` })
  }

  const outDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'fastqc-out-'))

  try {
    await runFastqc({
      fastqcDir: resolvedFastqc,
      inputPath: resolvedInput,
      outDir,
    })
  } catch (e) {
    await fsPromises.rm(outDir, { recursive: true, force: true }).catch(() => {})
    return res.status(500).json({
      error: 'FastQC failed',
      detail: e instanceof Error ? e.message : String(e),
    })
  }

  try {
    const entries = await fsPromises.readdir(outDir)
    if (entries.length === 0) {
      await fsPromises.rm(outDir, { recursive: true, force: true }).catch(() => {})
      return res.status(500).json({ error: 'FastQC produced no files in the output directory.' })
    }
  } catch {
    await fsPromises.rm(outDir, { recursive: true, force: true }).catch(() => {})
    return res.status(500).json({ error: 'Could not read FastQC output directory.' })
  }

  res.on('close', () => {
    fsPromises.rm(outDir, { recursive: true, force: true }).catch(() => {})
  })

  try {
    await zipDirectoryToResponse(outDir, res)
  } catch (e) {
    await fsPromises.rm(outDir, { recursive: true, force: true }).catch(() => {})
    if (!res.headersSent) {
      return res.status(500).json({
        error: 'Failed to zip results',
        detail: e instanceof Error ? e.message : String(e),
      })
    }
  }
})

app.listen(PORT, () => {
  console.log(`NGS API listening on http://localhost:${PORT}`)
  if (!process.env.FASTQC_DIR) {
    console.warn('Warning: FASTQC_DIR is not set. Quality control runs will fail until you set it.')
  }
})
