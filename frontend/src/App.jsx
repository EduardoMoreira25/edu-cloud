import React, { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import {
  Folder, File, Image, Film, Music, FileText, Download,
  Trash2, Upload, Search, X, ChevronRight, Home, Cloud,
  Eye, FolderPlus, Palette
} from 'lucide-react'

const API = '/api/cloud'

const formatSize = (bytes) => {
  if (!bytes) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB'
  return (bytes / 1024 / 1024 / 1024).toFixed(1) + ' GB'
}

const getFileIcon = (ext) => {
  const images = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp']
  const videos = ['.mp4', '.mkv', '.avi', '.mov', '.webm']
  const audio = ['.mp3', '.wav', '.flac', '.ogg', '.m4a']
  const docs = ['.pdf', '.doc', '.docx', '.txt', '.md']
  if (images.includes(ext)) return { icon: Image, color: '#e8732a' }
  if (videos.includes(ext)) return { icon: Film, color: '#4a8c6a' }
  if (audio.includes(ext)) return { icon: Music, color: '#e8732a' }
  if (docs.includes(ext)) return { icon: FileText, color: '#4a8c6a' }
  return { icon: File, color: '#5a5a5a' }
}

const isPreviewable = (ext) => {
  const previewable = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg',
    '.mp4', '.mkv', '.webm', '.mov', '.mp3', '.wav', '.ogg', '.m4a', '.pdf',
    '.txt', '.md']
  return previewable.includes(ext)
}

export default function App() {
  const [path, setPath] = useState('/')
  const [items, setItems] = useState([])
  const [breadcrumbs, setBreadcrumbs] = useState([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState(null)
  const [searching, setSearching] = useState(false)
  const [preview, setPreview] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [transfer, setTransfer] = useState(null)
  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [folderColors, setFolderColors] = useState(() => {
    try { return JSON.parse(localStorage.getItem('folderColors') || '{}') } catch { return {} }
  })
  const [colorPickerOpen, setColorPickerOpen] = useState(null)
  const fileInput = useRef()
  const abortRef = useRef(null)

  const load = async (p) => {
    setLoading(true)
    setSearchResults(null)
    setSearch('')
    try {
      const res = await axios.get(`${API}/files`, { params: { path: p } })
      setItems(res.data.items)
      setBreadcrumbs(res.data.breadcrumbs)
      setPath(p)
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

  useEffect(() => { load('/') }, [])

  const handleSearch = async () => {
    if (!search.trim()) return
    setSearching(true)
    try {
      const res = await axios.get(`${API}/files/search`, { params: { q: search } })
      setSearchResults(res.data.results)
    } catch (e) { console.error(e) }
    setSearching(false)
  }

  const handleUpload = async (files) => {
    setUploading(true)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      for (const file of files) {
        const form = new FormData()
        form.append('file', file)
        setTransfer({ type: 'upload', name: file.name, progress: null })
        await axios.post(`${API}/files/upload`, form, {
          params: { path },
          signal: controller.signal,
          onUploadProgress: (e) => {
            setTransfer({ type: 'upload', name: file.name, progress: e.total ? Math.round((e.loaded / e.total) * 100) : null })
          }
        })
      }
    } catch (e) {
      if (!axios.isCancel(e)) console.error(e)
    } finally {
      abortRef.current = null
      setTransfer(null)
      setUploading(false)
      load(path)
    }
  }

  const handleDelete = async (item) => {
    await axios.delete(`${API}/files`, { params: { path: item.path } })
    setDeleteConfirm(null)
    load(path)
  }

  const handleDownload = async (e, item) => {
    e.stopPropagation()
    const controller = new AbortController()
    abortRef.current = controller
    setTransfer({ type: 'download', name: item.name, progress: null })
    try {
      const res = await axios.get(`${API}/files/download`, {
        params: { path: item.path },
        responseType: 'blob',
        signal: controller.signal,
        onDownloadProgress: (ev) => {
          setTransfer({ type: 'download', name: item.name, progress: ev.total ? Math.round((ev.loaded / ev.total) * 100) : null })
        }
      })
      const url = URL.createObjectURL(res.data)
      const link = document.createElement('a')
      link.href = url
      link.download = item.name
      link.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      if (!axios.isCancel(e)) console.error(e)
    } finally {
      abortRef.current = null
      setTransfer(null)
    }
  }

  const handleCancelTransfer = () => {
    if (abortRef.current) abortRef.current.abort()
  }

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return
    try {
      await axios.post(`${API}/files/mkdir`, null, { params: { path, name: newFolderName.trim() } })
      setNewFolderOpen(false)
      setNewFolderName('')
      load(path)
    } catch (e) {
      console.error(e)
    }
  }

  const FOLDER_COLORS = ['#e8732a','#4a9eff','#4a8c6a','#9b59b6','#e05555','#2aa8a8','#e8c12a','#e84a8c']

  const saveFolderColor = (folderPath, color) => {
    const updated = { ...folderColors, [folderPath]: color }
    setFolderColors(updated)
    localStorage.setItem('folderColors', JSON.stringify(updated))
    setColorPickerOpen(null)
  }

  const displayItems = searchResults || items

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Header */}
      <header className="header" style={{
        borderBottom: '1px solid var(--border)',
        padding: '1rem 2rem',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        position: 'sticky',
        top: 0,
        background: 'var(--bg)',
        zIndex: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginRight: 'auto' }}>
          <Cloud size={20} color="var(--orange)" />
          <span style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '1rem',
            letterSpacing: '0.1em',
            color: 'var(--text-muted)'
          }}>
            edu<span style={{ color: 'var(--orange)', fontWeight: 500 }}>Cloud</span>
          </span>
        </div>

        {/* Search */}
        <div className="header-search" style={{ display: 'flex', gap: '0.5rem', flex: 1, maxWidth: '400px' }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="Search files..."
            style={{
              flex: 1,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              padding: '0.5rem 1rem',
              color: 'var(--text)',
              fontFamily: 'Space Grotesk, sans-serif',
              fontSize: '0.85rem',
              outline: 'none'
            }}
          />
          <button onClick={handleSearch} style={{
            background: 'var(--orange)',
            border: 'none',
            borderRadius: '8px',
            padding: '0.5rem 0.75rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center'
          }}>
            <Search size={16} color="white" />
          </button>
          {searchResults && (
            <button onClick={() => { setSearchResults(null); setSearch('') }} style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              padding: '0.5rem 0.75rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center'
            }}>
              <X size={16} color="var(--text-muted)" />
            </button>
          )}
        </div>

        {/* Upload */}
        <button
          onClick={() => fileInput.current.click()}
          disabled={uploading}
          style={{
            background: 'transparent',
            border: '1px solid var(--green)',
            borderRadius: '8px',
            padding: '0.5rem 1rem',
            color: 'var(--green-text)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            fontSize: '0.85rem',
            fontFamily: 'Space Grotesk, sans-serif'
          }}
        >
          <Upload size={15} />
          <span className="header-btn-label">{uploading ? 'Uploading...' : 'Upload'}</span>
        </button>
        <input
          ref={fileInput}
          type="file"
          multiple
          style={{ display: 'none' }}
          onChange={e => handleUpload(Array.from(e.target.files))}
        />

        {/* New Folder */}
        <button
          onClick={() => setNewFolderOpen(true)}
          style={{
            background: 'transparent',
            border: '1px solid var(--border-hover)',
            borderRadius: '8px',
            padding: '0.5rem 1rem',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            fontSize: '0.85rem',
            fontFamily: 'Space Grotesk, sans-serif'
          }}
        >
          <FolderPlus size={15} />
          <span className="header-btn-label">New Folder</span>
        </button>
      </header>

      <div className="main-content" style={{ padding: '1.5rem 2rem' }}>
        {/* Breadcrumbs */}
        {!searchResults && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
            {breadcrumbs.map((b, i) => (
              <React.Fragment key={b.path}>
                {i > 0 && <ChevronRight size={14} color="var(--text-muted)" />}
                <button
                  onClick={() => load(b.path)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: i === breadcrumbs.length - 1 ? 'var(--orange)' : 'var(--text-muted)',
                    cursor: 'pointer',
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '0.8rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.3rem'
                  }}
                >
                  {i === 0 && <Home size={13} />}
                  {b.name}
                </button>
              </React.Fragment>
            ))}
          </div>
        )}

        {/* Search header */}
        {searchResults && (
          <div style={{ marginBottom: '1.5rem', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {searchResults.length} results for "<span style={{ color: 'var(--orange)' }}>{search}</span>"
          </div>
        )}

        {/* File grid */}
        {loading ? (
          <div style={{ color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.8rem' }}>Loading...</div>
        ) : displayItems.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.8rem' }}>Empty folder</div>
        ) : (
          <div className="file-grid" style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: '0.75rem'
          }}>
            {displayItems.map(item => {
              const { icon: Icon, color } = item.is_dir
                ? { icon: Folder, color: folderColors[item.path] || 'var(--orange)' }
                : getFileIcon(item.extension || '')

              return (
                <div
                  key={item.path}
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: '10px',
                    padding: '1rem',
                    cursor: item.is_dir ? 'pointer' : 'default',
                    transition: 'all 0.2s ease',
                    position: 'relative'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = 'var(--border-hover)'
                    e.currentTarget.style.background = 'var(--surface-hover)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = 'var(--border)'
                    e.currentTarget.style.background = 'var(--surface)'
                  }}
                  onClick={() => item.is_dir && load(item.path)}
                >
                  <Icon size={28} color={color} style={{ marginBottom: '0.6rem' }} />
                  <div style={{
                    fontSize: '0.82rem',
                    fontWeight: 500,
                    marginBottom: '0.2rem',
                    wordBreak: 'break-word',
                    lineHeight: 1.3
                  }}>
                    {item.name}
                  </div>
                  {item.size && (
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      {formatSize(item.size)}
                    </div>
                  )}

                  {/* Actions */}
                  <div style={{
                    display: 'flex',
                    gap: '0.4rem',
                    marginTop: '0.75rem',
                    paddingTop: '0.75rem',
                    borderTop: '1px solid var(--border)',
                    position: 'relative'
                  }}>
                    {!item.is_dir && isPreviewable(item.extension) && (
                      <button
                        onClick={e => { e.stopPropagation(); setPreview(item) }}
                        style={{
                          background: 'var(--orange-dim)',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '0.3rem 0.5rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center'
                        }}
                        title="Preview"
                      >
                        <Eye size={13} color="var(--orange)" />
                      </button>
                    )}
                    {!item.is_dir && (
                      <button
                        onClick={e => handleDownload(e, item)}
                        style={{
                          background: 'var(--surface-hover)',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '0.3rem 0.5rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center'
                        }}
                        title="Download"
                      >
                        <Download size={13} color="var(--text-muted)" />
                      </button>
                    )}

                    {/* Folder color + delete grouped on the right */}
                    <div style={{ display: 'flex', gap: '0.3rem', marginLeft: 'auto', alignItems: 'center' }}>
                      {item.is_dir && (
                        <>
                          {colorPickerOpen === item.path && (
                            <div
                              onClick={e => e.stopPropagation()}
                              style={{
                                position: 'absolute',
                                bottom: '2.2rem',
                                right: 0,
                                background: 'var(--surface-hover)',
                                border: '1px solid var(--border-hover)',
                                borderRadius: '8px',
                                padding: '0.4rem',
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: '0.35rem',
                                width: '120px',
                                zIndex: 20,
                                boxShadow: '0 4px 16px rgba(0,0,0,0.5)'
                              }}
                            >
                              {FOLDER_COLORS.map(c => (
                                <button
                                  key={c}
                                  onClick={e => { e.stopPropagation(); saveFolderColor(item.path, c) }}
                                  style={{
                                    width: '20px',
                                    height: '20px',
                                    borderRadius: '50%',
                                    background: c,
                                    border: (folderColors[item.path] || '#e8732a') === c
                                      ? '2px solid white'
                                      : '2px solid transparent',
                                    cursor: 'pointer',
                                    padding: 0
                                  }}
                                />
                              ))}
                            </div>
                          )}
                          <button
                            onClick={e => { e.stopPropagation(); setColorPickerOpen(colorPickerOpen === item.path ? null : item.path) }}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              borderRadius: '6px',
                              padding: '0.3rem 0.5rem',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center'
                            }}
                            title="Change color"
                          >
                            <Palette size={13} color="#666" />
                          </button>
                        </>
                      )}
                      <button
                        onClick={e => { e.stopPropagation(); setDeleteConfirm(item) }}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '0.3rem 0.5rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center'
                        }}
                        title="Delete"
                      >
                        <Trash2 size={13} color="#666" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Preview Modal */}
      {preview && (
        <div
          onClick={() => setPreview(null)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.9)',
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem'
          }}
        >
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            width: '100%',
            maxWidth: '900px',
            marginBottom: '1rem'
          }}>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              {preview.name}
            </span>
            <button onClick={() => setPreview(null)} style={{
              background: 'none', border: 'none', cursor: 'pointer'
            }}>
              <X size={20} color="var(--text-muted)" />
            </button>
          </div>

          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '900px' }}>
            {['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'].includes(preview.extension) && (
              <img
                src={`${API}/files/preview?path=${encodeURIComponent(preview.path)}`}
                style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain', borderRadius: '8px' }}
              />
            )}
            {['.mp4', '.webm', '.mkv', '.mov'].includes(preview.extension) && (
              <video controls style={{ width: '100%', maxHeight: '80vh', borderRadius: '8px' }}>
                <source src={preview.extension === '.mkv'
                  ? `${API}/files/stream?path=${encodeURIComponent(preview.path)}`
                  : `${API}/files/preview?path=${encodeURIComponent(preview.path)}`}
                />
              </video>
            )}
            {['.mp3', '.wav', '.ogg', '.m4a'].includes(preview.extension) && (
              <audio controls style={{ width: '100%' }}>
                <source src={`${API}/files/preview?path=${encodeURIComponent(preview.path)}`} />
              </audio>
            )}
            {preview.extension === '.pdf' && (
              <iframe
                src={`${API}/files/preview?path=${encodeURIComponent(preview.path)}`}
                style={{ width: '100%', height: '80vh', border: 'none', borderRadius: '8px' }}
              />
            )}
            {['.txt', '.md'].includes(preview.extension) && (
              <TextPreview path={preview.path} />
            )}
          </div>
        </div>
      )}

      {/* Transfer Progress */}
      {transfer && (
        <div style={{
          position: 'fixed',
          bottom: '1.5rem',
          right: '1.5rem',
          background: 'var(--surface)',
          border: '1px solid var(--border-hover)',
          borderRadius: '12px',
          width: '300px',
          zIndex: 200,
          boxShadow: '0 12px 32px rgba(0,0,0,0.7)',
          overflow: 'hidden'
        }}>
          {/* Card header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.75rem 1rem',
            borderBottom: '1px solid var(--border)',
            background: 'var(--surface-hover)'
          }}>
            {transfer.type === 'upload'
              ? <Upload size={14} color="var(--green-text)" />
              : <Download size={14} color="var(--orange)" />}
            <span style={{
              flex: 1,
              fontSize: '0.82rem',
              fontWeight: 600,
              color: 'var(--text)',
              fontFamily: 'Space Grotesk, sans-serif'
            }}>
              {transfer.type === 'upload' ? 'Uploading…' : 'Downloading…'}
            </span>
            <button
              onClick={handleCancelTransfer}
              title="Cancel"
              style={{
                background: 'var(--border-hover)',
                border: 'none',
                borderRadius: '50%',
                width: '22px',
                height: '22px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              <X size={12} color="var(--text-muted)" />
            </button>
          </div>

          {/* File row */}
          <div style={{ padding: '0.85rem 1rem' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '0.6rem',
              gap: '0.5rem'
            }}>
              <span style={{
                fontSize: '0.78rem',
                color: 'var(--text-muted)',
                fontFamily: 'JetBrains Mono, monospace',
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                {transfer.name}
              </span>
              {transfer.progress !== null && (
                <span style={{
                  fontSize: '0.75rem',
                  color: transfer.type === 'upload' ? 'var(--green-text)' : 'var(--orange)',
                  fontFamily: 'JetBrains Mono, monospace',
                  flexShrink: 0,
                  fontWeight: 600
                }}>
                  {transfer.progress}%
                </span>
              )}
            </div>

            {/* Progress bar */}
            <div style={{ height: '5px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
              {transfer.progress !== null ? (
                <div style={{
                  height: '100%',
                  width: `${transfer.progress}%`,
                  background: transfer.type === 'upload' ? 'var(--green-text)' : 'var(--orange)',
                  borderRadius: '3px',
                  transition: 'width 0.2s ease'
                }} />
              ) : (
                <div style={{
                  height: '100%',
                  width: '40%',
                  background: transfer.type === 'upload' ? 'var(--green-text)' : 'var(--orange)',
                  borderRadius: '3px',
                  animation: 'slide-indeterminate 1.4s ease-in-out infinite'
                }} />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteConfirm && (
        <div
          onClick={() => setDeleteConfirm(null)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.8)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              padding: '2rem',
              maxWidth: '360px',
              width: '90%'
            }}
          >
            <div style={{ marginBottom: '0.5rem', fontWeight: 500 }}>Delete {deleteConfirm.is_dir ? 'folder' : 'file'}?</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.5rem', wordBreak: 'break-word' }}>
              {deleteConfirm.name}
            </div>
            {deleteConfirm.is_dir && (
              <div style={{ color: '#e05555', fontSize: '0.78rem', marginBottom: '1rem' }}>
                All contents will be permanently deleted.
              </div>
            )}
            <div style={{ marginBottom: '1rem' }} />
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setDeleteConfirm(null)}
                style={{
                  background: 'none',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  padding: '0.5rem 1rem',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontFamily: 'Space Grotesk, sans-serif'
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                style={{
                  background: '#3a1a1a',
                  border: '1px solid #5a2a2a',
                  borderRadius: '8px',
                  padding: '0.5rem 1rem',
                  color: '#e05555',
                  cursor: 'pointer',
                  fontFamily: 'Space Grotesk, sans-serif'
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      {/* New Folder Modal */}
      {newFolderOpen && (
        <div
          onClick={() => { setNewFolderOpen(false); setNewFolderName('') }}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.8)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              padding: '2rem',
              maxWidth: '360px',
              width: '90%'
            }}
          >
            <div style={{ marginBottom: '1rem', fontWeight: 500 }}>New folder</div>
            <input
              autoFocus
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleCreateFolder()
                if (e.key === 'Escape') { setNewFolderOpen(false); setNewFolderName('') }
              }}
              placeholder="Folder name"
              style={{
                width: '100%',
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '0.5rem 1rem',
                color: 'var(--text)',
                fontFamily: 'Space Grotesk, sans-serif',
                fontSize: '0.85rem',
                outline: 'none',
                marginBottom: '1.5rem'
              }}
            />
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setNewFolderOpen(false); setNewFolderName('') }}
                style={{
                  background: 'none',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  padding: '0.5rem 1rem',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontFamily: 'Space Grotesk, sans-serif'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim()}
                style={{
                  background: 'var(--orange-dim)',
                  border: '1px solid var(--orange)',
                  borderRadius: '8px',
                  padding: '0.5rem 1rem',
                  color: 'var(--orange)',
                  cursor: newFolderName.trim() ? 'pointer' : 'default',
                  fontFamily: 'Space Grotesk, sans-serif',
                  opacity: newFolderName.trim() ? 1 : 0.4
                }}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function TextPreview({ path }) {
  const [text, setText] = useState('')
  useEffect(() => {
    axios.get(`${API}/files/preview?path=${encodeURIComponent(path)}`, { responseType: 'text' })
      .then(r => setText(r.data))
  }, [path])
  return (
    <pre style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: '8px',
      padding: '1.5rem',
      color: 'var(--text)',
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: '0.82rem',
      maxHeight: '80vh',
      overflow: 'auto',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word'
    }}>
      {text}
    </pre>
  )
}