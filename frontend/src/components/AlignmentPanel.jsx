import { useCallback, useMemo, useState } from 'react'

/** Matches a typical WSL home layout: cloned bwa build under ~/bwa/bwa */
const defaultBwa = '~/bwa/bwa'

function copyToClipboard(text, setCopied) {
  navigator.clipboard.writeText(text).then(() => {
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  })
}

export function AlignmentPanel() {
  const [bwaCmd, setBwaCmd] = useState(defaultBwa)
  const [refPath, setRefPath] = useState('')
  const [fastqPath, setFastqPath] = useState('')
  const [outBam, setOutBam] = useState('')
  const [indexBamPath, setIndexBamPath] = useState('')

  const [alignLoading, setAlignLoading] = useState(false)
  const [alignError, setAlignError] = useState(null)
  const [alignLog, setAlignLog] = useState('')

  const [indexLoading, setIndexLoading] = useState(false)
  const [indexError, setIndexError] = useState(null)
  const [indexLog, setIndexLog] = useState('')

  const [copied, setCopied] = useState(false)

  const indexRefCmd = useMemo(() => {
    const ref = refPath.trim()
    if (!ref) return `${bwaCmd.trim() || '~/bwa/bwa'} index ~/hg38.fa`
    return `${bwaCmd.trim()} index ${ref}`
  }, [bwaCmd, refPath])

  const generatedAlignment = useMemo(() => {
    const r = refPath.trim()
    const f = fastqPath.trim()
    const o = outBam.trim()
    const b = bwaCmd.trim() || 'bwa'
    if (!r || !f || !o) {
      return [
        `${b} mem ~/hg38.fa ~/cleaned.fastq \\`,
        '| samtools view -Sb - \\',
        '| samtools sort -o ~/aligned_sorted.bam',
      ].join('\n')
    }
    return [`${b} mem ${r} ${f} \\`, '| samtools view -Sb - \\', `| samtools sort -o ${o}`].join(
      '\n',
    )
  }, [bwaCmd, refPath, fastqPath, outBam])

  const indexBamCmd = useMemo(() => {
    const p = indexBamPath.trim() || outBam.trim()
    if (!p) return 'samtools index <path_to_aligned_sorted.bam>'
    return `samtools index ${p}`
  }, [indexBamPath, outBam])

  const runAlignment = useCallback(async () => {
    setAlignError(null)
    setAlignLog('')
    const ref = refPath.trim()
    const fq = fastqPath.trim()
    const out = outBam.trim()
    const bwa = bwaCmd.trim() || 'bwa'
    if (!ref || !fq || !out) {
      setAlignError('Fill in reference genome path, cleaned FASTQ path, and output BAM path.')
      return
    }
    setAlignLoading(true)
    try {
      const res = await fetch('/api/alignment/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bwaCmd: bwa,
          refPath: ref,
          fastqPath: fq,
          outBamPath: out,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(
          data.detail ? `${data.error || 'Error'}: ${data.detail}` : data.error || res.statusText,
        )
      }
      const parts = [data.stdout, data.stderr].filter(Boolean)
      setAlignLog(parts.join('\n') || 'Finished (no output on stdout/stderr).')
      setIndexBamPath((prev) => (prev.trim() ? prev : out))
    } catch (e) {
      setAlignError(e instanceof Error ? e.message : String(e))
    } finally {
      setAlignLoading(false)
    }
  }, [bwaCmd, refPath, fastqPath, outBam])

  const runIndexBam = useCallback(async () => {
    setIndexError(null)
    setIndexLog('')
    const bam = indexBamPath.trim() || outBam.trim()
    if (!bam) {
      setIndexError('Enter the path to the sorted BAM file (or fill output BAM above).')
      return
    }
    setIndexLoading(true)
    try {
      const res = await fetch('/api/alignment/index-bam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bamPath: bam }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(
          data.detail ? `${data.error || 'Error'}: ${data.detail}` : data.error || res.statusText,
        )
      }
      const parts = [data.stdout, data.stderr].filter(Boolean)
      setIndexLog(parts.join('\n') || 'Finished (no output on stdout/stderr).')
    } catch (e) {
      setIndexError(e instanceof Error ? e.message : String(e))
    } finally {
      setIndexLoading(false)
    }
  }, [indexBamPath, outBam])

  const useOutputAsIndexPath = useCallback(() => {
    const o = outBam.trim()
    if (o) setIndexBamPath(o)
  }, [outBam])

  const canRunAlign =
    Boolean(refPath.trim() && fastqPath.trim() && outBam.trim()) && !alignLoading
  const canRunIndex = Boolean((indexBamPath.trim() || outBam.trim()) && !indexLoading)

  return (
    <div className="qc-panel align-panel">
      <p className="qc-lead">
        <strong>Objective:</strong> Align cleaned reads to hg38 with <strong>BWA-MEM</strong> and{' '}
        <strong>Samtools</strong>. On Windows, the API runs commands in <strong>WSL</strong> (
        <code>wsl.exe</code>) with an <strong>interactive login</strong> shell so{' '}
        <strong>Conda</strong> (and the rest of your <code>~/.bashrc</code>) loads—otherwise{' '}
        <code>bwa</code> is missing from <code>PATH</code> and the pipeline fails. You can use{' '}
        <code>~/…</code> paths (e.g. <code>~/bwa/bwa</code>, <code>~/hg38.fa</code>)—they expand to
        your WSL home. Use <code>bwa</code> if <code>which bwa</code> works, or{' '}
        <code>~/bwa/bwa</code> when the binary lives under <code>~/bwa/</code>.
      </p>

      <section className="align-section">
        <h3 className="qc-help-title">One-time setup (WSL terminal)</h3>
        <ol className="qc-help-list">
          <li>
            <code>wsl --install</code> (from PowerShell if needed)
          </li>
          <li>
            <code>sudo apt update && sudo apt install -y samtools bwa</code>
          </li>
          <li>
            Index reference once: <code className="qc-cmd align-cmd-inline">{indexRefCmd}</code>
          </li>
        </ol>
      </section>

      <section className="align-section">
        <h3 className="qc-help-title">Run alignment</h3>
        <p className="qc-hint">
          <strong>Paths:</strong> Use the same paths WSL Linux would use—<code>~/…</code> or{' '}
          <code>/home/yourname/…</code>—not Windows paths like <code>C:\…</code>. The pipeline runs
          inside WSL, so inputs must be where Linux can read them (your WSL home is fine).{' '}
          <strong>Output:</strong> The sorted BAM is written to the path you type for the output
          field. <code>~/aligned_sorted.bam</code> means the file is created in your{' '}
          <strong>WSL home</strong> (e.g. <code>\\wsl$\Ubuntu\home\you\</code> in File Explorer). To
          save directly under a Windows folder instead, use a path like{' '}
          <code>/mnt/c/Users/you/Downloads/aligned_sorted.bam</code> (possible but often slower I/O).
        </p>
        <p className="qc-hint">
          This executes:{' '}
          <code className="qc-cmd align-cmd-inline">
            bwa mem → samtools view -Sb → samtools sort -o
          </code>
        </p>

        <div className="qc-field">
          <label htmlFor="align-bwa">BWA command</label>
          <input
            id="align-bwa"
            type="text"
            className="qc-input"
            placeholder="~/bwa/bwa"
            value={bwaCmd}
            onChange={(e) => setBwaCmd(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            disabled={alignLoading}
          />
          <p className="qc-hint">
            Use <code>~/bwa/bwa</code> if you copied the BWA folder to your home (as in{' '}
            <code>cp -r …/bwa ~/</code>). Otherwise <code>bwa</code> or the full path from{' '}
            <code>which bwa</code>.
          </p>
        </div>

        <div className="qc-field">
          <label htmlFor="align-ref">Path to reference genome (hg38.fa)</label>
          <input
            id="align-ref"
            type="text"
            className="qc-input"
            placeholder="~/hg38.fa"
            value={refPath}
            onChange={(e) => setRefPath(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            disabled={alignLoading}
          />
        </div>

        <div className="qc-field">
          <label htmlFor="align-fastq">Path to cleaned FASTQ</label>
          <input
            id="align-fastq"
            type="text"
            className="qc-input"
            placeholder="~/cleaned.fastq"
            value={fastqPath}
            onChange={(e) => setFastqPath(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            disabled={alignLoading}
          />
        </div>

        <div className="qc-field">
          <label htmlFor="align-out">Path for sorted BAM output</label>
          <input
            id="align-out"
            type="text"
            className="qc-input"
            placeholder="~/aligned_sorted.bam"
            value={outBam}
            onChange={(e) => setOutBam(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            disabled={alignLoading}
          />
        </div>

        <pre className="qc-cmd align-pre">{generatedAlignment}</pre>

        <div className="qc-actions align-actions-row">
          <button
            type="button"
            className="qc-run"
            onClick={runAlignment}
            disabled={!canRunAlign}
          >
            {alignLoading ? 'Running alignment…' : 'Run alignment'}
          </button>
          <button
            type="button"
            className="qc-run"
            onClick={() => copyToClipboard(generatedAlignment, setCopied)}
            disabled={alignLoading}
          >
            Copy command
          </button>
        </div>

        {alignError ? (
          <div className="qc-error" role="alert">
            {alignError}
          </div>
        ) : null}

        {alignLog ? (
          <div className="align-log-wrap">
            <h4 className="align-log-title">Alignment output</h4>
            <pre className="qc-cmd align-log">{alignLog}</pre>
          </div>
        ) : null}

        {copied ? (
          <p className="qc-hint align-copied" role="status">
            Copied to clipboard.
          </p>
        ) : null}
      </section>

      <section className="align-section">
        <h3 className="qc-help-title">Index sorted BAM</h3>
        <p className="qc-hint">
          Path to the sorted BAM file (usually the same as the output path above). Produces{' '}
          <code>.bai</code> next to the BAM.
        </p>

        <div className="qc-field">
          <label htmlFor="align-index-bam">Path to sorted BAM</label>
          <input
            id="align-index-bam"
            type="text"
            className="qc-input"
            placeholder="~/aligned_sorted.bam"
            value={indexBamPath}
            onChange={(e) => setIndexBamPath(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            disabled={indexLoading}
          />
        </div>

        <pre className="qc-cmd align-pre">{indexBamCmd}</pre>

        <div className="qc-actions align-actions-row">
          <button type="button" className="qc-run" onClick={runIndexBam} disabled={!canRunIndex}>
            {indexLoading ? 'Indexing…' : 'Index BAM'}
          </button>
          <button
            type="button"
            className="qc-run"
            onClick={useOutputAsIndexPath}
            disabled={indexLoading || !outBam.trim()}
          >
            Use output BAM path
          </button>
          <button
            type="button"
            className="qc-run"
            onClick={() => copyToClipboard(indexBamCmd, setCopied)}
            disabled={indexLoading}
          >
            Copy command
          </button>
        </div>

        {indexError ? (
          <div className="qc-error" role="alert">
            {indexError}
          </div>
        ) : null}

        {indexLog ? (
          <div className="align-log-wrap">
            <h4 className="align-log-title">Index output</h4>
            <pre className="qc-cmd align-log">{indexLog}</pre>
          </div>
        ) : null}
      </section>
    </div>
  )
}
