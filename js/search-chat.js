function initChatArea() {
    const list = document.getElementById('chatMessageList');
    if (list && list.children.length === 0) {
        addMessageToChat('AI', 'Chao ban! Minh la tro ly AI cua LoveStory. Ban co the hoi minh ve ky niem trong bang tin, hoac yeu cau minh phan tich tai lieu da tai len.');
    }
}

async function sendChatMessage() {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if (!text || chatState.isTyping) return;

    input.value = '';
    addMessageToChat('User', text);
    chatState.isTyping = true;
    showTypingIndicator();
    const isDocSearch = text.includes('@') || text.includes('***');

    try {
        const cleanHistory = chatState.history
            .filter(h => h.role && h.parts && h.parts.length > 0 && h.parts[0].text && h.parts[0].text.trim() !== "")
            .slice(-6);

        const res = await sendToServer({
            action: 'ai_chat',
            query: text,
            chatMode: isDocSearch ? 'document' : 'memory',
            history: cleanHistory
        });

        hideTypingIndicator();

        if (res.status === 'success' && res.reply) {
            addMessageToChat('AI', res.reply);
            chatState.history.push({ role: 'user', parts: [{ text }] });
            chatState.history.push({ role: 'model', parts: [{ text: res.reply }] });
        } else {
            addMessageToChat('AI', 'Loi: ' + (res.message || 'Khong the tra loi'), true);
        }
    } catch (e) {
        hideTypingIndicator();
        addMessageToChat('AI', 'Da co loi ket noi. Vui long thu lai sau.', true);
    } finally {
        chatState.isTyping = false;
        input.focus();
    }
}

function addMessageToChat(sender, message, isError = false) {
    const list = document.getElementById('chatMessageList');
    if (!list) return;

    const div = document.createElement('div');
    const isMe = sender === 'User';
    div.className = `d-flex gap-2 mb-3 ${isMe ? 'flex-row-reverse' : ''}`;

    const avatar = isMe
        ? (state.profile.avaUrl || getDefaultAvatar(state.profile.fullname))
        : 'https://cdn-icons-png.flaticon.com/512/8649/8649605.png';

    const img = document.createElement('img');
    img.src = avatar;
    img.className = 'rounded-circle mt-auto';
    img.width = 28;
    img.height = 28;
    img.style.objectFit = 'cover';

    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${isMe ? 'theme-bg-primary text-white' : 'bg-white border'} rounded-4 px-3 py-2${isError ? ' text-danger' : ''}`;
    bubble.style.maxWidth = '80%';
    bubble.style.fontSize = '0.95rem';
    bubble.style[`borderBottom${isMe ? 'Right' : 'Left'}Radius`] = '4px';

    renderChatMessageContent(bubble, message);
    div.append(img, bubble);
    list.appendChild(div);
    list.scrollTop = list.scrollHeight;
}

function renderChatMessageContent(container, message) {
    const lines = String(message || '').split(/\r?\n/);
    let listEl = null;

    const appendInline = (parent, text) => {
        const parts = text.split(/(\*\*[^*]+\*\*)/g);
        parts.forEach(part => {
            if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
                const strong = document.createElement('strong');
                strong.textContent = part.slice(2, -2);
                parent.appendChild(strong);
            } else if (part) {
                parent.appendChild(document.createTextNode(part));
            }
        });
    };

    lines.forEach((line, idx) => {
        const bullet = line.match(/^\s*-\s+(.+)$/);
        if (bullet) {
            if (!listEl) {
                listEl = document.createElement('ul');
                listEl.className = 'ps-3 mb-0';
                container.appendChild(listEl);
            }
            const li = document.createElement('li');
            appendInline(li, bullet[1]);
            listEl.appendChild(li);
            return;
        }

        listEl = null;
        if (idx > 0) container.appendChild(document.createElement('br'));
        appendInline(container, line);
    });
}

function showTypingIndicator() {
    const list = document.getElementById('chatMessageList');
    const id = 'typing_indicator';
    if (document.getElementById(id)) return;

    const div = document.createElement('div');
    div.id = id;
    div.className = 'd-flex gap-2 mb-3';
    div.innerHTML = `
        <img src="https://cdn-icons-png.flaticon.com/512/8649/8649605.png" class="rounded-circle mt-auto" width="28" height="28">
        <div class="chat-bubble bg-white border rounded-4 px-3 py-2 text-muted" style="max-width:80%; display:flex; gap:3px; align-items:center;">
            <div class="spinner-grow bg-secondary" style="width:5px;height:5px;"></div>
            <div class="spinner-grow bg-secondary" style="width:5px;height:5px;animation-delay:0.2s"></div>
            <div class="spinner-grow bg-secondary" style="width:5px;height:5px;animation-delay:0.4s"></div>
        </div>
    `;
    list.appendChild(div);
    list.scrollTop = list.scrollHeight;
}

function hideTypingIndicator() {
    document.getElementById('typing_indicator')?.remove();
}
