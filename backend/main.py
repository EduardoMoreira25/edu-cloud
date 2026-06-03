from fastapi import FastAPI, HTTPException, UploadFile, File, Query
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
import os
import shutil
import subprocess
from pathlib import Path
from typing import Optional

app = FastAPI(title="eduCloud API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

ROOT = Path("/mnt/ssd/Personal")

def resolve(path: str) -> Path:
    resolved = (ROOT / path.lstrip("/")).resolve()
    if not str(resolved).startswith(str(ROOT)):
        raise HTTPException(status_code=403, detail="Access denied")
    return resolved

def file_info(p: Path, root: Path) -> dict:
    stat = p.stat()
    return {
        "name": p.name,
        "path": "/" + str(p.relative_to(root)),
        "is_dir": p.is_dir(),
        "size": stat.st_size if p.is_file() else None,
        "modified": stat.st_mtime,
        "extension": p.suffix.lower() if p.is_file() else None,
    }

@app.get("/files")
def list_files(path: str = "/"):
    target = resolve(path)
    if not target.exists():
        raise HTTPException(status_code=404, detail="Path not found")
    if not target.is_dir():
        raise HTTPException(status_code=400, detail="Not a directory")
    
    items = []
    for p in sorted(target.iterdir(), key=lambda x: (not x.is_dir(), x.name.lower())):
        try:
            items.append(file_info(p, ROOT))
        except:
            continue
    
    # Build breadcrumbs
    rel = Path(path.lstrip("/"))
    breadcrumbs = [{"name": "Personal", "path": "/"}]
    current = Path("/")
    for part in rel.parts:
        current = current / part
        breadcrumbs.append({"name": part, "path": str(current)})
    
    return {"path": path, "items": items, "breadcrumbs": breadcrumbs}

@app.get("/files/download")
def download_file(path: str):
    target = resolve(path)
    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(
        path=target,
        filename=target.name,
        media_type="application/octet-stream"
    )

@app.get("/files/preview")
def preview_file(path: str):
    target = resolve(path)
    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path=target, filename=target.name)

@app.get("/files/stream")
def stream_file(path: str):
    target = resolve(path)
    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    cmd = [
        "ffmpeg", "-i", str(target),
        "-c:v", "copy",
        "-c:a", "aac", "-b:a", "192k",
        "-f", "mp4", "-movflags", "frag_keyframe+empty_moov",
        "pipe:1"
    ]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    def generate():
        try:
            while chunk := proc.stdout.read(65536):
                yield chunk
        finally:
            proc.kill()
            proc.wait()
    return StreamingResponse(generate(), media_type="video/mp4")

@app.post("/files/upload")
async def upload_file(path: str = "/", file: UploadFile = File(...)):
    target_dir = resolve(path)
    if not target_dir.is_dir():
        raise HTTPException(status_code=400, detail="Target is not a directory")
    dest = target_dir / file.filename
    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)
    return {"message": "Uploaded", "path": "/" + str(dest.relative_to(ROOT))}

@app.post("/files/mkdir")
def make_directory(path: str = "/", name: str = ""):
    if not name.strip():
        raise HTTPException(status_code=400, detail="Name is required")
    parent = resolve(path)
    if not parent.is_dir():
        raise HTTPException(status_code=400, detail="Parent is not a directory")
    new_dir = parent / name.strip()
    if new_dir.exists():
        raise HTTPException(status_code=409, detail="Already exists")
    new_dir.mkdir()
    return {"message": "Created", "path": "/" + str(new_dir.relative_to(ROOT))}

@app.delete("/files")
def delete_file(path: str):
    target = resolve(path)
    if not target.exists():
        raise HTTPException(status_code=404, detail="Not found")
    if target.is_dir():
        shutil.rmtree(target)
    else:
        target.unlink()
    return {"message": "Deleted"}

@app.get("/files/search")
def search_files(q: str = Query(..., min_length=1)):
    results = []
    for p in ROOT.rglob("*"):
        if q.lower() in p.name.lower():
            try:
                results.append(file_info(p, ROOT))
            except:
                continue
        if len(results) >= 100:
            break
    return {"query": q, "results": results}
