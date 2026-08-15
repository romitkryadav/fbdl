/**
 * Live Follower Counter — Client Application Engine
 * Features:
 *  - Cookie-based session persistence (resumes last target & history on reload)
 *  - Count smoothing filter (suppresses API spike noise)
 *  - Round-robin worker rotation with silent retry + exponential back-off
 *  - Animated number transitions + live sparkline
 */

// ─── Cookie Helpers ─────────────────────────────────────────────────────────

/**
 * Write a cookie. Default TTL: 7 days.
 * Uses SameSite=Lax; no Secure flag so it works on local file:// too.
 */
function setCookie(name, value, days = 7) {
  try {
    const expires = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
  } catch (e) { /* storage might be blocked — degrade silently */ }
}

function getCookie(name) {
  try {
    const key = `${encodeURIComponent(name)}=`;
    const parts = document.cookie.split('; ');
    for (const part of parts) {
      if (part.startsWith(key)) {
        return decodeURIComponent(part.slice(key.length));
      }
    }
  } catch (e) {}
  return null;
}

function deleteCookie(name) {
  setCookie(name, '', -1);
}

/** Persist the current tracking session state to cookies. */
function saveSessionCookies(handle, count, initialCount, ticks, history) {
  setCookie('fbctr_target',  handle);
  setCookie('fbctr_count',   String(count));
  setCookie('fbctr_initial', String(initialCount));
  setCookie('fbctr_ticks',   String(ticks));
  // Store history as a pipe-delimited string (max 30 entries, integers only)
  const compact = history.slice(-30).map(Number).filter(n => !isNaN(n)).join('|');
  setCookie('fbctr_history', compact);
}

/** Load last session from cookies. Returns null if nothing is stored. */
function loadSessionCookies() {
  const target = getCookie('fbctr_target');
  if (!target) return null;
  const count   = parseInt(getCookie('fbctr_count'),   10) || 0;
  const initial = parseInt(getCookie('fbctr_initial'), 10) || 0;
  const ticks   = parseInt(getCookie('fbctr_ticks'),   10) || 0;
  const raw     = getCookie('fbctr_history') || '';
  const history = raw.split('|').map(Number).filter(n => !isNaN(n) && n > 0);
  return { target, count, initial, ticks, history };
}

// ─── Count Smoothing ─────────────────────────────────────────────────────────

/**
 * Smooths an incoming count against the previous value.
 * If the change is > SPIKE_THRESHOLD_PERCENT of the previous value AND
 * the raw jump is larger than SPIKE_MIN_ABSOLUTE, it blends 70% old + 30% new
 * to avoid jarring display jumps caused by API inconsistencies.
 *
 * On the very first data point (prev === 0) no smoothing is applied.
 */
const SPIKE_THRESHOLD_PERCENT = 0.05; // 5 % swing triggers smoothing
const SPIKE_MIN_ABSOLUTE      = 5000; // only smooth if absolute diff > 5 000

function smoothCount(rawNew, prev) {
  if (prev === 0 || rawNew === 0) return rawNew;
  const diff = Math.abs(rawNew - prev);
  const pct  = diff / prev;
  if (pct > SPIKE_THRESHOLD_PERCENT && diff > SPIKE_MIN_ABSOLUTE) {
    // Weighted blend: trust previous value more on sudden spikes
    return Math.round(prev * 0.70 + rawNew * 0.30);
  }
  return rawNew;
}

// ─── Main App ────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {

  // DOM references
  const counterForm      = document.getElementById('counterForm');
  const pageUrlInput     = document.getElementById('pageUrlInput');
  const submitBtn        = document.getElementById('submitBtn');
  const btnSpinner       = document.getElementById('btnSpinner');
  const btnText          = submitBtn ? submitBtn.querySelector('.btn-text') : null;

  const errorBox         = document.getElementById('errorBox');
  const errorMessage     = document.getElementById('errorMessage');

  const pageNameEl       = document.getElementById('pageName');
  const profileImageEl   = document.getElementById('profileImage');
  const avatarFallbackEl = document.getElementById('avatarFallback');
  const followerCountEl  = document.getElementById('followerCount');
  const counterSublabelEl= document.getElementById('counterSublabel');

  const trackingLinkEl   = document.getElementById('trackingLink');
  const trackingHandleEl = document.getElementById('trackingHandle');
  const subtitleHandleEl = document.getElementById('subtitleHandle');

  const countdownTimer   = document.getElementById('countdownTimer');
  const pauseBtn         = document.getElementById('pauseBtn');
  const pauseIcon        = document.getElementById('pauseIcon');
  const ringSpinner      = document.getElementById('ringSpinner');
  const monitoringSubtext= document.getElementById('monitoringSubtext');

  const targetUsernameVal= document.getElementById('targetUsernameVal');
  const sessionDeltaVal  = document.getElementById('sessionDeltaVal');
  const pollIterationsVal= document.getElementById('pollIterationsVal');
  const lastVerifiedVal  = document.getElementById('lastVerifiedVal');
  const activeWorkerVal  = document.getElementById('activeWorkerVal');

  const sparklinePath    = document.getElementById('sparklinePath');
  const sparklineArea    = document.getElementById('sparklineArea');
  const sparklineDot     = document.getElementById('sparklineDot');

  // Optional UI elements (OK if absent)
  const workerEndpointSelect = document.getElementById('workerEndpointSelect');
  const customWorkerInput    = document.getElementById('customWorkerInput');
  const intervalSelect       = document.getElementById('intervalSelect');
  const toggleDocsBtn        = document.getElementById('toggleDocsBtn');
  const docsDrawer           = document.getElementById('docsDrawer');

  // ── Worker Pool ──
  const WORKER_URLS = [
    'https://fbcount.romitkr5539.workers.dev/api/facebook-followers',
    'https://fbcount2.ajeetkr0920.workers.dev/api/facebook-followers',
    'https://fbcount3.ronitkr9341.workers.dev/api/facebook-followers'
  ];
  let workerRotationIndex = 0;
  let lastUsedWorkerUrl   = WORKER_URLS[0];

  // ── App State ──
  let currentTargetHandle  = 'mrbeast';
  let currentTargetUrl     = 'https://www.facebook.com/mrbeast';
  let initialFollowerCount = 0;
  let currentFollowerCount = 0;
  let isFetching           = false;
  let isPaused             = false;
  let refreshIntervalSeconds = 5;
  let countdownSeconds       = 5.0;
  let pollTicks              = 0;
  let timerTicker            = null;
  let followerHistory        = [];

  // ── Silent retry state ──
  const MAX_RETRIES    = 3;   // try up to 3 workers before surfacing error
  const BASE_BACKOFF   = 600; // ms — first retry delay
  let   consecutiveFails = 0;

  // ── Boot: restore last session from cookies ──
  const saved = loadSessionCookies();
  if (saved && saved.target) {
    currentTargetHandle  = saved.target;
    currentFollowerCount = saved.count;
    initialFollowerCount = saved.initial;
    pollTicks            = saved.ticks;
    followerHistory      = saved.history;

    // Pre-fill input and show the previous count immediately
    if (pageUrlInput) pageUrlInput.value = saved.target;
    if (followerCountEl && saved.count > 0) {
      followerCountEl.textContent = formatNumber(saved.count);
    }
    if (followerHistory.length > 1) renderSparklineChart();

    // Kick off a fresh fetch for the saved target
    currentTargetUrl = normalizeFacebookInput(saved.target);
    initEventListeners();
    startFollowerCheck(currentTargetUrl, /* restoring */ true);
  } else {
    initEventListeners();
    const initialInput = pageUrlInput ? (pageUrlInput.value.trim() || 'mrbeast') : 'mrbeast';
    startFollowerCheck(normalizeFacebookInput(initialInput));
  }

  // ─── URL / Handle Helpers ────────────────────────────────────────────────

  function normalizeFacebookInput(inputUrl) {
    if (!inputUrl || typeof inputUrl !== 'string') return '';
    let str = inputUrl.trim();
    if (str.startsWith('@')) str = str.substring(1).trim();
    if (/^https?:\/\//i.test(str)) return str;
    if (/^(www\.|m\.|mobile\.|web\.|touch\.)?facebook\.com/i.test(str)) return `https://${str}`;
    str = str.replace(/^\/+/, '');
    return `https://www.facebook.com/${str}`;
  }

  function extractHandle(targetUrl) {
    try {
      const url   = new URL(targetUrl);
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts.length > 0 && !['pages','profile.php','people'].includes(parts[0])) {
        return parts[0].replace(/^@/, '');
      }
    } catch (e) {}
    return targetUrl.replace(/^@/, '').split('/')[0] || 'mrbeast';
  }

  // ─── Worker Rotation ─────────────────────────────────────────────────────

  function getNextWorkerBaseUrl() {
    if (workerRotationIndex >= WORKER_URLS.length) workerRotationIndex = 0;
    const url = WORKER_URLS[workerRotationIndex];
    workerRotationIndex = (workerRotationIndex + 1) % WORKER_URLS.length;
    return url;
  }

  function buildWorkerApiUrl(baseUrl, targetUrl) {
    const sep = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${sep}url=${encodeURIComponent(targetUrl)}`;
  }

  // ─── Event Listeners ─────────────────────────────────────────────────────

  function initEventListeners() {
    if (workerEndpointSelect) {
      workerEndpointSelect.addEventListener('change', () => {
        if (customWorkerInput) {
          customWorkerInput.style.display = workerEndpointSelect.value === 'custom' ? 'block' : 'none';
        }
      });
    }

    if (intervalSelect) {
      intervalSelect.addEventListener('change', () => {
        refreshIntervalSeconds = parseFloat(intervalSelect.value) || 5;
        resetAutoRefreshCountdown();
      });
    }

    if (counterForm) {
      counterForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const rawInput = pageUrlInput ? pageUrlInput.value.trim() : '';
        if (rawInput) startFollowerCheck(normalizeFacebookInput(rawInput));
      });
    }

    document.addEventListener('click', (e) => {
      const accountCard = e.target.closest('.account-card, .account-quick-link');
      if (accountCard) {
        e.preventDefault();
        const username = accountCard.getAttribute('data-username');
        if (username) {
          if (pageUrlInput) pageUrlInput.value = username;
          startFollowerCheck(normalizeFacebookInput(username));
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }
      const footerDocsLink = e.target.closest('#footerDocsLink');
      if (footerDocsLink) {
        e.preventDefault();
        if (docsDrawer) { docsDrawer.style.display = 'flex'; docsDrawer.scrollIntoView({ behavior: 'smooth' }); }
      }
    });

    if (pauseBtn) {
      pauseBtn.addEventListener('click', () => {
        isPaused = !isPaused;
        if (isPaused) {
          pauseAutoRefresh();
          if (pauseIcon)      pauseIcon.textContent = '▶';
          if (ringSpinner)    ringSpinner.style.animationPlayState = 'paused';
          if (monitoringSubtext) monitoringSubtext.textContent = 'Live monitoring paused';
        } else {
          resumeAutoRefresh();
          if (pauseIcon)      pauseIcon.textContent = '||';
          if (ringSpinner)    ringSpinner.style.animationPlayState = 'running';
          if (monitoringSubtext) monitoringSubtext.textContent = 'Fetching from Facebook servers';
        }
      });
    }

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        pauseAutoRefresh();
      } else if (!isPaused && currentTargetUrl) {
        resumeAutoRefresh();
      }
    });

    if (toggleDocsBtn && docsDrawer) {
      toggleDocsBtn.addEventListener('click', () => {
        docsDrawer.style.display = docsDrawer.style.display === 'none' ? 'flex' : 'none';
      });
      docsDrawer.addEventListener('click', (e) => {
        const tabBtn = e.target.closest('.tab-btn');
        if (tabBtn) {
          const targetTabId = tabBtn.getAttribute('data-tab');
          docsDrawer.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
          docsDrawer.querySelectorAll('.tab-content').forEach(c => { c.style.display = 'none'; });
          tabBtn.classList.add('active');
          const tc = document.getElementById(targetTabId);
          if (tc) tc.style.display = 'block';
        }
      });
    }

    // Hamburger
    const hamburgerBtn = document.getElementById('hamburgerBtn');
    const mobileNav    = document.getElementById('mobileNav');
    if (hamburgerBtn && mobileNav) {
      hamburgerBtn.addEventListener('click', () => {
        const isOpen = mobileNav.classList.contains('open');
        if (isOpen) {
          mobileNav.classList.remove('open');
          mobileNav.setAttribute('hidden', '');
          hamburgerBtn.setAttribute('aria-expanded', 'false');
        } else {
          mobileNav.classList.add('open');
          mobileNav.removeAttribute('hidden');
          hamburgerBtn.setAttribute('aria-expanded', 'true');
        }
      });
    }

    // FAQ accordion
    try {
      document.querySelectorAll('.faq-item').forEach((item) => {
        const btn    = item.querySelector('.faq-question');
        const answer = item.querySelector('.faq-answer');
        if (!btn || !answer) return;
        btn.addEventListener('click', () => {
          const isActive = item.classList.contains('active');
          document.querySelectorAll('.faq-item').forEach((other) => {
            other.classList.remove('active');
            const ob = other.querySelector('.faq-question');
            const oa = other.querySelector('.faq-answer');
            if (ob) ob.setAttribute('aria-expanded', 'false');
            if (oa) oa.setAttribute('hidden', '');
          });
          if (!isActive) {
            item.classList.add('active');
            btn.setAttribute('aria-expanded', 'true');
            answer.removeAttribute('hidden');
          }
        });
      });
    } catch (e) {}
  }

  // ─── Tracking ────────────────────────────────────────────────────────────

  /**
   * Start tracking a new target. Clears session state unless restoring.
   * @param {string}  url         Normalised Facebook URL
   * @param {boolean} restoring   True when called from cookie restore on boot
   */
  async function startFollowerCheck(url, restoring = false) {
    if (isFetching) return;
    hideError();
    currentTargetUrl    = url;
    currentTargetHandle = extractHandle(url);

    if (!restoring) {
      // Fresh target — reset everything including cookies
      initialFollowerCount = 0;
      currentFollowerCount = 0;
      pollTicks            = 0;
      followerHistory      = [];
      consecutiveFails     = 0;
      workerRotationIndex  = 0;
      // Clear saved session so a page reload starts fresh for new target
      deleteCookie('fbctr_target');
    }

    stopAutoRefresh();
    await fetchFollowerCount(url, false);
  }

  /**
   * Fetch from the next worker. On failure, retries silently up to MAX_RETRIES
   * workers before surfacing an error. Uses exponential back-off between retries.
   */
  async function fetchFollowerCount(targetUrl, isTickRefresh = false, attempt = 0) {
    if (isFetching) return;
    isFetching = true;
    setLoadingState(true);

    const workerBaseUrl   = getNextWorkerBaseUrl();
    lastUsedWorkerUrl     = workerBaseUrl;

    if (activeWorkerVal) {
      try { activeWorkerVal.textContent = new URL(workerBaseUrl).hostname; } catch (e) {}
    }

    try {
      const apiEndpoint = buildWorkerApiUrl(workerBaseUrl, targetUrl);
      const controller  = new AbortController();
      const timeoutId   = setTimeout(() => controller.abort(), 8000); // 8 s timeout

      const response = await fetch(apiEndpoint, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Worker returned failure.');
      }

      // ── Success ──
      consecutiveFails = 0;
      hideError();
      pollTicks++;

      updateResultUI(data.page);
      resetAutoRefreshCountdown();

    } catch (err) {
      consecutiveFails++;

      if (attempt < MAX_RETRIES - 1) {
        // Silent retry: wait with exponential back-off then try next worker
        isFetching = false;
        setLoadingState(false);
        const delay = BASE_BACKOFF * Math.pow(2, attempt); // 600 / 1200 / 2400 ms
        await new Promise(resolve => setTimeout(resolve, delay));
        await fetchFollowerCount(targetUrl, isTickRefresh, attempt + 1);
        return;
      }

      // All retries exhausted — show error to user
      const msg = err.name === 'AbortError'
        ? 'Request timed out. Check your connection and try again.'
        : `Unable to fetch count. Tried ${MAX_RETRIES} workers. ${err.message || ''}`.trim();
      showError(msg);

    } finally {
      isFetching = false;
      setLoadingState(false);
    }
  }

  // ─── UI Update ───────────────────────────────────────────────────────────

  function formatHandleToName(handle) {
    if (!handle) return 'User';
    const known = {
      mrbeast:            'MrBeast',
      cristiano:          'Cristiano Ronaldo',
      neymarjr:           'Neymar Jr',
      kimkardashian:      'Kim Kardashian',
      meta:               'Meta',
      cocacola:           'Coca-Cola',
      romitkryadav:       'Romit Kr Yadav',
      abhijit_yadav_0018: 'Abhijit Kumar',
      threads:            'Threads'
    };
    const clean = handle.replace(/^@/, '').trim().toLowerCase();
    if (known[clean]) return known[clean];
    return clean.replace(/[._-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  function updateResultUI(pageData) {
    let rawName = pageData && pageData.name ? pageData.name.trim() : '';
    const badNames = new Set(['facebook', 'facebook page', 'log in', 'home', '']);
    if (badNames.has(rawName.toLowerCase())) rawName = formatHandleToName(currentTargetHandle);

    const pageName = rawName;
    const handle   = `@${currentTargetHandle.toLowerCase()}`;

    if (pageNameEl)        pageNameEl.textContent = pageName;
    if (trackingHandleEl)  trackingHandleEl.textContent = handle;
    if (subtitleHandleEl)  subtitleHandleEl.textContent = handle;
    if (counterSublabelEl) counterSublabelEl.textContent = `${pageName.toUpperCase()} FOLLOWERS`;
    if (targetUsernameVal) targetUsernameVal.textContent = handle;
    if (trackingLinkEl) {
      trackingLinkEl.href = currentTargetUrl && currentTargetUrl.startsWith('http')
        ? currentTargetUrl
        : `https://www.facebook.com/${currentTargetHandle}`;
    }

    // Profile image
    let dpUrl = pageData.profileImage
      || `https://ui-avatars.com/api/?name=${encodeURIComponent(pageName)}&background=1877F2&color=ffffff&size=256&bold=true`;

    if (dpUrl.startsWith('/api/')) {
      try {
        dpUrl = `${new URL(lastUsedWorkerUrl).origin}${dpUrl}`;
      } catch (e) {
        dpUrl = `${new URL(WORKER_URLS[0]).origin}${dpUrl}`;
      }
    }

    if (profileImageEl) {
      profileImageEl.referrerPolicy = 'no-referrer';
      profileImageEl.src = dpUrl;
      profileImageEl.style.display = 'block';
      if (avatarFallbackEl) avatarFallbackEl.style.display = 'none';
      profileImageEl.onerror = () => {
        profileImageEl.style.display = 'none';
        if (avatarFallbackEl) {
          avatarFallbackEl.style.display = 'flex';
          avatarFallbackEl.textContent = getInitials(pageName);
        }
      };
    }

    // ── Count with smoothing ──
    const rawNewCount    = pageData.followers || 0;
    const smoothedCount  = smoothCount(rawNewCount, currentFollowerCount);

    if (initialFollowerCount === 0) initialFollowerCount = smoothedCount;

    const delta = smoothedCount - initialFollowerCount;
    if (sessionDeltaVal)  sessionDeltaVal.textContent  = delta >= 0 ? `+${delta}` : `${delta}`;
    if (pollIterationsVal) pollIterationsVal.textContent = `${pollTicks} ticks`;
    if (lastVerifiedVal) {
      lastVerifiedVal.textContent = new Date().toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
    }

    animateNumberChange(currentFollowerCount, smoothedCount);
    currentFollowerCount = smoothedCount;

    followerHistory.push(smoothedCount);
    if (followerHistory.length > 30) followerHistory.shift();
    renderSparklineChart();

    // ── Persist to cookies ──
    saveSessionCookies(
      currentTargetHandle,
      currentFollowerCount,
      initialFollowerCount,
      pollTicks,
      followerHistory
    );
  }

  // ─── Number Animation ────────────────────────────────────────────────────

  function animateNumberChange(startVal, endVal) {
    if (!followerCountEl) return;
    if (startVal === endVal && followerCountEl.textContent !== '0') {
      followerCountEl.textContent = formatNumber(endVal);
      return;
    }
    followerCountEl.classList.add('pulse-change');
    setTimeout(() => followerCountEl.classList.remove('pulse-change'), 300);

    const duration  = 600;
    const startTime = performance.now();

    function step(now) {
      const progress    = Math.min((now - startTime) / duration, 1);
      const ease        = progress * (2 - progress); // ease-out
      const currentVal  = Math.floor(startVal + (endVal - startVal) * ease);
      followerCountEl.textContent = formatNumber(currentVal);
      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        followerCountEl.textContent = formatNumber(endVal);
      }
    }
    requestAnimationFrame(step);
  }

  // ─── Sparkline ───────────────────────────────────────────────────────────

  function renderSparklineChart() {
    if (!sparklinePath || !followerHistory || followerHistory.length < 2) return;

    const W = 800, H = 120, PAD = 20;
    const minVal  = Math.min(...followerHistory) - 10;
    const maxVal  = Math.max(...followerHistory) + 10;
    const range   = maxVal - minVal || 1;
    const n       = followerHistory.length;

    const pts = followerHistory.map((v, i) => ({
      x: (i / Math.max(n - 1, 1)) * (W - PAD * 2) + PAD,
      y: H - PAD - ((v - minVal) / range) * (H - PAD * 2)
    }));

    // Smooth path using cardinal spline tension
    let pathD = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1];
      const curr = pts[i];
      const cpx  = (prev.x + curr.x) / 2;
      pathD += ` C ${cpx} ${prev.y}, ${cpx} ${curr.y}, ${curr.x} ${curr.y}`;
    }

    const last  = pts[pts.length - 1];
    const first = pts[0];
    const areaD = `${pathD} L ${last.x} ${H} L ${first.x} ${H} Z`;

    if (sparklinePath) sparklinePath.setAttribute('d', pathD);
    if (sparklineArea) sparklineArea.setAttribute('d', areaD);
    if (sparklineDot) {
      sparklineDot.setAttribute('cx', last.x);
      sparklineDot.setAttribute('cy', last.y);
    }
  }

  // ─── Auto-Refresh Timer ──────────────────────────────────────────────────

  function resetAutoRefreshCountdown() {
    stopAutoRefresh();
    countdownSeconds = refreshIntervalSeconds;
    updateTimerUI();
    if (document.visibilityState === 'visible' && !isPaused) resumeAutoRefresh();
  }

  function resumeAutoRefresh() {
    if (timerTicker) clearInterval(timerTicker);
    timerTicker = setInterval(() => {
      countdownSeconds -= 0.1;
      if (countdownSeconds <= 0) {
        clearInterval(timerTicker);
        timerTicker = null;
        if (currentTargetUrl && !isFetching && !isPaused) {
          fetchFollowerCount(currentTargetUrl, true);
        }
      } else {
        updateTimerUI();
      }
    }, 100);
  }

  function pauseAutoRefresh() {
    if (timerTicker) { clearInterval(timerTicker); timerTicker = null; }
  }

  function stopAutoRefresh() {
    pauseAutoRefresh();
    countdownSeconds = refreshIntervalSeconds;
    updateTimerUI();
  }

  function updateTimerUI() {
    if (countdownTimer) countdownTimer.textContent = `${Math.max(0, countdownSeconds).toFixed(1)}s`;
  }

  // ─── Loading / Error ─────────────────────────────────────────────────────

  function setLoadingState(isLoading) {
    if (!submitBtn) return;
    submitBtn.disabled = isLoading;
    if (btnSpinner) btnSpinner.style.display = isLoading ? 'inline-block' : 'none';
    if (btnText)    btnText.textContent = isLoading ? 'Tracking...' : 'Track';
  }

  function showError(msg) {
    if (errorMessage) errorMessage.textContent = msg;
    if (errorBox)     errorBox.style.display = 'flex';
  }

  function hideError() {
    if (errorBox)     errorBox.style.display = 'none';
    if (errorMessage) errorMessage.textContent = '';
  }

  // ─── Utilities ───────────────────────────────────────────────────────────

  function formatNumber(num) {
    return new Intl.NumberFormat('en-US').format(num);
  }

  function getInitials(name) {
    if (!name) return 'T';
    const words = name.trim().split(/\s+/);
    return words.length >= 2
      ? (words[0][0] + words[1][0]).toUpperCase()
      : name.slice(0, 2).toUpperCase();
  }

}); // end DOMContentLoaded
