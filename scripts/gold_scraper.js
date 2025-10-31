// scripts/gold_scraper.js

const axios = require('axios');
const fs = require('fs/promises'); 
const { parseStringPromise } = require('xml2js');

// 1. THÊM HÀM ĐỊNH DẠNG NGÀY GIỜ
/**
 * Chuyển đối tượng Date sang định dạng 'yyyy-MM-dd hh:mm:ss' (24h).
 * @param {Date} date Đối tượng Date.
 */
function formatTo24h(date) {
    const year = date.getFullYear();
    // Tháng, Ngày, Giờ, Phút, Giây: đảm bảo có 2 chữ số (padding)
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0'); 
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    
    // Lưu ý: Hàm này sẽ sử dụng múi giờ của môi trường chạy (UTC trên GitHub Actions)
    // Nếu bạn muốn múi giờ Việt Nam (+7), cần phải xử lý dịch chuyển múi giờ.
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// 2. Định nghĩa các hằng số (Giữ nguyên)
const API_KEY = process.env.DOJI_API_KEY; 
// ...

// 3. Hàm chính để chạy tác vụ
async function scrapeAndSaveRingPrice() {
    try {
        // ... (phần lấy và xử lý dữ liệu XML giữ nguyên) ...

        // --- CHUẨN BỊ DỮ LIỆU ĐỂ LƯU VÀO LỊCH SỬ ---
        const now = new Date(); // Lấy thời gian hiện tại của Action Runner (thường là UTC)
        const newEntry = {
            // SỬ DỤNG HÀM MỚI ĐỂ ĐỊNH DẠNG TIMESTAMP
            timestamp: formatTo24h(now), 
            date_api: result.GoldList.JewelryList.DateTime,
            ring_buy: ringRow.Attr.Buy.replace(/,/g, ''), 
            ring_sell: ringRow.Attr.Sell.replace(/,/g, ''), 
            product_name: ringRow.Attr.Name 
        };
        
        console.log("Dữ liệu Nhẫn Tròn mới thu thập:", newEntry);

        // ... (phần đọc, cập nhật và lưu lịch sử giữ nguyên) ...

    } catch (error) {
        console.error("Lỗi nghiêm trọng khi lấy/xử lý dữ liệu Nhẫn Tròn:", error.message);
    }
}

scrapeAndSaveRingPrice();
