const docState = {
    files: [],
    isLoading: false,
};

function renderDocumentTab() {
    const container = document.getElementById('tabDocument');
    if (!container) return;

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
        const res = await sendToServer({ action: 'list_documents' });
        docState.files = res.data || [];
        if (listEl) renderDocumentList();
    } catch(e) {
        if (listEl) listEl.innerHTML = renderErrorState('Không tải được danh sách', 'loadDocuments(true)');
    } finally {
        docState.isLoading = false;
    }
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

    docState.files.splice(docIndex, 1);
    renderDocumentList();

    try {
        await sendToServer({ action: 'delete_document', fileId: doc.id, fileName: doc.name, username: state.profile.username });
    } catch(e) {
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
