/**
 * theme-preferences.js
 * Device fingerprint identity, user preferences (localStorage), and theme application.
 */

// --------------------------------------------------------------------------
// DEVICE IDENTITY & FINGERPRINTING
// --------------------------------------------------------------------------
async function initDeviceIdentity() {
    let fp = localStorage.getItem('ls_device_fp');
    if (!fp) {
        const payload = navigator.userAgent + screen.width + screen.height + navigator.language;
        fp = await sha256(payload);
        localStorage.setItem('ls_device_fp', fp);
    }
    state.deviceFingerprint = fp;
    console.log("Device FP:", fp.substring(0, 8) + '...');
}

async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// --------------------------------------------------------------------------
// USER PREFERENCES
// --------------------------------------------------------------------------
function loadUserPreferences() {
    const savedProfile = localStorage.getItem('ls_profile_data');
    if (savedProfile) {
        try { state.profile = { ...state.profile, ...JSON.parse(savedProfile) }; }
        catch (e) { console.error("Failed to parse local profile:", e); }
    }
}

function saveUserPreferences() {
    localStorage.setItem('ls_profile_data', JSON.stringify(state.profile));
}

// --------------------------------------------------------------------------
// THEMING
// --------------------------------------------------------------------------
function applyTheme(themeName) {
    const root = document.documentElement;
    const themes = {
        // Bảng màu đơn
        'green':        { primary: '#006B68', secondary: '#00524e', accent: '#FFC62F' },
        'purple':       { primary: '#605DEC', secondary: '#4c49cc', accent: '#FFC62F' },
        'blue':         { primary: '#2D9CDB', secondary: '#2486c0', accent: '#FFC62F' },
        'red':          { primary: '#EB5757', secondary: '#d34343', accent: '#FFC62F' },
        'orange':       { primary: '#F2994A', secondary: '#d17e33', accent: '#FFC62F' },
        'pink':         { primary: '#E74C3C', secondary: '#c0392b', accent: '#FFC62F' },
        // Cặp màu
        'teal-rose':    { primary: '#006B68', secondary: '#00524e', accent: '#E91E63' },
        'navy-amber':   { primary: '#1565C0', secondary: '#0d47a1', accent: '#FF8F00' },
        'purple-mint':  { primary: '#6A1B9A', secondary: '#4a148c', accent: '#00BFA5' },
        'slate-coral':  { primary: '#455A64', secondary: '#37474F', accent: '#FF5722' },
        'forest-peach': { primary: '#2E7D32', secondary: '#1b5e20', accent: '#FF7043' },
    };
    const colorSet = themes[themeName] || themes['green'];
    root.style.setProperty('--theme-primary', colorSet.primary);
    root.style.setProperty('--theme-secondary', colorSet.secondary);
    root.style.setProperty('--theme-accent', colorSet.accent);
    document.querySelector("meta[name=theme-color]")?.setAttribute("content", colorSet.primary);
    state.profile.theme = themeName;
}

function updateProfileUI() {
    const avatar = document.getElementById('topAvatar');
    const feedAva = document.getElementById('feedAva');
    const src = state.profile.avaUrl
        ? state.profile.avaUrl
        : getDefaultAvatar(state.profile.fullname);
    if (avatar) avatar.src = src;
    if (feedAva) feedAva.src = src;
}
