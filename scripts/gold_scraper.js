// Cập nhật scripts/gold_scraper.js
const axios = require('axios');
const fs = require('fs').promises; 
const { parseStringPromise } = require('xml2js');

// 1. Định nghĩa các hằng số
const API_KEY = process.env.DOJI_API_KEY; 
const API_URL = `http://giavang.doji.vn/api/giavang/?api_key=${API_KEY}`;
const HISTORY_FILE = 'gold_history.json';
const LOGS_PATH = 'logs.json'; // Đường dẫn file log
const LOG_STATE_FILE = 'gold_log_state.txt'; // File lưu trạng thái log
const TARGET_PRODUCT_NAME = "Nhẫn Tròn 9999 Hưng Thịnh Vượng";
const MAX_HISTORY_ENTRIES = 300; 

// === HÀM GHI LOG HỆ THỐNG (MỚI) ===
// (Hàm này được sao chép từ build_data.js để sử dụng)
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


// 2. Hàm chính để chạy tác vụ
async function scrapeAndSaveRingPrice() {
    try {
        console.log(`Đang gọi API DOJI để lấy giá tại: ${new Date().toISOString()}`);

        // --- 1. GỌI API VÀ PARSE XML ---
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
            // Ghi log lỗi 1 lần/ngày
            await checkAndLogPrice("Lỗi Hệ thống", "Tải giá vàng thất bại: Không tìm thấy sản phẩm.");
            process.exit(1); 
        }

        // --- 2. TRÍCH XUẤT DỮ LIỆU GIÁ MỚI ---
        const newPriceEntry = {
            timestamp: new Date().toISOString(),
            ring_buy: ringRow.Attr.Buy.replace(/,/g, ''),
            ring_sell: ringRow.Attr.Sell.replace(/,/g, '')
        };
        
        console.log("Dữ liệu mới thu thập:", newPriceEntry);

        // --- 3. ĐỌC DỮ LIỆU LỊCH SỬ ---
        let history = [];
        try {
            const historyContent = await fs.readFile(HISTORY_FILE, 'utf8');
            history = JSON.parse(historyContent);
            if (!Array.isArray(history)) history = [];
        } catch (readError) {
            console.log("File lịch sử chưa tồn tại hoặc rỗng, tạo mới.");
            history = [];
        }

        // --- 4. TÌM HOẶC TẠO ĐỐI TƯỢNG SẢN PHẨM ---
        let productData = history.find(p => p.product_name === TARGET_PRODUCT_NAME);

        if (!productData) {
            console.log(`Tạo mục mới cho sản phẩm "${TARGET_PRODUCT_NAME}"`);
            productData = {
                product_name: TARGET_PRODUCT_NAME,
                gia: []
            };
            history.push(productData);
        }

        // --- 5. KIỂM TRA THAY ĐỔI GIÁ ---
        const latestEntry = productData.gia[0]; 
        let hasChanged = false;

        if (!latestEntry) {
            console.log("Thêm giá đầu tiên cho sản phẩm.");
            hasChanged = true;
        } else if (latestEntry.ring_buy !== newPriceEntry.ring_buy || latestEntry.ring_sell !== newPriceEntry.ring_sell) {
            console.log("Phát hiện thay đổi giá. Thêm vào lịch sử.");
            hasChanged = true;
        } else {
            console.log("Giá không thay đổi. Bỏ qua không lưu.");
            hasChanged = false;
        }

        // --- 6. LƯU LỊCH SỬ VÀ GHI LOG (NẾU CÓ THAY ĐỔI) ---
        if (hasChanged) {
            productData.gia.unshift(newPriceEntry);
            if (productData.gia.length > MAX_HISTORY_ENTRIES) {
                productData.gia = productData.gia.slice(0, MAX_HISTORY_ENTRIES);
            }
            
            await fs.writeFile(HISTORY_FILE, JSON.stringify(history, null, 2));
            console.log(`Lưu thành công. "${TARGET_PRODUCT_NAME}" hiện có ${productData.gia.length} bản ghi giá.`);
            
            // ▼▼▼ LOGIC MỚI: Chỉ ghi log nếu đây là lần đầu trong ngày ▼▼▼
            const logMessage = `Giá vàng thay đổi: Mua ${newPriceEntry.ring_buy}, Bán ${newPriceEntry.ring_sell}`;
            await checkAndLogPrice("Cập nhật giá vàng", logMessage);

        }

    } catch (error) {
        console.error("Lỗi nghiêm trọng khi lấy/xử lý dữ liệu:", error.message);
        // Ghi log lỗi 1 lần/ngày
        await checkAndLogPrice("Lỗi Hệ thống", `Tải giá vàng thất bại: ${error.message}`);
        process.exit(1); 
    }
}

/**
 * Hàm hỗ trợ kiểm tra xem đã log hôm nay chưa, nếu chưa thì mới ghi log.
 */
async function checkAndLogPrice(action, details) {
    const todayStr = new Date().toISOString().split('T')[0]; // "2025-11-02"
    let lastLogDate = '';

    try {
        lastLogDate = await fs.readFile(LOG_STATE_FILE, 'utf8');
    } catch (e) {
        console.log("Không tìm thấy file trạng thái log, sẽ tạo mới.");
    }

    // Nếu ngày cuối cùng ghi log KHÁC hôm nay
    if (lastLogDate !== todayStr) {
        console.log("Ghi log lần đầu trong ngày...");
        
        // Phải dùng await cho cả hai
        await addSystemLog(action, details);
        await fs.writeFile(LOG_STATE_FILE, todayStr); // Cập nhật file trạng thái
    } else {
        console.log("Đã log hôm nay, bỏ qua ghi log.");
    }
}

// Chạy hàm
scrapeAndSaveRingPrice();
