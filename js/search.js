/**
 * search.js
 * AI Smart Search (Gemini API) interaction logic
 */

const chatState = {
    history: [],
    isTyping: false
};

let mentionStartIndex = -1;

function handleChatInput(event) {
    const input = event.target;
    const text = input.value;
    const cursor = input.selectionStart;
    
    // Quét toàn bộ dòng chữ từ đầu đến vị trí con trỏ hiện tại
    const textBeforeCursor = text.substring(0, cursor);
    
    // Tìm từ cuối cùng liền kề con trỏ mà bắt đầu bằng @
    // Ví dụ: "Chào @bao" -> match "@bao", "@" -> match "@"
    const match = textBeforeCursor.match(/(?:\s|^)(@[^\s]*)$/);
    
    if (match) {
        const fullKeyword = match[1]; // Gồm cả chữ @ ("@bao")
        const query = fullKeyword.substring(1); // Bỏ chữ @ để lấy "bao"
        
        // Lưu lại vị trí của chữ @ để lúc select chèn nội dung vào đúng chỗ
        mentionStartIndex = textBeforeCursor.lastIndexOf(fullKeyword);
        // lastIndexOf(fullKeyword) có thể bị nhầm nếu có 2 từ giống nhau,
        // Dùng index của regex match là an toàn nhất:
        mentionStartIndex = match.index; 
        if (textBeforeCursor[mentionStartIndex] === ' ' || textBeforeCursor[mentionStartIndex] === '\n') {
            mentionStartIndex += 1; // Bỏ qua khoảng trắng
        }
        
        showAutocomplete(query);
    } else {
        closeAutocomplete();
    }
}

function showAutocomplete(query) {
    const container = document.getElementById('chatAutocomplete');
    if (!container) return;
    
    // Lấy danh sách file từ biến global docState của document.js
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
        // Fix lỗi HTML nếu tên file chứa dấu nháy đơn hoặc kép
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
    // Thay cụm @... hiện tại bằng cấu trúc ***tên file*** + dấu cách
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
    const isDocSearch = text.includes('@') || text.includes('***');

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
