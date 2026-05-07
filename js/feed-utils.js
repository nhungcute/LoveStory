function parseJSON(str, fallback) {
    try { return JSON.parse(str) || fallback; } catch { return fallback; }
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

async function compressImage(file, quality = 0.7, maxWidth = 1024) {
    return new Promise((resolve) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const scale = Math.min(1, maxWidth / img.width);
            canvas.width = img.width * scale;
            canvas.height = img.height * scale;
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(url);
            resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.src = url;
    });
}

// Periodic smart-time updates for post timestamps
setInterval(() => {
    document.querySelectorAll('.post-timestamp[data-timestamp]').forEach(el => {
        el.textContent = formatTimeSmart(el.dataset.timestamp);
    });
}, 60000);
