// ========================================
// VIDEO WORKERS
// ========================================
const VIDEO_WORKERS = [
  "https://fbvi.contact-themistero.workers.dev",
  "https://fbvi2.romitkryadav5539.workers.dev",
  "https://fbvi3.romitkr3018.workers.dev",
  "https://fbvi4.romitkr1815130920.workers.dev",
  "https://fbvi5.romityadav5539.workers.dev",
  "https://fbvi6.r18151309.workers.dev"
];

// ========================================
// DP WORKERS
// ========================================
const DP_WORKERS = [
  "https://fbdp.romitkryadav.workers.dev"
];

// ========================================
// ELEMENTS
// ========================================
const downloadForm = document.getElementById("downloadForm");
const videoUrlInput = document.getElementById("videoUrl");

const submitBtn = document.getElementById("submitBtn");
const btnText = document.getElementById("btnText");
const btnLoader = document.getElementById("btnLoader");
const loadingBox = document.getElementById("loadingBox");

const errorMessage = document.getElementById("errorMessage");
const errorText = document.getElementById("errorText");

const resultSection = document.getElementById("resultSection");

const videoPreview = document.getElementById("videoPreview");
const videoSource = document.getElementById("videoSource");

const hdDownload = document.getElementById("hdDownload");
const sdDownload = document.getElementById("sdDownload");
const scrollNotification = document.getElementById("scrollNotification");
const scrollToTopBtn = document.getElementById("scrollToTop");
const scrollToUpdatesBtn = document.getElementById("scrollToUpdates");
const scrollToUpdatesTopBtn = document.getElementById("scrollToUpdatesTop");


// ========================================
// VIDEO FETCH
// ========================================
async function fetchVideo(videoUrl) {

  let error = "All workers failed.";

  for (const worker of VIDEO_WORKERS) {

    try {

      const response = await fetch(
        `${worker}/video?url=${encodeURIComponent(videoUrl)}`
      );

      if (!response.ok) continue;

      const data = await response.json();

      console.log("VIDEO:", data);

      if (data.success && (data.hd || data.sd)) {

        return {
          ...data,
          workerUsed: worker
        };
      }

      error = data.error || error;

    } catch (e) {

      console.log(e);

      error = e.message;
    }
  }

  throw new Error(error);
}

// ========================================
// DP FETCH
// ========================================
async function fetchDP(profileUrl) {

  let error = "All workers failed.";

  for (const worker of DP_WORKERS) {

    try {

      const response = await fetch(
        `${worker}/dp?url=${encodeURIComponent(profileUrl)}`
      );

      if (!response.ok) continue;

      const data = await response.json();

      console.log("DP:", data);

      if (data.success && data.imageUrl) {

        return {
          ...data,
          workerUsed: worker
        };
      }

      error = data.error || error;

    } catch (e) {

      console.log(e);

      error = e.message;
    }
  }

  throw new Error(error);
}

// ========================================
// LOADING
// ========================================
function setLoading(state) {
  if (!submitBtn) return;
  if (state) {

    submitBtn.disabled = true;
    submitBtn.classList.add("loading");
    submitBtn.setAttribute("aria-busy", "true");

    if (btnText) btnText.classList.add("hidden");

    if (loadingBox) {
      loadingBox.hidden = false;
      loadingBox.classList.add("active");
    }

  } else {

    submitBtn.disabled = false;
    submitBtn.classList.remove("loading");
    submitBtn.removeAttribute("aria-busy");

    if (btnText) btnText.classList.remove("hidden");

    if (loadingBox) {
      loadingBox.hidden = true;
      loadingBox.classList.remove("active");
    }
  }
}

// ========================================
// ERROR
// ========================================
function showError(message) {
  if (!errorText || !errorMessage) return;
  errorText.textContent = message;

  errorMessage.classList.remove("hidden");
  errorMessage.removeAttribute("hidden");
}

function hideError() {
  if (!errorMessage) return;
  errorMessage.classList.add("hidden");
  errorMessage.hidden = true;
}

// ========================================
// RESULT
// ========================================
function hideResult() {
  if (!resultSection) return;

  resultSection.classList.add("hidden");
  resultSection.classList.remove("active");
  resultSection.hidden = true;

  if (videoSource) videoSource.src = "";
  if (videoPreview) videoPreview.pause();
  if (hdDownload) hdDownload.href = "#";
  if (sdDownload) sdDownload.href = "#";
}

function showResult(hd, sd, worker) {

  const video = hd || sd;

  if (!video) {

    showError("No video found.");

    return;
  }

  videoSource.src = video;

  videoPreview.load();

  resultSection.classList.remove("hidden");
  resultSection.classList.add("active");
  resultSection.removeAttribute("hidden");

  // HD
  if (hd) {

    hdDownload.href = hd;
    hdDownload.dataset.url = hd;
    hdDownload.classList.remove("hidden");

  } else {

    hdDownload.classList.add("hidden");
  }

  // SD
  if (sd) {

    sdDownload.href = sd;
    sdDownload.dataset.url = sd;
    sdDownload.classList.remove("hidden");

  } else {

    sdDownload.classList.add("hidden");
  }
}

// ========================================
// DIRECT DOWNLOAD HANDLERS
// ========================================
async function downloadVideo(url, filename) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(blobUrl);
  } catch (error) {
    console.error('Download failed:', error);
    // Fallback: open in new tab
    window.open(url, '_blank');
  }
}

if (hdDownload) {
  hdDownload.addEventListener('click', async (e) => {
    e.preventDefault();
    const url = hdDownload.dataset.url;
    if (url) {
      await downloadVideo(url, 'facebook-video-hd.mp4');
    }
  });
}

if (sdDownload) {
  sdDownload.addEventListener('click', async (e) => {
    e.preventDefault();
    const url = sdDownload.dataset.url;
    if (url) {
      await downloadVideo(url, 'facebook-video-sd.mp4');
    }
  });
}

// ========================================
// VIDEO ERROR HANDLER
// ========================================
if (videoPreview) {
  videoPreview.addEventListener("error", (e) => {
    console.log("Video load error:", e);
    showError("Failed to load video preview. You can still try downloading.");
  });
}

// ========================================
// SCROLL NOTIFICATION
// ========================================
function handleScroll() {
  if (!scrollNotification) return;
  if (window.scrollY > 300) {
    scrollNotification.classList.remove("hidden");
  } else {
    scrollNotification.classList.add("hidden");
  }
}

function scrollToTop() {
  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

window.addEventListener("scroll", handleScroll);

if (scrollToTopBtn) {
  scrollToTopBtn.addEventListener("click", scrollToTop);
}

// ========================================
// SCROLL TO UPDATES
// ========================================
function scrollToUpdates() {
  const updatesSection = document.querySelector("section:nth-of-type(2)");
  updatesSection.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

if (scrollToUpdatesBtn) {
  scrollToUpdatesBtn.addEventListener("click", scrollToUpdates);
}
if (scrollToUpdatesTopBtn) {
  scrollToUpdatesTopBtn.addEventListener("click", scrollToUpdates);
}



// ========================================
// VIDEO FORM
// ========================================
if (downloadForm) {
  downloadForm.addEventListener("submit", async (e) => {

    e.preventDefault();

    const url = videoUrlInput ? videoUrlInput.value.trim() : "";

    if (!url) return;

    if (
      !url.includes("facebook.com") &&
      !url.includes("fb.watch")
    ) {

      showError("Please enter valid Facebook URL.");

      return;
    }

    setLoading(true);

    hideError();

    hideResult();

    try {

      const data = await fetchVideo(url);

      console.log(data);

      showResult(
        data.hd,
        data.sd,
        data.workerUsed
      );

    } catch (e) {

      console.log(e);

      hideResult();

      showError(
        e.message || "All workers failed."
      );

    } finally {

      setLoading(false);
    }
  });
}