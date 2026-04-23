import { useCallback, useMemo, useState } from 'react'

function copyToClipboard(text, setCopied) {
  navigator.clipboard.writeText(text).then(() => {
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  })
}

export function PostAlignmentPanel() {
  const [inputBam, setInputBam] = useState('')
  const [outputBam, setOutputBam] = useState('')
  const [metricsPath, setMetricsPath] = useState('')
  const [indexBamPath, setIndexBamPath] = useState('')

  const [mdLoading, setMdLoading] = useState(false)

  const [indexLoading, setIndexLoading] = useState(false)

  const [copied, setCopied] = useState(false)

  const markDupPreview = useMemo(() => {
    const i = inputBam.trim()
    const o = outputBam.trim()
    const m = metricsPath.trim()
    if (!i || !o || !m) {
      return '/usr/lib/jvm/java-17-openjdk-amd64/bin/java -jar ~/picard.jar MarkDuplicates I=~/aligned_sorted.bam O=~/dedup.bam M=~/dup_metrics.txt'
    }
    return `/usr/lib/jvm/java-17-openjdk-amd64/bin/java -jar ~/picard.jar MarkDuplicates I=${i} O=${o} M=${m}`
  }, [inputBam, outputBam, metricsPath])

  const indexCmdPreview = useMemo(() => {
    const b = indexBamPath.trim() || outputBam.trim()
    if (!b) return 'samtools index ~/dedup.bam'
    return `samtools index ${b}`
  }, [indexBamPath, outputBam])

  const runMarkDuplicates = useCallback(async () => {
    const i = inputBam.trim()
    const o = outputBam.trim()
    const met = metricsPath.trim()
    if (!i || !o || !met) {
      return
    }
    setMdLoading(true)
    try {
      const res = await fetch('/api/post-alignment/mark-duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inputBam: i,
          outputBam: o,
          metricsPath: met,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(
          data.detail ? `${data.error || 'Error'}: ${data.detail}` : data.error || res.statusText,
        )
      }
      setIndexBamPath((prev) => (prev.trim() ? prev : o))
    } catch {
      // Suppress UI output/error boxes for this step.
    } finally {
      setMdLoading(false)
    }
  }, [inputBam, outputBam, metricsPath])

  const runIndexBam = useCallback(async () => {
    const bam = indexBamPath.trim() || outputBam.trim()
    if (!bam) {
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
    } catch {
      // Suppress UI output/error boxes for this step.
    } finally {
      setIndexLoading(false)
    }
  }, [indexBamPath, outputBam])

  const useDedupForIndex = useCallback(() => {
    const o = outputBam.trim()
    if (o) setIndexBamPath(o)
  }, [outputBam])

  const canRunMd =
    Boolean(inputBam.trim() && outputBam.trim() && metricsPath.trim()) && !mdLoading
  const canRunIndex = Boolean((indexBamPath.trim() || outputBam.trim()) && !indexLoading)

  return (
    <div className="qc-panel align-panel">
      <p className="qc-lead">
        <strong>Step 4 — Post-alignment:</strong> mark duplicate reads with{' '}
        <strong>Picard MarkDuplicates</strong>, then index the deduplicated BAM with{' '}
        <strong>samtools index</strong>. Set <code>PICARD_JAVA</code> and{' '}
        <code>PICARD_JAR</code> in <code>backend/.env</code> (e.g.{' '}
        <code>java -jar ~/picard.jar</code> like your WSL terminal). Use WSL paths for files (
        <code>~/…</code>). Outputs:{' '}
        <code>dedup.bam</code>, <code>dup_metrics.txt</code>, <code>dedup.bam.bai</code> after indexing.
      </p>

      <section className="align-section">
        <h3 className="qc-help-title">Picard jar + Java (WSL)</h3>
        <p className="qc-hint">
          Put <code>picard.jar</code> in your WSL home (e.g. <code>~/picard.jar</code>) and install
          OpenJDK 17. In <code>backend/.env</code> set <code>PICARD_JAVA</code> and{' '}
          <code>PICARD_JAR</code> to match your working terminal command.
        </p>
        <pre className="qc-cmd align-pre">
          {`# Example backend/.env (paths are WSL-style)
PICARD_JAVA=/usr/lib/jvm/java-17-openjdk-amd64/bin/java
PICARD_JAR=~/picard.jar`}
        </pre>
       
      </section>

      <section className="align-section">
        <h3 className="qc-help-title">Mark duplicates (Picard)</h3>
        <p className="qc-hint">
          Input is the <strong>coordinate-sorted</strong> BAM from alignment (e.g.{' '}
          <code>~/aligned_sorted.bam</code>). With <code>PICARD_JAR</code> set, the server runs{' '}
          <code>$PICARD_JAVA -jar $PICARD_JAR MarkDuplicates I=… O=… M=…</code> in WSL.
        </p>

        <div className="qc-field">
          <label htmlFor="pa-input-bam">Input sorted BAM (I=)</label>
          <input
            id="pa-input-bam"
            type="text"
            className="qc-input"
            placeholder="~/aligned_sorted.bam"
            value={inputBam}
            onChange={(e) => setInputBam(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            disabled={mdLoading}
          />
        </div>

        <div className="qc-field">
          <label htmlFor="pa-output-bam">Output deduplicated BAM (O=)</label>
          <input
            id="pa-output-bam"
            type="text"
            className="qc-input"
            placeholder="~/dedup.bam"
            value={outputBam}
            onChange={(e) => setOutputBam(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            disabled={mdLoading}
          />
        </div>

        <div className="qc-field">
          <label htmlFor="pa-metrics">Duplicate metrics file (M=)</label>
          <input
            id="pa-metrics"
            type="text"
            className="qc-input"
            placeholder="~/dup_metrics.txt"
            value={metricsPath}
            onChange={(e) => setMetricsPath(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            disabled={mdLoading}
          />
        </div>

        <pre className="qc-cmd align-pre">{markDupPreview}</pre>

        <div className="qc-actions align-actions-row">
          <button type="button" className="qc-run" onClick={runMarkDuplicates} disabled={!canRunMd}>
            {mdLoading ? 'Running Picard…' : 'Run MarkDuplicates'}
          </button>
          <button
            type="button"
            className="qc-run"
            onClick={() => copyToClipboard(markDupPreview, setCopied)}
            disabled={mdLoading}
          >
            Copy command
          </button>
        </div>

      </section>

      <section className="align-section">
        <h3 className="qc-help-title">Index deduplicated BAM</h3>
        <p className="qc-hint">
          Run after MarkDuplicates finishes. Produces <code>dedup.bam.bai</code> beside the BAM.
        </p>

        <div className="qc-field">
          <label htmlFor="pa-index-bam">Path to dedup BAM</label>
          <input
            id="pa-index-bam"
            type="text"
            className="qc-input"
            placeholder="~/dedup.bam"
            value={indexBamPath}
            onChange={(e) => setIndexBamPath(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            disabled={indexLoading}
          />
        </div>

        <pre className="qc-cmd align-pre">{indexCmdPreview}</pre>

        <div className="qc-actions align-actions-row">
          <button type="button" className="qc-run" onClick={runIndexBam} disabled={!canRunIndex}>
            {indexLoading ? 'Indexing…' : 'Index BAM'}
          </button>
          <button
            type="button"
            className="qc-run"
            onClick={useDedupForIndex}
            disabled={indexLoading || !outputBam.trim()}
          >
            Use dedup output path
          </button>
          <button
            type="button"
            className="qc-run"
            onClick={() => copyToClipboard(indexCmdPreview, setCopied)}
            disabled={indexLoading}
          >
            Copy command
          </button>
        </div>

        {copied ? (
          <p className="qc-hint align-copied" role="status">
            Copied to clipboard.
          </p>
        ) : null}
      </section>
    </div>
  )
}
