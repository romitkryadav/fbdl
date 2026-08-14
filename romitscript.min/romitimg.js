document.addEventListener("DOMContentLoaded", () => {
    const fbUrlInput = document.getElementById("fbUrlInput");
    const downloadForm = document.getElementById("downloadForm");
    const submitBtn = document.getElementById("submitBtn");
    const btnText = document.getElementById("btnText");
    const btnLoader = document.getElementById("btnLoader");
    const loadingBox = document.getElementById("loadingBox");
    const errorMessage = document.getElementById("errorMessage");
    const errorText = document.getElementById("errorText");
    const resultSection = document.getElementById("resultSection");
    const imageResults = document.getElementById("imageResults");
    const apiBase = "https://fbimg.romitkryadav.workers.dev/api";

    function triggerHiddenIframeDownload(url) {
        let iframe = document.getElementById('__dlIframe');
        if (!iframe) {
            iframe = document.createElement('iframe');
            iframe.id = '__dlIframe';
            iframe.style.display = 'none';
            iframe.style.width = '0';
            iframe.style.height = '0';
            iframe.style.border = '0';
            iframe.setAttribute('sandbox', 'allow-downloads allow-same-origin allow-scripts');
            document.body.appendChild(iframe);
        }
        iframe.src = url;
    }

    function isValidFacebookUrl(url) {
        try {
            if (!url.trim()) return false;
            const parsedUrl = new URL(url.trim());
            const hostname = parsedUrl.hostname.toLowerCase();
            return hostname.includes("facebook.com") || hostname.includes("fb.com") || hostname.includes("fb.watch") || hostname.includes("mbasic.facebook.com");
        } catch (err) {
            return false;
        }
    }

    function showError(message) {
        if (errorText) errorText.textContent = message;
        if (errorMessage) {
            errorMessage.classList.remove("hidden");
            errorMessage.classList.add("active");
        }
        if (resultSection) {
            resultSection.classList.add("hidden");
            resultSection.classList.remove("active");
        }
    }

    function hideError() {
        if (errorMessage) {
            errorMessage.classList.add("hidden");
            errorMessage.classList.remove("active");
        }
    }

    async function downloadImage(imgUrl, index, btn) {
        const filename = `facebook-image-${index + 1}-${Date.now()}.jpg`;
        const proxyUrl = `${apiBase.replace(/\/api$/, '')}/download?url=${encodeURIComponent(imgUrl)}&filename=${encodeURIComponent(filename)}&att=1`;
        const origHtml = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>Saving...';
        }

        let ok = false;
        try {
            try {
                const r = await fetch(proxyUrl, { credentials: 'omit' });
                if (r.ok) {
                    const blob = await r.blob();
                    if (blob && blob.size > 0) {
                        const blobUrl = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = blobUrl;
                        a.download = filename;
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                        setTimeout(() => window.URL.revokeObjectURL(blobUrl), 2500);
                        ok = true;
                    }
                }
            } catch (_) {}

            if (!ok) {
                try {
                    const r2 = await fetch(imgUrl, { referrerPolicy: "no-referrer", mode: 'cors' });
                    if (r2.ok) {
                        const blob = await r2.blob();
                        if (blob && blob.size > 0) {
                            const blobUrl = window.URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = blobUrl;
                            a.download = filename;
                            document.body.appendChild(a);
                            a.click();
                            a.remove();
                            setTimeout(() => window.URL.revokeObjectURL(blobUrl), 2500);
                            ok = true;
                        }
                    }
                } catch (_) {}
            }

            if (!ok) triggerHiddenIframeDownload(proxyUrl);
        } catch (err) {
            console.error("Download failed:", err);
            triggerHiddenIframeDownload(proxyUrl);
        } finally {
            if (btn) setTimeout(() => {
                btn.disabled = false;
                btn.innerHTML = origHtml;
            }, 1800);
        }
    }

    if (downloadForm && fbUrlInput) {
        downloadForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            hideError();
            const url = fbUrlInput.value.trim();

            if (!url) {
                showError("Please enter a Facebook image or post URL first.");
                return;
            }

            if (!isValidFacebookUrl(url)) {
                showError("The link you entered is not a valid Facebook URL. Please check the URL and try again.");
                return;
            }

            if (fbUrlInput) fbUrlInput.disabled = true;
            if (submitBtn) submitBtn.disabled = true;
            if (btnText) btnText.textContent = "Loading...";
            if (btnLoader) btnLoader.classList.remove("hidden");
            if (loadingBox) {
              loadingBox.hidden = false;
              loadingBox.classList.remove('hidden');
              loadingBox.classList.add('active');
            }
            if (resultSection) {
                resultSection.classList.add("hidden");
                resultSection.classList.remove("active");
            }
            if (imageResults) imageResults.innerHTML = "";

            try {
                const apiUrl = `${apiBase}?url=${encodeURIComponent(url)}`;
                const response = await fetch(apiUrl);

                if (!response.ok) {
                    throw Error(`Server responded with status code: ${response.status}`);
                }

                const data = await response.json();

                if (data.success && data.images && data.images.length > 0) {
                    data.images.forEach((img, index) => {
                        const imgCard = document.createElement("div");
                        imgCard.className = "image-card";

                        imgCard.innerHTML = `
                            <img src="${img.url}" alt="Facebook Image ${index + 1}" referrerPolicy="no-referrer" loading="lazy">
                            <button data-url="${img.url}" class="download-img-btn">
                                <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                                </svg>
                                Download HD
                            </button>
                        `;
                        if (imageResults) imageResults.appendChild(imgCard);

                        const downloadBtn = imgCard.querySelector(".download-img-btn");
                        if (downloadBtn) {
                            downloadBtn.addEventListener("click", () => downloadImage(img.url, index, downloadBtn));
                        }
                    });

                    if (resultSection) {
                        resultSection.classList.remove("hidden");
                        resultSection.classList.add("active");
                    }
                } else {
                    const errMsg = data.message || "Failed to retrieve images. Ensure the post is not private.";
                    showError(errMsg);
                }
            } catch (err) {
                console.error("Fetch API error details:", err);
                showError("Unable to fetch this link. Ensure it is a public Facebook photo link, post, profile, or search result.");
            } finally {
                if (fbUrlInput) fbUrlInput.disabled = false;
                if (submitBtn) submitBtn.disabled = false;
                if (btnText) btnText.textContent = "Download Images";
                if (btnLoader) btnLoader.classList.add("hidden");
                if (loadingBox) {
                  loadingBox.hidden = true;
                  loadingBox.classList.add('hidden');
                  loadingBox.classList.remove('active');
                }
            }
        });
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

    document.querySelectorAll('.faq-item').forEach(item => {
      const q = item.querySelector('.faq-question');
      const a = item.querySelector('.faq-answer');
      if (!q || !a) return;
      q.addEventListener('click', () => {
        const isOpen = item.classList.contains('active');
        document.querySelectorAll('.faq-item.active').forEach(openItem => {
          if (openItem !== item) {
            openItem.classList.remove('active');
            const oq = openItem.querySelector('.faq-question');
            const oa = openItem.querySelector('.faq-answer');
            if (oq) oq.setAttribute('aria-expanded', 'false');
            if (oa) oa.setAttribute('hidden', '');
          }
        });
        if (isOpen) {
          item.classList.remove('active');
          q.setAttribute('aria-expanded', 'false');
          a.setAttribute('hidden', '');
        } else {
          item.classList.add('active');
          q.setAttribute('aria-expanded', 'true');
          a.removeAttribute('hidden');
        }
      });
    });
  
