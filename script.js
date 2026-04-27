/**
 * script.js - Facebook Video Downloader
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

downloadForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const url = videoUrlInput.value.trim();

    if (!url) return;

    if (!url.includes("facebook.com") && !url.includes("fb.watch")) {
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
        showError("An error occurred. Please try again later.");
    } finally {
        setLoading(false);
    }
});

function setLoading(isLoading) {
    if (isLoading) {
        submitBtn.disabled = true;
        btnText.classList.add("hidden");
        btnLoader.classList.remove("hidden");
    } else {
        submitBtn.disabled = false;
        btnText.classList.remove("hidden");
        btnLoader.classList.add("hidden");
    }
}

function showError(message) {
    errorText.textContent = message;
    errorMessage.classList.remove("hidden");
}

function hideError() {
    errorMessage.classList.add("hidden");
}

function showResult(hd, sd) {
    const previewUrl = hd || sd;
    if (previewUrl) {
        videoSource.src = previewUrl;
        videoPreview.load();
        resultSection.classList.remove("hidden");
        
        if (hd) {
            hdDownload.href = getDownloadUrl(hd);
            hdDownload.classList.remove("hidden");
        } else {
            hdDownload.classList.add("hidden");
        }

        if (sd) {
            sdDownload.href = getDownloadUrl(sd);
            sdDownload.classList.remove("hidden");
        } else {
            sdDownload.classList.add("hidden");
        }
    } else {
        showError("No video source found.");
    }
}

function hideResult() {
    resultSection.classList.add("hidden");
    videoSource.src = "";
    videoPreview.pause();
}

function getDownloadUrl(videoUrl) {
    return `${WORKER_URL}/download?url=${encodeURIComponent(videoUrl)}`;
}
