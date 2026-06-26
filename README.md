# 🏏 CreaseCam

<div align="center">

**The ultimate cricket match companion — record, track, and relive every delivery.**

[![PWA Ready](https://img.shields.io/badge/PWA-Ready-5A0FC8?style=for-the-badge&logo=pwa&logoColor=white)](https://web.dev/progressive-web-apps/)
[![Offline Support](https://img.shields.io/badge/Offline-Supported-22c55e?style=for-the-badge&logo=wifi&logoColor=white)](#offline-support)
[![IndexedDB](https://img.shields.io/badge/Storage-IndexedDB-f97316?style=for-the-badge&logo=databricks&logoColor=white)](#storage-architecture)
[![Supabase](https://img.shields.io/badge/Backend-Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](#backend)

</div>

---

## 📖 Overview

CreaseCam is a **Progressive Web App (PWA)** built for cricket enthusiasts who want to capture and track every moment of a match. From ball-by-ball video recording to live score tracking, CreaseCam brings a professional broadcast feel to your local game — all from your phone.

Whether you're scoring an over in the nets or filming a club final, CreaseCam has you covered — **even without an internet connection**.

![CreaseCam Home](https://raw.githubusercontent.com/Nvn-One-Eyed-Eagle/portfolio/main/assets/creasecam1.png)

---

## ✨ Features

### 🎥 Video Recording
Record video clips for every ball and automatically tag them with match metadata — player name, ball type, runs scored, and ball number. All videos are stored locally in IndexedDB and can be exported or synced to the backend when connectivity is restored.

### 📊 Live Scoring
Track innings, overs, runs, wickets, and ball-by-ball outcomes in real time across a full match lifecycle — from toss to match summary.

### 📴 Offline-First
CreaseCam works fully offline. All match data, videos, and player photos are stored on-device and sync automatically when you reconnect.

### 📲 Install to Home Screen
Add CreaseCam to your home screen on any device for a native app experience — no app store required.

### 🔔 Notifications
Get notified when videos are saved, sync completes, or the app needs your attention — all through the browser's native notification system.

### ☁️ Cloud Sync
Match data syncs seamlessly to **Supabase** in the background. Videos can be uploaded to your backend API endpoint when online.

---

## 🗂️ App Structure

```
CreaseCam/
├── index.html            # Home / match setup
├── team.html             # Team management
├── match.html            # Live match & video recording
├── inning-over.html      # Inning summary
├── oversummary.html      # Over summary
├── matchover.html        # Match end screen
├── match_summary.html    # Full match report
│
├── manifest.json         # PWA manifest
├── sw.js                 # Service worker (caching & sync)
├── pwa-utils.js          # Core PWA utilities
└── pwa-video-helpers.js  # Video recording & management
```

---

## 📦 Storage Architecture

CreaseCam uses a layered storage system to ensure no data is ever lost.

### IndexedDB — `cricketMediaDB`

| Store | Key Fields |
|---|---|
| `videos` | `id`, `blob`, `ballNumber`, `playerName`, `ballType`, `runs` |
| `images` | `id`, `blob`, `playerName`, `captureTime` |
| `recordings` | `id` (auto), `blob`, `metadata` |

### LocalStorage

| Key | Contents |
|---|---|
| `team1` / `team2` | Team rosters and data |
| `overs` | Match overs configuration |
| `inning` | Current inning state |
| `pwa_video_log` | Video metadata log |
| `match_videos` | Video ID references |

### Cache Storage

| Cache | Strategy |
|---|---|
| `STATIC_CACHE` | HTML, CSS, JS — stale-while-revalidate |
| `DYNAMIC_CACHE` | Runtime resources |
| `OFFLINE_CACHE` | Fallback pages for offline use |

---

## ⚙️ PWA Utilities

### `PWAUtils`
The core utility object, initialized on every page.

```javascript
PWAUtils.init()                          // Boot PWA
PWAUtils.installPWA()                    // Trigger install prompt
PWAUtils.isConnected()                   // Check online status
PWAUtils.showNotification(title, opts)   // Send a notification
PWAUtils.getStorageQuota()               // Check storage usage
PWAUtils.exportAllData()                 // Backup all data
PWAUtils.importData(file)                // Restore from backup
PWAUtils.MediaDB.saveVideo(blob, meta)   // Store a video blob
PWAUtils.MediaDB.getAllVideos()          // Retrieve all videos
```

### `PWAVideoHelpers`
Dedicated helpers for the video recording workflow in `match.html`.

```javascript
PWAVideoHelpers.saveRecordedVideo(blob, metadata)
PWAVideoHelpers.getVideoURL(videoId)
PWAVideoHelpers.getAllMatchVideos()
PWAVideoHelpers.getVideoStorageStats()
PWAVideoHelpers.exportAllVideos(filename)
PWAVideoHelpers.syncVideosToServer(apiEndpoint, onProgress)
PWAVideoHelpers.createVideoPreviewCard(video)
```

---

## 🚀 Getting Started

### 1. Clone and serve
```bash
git clone https://github.com/your-username/creasecam.git
cd creasecam

# Serve locally (PWA requires a server context)
npx serve .
```

> ⚠️ PWA features (service workers, install prompts) require **HTTPS** in production. `localhost` is the only exception.

### 2. Configure Supabase
In `index.html`, initialize your Supabase client with your project URL and anon key:

```javascript
const supabase = createClient('YOUR_SUPABASE_URL', 'YOUR_ANON_KEY')
```

### 3. (Optional) Set up video upload endpoint
Create a backend endpoint at `/api/upload-video` that accepts a `POST` request with `FormData` containing the video blob and metadata. Returns `200 OK` on success.

### 4. Deploy with HTTPS
Deploy to any static host (Vercel, Netlify, GitHub Pages) to enable the full PWA experience including installability and background sync.

---

## 🧪 Testing & Debugging

Open your browser's DevTools console and run:

```javascript
// Check app info and PWA status
await PWAUtils.getAppInfo()

// Check video storage
await PWAVideoHelpers.getVideoStorageStats()

// Check device storage quota
await PWAUtils.getStorageQuota()
```

To test offline mode: **DevTools → Network tab → set to "Offline"**, then navigate through the app.

---

## 📊 Performance & Storage Estimates

| Resource | Estimated Size |
|---|---|
| PWA JS overhead (total) | ~32 KB |
| 30-second video clip | 5–10 MB |
| Player photo | 500 KB–2 MB |
| Match metadata | < 1 MB |
| **Full match (est.)** | **~20–30 MB** |

---

## 🌐 Browser Support

| Feature | Chrome | Firefox | Safari | Edge |
|---|:---:|:---:|:---:|:---:|
| PWA Install | ✅ | ✅ | ✅ | ✅ |
| Service Worker | ✅ | ✅ | ✅ | ✅ |
| IndexedDB | ✅ | ✅ | ✅ | ✅ |
| Background Sync | ✅ | ❌ | ❌ | ✅ |
| Push Notifications | ✅ | ✅ | ❌ | ✅ |

---

## 🛣️ Roadmap

- [x] Offline-first architecture
- [x] Ball-by-ball video recording with metadata
- [x] Supabase sync integration
- [x] PWA install support
- [ ] Live match sharing via unique URL
- [ ] Highlight reel auto-generation
- [ ] AI-powered shot classification
- [ ] Multi-match history dashboard

---

## 🤝 Contributing

Contributions are welcome! Please open an issue to discuss your idea before submitting a pull request.

1. Fork the repo
2. Create your branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m 'Add my feature'`
4. Push to the branch: `git push origin feature/my-feature`
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License. See [`LICENSE`](LICENSE) for details.

---

<div align="center">

Made with ❤️ for cricket lovers everywhere.

**CreaseCam** — *Every ball tells a story.*

</div>
