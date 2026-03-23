/**
 * document.js
 * Document tab: managing uploaded documents for AI analysis (RAG).
 */

const docState = {
    files: [],
    isLoading: false,
};

function renderDocumentTab() {
    const container = document.getElementById('tabDocument');
    if (!container) return;
    
    // Create UI only once
    if (!document.getElementById('docManagerUI')) {
        container.innerHTML = `
            <div id="docManagerUI" class="p-3">
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <h5 class="mb-0 fw-bold theme-text-primary">Quản lý Tài liệu</h5>
                    <button class="btn btn-sm theme-bg-primary text-white" onclick="document.getElementById('docUploadInput').click()">
                        <i class="bi bi-cloud-arrow-up-fill me-1"></i>Tải lên
                    </button>
                    <input type="file" id="docUploadInput" class="d-none" multiple 
                           accept=".txt,.csv,.xlsx,.xls,.pdf,.doc,.docx,.html,.js,.css"
                           onchange="handleDocUpload(this)">
                </div>
                
                <div class="alert alert-info border-0 rounded-3 small mb-4" style="background-color:rgba(0, 107, 104, 0.1); color:var(--theme-secondary);">
                    <i class="bi bi-info-circle-fill me-2"></i>
                    Tài liệu tải lên đây sẽ được AI (Gemini) đọc và phân tích khi bạn sử dụng tính năng Smart Search.
                </div>
                
                <div id="docUploadingList" class="mb-3"></div>
                
                <div class="fw-semibold mb-2 text-muted">Tài liệu đã lưu</div>
                <div id="docListContainer">
                    <div class="text-center py-4 text-muted small">
                        <span class="spinner-border spinner-border-sm"></span> Đang tải danh sách...
                    </div>
                </div>
            </div>
        `;
    }
    
    loadDocuments();
}

async function loadDocuments(forceReload = false) {
    if (docState.isLoading) return;
    if (docState.files.length > 0 && !forceReload) {
        if (document.getElementById('docListContainer')) renderDocumentList();
        return;
    }
    
    docState.isLoading = true;
    const listEl = document.getElementById('docListContainer');
    
    try {
        // Assume backend has an action to get list of files in the RAG folder
        const res = await sendToServer({ action: 'list_documents' });
        docState.files = res.data || [];
        if (listEl) renderDocumentList();
    } catch(e) {
        if (listEl) listEl.innerHTML = `<div class="text-center py-3 text-muted">Không tải được danh sách</div>`;
    } finally {
        docState.isLoading = false;
    }
}

async function handleDocUpload(input) {
    if (!input.files || input.files.length === 0) return;
    const files = Array.from(input.files);
    input.value = ''; // Reset
    
    const uploadingList = document.getElementById('docUploadingList');
    
    for (const file of files) {
        const id = 'up_' + Date.now() + Math.floor(Math.random()*1000);
        
        // Add progress UI
        const item = document.createElement('div');
        item.id = id;
        item.className = 'card border-0 shadow-sm mb-2 border-start border-4 border-warning';
        item.innerHTML = `
            <div class="card-body p-2 px-3 d-flex flex-column">
                <div class="d-flex align-items-center mb-1">
                    <div class="flex-grow-1 text-truncate small fw-semibold">${file.name}</div>
                    <div id="${id}_status" class="small text-muted ms-2" style="font-size:0.75rem;">Đang chuẩn bị...</div>
                </div>
                <div class="progress" style="height: 4px;">
                    <div id="${id}_progress" class="progress-bar progress-bar-striped progress-bar-animated bg-warning" role="progressbar" style="width: 0%"></div>
                </div>
            </div>`;
        uploadingList.appendChild(item);
        
        const updateProgress = (text, pct) => {
            const statusEl = document.getElementById(`${id}_status`);
            const barEl = document.getElementById(`${id}_progress`);
            if (statusEl && text) statusEl.textContent = text;
            if (barEl) barEl.style.width = pct + '%';
        };

        try {
            // STEP 1: Upload File to Drive (Base64 Chunking)
            updateProgress('Đọc file...', 5);
            const b64 = await fileToBase64(file);
            const b64Data = b64.includes('base64,') ? b64.split('base64,')[1] : b64;
            const mimeType = file.type || 'application/octet-stream';
            
            const chunkSize = 1000000; // 1MB base64 chars per chunk
            const totalChunks = Math.ceil(b64Data.length / chunkSize);
            const fileIdTemp = 'up_' + Date.now(); 

            for (let i = 0; i < totalChunks; i++) {
                const chunkStr = b64Data.substring(i * chunkSize, (i + 1) * chunkSize);
                await sendToServer({
                    action: 'upload_file_chunk',
                    fileName: file.name,
                    mimeType: mimeType,
                    chunkData: chunkStr,
                    chunkIndex: i,
                    totalChunks: totalChunks,
                    fileIdTemp: fileIdTemp,
                    username: state.profile.username
                });
                
                let pct = 5 + Math.floor((i + 1) / totalChunks * 45); // Drive upload: 5% -> 50%
                updateProgress(`Tải file: ${pct}%`, pct);
            }

            // STEP 2: Extract Text 
            updateProgress('Đang phân tích chữ...', 55);
            const rawText = await extractTextFromFile(file);
            let textChunks = chunkTextFrontend(rawText, 500, 50);
            
            // Limit chunks to prevent excessive API calling
            if(textChunks.length > 500) textChunks = textChunks.slice(0, 500);

            // STEP 3: Send text chunks for AI Embedding in batches
            if (textChunks.length > 0) {
                const batchSize = 5; 
                const totalBatches = Math.ceil(textChunks.length / batchSize);
                
                for (let b = 0; b < totalBatches; b++) {
                    const batch = textChunks.slice(b * batchSize, (b + 1) * batchSize);
                    
                    await sendToServer({
                        action: 'process_text_chunks',
                        fileName: file.name,
                        chunks: batch,
                        batchIndex: b,
                        startIndex: b * batchSize,
                        totalChunks: textChunks.length,
                        username: state.profile.username
                    });
                    
                    let aiPct = 55 + Math.floor((b + 1) / totalBatches * 45); // Embedding: 55% -> 100%
                    updateProgress(`Nhúng AI: ${aiPct}%`, aiPct);
                }
            } else {
                updateProgress(`Tải lên hoàn tất`, 100);
            }
            
            // Success UI
            item.classList.replace('border-warning', 'border-success');
            const bar = item.querySelector('.progress-bar');
            if (bar) {
                bar.classList.replace('bg-warning', 'bg-success');
                bar.classList.remove('progress-bar-animated');
            }
            const st = document.getElementById(`${id}_status`);
            if (st) st.innerHTML = `<i class="bi bi-check-circle-fill text-success"></i>`;
            
            setTimeout(() => item.remove(), 2500);

        } catch(e) {
            console.error('Upload Error:', e);
            item.classList.replace('border-warning', 'border-danger');
            const bar = item.querySelector('.progress-bar');
            if (bar) bar.classList.replace('bg-warning', 'bg-danger');
            const st = document.getElementById(`${id}_status`);
            if (st) st.innerHTML = `<span class="text-danger">Lỗi</span>`;
            setTimeout(() => item.remove(), 4000);
        }
    }
    
    // Reload list after all uploads finish
    await loadDocuments();
}

// --- CLient-side Text Extraction Utility ---
async function extractTextFromFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    
    // 1. Plain Text / CSV / Code
    if (['txt', 'md', 'html', 'css', 'js', 'json'].includes(ext)) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsText(file);
        });
    }
    
    // 2. CSV / Excel (XLSX, XLS)
    if (['csv', 'xlsx', 'xls'].includes(ext)) {
        if (typeof XLSX === 'undefined') return ''; // Library not loaded
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, {type: 'array'});
                    let fullText = '';
                    workbook.SheetNames.forEach(sheetName => {
                        const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]);
                        fullText += `--- Sheet: ${sheetName} ---\n${csv}\n\n`;
                    });
                    resolve(fullText);
                } catch(err) {
                    reject(err);
                }
            };
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    }

    // 3. Word (DOCX)
    if (ext === 'docx') {
        if (typeof mammoth === 'undefined') return '';
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => {
                mammoth.extractRawText({arrayBuffer: e.target.result})
                    .then(result => resolve(result.value))
                    .catch(reject);
            };
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    }

    // 4. PDF
    if (ext === 'pdf') {
        if (typeof pdfjsLib === 'undefined') return '';
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async e => {
                try {
                    const typedarray = new Uint8Array(e.target.result);
                    const pdf = await pdfjsLib.getDocument(typedarray).promise;
                    let fullText = '';
                    for (let i = 1; i <= pdf.numPages; i++) {
                        const page = await pdf.getPage(i);
                        const content = await page.getTextContent();
                        const strings = content.items.map(item => item.str);
                        fullText += strings.join(' ') + '\n';
                    }
                    resolve(fullText);
                } catch(err) {
                    reject(err);
                }
            };
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    }

    // Unsupported format for text extraction (images, videos, etc.)
    return '';
}

// Helper to chunk text into pieces of roughly N words
function chunkTextFrontend(text, wordsPerChunk = 500, overlap = 50) {
    if (!text || typeof text !== 'string') return [];
    const words = text.split(/\s+/).filter(w => w.length > 0);
    const chunks = [];
    let i = 0;
    while (i < words.length) {
        const end = Math.min(i + wordsPerChunk, words.length);
        chunks.push(words.slice(i, end).join(' '));
        if (end === words.length) break;
        i += wordsPerChunk - overlap;
    }
    return chunks;
}

function renderDocumentList() {
    const listEl = document.getElementById('docListContainer');
    if (!listEl) return;

    if (docState.files.length === 0) {
        listEl.innerHTML = `<div class="text-center py-5 text-muted">
            <i class="bi bi-folder-x fs-1 d-block mb-2"></i>Chưa có tài liệu nào.</div>`;
        return;
    }
    
    listEl.innerHTML = docState.files.map(f => `
        <div class="card border-0 shadow-sm mb-2">
            <div class="card-body p-3 d-flex align-items-center gap-3">
                <i class="bi ${getFileIcon(f.name)} fs-3 text-secondary"></i>
                <div class="flex-grow-1 overflow-hidden">
                    <div class="fw-semibold text-truncate" style="font-size:0.9rem;">${escapeHtml(f.name)}</div>
                    <div class="text-muted d-flex gap-3 mt-1" style="font-size:0.75rem;">
                        <span>${formatBytes(f.size)}</span>
                        <span>${formatTimeSmart(f.date)}</span>
                    </div>
                </div>
                <button class="btn btn-link text-danger p-1" onclick="deleteDocument('${f.id}')">
                    <i class="bi bi-trash"></i>
                </button>
            </div>
        </div>
    `).join('');
}

async function deleteDocument(fileId) {
    const docIndex = docState.files.findIndex(f => f.id === fileId);
    if (docIndex === -1) return;
    const doc = docState.files[docIndex];

    const ok = await showConfirm(`Bạn có chắc muốn xóa tài liệu "${doc.name}" này?`, 'Xóa tài liệu');
    if (!ok) return;

    // Optimistic Update
    docState.files.splice(docIndex, 1);
    renderDocumentList();

    try {
        await sendToServer({ action: 'delete_document', fileId: doc.id, fileName: doc.name, username: state.profile.username });
        // Re-sync quietly if needed, or rely on the optimistic state
    } catch(e) {
        // Rollback
        docState.files.splice(docIndex, 0, doc);
        renderDocumentList();
        showAlert("Xóa thất bại!");
    }
}

function getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    if (['pdf'].includes(ext)) return 'bi-file-earmark-pdf-fill text-danger';
    if (['doc', 'docx'].includes(ext)) return 'bi-file-earmark-word-fill text-primary';
    if (['xls', 'xlsx', 'csv'].includes(ext)) return 'bi-file-earmark-excel-fill text-success';
    if (['html', 'css', 'js'].includes(ext)) return 'bi-file-earmark-code-fill text-info';
    return 'bi-file-earmark-text-fill text-secondary';
}

function formatBytes(bytes, decimals = 2) {
    if (!+bytes) return '0 Bytes';
    const k = 1024, dm = decimals < 0 ? 0 : decimals, sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}
