import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useNavigate } from 'react-router-dom';
import { uploadFiles, getJobStatus } from '../api';
import { ColumnMapping } from '../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const STYLES: Record<string, any> = {
  page: { minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', background: '#0f1117' },
  card: { background: '#1a1d27', borderRadius: 12, padding: '2rem', maxWidth: 760, width: '100%', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' },
  title: { fontSize: '2rem', fontWeight: 700, color: '#7c3aed', marginBottom: '0.5rem' },
  subtitle: { color: '#94a3b8', marginBottom: '2rem' },
  dropzone: (active: boolean) => ({
    border: `2px dashed ${active ? '#7c3aed' : '#334155'}`,
    borderRadius: 8,
    padding: '3rem',
    textAlign: 'center',
    cursor: 'pointer',
    background: active ? 'rgba(124,58,237,0.05)' : 'transparent',
    transition: 'all 0.2s',
    marginBottom: '1.5rem',
  }),
  fileList: { marginBottom: '1.5rem' },
  fileItem: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem', background: '#252836', borderRadius: 6, marginBottom: 4 },
  badge: (type: string) => ({ fontSize: '0.7rem', padding: '2px 8px', borderRadius: 12, background: type === 'config' ? '#1e40af' : '#065f46', color: '#fff', cursor: 'pointer', userSelect: 'none' }),
  section: { marginBottom: '1.5rem' },
  sectionTitle: { fontSize: '0.85rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' },
  label: { fontSize: '0.8rem', color: '#94a3b8', marginBottom: 4 },
  input: { width: '100%', background: '#0f1117', border: '1px solid #334155', borderRadius: 6, padding: '0.4rem 0.6rem', color: '#e2e8f0', fontSize: '0.85rem' },
  btn: (disabled: boolean) => ({ background: disabled ? '#334155' : '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, padding: '0.75rem 2rem', fontSize: '1rem', fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', width: '100%' }),
  progress: { marginTop: '1.5rem' },
  bar: (pct: number) => ({ height: 8, borderRadius: 4, background: `linear-gradient(90deg, #7c3aed ${pct}%, #334155 ${pct}%)`, transition: 'background 0.3s' }),
  status: { color: '#94a3b8', fontSize: '0.85rem', marginTop: '0.5rem' },
  error: { color: '#f87171', fontSize: '0.85rem', marginTop: '0.5rem' },
};

const LOG_EXTENSIONS = new Set(['csv', 'tsv']);

export default function UploadPage() {
  const navigate = useNavigate();
  const [files, setFiles] = useState<File[]>([]);
  const [fileTypes, setFileTypes] = useState<Record<string, 'config' | 'log'>>({});
  const [mapping, setMapping] = useState<Partial<ColumnMapping>>({ sourceIP: 'src_ip', destIP: 'dst_ip', protocol: 'proto', sourcePort: 'src_port', destPort: 'dst_port', timestamp: 'timestamp' });
  const [progress, setProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState('');
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);

  const onDrop = useCallback((accepted: File[]) => {
    setFiles((prev) => {
      const existing = new Set(prev.map((f) => f.name));
      const newFiles = accepted.filter((f) => !existing.has(f.name));
      return [...prev, ...newFiles];
    });
    // Auto-detect file types
    accepted.forEach((f) => {
      const ext = f.name.split('.').pop()?.toLowerCase() || '';
      setFileTypes((prev) => ({ ...prev, [f.name]: LOG_EXTENSIONS.has(ext) ? 'log' : 'config' }));
    });
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop });

  const toggleType = (name: string) => {
    setFileTypes((prev) => ({ ...prev, [name]: prev[name] === 'config' ? 'log' : 'config' }));
  };

  const removeFile = (name: string) => {
    setFiles((prev) => prev.filter((f) => f.name !== name));
    setFileTypes((prev) => { const n = { ...prev }; delete n[name]; return n; });
  };

  const hasLogFiles = files.some((f) => fileTypes[f.name] === 'log');

  const handleUpload = async () => {
    if (files.length === 0) return;
    setUploading(true);
    setError('');
    setProgress(5);
    setStatusMsg('Uploading files...');

    try {
      const fullMapping: ColumnMapping | undefined = hasLogFiles
        ? { sourceIP: mapping.sourceIP || 'src_ip', destIP: mapping.destIP || 'dst_ip', sourcePort: mapping.sourcePort, destPort: mapping.destPort, protocol: mapping.protocol, timestamp: mapping.timestamp }
        : undefined;

      const { jobId } = await uploadFiles(files, fullMapping, fileTypes);

      // Poll for completion
      const poll = setInterval(async () => {
        try {
          const status = await getJobStatus(jobId);
          setProgress(status.progress);
          setStatusMsg(status.message);

          if (status.status === 'completed') {
            clearInterval(poll);
            setProgress(100);
            setStatusMsg('Done! Redirecting to diagram...');
            setTimeout(() => navigate('/diagram'), 1000);
          } else if (status.status === 'failed') {
            clearInterval(poll);
            setError(status.error || 'Processing failed');
            setUploading(false);
          }
        } catch {
          clearInterval(poll);
          setError('Lost connection to server');
          setUploading(false);
        }
      }, 2000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      setError(msg);
      setUploading(false);
    }
  };

  return (
    <div style={STYLES.page}>
      <div style={STYLES.card}>
        <div style={STYLES.title}>🌐 NetDiagram</div>
        <div style={STYLES.subtitle}>Upload device configurations and traffic logs to build your interactive network diagram.</div>

        {/* Drop Zone */}
        <div {...getRootProps()} style={STYLES.dropzone(isDragActive)}>
          <input {...getInputProps()} />
          {isDragActive
            ? <div>Drop files here...</div>
            : <div>
                <div style={{ fontSize: '2rem', marginBottom: 8 }}>📁</div>
                <div style={{ color: '#94a3b8' }}>Drag & drop files here, or click to browse</div>
                <div style={{ color: '#475569', fontSize: '0.8rem', marginTop: 8 }}>
                  Cisco (.txt, .cfg, .conf, .ios) · Palo Alto (.xml, .json) · Excel (.xlsx) · Traffic logs (.csv, .tsv)
                </div>
              </div>
          }
        </div>

        {/* File List */}
        {files.length > 0 && (
          <div style={STYLES.fileList}>
            {files.map((f) => (
              <div key={f.name} style={STYLES.fileItem}>
                <span style={{ fontSize: '0.85rem', color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{f.name}</span>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 8 }}>
                  <span style={STYLES.badge(fileTypes[f.name] || 'config')} onClick={() => toggleType(f.name)} title="Click to toggle type">
                    {fileTypes[f.name] || 'config'}
                  </span>
                  <button onClick={() => removeFile(f.name)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1rem' }}>✕</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Column Mapping (shown for log files) */}
        {hasLogFiles && (
          <div style={STYLES.section}>
            <div style={STYLES.sectionTitle}>Traffic Log Column Mapping</div>
            <div style={STYLES.grid}>
              {(['sourceIP', 'destIP', 'protocol', 'sourcePort', 'destPort', 'timestamp'] as const).map((field) => (
                <div key={field}>
                  <div style={STYLES.label}>{field}</div>
                  <input
                    style={STYLES.input}
                    value={mapping[field] || ''}
                    onChange={(e) => setMapping((p) => ({ ...p, [field]: e.target.value }))}
                    placeholder={`Column name for ${field}`}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Upload Button */}
        <button style={STYLES.btn(uploading || files.length === 0)} onClick={handleUpload} disabled={uploading || files.length === 0}>
          {uploading ? '⏳ Processing...' : '🚀 Upload & Build Diagram'}
        </button>

        {/* Progress */}
        {uploading && (
          <div style={STYLES.progress}>
            <div style={STYLES.bar(progress)} />
            <div style={STYLES.status}>{statusMsg} ({progress}%)</div>
          </div>
        )}

        {error && <div style={STYLES.error}>❌ {error}</div>}

        {/* Quick link to diagram if already built */}
        {!uploading && (
          <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
            <button onClick={() => navigate('/diagram')} style={{ background: 'none', border: 'none', color: '#7c3aed', cursor: 'pointer', fontSize: '0.85rem', textDecoration: 'underline' }}>
              → View existing diagram
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
