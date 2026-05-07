// --------------------------------------------------------------------------
// POST CONTENT FORMATTER — hashtags (#tag) and mentions (@user)
// Unicode flag 'u' enables \p{L}\p{N} to match Vietnamese and other scripts.
// --------------------------------------------------------------------------
function formatPostContent(text) {
    return escapeHtml(text)
        .replace(/#([\p{L}\p{N}_]+)/gu, '<a href="#" class="text-decoration-none theme-text-primary fw-semibold" onclick="filterByHashtag(\'#$1\'); return false;">#$1</a>')
        .replace(/@([\p{L}\p{N}_]+)/gu, '<a href="#" class="text-decoration-none theme-text-primary fw-semibold">@$1</a>');
}

function filterByHashtag(tag) {
    feedState.currentHashtag = tag;
    const indicator = document.getElementById('hashtagFilterIndicator');
    const label = document.getElementById('activeHashtag');
    if (indicator && label) {
        label.textContent = tag;
        indicator.classList.remove('d-none');
        indicator.classList.add('d-flex');
    }
    loadFeed(true);
}

function clearHashtagFilter() {
    feedState.currentHashtag = '';
    const indicator = document.getElementById('hashtagFilterIndicator');
    if (indicator) {
        indicator.classList.add('d-none');
        indicator.classList.remove('d-flex');
    }
    loadFeed(true);
}
