export function OverviewPanel() {
  return (
    <div className="qc-panel overview-panel">
      <p className="qc-lead">
        <strong>NGS pipeline</strong> is a step-by-step UI for running common next-generation
        sequencing processing tasks on your local machine. Most steps execute tools locally via the
        API (and for alignment/GATK/VEP, via <strong>WSL</strong>), so you provide file paths instead
        of uploading large FASTQ/BAM/VCF files.
      </p>

      <section className="align-section">
        <h3 className="qc-help-title">What this website does</h3>
        <ul className="qc-help-list">
          <li>
            Guides you through key pipeline steps (QC → trimming → alignment → post-alignment → variant
            calling → annotation).
          </li>
          <li>
            Runs commands on your computer (no cloud upload) and shows logs/output in the browser.
          </li>
          <li>
            Uses <strong>WSL paths</strong> (like <code>~/hg38.fa</code>) for the steps that run in WSL.
          </li>
        </ul>
      </section>

      <section className="align-section">
        <h3 className="qc-help-title">First-time setup (one time)</h3>
        <ol className="qc-help-list">
          <li>
            Install dependencies: in folder <code>backend</code>, run <code>npm install</code>.
          </li>
          <li>
            Copy <code>backend/.env.example</code> to <code>backend/.env</code> and fill required
            variables (at minimum, <code>FASTQC_DIR</code>).
          </li>
          <li>
            Start the API (port 8787): run <code>npm run dev</code> in <code>backend</code>, or run{' '}
            <code>npm run dev</code> in <code>frontend</code> to start Vite and proxy to the API.
          </li>
          <li>
            Java must be on <code>PATH</code> (or set <code>JAVA_HOME</code>) for tools that use it
            (FastQC / Picard / GATK). The FastQC API runs:
            <code className="qc-cmd">
              java -Xmx250m -classpath &quot;bin;…jars…&quot; uk.ac.babraham.FastQC.FastQCApplication -o
              &lt;temp&gt; &lt;your file&gt;
            </code>
          </li>
          <li>
            For WSL-only steps (alignment, Picard jar, GATK jar, VEP), keep your reference/FASTQ/BAM/VCF
            files in the WSL filesystem (e.g. <code>/home/you</code>) and use WSL-style paths.
          </li>
        </ol>
      </section>
    </div>
  )
}

