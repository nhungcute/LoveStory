const chatState = {
    history: [],
    isTyping: false
};

let mentionStartIndex = -1;

function handleChatInput(event) {
    const input = event.target;
    const text = input.value;
    const cursor = input.selectionStart;

    const textBeforeCursor = text.substring(0, cursor);
    const match = textBeforeCursor.match(/(?:\s|^)(@[^\s]*)$/);

    if (match) {
        const fullKeyword = match[1];
        const query = fullKeyword.substring(1);

        mentionStartIndex = match.index;
        if (textBeforeCursor[mentionStartIndex] === ' ' || textBeforeCursor[mentionStartIndex] === '\n') {
            mentionStartIndex += 1;
        }

        showAutocomplete(query);
    } else {
        closeAutocomplete();
    }
}

function showAutocomplete(query) {
    const container = document.getElementById('chatAutocomplete');
    if (!container) return;

    const files = (typeof docState !== 'undefined' && docState.files) ? docState.files : [];
    if (files.length === 0) {
        closeAutocomplete();
        return;
    }

    const qRaw = query.toLowerCase();
    const filtered = files.filter(f => f.name.toLowerCase().includes(qRaw));

    if (filtered.length === 0) {
        closeAutocomplete();
        return;
    }

    container.innerHTML = filtered.map(f => {
        const safeName = f.name.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        return `
        <div class="px-3 py-2 border-bottom text-truncate"
             style="cursor:pointer; font-size:0.9rem;"
             onmouseover="this.classList.add('bg-light')"
             onmouseout="this.classList.remove('bg-light')"
             onclick="selectMention('${safeName}')">
            <i class="bi bi-file-earmark-text text-primary me-2"></i>${f.name}
        </div>
        `;
    }).join('');

    container.style.display = 'block';
}

function selectMention(fileName) {
    const input = document.getElementById('chatInput');
    const text = input.value;

    const before = text.substring(0, mentionStartIndex);
    const after = text.substring(input.selectionStart);

    input.value = before + '***' + fileName + '*** ' + after;
    input.focus();

    closeAutocomplete();
}

function closeAutocomplete() {
    mentionStartIndex = -1;
    const container = document.getElementById('chatAutocomplete');
    if (container) container.style.display = 'none';
}
