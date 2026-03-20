/**
 * profile.js
 * Profile Modal logic: Theme switching, Avatar, Developer Tools toggle.
 */

function renderProfileModal() {
    const p = state.profile;
    document.getElementById('profileUsernameInput').value = p.username === 'Guest' ? '' : p.username;
    document.getElementById('profileFullnameInput').value = p.fullname === 'Guest' ? '' : p.fullname;
    document.getElementById('profileCurrentAvatar').src = p.avaUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(p.fullname)}&background=FFC62F&color=006B68&bold=true`;
    
    const statusEl = document.getElementById('usernameValidationStatus');
    if (statusEl) statusEl.innerHTML = '';
    
    document.getElementById('toggleWidgetPregnancy').checked = p.widgetPregnancy !== false;
    document.getElementById('toggleWidgetKick').checked = p.widgetKick !== false;
    document.getElementById('toggleWidgetGold').checked = p.widgetGold !== false;
    document.getElementById('toggleDevTools').checked = p.devTools === true;

    // Highlight active theme
    document.querySelectorAll('.theme-selector').forEach(btn => {
        btn.classList.toggle('ring-active', btn.dataset.theme === p.theme);
    });
}

async function validateUsername() {
    const inputEl = document.getElementById('profileUsernameInput');
    const inputUsername = inputEl.value.trim();
    const statusEl = document.getElementById('usernameValidationStatus');
    
    if (!inputUsername || inputUsername.toLowerCase() === 'guest' || inputUsername === state.profile.username) {
        if (statusEl) statusEl.innerHTML = '';
        return;
    }
    
    if (statusEl) statusEl.innerHTML = '<span class="spinner-border spinner-border-sm text-primary" style="width: 12px; height: 12px;"></span> <span class="small text-muted">Đang tìm dữ liệu...</span>';
    inputEl.disabled = true;
    
    try {
        const check = await sendToServer({ action: 'get_profile_by_username', username: inputUsername }, true);
        if (check.status === 'success') {
            // Auto-fill existing info
            document.getElementById('profileFullnameInput').value = check.data.fullname || '';
            const newAva = check.data.avaurl || `https://ui-avatars.com/api/?name=${encodeURIComponent(check.data.fullname)}&background=FFC62F&color=006B68&bold=true`;
            document.getElementById('profileCurrentAvatar').src = newAva;
            state.profile.avaUrl = check.data.avaurl || ''; // Store temp
            selectTheme(check.data.theme || 'green');
            
            if(statusEl) statusEl.innerHTML = '<i class="bi bi-check-circle-fill text-success"></i> <span class="small text-success">Đã điền tự động dữ liệu cũ.</span>';
        } else {
            if(statusEl) statusEl.innerHTML = '<i class="bi bi-person-plus-fill text-primary"></i> <span class="small text-primary">Username có thể tạo mới.</span>';
        }
    } catch(e) {
        if(statusEl) statusEl.innerHTML = '<i class="bi bi-exclamation-circle-fill text-danger"></i> <span class="small text-danger">Lỗi kết nối.</span>';
    } finally {
        inputEl.disabled = false;
        // Optional: inputEl.focus(); might be annoying if they tried to click to the fullname field
    }
}

async function saveProfile() {
    const btn = document.getElementById('btnSaveProfile');
    const ogHtml = btn.innerHTML;

    try {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Lên đĩa...';

        const inputUsername = document.getElementById('profileUsernameInput').value.trim();
        const inputFullname = document.getElementById('profileFullnameInput').value.trim();

        const widgetPregnancy = document.getElementById('toggleWidgetPregnancy').checked;
        const widgetKick = document.getElementById('toggleWidgetKick').checked;
        const widgetGold = document.getElementById('toggleWidgetGold').checked;
        const devToolsOn = document.getElementById('toggleDevTools').checked;

        state.profile.username = (inputUsername && inputUsername.toLowerCase() !== 'guest') ? inputUsername : 'Guest';
        state.profile.fullname = inputFullname || (state.profile.username === 'Guest' ? 'Guest' : state.profile.username);

        state.profile.widgetPregnancy = widgetPregnancy;
        state.profile.widgetKick = widgetKick;
        state.profile.widgetGold = widgetGold;
        
        if(state.profile.devTools !== devToolsOn) {
            state.profile.devTools = devToolsOn;
            if(devToolsOn && typeof toggleEruda === 'function') toggleEruda(true);
            else if (!devToolsOn) showAlert("Vui lòng tải lại trang để tắt Developer Tools.");
        }

        saveUserPreferences();
        if (typeof updateProfileUI === 'function') updateProfileUI(); 
        if (state.currentTab === 'tabHome' && typeof renderHomeWidgets === 'function') renderHomeWidgets();
        
        // Cập nhật lên server ngầm (không bắt người dùng chờ)
        if (state.profile.username !== 'Guest') {
            sendToServer({ action: 'save_profile', username: state.profile.username, deviceFingerprint: state.deviceFingerprint, profile: state.profile }, "silent").catch(console.error);
        }

        let modal = bootstrap.Modal.getInstance(document.getElementById('profileModal'));
        if(modal) modal.hide();

    } catch(e) {
        console.error("Save profile error", e);
        showAlert("Lỗi khi lưu profile: " + e.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = ogHtml;
    }
}

function selectTheme(themeStr) {
    applyTheme(themeStr);
    state.profile.theme = themeStr;
    saveUserPreferences();
    document.querySelectorAll('.theme-selector').forEach(btn => {
        btn.classList.toggle('ring-active', btn.dataset.theme === themeStr);
    });
}

// Avatar upload
document.getElementById('profileAvatarInput')?.addEventListener('change', async function(e) {
    if(!this.files || this.files.length === 0) return;
    const p = document.getElementById('profileCurrentAvatar');
    const oldSrc = p.src;
    p.src = 'https://i.gifer.com/ZKZg.gif'; // Loading gif
    
    try {
        const b64 = await fileToBase64(this.files[0]);
        // Upload high quality since it compress heavily
        const compressed = await compressImage(this.files[0], 0.8, 300);
        const res = await sendToServer({action: 'upload_single_image', image: compressed, name: 'avatar.jpg'});
        if(res.url) {
            state.profile.avaUrl = res.url;
            p.src = res.url;
            saveUserPreferences();
        } else { p.src = oldSrc; }
    } catch(err) {
        p.src = oldSrc;
        showAlert("Upload Avatar thất bại");
    }
});
