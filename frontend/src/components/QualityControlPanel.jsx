import { useCallback, useState } from 'react'

const defaultPath = ''

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function QualityControlPanel() {
  const [inputPath, setInputPath] = useState(defaultPath)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const runQc = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/qc/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputPath: inputPath.trim() }),
      })

      const contentType = res.headers.get('content-type') || ''
      if (!res.ok) {
        if (contentType.includes('application/json')) {
          const data = await res.json()
          throw new Error(data.detail ? `${data.error}: ${data.detail}` : data.error || res.statusText)
        }
        throw new Error(await res.text() || res.statusText)
      }

      const blob = await res.blob()
      const cd = res.headers.get('content-disposition')
      const match = cd?.match(/filename="?([^";]+)"?/i)
      const name = match ? match[1] : 'fastqc-results.zip'
      triggerDownload(blob, name)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [inputPath])

  return (
    <div className="qc-panel">
      <p className="qc-lead">
        Run FastQC on a file that already exists on this computer. Large <code>.fastq</code> /{' '}
        <code>.fq.gz</code> files are not uploaded through the browser; the API runs FastQC locally
        using the path you provide.
      </p>

      <div className="qc-field">
        <label htmlFor="qc-input-path">Path to input file</label>
        <input
          id="qc-input-path"
          type="text"
          className="qc-input"
          placeholder="e.g. C:\data\sample_R1.fastq.gz"
          value={inputPath}
          onChange={(e) => setInputPath(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          disabled={loading}
        />
        <p className="qc-hint">
          Use the full Windows path to your <code>.fastq</code>, <code>.fq.gz</code>, or other
          FastQC-supported file (your example used a <code>.zip</code> from the instrument—that works
          if FastQC accepts it).
        </p>
      </div>

      <div className="qc-actions">
        <button type="button" className="qc-run" onClick={runQc} disabled={loading || !inputPath.trim()}>
          {loading ? 'Running FastQC…' : 'Run FastQC & download report'}
        </button>
      </div>

      {error ? (
        <div className="qc-error" role="alert">
          {error}
        </div>
      ) : null}

      <section className="qc-server-help">
        <h3 className="qc-help-title">Server setup (one time)</h3>
        <ol className="qc-help-list">
          <li>
            Install dependencies: in folder <code>backend</code>, run <code>npm install</code>.
          </li>
          <li>
            Set <code>FASTQC_DIR</code> to your cloned FastQC project root (the folder that contains{' '}
            <code>bin</code>, <code>sam-1.103.jar</code>, <code>jbzip2-0.9.jar</code>).
          </li>
          <li>
            Start the API (port 8787): <code>npm run dev</code> in <code>backend</code>, or use{' '}
            <code>npm run dev</code> in <code>frontend</code> to run Vite and the API together.
          </li>
          <li>
            Java must be on <code>PATH</code> (or set <code>JAVA_HOME</code>). The API runs:{' '}
            <code className="qc-cmd">
              java -Xmx250m -classpath &quot;bin;…jars…&quot; uk.ac.babraham.FastQC.FastQCApplication -o
              &lt;temp&gt; &lt;your file&gt;
            </code>
          </li>
        </ol>
      </section>
    </div>
  )
}
