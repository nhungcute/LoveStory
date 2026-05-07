async function extractTextFromFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();

    if (['txt', 'md', 'html', 'css', 'js', 'json'].includes(ext)) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsText(file);
        });
    }

    if (['csv', 'xlsx', 'xls'].includes(ext)) {
        if (typeof XLSX === 'undefined') return '';
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

    return '';
}

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
