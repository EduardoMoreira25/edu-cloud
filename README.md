# eduCloud

A self-hosted personal cloud storage web app. Browse, upload, preview, and manage files on your own server through a clean dark-themed UI.

## Features

- **File browser** — navigate folders with breadcrumb trail
- **Upload** — multi-file upload with a real-time progress card and cancel option
- **Download** — download any file directly from the browser
- **Delete** — delete files or folders (with confirmation)
- **New folder** — create folders from the UI
- **Search** — search files by name across the entire storage root
- **Preview** — in-browser preview for:
  - Images (jpg, jpeg, png, gif, webp, svg, bmp)
  - Videos (mp4, webm, mov — streamed directly; mkv — audio transcoded to AAC on the fly)
  - Audio (mp3, wav, ogg, m4a)
  - PDF
  - Text / Markdown
- **Thumbnails** — image and video cards display a generated thumbnail instead of a generic icon
- **Folder colors** — customize individual folder icon colors (8 presets, persisted in localStorage)
- **Mobile responsive** — header collapses to icon-only buttons on small screens, search moves to a second row

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Lucide icons, Axios |
| Backend | Python 3.11, FastAPI, Uvicorn |
| Media | FFmpeg (MKV streaming + video thumbnails), Pillow (image thumbnails) |
| Serving | Nginx (frontend), Uvicorn (backend API) |
| Deployment | Docker, Docker Compose |

## Project Structure

```
educloud/
├── frontend/
│   ├── src/
│   │   ├── App.jsx        # entire UI
│   │   └── index.css      # CSS variables + media queries
│   ├── Dockerfile         # Vite build → Nginx
│   └── nginx.conf
├── backend/
│   ├── main.py            # FastAPI routes
│   └── Dockerfile         # python:3.11-slim + ffmpeg + pillow
└── docker-compose.yml
```

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/cloud/files` | List directory contents |
| GET | `/api/cloud/files/search` | Search files by name |
| GET | `/api/cloud/files/download` | Download a file |
| GET | `/api/cloud/files/preview` | Serve a file for in-browser preview |
| GET | `/api/cloud/files/stream` | Stream MKV with audio transcoded to AAC |
| GET | `/api/cloud/files/thumbnail` | Generate and serve a cached JPEG thumbnail |
| POST | `/api/cloud/files/upload` | Upload a file to a directory |
| POST | `/api/cloud/files/mkdir` | Create a new folder |
| DELETE | `/api/cloud/files` | Delete a file or folder |

## Running

### Requirements

- Docker
- Docker Compose
- An external Docker network named `proxy-net` (used for reverse proxy routing) - see docker-compose.yml

### Start

```bash
docker compose up --build -d
```

### Stop

```bash
docker compose down
```

### Rebuild a single service

```bash
docker compose up --build -d frontend
docker compose up --build -d backend
```

## Configuration

- **Storage root** — set in `backend/main.py` as `ROOT = Path("/mnt/ssd/Personal")`. Change this to point at your storage directory.
- **Network IPs** — frontend and backend are assigned static IPs on `proxy-net` in `docker-compose.yml`. Adjust if they conflict with your setup.
- **Thumbnail cache** — stored in `/tmp/educloud_thumbs/` inside the backend container. Cache is keyed by file path + modification time, so it invalidates automatically when a file changes.

## Notes

- MKV files with EAC3/AC3 audio (common in TV rips) are transcoded to AAC on the fly using FFmpeg. Only the audio stream is re-encoded; video is copied as-is, keeping CPU usage low.
- Thumbnail generation happens on first access and is then served from disk cache. No thumbnails are pre-generated at startup.
- Folder colors are stored in the browser's `localStorage` and are per-device.
