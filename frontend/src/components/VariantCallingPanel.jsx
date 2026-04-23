import { useCallback, useMemo, useState } from 'react'

/** Shown in prerequisite copy blocks; server uses PICARD_JAVA from backend/.env */
const JAVA_PREVIEW = '/usr/lib/jvm/java-17-openjdk-amd64/bin/java'
const defaultGatkJar = '~/gatk-4.5.0.0/gatk-package-4.5.0.0-local.jar'

function copyToClipboard(text, setCopied) {
  navigator.clipboard.writeText(text).then(() => {
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  })
}

const PREREQ_FAIDX = 'samtools faidx ~/hg38.fa'

const PREREQ_DICT = `${JAVA_PREVIEW} -jar ${defaultGatkJar} CreateSequenceDictionary \\
  -R ~/hg38.fa \\
  -O ~/hg38.dict`

const PREREQ_RG = `java -jar ~/picard.jar AddOrReplaceReadGroups \\
  I=~/dedup.bam \\
  O=~/dedup_rg.bam \\
  RGID=1 RGLB=lib1 RGPL=ILLUMINA RGPU=unit1 RGSM=sample1`

const PREREQ_INDEX_RG = 'samtools index ~/dedup_rg.bam'

export function VariantCallingPanel() {
  const [gatkJar, setGatkJar] = useState(defaultGatkJar)
  const [refPath, setRefPath] = useState('')
  const [inputBam, setInputBam] = useState('')
  const [outputVcf, setOutputVcf] = useState('')

  const [runLoading, setRunLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const hcPreview = useMemo(() => {
    const jar = gatkJar.trim() || defaultGatkJar
    const r = refPath.trim()
    const i = inputBam.trim()
    const o = outputVcf.trim()
    if (!r || !i || !o) {
      return [
        `${JAVA_PREVIEW} -jar ${jar} HaplotypeCaller \\`,
        '  -R ~/hg38.fa \\',
        '  -I ~/dedup_rg.bam \\',
        '  -O ~/variants1.vcf.gz',
      ].join('\n')
    }
    return [
      `${JAVA_PREVIEW} -jar ${jar} HaplotypeCaller \\`,
      `  -R ${r} \\`,
      `  -I ${i} \\`,
      `  -O ${o}`,
    ].join('\n')
  }, [gatkJar, refPath, inputBam, outputVcf])

  const runHaplotypeCaller = useCallback(async () => {
    const r = refPath.trim()
    const i = inputBam.trim()
    const o = outputVcf.trim()
    const jar = gatkJar.trim() || defaultGatkJar
    if (!r || !i || !o) {
      return
    }
    setRunLoading(true)
    try {
      const res = await fetch('/api/variant-calling/haplotype-caller', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gatkJar: jar,
          refPath: r,
          inputBam: i,
          outputVcf: o,
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
  }, [gatkJar, refPath, inputBam, outputVcf])

  const canRun =
    Boolean(refPath.trim() && inputBam.trim() && outputVcf.trim()) && !runLoading

  return (
    <div className="qc-panel align-panel">
      <p className="qc-lead">
        <strong>Variant calling (GATK HaplotypeCaller)</strong> needs a prepared reference, an indexed
        BAM with read groups, and then produces a compressed VCF. Complete sections A and B in WSL{' '}
        <strong>before</strong> running HaplotypeCaller in section C.
      </p>

      <section className="align-section">
        <h3 className="qc-help-title">A. Prepare the reference (required for GATK)</h3>
        <p className="qc-hint">
          Run from the folder that contains <code>hg38.fa</code> or use full <code>~/…</code> paths.
          GATK needs the FASTA index and sequence dictionary.
        </p>
        <p className="qc-hint">
          <strong>1.</strong> Create the FASTA index (<code>hg38.fa.fai</code>):
        </p>
        <pre className="qc-cmd align-pre">{PREREQ_FAIDX}</pre>
        <button
          type="button"
          className="qc-run align-copy"
          onClick={() => copyToClipboard(PREREQ_FAIDX, setCopied)}
        >
          Copy
        </button>
        <p className="qc-hint">
          <strong>2.</strong> Create the sequence dictionary (<code>hg38.dict</code>):
        </p>
        <pre className="qc-cmd align-pre">{PREREQ_DICT}</pre>
        <button
          type="button"
          className="qc-run align-copy"
          onClick={() => copyToClipboard(PREREQ_DICT, setCopied)}
        >
          Copy
        </button>
      </section>

      <section className="align-section">
        <h3 className="qc-help-title">B. Prepare the BAM (read groups + index)</h3>
        <p className="qc-hint">
          HaplotypeCaller requires <strong>read groups</strong> on the BAM and a <strong>.bai</strong>{' '}
          index. Start from your deduplicated BAM; change <code>RGSM</code> and paths to match your
          sample.
        </p>
        <pre className="qc-cmd align-pre">{PREREQ_RG}</pre>
        <button
          type="button"
          className="qc-run align-copy"
          onClick={() => copyToClipboard(PREREQ_RG, setCopied)}
        >
          Copy AddOrReplaceReadGroups
        </button>
        <p className="qc-hint">
          Then index the read-group BAM (creates <code>dedup_rg.bam.bai</code>):
        </p>
        <pre className="qc-cmd align-pre">{PREREQ_INDEX_RG}</pre>
        <button
          type="button"
          className="qc-run align-copy"
          onClick={() => copyToClipboard(PREREQ_INDEX_RG, setCopied)}
        >
          Copy
        </button>
      </section>

      <section className="align-section">
        <h3 className="qc-help-title">C. Run HaplotypeCaller</h3>
        <p className="qc-hint">
           Java comes from <code>PICARD_JAVA</code> in <code>backend/.env</code>;
          default jar from <code>GATK_JAR</code>
        </p>

        <div className="qc-field">
          <label htmlFor="vc-gatk-jar">Path to GATK local jar</label>
          <input
            id="vc-gatk-jar"
            type="text"
            className="qc-input"
            placeholder={defaultGatkJar}
            value={gatkJar}
            onChange={(e) => setGatkJar(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            disabled={runLoading}
          />
          <p className="qc-hint">
            Preview shows <code>{JAVA_PREVIEW}</code>; the server uses whatever you set for{' '}
            <code>PICARD_JAVA</code>.
          </p>
        </div>

        <div className="qc-field">
          <label htmlFor="vc-ref">Reference FASTA (-R)</label>
          <input
            id="vc-ref"
            type="text"
            className="qc-input"
            placeholder="~/hg38.fa"
            value={refPath}
            onChange={(e) => setRefPath(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            disabled={runLoading}
          />
        </div>

        <div className="qc-field">
          <label htmlFor="vc-bam">Input BAM with read groups (-I)</label>
          <input
            id="vc-bam"
            type="text"
            className="qc-input"
            placeholder="~/dedup_rg.bam"
            value={inputBam}
            onChange={(e) => setInputBam(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            disabled={runLoading}
          />
        </div>

        <div className="qc-field">
          <label htmlFor="vc-out">Output VCF (-O)</label>
          <input
            id="vc-out"
            type="text"
            className="qc-input"
            placeholder="~/variants.vcf.gz"
            value={outputVcf}
            onChange={(e) => setOutputVcf(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            disabled={runLoading}
          />
        </div>

        <pre className="qc-cmd align-pre">{hcPreview}</pre>

        <div className="qc-actions align-actions-row">
          <button type="button" className="qc-run" onClick={runHaplotypeCaller} disabled={!canRun}>
            {runLoading ? 'Running HaplotypeCaller…' : 'Run HaplotypeCaller'}
          </button>
          <button
            type="button"
            className="qc-run"
            onClick={() => copyToClipboard(hcPreview, setCopied)}
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
