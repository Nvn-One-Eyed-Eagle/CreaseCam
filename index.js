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

        // Fetch all players from Supabase
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
        const playersDBObject = {}; // For localStorage
        let count = 0;
        
        for (const playerData of playersData) {
            count++;
            
            if (showUI) {
                syncMessage.textContent = `Downloading ${playerData.name} (${count}/${playersData.length})...`;
            }
            
            // Download videos and store in IndexedDB
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
            
            // Also prepare for localStorage (using name as key)
            const playerKey = playerData.name.toLowerCase().replace(/\s+/g, "");
            playersDBObject[playerKey] = player;
        }

        // Save to localStorage to replace local data
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

    // 1. Get local data
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

    // Fetch existing cloud data to merge
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

            // A. Upload Profile Image only if new or changed
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

            // B. Merge existing videos with new ones
            let existingFours = existingPlayer ? (existingPlayer.fours || []) : [];
            let existingSixes = existingPlayer ? (existingPlayer.sixes || []) : [];

            // C. Upload new videos (Fours and Sixes)
            for (let type of ['fours', 'sixes']) {
                for (let vid of (p[type] || [])) {
                    const base64Vid = await VideoDB.get(vid.video);
                    if (base64Vid) {
                        // Check if this video already exists (by over.ball combination)
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

            // D. Prepare the Player Object with merged data
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

            // E. Upsert (Insert or Update) to Supabase Database
            if (existingPlayer) {
                // Update existing player
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
                // Insert new player
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

    console.log("✓ Sync Complete! Check your Supabase Dashboard.");
    
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
    
    // Iterate through match data and merge into playersDB
    for (let playerKey in matchData) {
        if (playerKey === 'overs' || playerKey === 'totalballs' || playerKey === 'totalruns' || playerKey === 'wicket') {
            continue; // Skip match metadata
        }
        
        const matchPlayerData = matchData[playerKey];
        
        // Find the player in playersDB (case-insensitive name matching)
        let foundPlayer = null;
        for (let dbKey in playersDB) {
            if (dbKey.toLowerCase() === playerKey.toLowerCase()) {
                foundPlayer = playersDB[dbKey];
                break;
            }
        }
        
        if (foundPlayer && matchPlayerData) {
            // Update stats
            if (matchPlayerData.runs > 0 || matchPlayerData.balls > 0) {
                foundPlayer.runs = (foundPlayer.runs || 0) + (matchPlayerData.runs || 0);
                foundPlayer.balls = (foundPlayer.balls || 0) + (matchPlayerData.balls || 0);
                foundPlayer.matches = (foundPlayer.matches || 0) + 1;
                
                // Update high score if current score is higher
                if (matchPlayerData.runs > (foundPlayer.highScore || 0)) {
                    foundPlayer.highScore = matchPlayerData.runs;
                }
                
                // Merge fours videos
                if (matchPlayerData.fours && matchPlayerData.fours.length > 0) {
                    foundPlayer.fours = foundPlayer.fours || [];
                    foundPlayer.fours.push(...matchPlayerData.fours);
                }
                
                // Merge sixes videos
                if (matchPlayerData.sixes && matchPlayerData.sixes.length > 0) {
                    foundPlayer.sixes = foundPlayer.sixes || [];
                    foundPlayer.sixes.push(...matchPlayerData.sixes);
                }
                
                hasUpdates = true;
                console.log(`✓ Merged match data for ${foundPlayer.name}`);
            }
        }
    }
    
    // Save updated playersDB back to localStorage
    if (hasUpdates) {
        localStorage.setItem("playersDB", JSON.stringify(playersDB));
        console.log("✓ Match data merged into playersDB");
        
        // Clear matchData after successful merge
        localStorage.removeItem("matchData");
        console.log("✓ Match data cleared");
    }
    
    return hasUpdates;
}

let players = [];

/* ==========================================================================
   RENDER
   ========================================================================== */
async function renderUI() {
    renderCards();
    renderDots();
    await renderVideos();
    updatePlayerCount();
    lucide.createIcons();
}

function updatePlayerCount() {
    document.getElementById('player-count').textContent = players.length;
}

function renderCards() {
    const container = document.getElementById('cards-container');
    container.innerHTML = '';

    if (players.length === 0) {
        // Show empty state
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

        container.innerHTML += `
            <div class="${classes}" style="width: 90%; max-width: 320px;">
                <div class="player-card-bg rounded-2xl shadow-2xl overflow-hidden">
                    <div class="player-card-img relative h-48">
                        <img src="${player.image}" alt="${player.name}" class="w-full h-full object-cover">
                        <div class="absolute top-3 right-3 bg-emerald-500 text-white px-2.5 py-1 rounded-lg font-bold text-xs flex items-center gap-1 shadow-lg">
                            <i data-lucide="zap" class="w-3.5 h-3.5"></i>
                            ACTIVE
                        </div>
                    </div>
                    <div class="p-4">
                        <h3 class="text-xl font-black text-white mb-3">${player.name}</h3>
                        <div class="grid grid-cols-2 gap-2">
                            <div class="stat-box rounded-lg p-2.5 text-center">
                                <div class="text-lg font-bold text-emerald-400">${player.matches}</div>
                                <div class="text-xs text-white/60 font-medium">Matches</div>
                            </div>
                            <div class="stat-box rounded-lg p-2.5 text-center">
                                <div class="text-lg font-bold text-blue-400">${player.runs}</div>
                                <div class="text-xs text-white/60 font-medium">Runs</div>
                            </div>
                            <div class="stat-box rounded-lg p-2.5 text-center">
                                <div class="text-lg font-bold text-amber-400">${player.highScore}</div>
                                <div class="text-xs text-white/60 font-medium">High Score</div>
                            </div>
                            <div class="stat-box rounded-lg p-2.5 text-center">
                                <div class="text-lg font-bold text-purple-400">${player.strikeRate}</div>
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

    // Update tab button styles
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

    // Save to localStorage
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
    
    // Password protection
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
    
    if (!confirm('⚠️ WARNING: This will replace ALL your local data with data from Supabase cloud.\n\nYour current local data will be lost!\n\nContinue?')) {
        return;
    }
    
    // Clear IndexedDB videos before downloading new ones
    try {
        await VideoDB.clear();
        console.log("✓ Cleared local IndexedDB videos");
    } catch (err) {
        console.error("Error clearing IndexedDB:", err);
    }
    
    // Download from cloud and replace local data
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
    
    // Merge match data if returning from a match
    const hasMatchUpdates = mergeMatchDataIntoPlayersDB();
    if (hasMatchUpdates) {
        console.log("📊 Match data merged successfully");
    }
    
    // Wait for Supabase to be ready (but don't require it)
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

    // ALWAYS load from local storage by default (never auto-pull from cloud)
    console.log("📦 Loading from local storage");
    players = loadPlayers();
    
    console.log(`✓ Loaded ${players.length} players from local storage`);

    renderUI();
    startTimer();
});