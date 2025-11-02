// Đây là "backend" của bạn, chạy bằng Node.js trên GitHub Actions
const fs = require('fs').promises;
const path = require('path');

// Sử dụng node-fetch v2
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

// === LẤY BIẾN MÔI TRƯỜNG ===
const { GDRIVE_API_KEY, GDRIVE_FOLDER_ID } = process.env;

if (!GDRIVE_API_KEY || !GDRIVE_FOLDER_ID) {
    console.error("Thiếu GDRIVE_API_KEY hoặc GDRIVE_FOLDER_ID. Hãy thêm chúng vào GitHub Secrets.");
    process.exit(1); // Thoát nếu thiếu
}

// === ĐỊNH NGHĨA ĐƯỜNG DẪN ===
const IMAGE_DATA_PATH = 'image_data.json';
const HOME_DATA_PATH = 'home_data.json';
const ACTIONS_PATH = 'actions.json';
const CHART_PATH = 'gold_history.json';
const LOGS_PATH = 'logs.json'; // <-- THÊM ĐƯỜNG DẪN LOGS
const START_DATE = '2022-02-22'; 

// === HÀM GHI LOG HỆ THỐNG (MỚI) ===
async function addSystemLog(action, details) {
    console.log(`Đang ghi log: ${action} - ${details}`);
    let logs = [];
    try {
        // Đọc file logs.json hiện tại
        const logContent = await fs.readFile(LOGS_PATH, 'utf8');
        logs = JSON.parse(logContent);
        if (!Array.isArray(logs)) logs = [];
    } catch (e) {
        console.warn("Chưa có file logs.json, sẽ tạo mới.");
        logs = [];
    }

    // Tạo log mới
    const newLog = {
        timestamp: new Date().toISOString(),
        action: action, // Ví dụ: "Hệ thống"
        details: details,
        username: "GitHub Actions", // Tên người dùng cho bot
        saved: true // Log từ server luôn là "đã lưu"
    };

    // Thêm log mới vào đầu mảng
    logs.unshift(newLog);

    // Giới hạn 1000 log
    if (logs.length > 1000) {
        logs = logs.slice(0, 1000);
    }

    // Ghi đè lại file logs.json
    try {
        await fs.writeFile(LOGS_PATH, JSON.stringify(logs, null, 2));
        console.log("✅ Ghi log hệ thống thành công.");
    } catch (writeError) {
        console.error("Lỗi khi ghi file log:", writeError);
    }
}

// === CÁC HÀM CŨ (Giữ nguyên) ===
function convertDateFormat(dateStr) {
    const parts = dateStr.split('-');
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

async function syncGoogleDrive() {
    console.log("Bắt đầu đồng bộ Google Drive...");
    let allFiles = [];
    let nextPageToken = null;
    let page = 1;

    try {
        do {
            let url = `https://www.googleapis.com/drive/v3/files?q='${GDRIVE_FOLDER_ID}'+in+parents+and+(mimeType+contains+'image/'+or+mimeType+contains+'video/')&key=${GDRIVE_API_KEY}&fields=files(id,name,createdTime,modifiedTime,size,webViewLink,thumbnailLink,mimeType,parents,webContentLink),nextPageToken&pageSize=1000`;
            if (nextPageToken) {
                url += `&pageToken=${nextPageToken}`;
            }

            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Google Drive API error! Status: ${response.status}`);
            }
            
            const data = await response.json();
            const transformedFiles = data.files.map(file => ({
                id: file.id,
                name: file.name.toUpperCase(),
                size: parseInt(file.size) || 0,
                fileType: file.mimeType.startsWith('image/') ? 'image' : 'video',
                webViewLink: file.webViewLink || `https://drive.google.com/file/d/${file.id}/view?usp=drivesdk`,
                webContentLink: file.webContentLink || `https://drive.google.com/uc?export=download&id=${file.id}`,
                // thumbnailLink: file.thumbnailLink, // Đã tắt ở lần trước
                createdTime: file.createdTime,
                modifiedTime: file.modifiedTime || file.createdTime,
                mimeType: file.mimeType,
                source: "google-drive"
            }));
            
            allFiles = allFiles.concat(transformedFiles);
            nextPageToken = data.nextPageToken;
            console.log(`Đã tải trang ${page++}: ${transformedFiles.length} files (Tổng: ${allFiles.length})`);
            
        } while (nextPageToken);
        
        await fs.writeFile(IMAGE_DATA_PATH, JSON.stringify(allFiles, null, 2));
        const logMessage = `Đã đồng bộ ${allFiles.length} media từ Google Drive.`;
        console.log(`✅ ${logMessage}`);
        
        // <-- GỌI HÀM GHI LOG MỚI
        await addSystemLog("Đồng bộ media", logMessage); 
        
        return allFiles;

    } catch (error) {
        console.error("Lỗi khi đồng bộ Google Drive:", error);
        await addSystemLog("Lỗi Hệ thống", `Đồng bộ Google Drive thất bại: ${error.message}`);
        return null;
    }
}

async function buildHomeData(mediaData) {
    console.log("Bắt đầu tính toán dữ liệu trang chủ...");
    let homeData = {};
    let eventsData = [];
    let goldData = [];

    // 1. Đọc dữ liệu sự kiện và vàng
    try {
        eventsData = JSON.parse(await fs.readFile(ACTIONS_PATH, 'utf8'));
    } catch (e) { console.warn("Không tìm thấy actions.json, bỏ qua..."); }
    
    try {
        goldData = JSON.parse(await fs.readFile(CHART_PATH, 'utf8'));
    } catch (e) { console.warn("Không tìm thấy gold_history.json, bỏ qua..."); } 

    // 2. Bắt đầu tính toán
    const today = new Date();
    // ... (Tính toán a, b, c giữ nguyên) ...
    // a. Tính Stats
    const startDate = new Date(START_DATE);
    homeData.daysTogether = Math.floor((today - startDate) / (1000 * 60 * 60 * 24));
    homeData.totalMemories = eventsData.length;
    homeData.totalPhotos = mediaData.length;

    // b. Tính Sự kiện sắp tới
    today.setHours(0, 0, 0, 0);
    const futureEvents = eventsData.map(event => {
        const parts = event.day.split('-');
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        let nextEventDate = new Date(today.getFullYear(), month, day);
        if (nextEventDate < today) {
            nextEventDate.setFullYear(today.getFullYear() + 1);
        }
        return {
            name: event.name,
            date: nextEventDate,
            diff: Math.ceil((nextEventDate - today) / (1000 * 60 * 60 * 24))
        };
    }).sort((a, b) => a.diff - b.diff);
    homeData.upcomingEvent = futureEvents.length > 0 ? futureEvents[0] : null;

    // c. Tính "Ngày này năm xưa"
    const todayDayMonthStr = `${String(today.getDate()).padStart(2, '0')}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const currentYear = today.getFullYear();
    homeData.todayMemories = eventsData.filter(event => {
        if (!event.day || event.day.length !== 10) return false;
        if (event.day.substring(0, 5) !== todayDayMonthStr) return false;
        const eventYear = parseInt(event.day.substring(6), 10);
        return (currentYear - eventYear) >= 1;
    }).sort((a, b) => new Date(convertDateFormat(b.day)) - new Date(convertDateFormat(a.day)));

    // d. Tính Giá Vàng
    const targetProductName = "Nhẫn Tròn 9999 Hưng Thịnh Vượng";
    const productData = Array.isArray(goldData) 
        ? goldData.find(p => p.product_name === targetProductName)
        : null;

    if (productData && productData.gia && productData.gia.length > 0) {
        const latestData = productData.gia[0]; 
        homeData.goldPrice = {
            buy: parseFloat(latestData.ring_buy) || 0,
            sell: parseFloat(latestData.ring_sell) || 0
        };
        // <-- GỌI HÀM GHI LOG MỚI (chỉ log nếu file tồn tại)
        // Chúng ta chỉ log giá vàng 1 lần/ngày tại đây
        const goldLogMessage = `Giá vàng: Mua ${latestData.ring_buy}, Bán ${latestData.ring_sell}`;
        await addSystemLog("Cập nhật giá vàng", goldLogMessage);
        
    } else {
        console.warn(`Không tìm thấy dữ liệu giá cho "${targetProductName}" trong gold_history.json`);
        homeData.goldPrice = { buy: 0, sell: 0 };
    }

    // 3. Lưu file home_data.json
    await fs.writeFile(HOME_DATA_PATH, JSON.stringify(homeData, null, 2));
    console.log(`✅ Đã lưu dữ liệu trang chủ vào home_data.json`);
}

// === HÀM CHẠY CHÍNH ===
async function main() {
    // Bước 1: Đồng bộ Google Drive
    const mediaData = await syncGoogleDrive();
    
    // Bước 2: Tính toán dữ liệu
    if (mediaData) {
        await buildHomeData(mediaData);
    } else {
        console.error("Dừng lại do không thể đồng bộ Google Drive.");
    }
}

// Chạy hàm main
main().catch(err => {
    console.error(err);
    process.exit(1);
});
