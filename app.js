/**
 * بالإسلام نهتدي - تطبيق الحفظ التفاعلي للأطفال والمبتدئين وكبار السن
 * Secure Core Application Logic (Fully Offline Mode)
 */

// ==========================================
// 1. STATE & STORAGE MANAGEMENT
// ==========================================
const STATE = {
  // User progress data
  progress: {
    memorized: {}, // Format: { "surahNum_ayahNum": "memorized" | "memorizing" }
    streak: 0,
    lastActiveDate: null,
    totalMinutesListened: 0,
    activities: []
  },
  // Active memorization plan
  activePlan: null, // Format: { surahNum: 1, dailyTarget: 2, startDate: '', days: [...] }
  // Currently viewed Surah in reader
  currentSurah: null, // Full local data of current Surah
  currentSurahNum: 1, // Default to Al-Fatiha
  showTranslation: true,
  showTafsir: false,
  userMode: 'child', // 'child' | 'literate' | 'illiterate'
  readerLayout: 'page', // 'page' | 'cards'
  // Audio Player State
  audio: {
    isPlaying: false,
    currentSurahNum: null,
    currentAyahNum: null,
    currentGlobalAyahNum: null,
    selectedQari: 'ar.alafasy',
    repeatMode: '1', // Default to no repetition (play once)
    currentRepeatCount: 0,
    tafheemMode: '0', // '0' (off), 'auto', '3', '5', '10' seconds
    isPlayAllSurah: false,
    playlist: [], // Array of Ayahs to play in sequence
    playlistIndex: 0,
    tafheemTimer: null // Timeout reference for Tafheem pause
  },
  // Quiz State
  quiz: {
    mode: null, // 'reveal' or 'connect'
    currentAyah: null,
    revealIndex: 0,
    words: [],
    score: 0,
    questionCount: 0
  },
  // Hadith State
  hadithIndex: 0,
  // Memorize Mode State
  memorizeMode: false,
  memorizeWords: [],
  memorizePointer: 0,
  memorizeSessionStartPointer: 0,
  memorizeRecording: false
};

// Inspirational Daily Verses
const DAILY_VERSES = [
  { text: "وَلَقَدْ يَسَّرْنَا الْقُرْآنَ لِلذِّكْرِ فَهَلْ مِن مُّدَّكِرٍ", trans: "And We have certainly made the Qur'an easy for remembrance, so is there any who will remember?", ref: "سورة القمر - آية 17", globalNum: 4863 },
  { text: "إِنَّا نَحْنُ نَزَّلْنَا الذِّكْرَ وَإِنَّا لَهُ لَحَافِظُونَ", trans: "Indeed, it is We who sent down the Qur'an and indeed, We will be its guardian.", ref: "سورة الحجر - آية 9", globalNum: 1811 },
  { text: "إِنَّ هَٰذَا الْقُرْآنَ يَهْدِي لِلَّتِي هِيَ أَقْوَمُ", trans: "Indeed, this Qur'an guides to that which is most suitable", ref: "سورة الإسراء - آية 9", globalNum: 2038 },
  { text: "فَاقْرَءُوا مَا تَيَسَّرَ مِنَ الْقُرْآنِ", trans: "So recite what is easy [for you] of the Qur'an.", ref: "سورة المزمل - آية 20", globalNum: 5505 },
  { text: "وَرَتِّلِ الْقُرْآنَ تَرْتِيلًا", trans: "And recite the Qur'an with measured recitation.", ref: "سورة المزمل - آية 4", globalNum: 5489 }
];

const AUDIO_CACHE_NAME = 'bal-islam-audio-cache';

// ==========================================
// 2. SECURITY UTILITIES (XSS PREVENTION & SANITIZATION)
// ==========================================

// HTML Escape Sanitize Function (Crucial for preventing XSS)
function sanitizeInput(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[&<>"']/g, (match) => {
    const escape = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#x27;'
    };
    return escape[match];
  });
}

// Secure JSON parsing with defensive checks
function safeParseJSON(str, fallback) {
  if (!str) return fallback;
  try {
    const parsed = JSON.parse(str);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch (e) {
    console.error("Defensive parsing: localStorage is corrupted or altered. Restoring fallback.");
  }
  return fallback;
}

// Initialize LocalStorage Data safely
function initStorage() {
  const savedProgress = localStorage.getItem('quran_memorizer_progress');
  STATE.progress = safeParseJSON(savedProgress, STATE.progress);
  
  if (!STATE.progress || typeof STATE.progress !== 'object') {
    STATE.progress = { memorized: {}, streak: 0, lastActiveDate: null, totalMinutesListened: 0, activities: [] };
  }
  if (!STATE.progress.memorized || typeof STATE.progress.memorized !== 'object') {
    STATE.progress.memorized = {};
  }
  if (typeof STATE.progress.streak !== 'number') STATE.progress.streak = 0;
  if (typeof STATE.progress.totalMinutesListened !== 'number') STATE.progress.totalMinutesListened = 0;
  if (!Array.isArray(STATE.progress.activities)) STATE.progress.activities = [];

  const savedPlan = localStorage.getItem('quran_memorizer_plan');
  STATE.activePlan = safeParseJSON(savedPlan, null);
  
  if (STATE.activePlan) {
    if (typeof STATE.activePlan.surahNum !== 'number' || !Array.isArray(STATE.activePlan.days)) {
      STATE.activePlan = null;
      localStorage.removeItem('quran_memorizer_plan');
    }
  }

  // Validate settings against whitelisted values to prevent parameter injection
  const savedQari = localStorage.getItem('quran_memorizer_qari');
  const allowedQaris = [
    'ar.alafasy', 'ar.abdulbasitmurattal', 'ar.abdulbasitmudjawwad', 'ar.husary', 'ar.husarymujawwad',
    'ar.minshawi', 'ar.minshawimujawwad', 'ar.ghamadi', 'ar.mahermuaiqly', 'ar.sudais',
    'ar.yasseraldossary', 'ar.nasseranalqatami', 'ar.faresabbad', 'ar.hazzaalblushi', 'ar.kurd',
    'ar.ajamy', 'ar.shatri', 'ar.hudhaify', 'ar.shuraym', 'ar.muhammadayyoub',
    'ar.jabreel', 'ar.rifai', 'ar.basfar', 'ar.khalifahaltunaiji', 'ar.mahmoudalialbanna',
    'ar.mustafaismail', 'ar.salahbukhatir', 'ar.tablawi'
  ];
  if (savedQari && allowedQaris.includes(savedQari)) {
    STATE.audio.selectedQari = savedQari;
  }

  const savedMode = localStorage.getItem('quran_memorizer_mode');
  const allowedModes = ['child', 'literate', 'illiterate'];
  if (savedMode && allowedModes.includes(savedMode)) {
    STATE.userMode = savedMode;
  }

  const savedTafheem = localStorage.getItem('quran_memorizer_tafheem');
  const allowedTafheems = ['0', 'auto', '3', '5', '10'];
  if (savedTafheem && allowedTafheems.includes(savedTafheem)) {
    STATE.audio.tafheemMode = savedTafheem;
  }
}

function saveProgressToStorage() {
  try {
    localStorage.setItem('quran_memorizer_progress', JSON.stringify(STATE.progress));
  } catch (e) {
    console.error("Storage save failed:", e);
  }
}

function savePlanToStorage() {
  try {
    if (STATE.activePlan) {
      localStorage.setItem('quran_memorizer_plan', JSON.stringify(STATE.activePlan));
    } else {
      localStorage.removeItem('quran_memorizer_plan');
    }
  } catch (e) {
    console.error("Storage save failed:", e);
  }
}

// ==========================================
// 3. CACHE API - OFFLINE AUDIO SYSTEM
// ==========================================

async function isUrlCached(url) {
  try {
    const cache = await caches.open(AUDIO_CACHE_NAME);
    const match = await cache.match(url);
    return !!match;
  } catch (e) {
    return false;
  }
}

async function updateSurahOfflineUI() {
  const downloadBtn = document.getElementById('download-surah-btn');
  const deleteBtn = document.getElementById('delete-download-btn');
  const statusIcon = document.getElementById('download-status-icon');
  const statusText = document.getElementById('download-status-text');
  const progressBox = document.getElementById('download-progress-box');

  if (!STATE.currentSurah) {
    downloadBtn.disabled = true;
    return;
  }

  downloadBtn.disabled = false;
  const qari = STATE.audio.selectedQari;
  const ayahs = STATE.currentSurah.ayahs;
  
  let cachedCount = 0;
  for (const ayah of ayahs) {
    const url = `https://cdn.islamic.network/quran/audio/128/${qari}/${ayah.number}.mp3`;
    const cached = await isUrlCached(url);
    if (cached) cachedCount++;
  }

  const isAllCached = cachedCount === ayahs.length;

  if (isAllCached) {
    statusIcon.innerText = "✅";
    statusText.innerText = `جاهزة بالكامل للتشغيل بدون إنترنت (أوفلاين) ⚡`;
    downloadBtn.classList.add('hidden');
    deleteBtn.classList.remove('hidden');
    progressBox.classList.add('hidden');
  } else if (cachedCount > 0) {
    statusIcon.innerText = "📥";
    statusText.innerText = `جاهزة جزئياً: تم تحميل ${cachedCount} من أصل ${ayahs.length} آية.`;
    downloadBtn.classList.remove('hidden');
    downloadBtn.innerText = "إكمال تحميل السورة 📥";
    deleteBtn.classList.remove('hidden');
  } else {
    statusIcon.innerText = "📶";
    statusText.innerText = `السورة متوفرة للتحميل والاستماع بدون إنترنت.`;
    downloadBtn.classList.remove('hidden');
    downloadBtn.innerText = "تحميل للاستماع بدون نت 📥";
    deleteBtn.classList.add('hidden');
    progressBox.classList.add('hidden');
  }
}

async function downloadSurahAudio() {
  if (!STATE.currentSurah) return;
  
  const downloadBtn = document.getElementById('download-surah-btn');
  const deleteBtn = document.getElementById('delete-download-btn');
  const progressBox = document.getElementById('download-progress-box');
  const progressBar = document.getElementById('download-progress-bar');
  const progressText = document.getElementById('download-percent-text');
  const statusText = document.getElementById('download-status-text');

  downloadBtn.disabled = true;
  deleteBtn.classList.add('hidden');
  progressBox.classList.remove('hidden');

  const qari = STATE.audio.selectedQari;
  const ayahs = STATE.currentSurah.ayahs;
  const total = ayahs.length;
  
  try {
    const cache = await caches.open(AUDIO_CACHE_NAME);
    
    for (let i = 0; i < total; i++) {
      const ayah = ayahs[i];
      const url = `https://cdn.islamic.network/quran/audio/128/${qari}/${ayah.number}.mp3`;
      
      const cached = await isUrlCached(url);
      if (!cached) {
        await cache.add(url);
      }

      const pct = Math.round(((i + 1) / total) * 100);
      progressBar.style.width = `${pct}%`;
      progressText.innerText = `${pct}% (${i + 1}/${total})`;
      statusText.innerText = `جاري تحميل الآية ${ayah.numberInSurah} من أصل ${total}...`;
    }

    statusText.innerText = `اكتمل تحميل التلاوة بنجاح! 🎉`;
    logActivity(`تحميل صوتيات أوفلاين`, `سورة ${STATE.currentSurah.englishName}`, `تحميل ناجح`);
    
    triggerKidCongratulation(`تم تنزيل وحفظ صوت الشيخ لسورة ${sanitizeInput(STATE.currentSurah.name)} على جهازك بنجاح! 🎧✨`);
    
  } catch (err) {
    console.error("Download failed:", err);
    statusText.innerText = `فشل التحميل. يرجى التحقق من اتصال الشبكة.`;
  }

  setTimeout(() => {
    updateSurahOfflineUI();
  }, 1000);
}

async function deleteSurahAudio() {
  if (!STATE.currentSurah) return;
  if (!confirm(`هل أنت متأكد من رغبتك في حذف الملفات الصوتية لسورة ${STATE.currentSurah.name} من جهازك؟`)) return;

  const qari = STATE.audio.selectedQari;
  const ayahs = STATE.currentSurah.ayahs;
  
  try {
    const cache = await caches.open(AUDIO_CACHE_NAME);
    for (const ayah of ayahs) {
      const url = `https://cdn.islamic.network/quran/audio/128/${qari}/${ayah.number}.mp3`;
      await cache.delete(url);
    }
    
    alert("تم حذف الملفات الصوتية بنجاح.");
    updateSurahOfflineUI();
  } catch (err) {
    console.error("Deletion failed:", err);
  }
}

// ==========================================
// 4. STREAK & STATS COMPUTATION
// ==========================================
function updateStreak() {
  const today = new Date().toDateString();
  const lastActive = STATE.progress.lastActiveDate;

  if (!lastActive) {
    STATE.progress.streak = 1;
  } else {
    const lastDate = new Date(lastActive);
    const todayDate = new Date(today);
    const diffTime = Math.abs(todayDate - lastDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      STATE.progress.streak += 1;
    } else if (diffDays > 1) {
      STATE.progress.streak = 1;
    }
  }

  STATE.progress.lastActiveDate = today;
  saveProgressToStorage();
}

function logActivity(title, statusText, badgeText = '') {
  const activity = {
    title: sanitizeInput(title),
    time: 'الآن',
    status: sanitizeInput(statusText),
    badge: sanitizeInput(badgeText),
    timestamp: new Date().getTime()
  };
  STATE.progress.activities.unshift(activity);
  
  if (STATE.progress.activities.length > 10) {
    STATE.progress.activities.pop();
  }
  saveProgressToStorage();
  renderDashboard();
}

function getMemorizationStats() {
  let memorizedCount = 0;
  let memorizingCount = 0;

  Object.values(STATE.progress.memorized).forEach(status => {
    if (status === 'memorized') memorizedCount++;
    else if (status === 'memorizing') memorizingCount++;
  });

  const totalQuranAyahs = 6236;
  const percent = ((memorizedCount / totalQuranAyahs) * 100).toFixed(2);

  return {
    memorizedCount,
    memorizingCount,
    percent: percent + '%',
    totalQuranAyahs
  };
}

function getUserRank(memorizedCount) {
  if (STATE.userMode === 'child') {
    if (memorizedCount >= 6236) return "الحافظ الصغير المتقن 👑";
    if (memorizedCount >= 300) return "نجم الحفاظ الصغير ✨";
    if (memorizedCount >= 50) return "بطل الحفظ الصاعد 🌱";
    return "بطل الحفظ المبتدئ 👶";
  } else {
    if (memorizedCount >= 6236) return "الحافظ الجامع للقرآن 👑";
    if (memorizedCount >= 1000) return "حفظ متقدم ومتميز 💫";
    if (memorizedCount >= 300) return "قارئ مواظب ومتقن ✨";
    return "مبتدئ الحفظ المبارك 🌱";
  }
}


// ==========================================
// 5. UI RENDERING - HADITH CAROUSEL & DASHBOARD (SAFE ASSIGNMENTS)
// ==========================================
function renderHadith() {
  const hadith = HADITH_DATA[STATE.hadithIndex];
  
  document.getElementById('db-hadith-text').textContent = hadith.text;
  document.getElementById('db-hadith-source').textContent = `المصدر: ${hadith.source}`;
  document.getElementById('db-hadith-explanation').textContent = `💡 التوجيه التربوي: ${hadith.explanation}`;
}

document.getElementById('next-hadith-btn').onclick = () => {
  STATE.hadithIndex = (STATE.hadithIndex + 1) % HADITH_DATA.length;
  renderHadith();
};

function renderDashboard() {
  const stats = getMemorizationStats();
  
  document.getElementById('stat-progress-percent').textContent = stats.percent;
  document.getElementById('stat-streak-days').textContent = `${STATE.progress.streak} يوم`;
  document.getElementById('stat-memorizing-count').textContent = `${stats.memorizingCount} آية`;
  document.getElementById('stat-memorized-count').textContent = `${stats.memorizedCount} آية`;

  const rank = getUserRank(stats.memorizedCount);
  document.getElementById('header-user-rank').textContent = rank;

  const avatarEl = document.getElementById('header-user-avatar');
  const nameEl = document.querySelector('.user-profile .user-name');
  
  if (STATE.userMode === 'child') {
    avatarEl.textContent = "👦";
    nameEl.textContent = "بطل الحفظ";
    document.getElementById('dashboard-title').textContent = "لوحة التحكم والحديث الشريف 🕋";
    document.getElementById('dashboard-subtitle').textContent = "أهلاً بك يا بطل الحفظ! تذكر أن كل حرف تقرؤه لك به حسنات كثيرة 🌟";
  } else if (STATE.userMode === 'literate') {
    avatarEl.textContent = "📚";
    nameEl.textContent = "القارئ الكريم";
    document.getElementById('dashboard-title').textContent = "منصة القراءة والحديث النبوي الشريف 🕌";
    document.getElementById('dashboard-subtitle').textContent = "مرحباً بك. نسأل الله أن يجعل القرآن ربيع قلوبنا ونور صدورنا وجلاء أحزاننا.";
  } else {
    avatarEl.textContent = "👂";
    nameEl.textContent = "مستمع القرآن";
    document.getElementById('dashboard-title').textContent = "منصة التلقين والاستماع للقرآن الكريم 🔊";
    document.getElementById('dashboard-subtitle').textContent = "أهلاً بك. استمع بإنصات وردد مع الشيخ لتثبت حفظ الآيات المباركة بكل سهولة.";
  }

  // Load Daily Verse
  const dayOfYear = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  const dailyVerse = DAILY_VERSES[dayOfYear % DAILY_VERSES.length];
  
  document.getElementById('db-daily-arabic').textContent = `« ${dailyVerse.text} »`;
  document.getElementById('db-daily-english').textContent = dailyVerse.trans;
  document.getElementById('db-daily-ref').textContent = dailyVerse.ref;

  const playDailyBtn = document.getElementById('db-play-daily-btn');
  playDailyBtn.onclick = () => {
    playAyahDirectly(dailyVerse.globalNum, dailyVerse.ref, `آية الحفظ اليومية`);
  };

  // Render recent activities
  const activityList = document.getElementById('db-activity-list');
  if (!activityList) return;
  activityList.innerHTML = '';
  
  if (STATE.progress.activities.length === 0) {
    const div = document.createElement('div');
    div.style.cssText = "text-align: center; color: var(--text-muted); padding: 20px; font-size: 0.9rem;";
    div.textContent = "لا توجد نشاطات مؤخراً. ابدأ بالحفظ والاستماع الآن!";
    activityList.appendChild(div);
  } else {
    STATE.progress.activities.forEach(act => {
      const timeStr = getRelativeTime(act.timestamp);
      const emoji = act.title.includes('خطة') ? '🎯' : act.status.includes('تم') ? '🟢' : '🟡';
      
      const item = document.createElement('div');
      item.className = 'activity-item';
      
      item.innerHTML = `
        <div class="activity-icon">${emoji}</div>
        <div class="activity-info">
          <div class="activity-title">${sanitizeInput(act.title)}</div>
          <div class="activity-time">${sanitizeInput(timeStr)}</div>
        </div>
        <div class="activity-progress" style="color: ${act.status.includes('تم') ? 'var(--color-emerald)' : 'var(--color-accent)'}">${sanitizeInput(act.status)}</div>
      `;
      activityList.appendChild(item);
    });
  }
}

function getRelativeTime(timestamp) {
  const diff = new Date().getTime() - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (seconds < 60) return 'الآن';
  if (minutes < 60) return `منذ ${minutes} د`;
  if (hours < 24) return `منذ ${hours} س`;
  return new Date(timestamp).toLocaleDateString('ar-EG');
}

function triggerKidCongratulation(message) {
  const alertOverlay = document.createElement('div');
  alertOverlay.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
    background: rgba(11, 17, 30, 0.9); display: flex; align-items: center; justify-content: center;
    z-index: 10000; animation: fadeIn 0.3s; direction: rtl;
  `;
  
  const contentBox = document.createElement('div');
  contentBox.style.cssText = `
    background: var(--bg-secondary); border: 2px solid var(--color-emerald);
    border-radius: 24px; padding: 32px; max-width: 450px; text-align: center;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6); animation: scaleUp 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  `;
  
  const title = STATE.userMode === 'child' ? "أحسنت يا بطل! 🎉" : "تقبل الله منك! 🕌";
  const icon = STATE.userMode === 'child' ? "🌟🏆🎉" : "🕌✨🌷";
  const btnText = STATE.userMode === 'child' ? "شكراً جزيلاً! 👍" : "آمين، بارك الله فيك";

  contentBox.innerHTML = `
    <div style="font-size: 4rem; margin-bottom: 16px;">${icon}</div>
    <h3 style="font-size: 1.5rem; color: var(--color-emerald); margin-bottom: 12px;">${sanitizeInput(title)}</h3>
    <p style="color: var(--text-primary); font-size: 1.05rem; line-height: 1.6; margin-bottom: 24px;">${sanitizeInput(message)}</p>
    <button class="submit-btn" style="width: auto; padding: 12px 36px; margin: 0 auto; display: block;" id="kid-alert-ok-btn">${sanitizeInput(btnText)}</button>
  `;
  
  alertOverlay.appendChild(contentBox);
  document.body.appendChild(alertOverlay);
  
  if (!document.getElementById('scale-up-style')) {
    const style = document.createElement('style');
    style.id = 'scale-up-style';
    style.innerHTML = `@keyframes scaleUp { from { transform: scale(0.8); opacity: 0; } to { transform: scale(1); opacity: 1; } }`;
    document.head.appendChild(style);
  }

  document.getElementById('kid-alert-ok-btn').onclick = () => {
    alertOverlay.remove();
  };
}

// ==========================================
// 6. USER PERSONA MODE CONTROLLER
// ==========================================
function setupUserModeSwitcher() {
  document.querySelectorAll('.mode-select-btn').forEach(btn => {
    btn.onclick = (e) => {
      e.preventDefault();
      const selectedMode = btn.getAttribute('data-mode');
      setUserMode(selectedMode);
    };
  });
}

function setUserMode(mode) {
  STATE.userMode = mode;
  localStorage.setItem('quran_memorizer_mode', mode);

  document.querySelectorAll('.mode-select-btn').forEach(btn => {
    if (btn.getAttribute('data-mode') === mode) {
      btn.classList.add('active');
      btn.style.background = 'var(--color-emerald)';
      btn.style.color = 'white';
    } else {
      btn.classList.remove('active');
      btn.style.background = 'var(--bg-primary)';
      btn.style.color = 'var(--text-secondary)';
    }
  });

  document.body.className = `mode-${mode}`;

  const layoutBtn = document.getElementById('toggle-layout-btn');
  if (mode === 'illiterate') {
    STATE.readerLayout = 'cards';
    if (layoutBtn) layoutBtn.classList.add('hidden');
  } else {
    if (layoutBtn) {
      layoutBtn.classList.remove('hidden');
      layoutBtn.classList.toggle('active', STATE.readerLayout === 'page');
      layoutBtn.querySelector('span').textContent = STATE.readerLayout === 'page' ? 'تصفح كبطاقات 🏫' : 'تصفح كصفحة مصحف 📖';
    }
  }

  renderDashboard();
  renderVerses();

  const activeNav = document.querySelector('.nav-item.active');
  const activeView = activeNav ? activeNav.getAttribute('data-view') : 'dashboard';
  
  if (mode === 'illiterate' && (activeView === 'planner' || activeView === 'quiz')) {
    document.querySelector('.nav-item[data-view="reader"]').click();
  }
}

// ==========================================
// 7. UI RENDERING - QURAN READER & TAFSIR (100% OFFLINE DATA LOAD)
// ==========================================
function renderSurahSidebar() {
  const listContainer = document.getElementById('reader-surah-list');
  listContainer.innerHTML = '';

  QURAN_COMPLETE_DATA.forEach(surah => {
    const btn = document.createElement('button');
    btn.className = `surah-card-btn ${STATE.currentSurahNum === surah.number ? 'active' : ''}`;
    btn.setAttribute('data-number', surah.number);
    
    const typeArabic = surah.revelationType === 'Meccan' ? 'مكية' : 'مدنية';

    btn.innerHTML = `
      <div class="surah-num">${surah.number}</div>
      <div class="surah-meta-details">
        <div class="surah-name-en">${sanitizeInput(surah.englishName)}</div>
        <div class="surah-sub-info">
          <span>${sanitizeInput(surah.englishNameTranslation)}</span>
          <span>•</span>
          <span>${surah.numberOfAyahs} آية</span>
        </div>
      </div>
      <div class="surah-name-ar">
        <div>${sanitizeInput(surah.name)}</div>
        <span style="font-size: 0.7rem; color: var(--text-muted); display: block; text-align: right;">${typeArabic}</span>
      </div>
    `;

    btn.addEventListener('click', () => {
      document.querySelectorAll('.surah-card-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loadSurah(surah.number);
    });

    listContainer.appendChild(btn);
  });
}

// Search Filter
document.getElementById('surah-search').addEventListener('input', (e) => {
  const query = e.target.value.toLowerCase().trim();
  const buttons = document.querySelectorAll('.surah-card-btn');
  
  buttons.forEach(btn => {
    const englishName = btn.querySelector('.surah-name-en').textContent.toLowerCase();
    const arabicName = btn.querySelector('.surah-name-ar div').textContent;
    
    const normalizedArabic = arabicName.replace(/[ًٌٍَُِّْ]/g, "");
    const normalizedQuery = query.replace(/[ًٌٍَُِّْ]/g, "");

    if (englishName.includes(query) || arabicName.includes(query) || normalizedArabic.includes(normalizedQuery)) {
      btn.style.display = 'flex';
    } else {
      btn.style.display = 'none';
    }
  });
});

// FULLY OFFLINE: Load Surah directly from QURAN_COMPLETE_DATA in memory (0ms delay)
async function loadSurah(surahNum) {
  STATE.currentSurahNum = surahNum;
  const container = document.getElementById('verses-display-container');
  
  const surahData = QURAN_COMPLETE_DATA.find(s => s.number === surahNum);
  
  if (!surahData) {
    container.innerHTML = `
      <div style="text-align: center; color: var(--color-danger); padding: 40px;">
        خطأ: لم يتم العثور على بيانات السورة المحددة.
      </div>
    `;
    return;
  }

  // Update active class in sidebar buttons
  document.querySelectorAll('.surah-card-btn').forEach(btn => {
    const num = parseInt(btn.getAttribute('data-number'));
    btn.classList.toggle('active', num === surahNum);
  });

  // Update header textContent
  document.getElementById('current-surah-title-header').textContent = `${surahData.name} (${surahData.englishName})`;

  STATE.currentSurah = surahData;
  initMemorizeWordsForSurah();
  renderVerses();
  updateSurahOfflineUI();
}

function getActiveMemorizeAyahNum() {
  if (!STATE.memorizeMode || !STATE.memorizeWords || STATE.memorizeWords.length === 0) {
    return null;
  }
  if (STATE.memorizePointer < STATE.memorizeWords.length) {
    return STATE.memorizeWords[STATE.memorizePointer].ayahNum;
  }
  return STATE.currentSurah ? STATE.currentSurah.ayahs.length : 1;
}

function renderVerses() {
  const container = document.getElementById('verses-display-container');
  container.innerHTML = '';
  
  const surah = STATE.currentSurah;
  if (!surah) return;

  const activeMemorizeAyahNum = getActiveMemorizeAyahNum();

  if (STATE.readerLayout === 'page') {
    // 1. Render as Continuous Quran Page
    const paper = document.createElement('div');
    paper.className = 'quran-page-paper';
    
    // Add Bismillah header
    if (surah.number !== 1 && surah.number !== 9) {
      const bismillahBox = document.createElement('div');
      bismillahBox.style.cssText = "text-align: center; font-family: var(--font-ar); font-size: 1.8rem; margin-bottom: 28px; color: var(--color-gold); font-weight: 700; width: 100%;";
      
      const firstAyahText = surah.ayahs[0].text;
      if (firstAyahText.startsWith("بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ")) {
        surah.ayahs[0].displayTxt = firstAyahText.replace("بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ ", "");
      }
      bismillahBox.textContent = "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ";
      paper.appendChild(bismillahBox);
    }

    // Render all verses inline
    const paragraph = document.createElement('p');
    paragraph.style.cssText = "display: inline; margin: 0; padding: 0;";
    
    surah.ayahs.forEach(ayah => {
      if (activeMemorizeAyahNum !== null && ayah.numberInSurah > activeMemorizeAyahNum) {
        return; // Skip future verses
      }

      const ayahKey = `${surah.number}_${ayah.numberInSurah}`;
      const status = STATE.progress.memorized[ayahKey] || 'not_started';
      const isActive = STATE.audio.currentSurahNum === surah.number && STATE.audio.currentAyahNum === ayah.numberInSurah;
      
      const ayahSpan = document.createElement('span');
      ayahSpan.className = `ayah-span status-${status} ${isActive ? 'active' : ''}`;
      ayahSpan.id = `ayah-span-${ayah.numberInSurah}`;
      renderAyahTextWithWords(ayah, ayahSpan);
      
      const ornamentSpan = document.createElement('span');
      ornamentSpan.className = 'ayah-ornament';
      ornamentSpan.textContent = ayah.numberInSurah;
      
      // Tap to play/select
      const handleAyahSelect = () => {
        playSingleAyah(surah.number, ayah.numberInSurah);
      };
      
      ayahSpan.addEventListener('click', handleAyahSelect);
      ornamentSpan.addEventListener('click', handleAyahSelect);
      
      paragraph.appendChild(ayahSpan);
      paragraph.appendChild(ornamentSpan);
    });
    
    paper.appendChild(paragraph);
    container.appendChild(paper);

    // 2. Add details container below the page paper
    const detailsPanel = document.createElement('div');
    detailsPanel.id = 'ayah-page-details-panel';
    detailsPanel.style.marginTop = '24px';
    container.appendChild(detailsPanel);

    // Auto-select active or first ayah
    const activeAyahNum = (STATE.audio.currentSurahNum === surah.number) ? STATE.audio.currentAyahNum : 1;
    renderPageAyahDetails(surah.number, activeAyahNum);

  } else {
    // 3. Render as Cards (Teacher/Illiterate mode)
    if (surah.number !== 1 && surah.number !== 9) {
      const bismillahBox = document.createElement('div');
      bismillahBox.style.cssText = "text-align: center; font-family: var(--font-ar); font-size: 1.8rem; margin-bottom: 24px; color: var(--color-gold);";
      const firstAyahText = surah.ayahs[0].text;
      if (firstAyahText.startsWith("بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ")) {
        surah.ayahs[0].displayTxt = firstAyahText.replace("بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ ", "");
      }
      bismillahBox.textContent = "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ";
      container.appendChild(bismillahBox);
    }

    surah.ayahs.forEach(ayah => {
      if (activeMemorizeAyahNum !== null && ayah.numberInSurah > activeMemorizeAyahNum) {
        return; // Skip future verses
      }

      const card = document.createElement('article');
      const ayahKey = `${surah.number}_${ayah.numberInSurah}`;
      const status = STATE.progress.memorized[ayahKey] || 'not_started';
      
      card.className = `ayah-card status-${status}`;
      card.id = `ayah-card-${ayah.numberInSurah}`;
      card.setAttribute('data-global-number', ayah.number);
      
      if (STATE.audio.currentSurahNum === surah.number && STATE.audio.currentAyahNum === ayah.numberInSurah) {
        card.classList.add('active');
      }

      card.innerHTML = `
        <div class="ayah-card-header">
          <span class="ayah-badge">الآية ${ayah.numberInSurah}</span>
          
          <div class="ayah-status-dropdown">
            <select class="ayah-status-select" data-key="${ayahKey}">
              <option value="not_started" ${status === 'not_started' ? 'selected' : ''}>لم تبدأ ⚪</option>
              <option value="memorizing" ${status === 'memorizing' ? 'selected' : ''}>جاري الحفظ ⏳</option>
              <option value="memorized" ${status === 'memorized' ? 'selected' : ''}>تم الحفظ 🎉</option>
            </select>
          </div>
        </div>
        <div class="ayah-text-arabic"></div>
        
        <div class="ayah-translation ${STATE.showTranslation ? '' : 'hidden'}">${sanitizeInput(ayah.translation)}</div>
        
        <div class="ayah-tafsir ${STATE.showTafsir ? '' : 'hidden'}" id="tafsir-content-${ayah.numberInSurah}" style="background: rgba(217, 119, 6, 0.04); border-right: 4px solid var(--color-gold); padding: 12px; margin-top: 12px; border-radius: 8px; font-size: 0.95rem; line-height: 1.5; color: var(--text-primary); text-align: right; direction: rtl;">
          <strong>التفسير الميسر:</strong> ${sanitizeInput(ayah.tafsir)}
        </div>

        <div class="ayah-controls" style="justify-content: space-between; align-items: center;">
          <div>
            <button class="action-btn tafsir-toggle-btn" style="padding: 6px 12px; font-size: 0.8rem; border-color: rgba(217, 119, 6, 0.25); color: var(--color-gold);">
              التفسير 📖
            </button>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="ayah-play-btn" title="استمع للآية">
              <svg viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>
            </button>
          </div>
        </div>

        <button class="illiterate-memorize-btn" id="illiterate-btn-${ayah.numberInSurah}">
          ${status === 'memorized' ? 'تم حفظ الآية بنجاح 🟢 (اضغط للإلغاء)' : 'اضغط هنا بعد الترديد والحفظ 👍'}
        </button>
      `;

      renderAyahTextWithWords(ayah, card.querySelector('.ayah-text-arabic'));

      const select = card.querySelector('.ayah-status-select');
      select.addEventListener('change', (e) => {
        const newStatus = e.target.value;
        updateAyahStatus(surah.number, ayah.numberInSurah, newStatus);
      });

      const playBtn = card.querySelector('.ayah-play-btn');
      playBtn.addEventListener('click', () => {
        playSingleAyah(surah.number, ayah.numberInSurah);
      });

      const tafsirBtn = card.querySelector('.tafsir-toggle-btn');
      tafsirBtn.addEventListener('click', () => {
        const content = card.querySelector(`#tafsir-content-${ayah.numberInSurah}`);
        content.classList.toggle('hidden');
      });

      const illiterateBtn = card.querySelector('.illiterate-memorize-btn');
      illiterateBtn.onclick = () => {
        const currentStatus = STATE.progress.memorized[ayahKey];
        const nextStatus = currentStatus === 'memorized' ? 'not_started' : 'memorized';
        updateAyahStatus(surah.number, ayah.numberInSurah, nextStatus);
      };

      container.appendChild(card);
    });
  }
}

function renderPageAyahDetails(surahNum, ayahNum) {
  const panel = document.getElementById('ayah-page-details-panel');
  if (!panel) return;

  const surah = QURAN_COMPLETE_DATA.find(s => s.number === surahNum);
  if (!surah) return;
  const ayah = surah.ayahs.find(a => a.numberInSurah === ayahNum);
  if (!ayah) return;

  const ayahKey = `${surahNum}_${ayahNum}`;
  const status = STATE.progress.memorized[ayahKey] || 'not_started';

  panel.innerHTML = `
    <div style="background: var(--bg-tertiary); border: 1px solid var(--glass-border); border-radius: 16px; padding: 20px; display: flex; flex-direction: column; gap: 12px; animation: fadeIn 0.3s;">
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
        <span class="ayah-badge" style="font-size: 0.85rem;">سورة ${sanitizeInput(surah.name)} - الآية ${ayahNum}</span>
        
        <div style="display: flex; gap: 8px; align-items: center;">
          <span style="font-size: 0.85rem; color: var(--text-secondary);">حالة الحفظ:</span>
          <select class="ayah-status-select page-detail-status-select" data-key="${ayahKey}" style="background: var(--bg-secondary); border: 1px solid var(--glass-border); color: var(--text-primary); font-size: 0.85rem; padding: 6px 12px; border-radius: 8px;">
            <option value="not_started" ${status === 'not_started' ? 'selected' : ''}>لم تبدأ ⚪</option>
            <option value="memorizing" ${status === 'memorizing' ? 'selected' : ''}>جاري الحفظ ⏳</option>
            <option value="memorized" ${status === 'memorized' ? 'selected' : ''}>تم الحفظ 🎉</option>
          </select>
        </div>
      </div>
      
      <div class="ayah-translation ${STATE.showTranslation ? '' : 'hidden'}" style="border: none; padding: 0; margin: 0; font-size: 0.95rem; color: var(--text-secondary); line-height: 1.5;">${sanitizeInput(ayah.translation)}</div>
      
      <div class="ayah-tafsir ${STATE.showTafsir ? '' : 'hidden'}" style="background: rgba(217, 119, 6, 0.04); border-right: 4px solid var(--color-gold); padding: 12px; border-radius: 8px; font-size: 0.9rem; line-height: 1.5; color: var(--text-primary); text-align: right; direction: rtl;">
        <strong>التفسير الميسر:</strong> ${sanitizeInput(ayah.tafsir)}
      </div>
    </div>
  `;

  const select = panel.querySelector('.page-detail-status-select');
  select.addEventListener('change', (e) => {
    updateAyahStatus(surahNum, ayahNum, e.target.value);
  });
}

function updateAyahStatus(surahNum, ayahNum, newStatus) {
  const key = `${surahNum}_${ayahNum}`;
  const nextStatus = ['not_started', 'memorizing', 'memorized'].includes(newStatus) ? newStatus : 'not_started';
  
  if (nextStatus === 'not_started') {
    delete STATE.progress.memorized[key];
  } else {
    STATE.progress.memorized[key] = nextStatus;
  }
  
  saveProgressToStorage();
  updateStreak();
  renderDashboard();

  const card = document.getElementById(`ayah-card-${ayahNum}`);
  if (card) {
    card.className = `ayah-card status-${nextStatus}`;
    if (STATE.audio.currentSurahNum === surahNum && STATE.audio.currentAyahNum === ayahNum) {
      card.classList.add('active');
    }
    
    const select = card.querySelector('.ayah-status-select');
    if (select) select.value = nextStatus;
    
    const illBtn = card.querySelector('.illiterate-memorize-btn');
    if (illBtn) {
      illBtn.textContent = nextStatus === 'memorized' ? 'تم حفظ الآية بنجاح 🟢 (اضغط للإلغاء)' : 'اضغط هنا بعد الترديد والحفظ 👍';
    }
  }
  const span = document.getElementById(`ayah-span-${ayahNum}`);
  if (span) {
    span.className = `ayah-span status-${nextStatus} ${STATE.audio.currentAyahNum === ayahNum ? 'active' : ''}`;
    renderPageAyahDetails(surahNum, ayahNum);
  }

  const metadata = QURAN_COMPLETE_DATA.find(s => s.number === surahNum);
  const surahName = metadata ? metadata.name : `سورة ${surahNum}`;
  
  if (nextStatus === 'memorized') {
    logActivity(`حفظ آية من ${surahName}`, `تم الحفظ بنجاح 🎉`, `آية ${ayahNum}`);
    
    let phrase = `لقد أتممت حفظ الآية ${ayahNum} من سورة ${surahName} بنجاح! ثبّتك الله وحفظك. 🌟🏆`;
    if (STATE.userMode === 'child') {
      phrase = `أحسنت يا بطل الحفظ! لقد أتممت حفظ الآية ${ayahNum} من سورة ${surahName} بنجاح! واصل التقدم الرائع 🏆✨`;
    }
    
    triggerKidCongratulation(phrase);
    checkSurahCompletion(surahNum);
  } else if (nextStatus === 'memorizing') {
    logActivity(`بدء حفظ آية من ${surahName}`, `جاري الحفظ ⏳`, `آية ${ayahNum}`);
  }
}

function checkSurahCompletion(surahNum) {
  const metadata = QURAN_COMPLETE_DATA.find(s => s.number === surahNum);
  if (!metadata) return;

  let allCompleted = true;
  for (let a = 1; a <= metadata.numberOfAyahs; a++) {
    if (STATE.progress.memorized[`${surahNum}_${a}`] !== 'memorized') {
      allCompleted = false;
      break;
    }
  }

  if (allCompleted) {
    const alreadyLogged = STATE.progress.activities.some(act => act.title === `إتمام حفظ ${metadata.name}`);
    if (!alreadyLogged) {
      logActivity(`إتمام حفظ ${metadata.name}`, `سورة كاملة! 🌟👑`, `إنجاز عظيم`);
      triggerKidCongratulation(`مبارك! لقد أتممت حفظ سورة ${metadata.name} كاملة بنجاح! نسأل الله أن يجعله شفيعاً لك يوم القيامة. 🕋🏆🎉`);
    }
  }
}

document.getElementById('toggle-translation-btn').addEventListener('click', (e) => {
  STATE.showTranslation = !STATE.showTranslation;
  e.currentTarget.classList.toggle('active', STATE.showTranslation);
  
  document.querySelectorAll('.ayah-translation').forEach(el => {
    el.classList.toggle('hidden', !STATE.showTranslation);
  });
  
  e.currentTarget.querySelector('span').textContent = STATE.showTranslation ? 'إخفاء الترجمة' : 'إظهار الترجمة';
});

document.getElementById('toggle-global-tafsir-btn').addEventListener('click', (e) => {
  STATE.showTafsir = !STATE.showTafsir;
  e.currentTarget.classList.toggle('active', STATE.showTafsir);
  
  document.querySelectorAll('.ayah-tafsir').forEach(el => {
    el.classList.toggle('hidden', !STATE.showTafsir);
  });
  
  e.currentTarget.querySelector('span').textContent = STATE.showTafsir ? 'إخفاء التفسير 📖' : 'إظهار التفسير 📖';
});

document.getElementById('toggle-layout-btn').addEventListener('click', (e) => {
  STATE.readerLayout = STATE.readerLayout === 'page' ? 'cards' : 'page';
  e.currentTarget.classList.toggle('active', STATE.readerLayout === 'page');
  e.currentTarget.querySelector('span').textContent = STATE.readerLayout === 'page' ? 'تصفح كبطاقات 🏫' : 'تصفح كصفحة مصحف 📖';
  renderVerses();
});

document.getElementById('download-surah-btn').onclick = () => {
  downloadSurahAudio();
};

document.getElementById('delete-download-btn').onclick = () => {
  deleteSurahAudio();
};


// ==========================================
// 8. AUDIO PLAYER WITH TAFHEEM (PAUSE & REPEAT)
// ==========================================
const audioPlayer = document.getElementById('quran-audio-player');

const globalPlayBtn = document.getElementById('player-play-btn');
const globalPlayIcon = document.getElementById('player-play-icon');
const globalPrevBtn = document.getElementById('player-prev-btn');
const globalNextBtn = document.getElementById('player-next-btn');
const globalRepeatBtn = document.getElementById('player-repeat-btn');
const progressTrack = document.getElementById('player-progress-track');
const progressBar = document.getElementById('player-progress-bar');
const timeDisplayCurrent = document.getElementById('player-current-time');
const timeDisplayTotal = document.getElementById('player-total-time');
const playerQariSelect = document.getElementById('player-qari-select');
const playerTafheemSelect = document.getElementById('player-tafheem-select');

// Sync Reciter Selector
playerQariSelect.value = STATE.audio.selectedQari;
playerQariSelect.addEventListener('change', (e) => {
  const allowedQaris = [
    'ar.alafasy', 'ar.abdulbasitmurattal', 'ar.abdulbasitmudjawwad', 'ar.husary', 'ar.husarymujawwad',
    'ar.minshawi', 'ar.minshawimujawwad', 'ar.ghamadi', 'ar.mahermuaiqly', 'ar.sudais',
    'ar.yasseraldossary', 'ar.nasseranalqatami', 'ar.faresabbad', 'ar.hazzaalblushi', 'ar.kurd',
    'ar.ajamy', 'ar.shatri', 'ar.hudhaify', 'ar.shuraym', 'ar.muhammadayyoub',
    'ar.jabreel', 'ar.rifai', 'ar.basfar', 'ar.khalifahaltunaiji', 'ar.mahmoudalialbanna',
    'ar.mustafaismail', 'ar.salahbukhatir', 'ar.tablawi'
  ];
  if (!allowedQaris.includes(e.target.value)) return;

  STATE.audio.selectedQari = e.target.value;
  localStorage.setItem('quran_memorizer_qari', e.target.value);
  document.getElementById('settings-qari-select').value = e.target.value;
  
  updateSurahOfflineUI();

  if (STATE.audio.currentGlobalAyahNum) {
    const wasPlaying = STATE.audio.isPlaying;
    loadAyahAudio(STATE.audio.currentGlobalAyahNum);
    if (wasPlaying) playAudio();
  }
});

document.getElementById('settings-qari-select').addEventListener('change', (e) => {
  playerQariSelect.value = e.target.value;
  playerQariSelect.dispatchEvent(new Event('change'));
});

// Sync Tafheem Selector
playerTafheemSelect.value = STATE.audio.tafheemMode;
playerTafheemSelect.addEventListener('change', (e) => {
  const allowedTafheems = ['0', 'auto', '3', '5', '10'];
  if (!allowedTafheems.includes(e.target.value)) return;

  STATE.audio.tafheemMode = e.target.value;
  localStorage.setItem('quran_memorizer_tafheem', e.target.value);
  document.getElementById('settings-tafheem-select').value = e.target.value;
});

document.getElementById('settings-tafheem-select').addEventListener('change', (e) => {
  playerTafheemSelect.value = e.target.value;
  playerTafheemSelect.dispatchEvent(new Event('change'));
});

// Repeat Mode
globalRepeatBtn.addEventListener('click', () => {
  const modes = ['1', '3', '5', 'infinite'];
  let currentIdx = modes.indexOf(STATE.audio.repeatMode);
  currentIdx = (currentIdx + 1) % modes.length;
  setRepeatMode(modes[currentIdx]);
});

function setRepeatMode(mode) {
  STATE.audio.repeatMode = mode;
  globalRepeatBtn.className = `player-btn ${mode !== '1' ? 'active' : ''}`;
  
  const textMap = { '1': 'بدون تكرار', '3': 'تكرار 3 مرات', '5': 'تكرار 5 مرات', 'infinite': 'تكرار مستمر' };
  globalRepeatBtn.title = textMap[mode];
  
  document.getElementById('settings-repeat-count').value = mode;
}

document.getElementById('settings-repeat-count').addEventListener('change', (e) => {
  setRepeatMode(e.target.value);
});

function playSingleAyah(surahNum, ayahNum) {
  STATE.audio.isPlayAllSurah = false;
  STATE.audio.playlist = [{ surahNum, ayahNum }];
  STATE.audio.playlistIndex = 0;
  
  playFromPlaylist();
}

document.getElementById('play-all-surah-btn').addEventListener('click', () => {
  if (!STATE.currentSurah) return;
  
  STATE.audio.isPlayAllSurah = true;
  STATE.audio.playlist = STATE.currentSurah.ayahs.map(ayah => ({
    surahNum: STATE.currentSurah.number,
    ayahNum: ayah.numberInSurah
  }));
  
  STATE.audio.playlistIndex = 0;
  playFromPlaylist();
});

function playAyahDirectly(globalNum, labelTitle, labelSubtitle) {
  if (STATE.audio.tafheemTimer) {
    clearTimeout(STATE.audio.tafheemTimer);
    STATE.audio.tafheemTimer = null;
  }

  STATE.audio.isPlayAllSurah = false;
  STATE.audio.playlist = [];
  STATE.audio.playlistIndex = 0;
  
  STATE.audio.currentSurahNum = null;
  STATE.audio.currentAyahNum = null;
  STATE.audio.currentGlobalAyahNum = globalNum;
  
  document.getElementById('player-surah-name').textContent = labelTitle;
  document.getElementById('player-ayah-num').textContent = labelSubtitle;
  document.getElementById('player-status-indicator').textContent = "🔊";
  
  loadAyahAudio(globalNum);
  playAudio();
}

async function playFromPlaylist() {
  if (STATE.audio.tafheemTimer) {
    clearTimeout(STATE.audio.tafheemTimer);
    STATE.audio.tafheemTimer = null;
  }

  const index = STATE.audio.playlistIndex;
  if (index < 0 || index >= STATE.audio.playlist.length) {
    stopAudio();
    return;
  }

  const { surahNum, ayahNum } = STATE.audio.playlist[index];
  
  STATE.audio.currentSurahNum = surahNum;
  STATE.audio.currentAyahNum = ayahNum;
  
  let globalNum = 1;
  if (STATE.currentSurah && STATE.currentSurah.number === surahNum) {
    const ayah = STATE.currentSurah.ayahs.find(a => a.numberInSurah === ayahNum);
    globalNum = ayah ? ayah.number : 1;
  }
  
  STATE.audio.currentGlobalAyahNum = globalNum;
  
  let reps = 0;
  if (STATE.audio.repeatMode === '3') reps = 2;
  else if (STATE.audio.repeatMode === '5') reps = 4;
  else if (STATE.audio.repeatMode === 'infinite') reps = Infinity;
  
  STATE.audio.currentRepeatCount = reps;

  document.querySelectorAll('.ayah-card, .ayah-span').forEach(c => c.classList.remove('active'));
  const card = document.getElementById(`ayah-card-${ayahNum}`);
  if (card) {
    card.classList.add('active');
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  const span = document.getElementById(`ayah-span-${ayahNum}`);
  if (span) {
    span.classList.add('active');
    span.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    renderPageAyahDetails(surahNum, ayahNum);
  }

  const surahMeta = QURAN_COMPLETE_DATA.find(s => s.number === surahNum);
  
  document.getElementById('player-surah-name').textContent = surahMeta ? surahMeta.name : `سورة ${surahNum}`;
  document.getElementById('player-ayah-num').textContent = `الآية: ${ayahNum}`;
  document.getElementById('player-status-indicator').textContent = "🔊";

  await loadAyahAudio(globalNum);
  playAudio();
}

async function loadAyahAudio(globalNum) {
  const qari = STATE.audio.selectedQari;
  const url = `https://cdn.islamic.network/quran/audio/128/${qari}/${globalNum}.mp3`;
  const badge = document.getElementById('player-offline-badge');

  try {
    const cache = await caches.open(AUDIO_CACHE_NAME);
    const match = await cache.match(url);
    
    if (match) {
      const blob = await match.blob();
      const localUrl = URL.createObjectURL(blob);
      audioPlayer.src = localUrl;
      
      badge.textContent = "أوفلاين ⚡";
      badge.style.background = "var(--color-emerald-light)";
      badge.style.color = "var(--color-emerald)";
    } else {
      audioPlayer.src = url;
      badge.textContent = "متصل 🌐";
      badge.style.background = "var(--bg-tertiary)";
      badge.style.color = "var(--text-muted)";
    }
  } catch (err) {
    audioPlayer.src = url;
    badge.textContent = "متصل 🌐";
  }
}

function playAudio() {
  audioPlayer.play()
    .then(() => {
      STATE.audio.isPlaying = true;
      globalPlayIcon.innerHTML = `<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>`;
      document.getElementById('player-status-indicator').style.animation = "pulse 1.5s infinite";
      
      STATE.progress.totalMinutesListened += 0.05;
      saveProgressToStorage();
    })
    .catch(err => {
      console.error("Audio playback error:", err);
    });
}

function pauseAudio() {
  audioPlayer.pause();
  STATE.audio.isPlaying = false;
  globalPlayIcon.innerHTML = `<path d="M8 5v14l11-7z"/>`;
  document.getElementById('player-status-indicator').style.animation = "none";
}

function stopAudio() {
  if (STATE.audio.tafheemTimer) {
    clearTimeout(STATE.audio.tafheemTimer);
    STATE.audio.tafheemTimer = null;
  }

  pauseAudio();
  STATE.audio.currentSurahNum = null;
  STATE.audio.currentAyahNum = null;
  STATE.audio.currentGlobalAyahNum = null;
  
  document.querySelectorAll('.ayah-card').forEach(c => c.classList.remove('active'));
  document.getElementById('player-surah-name').textContent = "اختر سورة للبدء";
  document.getElementById('player-ayah-num').textContent = "الآية: --";
  document.getElementById('player-status-indicator').textContent = "📖";
  document.getElementById('player-status-indicator').style.animation = "none";
}

globalPlayBtn.addEventListener('click', () => {
  if (STATE.audio.currentGlobalAyahNum === null) return;
  
  if (STATE.audio.tafheemTimer) {
    clearTimeout(STATE.audio.tafheemTimer);
    STATE.audio.tafheemTimer = null;
    playAudio();
    return;
  }

  if (STATE.audio.isPlaying) pauseAudio();
  else playAudio();
});

globalNextBtn.addEventListener('click', () => {
  if (STATE.audio.playlist.length > 0) {
    STATE.audio.playlistIndex++;
    if (STATE.audio.playlistIndex >= STATE.audio.playlist.length) {
      STATE.audio.playlistIndex = 0;
    }
    playFromPlaylist();
  }
});

globalPrevBtn.addEventListener('click', () => {
  if (STATE.audio.playlist.length > 0) {
    STATE.audio.playlistIndex--;
    if (STATE.audio.playlistIndex < 0) {
      STATE.audio.playlistIndex = STATE.audio.playlist.length - 1;
    }
    playFromPlaylist();
  }
});

audioPlayer.addEventListener('ended', () => {
  if (STATE.audio.currentRepeatCount > 0) {
    STATE.audio.currentRepeatCount--;
    audioPlayer.currentTime = 0;
    playAudio();
  } else {
    const tafMode = STATE.audio.tafheemMode;
    
    if (tafMode !== '0') {
      let pauseDuration = 3000;
      if (tafMode === 'auto') {
        pauseDuration = (audioPlayer.duration || 4) * 1000;
      } else {
        pauseDuration = parseInt(tafMode) * 1000;
      }

      document.getElementById('player-status-indicator').textContent = "⏳";
      document.getElementById('player-status-indicator').style.animation = "pulse 1s infinite";
      document.getElementById('player-ayah-num').textContent = "ردد خلف الشيخ الآن... 🗣️";

      const card = document.getElementById(`ayah-card-${STATE.audio.currentAyahNum}`);
      if (card) {
        card.style.borderColor = "var(--color-gold)";
        card.style.boxShadow = "0 0 15px var(--color-gold-glow)";
      }

      STATE.audio.tafheemTimer = setTimeout(() => {
        STATE.audio.tafheemTimer = null;
        
        if (card) {
          card.style.borderColor = "";
          card.style.boxShadow = "";
        }

        advancePlaylist();
      }, pauseDuration);

    } else {
      advancePlaylist();
    }
  }
});

function advancePlaylist() {
  if (STATE.audio.isPlayAllSurah) {
    STATE.audio.playlistIndex++;
    if (STATE.audio.playlistIndex < STATE.audio.playlist.length) {
      playFromPlaylist();
    } else {
      stopAudio();
    }
  } else {
    stopAudio();
  }
}

audioPlayer.addEventListener('timeupdate', () => {
  if (!audioPlayer.duration) return;
  const pct = (audioPlayer.currentTime / audioPlayer.duration) * 100;
  progressBar.style.width = `${pct}%`;
  timeDisplayCurrent.textContent = formatTime(audioPlayer.currentTime);
  timeDisplayTotal.textContent = formatTime(audioPlayer.duration);
});

progressTrack.addEventListener('click', (e) => {
  if (!audioPlayer.duration) return;
  const rect = progressTrack.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const pct = clickX / rect.width;
  audioPlayer.currentTime = pct * audioPlayer.duration;
});

function formatTime(secs) {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}


// ==========================================
// 9. MEMORIZATION PLANNER SYSTEM (SECURED TEXT)
// ==========================================
function initPlannerSetup() {
  const select = document.getElementById('plan-surah-select');
  select.innerHTML = '';
  
  QURAN_COMPLETE_DATA.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.number;
    opt.textContent = `${s.number}. ${s.name} (${s.numberOfAyahs} آية)`;
    select.appendChild(opt);
  });
  
  renderPlannerView();
}

function renderPlannerView() {
  const setupBox = document.getElementById('planner-setup-container');
  const activeBox = document.getElementById('active-plan-container');

  if (STATE.activePlan) {
    setupBox.classList.add('hidden');
    activeBox.classList.remove('hidden');
    renderActivePlan();
  } else {
    setupBox.classList.remove('hidden');
    activeBox.classList.add('hidden');
  }
}

document.getElementById('create-plan-btn').onclick = async () => {
  const surahNum = parseInt(document.getElementById('plan-surah-select').value);
  const dailyTarget = parseInt(document.getElementById('plan-daily-target').value);
  
  const surahMeta = QURAN_COMPLETE_DATA.find(s => s.number === surahNum);
  if (!surahMeta) return;

  const totalAyahs = surahMeta.numberOfAyahs;
  const totalDays = Math.ceil(totalAyahs / dailyTarget);

  const daysList = [];
  let currentStart = 1;
  for (let day = 1; day <= totalDays; day++) {
    const currentEnd = Math.min(currentStart + dailyTarget - 1, totalAyahs);
    const ayahsRange = [];
    for (let a = currentStart; a <= currentEnd; a++) {
      ayahsRange.push(a);
    }
    
    daysList.push({
      day: day,
      verses: ayahsRange,
      completed: false
    });
    
    currentStart = currentEnd + 1;
  }

  STATE.activePlan = {
    surahNum,
    dailyTarget,
    totalDays,
    startDate: new Date().toLocaleDateString('ar-EG'),
    days: daysList
  };

  savePlanToStorage();
  await loadSurah(surahNum);
  
  logActivity(`إنشاء خطة حفظ جديدة`, `سورة ${surahMeta.name}`, `${totalDays} يوم`);
  renderPlannerView();
};

function renderActivePlan() {
  const plan = STATE.activePlan;
  const surahMeta = QURAN_COMPLETE_DATA.find(s => s.number === plan.surahNum);
  if (!surahMeta) return;

  document.getElementById('active-plan-title').textContent = `خطة حفظ سورة ${surahMeta.name} 🗺️`;
  document.getElementById('active-plan-subtitle').textContent = `تم البدء في: ${plan.startDate}`;
  
  const labelMap = { 1: 'آية واحدة/يوم', 2: 'آيتين/يوم', 5: '5 آيات/يوم', 10: '10 آيات/يوم' };
  document.getElementById('active-plan-daily-rate').textContent = labelMap[plan.dailyTarget] || `${plan.dailyTarget} آية/يوم`;
  document.getElementById('active-plan-duration').textContent = `${plan.totalDays} يوم`;

  const completedDays = plan.days.filter(d => d.completed).length;
  const completionPct = ((completedDays / plan.totalDays) * 100).toFixed(0);
  document.getElementById('active-plan-progress-percent').textContent = `${completionPct}%`;
  document.getElementById('active-plan-days-completed').textContent = `${completedDays} من ${plan.totalDays}`;

  const checklist = document.getElementById('active-plan-checklist');
  checklist.innerHTML = '';

  plan.days.forEach(d => {
    const row = document.createElement('div');
    row.className = `plan-day-row ${d.completed ? 'completed' : ''}`;
    
    const rangeText = d.verses.length === 1 ? `الآية ${d.verses[0]}` : `الآيات ${d.verses[0]} - ${d.verses[d.verses.length - 1]}`;

    row.innerHTML = `
      <div class="day-checkbox-label">
        <div class="day-checkbox">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>
        <div>
          <div>اليوم ${d.day} 🌟</div>
          <div style="font-size: 0.85rem; color: var(--text-secondary)">${sanitizeInput(rangeText)}</div>
        </div>
      </div>
      <div class="day-verses">
        <button class="action-btn play-day-btn" style="padding: 6px 14px; font-size: 0.8rem; background: var(--bg-secondary);">استمع 🔊</button>
      </div>
    `;

    row.querySelector('.day-checkbox-label').onclick = () => {
      d.completed = !d.completed;
      savePlanToStorage();
      renderActivePlan();
      
      d.verses.forEach(ayahNum => {
        const key = `${plan.surahNum}_${ayahNum}`;
        if (d.completed) {
          STATE.progress.memorized[key] = 'memorized';
        } else {
          if (STATE.progress.memorized[key] === 'memorized') {
            delete STATE.progress.memorized[key];
          }
        }
      });
      saveProgressToStorage();
      renderDashboard();
      
      if (d.completed) {
        triggerKidCongratulation(`أحسنت يا بطل! أتممت بنجاح مهام اليوم ${d.day} من الخطة! واصل التقدم الرائع 🏆✨`);
      }

      if (completedDays === plan.totalDays - 1 && d.completed) {
        logActivity(`إتمام خطة حفظ سورة ${surahMeta.name}`, `تهانينا الحارة! 🎉🏆`, `إنجاز كبير`);
        triggerKidCongratulation(`مبارك للبطل العبقري! لقد أتممت خطة حفظ سورة ${surahMeta.name} كاملة بنجاح! 👑🎯🌟`);
      }
    };

    row.querySelector('.play-day-btn').onclick = async (e) => {
      e.stopPropagation();
      
      STATE.audio.isPlayAllSurah = true;
      STATE.audio.playlist = d.verses.map(v => ({
        surahNum: plan.surahNum,
        ayahNum: v
      }));
      STATE.audio.playlistIndex = 0;
      
      if (!STATE.currentSurah || STATE.currentSurah.number !== plan.surahNum) {
        await loadSurah(plan.surahNum);
      }
      playFromPlaylist();
    };

    checklist.appendChild(row);
  });
}

document.getElementById('delete-plan-btn').onclick = () => {
  if (confirm("هل أنت متأكد من إلغاء الخطة؟ لن يفقد البطل آياته التي تم حفظها بالفعل.")) {
    STATE.activePlan = null;
    savePlanToStorage();
    renderPlannerView();
  }
};


// ==========================================
// 10. INTERACTIVE PRACTICE & QUIZ SYSTEM (SECURE)
// ==========================================
const quizSelector = document.getElementById('quiz-modes-selector');
const quizContainer = document.getElementById('quiz-interface-container');

document.getElementById('exit-quiz-btn').onclick = () => {
  if (STATE.quiz.isRecording) {
    stopVoiceRecording();
  }
  quizContainer.classList.remove('active');
  quizSelector.classList.remove('hidden');
  STATE.quiz.mode = null;
};

document.querySelectorAll('.quiz-mode-card').forEach(card => {
  card.onclick = () => {
    const mode = card.getAttribute('data-mode');
    startQuiz(mode);
  };
});

let recognition = null;
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

// Pre-initialize Speech Synthesis voices to prevent async voice list loads in mobile browsers
if ('speechSynthesis' in window) {
  window.speechSynthesis.getVoices();
  window.speechSynthesis.onvoiceschanged = () => {
    window.speechSynthesis.getVoices();
  };
}

function normalizeArabic(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "") // remove all diacritics/tashkeel/Quran marks
    .replace(/\u0671/g, "ا") // Alif Wasla -> Alif
    .replace(/[أإآؤئءٱ]/g, "ا") // normalize all Hamzas to Alif
    .replace(/[ىٰ]/g, "ي") // normalize Yaa forms
    .replace(/ة/g, "ه") // normalize Taa Marbutah
    .replace(/الرحمان/g, "الرحمن")
    .replace(/السموات/g, "السماوات")
    .replace(/صلوة/g, "صلاه")
    .replace(/زكوة/g, "زكاه")
    .replace(/حيوة/g, "حياه")
    .replace(/[^\u0621-\u064A\s]/g, "") // remove punctuation and non-Arabic letters
    .replace(/\s+/g, " ")
    .trim();
}

function levenshteinDistance(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = b[i - 1] === a[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[b.length][a.length];
}

function phoneticNormalize(word) {
  if (!word) return '';
  return word
    .replace(/^ال/, '')
    .replace(/[حخعأإآؤئءٱ]/g, 'ه')
    .replace(/[قغ]/g, 'ك')
    .replace(/[طظضدذ]/g, 'ت')
    .replace(/[صثش]/g, 'س')
    .replace(/[اوي]/g, '')
    .replace(/ة/g, 'ه')
    .trim();
}

function areWordsSimilar(spoken, target) {
  if (!spoken || !target) return false;
  if (spoken === target) return true;
  
  // Strip definite article
  const s1 = spoken.replace(/^ال/, '');
  const t1 = target.replace(/^ال/, '');
  if (s1 === t1) return true;
  
  // Phonetic match
  const sPhonetic = phoneticNormalize(spoken);
  const tPhonetic = phoneticNormalize(target);
  if (sPhonetic === tPhonetic && sPhonetic.length > 0) return true;
  
  // Substring match
  if (s1.length > 2 && t1.length > 2) {
    if (s1.includes(t1) || t1.includes(s1)) return true;
  }
  
  // Levenshtein on raw normalized text — allow up to 40% edit distance
  const maxLen = Math.max(spoken.length, target.length);
  const dist = levenshteinDistance(spoken, target);
  if (maxLen > 0 && (dist / maxLen) <= 0.4) return true;
  
  // Levenshtein on stripped (no ال) text
  const distStripped = levenshteinDistance(s1, t1);
  const maxLenStripped = Math.max(s1.length, t1.length);
  if (maxLenStripped > 0 && (distStripped / maxLenStripped) <= 0.4) return true;
  
  // Levenshtein on phonetic
  if (sPhonetic.length > 0 && tPhonetic.length > 0) {
    const distPhonetic = levenshteinDistance(sPhonetic, tPhonetic);
    const maxLenPhonetic = Math.max(sPhonetic.length, tPhonetic.length);
    if ((distPhonetic / maxLenPhonetic) <= 0.5) return true;
  }
  
  // For very short words (1-2 chars) — exact or edit dist 1
  if (spoken.length <= 2 || target.length <= 2) {
    if (dist <= 1) return true;
  }
  
  return false;
}

function startQuiz(mode) {
  STATE.quiz.mode = mode;
  STATE.quiz.score = 0;
  STATE.quiz.questionCount = 0;
  
  quizSelector.classList.add('hidden');
  quizContainer.classList.add('active');
  
  document.getElementById('quiz-title-display').textContent = 
    mode === 'reveal' ? 'لعبة كشف الكلمات المخفية 🔍' : 
    mode === 'connect' ? 'تحدي ربط الآيات المتتالية 🧠' : 'تحدي التسميع الصوتي الذكي 🎙️';
  
  document.getElementById('quiz-score-display').textContent = `النقاط: ⭐ 0`;
  
  nextQuizQuestion();
}

async function nextQuizQuestion() {
  document.getElementById('quiz-next-question-btn').style.display = 'none';

  // Make sure we stop any active voice recording before starting next question
  if (STATE.quiz.isRecording) {
    stopVoiceRecording();
  }

  let surahNum = STATE.currentSurahNum || 1;
  
  if (!STATE.currentSurah || STATE.currentSurah.number !== surahNum) {
    await loadSurah(surahNum);
  }
  
  const surah = STATE.currentSurah;
  if (!surah || surah.ayahs.length === 0) return;

  document.getElementById('quiz-progress-text').textContent = `السورة النشطة: ${surah.name}`;

  // Hide all mode boxes by default
  document.getElementById('quiz-mode-reveal-box').classList.add('hidden');
  document.getElementById('quiz-mode-connect-box').classList.add('hidden');
  document.getElementById('quiz-mode-voice-box').classList.add('hidden');

  if (STATE.quiz.mode === 'reveal') {
    setupRevealQuestion(surah);
  } else if (STATE.quiz.mode === 'connect') {
    setupConnectQuestion(surah);
  } else if (STATE.quiz.mode === 'voice') {
    setupVoiceQuestion(surah);
  }
}

function setupVoiceQuestion(surah) {
  document.getElementById('quiz-mode-voice-box').classList.remove('hidden');

  const randIdx = Math.floor(Math.random() * surah.ayahs.length);
  const ayah = surah.ayahs[randIdx];
  STATE.quiz.currentAyah = ayah;

  // Split Ayah text into words
  const words = ayah.text.split(' ').filter(w => w.length > 0);
  
  // Decide how many words to show as the prompt
  // E.g. promptCount is at least 1, and at most words.length - 1
  const promptCount = Math.max(1, Math.min(words.length - 1, Math.ceil(words.length / 2)));
  const promptWords = words.slice(0, promptCount);
  const targetWords = words.slice(promptCount);

  STATE.quiz.promptWords = promptWords;
  STATE.quiz.targetWords = targetWords; // Words the child has to recite!

  document.getElementById('voice-question-ref').textContent = `سورة ${surah.name} - الآية ${ayah.numberInSurah}`;
  
  // Display the prompt text
  const promptDisplay = document.getElementById('voice-prompt-display');
  if (promptDisplay) {
    promptDisplay.textContent = `${promptWords.join(' ')} ...`;
  }
  
  // Title update
  const voiceTitle = document.getElementById('voice-quiz-title');
  if (voiceTitle) {
    voiceTitle.textContent = "اسمع البداية، وأكمل الآية الكريمة بصوتك يا بطل! 🎙️";
  }

  const liveTranscript = document.getElementById('voice-live-transcript');
  const compareResult = document.getElementById('voice-compare-result');
  const micBtn = document.getElementById('voice-mic-btn');
  const micStatus = document.getElementById('voice-mic-status');

  liveTranscript.textContent = "(سيبدأ ظهور كلماتك هنا بمجرد التحدث...)";
  liveTranscript.classList.remove('hidden');
  compareResult.classList.add('hidden');
  compareResult.innerHTML = '';
  micBtn.classList.remove('recording');
  micStatus.textContent = "اضغط على الميكروفون وابدأ القراءة 🎙️";
  micStatus.style.color = "var(--text-secondary)";

  STATE.quiz.isRecording = false;

  if (!SpeechRecognition) {
    micStatus.textContent = "⚠️ التسميع الصوتي غير مدعوم في متصفحك الحالي. يرجى استخدام Chrome أو Safari.";
    micStatus.style.color = "var(--color-danger)";
    micBtn.disabled = true;
    return;
  }

  micBtn.disabled = false;

  micBtn.onclick = () => {
    if (!STATE.quiz.isRecording) {
      startVoiceRecording();
    } else {
      stopVoiceRecording();
    }
  };

  document.getElementById('voice-retry-btn').onclick = () => {
    if (STATE.quiz.isRecording) {
      stopVoiceRecording();
    }
    setupVoiceQuestion(surah);
  };
}

function startVoiceRecording() {
  const micBtn = document.getElementById('voice-mic-btn');
  const micStatus = document.getElementById('voice-mic-status');
  const liveTranscript = document.getElementById('voice-live-transcript');
  const compareResult = document.getElementById('voice-compare-result');

  try {
    recognition = new SpeechRecognition();
    recognition.lang = 'ar-SA';
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.continuous = false; // Auto-stop on pause/silence for instant feedback

    recognition.onstart = () => {
      STATE.quiz.isRecording = true;
      micBtn.classList.add('recording');
      micStatus.textContent = "جاري الاستماع... اقرأ الآن بصوت مسموع 🎙️";
      micStatus.style.color = "var(--color-emerald)";
      liveTranscript.textContent = "...";
      compareResult.classList.add('hidden');
    };

    recognition.onresult = (event) => {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        finalTranscript += event.results[i][0].transcript;
      }
      if (finalTranscript) {
        liveTranscript.textContent = finalTranscript;
      }
      
      // If the result is final, stop and compare instantly!
      if (event.results[event.results.length - 1].isFinal) {
        stopVoiceRecording();
      }
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error:", event.error);
      if (event.error === 'not-allowed') {
        micStatus.textContent = "⚠️ يرجى السماح للتطبيق باستخدام الميكروفون من الإعدادات.";
        micStatus.style.color = "var(--color-danger)";
      }
      stopVoiceRecording();
    };

    recognition.onend = () => {
      if (STATE.quiz.isRecording) {
        stopVoiceRecording();
      }
    };

    recognition.start();

  } catch (e) {
    console.error("Speech starting failed:", e);
    micStatus.textContent = "⚠️ فشل بدء التسجيل الصوتي.";
    micStatus.style.color = "var(--color-danger)";
    micBtn.classList.remove('recording');
    STATE.quiz.isRecording = false;
  }
}

function stopVoiceRecording() {
  if (!STATE.quiz.isRecording) return;
  STATE.quiz.isRecording = false;
  
  const micBtn = document.getElementById('voice-mic-btn');
  const micStatus = document.getElementById('voice-mic-status');
  
  micBtn.classList.remove('recording');
  micStatus.textContent = "تم الانتهاء! جاري تحليل التلاوة... ⏳";
  micStatus.style.color = "var(--color-gold)";

  if (recognition) {
    try {
      recognition.stop();
    } catch(e){}
  }

  // Compare immediately for instant response!
  compareRecitation();
}

function compareRecitation() {
  const liveTranscript = document.getElementById('voice-live-transcript');
  const compareResult = document.getElementById('voice-compare-result');
  const micStatus = document.getElementById('voice-mic-status');
  const nextBtn = document.getElementById('quiz-next-question-btn');

  const spokenText = liveTranscript.textContent || '';
  const promptWords = STATE.quiz.promptWords || [];
  const targetWordsRaw = STATE.quiz.targetWords || [];
  
  const normSpoken = normalizeArabic(spokenText);
  const spokenWords = normSpoken.split(' ').filter(w => w.length > 0);
  
  compareResult.innerHTML = '';
  compareResult.classList.remove('hidden');
  liveTranscript.classList.add('hidden');

  // 1. Render prompt words in a neutral grey/gold style so the child sees the complete verse context
  promptWords.forEach(w => {
    const span = document.createElement('span');
    span.className = 'word-span';
    span.style.opacity = '0.65';
    span.style.background = 'rgba(255, 255, 255, 0.05)';
    span.style.border = '1px dashed var(--glass-border)';
    span.textContent = w;
    compareResult.appendChild(span);
  });

  // 2. Render and grade the target words
  let correctCount = 0;
  
  targetWordsRaw.forEach((rawWord, i) => {
    const normTargetWord = normalizeArabic(rawWord);
    let isCorrect = false;
    
    // Aligned matching sliding window on the spoken words
    const searchRange = [i, i - 1, i + 1, i + 2];
    for (const idx of searchRange) {
      if (idx >= 0 && idx < spokenWords.length) {
        if (normalizeArabic(spokenWords[idx]) === normTargetWord) {
          isCorrect = true;
          break;
        }
      }
    }

    const span = document.createElement('span');
    span.className = `word-span ${isCorrect ? 'correct' : 'incorrect'}`;
    span.textContent = rawWord;

    if (isCorrect) {
      correctCount++;
    } else {
      const correction = document.createElement('span');
      correction.className = 'word-correction';
      correction.textContent = rawWord;
      span.appendChild(correction);
      
      span.style.textDecoration = 'line-through';
      span.style.textDecorationColor = '#ef4444';
    }

    compareResult.appendChild(span);
  });

  const accuracy = targetWordsRaw.length > 0 ? Math.round((correctCount / targetWordsRaw.length) * 100) : 0;
  
  if (accuracy >= 80) {
    STATE.quiz.score += 100;
    document.getElementById('quiz-score-display').textContent = `النقاط: ⭐ ${STATE.quiz.score}`;
    micStatus.textContent = `أحسنت يا بطل! أكملت الآية بنجاح بنسبة ${accuracy}% 😇 (+100 نقطة ⭐)`;
    micStatus.style.color = "var(--color-emerald)";
    triggerKidCongratulation(`رائع جداً! لقد أكملت الآية الكريمة بشكل صحيح وبدقة عالية ${accuracy}%! بارك الله فيك يا بطل الحفظ 🌟🏆👑`);
  } else if (accuracy >= 50) {
    STATE.quiz.score += 40;
    document.getElementById('quiz-score-display').textContent = `النقاط: ⭐ ${STATE.quiz.score}`;
    micStatus.textContent = `حفظ جيد! تلاوة صحيحة بنسبة ${accuracy}% 📖 (+40 نقطة ⭐)`;
    micStatus.style.color = "var(--color-gold)";
    triggerKidCongratulation(`قراءة جيدة بنسبة دقة ${accuracy}%، يرجى التركيز على الكلمات الحمراء وتكرارها لتثبيتها! واصل المحاولة 👍✨`);
  } else {
    micStatus.textContent = `دقة التسميع ${accuracy}%: انظر للتصحيح باللون الأحمر 📖`;
    micStatus.style.color = "var(--color-danger)";
  }

  nextBtn.style.display = 'inline-block';
}

function setupRevealQuestion(surah) {
  document.getElementById('quiz-mode-reveal-box').classList.remove('hidden');
  document.getElementById('quiz-mode-connect-box').classList.add('hidden');

  const randIdx = Math.floor(Math.random() * surah.ayahs.length);
  const ayah = surah.ayahs[randIdx];
  STATE.quiz.currentAyah = ayah;

  const words = ayah.text.split(' ');
  STATE.quiz.words = words;
  STATE.quiz.revealIndex = 0;

  const container = document.getElementById('reveal-words-container');
  container.innerHTML = '';

  words.forEach((w, i) => {
    const span = document.createElement('span');
    span.className = 'reveal-word hidden-word';
    span.textContent = w;
    span.id = `reveal-word-${i}`;
    
    span.onclick = () => {
      if (i === STATE.quiz.revealIndex) {
        revealWord(i);
      }
    };
    
    container.appendChild(span);
  });

  document.getElementById('reveal-next-btn').onclick = () => {
    if (STATE.quiz.revealIndex < words.length) {
      revealWord(STATE.quiz.revealIndex);
    }
  };

  document.getElementById('reveal-restart-btn').onclick = () => {
    STATE.quiz.revealIndex = 0;
    document.querySelectorAll('.reveal-word').forEach(w => {
      w.classList.add('hidden-word');
    });
    document.getElementById('quiz-next-question-btn').style.display = 'none';
  };
}

function revealWord(index) {
  const wordEl = document.getElementById(`reveal-word-${index}`);
  if (wordEl) {
    wordEl.classList.remove('hidden-word');
    STATE.quiz.revealIndex++;
    
    STATE.quiz.score += 5;
    document.getElementById('quiz-score-display').textContent = `النقاط: ⭐ ${STATE.quiz.score}`;

    if (STATE.quiz.revealIndex >= STATE.quiz.words.length) {
      document.getElementById('quiz-next-question-btn').style.display = 'inline-block';
      STATE.quiz.score += 20;
      document.getElementById('quiz-score-display').textContent = `النقاط: ⭐ ${STATE.quiz.score}`;
      
      triggerKidCongratulation(`عمل رائع! لقد كشفت جميع كلمات الآية وقرأتها بشكل ممتاز! (+20 نقطة مكافأة 🌟)`);
    }
  }
}

function setupConnectQuestion(surah) {
  document.getElementById('quiz-mode-reveal-box').classList.add('hidden');
  document.getElementById('quiz-mode-connect-box').classList.remove('hidden');

  const limit = Math.max(1, surah.ayahs.length - 1);
  const randIdx = Math.floor(Math.random() * limit);
  const questionAyah = surah.ayahs[randIdx];
  const correctAyah = surah.ayahs[randIdx + 1];

  document.getElementById('connect-question-ayah').textContent = `« ${questionAyah.text} »`;
  document.getElementById('connect-question-ref').textContent = `سورة ${surah.name} - آية ${questionAyah.numberInSurah}`;

  const options = [correctAyah];
  
  while (options.length < 3) {
    const optIdx = Math.floor(Math.random() * surah.ayahs.length);
    const optAyah = surah.ayahs[optIdx];
    
    if (!options.some(o => o.number === optAyah.number)) {
      options.push(optAyah);
    }
  }

  options.sort(() => Math.random() - 0.5);

  const container = document.getElementById('connect-options-container');
  container.innerHTML = '';

  options.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'quiz-option-btn';
    btn.textContent = opt.text;
    
    btn.onclick = () => {
      document.querySelectorAll('.quiz-option-btn').forEach(b => {
        b.disabled = true;
        if (b.textContent === correctAyah.text) {
          b.classList.add('correct');
        }
      });

      if (opt.number === correctAyah.number) {
        btn.classList.add('correct');
        STATE.quiz.score += 50;
        document.getElementById('quiz-score-display').textContent = `النقاط: ⭐ ${STATE.quiz.score}`;
        triggerKidCongratulation(`إجابة صحيحة عبقرية! آية ممتازة وتوصيل متقن (+50 نقطة ⭐)`);
      } else {
        btn.classList.add('wrong');
      }

      document.getElementById('quiz-next-question-btn').style.display = 'inline-block';
    };

    container.appendChild(btn);
  });
}

document.getElementById('quiz-next-question-btn').onclick = () => {
  nextQuizQuestion();
};


// ==========================================
// 11. SETTINGS VIEW LOGIC
// ==========================================
document.getElementById('settings-clear-downloads-btn').onclick = async () => {
  if (confirm("🚨 هل تريد مسح جميع الصوتيات والتلاوات المخزنة أوفلاين لتوفير مساحة على جهازك؟")) {
    try {
      const keys = await caches.keys();
      for (const key of keys) {
        await caches.delete(key);
      }
      alert("تم حذف الملفات الصوتية بنجاح من جهازك.");
      updateSurahOfflineUI();
    } catch (e) {
      alert("فشل مسح المساحة.");
    }
  }
};

document.getElementById('settings-clear-progress-btn').onclick = () => {
  if (confirm("🚨 هل أنت متأكد تماماً من حذف سجل الحفظ والتقدم ونقاط الألعاب؟ لا يمكن التراجع عن هذا الإجراء.")) {
    STATE.progress.memorized = {};
    STATE.progress.streak = 0;
    STATE.progress.lastActiveDate = null;
    STATE.progress.totalMinutesListened = 0;
    STATE.progress.activities = [];
    saveProgressToStorage();
    
    STATE.activePlan = null;
    savePlanToStorage();
    
    alert("تم تصفير البيانات بنجاح.");
    window.location.reload();
  }
};


// ==========================================
// 12. SPA NAVIGATION & ROUTER
// ==========================================
function setupNavigation() {
  document.querySelectorAll('.nav-menu .nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      
      const targetView = item.getAttribute('data-view');
      
      document.querySelectorAll('.nav-menu .nav-item').forEach(n => n.classList.remove('active'));
      item.classList.add('active');

      document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
      document.getElementById(`view-${targetView}`).classList.add('active');

      if (targetView === 'dashboard') {
        renderDashboard();
      } else if (targetView === 'planner') {
        initPlannerSetup();
      } else if (targetView === 'reader') {
        updateSurahOfflineUI();
      }
    });
  });
}


// ==========================================
// 12. INTERACTIVE BLIND MEMORIZATION MODE LOGIC
// ==========================================
function pronounceWord(word) {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    
    // Clean text from any punctuation before speaking
    const cleanWord = word.replace(/[^\u0621-\u064A\u064B-\u065F\u0670]/g, "").trim();
    if (!cleanWord) return;
    
    const utterance = new SpeechSynthesisUtterance(cleanWord);
    utterance.lang = 'ar-SA';
    
    const voices = window.speechSynthesis.getVoices();
    const arVoice = voices.find(v => v.lang.startsWith('ar') || v.lang.includes('ar'));
    if (arVoice) {
      utterance.voice = arVoice;
    }
    utterance.rate = 0.7; // Calm educational speed
    window.speechSynthesis.speak(utterance);
  }
}

function renderAyahTextWithWords(ayah, parentElement) {
  parentElement.innerHTML = '';
  const text = ayah.displayTxt || ayah.text;
  const words = text.split(' ').filter(w => w.length > 0);
  words.forEach((w, wordIndex) => {
    const wordSpan = document.createElement('span');
    wordSpan.className = 'quran-word hidden-word';
    wordSpan.id = `qword-${ayah.numberInSurah}-${wordIndex}`;
    wordSpan.textContent = w;
    
    // Check if this word is already revealed and preserve its reveal type styles
    const targetWord = STATE.memorizeMode ? STATE.memorizeWords.find(mw => mw.id === wordSpan.id) : null;
    if (targetWord && targetWord.revealed) {
      wordSpan.classList.remove('hidden-word');
      if (targetWord.revealType === 'skipped') {
        wordSpan.style.color = '#ef4444';
        wordSpan.style.background = 'rgba(239, 68, 68, 0.12)';
        wordSpan.style.textShadow = 'none';
        wordSpan.style.borderBottom = 'none';
        
        // Add floating correction above it
        const corr = document.createElement('span');
        corr.className = 'word-correction';
        corr.textContent = targetWord.word;
        wordSpan.appendChild(corr);
      } else if (targetWord.revealType === 'prompted') {
        wordSpan.style.color = 'var(--color-gold)';
        wordSpan.style.background = 'rgba(217, 119, 6, 0.1)';
        wordSpan.style.textShadow = 'none';
        wordSpan.style.borderBottom = 'none';
      } else {
        wordSpan.classList.add('revealed-word');
      }
    }
    
    wordSpan.onclick = (e) => {
      if (STATE.memorizeMode && wordSpan.classList.contains('hidden-word')) {
        e.stopPropagation();
        
        // 1. Play the Sheikh's voice for this Ayah (instead of robotic browser TTS)
        if (STATE.currentSurah) {
          playSingleAyah(STATE.currentSurah.number, ayah.numberInSurah);
        } else {
          pronounceWord(wordSpan.textContent);
        }
        
        // 2. Point out the mistake visually (flashing red)
        wordSpan.classList.remove('hidden-word');
        wordSpan.style.color = '#ef4444';
        wordSpan.style.background = 'rgba(239, 68, 68, 0.15)';
        wordSpan.style.textShadow = 'none';
        wordSpan.style.borderBottom = 'none';
        
        // 3. Mark it as revealed in State and advance pointer
        const wIdx = STATE.memorizeWords.findIndex(mw => mw.id === wordSpan.id);
        if (wIdx !== -1) {
          STATE.memorizeWords[wIdx].revealed = true;
          STATE.memorizeWords[wIdx].revealType = 'prompted'; // Save the type!
          STATE.memorizePointer = wIdx + 1;
        }
        
        // 4. Fade to prompted gold after 2000ms
        setTimeout(() => {
          wordSpan.style.color = 'var(--color-gold)';
          wordSpan.style.background = 'rgba(217, 119, 6, 0.1)';
        }, 2000);
      }
    };
    
    parentElement.appendChild(wordSpan);
    parentElement.appendChild(document.createTextNode(' '));
  });
}

function initMemorizeWordsForSurah() {
  const surah = STATE.currentSurah;
  if (!surah) return;
  STATE.memorizeWords = [];
  STATE.memorizePointer = 0;
  STATE.memorizeSessionStartPointer = 0;
  
  surah.ayahs.forEach(ayah => {
    const text = ayah.displayTxt || ayah.text;
    const words = text.split(' ').filter(w => w.length > 0);
    words.forEach((w, wordIndex) => {
      STATE.memorizeWords.push({
        id: `qword-${ayah.numberInSurah}-${wordIndex}`,
        word: w,
        normalized: normalizeArabic(w),
        ayahNum: ayah.numberInSurah,
        revealed: false
      });
    });
  });
}

let memorizeRecognition = null;

function showMemorizeMobileGuide() {
  const message = `
    <div style="text-align: right; line-height: 1.8; font-size: 0.95rem; color: var(--text-primary);">
      <p>لتشغيل ميزة <strong>التسميع الصوتي الغيبي</strong> على الهواتف الذكية بنجاح، يرجى اتباع التعليمات التالية:</p>
      
      <h4 style="color: var(--color-gold); margin-top: 14px; margin-bottom: 6px;">🍎 هواتف الآيفون (iOS):</h4>
      <ul style="padding-right: 20px; margin-bottom: 12px; list-style-type: disc;">
        <li>يجب فتح الموقع باستخدام متصفح <strong>Safari الرسمي</strong> فقط.</li>
        <li>متصفحات الكروم والفايرفوكس على الآيفون لا تدعم التعرف على الصوت بسبب قيود نظام iOS.</li>
        <li>تأكد من تفعيل <strong>Siri</strong> في إعدادات الهاتف (تتطلبها خدمة التعرف على الصوت من آبل).</li>
      </ul>
      
      <h4 style="color: var(--color-gold); margin-top: 14px; margin-bottom: 6px;">🤖 هواتف الأندرويد (Android):</h4>
      <ul style="padding-right: 20px; margin-bottom: 12px; list-style-type: disc;">
        <li>يجب فتح الموقع باستخدام متصفح <strong>Google Chrome</strong> أو متصفح الهاتف الرسمي.</li>
      </ul>
      
      <h4 style="color: var(--color-gold); margin-top: 14px; margin-bottom: 6px;">🔒 شروط عامة هامة:</h4>
      <ul style="padding-right: 20px; margin-bottom: 12px; list-style-type: disc;">
        <li><strong>رابط آمن:</strong> يجب فتح الموقع باستخدام رابط يبدأ بـ <strong>https://</strong> (وليس http) ليسمح الهاتف للمتصفح بالوصول للميكروفون.</li>
        <li><strong>صلاحية الميكروفون:</strong> عند النقر على "ابدأ التسميع"، وافق فوراً على إذن استخدام الميكروفون الذي يطلبه المتصفح.</li>
        <li><strong>التطبيقات الخارجية:</strong> لا تفتح الرابط مباشرة من داخل الواتساب أو تيليجرام. انسخ الرابط وافتحه في متصفح الهاتف الخارجي (سافاري أو كروم).</li>
      </ul>
    </div>
  `;

  const alertOverlay = document.createElement('div');
  alertOverlay.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
    background: rgba(11, 17, 30, 0.9); display: flex; align-items: center; justify-content: center;
    z-index: 10000; animation: fadeIn 0.3s; direction: rtl;
  `;
  
  const contentBox = document.createElement('div');
  contentBox.style.cssText = `
    background: var(--bg-secondary); border: 2px solid var(--color-gold);
    border-radius: 24px; padding: 28px; max-width: 480px; width: 90%;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6); animation: scaleUp 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    overflow-y: auto; max-height: 90vh;
  `;
  
  contentBox.innerHTML = `
    <div style="font-size: 2.5rem; margin-bottom: 12px; text-align: center;">📱ℹ️</div>
    <h3 style="font-size: 1.3rem; color: var(--color-gold); margin-bottom: 16px; text-align: center;">دليل تشغيل التسميع على الهواتف</h3>
    <div style="margin-bottom: 24px;">${message}</div>
    <button class="submit-btn" style="width: auto; padding: 10px 30px; margin: 0 auto; display: block; background: var(--color-gold); color: black;" id="guide-ok-btn">حسناً، فهمت 👍</button>
  `;
  
  alertOverlay.appendChild(contentBox);
  document.body.appendChild(alertOverlay);
  
  document.getElementById('guide-ok-btn').onclick = () => {
    alertOverlay.style.animation = 'fadeOut 0.2s';
    contentBox.style.animation = 'scaleDown 0.2s';
    setTimeout(() => {
      alertOverlay.remove();
    }, 200);
  };
}

function setupMemorizeModeToggle() {
  const toggleBtn = document.getElementById('toggle-memorize-btn');
  const micBtn = document.getElementById('memorize-mic-btn');
  const helpBtn = document.getElementById('memorize-help-btn');
  const container = document.getElementById('verses-display-container');

  if (!toggleBtn || !micBtn || !container) return;

  toggleBtn.onclick = () => {
    STATE.memorizeMode = !STATE.memorizeMode;
    toggleBtn.classList.toggle('active', STATE.memorizeMode);
    toggleBtn.querySelector('span').textContent = STATE.memorizeMode ? 'قراءة عادية 👁️' : 'تسميع غيبي 🎙️';
    
    micBtn.classList.toggle('hidden', !STATE.memorizeMode);
    if (helpBtn) helpBtn.classList.toggle('hidden', !STATE.memorizeMode);
    container.classList.toggle('memorize-active', STATE.memorizeMode);
    
    if (STATE.memorizeMode) {
      initMemorizeWordsForSurah();
      renderVerses();
      
      micBtn.querySelector('span').textContent = 'ابدأ التسميع 🎙️';
      micBtn.style.background = 'linear-gradient(135deg, var(--color-emerald), #059669)';
      
      triggerKidCongratulation("تم تفعيل وضع التسميع الغيبي بالصوت! انطق الكلمات لتكشفها على المصحف 🌟🎙️");
    } else {
      stopMemorizeSpeech();
      renderVerses();
    }
  };

  micBtn.onclick = () => {
    if (!STATE.memorizeRecording) {
      startMemorizeSpeech();
    } else {
      stopMemorizeSpeech();
    }
  };

  if (helpBtn) {
    helpBtn.onclick = () => {
      showMemorizeMobileGuide();
    };
  }
}

function startMemorizeSpeech() {
  if (!SpeechRecognition) {
    alert("التسميع الصوتي غير مدعوم في متصفحك الحالي.");
    return;
  }
  
  const micBtn = document.getElementById('memorize-mic-btn');
  if (!micBtn) return;

  try {
    memorizeRecognition = new SpeechRecognition();
    memorizeRecognition.lang = 'ar-SA';
    memorizeRecognition.interimResults = true;
    memorizeRecognition.maxAlternatives = 1;
    memorizeRecognition.continuous = true; // Stay listening for continuous recitation

    memorizeRecognition.onstart = () => {
      STATE.memorizeRecording = true;
      STATE.memorizeSessionStartPointer = STATE.memorizePointer;
      micBtn.classList.add('recording');
      micBtn.querySelector('span').textContent = 'جاري الاستماع... 🎙️';
      micBtn.style.background = 'linear-gradient(135deg, var(--color-danger), #dc2626)';
    };

    memorizeRecognition.onresult = (event) => {
      let spokenWordsCombined = '';
      for (let i = 0; i < event.results.length; ++i) {
        spokenWordsCombined += event.results[i][0].transcript + ' ';
      }
      
      if (spokenWordsCombined.trim().length > 0) {
        processMemorizeSpokenText(spokenWordsCombined);
      }
    };

    memorizeRecognition.onerror = (event) => {
      console.error("Memorize Speech recognition error:", event.error);
      if (event.error === 'not-allowed') {
        alert("يرجى تفعيل صلاحية الميكروفون للمتصفح لتتمكن من التسميع.");
      }
      stopMemorizeSpeech();
    };

    memorizeRecognition.onend = () => {
      if (STATE.memorizeRecording) {
        setTimeout(() => {
          try {
            if (STATE.memorizeRecording && memorizeRecognition) {
              memorizeRecognition.start();
            }
          } catch(e){}
        }, 400);
      }
    };

    memorizeRecognition.start();

  } catch (e) {
    console.error("Failed to start Speech recognition:", e);
    stopMemorizeSpeech();
  }
}

function stopMemorizeSpeech() {
  STATE.memorizeRecording = false;
  const micBtn = document.getElementById('memorize-mic-btn');
  if (micBtn) {
    micBtn.classList.remove('recording');
    micBtn.querySelector('span').textContent = 'ابدأ التسميع 🎙️';
    micBtn.style.background = 'linear-gradient(135deg, var(--color-emerald), #059669)';
  }

  if (memorizeRecognition) {
    try {
      memorizeRecognition.stop();
    } catch(e){}
    memorizeRecognition = null;
  }
}

function alignSpokenWithTarget(spokenWords, targetWords) {
  const n = spokenWords.length;
  const m = targetWords.length;
  
  const dp = Array(n + 1).fill(null).map(() => Array(m + 1).fill(0));
  const parent = Array(n + 1).fill(null).map(() => Array(m + 1).fill(null));

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const isMatch = (j <= i + 2) && areWordsSimilar(spokenWords[i - 1], targetWords[j - 1].normalized);
      const matchScore = isMatch ? 12 : -4;
      
      const scoreDiag = dp[i - 1][j - 1] + matchScore;
      const scoreLeft = dp[i][j - 1] - 2; // Gap in spoken (skipped word)
      const scoreUp = dp[i - 1][j] - 1;   // Gap in target (extra word spoken)
      
      const maxScore = Math.max(scoreDiag, scoreLeft, scoreUp);
      dp[i][j] = maxScore;
      
      if (maxScore === scoreDiag) {
        parent[i][j] = 'diag';
      } else if (maxScore === scoreLeft) {
        parent[i][j] = 'left';
      } else {
        parent[i][j] = 'up';
      }
    }
  }
  
  let i = n, j = m;
  const alignment = [];
  
  while (i > 0 && j > 0) {
    const dir = parent[i][j];
    if (dir === 'diag') {
      const isMatch = areWordsSimilar(spokenWords[i - 1], targetWords[j - 1].normalized);
      alignment.push({ spokenIdx: i - 1, targetIdx: j - 1, isMatch });
      i--;
      j--;
    } else if (dir === 'left') {
      alignment.push({ spokenIdx: null, targetIdx: j - 1, isMatch: false });
      j--;
    } else {
      alignment.push({ spokenIdx: i - 1, targetIdx: null, isMatch: false });
      i--;
    }
  }
  
  while (j > 0) {
    alignment.push({ spokenIdx: null, targetIdx: j - 1, isMatch: false });
    j--;
  }
  
  while (i > 0) {
    alignment.push({ spokenIdx: i - 1, targetIdx: null, isMatch: false });
    i--;
  }
  
  return alignment.reverse();
}

function getCleanAyahWords(ayah, surahNum) {
  let text = ayah.displayTxt || ayah.text;
  if (ayah.numberInSurah === 1 && surahNum !== 1 && surahNum !== 9) {
    const bismillah = "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ";
    if (text.startsWith(bismillah)) {
      text = text.replace(bismillah, "").trim();
    }
  }
  return text.split(' ').filter(w => w.length > 0);
}

function processMemorizeSpokenText(spokenText) {
  const normSpoken = normalizeArabic(spokenText);
  let spokenWords = normSpoken.split(' ').filter(w => w.length > 0);

  if (spokenWords.length === 0) return;

  // Auto-detect starting Ayah dynamically based on the first or last words spoken
  let detectedAyahStartIdx = -1;
  let detectedSurahNum = -1;
  let detectedAyahNum = -1;
  let shouldSliceSpoken = false;
  let sliceStartIndex = 0;
  let searchS1 = "";
  let searchS2 = "";

  if (spokenWords.length >= 2) {
    const len = spokenWords.length;
    const firstS1 = spokenWords[0];
    const firstS2 = spokenWords[1];
    const lastS1 = spokenWords[len - 2];
    const lastS2 = spokenWords[len - 1];

    const currentSurah = STATE.currentSurah;
    if (currentSurah) {
      // 1. Search in current Surah first (2-word match)
      for (let aIdx = 0; aIdx < currentSurah.ayahs.length; aIdx++) {
        const ayah = currentSurah.ayahs[aIdx];
        const firstWordIdx = STATE.memorizeWords.findIndex(mw => mw.ayahNum === ayah.numberInSurah);
        if (firstWordIdx !== -1) {
          const w1 = STATE.memorizeWords[firstWordIdx];
          const w2 = STATE.memorizeWords[firstWordIdx + 1];
          if (w2) {
            // Match last 2 words (mid-session jump)
            if (areWordsSimilar(lastS1, w1.normalized) && areWordsSimilar(lastS2, w2.normalized)) {
              detectedAyahStartIdx = firstWordIdx;
              detectedSurahNum = currentSurah.number;
              detectedAyahNum = ayah.numberInSurah;
              shouldSliceSpoken = true;
              sliceStartIndex = len - 2;
              searchS1 = lastS1;
              searchS2 = lastS2;
              break;
            }
            // Match first 2 words (session startup jump)
            if (areWordsSimilar(firstS1, w1.normalized) && areWordsSimilar(firstS2, w2.normalized)) {
              detectedAyahStartIdx = firstWordIdx;
              detectedSurahNum = currentSurah.number;
              detectedAyahNum = ayah.numberInSurah;
              shouldSliceSpoken = true;
              sliceStartIndex = 0;
              searchS1 = firstS1;
              searchS2 = firstS2;
              break;
            }
          }
        }
      }

      // 2. Search in other Surahs: ONLY match the first Ayah (Ayah 1) of other Surahs!
      if (detectedSurahNum === -1) {
        for (let sIdx = 0; sIdx < QURAN_COMPLETE_DATA.length; sIdx++) {
          const s = QURAN_COMPLETE_DATA[sIdx];
          if (s.number === currentSurah.number) continue;
          
          const firstAyah = s.ayahs[0];
          if (firstAyah) {
            const words = getCleanAyahWords(firstAyah, s.number);
            if (words.length >= 2) {
              const w1Norm = normalizeArabic(words[0]);
              const w2Norm = normalizeArabic(words[1]);
              
              // Match first 2 words (session startup switch)
              if (areWordsSimilar(firstS1, w1Norm) && areWordsSimilar(firstS2, w2Norm)) {
                detectedSurahNum = s.number;
                detectedAyahNum = 1; // Always Ayah 1
                shouldSliceSpoken = true;
                sliceStartIndex = 0;
                searchS1 = firstS1;
                searchS2 = firstS2;
                break;
              }
              // Match last 2 words (mid-session switch)
              if (areWordsSimilar(lastS1, w1Norm) && areWordsSimilar(lastS2, w2Norm)) {
                detectedSurahNum = s.number;
                detectedAyahNum = 1; // Always Ayah 1
                shouldSliceSpoken = true;
                sliceStartIndex = len - 2;
                searchS1 = lastS1;
                searchS2 = lastS2;
                break;
              }
            }
          }
        }
      }
    }
  } else if (spokenWords.length === 1) {
    // 3. Fallback: 1-word match for the very first spoken word in current Surah
    const isSessionNew = STATE.memorizeWords.slice(STATE.memorizeSessionStartPointer).every(w => w.revealType !== 'correct' && w.revealType !== 'skipped');
    if (isSessionNew) {
      searchS1 = spokenWords[0];
      const currentSurah = STATE.currentSurah;
      if (currentSurah) {
        for (let aIdx = 0; aIdx < currentSurah.ayahs.length; aIdx++) {
          const ayah = currentSurah.ayahs[aIdx];
          const firstWordIdx = STATE.memorizeWords.findIndex(mw => mw.ayahNum === ayah.numberInSurah);
          if (firstWordIdx !== -1) {
            const w1 = STATE.memorizeWords[firstWordIdx];
            if (areWordsSimilar(searchS1, w1.normalized)) {
              detectedAyahStartIdx = firstWordIdx;
              detectedSurahNum = currentSurah.number;
              detectedAyahNum = ayah.numberInSurah;
              break;
            }
          }
        }
      }
    }
  }

  // Apply the detection (switch Surah or jump inside current Surah)
  if (detectedSurahNum !== -1) {
    if (detectedSurahNum !== STATE.currentSurah.number) {
      // Switch Surah!
      const slicedSpokenJoined = shouldSliceSpoken ? spokenWords.slice(sliceStartIndex).join(' ') : spokenText;
      loadSurah(detectedSurahNum).then(() => {
        const firstWordIdx = STATE.memorizeWords.findIndex(mw => mw.ayahNum === detectedAyahNum);
        if (firstWordIdx !== -1) {
          STATE.memorizePointer = firstWordIdx;
          STATE.memorizeSessionStartPointer = firstWordIdx;
          
          for (let idx = firstWordIdx; idx < STATE.memorizeWords.length; idx++) {
            const mw = STATE.memorizeWords[idx];
            if (mw.revealType !== 'prompted') {
              mw.revealed = false;
              mw.revealType = null;
            }
          }
          renderVerses();
          processMemorizeSpokenText(slicedSpokenJoined);
        }
      });
      return; // Terminate current execution and wait for the re-run
    } else if (detectedAyahStartIdx !== -1) {
      // Jump inside current Surah
      const currentActiveAyah = STATE.memorizeWords[STATE.memorizePointer]?.ayahNum || 1;
      if (detectedAyahNum !== currentActiveAyah) {
        STATE.memorizePointer = detectedAyahStartIdx;
        STATE.memorizeSessionStartPointer = detectedAyahStartIdx;
        if (shouldSliceSpoken) {
          spokenWords = spokenWords.slice(sliceStartIndex);
        }
        
        for (let idx = detectedAyahStartIdx; idx < STATE.memorizeWords.length; idx++) {
          const mw = STATE.memorizeWords[idx];
          if (mw.revealType !== 'prompted') {
            mw.revealed = false;
            mw.revealType = null;
          }
        }
        renderVerses();
      }
    }
  }

  // We align spokenWords against the slice of memorizeWords starting from memorizeSessionStartPointer
  const startIdx = STATE.memorizeSessionStartPointer;
  const targetSlice = STATE.memorizeWords.slice(startIdx);

  if (targetSlice.length === 0) return;

  const alignment = alignSpokenWithTarget(spokenWords, targetSlice);
  
  let maxMatchedSliceIdx = -1;
  alignment.forEach(align => {
    if (align.targetIdx !== null && align.isMatch) {
      if (align.targetIdx > maxMatchedSliceIdx) {
        maxMatchedSliceIdx = align.targetIdx;
      }
    }
  });

  // Convert slice index to global index in memorizeWords
  const maxMatchedIdx = maxMatchedSliceIdx !== -1 ? startIdx + maxMatchedSliceIdx : -1;

  // Reset words only in the active session slice (from startIdx onwards), preserving 'prompted' types
  for (let idx = startIdx; idx < STATE.memorizeWords.length; idx++) {
    const mw = STATE.memorizeWords[idx];
    if (mw.revealType !== 'prompted') {
      mw.revealed = false;
      mw.revealType = null;
    }
  }

  // Apply alignment matches
  alignment.forEach(align => {
    if (align.targetIdx !== null) {
      const globalIdx = startIdx + align.targetIdx;
      const target = STATE.memorizeWords[globalIdx];
      if (target && target.revealType !== 'prompted') {
        if (align.isMatch) {
          target.revealed = true;
          target.revealType = 'correct';
        }
      }
    }
  });

  // Mark all unrevealed words in the active session slice before maxMatchedIdx as skipped
  if (maxMatchedIdx !== -1) {
    for (let idx = startIdx; idx < maxMatchedIdx; idx++) {
      const target = STATE.memorizeWords[idx];
      if (target && target.revealType !== 'prompted' && !target.revealed) {
        target.revealed = true;
        target.revealType = 'skipped';
      }
    }
    STATE.memorizePointer = maxMatchedIdx + 1;
  }

  // Redraw verses to show updated green and red states
  renderVerses();

  // If the last word of the surah is matched, stop microphone and show results popup!
  if (maxMatchedIdx === STATE.memorizeWords.length - 1) {
    stopMemorizeSpeech();
    
    // Calculate accuracy percentage (based on the session start pointer onwards)
    const activeWords = STATE.memorizeWords.slice(startIdx);
    const correctCount = activeWords.filter(w => w.revealType === 'correct').length;
    const totalCount = activeWords.length;
    const percentage = Math.round((correctCount / totalCount) * 100);
    
    let rating = "";
    if (percentage >= 95) rating = "حفظ ممتاز ومتقن جداً! 🥇🏆";
    else if (percentage >= 85) rating = "حفظ جيد جداً، واصل تقدمك! 🥈✨";
    else if (percentage >= 70) rating = "حفظ حسن، يرجى مراجعة الكلمات الحمراء والتدرب عليها ثانية. 🥉📚";
    else rating = "قراءة طيبة، ولكن تحتاج إلى مراجعة السورة أكثر لتثبيت الحفظ. 📖💪";

    const msg = `لقد أتممت تسميع سورة ${STATE.currentSurah.name} كاملة بنجاح! 🎉\n\nنسبة صحة التلاوة: ${percentage}%\nالتقييم: ${rating}\n\nيمكنك الآن اختيار سورة أخرى من القائمة الجانبية لبدء تحدي جديد.`;
    
    setTimeout(() => {
      triggerKidCongratulation(msg);
    }, 600);
  }
}

// ==========================================
// 13. APP INITIALIZATION
// ==========================================
function setupExpandablePlayer() {
  const playerBar = document.getElementById('audio-player-bar');
  const expandTrigger = document.getElementById('current-ayah-info-trigger');
  const expandHandle = document.getElementById('player-expand-handle');
  const minimizeBtn = document.getElementById('minimize-player-btn');

  if (playerBar && expandTrigger) {
    const expandPlayer = () => {
      if (window.innerWidth <= 768 && !playerBar.classList.contains('expanded')) {
        playerBar.classList.add('expanded');
      }
    };
    
    expandTrigger.addEventListener('click', expandPlayer);
    if (expandHandle) expandHandle.addEventListener('click', expandPlayer);
  }

  if (playerBar && minimizeBtn) {
    minimizeBtn.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent re-triggering expand
      playerBar.classList.remove('expanded');
    });
  }
}

async function initApp() {
  initStorage();
  updateStreak();
  setupNavigation();
  setupUserModeSwitcher();
  setupExpandablePlayer();
  setupMemorizeModeToggle();
  
  setRepeatMode(STATE.audio.repeatMode);
  setUserMode(STATE.userMode);

  renderHadith();
  renderSurahSidebar();
  await loadSurah(1); // load Al-Fatiha
  
  console.log("Quran Memorizer application (بالإسلام نهتدي) secured and initialized successfully in Offline Mode!");
}

window.onload = initApp;
