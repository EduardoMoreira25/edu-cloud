import React, { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import {
  Folder, File, Image, Film, Music, FileText, Download,
  Trash2, Upload, Search, X, ChevronRight, Home, Cloud,
  FolderPlus, Palette, Link2, MoveRight
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

const getParentPath = (itemPath) => {
  const parts = itemPath.split('/').filter(Boolean)
  parts.pop()
  return parts.length === 0 ? '/' : '/' + parts.join('/')
}

const pickerBreadcrumbs = (pickerPath) => {
  const crumbs = [{ name: 'Personal', path: '/' }]
  const rel = pickerPath.replace(/^\//, '')
  if (rel) {
    let cur = '/'
    for (const part of rel.split('/')) {
      cur = cur === '/' ? '/' + part : cur + '/' + part
      crumbs.push({ name: part, path: cur })
    }
  }
  return crumbs
}

export default function App() {
  const [path, setPath] = useState('/')
  const [items, setItems] = useState([])
  const [breadcrumbs, setBreadcrumbs] = useState([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState(null)

  const [preview, setPreview] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [transfer, setTransfer] = useState(null)
  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [folderColors, setFolderColors] = useState({})
  const [colorPickerOpen, setColorPickerOpen] = useState(null)
  const [thumbErrors, setThumbErrors] = useState(new Set())
  const [folderPicker, setFolderPicker] = useState(null) // { mode, item|null, pickerPath }
  const [pickerItems, setPickerItems] = useState([])
  const [pickerLoading, setPickerLoading] = useState(false)
  const [selected, setSelected] = useState(new Set())
  const fileInput = useRef()
  const abortRef = useRef(null)
  const longPressTimer = useRef(null)

  const load = async (p) => {
    setLoading(true)
    setSearchResults(null)
    setSearch('')
    setSelected(new Set())
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

  useEffect(() => {
    axios.get(`${API}/meta/folder-colors`).then(r => setFolderColors(r.data)).catch(() => {})
  }, [])

  const handleSearch = async () => {
    if (!search.trim()) return
    try {
      const res = await axios.get(`${API}/files/search`, { params: { q: search } })
      setSearchResults(res.data.results)
    } catch (e) { console.error(e) }
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

  const FOLDER_COLORS = ['#e8732a','#4a9eff','#4a8c6a','#9b59b6','#e05555','#2aa8a8','#e8c12a','#888888']

  const saveFolderColor = async (folderPath, color) => {
    setFolderColors(prev => ({ ...prev, [folderPath]: color }))
    setColorPickerOpen(null)
    await axios.patch(`${API}/meta/folder-color`, { path: folderPath, color })
  }

  const loadPickerPath = async (p) => {
    setPickerLoading(true)
    try {
      const res = await axios.get(`${API}/files`, { params: { path: p } })
      setPickerItems(res.data.items.filter(i => i.is_dir))
      setFolderPicker(prev => ({ ...prev, pickerPath: p }))
    } catch (e) { console.error(e) }
    setPickerLoading(false)
  }

  const openFolderPicker = (mode, item) => {
    setFolderPicker({ mode, item, pickerPath: '/' })
    loadPickerPath('/')
  }

  const handleMove = async () => {
    const { item, pickerPath } = folderPicker
    try {
      await axios.post(`${API}/files/move`, null, { params: { src: item.path, dest_dir: pickerPath } })
      setFolderPicker(null)
      load(path)
    } catch (e) {
      alert(e.response?.data?.detail || 'Move failed')
    }
  }

  const handleSymlink = async () => {
    const { item, pickerPath } = folderPicker
    try {
      await axios.post(`${API}/files/symlink`, null, { params: { src: item.path, dest_dir: pickerPath } })
      setFolderPicker(null)
      load(path)
    } catch (e) {
      alert(e.response?.data?.detail || 'Link failed')
    }
  }

  const toggleSelect = (itemPath) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(itemPath) ? next.delete(itemPath) : next.add(itemPath)
      return next
    })
  }

  const handleBulkDelete = async () => {
    if (!window.confirm(`Delete ${selected.size} item(s)?`)) return
    await Promise.all([...selected].map(p => axios.delete(`${API}/files`, { params: { path: p } })))
    setSelected(new Set())
    load(path)
  }

  const handleBulkDownload = async () => {
    const filePaths = [...selected].filter(p => {
      const item = (searchResults || items).find(i => i.path === p)
      return item && !item.is_dir
    })
    if (!filePaths.length) return
    const res = await axios.post(`${API}/files/download-zip`, filePaths, { responseType: 'blob' })
    const url = URL.createObjectURL(res.data)
    const a = document.createElement('a')
    a.href = url
    a.download = 'download.zip'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleBulkMove = async (destDir) => {
    await Promise.all([...selected].map(p => axios.post(`${API}/files/move`, null, { params: { src: p, dest_dir: destDir } })))
    setFolderPicker(null)
    setSelected(new Set())
    load(path)
  }

  const handleBulkSymlink = async (destDir) => {
    await Promise.all([...selected].map(p => axios.post(`${API}/files/symlink`, null, { params: { src: p, dest_dir: destDir } })))
    setFolderPicker(null)
    setSelected(new Set())
    load(path)
  }

  const bulkBtnStyle = {
    background: 'var(--surface-hover)',
    border: 'none',
    borderRadius: '8px',
    padding: '0.4rem 0.75rem',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    color: 'var(--text)',
    fontFamily: 'Space Grotesk, sans-serif'
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
        <div
          onClick={() => load('/')}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginRight: 'auto', cursor: 'pointer' }}
        >
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

              const THUMB_EXTS = ['.jpg','.jpeg','.png','.gif','.webp','.bmp','.mp4','.mkv','.avi','.mov','.webm']
              const showThumb = !item.is_dir && THUMB_EXTS.includes(item.extension || '') && !thumbErrors.has(item.path)

              return (
                <div
                  key={item.path}
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: '10px',
                    padding: '1rem',
                    cursor: (item.is_dir || isPreviewable(item.extension)) ? 'pointer' : 'default',
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
                  onClick={() => {
                    if (!item.is_dir && selected.size > 0) { toggleSelect(item.path); return }
                    if (item.is_dir) { load(item.path); return }
                    if (isPreviewable(item.extension)) setPreview(item)
                  }}
                  onTouchStart={() => {
                    if (item.is_dir) return
                    longPressTimer.current = setTimeout(() => toggleSelect(item.path), 600)
                  }}
                  onTouchEnd={() => clearTimeout(longPressTimer.current)}
                  onTouchMove={() => clearTimeout(longPressTimer.current)}
                >
                  {/* Top-right slot: symlink badge → Eye icon → select circle (priority order, files only) */}
                  {item.is_symlink ? (
                    <div style={{
                      position: 'absolute', top: '0.6rem', right: '0.6rem',
                      background: 'rgba(74,158,255,0.15)',
                      border: '1px solid rgba(74,158,255,0.35)',
                      borderRadius: '4px', padding: '0.15rem 0.3rem',
                      display: 'flex', alignItems: 'center', zIndex: 5
                    }}>
                      <Link2 size={10} color="#4a9eff" />
                    </div>
                  ) : null}

                  {showThumb ? (
                    <img
                      src={`${API}/files/thumbnail?path=${encodeURIComponent(item.path)}`}
                      onError={() => setThumbErrors(prev => new Set([...prev, item.path]))}
                      style={{
                        width: '100%',
                        height: '120px',
                        objectFit: 'cover',
                        borderRadius: '6px',
                        marginBottom: '0.6rem',
                        display: 'block'
                      }}
                    />
                  ) : (
                    <Icon size={28} color={color} style={{ marginBottom: '0.6rem' }} />
                  )}

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
                  <div
                    onClick={e => e.stopPropagation()}
                    style={{
                      display: 'flex',
                      gap: '0.4rem',
                      marginTop: '0.75rem',
                      paddingTop: '0.75rem',
                      borderTop: '1px solid var(--border)',
                      position: 'relative'
                    }}
                  >
                    {/* Left actions */}
                    {!item.is_dir && (
                      <div
                        className="select-circle"
                        onClick={e => { e.stopPropagation(); toggleSelect(item.path) }}
                        style={{
                          width: '16px', height: '16px', borderRadius: '50%', flexShrink: 0,
                          background: selected.has(item.path) ? 'var(--orange)' : 'rgba(30,30,30,0.6)',
                          border: selected.has(item.path) ? '2px solid var(--orange)' : '2px solid rgba(255,255,255,0.25)',
                          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'all 0.15s ease', marginTop: '3px'
                        }}
                      >
                        {selected.has(item.path) && (
                          <span style={{ color: 'white', fontSize: '9px', fontWeight: 700, lineHeight: 1, marginTop: '1px' }}>✓</span>
                        )}
                      </div>
                    )}
                    {!item.is_dir && (
                      <button
                        onClick={e => handleDownload(e, item)}
                        style={{ background: 'var(--surface-hover)', border: 'none', borderRadius: '6px', padding: '0.3rem 0.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                        title="Download"
                      >
                        <Download size={13} color="var(--text-muted)" />
                      </button>
                    )}
                    <button
                      onClick={e => { e.stopPropagation(); openFolderPicker('move', item) }}
                      style={{ background: 'var(--surface-hover)', border: 'none', borderRadius: '6px', padding: '0.3rem 0.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                      title="Move to folder"
                    >
                      <MoveRight size={13} color="var(--text-muted)" />
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); openFolderPicker('symlink', item) }}
                      style={{ background: 'var(--surface-hover)', border: 'none', borderRadius: '6px', padding: '0.3rem 0.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                      title="Link to folder"
                    >
                      <Link2 size={13} color="var(--text-muted)" />
                    </button>

                    {/* Right group: color picker + delete */}
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
                            style={{ background: 'transparent', border: 'none', borderRadius: '6px', padding: '0.3rem 0.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                            title="Change color"
                          >
                            <Palette size={13} color="#666" />
                          </button>
                        </>
                      )}
                      <button
                        onClick={e => { e.stopPropagation(); setDeleteConfirm(item) }}
                        style={{ background: 'transparent', border: 'none', borderRadius: '6px', padding: '0.3rem 0.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
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
            <button onClick={() => setPreview(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
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
            <span style={{ flex: 1, fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)', fontFamily: 'Space Grotesk, sans-serif' }}>
              {transfer.type === 'upload' ? 'Uploading…' : 'Downloading…'}
            </span>
            <button
              onClick={handleCancelTransfer}
              title="Cancel"
              style={{ background: 'var(--border-hover)', border: 'none', borderRadius: '50%', width: '22px', height: '22px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
            >
              <X size={12} color="var(--text-muted)" />
            </button>
          </div>
          <div style={{ padding: '0.85rem 1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {transfer.name}
              </span>
              {transfer.progress !== null && (
                <span style={{ fontSize: '0.75rem', color: transfer.type === 'upload' ? 'var(--green-text)' : 'var(--orange)', fontFamily: 'JetBrains Mono, monospace', flexShrink: 0, fontWeight: 600 }}>
                  {transfer.progress}%
                </span>
              )}
            </div>
            <div style={{ height: '5px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
              {transfer.progress !== null ? (
                <div style={{ height: '100%', width: `${transfer.progress}%`, background: transfer.type === 'upload' ? 'var(--green-text)' : 'var(--orange)', borderRadius: '3px', transition: 'width 0.2s ease' }} />
              ) : (
                <div style={{ height: '100%', width: '40%', background: transfer.type === 'upload' ? 'var(--green-text)' : 'var(--orange)', borderRadius: '3px', animation: 'slide-indeterminate 1.4s ease-in-out infinite' }} />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteConfirm && (
        <div
          onClick={() => setDeleteConfirm(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '2rem', maxWidth: '360px', width: '90%' }}>
            <div style={{ marginBottom: '0.5rem', fontWeight: 500 }}>Delete {deleteConfirm.is_dir ? 'folder' : deleteConfirm.is_symlink ? 'link' : 'file'}?</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.5rem', wordBreak: 'break-word' }}>
              {deleteConfirm.name}
            </div>
            {deleteConfirm.is_dir && !deleteConfirm.is_symlink && (
              <div style={{ color: '#e05555', fontSize: '0.78rem', marginBottom: '1rem' }}>
                All contents will be permanently deleted.
              </div>
            )}
            {deleteConfirm.is_symlink && (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginBottom: '1rem' }}>
                Only the link will be removed. The original file is unaffected.
              </div>
            )}
            <div style={{ marginBottom: '1rem' }} />
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setDeleteConfirm(null)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.5rem 1rem', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif' }}>
                Cancel
              </button>
              <button onClick={() => handleDelete(deleteConfirm)} style={{ background: '#3a1a1a', border: '1px solid #5a2a2a', borderRadius: '8px', padding: '0.5rem 1rem', color: '#e05555', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif' }}>
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
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '2rem', maxWidth: '360px', width: '90%' }}>
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
              style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.5rem 1rem', color: 'var(--text)', fontFamily: 'Space Grotesk, sans-serif', fontSize: '0.85rem', outline: 'none', marginBottom: '1.5rem' }}
            />
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button onClick={() => { setNewFolderOpen(false); setNewFolderName('') }} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.5rem 1rem', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif' }}>
                Cancel
              </button>
              <button
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim()}
                style={{ background: 'var(--orange-dim)', border: '1px solid var(--orange)', borderRadius: '8px', padding: '0.5rem 1rem', color: 'var(--orange)', cursor: newFolderName.trim() ? 'pointer' : 'default', fontFamily: 'Space Grotesk, sans-serif', opacity: newFolderName.trim() ? 1 : 0.4 }}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Folder Picker Modal (move / symlink) */}
      {folderPicker && (
        <div
          onClick={() => setFolderPicker(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', width: '90%', maxWidth: '480px', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 500, fontSize: '0.95rem' }}>
                {folderPicker.mode === 'move' ? 'Move' : 'Link'}{' '}
                <span style={{ color: 'var(--orange)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.85rem' }}>
                  {folderPicker.item ? folderPicker.item.name : `${selected.size} item(s)`}
                </span>
              </span>
              <button onClick={() => setFolderPicker(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={18} color="var(--text-muted)" />
              </button>
            </div>

            {/* Picker breadcrumbs */}
            <div style={{ padding: '0.6rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.25rem', flexWrap: 'wrap', background: 'var(--surface-hover)' }}>
              {pickerBreadcrumbs(folderPicker.pickerPath).map((b, i, arr) => (
                <React.Fragment key={b.path}>
                  {i > 0 && <ChevronRight size={12} color="var(--text-muted)" />}
                  <button
                    onClick={() => loadPickerPath(b.path)}
                    style={{ background: 'none', border: 'none', color: i === arr.length - 1 ? 'var(--orange)' : 'var(--text-muted)', cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.1rem 0' }}
                  >
                    {i === 0 && <Home size={11} />}
                    {b.name}
                  </button>
                </React.Fragment>
              ))}
            </div>

            {/* Folder list */}
            <div style={{ minHeight: '160px', maxHeight: '280px', overflowY: 'auto', padding: '0.5rem' }}>
              {pickerLoading ? (
                <div style={{ padding: '1rem 1.5rem', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.8rem' }}>Loading...</div>
              ) : pickerItems.length === 0 ? (
                <div style={{ padding: '1rem 1.5rem', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.8rem' }}>No subfolders</div>
              ) : pickerItems.map(folder => (
                <button
                  key={folder.path}
                  onClick={() => loadPickerPath(folder.path)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.55rem 1rem', background: 'none', border: 'none', borderRadius: '8px', cursor: 'pointer', color: 'var(--text)', fontFamily: 'Space Grotesk, sans-serif', fontSize: '0.85rem', textAlign: 'left' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  <Folder size={16} color={folderColors[folder.path] || 'var(--orange)'} />
                  {folder.name}
                  <ChevronRight size={13} color="var(--text-muted)" style={{ marginLeft: 'auto' }} />
                </button>
              ))}
            </div>

            {/* Footer */}
            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '0.75rem', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                → {folderPicker.pickerPath}
              </span>
              <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                <button
                  onClick={() => setFolderPicker(null)}
                  style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.5rem 1rem', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', fontSize: '0.85rem' }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const { mode, item, pickerPath } = folderPicker
                    if (item) {
                      mode === 'move' ? handleMove() : handleSymlink()
                    } else {
                      mode === 'move' ? handleBulkMove(pickerPath) : handleBulkSymlink(pickerPath)
                    }
                  }}
                  disabled={folderPicker.mode === 'move' && !!folderPicker.item && folderPicker.pickerPath === getParentPath(folderPicker.item.path)}
                  style={{
                    background: 'var(--orange-dim)',
                    border: '1px solid var(--orange)',
                    borderRadius: '8px',
                    padding: '0.5rem 1rem',
                    color: 'var(--orange)',
                    cursor: (folderPicker.mode === 'move' && !!folderPicker.item && folderPicker.pickerPath === getParentPath(folderPicker.item.path)) ? 'default' : 'pointer',
                    fontFamily: 'Space Grotesk, sans-serif',
                    fontSize: '0.85rem',
                    opacity: (folderPicker.mode === 'move' && !!folderPicker.item && folderPicker.pickerPath === getParentPath(folderPicker.item.path)) ? 0.4 : 1
                  }}
                >
                  {folderPicker.mode === 'move' ? 'Move here' : 'Link here'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div style={{
          position: 'fixed',
          bottom: '1.5rem',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--surface)',
          border: '1px solid var(--border-hover)',
          borderRadius: '12px',
          padding: '0.65rem 1.25rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          zIndex: 150,
          boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
          whiteSpace: 'nowrap'
        }}>
          <span style={{ fontSize: '0.8rem', fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)', paddingRight: '0.5rem' }}>
            {selected.size} selected
          </span>
          <button onClick={handleBulkDownload} style={bulkBtnStyle} title="Download selected">
            <Download size={14} /><span className="header-btn-label">Download</span>
          </button>
          <button onClick={() => { setFolderPicker({ mode: 'move', item: null, pickerPath: '/' }); loadPickerPath('/') }} style={bulkBtnStyle} title="Move selected">
            <MoveRight size={14} /><span className="header-btn-label">Move</span>
          </button>
          <button onClick={() => { setFolderPicker({ mode: 'symlink', item: null, pickerPath: '/' }); loadPickerPath('/') }} style={bulkBtnStyle} title="Link selected">
            <Link2 size={14} /><span className="header-btn-label">Link</span>
          </button>
          <button onClick={handleBulkDelete} style={{ ...bulkBtnStyle, color: '#e05555' }} title="Delete selected">
            <Trash2 size={14} color="#e05555" /><span className="header-btn-label">Delete</span>
          </button>
          <div style={{ width: '1px', height: '18px', background: 'var(--border-hover)', margin: '0 0.25rem' }} />
          <button onClick={() => setSelected(new Set())} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.8rem', fontFamily: 'Space Grotesk, sans-serif' }}>
            Clear
          </button>
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
