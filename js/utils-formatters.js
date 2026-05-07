function formatTimeSmart(dateInput) {
    if (!dateInput) return "";

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
        return `${padZero(d.getDate())}/${padZero(d.getMonth() + 1)}/${d.getFullYear()} ${padZero(d.getHours())}:${padZero(d.getMinutes())}`;
    }
}

function parseSafeDate(dateStr) {
    if (typeof dateStr === 'string') {
        if (dateStr.includes('/')) {
            const parts = dateStr.split(' ');
            const dateParts = parts[0].split('/');
            if (dateParts.length === 3) {
                const day = dateParts[0].padStart(2, '0');
                const month = dateParts[1].padStart(2, '0');
                const year = dateParts[2];
                const timeStr = parts.length > 1 ? parts[1] : '00:00:00';
                return new Date(`${year}-${month}-${day}T${timeStr}`);
            }
        }
        if (dateStr.includes(' ') && !dateStr.includes('T')) {
            let parts = dateStr.split(' ');
            if (parts.length === 2) {
                return new Date(`${parts[0]}T${parts[1]}`);
            }
        }
    }
    return new Date(dateStr);
}

function padZero(num) {
    return num < 10 ? '0' + num : num.toString();
}

function debounce(func, wait) {
    let timeout;
    return function (...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}
