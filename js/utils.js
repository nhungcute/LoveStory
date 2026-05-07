// API_URL được inject tự động bởi GitHub Actions từ secret API_URL
const API_URL = "https://script.google.com/macros/s/AKfycbyO-dyJRl41eNPTM_qWeS8jLxNtvh_HA3GyEfta_x2aTqN2qHyX7m0kVQhq3v4XJrS89A/exec";

async function sendToServer(payload, silent = false) {
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify(payload),
            headers: {
                'Content-Type': 'text/plain;charset=utf-8',
                // Using text/plain avoids CORS preflight OPTIONS request overhead in GAS
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (data.status === 'error' && !silent) {
            console.error("API Error:", data.message);
        }

        return data;
    } catch (error) {
        console.error("sendToServer Error:", error);
        throw error;
    }
}

function getDefaultAvatar(name) {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'U')}&background=FFC62F&color=006B68&bold=true`;
}

function renderErrorState(message, retryCallback = '') {
    return `<div class="text-center py-5 text-muted">
        <i class="bi bi-wifi-off fs-1 d-block mb-2"></i>${message}
        ${retryCallback ? `<br><button class="btn btn-sm btn-outline-secondary mt-2" onclick="${retryCallback}">Thử lại</button>` : ''}
    </div>`;
}
