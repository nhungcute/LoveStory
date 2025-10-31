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

// === ĐỊNH NGHĨA ĐƯỜNG DẪN (so với thư mục gốc của repo) ===
const IMAGE_DATA_PATH = 'image_data.json';
const HOME_DATA_PATH = 'home_data.json';
const ACTIONS_PATH = 'actions.json';
const CHART_PATH = 'chart_data.json'; // Giả sử đây là file config.CHART_FILE_PATH
const START_DATE = '2022-02-22'; // Ngày bắt đầu yêu nhau

// === CÁC HÀM TÍNH TOÁN (Lấy từ index.html) ===
function convertDateFormat(dateStr) {
    const parts = dateStr.split('-');
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

// === HÀM TẢI GOOGLE DRIVE ===
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
                // Lấy các trường đầy đủ từ index.html
                webViewLink: file.webViewLink || `https://drive.google.com/file/d/${file.id}/view?usp=drivesdk`,
                webContentLink: file.webContentLink || `https://drive.google.com/uc?export=download&id=${file.id}`,
                thumbnailLink: file.thumbnailLink, // Giữ link gốc, client sẽ tự hack
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
        console.log(`✅ Đã lưu ${allFiles.length} media vào image_data.json`);
        return allFiles;

    } catch (error) {
        console.error("Lỗi khi đồng bộ Google Drive:", error);
        return null;
    }
}

// === HÀM TÍNH TOÁN DỮ LIỆU TRANG CHỦ ===
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
    } catch (e) { console.warn("Không tìm thấy chart_data.json, bỏ qua..."); }

    // === 2. Bắt đầu tính toán ===
    
    // a. Tính Stats
    const startDate = new Date(START_DATE);
    const today = new Date();
    homeData.daysTogether = Math.floor((today - startDate) / (1000 * 60 * 60 * 24));
    homeData.totalMemories = eventsData.length;
    homeData.totalPhotos = mediaData.length;

    // b. Tính Sự kiện sắp tới (Logic từ loadUpcomingEvents)
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

    // c. Tính "Ngày này năm xưa" (Logic từ loadTodayMemories)
    const todayDayMonthStr = `${String(today.getDate()).padStart(2, '0')}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const currentYear = today.getFullYear();
    homeData.todayMemories = eventsData.filter(event => {
        if (!event.day || event.day.length !== 10) return false;
        if (event.day.substring(0, 5) !== todayDayMonthStr) return false;
        const eventYear = parseInt(event.day.substring(6), 10);
        return (currentYear - eventYear) >= 1;
    }).sort((a, b) => new Date(convertDateFormat(b.day)) - new Date(convertDateFormat(a.day)));

    // d. Tính Giá Vàng (Logic từ loadGoldPrice)
    if (goldData.length > 0) {
        const latestData = goldData.reduce((latest, current) => {
            const latestTs = new Date(latest.timestamp).getTime();
            const currentTs = new Date(current.timestamp).getTime();
            return (currentTs > latestTs) ? current : latest;
        });
        homeData.goldPrice = {
            buy: parseFloat(latestData.ring_buy) || 0,
            sell: parseFloat(latestData.ring_sell) || 0
        };
    } else {
        homeData.goldPrice = { buy: 0, sell: 0 };
    }

    // 3. Lưu file home_data.json
    await fs.writeFile(HOME_DATA_PATH, JSON.stringify(homeData, null, 2));
    console.log(`✅ Đã lưu dữ liệu trang chủ vào home_data.json`);
}

// === HÀM CHẠY CHÍNH ===
async function main() {
    // Bước 1: Đồng bộ Google Drive và lưu vào image_data.json
    const mediaData = await syncGoogleDrive();
    
    // Bước 2: Dùng dữ liệu vừa tải để tính toán và lưu home_data.json
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
