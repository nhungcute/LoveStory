document.addEventListener('DOMContentLoaded', () => {
    if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
});

async function handleDocUpload(input) {
    if (!input.files || input.files.length === 0) return;
    const files = Array.from(input.files);
    input.value = '';

    const uploadingList = document.getElementById('docUploadingList');

    for (const file of files) {
        const id = 'up_' + Date.now() + Math.floor(Math.random()*1000);

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
            updateProgress('Đọc file...', 5);
            const b64 = await fileToBase64(file);
            const b64Data = b64.includes('base64,') ? b64.split('base64,')[1] : b64;
            const mimeType = file.type || 'application/octet-stream';

            const chunkSize = 1000000;
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

                let pct = 5 + Math.floor((i + 1) / totalChunks * 45);
                updateProgress(`Tải file: ${pct}%`, pct);
            }

            updateProgress('Đang phân tích chữ...', 55);
            const rawText = await extractTextFromFile(file);
            let textChunks = chunkTextFrontend(rawText, 500, 50);

            if (textChunks.length > 500) textChunks = textChunks.slice(0, 500);

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

                    let aiPct = 55 + Math.floor((b + 1) / totalBatches * 45);
                    updateProgress(`Nhúng AI: ${aiPct}%`, aiPct);
                }
            } else {
                updateProgress(`Tải lên hoàn tất`, 100);
            }

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

    await loadDocuments(true);
}
