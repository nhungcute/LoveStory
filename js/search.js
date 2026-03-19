/**
 * search.js
 * AI Smart Search (Gemini API) interaction logic
 */

const chatState = {
    history: [],
    isTyping: false
};

function initChatArea() {
    const list = document.getElementById('chatMessageList');
    if(list && list.children.length === 0) {
        // Welcome message
        addMessageToChat('AI', 'Chào bạn! Mình là trợ lý AI của LoveStory. Bạn có thể hỏi mình về kỷ niệm trong bảng tin, hoặc yêu cầu mình phân tích các tài liệu bạn đã tải lên nhé.');
    }
}

async function sendChatMessage() {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if(!text || chatState.isTyping) return;
    
    input.value = '';
    addMessageToChat('User', text);
    chatState.isTyping = true;
    showTypingIndicator();
    const isDocSearch = text.includes('@');

    try {
        // Lọc kỹ lịch sử để tránh gửi các parts trống sang server
        const cleanHistory = chatState.history
            .filter(h => h.role && h.parts && h.parts.length > 0 && h.parts[0].text && h.parts[0].text.trim() !== "")
            .slice(-6);

        // We pass the context if needed, backend handles the actual Gemini Call + RAG
        const res = await sendToServer({
            action: 'ai_chat',
            query: text,
            chatMode: isDocSearch ? 'document' : 'memory',
            history: cleanHistory
        });
        
        hideTypingIndicator();
        
        if (res.status === 'success' && res.reply) {
            addMessageToChat('AI', res.reply);
            chatState.history.push({role: 'user', parts: [{text}]});
            chatState.history.push({role: 'model', parts: [{text: res.reply}]});
        } else {
            addMessageToChat('AI', '<span class="text-danger">Lỗi: ' + (res.message || 'Không thể trả lời') + '</span>');
        }
    } catch(e) {
        hideTypingIndicator();
        addMessageToChat('AI', '<span class="text-danger">Đã có lỗi kết nối. Vui lòng thử lại sau.</span>');
    } finally {
        chatState.isTyping = false;
        input.focus();
    }
}

function addMessageToChat(sender, htmlContent) {
    const list = document.getElementById('chatMessageList');
    if(!list) return;
    
    const div = document.createElement('div');
    const isMe = sender === 'User';
    
    div.className = `d-flex gap-2 mb-3 ${isMe ? 'flex-row-reverse' : ''}`;
    
    const avatar = isMe 
        ? (state.profile.avaUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(state.profile.fullname)}`) 
        : 'https://cdn-icons-png.flaticon.com/512/8649/8649605.png'; // Robot icon
        
    const bgClass = isMe ? 'theme-bg-primary text-white' : 'bg-white border';
    
    // Basic Markdown Rendering (Bold and Bullets)
    let formatted = htmlContent
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold
        .replace(/^-\s(.*)/gm, '<li>$1</li>')              // Bullets
        .replace(/\n\s*-\s/g, '\n- ');                      // Normalize bullet spacing
        
    // Wrap lists in <ul>
    if (formatted.includes('<li>')) {
        formatted = formatted.replace(/(<li>.*<\/li>)/s, '<ul class="ps-3 mb-0">$1</ul>');
    }

    div.innerHTML = `
        <img src="${avatar}" class="rounded-circle mt-auto" width="28" height="28" style="object-fit:cover;">
        <div class="chat-bubble ${bgClass} rounded-4 px-3 py-2" style="max-width:80%; font-size:0.95rem; border-bottom-${isMe?'right':'left'}-radius:4px;">
            ${formatted.replace(/\n/g, '<br>')}
        </div>
    `;
    list.appendChild(div);
    list.scrollTop = list.scrollHeight;
}

function showTypingIndicator() {
    const list = document.getElementById('chatMessageList');
    const id = 'typing_indicator';
    if(document.getElementById(id)) return;
    
    const div = document.createElement('div');
    div.id = id;
    div.className = `d-flex gap-2 mb-3`;
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
