import { useCallback, useMemo, useState } from 'react'

export function ReadTrimmingPanel() {
  const [inputPath, setInputPath] = useState('')
  const [outputPath, setOutputPath] = useState('')
  const [ref, setRef] = useState('adapters')
  const [customCommand, setCustomCommand] = useState('')
  const [commandEdited, setCommandEdited] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [log, setLog] = useState('')

  const previewCmd = useMemo(() => {
    const inn = inputPath.trim() || '/path/to/sample.fastq'
    const out = outputPath.trim() || '/path/to/cleaned.fastq'
    const r = ref.trim() || 'adapters'
    return [
      './bbduk.sh \\',
      `  in="${inn}" \\`,
      `  out="${out}" \\`,
      `  ref=${r} \\`,
      '  ktrim=r \\',
      '  k=23 \\',
      '  mink=11 \\',
      '  hdist=1 \\',
      '  qtrim=r \\',
      '  trimq=20 \\',
      '  minlen=30',
    ].join('\n')
  }, [inputPath, outputPath, ref])

  const runTrim = useCallback(async () => {
    setError(null)
    setLog('')
    const inn = inputPath.trim()
    const out = outputPath.trim()
    if (!inn || !out) {
      setError('Enter the full path to your input FASTQ and the path where the cleaned FASTQ should be written.')
      return
    }
    setLoading(true)
    try {
      const finalCommand = (commandEdited ? customCommand : previewCmd).trim()
      if (!finalCommand) {
        setError('Enter a BBDuk shell command to run.')
        setLoading(false)
        return
      }
      const res = await fetch('/api/trimming/bbduk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inputPath: inn,
          outputPath: out,
          ref: ref.trim() || 'adapters',
          command: finalCommand,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(
          data.detail ? `${data.error || 'Error'}: ${data.detail}` : data.error || res.statusText,
        )
      }
      const parts = [data.stdout, data.stderr].filter(Boolean)
      setLog(parts.join('\n') || 'Finished (no output on stdout/stderr).')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [commandEdited, customCommand, inputPath, outputPath, previewCmd, ref])

  return (
    <div className="qc-panel">
      <p className="qc-lead">
        Trim adapters and low-quality bases with BBMap <code>bbduk.sh</code>. Paths must point to real
        files on the machine running the API (same pattern as FastQC). 
      </p>

      <div className="qc-field">
        <label htmlFor="trim-input-path">Input FASTQ path</label>
        <input
          id="trim-input-path"
          type="text"
          className="qc-input"
          placeholder="e.g. C:\Users\DELL\Downloads\SRR33532769\SRR33532769.fastq"
          value={inputPath}
          onChange={(e) => setInputPath(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          disabled={loading}
        />
      </div>

      <div className="qc-field">
        <label htmlFor="trim-output-path">Output cleaned FASTQ path</label>
        <input
          id="trim-output-path"
          type="text"
          className="qc-input"
          placeholder="e.g. C:\Users\DELL\Downloads\SRR33532769\cleaned.fastq"
          value={outputPath}
          onChange={(e) => setOutputPath(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          disabled={loading}
        />
        <p className="qc-hint">The parent folder must already exist and be writable.</p>
      </div>

      <div className="qc-field">
        <label htmlFor="trim-ref">Adapter reference (BBDuk ref=)</label>
        <input
          id="trim-ref"
          type="text"
          className="qc-input"
          placeholder="adapters"
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          disabled={loading}
        />
        <p className="qc-hint">
          Use built-in <code>adapters</code> or a full path to a FASTA of sequences.
        </p>
      </div>

      <div className="qc-actions">
        <button
          type="button"
          className="qc-run"
          onClick={runTrim}
          disabled={loading || !inputPath.trim() || !outputPath.trim()}
        >
          {loading ? 'Running BBDuk…' : 'Run BBDuk'}
        </button>
      </div>

      {log ? (
        <pre className="qc-cmd" style={{ whiteSpace: 'pre-wrap', marginTop: '1rem' }}>
          {log}
        </pre>
      ) : null}

      <section className="qc-server-help">
        <h3 className="qc-help-title">shell command</h3>
        <p className="qc-hint">From your BBMap <code>bbmap</code> directory in Git Bash (parameters match the API):</p>
        <textarea
          className="qc-input align-textarea"
          value={commandEdited ? customCommand : previewCmd}
          onChange={(e) => {
            setCommandEdited(true)
            setCustomCommand(e.target.value)
          }}
          disabled={loading}
          spellCheck={false}
          rows={8}
        />
        <h3 className="qc-help-title">BBduk setup</h3>
        <ol className="qc-help-list">
          <li>
            Set <code>BBMAP_DIR</code> in <code>backend/.env</code> to the folder that contains{' '}
            <code>bbduk.sh</code> (for example <code>C:\Users\DELL\Downloads\BBMap_39.01\bbmap</code>).
          </li>
          <li>
            Install <a href="https://git-scm.com/download/win">Git for Windows</a> so <code>bash.exe</code> exists,
            or set <code>GIT_BASH</code> to its full path.
          </li>
        </ol>
      </section>
    </div>
  )
}
