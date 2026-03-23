/**
 * utils.js
 * Contains shared utility functions, network helpers, and formatters for LoveStory.
 */

// API_URL được inject tự động bởi GitHub Actions từ secret API_URL
const API_URL = "https://script.google.com/macros/s/AKfycbyO-dyJRl41eNPTM_qWeS8jLxNtvh_HA3GyEfta_x2aTqN2qHyX7m0kVQhq3v4XJrS89A/exec";

/**
 * Enhanced fetch wrapper to communicate with Google Apps Script Backend.
 * @param {Object} payload - The JSON payload to send (must contain 'action').
 * @param {boolean} silent - If true, does not throw generic errors to the UI.
 * @returns {Promise<any>} - A promise resolving to the API response.
 */
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
            // In a real app, you might trigger a toast notification here
        }

        return data;
    } catch (error) {
        console.error("sendToServer Error:", error);
        if (!silent) {
            // showAlert("Không thể kết nối đến máy chủ. Vui lòng kiểm tra mạng.");
        }
        throw error;
    }
}

/**
 * Formats a Date object or ISO string into a relative "Smart Time" format.
 * (e.g., "Vừa xong", "5 phút trước", "Hôm qua", or Absolute date for > 7 days)
 * @param {string|Date} dateInput 
 * @returns {string} Formatted relative time
 */
function formatTimeSmart(dateInput) {
    if (!dateInput) return "";

    // Attempt robust parsing (Safari compatibility)
    let d = typeof dateInput === 'string' ? parseSafeDate(dateInput) : new Date(dateInput);

    if (isNaN(d.getTime())) return "Không rõ";

    const now = new Date();
    const diffMs = now - d;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) {
        return "Vừa xong";
    } else if (diffMin < 60) {
        return `${diffMin} phút trước`;
    } else if (diffHour < 24) {
        return `${diffHour} giờ trước`;
    } else if (diffDay === 1) {
        return `Hôm qua lúc ${padZero(d.getHours())}:${padZero(d.getMinutes())}`;
    } else if (diffDay > 1 && diffDay <= 7) {
        return `${diffDay} ngày trước`;
    } else {
        // Absolute formatting for older dates: DD/MM/YYYY HH:mm
        return `${padZero(d.getDate())}/${padZero(d.getMonth() + 1)}/${d.getFullYear()} ${padZero(d.getHours())}:${padZero(d.getMinutes())}`;
    }
}

/**
 * Safely parses a string into a Date object, handling Safari's strictness with ISO 8601
 * as well as custom format dd/MM/yyyy HH:mm:ss
 * @param {string} dateStr 
 */
function parseSafeDate(dateStr) {
    if (typeof dateStr === 'string') {
        // Handle "dd/MM/yyyy HH:mm:ss" format returned by GAS
        if (dateStr.includes('/')) {
            const parts = dateStr.split(' ');
            const dateParts = parts[0].split('/');
            if (dateParts.length === 3) {
                const day = dateParts[0].padStart(2, '0');
                const month = dateParts[1].padStart(2, '0');
                const year = dateParts[2];
                const timeStr = parts.length > 1 ? parts[1] : '00:00:00';

                // ISO format YYYY-MM-DDTHH:mm:ss
                return new Date(`${year}-${month}-${day}T${timeStr}`);
            }
        }

        // If it's something like "2023-10-25 14:30:00", replace space with 'T' for iOS/Safari
        if (dateStr.includes(' ') && !dateStr.includes('T')) {
            let parts = dateStr.split(' ');
            if (parts.length === 2) {
                return new Date(`${parts[0]}T${parts[1]}`);
            }
        }
    }
    return new Date(dateStr);
}

/**
 * Pads a number with a leading zero if it's less than 10.
 */
function padZero(num) {
    return num < 10 ? '0' + num : num.toString();
}

/**
 * Simple debounce function for optimizing scroll/resize handlers or API calls.
 */
function debounce(func, wait) {
    let timeout;
    return function (...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
}

/**
 * Wrapper for sleep/delay logic if needed.
 */
const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * Shows a Bootstrap modal confirmation dialog instead of native browser confirm().
 * @param {string} message - The message body to display.
 * @param {string} title - The title of the modal (default: 'Xác nhận').
 * @returns {Promise<boolean>} - Resolves true if user clicks Confirm, false if cancelled.
 */
function showConfirm(message, title = 'Xác nhận') {
    return new Promise(resolve => {
        const modalEl = document.getElementById('confirmModal');
        const titleEl = document.getElementById('confirmModalTitle');
        const bodyEl = document.getElementById('confirmModalBody');
        const confirmBtn = document.getElementById('btnConfirmAction');

        if (!modalEl || !confirmBtn) {
            // Fallback
            resolve(window.confirm(message));
            return;
        }

        if (titleEl) titleEl.textContent = title;
        if (bodyEl) bodyEl.textContent = message;

        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);

        // Remove old listener to prevent stacking
        const newBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);

        let resolved = false;
        const onConfirm = () => {
            resolved = true;
            modal.hide();
            resolve(true);
        };
        const onHide = () => {
            modalEl.removeEventListener('hidden.bs.modal', onHide);
            if (!resolved) resolve(false);
        };

        newBtn.addEventListener('click', onConfirm, { once: true });
        modalEl.addEventListener('hidden.bs.modal', onHide, { once: true });

        modal.show();
    });
}

/**
 * Shows a Bootstrap modal alert dialog instead of native browser alert().
 * @param {string} message - The message body to display.
 * @param {string} title - The title of the modal (default: 'Thông báo').
 * @returns {Promise<void>}
 */
function showAlert(message, title = 'Thông báo') {
    return new Promise(resolve => {
        const modalEl = document.getElementById('alertModal');
        const titleEl = document.getElementById('alertModalTitle');
        const bodyEl = document.getElementById('alertModalBody');

        if (!modalEl) {
            // Fallback
            window.alert(message);
            resolve();
            return;
        }

        if (titleEl) titleEl.textContent = title;
        if (bodyEl) bodyEl.textContent = message;

        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);

        const onHide = () => {
            modalEl.removeEventListener('hidden.bs.modal', onHide);
            resolve();
        };

        modalEl.addEventListener('hidden.bs.modal', onHide, { once: true });
        modal.show();
    });
}

/**
 * Converts a File object to a Base64 string (including data URL prefix).
 * @param {File} file 
 * @returns {Promise<string>}
 */
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

