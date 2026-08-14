/**
 * Live Follower Counter - Client Application Engine
 * Vanilla JavaScript implementation for real-time follower growth tracking,
 * animated number transitions, live sparkline trend rendering, and Cloudflare Worker proxy integration.
 */

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const counterForm = document.getElementById('counterForm');
  const pageUrlInput = document.getElementById('pageUrlInput');
  const submitBtn = document.getElementById('submitBtn');
  const btnSpinner = document.getElementById('btnSpinner');
  const btnText = submitBtn.querySelector('.btn-text');
  
  const errorBox = document.getElementById('errorBox');
  const errorMessage = document.getElementById('errorMessage');
  
  const resultCard = document.getElementById('resultCard');
  const pageNameEl = document.getElementById('pageName');
  const profileImageEl = document.getElementById('profileImage');
  const avatarFallbackEl = document.getElementById('avatarFallback');
  const followerCountEl = document.getElementById('followerCount');
  const counterSublabelEl = document.getElementById('counterSublabel');
  
  const trackingLinkEl = document.getElementById('trackingLink');
  const trackingHandleEl = document.getElementById('trackingHandle');
  const subtitleHandleEl = document.getElementById('subtitleHandle');

  // Live Monitoring UI Elements
  const countdownTimer = document.getElementById('countdownTimer');
  const pauseBtn = document.getElementById('pauseBtn');
  const pauseIcon = document.getElementById('pauseIcon');
  const ringSpinner = document.getElementById('ringSpinner');
  const monitoringSubtext = document.getElementById('monitoringSubtext');

  // Analytics Stat Cards
  const targetUsernameVal = document.getElementById('targetUsernameVal');
  const sessionDeltaVal = document.getElementById('sessionDeltaVal');
  const pollIterationsVal = document.getElementById('pollIterationsVal');
  const lastVerifiedVal = document.getElementById('lastVerifiedVal');

  // Sparkline Chart Elements
  const sparklinePath = document.getElementById('sparklinePath');
  const sparklineArea = document.getElementById('sparklineArea');
  const sparklineDot = document.getElementById('sparklineDot');

  // Configuration Elements
  const workerEndpointSelect = document.getElementById('workerEndpointSelect');
  const customWorkerInput = document.getElementById('customWorkerInput');
  const intervalSelect = document.getElementById('intervalSelect');
  const toggleDocsBtn = document.getElementById('toggleDocsBtn');
  const docsDrawer = document.getElementById('docsDrawer');

  // Application State
  let currentTargetHandle = 'mrbeast';
  let currentTargetUrl = 'https://www.facebook.com/mrbeast';
  let initialFollowerCount = 0;
  let currentFollowerCount = 0;
  let isFetching = false;
  let isPaused = false;
  
  let refreshIntervalSeconds = 5;
  let countdownSeconds = 5.0;
  let pollTicks = 0;
  let timerTicker = null;

  // Historical Sparkline Data Points Array
  let followerHistory = [];

  // Initialize
  initEventListeners();
  
  // Auto-Start tracking target on load
  const initialInput = pageUrlInput.value.trim() || 'mrbeast';
  startFollowerCheck(normalizeFacebookInput(initialInput));

  function normalizeFacebookInput(inputUrl) {
    if (!inputUrl || typeof inputUrl !== 'string') return '';
    let str = inputUrl.trim();

    if (str.startsWith('@')) {
      str = str.substring(1).trim();
    }

    if (/^https?:\/\//i.test(str)) {
      return str;
    }

    if (/^(www\.|m\.|mobile\.|web\.|touch\.)?facebook\.com/i.test(str)) {
      return `https://${str}`;
    }

    str = str.replace(/^\/+/, '');
    return `https://www.facebook.com/${str}`;
  }

  function extractHandle(targetUrl) {
    try {
      const url = new URL(targetUrl);
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts.length > 0 && parts[0] !== 'pages' && parts[0] !== 'profile.php' && parts[0] !== 'people') {
        return parts[0].replace(/^@/, '');
      }
    } catch (e) {}
    return targetUrl.replace(/^@/, '').split('/')[0] || 'mrbeast';
  }

  function getWorkerApiUrl(targetUrl) {
    let baseUrl = workerEndpointSelect ? workerEndpointSelect.value : 'https://fbcount.romitkr5539.workers.dev/api/facebook-followers';
    if (baseUrl === 'custom') {
      baseUrl = (customWorkerInput && customWorkerInput.value.trim()) || 'https://fbcount.romitkr5539.workers.dev/api/facebook-followers';
    }

    const separator = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${separator}url=${encodeURIComponent(targetUrl)}`;
  }

  function initEventListeners() {
    // Worker Endpoint Selector Change
    if (workerEndpointSelect) {
      workerEndpointSelect.addEventListener('change', () => {
        if (customWorkerInput) {
          customWorkerInput.style.display = workerEndpointSelect.value === 'custom' ? 'block' : 'none';
        }
      });
    }

    // Interval Selector Change
    if (intervalSelect) {
      intervalSelect.addEventListener('change', () => {
        refreshIntervalSeconds = parseFloat(intervalSelect.value) || 5;
        resetAutoRefreshCountdown();
      });
    }

    // Form Submit Event
    counterForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const rawInput = pageUrlInput.value.trim();
      if (rawInput) {
        startFollowerCheck(normalizeFacebookInput(rawInput));
      }
    });

    // Account Cards & Footer Quick Links Click
    document.addEventListener('click', (e) => {
      const accountCard = e.target.closest('.account-card, .account-quick-link');
      if (accountCard) {
        e.preventDefault();
        const username = accountCard.getAttribute('data-username');
        if (username) {
          pageUrlInput.value = username;
          startFollowerCheck(normalizeFacebookInput(username));
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }

      const footerDocsLink = e.target.closest('#footerDocsLink');
      if (footerDocsLink) {
        e.preventDefault();
        if (docsDrawer) {
          docsDrawer.style.display = 'flex';
          docsDrawer.scrollIntoView({ behavior: 'smooth' });
        }
      }
    });

    // Pause / Resume Toggle Button
    if (pauseBtn) {
      pauseBtn.addEventListener('click', () => {
        isPaused = !isPaused;
        if (isPaused) {
          pauseAutoRefresh();
          pauseIcon.textContent = '▶';
          if (ringSpinner) ringSpinner.style.animationPlayState = 'paused';
          if (monitoringSubtext) monitoringSubtext.textContent = 'Live monitoring paused';
        } else {
          resumeAutoRefresh();
          pauseIcon.textContent = '||';
          if (ringSpinner) ringSpinner.style.animationPlayState = 'running';
          if (monitoringSubtext) monitoringSubtext.textContent = 'Fetching from Facebook servers';
        }
      });
    }

    // Visibility Change Handler (Pause when tab is hidden)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        pauseAutoRefresh();
      } else if (!isPaused && currentTargetUrl) {
        resumeAutoRefresh();
      }
    });

    // Technical Docs Drawer Toggle
    if (toggleDocsBtn && docsDrawer) {
      toggleDocsBtn.addEventListener('click', () => {
        const isHidden = docsDrawer.style.display === 'none';
        docsDrawer.style.display = isHidden ? 'flex' : 'none';
      });

      docsDrawer.addEventListener('click', (e) => {
        const tabBtn = e.target.closest('.tab-btn');
        if (tabBtn) {
          const targetTabId = tabBtn.getAttribute('data-tab');
          
          docsDrawer.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
          docsDrawer.querySelectorAll('.tab-content').forEach(content => content.style.display = 'none');
          
          tabBtn.classList.add('active');
          const targetContent = document.getElementById(targetTabId);
          if (targetContent) {
            targetContent.style.display = 'block';
          }
        }
      });
    }
  }

  /**
   * Primary Follower Check Initiation
   */
  async function startFollowerCheck(url) {
    if (isFetching) return;
    
    hideError();
    currentTargetUrl = url;
    currentTargetHandle = extractHandle(url);
    
    // Reset Counters & History for new Target
    initialFollowerCount = 0;
    currentFollowerCount = 0;
    pollTicks = 0;
    followerHistory = [];
    
    stopAutoRefresh();
    
    await fetchFollowerCount(url, false);
  }

  /**
   * Performs API Call to Cloudflare Worker
   */
  async function fetchFollowerCount(targetUrl, isTickRefresh = false) {
    if (isFetching) return;
    isFetching = true;

    setLoadingState(true);

    try {
      const apiEndpoint = getWorkerApiUrl(targetUrl);
      const response = await fetch(apiEndpoint, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        const errText = data.error || 'Follower count is not publicly available for this Page.';
        showError(errText);
        return;
      }

      // Successful Data Processing
      hideError();
      pollTicks++;
      
      // Update UI Display
      updateResultUI(data.page);
      
      // Reset Countdown
      resetAutoRefreshCountdown();

    } catch (err) {
      showError('Network connection error or Worker endpoint unreachable.');
    } finally {
      isFetching = false;
      setLoadingState(false);
    }
  }

  /**
   * Helper to format handle into clean display name
   */
  function formatHandleToName(handle) {
    if (!handle) return 'User';
    const knownNames = {
      'mrbeast': 'MrBeast',
      'cristiano': 'Cristiano Ronaldo',
      'neymarjr': 'Neymar Jr',
      'kimkardashian': 'Kim Kardashian',
      'meta': 'Meta',
      'cocacola': 'Coca-Cola',
      'romitkryadav': 'Romit Kr Yadav',
      'abhijit_yadav_0018': 'Abhijit Kumar',
      'threads': 'Threads'
    };
    const clean = handle.replace(/^@/, '').trim().toLowerCase();
    if (knownNames[clean]) return knownNames[clean];

    return clean
      .replace(/[._-]+/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  /**
   * Updates Result Card UI with Fresh Page Data
   */
  function updateResultUI(pageData) {
    let rawName = pageData && pageData.name ? pageData.name.trim() : '';
    if (!rawName || rawName.toLowerCase() === 'facebook' || rawName.toLowerCase() === 'facebook page' || rawName.toLowerCase() === 'log in' || rawName.toLowerCase() === 'home') {
      rawName = formatHandleToName(currentTargetHandle);
    }

    const pageName = rawName;
    const handle = `@${currentTargetHandle.toLowerCase()}`;

    pageNameEl.textContent = pageName;
    if (trackingHandleEl) trackingHandleEl.textContent = handle;
    if (subtitleHandleEl) subtitleHandleEl.textContent = handle;
    if (counterSublabelEl) counterSublabelEl.textContent = `${pageName.toUpperCase()} FOLLOWERS`;
    if (targetUsernameVal) targetUsernameVal.textContent = handle;
    if (trackingLinkEl) {
      if (currentTargetUrl && currentTargetUrl.startsWith('http')) {
        trackingLinkEl.href = currentTargetUrl;
      } else {
        trackingLinkEl.href = `https://www.facebook.com/${currentTargetHandle}`;
      }
    }

    // Profile DP Image
    let dpUrl = pageData.profileImage || `https://ui-avatars.com/api/?name=${encodeURIComponent(pageName)}&background=1877F2&color=ffffff&size=256&bold=true`;

    if (dpUrl && dpUrl.startsWith('/api/')) {
      const selectedEndpoint = workerEndpointSelect ? workerEndpointSelect.value : 'https://fbcount.romitkr5539.workers.dev/api/facebook-followers';
      let activeWorkerUrl = selectedEndpoint;
      if (selectedEndpoint === 'custom' && customWorkerInput && customWorkerInput.value) {
        activeWorkerUrl = customWorkerInput.value.trim();
      }
      if (activeWorkerUrl && activeWorkerUrl.startsWith('http')) {
        try {
          const workerOrigin = new URL(activeWorkerUrl).origin;
          dpUrl = `${workerOrigin}${dpUrl}`;
        } catch (e) {
          dpUrl = `https://fbcount.romitkr5539.workers.dev${dpUrl}`;
        }
      } else {
        dpUrl = `https://fbcount.romitkr5539.workers.dev${dpUrl}`;
      }
    }

    profileImageEl.referrerPolicy = "no-referrer";
    profileImageEl.src = dpUrl;
    profileImageEl.style.display = 'block';
    avatarFallbackEl.style.display = 'none';

    profileImageEl.onerror = () => {
      profileImageEl.style.display = 'none';
      avatarFallbackEl.style.display = 'flex';
      avatarFallbackEl.textContent = getInitials(pageName);
    };

    // Calculate Follower Numbers & Delta
    const newCount = pageData.followers || 0;

    if (initialFollowerCount === 0) {
      initialFollowerCount = newCount;
    }

    const delta = newCount - initialFollowerCount;
    if (sessionDeltaVal) {
      sessionDeltaVal.textContent = delta >= 0 ? `+${delta}` : `${delta}`;
    }

    if (pollIterationsVal) {
      pollIterationsVal.textContent = `${pollTicks} ticks`;
    }

    if (lastVerifiedVal) {
      const now = new Date();
      lastVerifiedVal.textContent = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }

    // Animate Number Change
    animateNumberChange(currentFollowerCount, newCount);
    currentFollowerCount = newCount;

    // Update Sparkline Chart History
    followerHistory.push(newCount);
    if (followerHistory.length > 20) {
      followerHistory.shift();
    }
    renderSparklineChart();
  }

  /**
   * Number Animation Transition
   */
  function animateNumberChange(startVal, endVal) {
    if (startVal === endVal && followerCountEl.textContent !== '0') {
      followerCountEl.textContent = formatNumber(endVal);
      return;
    }

    followerCountEl.classList.add('pulse-change');
    setTimeout(() => followerCountEl.classList.remove('pulse-change'), 300);

    const duration = 600;
    const startTime = performance.now();

    function step(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeProgress = progress * (2 - progress);
      const currentVal = Math.floor(startVal + (endVal - startVal) * easeProgress);

      followerCountEl.textContent = formatNumber(currentVal);

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        followerCountEl.textContent = formatNumber(endVal);
      }
    }

    requestAnimationFrame(step);
  }

  /**
   * Renders Interactive SVG Sparkline Trend Chart
   */
  function renderSparklineChart() {
    if (!followerHistory || followerHistory.length === 0) return;

    const width = 800;
    const height = 120;
    const padding = 20;

    const minVal = Math.min(...followerHistory) - 10;
    const maxVal = Math.max(...followerHistory) + 10;
    const valRange = maxVal - minVal || 1;

    const points = followerHistory.map((val, i) => {
      const x = (i / Math.max(followerHistory.length - 1, 1)) * (width - padding * 2) + padding;
      const y = height - padding - ((val - minVal) / valRange) * (height - padding * 2);
      return { x, y };
    });

    let pathD = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      pathD += ` L ${points[i].x} ${points[i].y}`;
    }

    const lastPoint = points[points.length - 1];
    const areaD = `${pathD} L ${lastPoint.x} ${height} L ${points[0].x} ${height} Z`;

    if (sparklinePath) sparklinePath.setAttribute('d', pathD);
    if (sparklineArea) sparklineArea.setAttribute('d', areaD);
    if (sparklineDot) {
      sparklineDot.setAttribute('cx', lastPoint.x);
      sparklineDot.setAttribute('cy', lastPoint.y);
    }
  }

  /**
   * Auto-Refresh Countdown Timer
   */
  function resetAutoRefreshCountdown() {
    stopAutoRefresh();
    countdownSeconds = refreshIntervalSeconds;
    updateTimerUI();

    if (document.visibilityState === 'visible' && !isPaused) {
      resumeAutoRefresh();
    }
  }

  function resumeAutoRefresh() {
    if (timerTicker) clearInterval(timerTicker);

    timerTicker = setInterval(() => {
      countdownSeconds -= 0.1;
      if (countdownSeconds <= 0) {
        clearInterval(timerTicker);
        if (currentTargetUrl && !isFetching && !isPaused) {
          fetchFollowerCount(currentTargetUrl, true);
        }
      } else {
        updateTimerUI();
      }
    }, 100);
  }

  function pauseAutoRefresh() {
    if (timerTicker) {
      clearInterval(timerTicker);
      timerTicker = null;
    }
  }

  function stopAutoRefresh() {
    pauseAutoRefresh();
    countdownSeconds = refreshIntervalSeconds;
    updateTimerUI();
  }

  function updateTimerUI() {
    if (countdownTimer) {
      countdownTimer.textContent = `${Math.max(0, countdownSeconds).toFixed(1)}s`;
    }
  }

  /**
   * Loading State Manager
   */
  function setLoadingState(isLoading) {
    submitBtn.disabled = isLoading;
    btnSpinner.style.display = isLoading ? 'inline-block' : 'none';
    btnText.textContent = isLoading ? 'Tracking...' : 'Track';
  }

  /**
   * Helper Functions
   */
  function showError(msg) {
    errorMessage.textContent = msg;
    errorBox.style.display = 'flex';
  }

  function hideError() {
    errorBox.style.display = 'none';
    errorMessage.textContent = '';
  }

  function formatNumber(num) {
    return new Intl.NumberFormat('en-US').format(num);
  }

  function getInitials(name) {
    if (!name) return 'T';
    const words = name.trim().split(/\s+/);
    if (words.length >= 2) {
      return (words[0][0] + words[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }
});




  const hamburgerBtn = document.getElementById('hamburgerBtn');
  const mobileNav = document.getElementById('mobileNav');
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



    try {
      document.querySelectorAll('.faq-item').forEach((item) => {
        const btn = item.querySelector('.faq-question');
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
  
  