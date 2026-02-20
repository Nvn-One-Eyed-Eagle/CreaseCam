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
   SUPABASE CLOUD FUNCTIONS
   ========================================================================== */

async function loadPlayersFromCloud(showUI = false) {
    const syncStatus = document.getElementById('sync-status');
    const syncMessage = document.getElementById('sync-message');
    
    if (showUI) {
        syncStatus.classList.remove('hidden');
        syncMessage.textContent = 'Connecting to cloud...';
    }

    try {
        if (!window.supabaseClient) {
            console.log("Supabase not ready");
            if (showUI) {
                syncMessage.textContent = 'Supabase not ready';
                setTimeout(() => syncStatus.classList.add('hidden'), 2000);
            }
            return [];
        }

        if (showUI) {
            syncMessage.textContent = 'Fetching player data...';
        }

        const { data: playersData, error } = await window.supabaseClient
            .from('players')
            .select('*');
        
        if (error) {
            console.error("Error fetching players:", error);
            if (showUI) {
                syncMessage.textContent = 'Error loading cloud data';
                setTimeout(() => syncStatus.classList.add('hidden'), 2000);
            }
            return [];
        }

        if (!playersData || playersData.length === 0) {
            console.log("No players in cloud");
            if (showUI) {
                syncMessage.textContent = 'No cloud data found';
                setTimeout(() => syncStatus.classList.add('hidden'), 2000);
            }
            return [];
        }

        if (showUI) {
            syncMessage.textContent = `Downloading ${playersData.length} players...`;
        }

        const cloudPlayers = [];
        const playersDBObject = {};
        let count = 0;
        
        for (const playerData of playersData) {
            count++;
            
            if (showUI) {
                syncMessage.textContent = `Downloading ${playerData.name} (${count}/${playersData.length})...`;
            }
            
            const fours = [];
            for (const four of (playerData.fours || [])) {
                if (four.videoUrl) {
                    try {
                        const response = await fetch(four.videoUrl);
                        const blob = await response.blob();
                        const base64 = await new Promise((resolve) => {
                            const reader = new FileReader();
                            reader.onloadend = () => resolve(reader.result);
                            reader.readAsDataURL(blob);
                        });
                        const videoId = await VideoDB.save(base64);
                        fours.push({ over: four.over, ball: four.ball, video: videoId });
                    } catch (err) {
                        console.error("Error downloading four video:", err);
                    }
                }
            }

            const sixes = [];
            for (const six of (playerData.sixes || [])) {
                if (six.videoUrl) {
                    try {
                        const response = await fetch(six.videoUrl);
                        const blob = await response.blob();
                        const base64 = await new Promise((resolve) => {
                            const reader = new FileReader();
                            reader.onloadend = () => resolve(reader.result);
                            reader.readAsDataURL(blob);
                        });
                        const videoId = await VideoDB.save(base64);
                        sixes.push({ over: six.over, ball: six.ball, video: videoId });
                    } catch (err) {
                        console.error("Error downloading six video:", err);
                    }
                }
            }

            const player = {
                name: playerData.name,
                image: playerData.image,
                matches: playerData.matches || 0,
                runs: playerData.runs || 0,
                highScore: playerData.highScore || 0,
                balls: playerData.balls || 0,
                fours: fours,
                sixes: sixes
            };

            cloudPlayers.push(player);
            
            const playerKey = playerData.name.toLowerCase().replace(/\s+/g, "");
            playersDBObject[playerKey] = player;
        }

        if (cloudPlayers.length > 0) {
            localStorage.setItem("playersDB", JSON.stringify(playersDBObject));
            console.log(`✓ Saved ${cloudPlayers.length} players to localStorage`);
        }

        console.log(`✓ Loaded ${cloudPlayers.length} players from cloud`);
        
        if (showUI) {
            syncMessage.textContent = `✓ Downloaded ${cloudPlayers.length} players!`;
            setTimeout(() => syncStatus.classList.add('hidden'), 3000);
        }
        
        return cloudPlayers;

    } catch (err) {
        console.error("Error loading from cloud:", err);
        if (showUI) {
            syncMessage.textContent = '✗ Download failed';
            setTimeout(() => syncStatus.classList.add('hidden'), 2000);
        }
        return [];
    }
}

async function syncToSupabase(showUI = false) {
    const syncStatus = document.getElementById('sync-status');
    const syncMessage = document.getElementById('sync-message');
    
    if (showUI) {
        syncStatus.classList.remove('hidden');
        syncMessage.textContent = 'Preparing to sync...';
    }

    const localPlayers = JSON.parse(localStorage.getItem("playersDB")) || {};
    const playerArray = Object.values(localPlayers);

    if (playerArray.length === 0) {
        console.log("No local players to sync");
        if (showUI) {
            syncMessage.textContent = 'No local data to sync';
            setTimeout(() => syncStatus.classList.add('hidden'), 2000);
        }
        return;
    }

    console.log(`Starting sync to Supabase for ${playerArray.length} players...`);
    
    if (showUI) {
        syncMessage.textContent = `Syncing ${playerArray.length} players...`;
    }

    const { data: existingPlayers } = await window.supabaseClient
        .from('players')
        .select('*');
    
    const existingPlayersMap = {};
    if (existingPlayers) {
        existingPlayers.forEach(p => {
            existingPlayersMap[p.name] = p;
        });
    }

    let successCount = 0;
    for (let p of playerArray) {
        try {
            if (showUI) {
                syncMessage.textContent = `Uploading ${p.name}...`;
            }

            const existingPlayer = existingPlayersMap[p.name];
            let imageUrl = existingPlayer ? existingPlayer.image : null;

            if (!existingPlayer || p.image !== existingPlayer.image) {
                const imageFileName = `${p.name}_${Date.now()}_profile.jpg`;
                const imageBlob = await fetch(p.image).then(res => res.blob());
                
                const { data: imageData, error: imageError } = await window.supabaseClient.storage
                    .from('player-images')
                    .upload(imageFileName, imageBlob, {
                        contentType: 'image/jpeg',
                        upsert: false
                    });

                if (!imageError) {
                    const { data: { publicUrl } } = window.supabaseClient.storage
                        .from('player-images')
                        .getPublicUrl(imageFileName);
                    imageUrl = publicUrl;
                }
            }

            let existingFours = existingPlayer ? (existingPlayer.fours || []) : [];
            let existingSixes = existingPlayer ? (existingPlayer.sixes || []) : [];

            for (let type of ['fours', 'sixes']) {
                for (let vid of (p[type] || [])) {
                    const base64Vid = await VideoDB.get(vid.video);
                    if (base64Vid) {
                        const existingVideos = type === 'fours' ? existingFours : existingSixes;
                        const alreadyExists = existingVideos.some(v => v.over === vid.over && v.ball === vid.ball);
                        
                        if (!alreadyExists) {
                            const videoFileName = `${p.name}_${type}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}.mp4`;
                            const videoBlob = await fetch(base64Vid).then(res => res.blob());
                            
                            const { data: videoData, error: videoError } = await window.supabaseClient.storage
                                .from('player-videos')
                                .upload(videoFileName, videoBlob, {
                                    contentType: 'video/mp4',
                                    upsert: false
                                });

                            if (!videoError) {
                                const { data: { publicUrl: videoUrl } } = window.supabaseClient.storage
                                    .from('player-videos')
                                    .getPublicUrl(videoFileName);
                                
                                const newVideo = {
                                    over: vid.over,
                                    ball: vid.ball,
                                    videoUrl: videoUrl
                                };
                                
                                if (type === 'fours') {
                                    existingFours.push(newVideo);
                                } else {
                                    existingSixes.push(newVideo);
                                }
                            }
                        }
                    }
                }
            }

            const cloudPlayer = {
                name: p.name,
                image: imageUrl,
                matches: p.matches || 0,
                runs: p.runs || 0,
                highScore: p.highScore || 0,
                balls: p.balls || 0,
                fours: existingFours,
                sixes: existingSixes
            };

            if (existingPlayer) {
                const { error: updateError } = await window.supabaseClient
                    .from('players')
                    .update(cloudPlayer)
                    .eq('id', existingPlayer.id);

                if (updateError) {
                    console.error(`✗ Failed to update ${p.name}:`, updateError);
                } else {
                    console.log(`✓ Updated ${p.name} successfully!`);
                    successCount++;
                }
            } else {
                const { error: insertError } = await window.supabaseClient
                    .from('players')
                    .insert([cloudPlayer]);

                if (insertError) {
                    console.error(`✗ Failed to insert ${p.name}:`, insertError);
                } else {
                    console.log(`✓ Inserted ${p.name} successfully!`);
                    successCount++;
                }
            }

        } catch (err) {
            console.error(`✗ Failed to sync ${p.name}:`, err);
        }
    }

    console.log("✓ Sync Complete!");
    
    if (showUI) {
        syncMessage.textContent = `✓ Synced ${successCount}/${playerArray.length} players!`;
        setTimeout(() => syncStatus.classList.add('hidden'), 3000);
    }
}


/* ==========================================================================
   STATE
   ========================================================================== */
let currentCard = 0;
let activeTab = 'fours';
let autoPlayTimer;

/* ==========================================================================
   VIDEO MODAL
   ========================================================================== */
function playVideo(src) {
    const modal  = document.getElementById("video-modal");
    const wrapper = document.getElementById("modal-video-wrapper");
    wrapper.innerHTML = `<video src="${src}" controls autoplay class="w-full rounded-xl"></video>`;
    modal.classList.remove("hidden");
}

function closeVideoModal() {
    const modal  = document.getElementById("video-modal");
    const wrapper = document.getElementById("modal-video-wrapper");
    modal.classList.add("hidden");
    const v = wrapper.querySelector("video");
    if (v) { v.pause(); v.src = ""; }
    wrapper.innerHTML = "";
}

/* ==========================================================================
   DATA
   ========================================================================== */
function loadPlayers() {
    const db = JSON.parse(localStorage.getItem("playersDB")) || {};
    return Object.values(db).map(p => ({
        ...p,
        strikeRate: p.balls ? ((p.runs / p.balls) * 100).toFixed(2) : '0.00'
    }));
}

function mergeMatchDataIntoPlayersDB() {
    const matchData = JSON.parse(localStorage.getItem("matchData")) || {};
    const playersDB = JSON.parse(localStorage.getItem("playersDB")) || {};
    
    let hasUpdates = false;
    
    for (let playerKey in matchData) {
        if (playerKey === 'overs' || playerKey === 'totalballs' || playerKey === 'totalruns' || playerKey === 'wicket') {
            continue;
        }
        
        const matchPlayerData = matchData[playerKey];
        
        let foundPlayer = null;
        for (let dbKey in playersDB) {
            if (dbKey.toLowerCase() === playerKey.toLowerCase()) {
                foundPlayer = playersDB[dbKey];
                break;
            }
        }
        
        if (foundPlayer && matchPlayerData) {
            if (matchPlayerData.runs > 0 || matchPlayerData.balls > 0) {
                foundPlayer.runs = (foundPlayer.runs || 0) + (matchPlayerData.runs || 0);
                foundPlayer.balls = (foundPlayer.balls || 0) + (matchPlayerData.balls || 0);
                foundPlayer.matches = (foundPlayer.matches || 0) + 1;
                
                if (matchPlayerData.runs > (foundPlayer.highScore || 0)) {
                    foundPlayer.highScore = matchPlayerData.runs;
                }
                
                if (matchPlayerData.fours && matchPlayerData.fours.length > 0) {
                    foundPlayer.fours = foundPlayer.fours || [];
                    foundPlayer.fours.push(...matchPlayerData.fours);
                }
                
                if (matchPlayerData.sixes && matchPlayerData.sixes.length > 0) {
                    foundPlayer.sixes = foundPlayer.sixes || [];
                    foundPlayer.sixes.push(...matchPlayerData.sixes);
                }
                
                hasUpdates = true;
                console.log(`✓ Merged match data for ${foundPlayer.name}`);
            }
        }
    }
    
    if (hasUpdates) {
        localStorage.setItem("playersDB", JSON.stringify(playersDB));
        console.log("✓ Match data merged into playersDB");
        localStorage.removeItem("matchData");
        console.log("✓ Match data cleared");
    }
    
    return hasUpdates;
}

let players = [];

/* ==========================================================================
   SWIPEABLE SECTION — Squad ↔ Rankings
   ========================================================================== */

let sectionIndex = 0; // 0 = Squad, 1 = Rankings
let touchStartX = 0;
let touchStartY = 0;
let isDraggingSection = false;

function initSectionSwipe() {
    const wrapper = document.getElementById('swipeable-section-wrapper');
    if (!wrapper) return;

    wrapper.addEventListener('touchstart', (e) => {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        isDraggingSection = false;
    }, { passive: true });

    wrapper.addEventListener('touchmove', (e) => {
        const dx = e.touches[0].clientX - touchStartX;
        const dy = e.touches[0].clientY - touchStartY;
        if (!isDraggingSection && Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
            isDraggingSection = true;
        }
    }, { passive: true });

    wrapper.addEventListener('touchend', (e) => {
        if (!isDraggingSection) return;
        const dx = e.changedTouches[0].clientX - touchStartX;
        if (Math.abs(dx) > 50) {
            if (dx < 0 && sectionIndex === 0) switchSection(1);
            else if (dx > 0 && sectionIndex === 1) switchSection(0);
        }
        isDraggingSection = false;
    }, { passive: true });
}

function switchSection(index) {
    sectionIndex = index;

    const squadPanel  = document.getElementById('squad-panel');
    const rankPanel   = document.getElementById('rankings-panel');
    const dot0        = document.getElementById('sec-dot-0');
    const dot1        = document.getElementById('sec-dot-1');
    const tabSquad    = document.getElementById('tab-squad');
    const tabRankings = document.getElementById('tab-rankings');

    if (sectionIndex === 0) {
        squadPanel.style.transform  = 'translateX(0%)';
        rankPanel.style.transform   = 'translateX(100%)';
        dot0.classList.add('w-8', 'bg-emerald-400');
        dot0.classList.remove('w-3', 'bg-white/30');
        dot1.classList.remove('w-8', 'bg-emerald-400');
        dot1.classList.add('w-3', 'bg-white/30');
        tabSquad.classList.add('text-white', 'border-b-2', 'border-emerald-400');
        tabSquad.classList.remove('text-white/40');
        tabRankings.classList.remove('text-white', 'border-b-2', 'border-emerald-400');
        tabRankings.classList.add('text-white/40');
    } else {
        squadPanel.style.transform  = 'translateX(-100%)';
        rankPanel.style.transform   = 'translateX(0%)';
        dot1.classList.add('w-8', 'bg-emerald-400');
        dot1.classList.remove('w-3', 'bg-white/30');
        dot0.classList.remove('w-8', 'bg-emerald-400');
        dot0.classList.add('w-3', 'bg-white/30');
        tabRankings.classList.add('text-white', 'border-b-2', 'border-emerald-400');
        tabRankings.classList.remove('text-white/40');
        tabSquad.classList.remove('text-white', 'border-b-2', 'border-emerald-400');
        tabSquad.classList.add('text-white/40');
    }
}

/* ==========================================================================
   PLAYER PROFILE MODAL
   ========================================================================== */

async function openPlayerProfile(playerIndex) {
    const player = players[playerIndex];
    if (!player) return;

    clearInterval(autoPlayTimer);

    const modal = document.getElementById('player-profile-modal');
    const content = document.getElementById('player-profile-content');

    // Calculate stats
    const sr = player.balls > 0 ? ((player.runs / player.balls) * 100).toFixed(1) : '0.0';
    const avg = player.matches > 0 ? (player.runs / player.matches).toFixed(1) : '0.0';
    const totalBoundaries = (player.fours || []).length + (player.sixes || []).length;

    // Load video sources
    const foursVideos = [];
    for (const v of (player.fours || [])) {
        const src = await VideoDB.get(v.video).catch(() => null);
        if (src) foursVideos.push({ src, over: v.over, ball: v.ball, type: '4' });
    }
    const sixesVideos = [];
    for (const v of (player.sixes || [])) {
        const src = await VideoDB.get(v.video).catch(() => null);
        if (src) sixesVideos.push({ src, over: v.over, ball: v.ball, type: '6' });
    }
    const allVideos = [...foursVideos, ...sixesVideos];

    const hasVideos = allVideos.length > 0;

    content.innerHTML = `
        <!-- Hero Banner -->
        <div class="relative h-52 overflow-hidden rounded-t-2xl">
            <img src="${player.image}" alt="${player.name}" class="w-full h-full object-cover scale-110" style="filter: blur(2px) brightness(0.5);">
            <div class="absolute inset-0 bg-gradient-to-t from-[#0a0e27] via-[#0a0e2780] to-transparent"></div>
            
            <!-- Close -->
            <button onclick="closePlayerProfile()" class="absolute top-4 right-4 bg-black/50 hover:bg-black/70 backdrop-blur-md text-white w-9 h-9 rounded-full flex items-center justify-center border border-white/20 transition-all z-10">
                <i data-lucide="x" class="w-4 h-4"></i>
            </button>

            <!-- Player avatar -->
            <div class="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2">
                <div class="w-24 h-24 rounded-full border-4 border-emerald-400 overflow-hidden shadow-2xl shadow-emerald-500/40">
                    <img src="${player.image}" alt="${player.name}" class="w-full h-full object-cover">
                </div>
            </div>
        </div>

        <!-- Player Name -->
        <div class="pt-16 pb-4 px-5 text-center">
            <h2 class="text-2xl font-black text-white tracking-tight">${player.name}</h2>
            <p class="text-emerald-400 text-sm font-semibold mt-1">${player.matches} Match${player.matches !== 1 ? 'es' : ''} Played</p>
        </div>

        <!-- Stats Grid -->
        <div class="px-5 grid grid-cols-4 gap-2 mb-5">
            <div class="stat-box rounded-xl p-3 text-center">
                <div class="text-lg font-black text-emerald-400">${player.runs}</div>
                <div class="text-[10px] text-white/50 font-medium uppercase tracking-wide">Runs</div>
            </div>
            <div class="stat-box rounded-xl p-3 text-center">
                <div class="text-lg font-black text-blue-400">${player.highScore}</div>
                <div class="text-[10px] text-white/50 font-medium uppercase tracking-wide">H.Score</div>
            </div>
            <div class="stat-box rounded-xl p-3 text-center">
                <div class="text-lg font-black text-amber-400">${sr}</div>
                <div class="text-[10px] text-white/50 font-medium uppercase tracking-wide">S.Rate</div>
            </div>
            <div class="stat-box rounded-xl p-3 text-center">
                <div class="text-lg font-black text-purple-400">${avg}</div>
                <div class="text-[10px] text-white/50 font-medium uppercase tracking-wide">Avg</div>
            </div>
        </div>

        <!-- Boundary summary -->
        <div class="px-5 grid grid-cols-2 gap-3 mb-5">
            <div class="bg-gradient-to-br from-emerald-500/20 to-emerald-700/10 border border-emerald-500/30 rounded-xl p-3 flex items-center gap-3">
                <div class="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center text-xl font-black text-emerald-300">4</div>
                <div>
                    <div class="text-xl font-black text-white">${foursVideos.length}</div>
                    <div class="text-xs text-white/50">Fours</div>
                </div>
            </div>
            <div class="bg-gradient-to-br from-blue-500/20 to-blue-700/10 border border-blue-500/30 rounded-xl p-3 flex items-center gap-3">
                <div class="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center text-xl font-black text-blue-300">6</div>
                <div>
                    <div class="text-xl font-black text-white">${sixesVideos.length}</div>
                    <div class="text-xs text-white/50">Sixes</div>
                </div>
            </div>
        </div>

        <!-- Compilation Download Button -->
        ${hasVideos ? `
        <div class="px-5 mb-5">
            <button id="compile-btn" onclick="downloadCompilation(${playerIndex})"
                class="w-full bg-gradient-to-r from-rose-500 to-pink-600 text-white py-3.5 rounded-xl font-bold text-sm shadow-lg shadow-rose-500/30 hover:shadow-xl hover:shadow-rose-500/40 transition-all active:scale-95 flex items-center justify-center gap-2 border border-rose-400/20">
                <i data-lucide="film" class="w-5 h-5"></i>
                <span>DOWNLOAD HIGHLIGHT REEL</span>
                <span class="text-xs opacity-70 font-normal">(≤30s)</span>
            </button>
            <p class="text-center text-white/30 text-xs mt-2">Stitches all available clips into one video</p>
        </div>
        ` : ''}

        <!-- Videos Section -->
        <div class="px-5 pb-6">
            <div class="flex items-center gap-2 mb-3">
                <i data-lucide="video" class="text-emerald-400 w-4 h-4"></i>
                <h3 class="text-sm font-bold text-white uppercase tracking-wide">Highlight Clips</h3>
                <span class="text-xs text-white/40 font-medium">${allVideos.length} clips</span>
            </div>

            ${allVideos.length === 0 ? `
            <div class="text-center text-white/30 py-8">
                <i data-lucide="video-off" class="w-10 h-10 mx-auto mb-2"></i>
                <p class="text-sm">No video clips yet</p>
            </div>
            ` : `
            <div class="grid grid-cols-2 gap-2.5">
                ${allVideos.map((v, i) => `
                <div onclick="playVideo('${v.src}')" class="cursor-pointer group relative rounded-xl overflow-hidden bg-black/50 border border-white/10 hover:border-emerald-400/50 transition-all video-hover">
                    <video src="${v.src}" class="w-full h-28 object-cover" muted preload="metadata"></video>
                    <div class="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-all flex items-center justify-center">
                        <div class="w-9 h-9 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30 group-hover:scale-110 transition-transform">
                            <i data-lucide="play" class="w-4 h-4 text-white fill-white ml-0.5"></i>
                        </div>
                    </div>
                    <div class="absolute top-2 right-2 px-2 py-0.5 rounded-md text-xs font-black ${v.type === '6' ? 'bg-blue-500' : 'bg-emerald-500'} text-white shadow">
                        ${v.type === '6' ? 'SIX' : 'FOUR'}
                    </div>
                    <div class="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
                        <p class="text-white/80 text-xs font-medium">Over ${v.over}.${v.ball}</p>
                    </div>
                </div>
                `).join('')}
            </div>
            `}
        </div>
    `;

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    // Animate in
    requestAnimationFrame(() => {
        modal.querySelector('.profile-sheet').classList.remove('translate-y-full');
        modal.querySelector('.profile-sheet').classList.add('translate-y-0');
    });

    lucide.createIcons();
}

function closePlayerProfile() {
    const modal = document.getElementById('player-profile-modal');
    const sheet = modal.querySelector('.profile-sheet');
    sheet.classList.add('translate-y-full');
    sheet.classList.remove('translate-y-0');
    setTimeout(() => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }, 350);
    startTimer();
}

/* ==========================================================================
   VIDEO COMPILATION DOWNLOAD
   ========================================================================== */

async function downloadCompilation(playerIndex) {
    const player = players[playerIndex];
    if (!player) return;

    const btn = document.getElementById('compile-btn');
    if (btn) {
        btn.innerHTML = `
            <div class="spinner" style="width:18px;height:18px;border-width:2px;border-top-color:white;"></div>
            <span>Building compilation...</span>
        `;
        btn.disabled = true;
    }

    try {
        // Gather all video blobs
        const allVids = [];
        for (const v of (player.fours || [])) {
            const src = await VideoDB.get(v.video).catch(() => null);
            if (src) allVids.push(src);
        }
        for (const v of (player.sixes || [])) {
            const src = await VideoDB.get(v.video).catch(() => null);
            if (src) allVids.push(src);
        }

        if (allVids.length === 0) {
            alert('No videos found for this player.');
            return;
        }

        // Convert base64 to blobs and figure out how many clips fit in ≤30s
        // We use MediaRecorder to stitch video elements in sequence
        const MAX_DURATION = 29; // seconds target

        // Probe durations by loading videos
        const videoElements = [];
        for (const src of allVids) {
            const vid = document.createElement('video');
            vid.src = src;
            vid.muted = true;
            await new Promise(res => {
                vid.onloadedmetadata = res;
                vid.onerror = res;
            });
            videoElements.push({ el: vid, src, duration: vid.duration || 3 });
        }

        // Select clips that fit within 30s
        let totalDuration = 0;
        const selectedVids = [];
        for (const v of videoElements) {
            if (totalDuration + v.duration > MAX_DURATION) {
                // Try to trim or skip
                if (selectedVids.length === 0) {
                    selectedVids.push(v); // At least one clip
                }
                break;
            }
            selectedVids.push(v);
            totalDuration += v.duration;
        }

        if (btn) btn.innerHTML = `<div class="spinner" style="width:18px;height:18px;border-width:2px;border-top-color:white;"></div><span>Recording clips (0/${selectedVids.length})...</span>`;

        // Create an offscreen canvas for compositing
        const WIDTH = 640;
        const HEIGHT = 360;
        const canvas = document.createElement('canvas');
        canvas.width = WIDTH;
        canvas.height = HEIGHT;
        const ctx = canvas.getContext('2d');

        // Setup MediaRecorder
        const stream = canvas.captureStream(30);
        const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') 
            ? 'video/webm;codecs=vp9' 
            : 'video/webm';
        const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_000_000 });
        const chunks = [];
        recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

        recorder.start(100);

        // Draw a "intro" frame
        ctx.fillStyle = '#0a0e27';
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        ctx.fillStyle = '#10b981';
        ctx.font = 'bold 32px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(player.name, WIDTH / 2, HEIGHT / 2 - 10);
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = '18px Inter, sans-serif';
        ctx.fillText('Highlight Reel', WIDTH / 2, HEIGHT / 2 + 30);
        await sleep(800);

        // Draw each video clip
        for (let i = 0; i < selectedVids.length; i++) {
            const { el: vid } = selectedVids[i];

            if (btn) {
                btn.innerHTML = `<div class="spinner" style="width:18px;height:18px;border-width:2px;border-top-color:white;"></div><span>Recording clip ${i + 1}/${selectedVids.length}...</span>`;
            }

            vid.currentTime = 0;
            vid.playbackRate = 1;
            vid.muted = true;
            await vid.play().catch(() => {});

            await new Promise((resolve) => {
                const drawFrame = () => {
                    if (vid.ended || vid.paused) {
                        resolve();
                        return;
                    }
                    ctx.drawImage(vid, 0, 0, WIDTH, HEIGHT);
                    // Overlay badge
                    ctx.fillStyle = 'rgba(0,0,0,0.5)';
                    ctx.fillRect(0, HEIGHT - 36, WIDTH, 36);
                    ctx.fillStyle = 'white';
                    ctx.font = 'bold 14px Inter, sans-serif';
                    ctx.textAlign = 'left';
                    ctx.fillText(`${player.name} — Over ${selectedVids[i]?.el?.dataset?.over || ''}`, 12, HEIGHT - 12);
                    ctx.font = '12px Inter, sans-serif';
                    ctx.textAlign = 'right';
                    ctx.fillText(`${i + 1}/${selectedVids.length}`, WIDTH - 12, HEIGHT - 12);
                    requestAnimationFrame(drawFrame);
                };
                requestAnimationFrame(drawFrame);
                vid.onended = () => resolve();
                // Safety timeout
                setTimeout(resolve, (vid.duration + 0.5) * 1000);
            });

            vid.pause();

            // Brief flash between clips
            if (i < selectedVids.length - 1) {
                ctx.fillStyle = '#0a0e27';
                ctx.fillRect(0, 0, WIDTH, HEIGHT);
                await sleep(300);
            }
        }

        // Outro frame
        ctx.fillStyle = '#0a0e27';
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        ctx.fillStyle = '#10b981';
        ctx.font = 'bold 28px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Cricket Pro', WIDTH / 2, HEIGHT / 2);
        await sleep(600);

        recorder.stop();

        await new Promise(resolve => recorder.onstop = resolve);

        const blob = new Blob(chunks, { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${player.name.replace(/\s+/g, '_')}_highlights.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 5000);

        if (btn) {
            btn.innerHTML = `<i data-lucide="check-circle" class="w-5 h-5"></i><span>Downloaded!</span>`;
            btn.disabled = false;
            lucide.createIcons();
            setTimeout(() => {
                if (btn) {
                    btn.innerHTML = `<i data-lucide="film" class="w-5 h-5"></i><span>DOWNLOAD HIGHLIGHT REEL</span><span class="text-xs opacity-70 font-normal">(≤30s)</span>`;
                    btn.disabled = false;
                    lucide.createIcons();
                }
            }, 3000);
        }

    } catch (err) {
        console.error('Compilation failed:', err);
        alert('Compilation failed: ' + err.message);
        if (btn) {
            btn.innerHTML = `<i data-lucide="film" class="w-5 h-5"></i><span>DOWNLOAD HIGHLIGHT REEL</span><span class="text-xs opacity-70 font-normal">(≤30s)</span>`;
            btn.disabled = false;
            lucide.createIcons();
        }
    }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }


/* ==========================================================================
   RENDER
   ========================================================================== */
async function renderUI() {
    renderCards();
    renderDots();
    await renderVideos();
    renderLeaderboard();
    updatePlayerCount();
    lucide.createIcons();
}

function updatePlayerCount() {
    document.getElementById('player-count').textContent = players.length;
}

function renderLeaderboard() {
    const container = document.getElementById('leaderboard-list');
    container.innerHTML = '';

    if (players.length === 0) {
        container.innerHTML = `
            <div class="text-center text-white/40 py-8">
                <i data-lucide="bar-chart-3" class="w-12 h-12 mx-auto mb-2"></i>
                <p class="text-sm">No rankings yet</p>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    const rankedPlayers = players.map((player, originalIndex) => {
        const strikeRate = player.balls > 0 ? ((player.runs / player.balls) * 100) : 0;
        const runsPerBall = player.balls > 0 ? (player.runs / player.balls) : 0;
        const compositeScore = (
            (strikeRate * 0.4) + 
            (player.highScore * 0.3) + 
            (runsPerBall * 30) + 
            (player.matches * 2)
        );
        
        return {
            ...player,
            strikeRate: strikeRate.toFixed(2),
            compositeScore: compositeScore.toFixed(2),
            originalIndex
        };
    }).sort((a, b) => b.compositeScore - a.compositeScore);

    rankedPlayers.forEach((player, index) => {
        const rank = index + 1;
        let rankColor = 'text-white/60';
        let rankBg = 'bg-white/5';
        let rankIcon = 'medal';
        
        if (rank === 1) {
            rankColor = 'text-yellow-400';
            rankBg = 'bg-yellow-500/10';
            rankIcon = 'crown';
        } else if (rank === 2) {
            rankColor = 'text-gray-300';
            rankBg = 'bg-gray-500/10';
        } else if (rank === 3) {
            rankColor = 'text-orange-400';
            rankBg = 'bg-orange-500/10';
        }

        const runsPerBall = player.balls > 0 ? (player.runs / player.balls).toFixed(2) : '0.00';

        container.innerHTML += `
            <div onclick="openPlayerProfile(${player.originalIndex})" class="player-card-bg rounded-xl p-4 flex items-center gap-4 hover:bg-white/5 transition-all cursor-pointer active:scale-[0.98]">
                <div class="${rankBg} ${rankColor} w-12 h-12 rounded-lg flex items-center justify-center font-black text-xl">
                    ${rank === 1 ? `<i data-lucide="${rankIcon}" class="w-6 h-6"></i>` : rank}
                </div>
                
                <div class="w-12 h-12 rounded-lg overflow-hidden border-2 border-white/10">
                    <img src="${player.image}" alt="${player.name}" class="w-full h-full object-cover">
                </div>
                
                <div class="flex-1 min-w-0">
                    <h4 class="text-white font-bold text-sm truncate">${player.name}</h4>
                    <div class="flex gap-3 mt-1">
                        <span class="text-xs text-emerald-400 font-medium">SR: ${player.strikeRate}</span>
                        <span class="text-xs text-blue-400 font-medium">HS: ${player.highScore}</span>
                        <span class="text-xs text-purple-400 font-medium">R/B: ${runsPerBall}</span>
                    </div>
                </div>
                
                <div class="text-right">
                    <div class="text-xs text-white/40 font-medium">Score</div>
                    <div class="text-lg font-bold text-emerald-400">${player.compositeScore}</div>
                </div>
            </div>
        `;
    });
}

function renderCards() {
    const container = document.getElementById('cards-container');
    container.innerHTML = '';

    if (players.length === 0) {
        container.innerHTML = `
            <div class="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center">
                <div class="text-white/40 mb-2">
                    <i data-lucide="users" class="w-16 h-16 mx-auto mb-3"></i>
                    <p class="text-lg font-semibold">No Players Yet</p>
                    <p class="text-sm mt-1">Add players or pull data from cloud</p>
                </div>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    players.forEach((player, index) => {
        const offset = (index - currentCard + players.length) % players.length;

        let classes = 'absolute top-0 left-1/2 transform -translate-x-1/2 card-transition ';

        const isActive = offset === 0;
        const isPrev   = offset === players.length - 1;
        const isNext   = offset === 1;

        if (isActive)      classes += 'z-30 scale-100 opacity-100';
        else if (isNext)   classes += 'z-20 scale-90 opacity-60 translate-x-8 translate-y-4';
        else if (isPrev)   classes += 'z-20 scale-90 opacity-60 -translate-x-8 translate-y-4';
        else               classes += 'z-10 scale-75 opacity-0';

        const runsAndBalls = `${player.runs || 0}/${player.balls || 0}`;
        const strikeRate = player.balls > 0 ? ((player.runs / player.balls) * 100).toFixed(2) : '0.00';

        container.innerHTML += `
            <div class="${classes}" style="width: 90%; max-width: 320px;">
                <div class="player-card-bg rounded-2xl shadow-2xl overflow-hidden cursor-pointer active:scale-95 transition-transform"
                     onclick="${isActive ? `openPlayerProfile(${index})` : ''}">
                    <div class="player-card-img relative h-48">
                        <img src="${player.image}" alt="${player.name}" class="w-full h-full object-cover">
                        <div class="absolute top-3 right-3 bg-emerald-500 text-white px-2.5 py-1 rounded-lg font-bold text-xs flex items-center gap-1 shadow-lg">
                            <i data-lucide="zap" class="w-3.5 h-3.5"></i>
                            ACTIVE
                        </div>
                        ${isActive ? `
                        <div class="absolute bottom-3 right-3 bg-white/10 backdrop-blur-md text-white px-2.5 py-1 rounded-lg font-semibold text-xs flex items-center gap-1 border border-white/20">
                            <i data-lucide="expand" class="w-3 h-3"></i>
                            TAP TO VIEW
                        </div>
                        ` : ''}
                    </div>
                    <div class="p-4">
                        <h3 class="text-xl font-black text-white mb-3">${player.name}</h3>
                        <div class="grid grid-cols-2 gap-2">
                            <div class="stat-box rounded-lg p-2.5 text-center">
                                <div class="text-lg font-bold text-emerald-400">${player.matches}</div>
                                <div class="text-xs text-white/60 font-medium">Matches</div>
                            </div>
                            <div class="stat-box rounded-lg p-2.5 text-center">
                                <div class="text-lg font-bold text-blue-400">${runsAndBalls}</div>
                                <div class="text-xs text-white/60 font-medium">Runs/Balls</div>
                            </div>
                            <div class="stat-box rounded-lg p-2.5 text-center">
                                <div class="text-lg font-bold text-amber-400">${player.highScore}</div>
                                <div class="text-xs text-white/60 font-medium">High Score</div>
                            </div>
                            <div class="stat-box rounded-lg p-2.5 text-center">
                                <div class="text-lg font-bold text-purple-400">${strikeRate}</div>
                                <div class="text-xs text-white/60 font-medium">Strike Rate</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
}

function senddata(playersList = players) {
    const matchObject = playersList.reduce((acc, player) => {
        const key = player.name.toLowerCase().replace(/\s+/g, "");
        acc[key] = {
            runs: 0,
            balls: 0,
            fours: [],
            sixes: [],
            bold: false,
            highScore: 0,
            image: player.image ?? null,
            matches: 0
        };
        return acc;
    }, { ...initialMatchState });

    localStorage.setItem("matchData", JSON.stringify(matchObject));
}

function renderDots() {
    const container = document.getElementById('dots-container');
    container.innerHTML = '';

    if (players.length === 0) return;

    players.forEach((_, index) => {
        const isActive = index === currentCard;
        const widthClass = isActive ? 'w-8 bg-emerald-400' : 'w-3 bg-white/30 hover:bg-white/50';

        const dot = document.createElement('button');
        dot.className = `h-3 rounded-full transition-all ${widthClass}`;
        dot.onclick = () => {
            currentCard = index;
            resetTimer();
            renderUI();
        };
        container.appendChild(dot);
    });
}

async function renderVideos() {
    const videoGrid = document.getElementById('video-grid');
    videoGrid.innerHTML = '';

    if (players.length === 0) {
        videoGrid.innerHTML = `
            <div class="col-span-2 text-center text-white/40 py-8">
                <i data-lucide="video-off" class="w-12 h-12 mx-auto mb-2"></i>
                <p class="text-sm">No videos yet</p>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    const currentPlayer = players[currentCard];

    const tabFours = document.getElementById('tab-fours');
    const tabSixes = document.getElementById('tab-sixes');

    if (activeTab === 'fours') {
        tabFours.className = 'flex-1 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/30';
        tabSixes.className = 'flex-1 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all glass-effect text-white/70 border border-white/10 hover:bg-white/10';
    } else {
        tabFours.className = 'flex-1 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all glass-effect text-white/70 border border-white/10 hover:bg-white/10';
        tabSixes.className = 'flex-1 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/30';
    }

    const rawVideos = currentPlayer[activeTab] || [];

    const resolved = [];
    for (const v of rawVideos) {
        const src = await VideoDB.get(v.video).catch(() => null);
        if (src) resolved.push({ src, over: v.over, ball: v.ball });
    }

    if (resolved.length === 0) {
        videoGrid.innerHTML = `
            <div class="col-span-2 text-center text-white/40 py-8">
                <i data-lucide="video-off" class="w-12 h-12 mx-auto mb-2"></i>
                <p class="text-sm">No ${activeTab} videos yet</p>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    resolved.forEach(item => {
        const card = document.createElement("div");
        card.className = "bg-black/50 border border-white/10 rounded-lg p-2 cursor-pointer video-hover";
        card.onclick = () => playVideo(item.src);

        card.innerHTML = `
            <video src="${item.src}" class="w-full h-28 object-cover rounded" muted></video>
            <p class="text-white/80 text-xs text-center mt-1.5 font-medium">Over ${item.over}.${item.ball}</p>
        `;

        videoGrid.appendChild(card);
    });
}

/* ==========================================================================
   NAVIGATION
   ========================================================================== */
function nextCard() {
    if (players.length === 0) return;
    currentCard = (currentCard + 1) % players.length;
    renderUI();
}

function prevCard() {
    if (players.length === 0) return;
    currentCard = (currentCard - 1 + players.length) % players.length;
    renderUI();
}

function switchTab(tab) {
    activeTab = tab;
    renderVideos();
    lucide.createIcons();
}

/* ==========================================================================
   ADD PLAYER
   ========================================================================== */
const showAddBtn   = document.getElementById('show-add-btn');
const addPlayerForm = document.getElementById('add-player-form');
const cancelAddBtn  = document.getElementById('cancel-add-btn');
const submitAddBtn  = document.getElementById('submit-add-btn');

showAddBtn.addEventListener('click', () => {
    showAddBtn.classList.add('hidden');
    addPlayerForm.classList.remove('hidden');
});

cancelAddBtn.addEventListener('click', () => {
    addPlayerForm.classList.add('hidden');
    showAddBtn.classList.remove('hidden');
    clearForm();
});

function clearForm() {
    document.getElementById('inp-name').value = '';
    capturedImage = null;
    photoPreview.src = '';
    photoPreview.classList.add("hidden");
    cameraText.classList.remove("hidden");
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }
}

const cameraBox     = document.getElementById("camera-box");
const video         = document.getElementById("camera");
const photoPreview  = document.getElementById("photo-preview");
const cameraText    = document.getElementById("camera-text");
const captureBtn    = document.getElementById("capture-btn");

let stream;
let capturedImage = null;

cameraBox.addEventListener("click", async () => {
    if (stream) return;
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user" },
            audio: false
        });
        video.srcObject = stream;
        video.classList.remove("hidden");
        cameraText.classList.add("hidden");
        captureBtn.classList.remove("hidden");
    } catch (err) {
        alert("Camera access denied");
    }
});

captureBtn.addEventListener("click", () => {
    const MAX_WIDTH  = 300;
    const MAX_HEIGHT = 300;
    const QUALITY    = 0.6;

    let width  = video.videoWidth;
    let height = video.videoHeight;

    if (width > height) {
        if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
    } else {
        if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
    }

    const canvas = document.createElement("canvas");
    canvas.width  = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, width, height);

    capturedImage = canvas.toDataURL("image/jpeg", QUALITY);

    photoPreview.src = capturedImage;
    photoPreview.classList.remove("hidden");
    video.classList.add("hidden");
    captureBtn.classList.add("hidden");

    stream.getTracks().forEach(track => track.stop());
    stream = null;
});

submitAddBtn.addEventListener('click', () => {
    const name = document.getElementById('inp-name').value;

    if (!name || !capturedImage) {
        alert('Please enter name and capture image');
        return;
    }

    const newPlayer = {
        name,
        image: capturedImage,
        matches: 0,
        runs: 0,
        balls: 0,
        highScore: 0,
        fours: [],
        sixes: []
    };

    players.push(newPlayer);

    const playersDB = JSON.parse(localStorage.getItem("playersDB")) || {};
    const playerKey = name.toLowerCase().replace(/\s+/g, "");
    playersDB[playerKey] = newPlayer;
    localStorage.setItem("playersDB", JSON.stringify(playersDB));

    addPlayerForm.classList.add('hidden');
    showAddBtn.classList.remove('hidden');
    clearForm();

    resetTimer();
    renderUI();
});

/* ==========================================================================
   SYNC BUTTON HANDLERS
   ========================================================================== */
document.getElementById('send-online-btn').addEventListener('click', async () => {
    if (!window.supabaseClient) {
        alert('Supabase is not initialized yet. Please check your configuration.');
        return;
    }
    
    const password = prompt('Enter password to sync data online:');
    if (password !== 'zen43') {
        alert('❌ Incorrect password! Data sync cancelled.');
        return;
    }
    
    if (!confirm('This will upload and merge all local data to Supabase. Continue?')) {
        return;
    }
    
    await syncToSupabase(true);
});

document.getElementById('pull-data-btn').addEventListener('click', async () => {
    if (!window.supabaseClient) {
        alert('Supabase is not initialized yet. Please check your configuration.');
        return;
    }
    
    const password = prompt('Enter password to pull data from cloud:');
    if (password !== 'zen83') {
        alert('❌ Incorrect password! Data pull cancelled.');
        return;
    }
    
    if (!confirm('⚠️ WARNING: This will replace ALL your local data with data from Supabase cloud.\n\nYour current local data will be lost!\n\nContinue?')) {
        return;
    }
    
    try {
        await VideoDB.clear();
        console.log("✓ Cleared local IndexedDB videos");
    } catch (err) {
        console.error("Error clearing IndexedDB:", err);
    }
    
    players = await loadPlayersFromCloud(true);
    currentCard = 0;
    resetTimer();
    await renderUI();
    
    console.log("✓ Local data replaced with cloud data");
});

/* ==========================================================================
   NAV BUTTONS & TIMER
   ========================================================================== */
document.getElementById('next-btn').addEventListener('click', () => { nextCard(); resetTimer(); });
document.getElementById('prev-btn').addEventListener('click', () => { prevCard(); resetTimer(); });

function startTimer()  { 
    if (players.length > 0) {
        autoPlayTimer = setInterval(nextCard, 4000); 
    }
}
function resetTimer()  { 
    clearInterval(autoPlayTimer); 
    startTimer(); 
}

/* ==========================================================================
   BOOT
   ========================================================================== */
const initialMatchState = {
    overs: 0,
    totalballs: 0,
    totalruns: 0,
    wicket: 0
};

document.querySelector("#btn").addEventListener("click", () => {
    if (players.length === 0) {
        alert('Please add players or pull data from cloud before starting a match!');
        return;
    }
    senddata();
    window.location.href = "team.html";
});

window.addEventListener('DOMContentLoaded', async () => {
    console.log("🚀 App initializing...");
    
    const hasMatchUpdates = mergeMatchDataIntoPlayersDB();
    if (hasMatchUpdates) {
        console.log("📊 Match data merged successfully");
    }
    
    let attempts = 0;
    while (!window.supabaseReady && attempts < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
    }

    if (!window.supabaseReady) {
        console.log("⚠️ Supabase not initialized - cloud sync features disabled");
    } else {
        console.log("✓ Supabase initialized - cloud sync available");
    }

    players = loadPlayers();
    
    console.log(`✓ Loaded ${players.length} players from local storage`);

    renderUI();
    startTimer();
    initSectionSwipe();
});