/* ==========================================================================
   VideoDB — IndexedDB wrapper (inlined)
   ========================================================================== */
const VideoDB = (() => {
    const DB_NAME = "cricketVideos";
    const STORE  = "videos";
    const VERSION = 1;
    let db = null;

    function getDB() {
        if (db) return Promise.resolve(db);
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, VERSION);
            req.onupgradeneeded = (e) => {
                const database = e.target.result;
                if (!database.objectStoreNames.contains(STORE)) {
                    database.createObjectStore(STORE);
                }
            };
            req.onsuccess  = (e) => { db = e.target.result; resolve(db); };
            req.onerror    = (e) => reject(e.target.error);
        });
    }

    async function save(base64Video) {
        const database = await getDB();
        const id = "vid_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9);
        return new Promise((resolve, reject) => {
            const tx   = database.transaction(STORE, "readwrite");
            const store = tx.objectStore(STORE);
            const req  = store.put(base64Video, id);
            req.onsuccess = () => resolve(id);
            req.onerror   = (e) => reject(e.target.error);
        });
    }

    async function get(id) {
        const database = await getDB();
        return new Promise((resolve, reject) => {
            const tx   = database.transaction(STORE, "readonly");
            const store = tx.objectStore(STORE);
            const req  = store.get(id);
            req.onsuccess = (e) => resolve(e.target.result || null);
            req.onerror   = (e) => reject(e.target.error);
        });
    }

    async function remove(id) {
        const database = await getDB();
        return new Promise((resolve, reject) => {
            const tx   = database.transaction(STORE, "readwrite");
            const store = tx.objectStore(STORE);
            const req  = store.delete(id);
            req.onsuccess = () => resolve();
            req.onerror   = (e) => reject(e.target.error);
        });
    }

    async function clear() {
        const database = await getDB();
        return new Promise((resolve, reject) => {
            const tx   = database.transaction(STORE, "readwrite");
            const store = tx.objectStore(STORE);
            const req  = store.clear();
            req.onsuccess = () => resolve();
            req.onerror   = (e) => reject(e.target.error);
        });
    }

    return { save, get, remove, clear };
})();

/* ==========================================================================
   highlights / inning-over.js
   ========================================================================== */

function safePlay(video) {
    if (!video) return;
    video.muted = true;
    video.currentTime = 0;
    const p = video.play();
    if (p !== undefined) p.catch(() => {});
}

function safePause(video) {
    if (!video) return;
    video.pause();
}

const end    = localStorage.getItem("end");
const inning = localStorage.getItem("inning"); // "0", "2", or null

const team1 = JSON.parse(localStorage.getItem("team1"));
const team2 = JSON.parse(localStorage.getItem("team2"));

// Pick the team that JUST batted
// First inning  → inning is "0" or null → team1 batted
// Second inning → inning is "2"         → team2 batted
let team;
if (inning === "2") {
    team = team2;
} else {
    team = team1;
}

console.log("[inning-over] inning =", inning, "| loaded team =", team);

/* ==========================================================================
   CHASE WIN DETECTION
   If we are in the 2nd inning, check whether team2 has already beaten team1.
   This can happen mid-over (ball-by-ball check in script.js redirects here),
   so we also check on page load to make sure the result banner is correct.
   ========================================================================== */
let team2WonChase = false;

if (inning === "2" && team1 && team2) {
    const t1Runs = team1.totalruns || 0;
    const t2Runs = team2.totalruns || 0;

    if (t2Runs > t1Runs) {
        team2WonChase = true;
        console.log(`[inning-over] Chase won! Team2 ${t2Runs} > Team1 ${t1Runs}`);

        // Mark match as over so the Continue button goes to matchover.html
        localStorage.setItem("end", "true");
    }
}

const container = document.getElementById("highlights");

/* ==========================================================================
   RESULT BANNER — shown at top when 2nd inning is done
   ========================================================================== */
if (inning === "2" && team1 && team2) {
    const t1Runs = team1.totalruns || 0;
    const t2Runs = team2.totalruns || 0;

    const banner = document.createElement("div");
    banner.className = "result-banner";

    let resultHTML = "";
    if (t2Runs > t1Runs) {
        // Team 2 wins
        const margin = t2Runs - t1Runs;
        const wicketsLeft = Object.keys(team2)
            .filter(k => typeof team2[k] === "object" && team2[k] !== null && !team2[k].bold)
            .length;
        resultHTML = `
            <div class="result-winner">🏆 Team 2 Win!</div>
            <div class="result-detail">by ${wicketsLeft} wicket${wicketsLeft !== 1 ? 's' : ''}</div>
            <div class="result-scores">Team 2: <strong>${t2Runs}</strong> &nbsp;|&nbsp; Team 1: <strong>${t1Runs}</strong></div>
        `;
    } else if (t1Runs > t2Runs) {
        // Team 1 wins
        const margin = t1Runs - t2Runs;
        resultHTML = `
            <div class="result-winner">🏆 Team 1 Win!</div>
            <div class="result-detail">by ${margin} run${margin !== 1 ? 's' : ''}</div>
            <div class="result-scores">Team 1: <strong>${t1Runs}</strong> &nbsp;|&nbsp; Team 2: <strong>${t2Runs}</strong></div>
        `;
    } else {
        // Tie
        resultHTML = `
            <div class="result-winner">🤝 It's a Tie!</div>
            <div class="result-detail">Both teams scored ${t1Runs} runs</div>
            <div class="result-scores">Team 1: <strong>${t1Runs}</strong> &nbsp;|&nbsp; Team 2: <strong>${t2Runs}</strong></div>
        `;
    }

    banner.innerHTML = resultHTML;
    container.parentElement.insertBefore(banner, container);
}

/* ==========================================================================
   HIGHLIGHTS RENDER
   ========================================================================== */
(async () => {

    for (const [name, player] of Object.entries(team)) {
        if (typeof player !== "object" || player === null) continue;

        const rawFours = player.fours || [];
        const rawSixes = player.sixes || [];

        console.log(`[inning-over] ${name} → fours IDs:`, rawFours.map(e => e.video), "| sixes IDs:", rawSixes.map(e => e.video));

        // Resolve each ID from IndexedDB
        const foursResolved = [];
        for (const entry of rawFours) {
            const src = await VideoDB.get(entry.video).catch((err) => {
                console.warn("[inning-over] Failed to get four video:", entry.video, err);
                return null;
            });
            if (src) foursResolved.push({ ...entry, video: src, type: "FOUR" });
        }

        const sixesResolved = [];
        for (const entry of rawSixes) {
            const src = await VideoDB.get(entry.video).catch((err) => {
                console.warn("[inning-over] Failed to get six video:", entry.video, err);
                return null;
            });
            if (src) sixesResolved.push({ ...entry, video: src, type: "SIX" });
        }

        console.log(`[inning-over] ${name} → resolved fours: ${foursResolved.length}, sixes: ${sixesResolved.length}`);

        const videos = [...foursResolved, ...sixesResolved];
        if (videos.length === 0) continue;

        // ===== SECTION =====
        const section = document.createElement("section");
        section.className = "player-section";

        const title = document.createElement("div");
        title.className = "section-title";

        title.innerHTML = `
            <p>${name.toUpperCase()}</p>
            <div class="stats">
                <div class="stat-item">
                    <span>Runs:</span>
                    <span class="stat-value">${player.runs}</span>
                </div>
                <div class="stat-item">
                    <span>Balls:</span>
                    <span class="stat-value">${player.balls}</span>
                </div>
                ${foursResolved.length > 0 ? `<div class="stat-item"><span>4s:</span><span class="stat-value">${foursResolved.length}</span></div>` : ''}
                ${sixesResolved.length > 0 ? `<div class="stat-item"><span>6s:</span><span class="stat-value">${sixesResolved.length}</span></div>` : ''}
            </div>
        `;
        section.appendChild(title);

        // ===== CAROUSEL =====
        const carouselContainer = document.createElement("div");
        carouselContainer.className = "carousel-container";

        const carouselTrack = document.createElement("div");
        carouselTrack.className = "carousel-track";

        videos.forEach((item, idx) => {
            const card = document.createElement("div");
            card.className = "video-card";
            if (idx === 0) card.classList.add("active");

            const vid = document.createElement("video");
            vid.src = item.video;
            vid.muted = true;
            vid.loop = true;
            vid.playsInline = true;
            vid.setAttribute("webkit-playsinline", "");
            vid.preload = "metadata";
            if (idx === 0) vid.autoplay = true;

            const overlay = document.createElement("div");
            overlay.className = "video-card-overlay";
            overlay.innerHTML = `<div class="shot-label">${item.type}!</div>`;

            const playIcon = document.createElement("div");
            playIcon.className = "play-icon";
            playIcon.innerHTML = '▶';

            card.appendChild(vid);
            card.appendChild(overlay);
            card.appendChild(playIcon);

            card.onclick = () => openLightbox(item.video);

            carouselTrack.appendChild(card);
        });

        carouselContainer.appendChild(carouselTrack);

        // Progress bar
        const progressContainer = document.createElement("div");
        progressContainer.className = "auto-play-progress";
        const progressBar = document.createElement("div");
        progressBar.className = "progress-bar";
        progressContainer.appendChild(progressBar);

        // Dots
        const dotsContainer = document.createElement("div");
        dotsContainer.className = "carousel-dots";

        videos.forEach((_, idx) => {
            const dot = document.createElement("div");
            dot.className = `dot ${idx === 0 ? 'active' : ''}`;
            dot.onclick = () => goToSlide(idx);
            dotsContainer.appendChild(dot);
        });

        section.appendChild(carouselContainer);
        section.appendChild(progressContainer);
        section.appendChild(dotsContainer);
        container.appendChild(section);

        // ===== AUTO-ROTATION =====
        let currentIndex = 0;
        let autoPlayInterval;
        let progressInterval;
        const SLIDE_DURATION = 4000;
        const cards = carouselTrack.querySelectorAll(".video-card");
        const dots  = dotsContainer.querySelectorAll(".dot");

        function updateCarousel(index) {
            cards.forEach((card, i) => {
                const v = card.querySelector("video");
                if (i === index) {
                    card.classList.add("active");
                    card.style.opacity = "1";
                    card.style.transform = "translate(-50%, -50%) scale(1)";
                    safePlay(v);
                } else {
                    card.classList.remove("active");
                    card.style.opacity = "0";
                    card.style.transform = "translate(-50%, -50%) scale(0.7)";
                    safePause(v);
                }
            });
            dots.forEach((dot, i) => dot.classList.toggle("active", i === index));
        }

        function startProgress() {
            let progress = 0;
            progressBar.style.width = "0%";
            clearInterval(progressInterval);
            progressInterval = setInterval(() => {
                progress += 100 / (SLIDE_DURATION / 100);
                progressBar.style.width = `${Math.min(progress, 100)}%`;
                if (progress >= 100) clearInterval(progressInterval);
            }, 100);
        }

        function goToSlide(index) {
            currentIndex = index;
            updateCarousel(currentIndex);
            startProgress();
            resetAutoPlay();
        }

        function startAutoPlay() {
            clearInterval(autoPlayInterval);
            autoPlayInterval = setInterval(() => {
                currentIndex = (currentIndex + 1) % cards.length;
                updateCarousel(currentIndex);
                startProgress();
            }, SLIDE_DURATION);
        }

        function resetAutoPlay() {
            clearInterval(autoPlayInterval);
            startAutoPlay();
        }

        updateCarousel(0);
        startAutoPlay();

        carouselContainer.addEventListener("touchstart", () => {
            clearInterval(autoPlayInterval);
            clearInterval(progressInterval);
        });
        carouselContainer.addEventListener("touchend", () => {
            startAutoPlay();
        });
    }

    // Empty state
    if (container.children.length === 0) {
        container.innerHTML = '<div class="empty-state">No highlights available for this inning</div>';
    }

})();

/* ===== LIGHTBOX ===== */
const lightbox      = document.getElementById("lightbox");
const lightboxVideo = document.getElementById("lightboxVideo");
const closeBtn      = document.getElementById("closeBtn");

function openLightbox(src) {
    lightboxVideo.src = src;
    lightboxVideo.muted = false;
    lightbox.classList.add("active");
    lightboxVideo.play().catch(() => {});
}

closeBtn.onclick = () => {
    lightbox.classList.remove("active");
    lightboxVideo.pause();
    lightboxVideo.src = "";
};

lightbox.onclick = (e) => {
    if (e.target === lightbox) closeBtn.click();
};

/* ===== CONTINUE BUTTON =====
   - After 1st inning → go to match.html (2nd inning)
   - After 2nd inning (end === "true") → go to matchover.html
   The "end" flag is also set above when team2 wins the chase.
   ================================================================= */
document.querySelector(".continue").addEventListener("click", () => {
    localStorage.setItem("inning", 2);

    const isEnd = localStorage.getItem("end");
    if (isEnd === "true") {
        window.location.href = "matchover.html";
        return;
    }

    window.location.href = "match.html";
});