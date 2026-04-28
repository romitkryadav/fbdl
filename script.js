/**
 * script.js - FBviddl
 * Logic for handling form submission, API calls, and result display.
 */

const WORKER_URL = "https://x.romitkr361.workers.dev";

const downloadForm = document.getElementById("downloadForm");
const videoUrlInput = document.getElementById("videoUrl");
const submitBtn = document.getElementById("submitBtn");
const btnText = document.getElementById("btnText");
const btnLoader = document.getElementById("btnLoader");
const errorMessage = document.getElementById("errorMessage");
const errorText = document.getElementById("errorText");
const resultSection = document.getElementById("resultSection");
const videoPreview = document.getElementById("videoPreview");
const videoSource = document.getElementById("videoSource");
const hdDownload = document.getElementById("hdDownload");
const sdDownload = document.getElementById("sdDownload");

if (downloadForm) {
    downloadForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!videoUrlInput) return;
        
        const url = videoUrlInput.value.trim();

        if (!url) return;

        if (!url.includes("facebook.com") && !url.includes("fb.watch") && !url.includes("fb.gg")) {
            showError("Please enter a valid Facebook video URL.");
            return;
        }

        setLoading(true);
        hideError();
        hideResult();

        try {
            const response = await fetch(`${WORKER_URL}/?url=${encodeURIComponent(url)}`);
            const data = await response.json();

            if (data.success) {
                showResult(data.hd, data.sd);
            } else {
                showError(data.error || "Failed to extract video. Please check the URL.");
            }
        } catch (err) {
            console.error("Fetch error:", err);
            showError("An error occurred. Please try again later.");
        } finally {
            setLoading(false);
        }
    });
}

function setLoading(isLoading) {
    if (!submitBtn) return;
    
    if (isLoading) {
        submitBtn.disabled = true;
        if (btnText) btnText.classList.add("hidden");
        if (btnLoader) btnLoader.classList.remove("hidden");
    } else {
        submitBtn.disabled = false;
        if (btnText) btnText.classList.remove("hidden");
        if (btnLoader) btnLoader.classList.add("hidden");
    }
}

function showError(message) {
    if (!errorText || !errorMessage) return;
    errorText.textContent = message;
    errorMessage.classList.remove("hidden");
}

function hideError() {
    if (errorMessage) errorMessage.classList.add("hidden");
}

function showResult(hd, sd) {
    if (!videoPreview || !resultSection) return;
    
    const rawUrl = hd || sd;
    if (rawUrl) {
        // Use proxy URL for preview to avoid CORS issues
        const previewUrl = getDownloadUrl(rawUrl);
        
        try {
            // Clear previous source to prevent issues
            videoPreview.pause();
            videoPreview.src = "";
            videoPreview.load();

            // Set new source
            videoPreview.src = previewUrl;
            videoPreview.load();
            
            resultSection.classList.remove("hidden");
            
            // Add error handling for video preview
            videoPreview.onerror = () => {
                console.error("Video preview failed to load via proxy.");
                // If proxy fails and we haven't tried the raw URL yet, try it as fallback
                if (videoPreview.src !== rawUrl) {
                    console.log("Attempting fallback to raw URL...");
                    videoPreview.src = rawUrl;
                    videoPreview.load();
                } else {
                    showError("The video preview could not be loaded, but you can still try the download buttons below.");
                }
            };
        } catch (e) {
            console.error("Video preview error:", e);
            resultSection.classList.remove("hidden");
        }

        if (hdDownload) {
            if (hd) {
                hdDownload.href = getDownloadUrl(hd);
                hdDownload.classList.remove("hidden");
            } else {
                hdDownload.classList.add("hidden");
            }
        }

        if (sdDownload) {
            if (sd) {
                sdDownload.href = getDownloadUrl(sd);
                sdDownload.classList.remove("hidden");
            } else {
                sdDownload.classList.add("hidden");
            }
        }
    } else {
        showError("No video source found.");
    }
}

function hideResult() {
    if (resultSection) resultSection.classList.add("hidden");
    if (videoPreview) {
        videoPreview.pause();
        videoPreview.src = "";
    }
}

function getDownloadUrl(videoUrl) {
    return `${WORKER_URL}/download?url=${encodeURIComponent(videoUrl)}`;
}
