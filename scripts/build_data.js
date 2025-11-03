// Đây là "backend" của bạn, chạy bằng Node.js trên GitHub Actions
const fs = require('fs').promises;
const path = require('path');

// Sử dụng node-fetch v2
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
// Thư viện cho giá vàng
const axios = require('axios');
const { parseStringPromise } = require('xml2js');

// === LẤY BIẾN MÔI TRƯỜNG (ĐÃ GỘP) ===
const { GDRIVE_API_KEY, GDRIVE_FOLDER_ID, DOJI_API_KEY } = process.env;

if (!GDRIVE_API_KEY || !GDRIVE_FOLDER_ID) {
    console.error("Thiếu GDRIVE_API_KEY hoặc GDRIVE_FOLDER_ID.");
    // Không thoát, chỉ cảnh báo, để giá vàng vẫn có thể chạy
}
if (!DOJI_API_KEY) {
    console.error("Thiếu DOJI_API_KEY.");
    // Không thoát, chỉ cảnh báo, để GDrive vẫn có thể chạy
}

// === ĐỊNH NGHĨA ĐƯỜNG DẪN (ĐÃ GỘP) ===
const IMAGE_DATA_PATH = 'image_data.json';
const HOME_DATA_PATH = 'home_data.json';
const ACTIONS_PATH = 'actions.json';
const LOGS_PATH = 'logs.json'; 
const START_DATE = '2022-02-22'; 
// Từ gold_scraper.js
const HISTORY_FILE = 'gold_history.json';
const LOG_STATE_FILE = 'gold_log_state.txt'; 
const CHART_PATH = HISTORY_FILE; // (Đổi tên để buildHomeData có thể dùng)
const TARGET_PRODUCT_NAME = "Nhẫn Tròn 9999 Hưng Thịnh Vượng";
const MAX_HISTORY_ENTRIES = 300; 
const API_URL = `http://giavang.doji.vn/api/giavang/?api_key=${DOJI_API_KEY}`;


// === HÀM GHI LOG HỆ THỐNG (Giữ nguyên) ===
async function addSystemLog(action, details) {
    console.log(`Đang ghi log: ${action} - ${details}`);
    let logs = [];
    try {
        const logContent = await fs.readFile(LOGS_PATH, 'utf8');
        logs = JSON.parse(logContent);
        if (!Array.isArray(logs)) logs = [];
    } catch (e) {
        console.warn("Chưa có file logs.json, sẽ tạo mới.");
        logs = [];
    }

    const newLog = {
        timestamp: new Date().toISOString(),
        action: action,
        details: details,
        username: "GitHub Actions", 
        saved: true
    };

    logs.unshift(newLog);
    if (logs.length > 1000) logs = logs.slice(0, 1000);

    try {
        await fs.writeFile(LOGS_PATH, JSON.stringify(logs, null, 2));
        console.log("✅ Ghi log hệ thống thành công.");
    } catch (writeError) {
        console.error("Lỗi khi ghi file log:", writeError);
    }
}

// === HÀM HỖ TRỢ LOG GIÁ VÀNG (Lấy từ gold_scraper.js) ===
async function checkAndLogPrice(action, details) {
    const todayStr = new Date().toISOString().split('T')[0]; // "2025-11-02"
    let lastLogDate = '';

    try {
        lastLogDate = await fs.readFile(LOG_STATE_FILE, 'utf8');
    } catch (e) {
        console.log("Không tìm thấy file trạng thái log, sẽ tạo mới.");
    }

    if (lastLogDate !== todayStr) {
        console.log("Ghi log giá vàng lần đầu trong ngày...");
        await addSystemLog(action, details);
        await fs.writeFile(LOG_STATE_FILE, todayStr); // Cập nhật file trạng thái
    } else {
        console.log("Đã log giá vàng hôm nay, bỏ qua ghi log.");
    }
}


// === HÀM LOGIC 1: TẢI GIÁ VÀNG (Lấy từ gold_scraper.js) ===
async function scrapeAndSaveRingPrice() {
    if (!DOJI_API_KEY) {
        console.warn("Bỏ qua tải giá vàng do thiếu DOJI_API_KEY.");
        return; // Không dừng quy trình, chỉ bỏ qua
    }
    
    try {
        console.log(`Đang gọi API DOJI để lấy giá tại: ${new Date().toISOString()}`);

        const response = await axios.get(API_URL);
        const xmlData = response.data;
        const result = await parseStringPromise(xmlData, { 
            explicitArray: false, 
            attrkey: "Attr" 
        });
        
        const jewelryRows = result.GoldList.JewelryList.Row;
        const ringRow = Array.isArray(jewelryRows) 
            ? jewelryRows.find(row => row.Attr.Name === TARGET_PRODUCT_NAME) 
            : null;

        if (!ringRow || !ringRow.Attr) {
            console.error(`Lỗi: Không tìm thấy dữ liệu cho "${TARGET_PRODUCT_NAME}".`);
            await checkAndLogPrice("Lỗi Hệ thống", "Tải giá vàng thất bại: Không tìm thấy sản phẩm.");
            return; // Không dừng quy trình
        }

        const newPriceEntry = {
            timestamp: new Date().toISOString(),
            ring_buy: ringRow.Attr.Buy.replace(/,/g, ''),
            ring_sell: ringRow.Attr.Sell.replace(/,/g, '')
        };
        
        console.log("Dữ liệu giá vàng mới thu thập:", newPriceEntry);
        
        let history = [];
        try {
            const historyContent = await fs.readFile(HISTORY_FILE, 'utf8');
            history = JSON.parse(historyContent);
            if (!Array.isArray(history)) history = [];
        } catch (readError) {
            console.log("File lịch sử giá vàng chưa tồn tại hoặc rỗng, tạo mới.");
            history = [];
        }

        let productData = history.find(p => p.product_name === TARGET_PRODUCT_NAME);
        if (!productData) {
            console.log(`Tạo mục mới cho sản phẩm "${TARGET_PRODUCT_NAME}"`);
            productData = {
                product_name: TARGET_PRODUCT_NAME,
                gia: []
            };
            history.push(productData);
        }

        const latestEntry = productData.gia[0]; 
        let hasChanged = false;

        if (!latestEntry) {
            console.log("Thêm giá vàng đầu tiên cho sản phẩm.");
            hasChanged = true;
        } else if (latestEntry.ring_buy !== newPriceEntry.ring_buy || latestEntry.ring_sell !== newPriceEntry.ring_sell) {
            console.log("Phát hiện thay đổi giá vàng. Thêm vào lịch sử.");
            hasChanged = true;
        } else {
            console.log("Giá vàng không thay đổi. Bỏ qua không lưu.");
            hasChanged = false;
        }

        if (hasChanged) {
            productData.gia.unshift(newPriceEntry);
            if (productData.gia.length > MAX_HISTORY_ENTRIES) {
                productData.gia = productData.gia.slice(0, MAX_HISTORY_ENTRIES);
            }
            
            await fs.writeFile(HISTORY_FILE, JSON.stringify(history, null, 2));
            console.log(`Lưu thành công. "${TARGET_PRODUCT_NAME}" hiện có ${productData.gia.length} bản ghi giá.`);
            
            const logMessage = `Giá vàng thay đổi: Mua ${newPriceEntry.ring_buy}, Bán ${newPriceEntry.ring_sell}`;
            await checkAndLogPrice("Cập nhật giá vàng", logMessage);
        }

    } catch (error) {
        console.error("Lỗi nghiêm trọng khi lấy/xử lý dữ liệu giá vàng:", error.message);
        await checkAndLogPrice("Lỗi Hệ thống", `Tải giá vàng thất bại: ${error.message}`);
    }
}


// === HÀM LOGIC 2: ĐỒNG BỘ GDRIVE (Lấy từ build_data.js) ===
function convertDateFormat(dateStr) {
    const parts = dateStr.split('-');
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

async function syncGoogleDrive() {
    if (!GDRIVE_API_KEY || !GDRIVE_FOLDER_ID) {
        console.warn("Bỏ qua đồng bộ Google Drive do thiếu API Key hoặc Folder ID.");
        return null; // Trả về null để buildHomeData biết
    }
    
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
        console.log(`✅ Đã lưu ${allFiles.length} media vào image_data.json`);
        
        return allFiles;

    } catch (error) {
        console.error("Lỗi khi đồng bộ Google Drive:", error);
        await addSystemLog("Lỗi Hệ thống", `Đồng bộ Google Drive thất bại: ${error.message}`);
        return null;
    }
}

// === HÀM LOGIC 3: TÍNH TOÁN HOME (Lấy từ build_data.js) ===
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
    // a. Tính Stats
    const startDate = new Date(START_DATE);
    homeData.daysTogether = Math.floor((today - startDate) / (1000 * 60 * 60 * 24));
    homeData.totalMemories = eventsData.length;
    // Nếu mediaData là null (do GDrive lỗi), thì đọc từ file cũ (nếu có)
    if (mediaData) {
        homeData.totalPhotos = mediaData.length;
    } else {
        try {
            const oldMedia = JSON.parse(await fs.readFile(IMAGE_DATA_PATH, 'utf8'));
            homeData.totalPhotos = oldMedia.length || 0;
        } catch (e) {
            homeData.totalPhotos = 0;
        }
    }


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
    const productData = Array.isArray(goldData) 
        ? goldData.find(p => p.product_name === TARGET_PRODUCT_NAME)
        : null;

    if (productData && productData.gia && productData.gia.length > 0) {
        const latestData = productData.gia[0]; 
        homeData.goldPrice = {
            buy: parseFloat(latestData.ring_buy) || 0,
            sell: parseFloat(latestData.ring_sell) || 0
        };
    } else {
        console.warn(`Không tìm thấy dữ liệu giá cho "${TARGET_PRODUCT_NAME}" trong gold_history.json`);
        homeData.goldPrice = { buy: 0, sell: 0 };
    }
    
    // 3. Lưu file home_data.json
    await fs.writeFile(HOME_DATA_PATH, JSON.stringify(homeData, null, 2));
    console.log(`✅ Đã lưu dữ liệu trang chủ vào home_data.json`);

    // 4. GHI LOG TỔNG HỢP
    const finalLogMessage = `Cập nhật dữ liệu hệ thống thành công (${homeData.totalMemories} Kỷ niệm, ${homeData.totalPhotos} Media)`;
    await addSystemLog("Hệ thống", finalLogMessage);
}

// === HÀM CHẠY CHÍNH (ĐÃ SỬA) ===
async function main() {
    
    // Bước 1: Chạy giá vàng TRƯỚC
    await scrapeAndSaveRingPrice();

    // Bước 2: Đồng bộ Google Drive
    // (Hàm này đã có try/catch nội bộ và sẽ trả về null nếu lỗi)
    const mediaData = await syncGoogleDrive();
    
    // Bước 3: Tính toán dữ liệu (Luôn chạy)
    // (buildHomeData sẽ tự xử lý nếu mediaData là null)
    await buildHomeData(mediaData);

}

// Chạy hàm main
main().catch(err => {
    console.error("Lỗi nghiêm trọng trong hàm main:", err);
    // Vẫn cố gắng ghi log lỗi
    addSystemLog("Lỗi Hệ thống", `Quy trình chính thất bại: ${err.message}`)
        .finally(() => process.exit(1));
});
