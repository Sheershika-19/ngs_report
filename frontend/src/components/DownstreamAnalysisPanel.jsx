import { useCallback, useMemo, useState } from 'react'

export function DownstreamAnalysisPanel() {
  const [inputVcf, setInputVcf] = useState('')
  const [outputHtml, setOutputHtml] = useState('')
  const [scriptPath, setScriptPath] = useState('')
  const [dbDir, setDbDir] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [log, setLog] = useState('')

  const commandPreview = useMemo(() => {
    const i = inputVcf.trim() || 'C:\\path\\to\\input.vcf'
    const o = outputHtml.trim() || 'C:\\path\\to\\clinical_report.html'
    return `python vcf_report_generator.py "${i}" --output "${o}"`
  }, [inputVcf, outputHtml])

  const runReport = useCallback(async () => {
    setError(null)
    setLog('')
    const i = inputVcf.trim()
    const o = outputHtml.trim()
    if (!i || !o) {
      setError('Enter both Input VCF path and Output HTML path.')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/downstream/civic-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inputVcf: i,
          outputHtml: o,
          scriptPath: scriptPath.trim() || undefined,
          dbDir: dbDir.trim() || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(
          data.detail ? `${data.error || 'Error'}: ${data.detail}` : data.error || res.statusText,
        )
      }
      const parts = [
        data.command ? `Command:\n${data.command}` : '',
        data.stdout ? `\nSTDOUT:\n${data.stdout}` : '',
        data.stderr ? `\nSTDERR:\n${data.stderr}` : '',
        data.outputHtml ? `\nGenerated HTML:\n${data.outputHtml}` : '',
      ].filter(Boolean)
      setLog(parts.join('\n').trim() || 'Report generated successfully.')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [dbDir, inputVcf, outputHtml, scriptPath])

  return (
    <div className="qc-panel">
      <p className="qc-lead">
        Generate clinical HTML report from a VCF using your Python script:
        <code> vcf_report_generator.py &lt;input.vcf&gt; --output clinical_report.html</code>.
      </p>

      {error ? <div className="qc-error">{error}</div> : null}

      <div className="qc-field">
        <label htmlFor="civic-input-vcf">Input VCF path</label>
        <input
          id="civic-input-vcf"
          type="text"
          className="qc-input"
          placeholder="e.g. C:\Users\DELL\Desktop\sample.vcf"
          value={inputVcf}
          onChange={(e) => setInputVcf(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          disabled={loading}
        />
      </div>

      <div className="qc-field">
        <label htmlFor="civic-output-html">Output report HTML path</label>
        <input
          id="civic-output-html"
          type="text"
          className="qc-input"
          placeholder="e.g. C:\Users\DELL\Desktop\clinical_report.html"
          value={outputHtml}
          onChange={(e) => setOutputHtml(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          disabled={loading}
        />
        <p className="qc-hint">The parent output folder must already exist and be writable.</p>
      </div>


      <div className="qc-actions">
        <button
          type="button"
          className="qc-run"
          onClick={runReport}
          disabled={loading || !inputVcf.trim() || !outputHtml.trim()}
        >
          {loading ? 'Generating report…' : 'Generate clinical report'}
        </button>
      </div>

      <section className="qc-server-help">
        <h3 className="qc-help-title">Command preview</h3>
        <pre className="qc-cmd">{commandPreview}</pre>
       
      </section>

   
    </div>
  )
}
