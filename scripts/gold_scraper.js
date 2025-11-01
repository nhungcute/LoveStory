// Cập nhật scripts/gold_scraper.js
const axios = require('axios');
const fs = require('fs/promises'); 
const { parseStringPromise } = require('xml2js');

// 1. Định nghĩa các hằng số (Giữ nguyên)
const API_KEY = process.env.DOJI_API_KEY; 
const API_URL = `http://giavang.doji.vn/api/giavang/?api_key=${API_KEY}`;
const HISTORY_FILE = 'gold_history.json';

// 2. Hàm chính để chạy tác vụ
async function scrapeAndSaveRingPrice() {
    try {
        console.log(`Đang gọi API DOJI để lấy giá Nhẫn Tròn tại: ${new Date().toISOString()}`);

        // --- GỌI API VÀ LẤY DỮ LIỆU XML ---
        const response = await axios.get(API_URL);
        const xmlData = response.data;

        // --- CHUYỂN XML SANG JSON ---
        const result = await parseStringPromise(xmlData, { 
            explicitArray: false, 
            attrkey: "Attr" 
        });
        
        // 1. Lấy danh sách các loại nữ trang/nhẫn (JewelryList)
        const jewelryRows = result.GoldList.JewelryList.Row;

        // 2. Tìm kiếm Row có Name là "Nhẫn Tròn 9999 Hưng Thịnh Vượng"
        const ringRow = Array.isArray(jewelryRows) 
            ? jewelryRows.find(row => row.Attr.Name === "Nhẫn Tròn 9999 Hưng Thịnh Vượng") 
            : null;

        // Kiểm tra dữ liệu hợp lệ
        if (!ringRow || !ringRow.Attr) {
            console.error("Lỗi: Không tìm thấy dữ liệu Nhẫn Tròn 9999 Hưng Thịnh Vượng.");
            return;
        }

        // --- CHUẨN BỊ DỮ LIỆU ĐỂ LƯU VÀO LỊCH SỬ ---
        const newEntry = {
            timestamp: new Date().toISOString(),
            //date_api: result.GoldList.JewelryList.DateTime,
            // Trích xuất và làm sạch giá (xóa dấu phẩy)
            ring_buy: ringRow.Attr.Buy.replace(/,/g, ''), 
            ring_sell: ringRow.Attr.Sell.replace(/,/g, ''), 
            // Giữ lại tên sản phẩm để xác nhận
            product_name: ringRow.Attr.Name 
        };
        
        console.log("Dữ liệu Nhẫn Tròn mới thu thập:", newEntry);

        // --- ĐỌC, CẬP NHẬT VÀ LƯU LỊCH SỬ ---
        let history = [];
        try {
            const historyContent = await fs.readFile(HISTORY_FILE, 'utf8');
            history = JSON.parse(historyContent);
            if (!Array.isArray(history)) history = [];
            // Giới hạn bản ghi
            if (history.length > 300) {
                 history = history.slice(0, 300);
            }
        } catch (readError) {
            console.log("File lịch sử chưa tồn tại hoặc rỗng, tạo mới.");
        }

        // Thêm mục nhập mới vào đầu
        history.unshift(newEntry); 
        
        // Lưu lại file JSON
        await fs.writeFile(HISTORY_FILE, JSON.stringify(history, null, 2));

        console.log(`Lưu thành công ${history.length} bản ghi giá Nhẫn Tròn vào ${HISTORY_FILE}`);

    } catch (error) {
        console.error("Lỗi nghiêm trọng khi lấy/xử lý dữ liệu Nhẫn Tròn:", error.message);
    }
}

scrapeAndSaveRingPrice();
