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
        Run FastQC on a file that already exists on this system. Large <code>.fastq</code> /{' '}
        <code>.fq.gz</code> files are not uploaded through the browser; the API runs FastQC locally
        using the path you provide. When the run succeeds, your browser saves{' '}
        <strong>fastqc-results.zip</strong> to your normal download folder (e.g.{' '}
        <code>Downloads</code> on Windows—same place as any other downloaded file).
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
          FastQC-supported file.
        </p>
      </div>

      <div className="qc-actions">
        <button type="button" className="qc-run" onClick={runQc} disabled={loading || !inputPath.trim()}>
          {loading ? 'Running FastQC…' : 'Run FastQC & download report'}
        </button>
      </div>



      <section className="qc-server-help">
        <h3 className="qc-help-title">FastQC setup (one time)</h3>
        <ol className="qc-help-list">
         
          <li>
            Set <code>FASTQC_DIR</code> to your cloned FastQC project root (the folder that contains{' '}
            <code>bin</code>, <code>sam-1.103.jar</code>, <code>jbzip2-0.9.jar</code>).
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
