from fastapi import FastAPI, HTTPException, UploadFile, File, Query, Body
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import io
import json
import shutil
import subprocess
import hashlib
import zipfile
from pathlib import Path
from typing import Optional, List
from PIL import Image

THUMB_CACHE = Path("/tmp/educloud_thumbs")
THUMB_CACHE.mkdir(exist_ok=True)

THUMB_IMAGE_EXTS = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'}
THUMB_VIDEO_EXTS = {'.mp4', '.mkv', '.avi', '.mov', '.webm'}

app = FastAPI(title="eduCloud API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

ROOT = Path("/mnt/ssd/Personal")
META_DIR = ROOT / ".educloud"
COLORS_FILE = META_DIR / "folder_colors.json"

def _ensure_meta():
    META_DIR.mkdir(exist_ok=True)
    if not COLORS_FILE.exists():
        COLORS_FILE.write_text("{}")

_ensure_meta()

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
        "is_symlink": p.is_symlink(),
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
        if p.name == '.educloud':
            continue
        try:
            items.append(file_info(p, ROOT))
        except:
            continue

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
    return FileResponse(path=target, filename=target.name, media_type="application/octet-stream")

@app.get("/files/preview")
def preview_file(path: str):
    target = resolve(path)
    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path=target, filename=target.name)

@app.get("/files/thumbnail")
def get_thumbnail(path: str):
    target = resolve(path)
    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    ext = target.suffix.lower()
    if ext not in THUMB_IMAGE_EXTS and ext not in THUMB_VIDEO_EXTS:
        raise HTTPException(status_code=400, detail="Not a supported media file")
    mtime = target.stat().st_mtime
    cache_key = hashlib.md5(f"{path}{mtime}".encode()).hexdigest()
    cache_file = THUMB_CACHE / f"{cache_key}.jpg"
    if not cache_file.exists():
        if ext in THUMB_IMAGE_EXTS:
            _make_image_thumb(target, cache_file)
        else:
            _make_video_thumb(target, cache_file)
    if not cache_file.exists():
        raise HTTPException(status_code=500, detail="Thumbnail generation failed")
    return FileResponse(cache_file, media_type="image/jpeg")

def _make_image_thumb(src: Path, dest: Path):
    with Image.open(src) as img:
        img.thumbnail((300, 300))
        img.convert("RGB").save(dest, "JPEG", quality=75)

def _make_video_thumb(src: Path, dest: Path):
    for seek in ["00:00:05", "00:00:00"]:
        subprocess.run(
            ["ffmpeg", "-ss", seek, "-i", str(src), "-vframes", "1",
             "-vf", "scale=300:-1", "-f", "image2", str(dest), "-y"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
        )
        if dest.exists():
            break

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
    # Resolve parent only — do not follow the final component if it's a symlink
    p = ROOT / path.lstrip("/")
    try:
        parent = p.parent.resolve(strict=True)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Not found")
    if not str(parent).startswith(str(ROOT)):
        raise HTTPException(status_code=403, detail="Access denied")
    target = parent / p.name
    if not str(target).startswith(str(ROOT)):
        raise HTTPException(status_code=403, detail="Access denied")
    if not target.exists() and not target.is_symlink():
        raise HTTPException(status_code=404, detail="Not found")
    if target.is_symlink() or target.is_file():
        target.unlink()
    else:
        shutil.rmtree(target)
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

@app.post("/files/move")
def move_file(src: str, dest_dir: str):
    src_path = resolve(src)
    dest_path = resolve(dest_dir)
    if not src_path.exists():
        raise HTTPException(status_code=404, detail="Source not found")
    if not dest_path.is_dir():
        raise HTTPException(status_code=400, detail="Destination is not a directory")
    dest_file = dest_path / src_path.name
    if dest_file.exists():
        raise HTTPException(status_code=409, detail="A file with that name already exists in the destination")
    shutil.move(str(src_path), str(dest_file))
    return {"message": "Moved", "path": "/" + str(dest_file.relative_to(ROOT))}

@app.post("/files/symlink")
def create_symlink(src: str, dest_dir: str):
    src_path = resolve(src)
    dest_path = resolve(dest_dir)
    if not src_path.exists():
        raise HTTPException(status_code=404, detail="Source not found")
    if not dest_path.is_dir():
        raise HTTPException(status_code=400, detail="Destination is not a directory")
    link_path = dest_path / src_path.name
    if link_path.exists() or link_path.is_symlink():
        raise HTTPException(status_code=409, detail="A file with that name already exists in the destination")
    rel_target = os.path.relpath(str(src_path), str(dest_path))
    os.symlink(rel_target, str(link_path))
    return {"message": "Linked", "path": "/" + str(link_path.relative_to(ROOT))}

@app.post("/files/download-zip")
def download_zip(paths: List[str] = Body(...)):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        for path in paths:
            try:
                target = resolve(path)
                if target.is_file():
                    zf.write(target, target.name)
            except:
                continue
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=download.zip"}
    )

@app.get("/meta/folder-colors")
def get_folder_colors():
    _ensure_meta()
    return json.loads(COLORS_FILE.read_text())

class ColorUpdate(BaseModel):
    path: str
    color: str

@app.patch("/meta/folder-color")
def set_folder_color(body: ColorUpdate):
    _ensure_meta()
    colors = json.loads(COLORS_FILE.read_text())
    colors[body.path] = body.color
    COLORS_FILE.write_text(json.dumps(colors))
    return {"ok": True}
