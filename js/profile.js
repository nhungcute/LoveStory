/**
 * profile.js
 * Profile Modal logic: Theme switching, Avatar, Developer Tools toggle.
 */

function renderProfileModal() {
    const p = state.profile;
    document.getElementById('profileUsernameInput').value = p.username === 'Guest' ? '' : p.username;
    document.getElementById('profileFullnameInput').value = p.fullname === 'Guest' ? '' : p.fullname;
    document.getElementById('profileCurrentAvatar').src = p.avaUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(p.fullname)}&background=FFC62F&color=006B68&bold=true`;
    
    document.getElementById('toggleWidgetPregnancy').checked = p.widgetPregnancy !== false;
    document.getElementById('toggleWidgetKick').checked = p.widgetKick !== false;
    document.getElementById('toggleWidgetGold').checked = p.widgetGold !== false;
    document.getElementById('toggleDevTools').checked = p.devTools === true;

    // Highlight active theme
    document.querySelectorAll('.theme-selector').forEach(btn => {
        btn.classList.toggle('ring-active', btn.dataset.theme === p.theme);
    });
}

async function saveProfile() {
    const btn = document.getElementById('btnSaveProfile');
    const ogHtml = btn.innerHTML;

    try {
        const inputUsername = document.getElementById('profileUsernameInput').value.trim();
        const inputFullname = document.getElementById('profileFullnameInput').value.trim();
        const currentUsername = state.profile.username;

        const widgetPregnancy = document.getElementById('toggleWidgetPregnancy').checked;
        const widgetKick = document.getElementById('toggleWidgetKick').checked;
        const widgetGold = document.getElementById('toggleWidgetGold').checked;
        const devToolsOn = document.getElementById('toggleDevTools').checked;

        const applyToUI = () => {
            state.profile.widgetPregnancy = widgetPregnancy;
            state.profile.widgetKick = widgetKick;
            state.profile.widgetGold = widgetGold;
            
            if(state.profile.devTools !== devToolsOn) {
                state.profile.devTools = devToolsOn;
                if(devToolsOn && typeof toggleEruda === 'function') toggleEruda(true);
                else if (!devToolsOn) alert("Vui lòng tải lại trang để tắt Developer Tools.");
            }

            saveUserPreferences();
            if (typeof updateProfileUI === 'function') updateProfileUI(); 
            if (state.currentTab === 'tabHome' && typeof renderHomeWidgets === 'function') renderHomeWidgets();
            
            renderProfileModal();
            let modal = bootstrap.Modal.getInstance(document.getElementById('profileModal'));
            if(modal) modal.hide();
        };

        if (inputUsername && inputUsername !== 'Guest') {
            if (currentUsername !== inputUsername) {
                // Different username -> Login / Check Server -> BLOCKING WAIT
                btn.disabled = true;
                btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
                
                const check = await sendToServer({ action: 'get_profile_by_username', username: inputUsername }, true);
                if (check.status === 'success') {
                    state.profile.username = check.data.username;
                    state.profile.fullname = check.data.fullname;
                    state.profile.theme = check.data.theme;
                    state.profile.avaUrl = check.data.avaurl;
                    if(state.profile.theme) applyTheme(state.profile.theme);
                    alert(`Đã tải dữ liệu thành công cho tài khoản: ${check.data.fullname}`);
                } else {
                    state.profile.username = inputUsername;
                    state.profile.fullname = inputFullname || inputUsername;
                    // Async without await for creating
                    sendToServer({ action: 'save_profile', username: inputUsername, deviceFingerprint: state.deviceFingerprint, profile: state.profile }, "silent").catch(console.error);
                }
                applyToUI();
                btn.disabled = false;
                btn.innerHTML = ogHtml;
                return;
            } else {
                // Same username -> Update -> OPTIMISTIC
                state.profile.fullname = inputFullname || inputUsername;
                applyToUI(); 
                
                // Async without await
                sendToServer({ action: 'save_profile', username: inputUsername, deviceFingerprint: state.deviceFingerprint, profile: state.profile }, "silent").catch(console.error);
                return;
            }
        } else {
            // Guest mode -> OPTIMISTIC
            state.profile.username = 'Guest';
            state.profile.fullname = inputFullname || 'Guest';
            applyToUI();
            return;
        }

    } catch(e) {
        console.error("Save profile error", e);
        alert("Lỗi khi lưu profile: " + e.message);
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
        alert("Upload Avatar thất bại");
    }
});
