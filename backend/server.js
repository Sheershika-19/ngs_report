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
  // Input file(s) must come before -o / --outdir; otherwise FastQC treats the output path as a sequence file.
  const args = [
    `-Xmx${mem}`,
    '-classpath',
    classpath,
    'uk.ac.babraham.FastQC.FastQCApplication',
    inputPath,
    '-o',
    outDir,
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

/** Escape a string for safe use inside a single-quoted bash literal. */
function bashSingleQuote(s) {
  return "'" + String(s).replace(/'/g, "'\\''") + "'"
}

/**
 * Bash word for paths or a single command token. Tilde must not be single-quoted — it will not
 * expand (e.g. '~/bwa/bwa' is wrong; use "$HOME/bwa/bwa").
 */
function bashWslWord(s) {
  const v = String(s).trim()
  if (v === '~') {
    return '"$HOME"'
  }
  if (v.startsWith('~/')) {
    const rest = v.slice(2)
    if (/[\r\n\0]/.test(rest)) {
      throw new Error('Path contains invalid characters')
    }
    const escaped = rest
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\$/g, '\\$')
      .replace(/`/g, '\\`')
    return `"$HOME/${escaped}"`
  }
  return bashSingleQuote(v)
}

/** Reject paths that could break out of quoting or inject commands. */
function assertSafePath(label, p) {
  const v = String(p ?? '').trim()
  if (!v) {
    const err = new Error(`${label} is required`)
    err.status = 400
    throw err
  }
  if (/[\r\n\0]/.test(v)) {
    const err = new Error(`${label} contains invalid characters`)
    err.status = 400
    throw err
  }
  if (/[;`$]/.test(v) || /&&|\|\||\(|\)/.test(v)) {
    const err = new Error(`${label} must not contain shell metacharacters (; $ & | \` ( ) && ||)`)
    err.status = 400
    throw err
  }
  return v
}

/** BWA executable token only (e.g. bwa, ./bwa, /opt/bwa/bwa). */
function assertSafeBwaCmd(cmd) {
  const v = String(cmd ?? '').trim() || 'bwa'
  if (/\s/.test(v)) {
    const err = new Error('bwaCmd must be a single path or command name without spaces')
    err.status = 400
    throw err
  }
  if (/[;`$]/.test(v) || /&&|\|\||\(|\)/.test(v)) {
    const err = new Error('bwaCmd contains invalid characters')
    err.status = 400
    throw err
  }
  return v
}

/** HaplotypeCaller via `java -jar gatk-package-*-local.jar` (same Java as PICARD_JAVA / .env). */
function gatkHaplotypeCallerCommand(refPath, inputBam, outputVcf, reqBody) {
  const w = bashWslWord
  const jar =
    reqBody?.gatkJar?.trim() ||
    process.env.GATK_JAR?.trim() ||
    '~/gatk-4.5.0.0/gatk-package-4.5.0.0-local.jar'
  assertSafePath('gatkJar', jar)
  let jopts = ''
  if (process.env.GATK_JAVA_OPTS !== undefined) {
    jopts = process.env.GATK_JAVA_OPTS.trim()
  }
  if (jopts && /[\r\n;`$&|<>]/.test(jopts)) {
    const err = new Error('GATK_JAVA_OPTS contains invalid characters')
    err.status = 400
    throw err
  }
  const javaBin = picardJavaExecutable()
  const optsPart = jopts ? `${jopts} ` : ''
  return `${javaBin} ${optsPart}-jar ${w(jar)} HaplotypeCaller -R ${w(refPath)} -I ${w(inputBam)} -O ${w(outputVcf)}`
}

/** Picard launcher token — same rules as a bare command name (like `samtools` in this file). */
function assertSafePicardCmd(cmd) {
  const v = String(cmd ?? '').trim() || 'picard'
  if (/\s/.test(v)) {
    const err = new Error('picardCmd must be a single path or command name without spaces')
    err.status = 400
    throw err
  }
  if (/[;`$]/.test(v) || /&&|\|\||\(|\)/.test(v)) {
    const err = new Error('picardCmd contains invalid characters')
    err.status = 400
    throw err
  }
  return v
}

/**
 * Linux Picard launcher path. Default is /usr/bin/picard (not bare `picard`): on WSL, PATH often
 * finds Windows `picard.exe` (MusicBrainz music tagger) first — wrong binary, wrong GUI.
 * Override with PICARD_CMD or use PICARD_JAR + java -jar (see picardMarkDuplicatesCommand).
 */
function picardExecutable() {
  const raw = process.env.PICARD_CMD?.trim()
  if (raw) {
    try {
      return assertSafePicardCmd(raw)
    } catch {
      return '/usr/bin/picard'
    }
  }
  return '/usr/bin/picard'
}

/** Full path to java for Picard jar mode (same token rules as PICARD_CMD). */
function assertSafeJavaBin(cmd) {
  const v = String(cmd ?? '').trim() || 'java'
  if (/\s/.test(v)) {
    const err = new Error('PICARD_JAVA must be a single path without spaces')
    err.status = 400
    throw err
  }
  if (/[;`$]/.test(v) || /&&|\|\||\(|\)/.test(v)) {
    const err = new Error('PICARD_JAVA contains invalid characters')
    err.status = 400
    throw err
  }
  return v
}

function picardJavaExecutable() {
  const raw = process.env.PICARD_JAVA?.trim()
  if (!raw) return 'java'
  try {
    return assertSafeJavaBin(raw)
  } catch {
    return 'java'
  }
}

/**
 * When PICARD_JAR is set: `${PICARD_JAVA} [PICARD_JAVA_OPTS] -jar jar MarkDuplicates …`
 * Matches e.g. `/usr/lib/jvm/java-17-openjdk-amd64/bin/java -jar ~/picard.jar MarkDuplicates I=…`
 */
function picardMarkDuplicatesCommand(inputBam, outputBam, metricsPath) {
  const w = bashWslWord
  const jar = process.env.PICARD_JAR?.trim()
  if (jar) {
    assertSafePath('PICARD_JAR', jar)
    let jopts = ''
    if (process.env.PICARD_JAVA_OPTS === undefined) {
      jopts = ''
    } else {
      jopts = process.env.PICARD_JAVA_OPTS.trim()
    }
    if (jopts && /[\r\n;`$&|<>]/.test(jopts)) {
      const err = new Error('PICARD_JAVA_OPTS contains invalid characters')
      err.status = 400
      throw err
    }
    const javaBin = picardJavaExecutable()
    const optsPart = jopts ? `${jopts} ` : ''
    return `${javaBin} ${optsPart}-jar ${w(jar)} MarkDuplicates I=${w(inputBam)} O=${w(outputBam)} M=${w(metricsPath)}`
  }
  const picardBin = picardExecutable()
  return `${picardBin} MarkDuplicates I=${w(inputBam)} O=${w(outputBam)} M=${w(metricsPath)}`
}

function useWslForAlignment() {
  if (process.env.ALIGN_USE_WSL === '0' || process.env.ALIGN_USE_WSL === 'false') {
    return false
  }
  return process.platform === 'win32'
}

/**
 * Optional lines run before `set -euo pipefail` (e.g. Conda init if interactive .bashrc is not enough).
 * Set ALIGN_WSL_PROLOGUE in backend/.env — runs inside the same bash as BWA/samtools.
 */
function alignmentPrologue() {
  const p = process.env.ALIGN_WSL_PROLOGUE?.trim()
  return p || ''
}

function wrapWithPrologue(shellBody) {
  const pro = alignmentPrologue()
  if (pro) {
    return `${pro}
set -euo pipefail
${shellBody}`
  }
  return `set -euo pipefail
${shellBody}`
}

/**
 * Bash must be interactive + login so Ubuntu/WSL .bashrc runs past the non-interactive guard;
 * otherwise conda init never runs and `bwa` / `samtools` are missing from PATH.
 * See: https://github.com/conda/conda/issues/8169
 */
function bashInvocationArgs(script) {
  // -i = interactive (sources full .bashrc including conda), -l = login shell
  return ['bash', '-ilc', script]
}

/**
 * Run a bash script. On Windows, runs inside WSL so bwa/samtools match your WSL install.
 */
function runBashScript(script) {
  const wsl = useWslForAlignment()
  const argv = bashInvocationArgs(script)

  return new Promise((resolve, reject) => {
    const proc = wsl
      ? spawn('wsl.exe', argv, { windowsHide: true })
      : spawn(argv[0], argv.slice(1), { windowsHide: true })
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
      if (code === 0) resolve({ stdout, stderr, exitCode: 0 })
      else {
        const msg = [stderr, stdout].filter(Boolean).join('\n') || `exit ${code}`
        const err = new Error(msg)
        err.exitCode = code
        reject(err)
      }
    })
  })
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.post('/api/alignment/run', async (req, res) => {
  try {
    const bwaCmd = assertSafeBwaCmd(req.body?.bwaCmd)
    const refPath = assertSafePath('refPath', req.body?.refPath)
    const fastqPath = assertSafePath('fastqPath', req.body?.fastqPath)
    const outBamPath = assertSafePath('outBamPath', req.body?.outBamPath)

    const w = bashWslWord
    const pipeline = `${w(bwaCmd)} mem ${w(refPath)} ${w(fastqPath)} | samtools view -Sb - | samtools sort -o ${w(outBamPath)}`
    const script = wrapWithPrologue(pipeline)

    const { stdout, stderr } = await runBashScript(script)
    res.json({ ok: true, stdout, stderr, exitCode: 0 })
  } catch (e) {
    if (e && typeof e.status === 'number') {
      return res.status(e.status).json({ error: e.message })
    }
    return res.status(500).json({
      error: 'Alignment command failed',
      detail: e instanceof Error ? e.message : String(e),
    })
  }
})

app.post('/api/alignment/index-bam', async (req, res) => {
  try {
    const bamPath = assertSafePath('bamPath', req.body?.bamPath)

    const w = bashWslWord
    const pipeline = `samtools index ${w(bamPath)}`
    const script = wrapWithPrologue(pipeline)

    const { stdout, stderr } = await runBashScript(script)
    res.json({ ok: true, stdout, stderr, exitCode: 0 })
  } catch (e) {
    if (e && typeof e.status === 'number') {
      return res.status(e.status).json({ error: e.message })
    }
    return res.status(500).json({
      error: 'samtools index failed',
      detail: e instanceof Error ? e.message : String(e),
    })
  }
})

app.post('/api/post-alignment/mark-duplicates', async (req, res) => {
  try {
    const inputBam = assertSafePath('inputBam', req.body?.inputBam)
    const outputBam = assertSafePath('outputBam', req.body?.outputBam)
    const metricsPath = assertSafePath('metricsPath', req.body?.metricsPath)

    const pipeline = picardMarkDuplicatesCommand(inputBam, outputBam, metricsPath)
    const script = wrapWithPrologue(pipeline)

    const { stdout, stderr } = await runBashScript(script)
    res.json({ ok: true, stdout, stderr, exitCode: 0 })
  } catch (e) {
    if (e && typeof e.status === 'number') {
      return res.status(e.status).json({ error: e.message })
    }
    return res.status(500).json({
      error: 'Picard MarkDuplicates failed',
      detail: e instanceof Error ? e.message : String(e),
    })
  }
})

app.post('/api/variant-calling/haplotype-caller', async (req, res) => {
  try {
    const refPath = assertSafePath('refPath', req.body?.refPath)
    const inputBam = assertSafePath('inputBam', req.body?.inputBam)
    const outputVcf = assertSafePath('outputVcf', req.body?.outputVcf)

    const pipeline = gatkHaplotypeCallerCommand(refPath, inputBam, outputVcf, req.body)
    const script = wrapWithPrologue(pipeline)

    const { stdout, stderr } = await runBashScript(script)
    res.json({ ok: true, stdout, stderr, exitCode: 0 })
  } catch (e) {
    if (e && typeof e.status === 'number') {
      return res.status(e.status).json({ error: e.message })
    }
    return res.status(500).json({
      error: 'GATK HaplotypeCaller failed',
      detail: e instanceof Error ? e.message : String(e),
    })
  }
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
  if (useWslForAlignment()) {
    console.log(
      'Alignment / post-alignment: WSL uses bash -ilc so ~/.bashrc PATH applies. Set ALIGN_WSL_PROLOGUE in .env if tools are missing.',
    )
  }
})
