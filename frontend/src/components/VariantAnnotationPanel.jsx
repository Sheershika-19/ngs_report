import { useCallback, useMemo, useState } from 'react'

/** With conda run, `vep` on that env’s PATH is enough */
const defaultVepCmd = 'vep'

const CACHE_MKDIR = `mkdir -p ~/.vep
cd ~/.vep`

const CACHE_WGET = `wget -c https://ftp.ensembl.org/pub/release-115/variation/indexed_vep_cache/homo_sapiens_vep_115_GRCh38.tar.gz`

const CACHE_EXTRACT = `cd ~/.vep
tar -xzf homo_sapiens_vep_115_GRCh38.tar.gz`

function copyToClipboard(text, setCopied) {
  navigator.clipboard.writeText(text).then(() => {
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  })
}

export function VariantAnnotationPanel() {
  const [vepCmd, setVepCmd] = useState(defaultVepCmd)
  const [vepCondaEnv, setVepCondaEnv] = useState('vep_env')
  const [inputVcf, setInputVcf] = useState('')
  const [outputVcf, setOutputVcf] = useState('')
  const [fastaPath, setFastaPath] = useState('')
  const [fork, setFork] = useState('4')

  const [runLoading, setRunLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const vepPreview = useMemo(() => {
    const v = vepCmd.trim() || defaultVepCmd
    const env = vepCondaEnv.trim()
    const i = inputVcf.trim()
    const o = outputVcf.trim()
    const f = fastaPath.trim()
    const fk = fork.trim() || '4'
    const inner = !i || !o || !f
      ? [
          `${v} --cache --offline --fork ${fk} \\`,
          '  -i ~/variants.vcf.gz \\',
          '  -o ~/annotated_variants.vcf \\',
          '  --vcf --symbol --terms SO --hgvs --protein --canonical \\',
          '  --fasta ~/hg38.fa \\',
          '  --force_overwrite',
        ].join('\n')
      : [
          `${v} --cache --offline --fork ${fk} \\`,
          `  -i ${i} \\`,
          `  -o ${o} \\`,
          '  --vcf --symbol --terms SO --hgvs --protein --canonical \\',
          `  --fasta ${f} \\`,
          '  --force_overwrite',
        ].join('\n')
    if (!env) return inner
    const collapsed = inner
      .split('\n')
      .map((line) => line.replace(/\\$/, '').trim())
      .filter(Boolean)
      .join(' ')
    return `conda run -n ${env} --no-capture-output ${collapsed}`
  }, [vepCmd, vepCondaEnv, inputVcf, outputVcf, fastaPath, fork])

  const runVep = useCallback(async () => {
    const i = inputVcf.trim()
    const o = outputVcf.trim()
    const f = fastaPath.trim()
    const v = vepCmd.trim() || defaultVepCmd
    const fk = fork.trim() ? Number.parseInt(fork.trim(), 10) : 4
    if (!i || !o || !f) {
      return
    }
    if (!Number.isInteger(fk) || fk < 1 || fk > 16) {
      return
    }
    setRunLoading(true)
    try {
      const res = await fetch('/api/variant-annotation/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vepCmd: v,
          vepCondaEnv: vepCondaEnv.trim() || undefined,
          inputVcf: i,
          outputVcf: o,
          fastaPath: f,
          fork: fk,
        }),
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
      setRunLoading(false)
    }
  }, [vepCmd, vepCondaEnv, inputVcf, outputVcf, fastaPath, fork])

  const canRun =
    Boolean(inputVcf.trim() && outputVcf.trim() && fastaPath.trim()) && !runLoading

  return (
    <div className="qc-panel align-panel">
      <p className="qc-lead">
        <strong>Variant annotation</strong> with <strong>Ensembl VEP</strong> in WSL, using a local
        cache (<code>--cache --offline</code>). Download and extract the cache under{' '}
        <code>~/.vep</code> first, then run VEP (often from a conda env such as{' '}
        <code>vep_env</code>).
      </p>

      <section className="align-section">
        <h3 className="qc-help-title">1. Download and install the VEP cache (manual, one time)</h3>
        <p className="qc-hint">
          <strong>Go to the VEP cache folder</strong>
        </p>
        <pre className="qc-cmd align-pre">{CACHE_MKDIR}</pre>
        <button
          type="button"
          className="qc-run align-copy"
          onClick={() => copyToClipboard(CACHE_MKDIR, setCopied)}
        >
          Copy
        </button>
        <p className="qc-hint">
          <strong>Download</strong> (GRCh38 / release 115)
        </p>
        <pre className="qc-cmd align-pre">{CACHE_WGET}</pre>
        <button
          type="button"
          className="qc-run align-copy"
          onClick={() => copyToClipboard(CACHE_WGET, setCopied)}
        >
          Copy
        </button>
        <p className="qc-hint">
          <strong>Extract</strong>
        </p>
        <pre className="qc-cmd align-pre">{CACHE_EXTRACT}</pre>
        <button
          type="button"
          className="qc-run align-copy"
          onClick={() => copyToClipboard(CACHE_EXTRACT, setCopied)}
        >
          Copy
        </button>
      </section>

      <section className="align-section">
        <h3 className="qc-help-title">2. Conda env (recommended for API runs)</h3>
        <p className="qc-hint">
          <code>conda activate vep_env</code> then{' '}
          <code className="qc-cmd align-cmd-inline">conda install -y -c bioconda perl-dbi</code>
        </p>
        <p className="qc-hint">
          Optional: set <code>CONDA_EXE=~/miniconda3/bin/conda</code> and{' '}
          <code>VEP_CONDA_ENV=vep_env</code> in <code>backend/.env</code>. Use full path to{' '}
          <code>vep</code> as <code>VEP_CMD</code> if you leave &quot;Conda env&quot; empty.
        </p>
      </section>

      <section className="align-section">
        <h3 className="qc-help-title">3. Run VEP</h3>
        <p className="qc-hint">
          Same flags as a typical offline run: <code>--vcf --symbol --terms SO --hgvs --protein --canonical</code>,{' '}
          <code>--fasta</code>, <code>--force_overwrite</code>.
        </p>

        <div className="qc-field">
          <label htmlFor="va-conda-env">Conda env for <code>conda run</code> (leave empty to skip)</label>
          <input
            id="va-conda-env"
            type="text"
            className="qc-input"
            placeholder="vep_env"
            value={vepCondaEnv}
            onChange={(e) => setVepCondaEnv(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            disabled={runLoading}
          />
        </div>

        <div className="qc-field">
          <label htmlFor="va-vep"><code>vep</code> command (or full path)</label>
          <input
            id="va-vep"
            type="text"
            className="qc-input"
            placeholder="vep"
            value={vepCmd}
            onChange={(e) => setVepCmd(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            disabled={runLoading}
          />
          <p className="qc-hint">
            With a conda env set, <code>vep</code> alone is usually enough. Otherwise use e.g.{' '}
            <code>~/miniconda3/envs/vep_env/bin/vep</code>.
          </p>
        </div>

        <div className="qc-field">
          <label htmlFor="va-in">Input VCF (-i)</label>
          <input
            id="va-in"
            type="text"
            className="qc-input"
            placeholder="~/variants.vcf.gz"
            value={inputVcf}
            onChange={(e) => setInputVcf(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            disabled={runLoading}
          />
        </div>

        <div className="qc-field">
          <label htmlFor="va-out">Output annotated VCF (-o)</label>
          <input
            id="va-out"
            type="text"
            className="qc-input"
            placeholder="~/annotated_variants.vcf"
            value={outputVcf}
            onChange={(e) => setOutputVcf(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            disabled={runLoading}
          />
        </div>

        <div className="qc-field">
          <label htmlFor="va-fa">Reference FASTA (--fasta)</label>
          <input
            id="va-fa"
            type="text"
            className="qc-input"
            placeholder="~/hg38.fa"
            value={fastaPath}
            onChange={(e) => setFastaPath(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            disabled={runLoading}
          />
        </div>

        <div className="qc-field">
          <label htmlFor="va-fork">Parallel forks (--fork)</label>
          <input
            id="va-fork"
            type="text"
            className="qc-input"
            placeholder="4"
            value={fork}
            onChange={(e) => setFork(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            disabled={runLoading}
          />
        </div>

        <pre className="qc-cmd align-pre">{vepPreview}</pre>

        <div className="qc-actions align-actions-row">
          <button type="button" className="qc-run" onClick={runVep} disabled={!canRun}>
            {runLoading ? 'Running VEP…' : 'Run VEP'}
          </button>
          <button
            type="button"
            className="qc-run"
            onClick={() => copyToClipboard(vepPreview, setCopied)}
            disabled={runLoading}
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
