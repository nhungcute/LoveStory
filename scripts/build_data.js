const axios = require('axios');
const { parseStringPromise } = require('xml2js');

// Lấy biến môi trường
const { DOJI_API_KEY, APPS_SCRIPT_URL } = process.env;

// Cấu hình
const TARGET_PRODUCT_NAME = "Nhẫn Tròn 9999 Hưng Thịnh Vượng";
const DOJI_API_URL = `http://giavang.doji.vn/api/giavang/?api_key=${DOJI_API_KEY}`;

async function main() {
    // Kiểm tra cấu hình
    if (!DOJI_API_KEY || !APPS_SCRIPT_URL) {
        console.error("❌ Lỗi: Thiếu DOJI_API_KEY hoặc APPS_SCRIPT_URL trong Secrets.");
        process.exit(1);
    }

    try {
        // BƯỚC 1: LẤY GIÁ VÀNG TỪ DOJI
        console.log("⏳ Đang lấy dữ liệu từ DOJI...");
        // [TỐI ƯU] Thêm timeout để tránh treo khi API chậm
        const response = await axios.get(DOJI_API_URL, { timeout: 15000 }); // Chờ tối đa 15 giây
        
        // Parse XML sang JSON
        const result = await parseStringPromise(response.data, { 
            explicitArray: false, 
            attrkey: "Attr" 
        });
        
        // Tìm sản phẩm nhẫn tròn
        const jewelryRows = result.GoldList.JewelryList.Row;
        const ringRow = Array.isArray(jewelryRows) 
            ? jewelryRows.find(row => row.Attr.Name === TARGET_PRODUCT_NAME) 
            : null;

        if (!ringRow) {
            console.error(`⚠️ Không tìm thấy sản phẩm: ${TARGET_PRODUCT_NAME}`);
            return;
        }

        // Format dữ liệu
        const buyPrice = parseInt(ringRow.Attr.Buy.replace(/,/g, ''));
        const sellPrice = parseInt(ringRow.Attr.Sell.replace(/,/g, ''));
        const now = new Date().toISOString();

        console.log(`💰 Giá hiện tại: Mua ${buyPrice.toLocaleString()} - Bán ${sellPrice.toLocaleString()}`);
       // BƯỚC 2: GỬI SANG GOOGLE SHEETS (APPS SCRIPT)
        console.log("🚀 Đang gửi dữ liệu sang Google Sheets...");
        
        const sheetResponse = await axios.post(APPS_SCRIPT_URL, {
            action: 'update_gold_price',
            timestamp: now,
            buy: buyPrice,
            sell: sellPrice
        }, {
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            followRedirects: true
        });

        // --- [TỐI ƯU] LOGIC GHI NHẬN PHẢN HỒI ---
        // Kiểm tra xem phản hồi có phải là JSON object hợp lệ không
        if (typeof sheetResponse.data === 'object' && sheetResponse.data !== null) {
            if (sheetResponse.data.status === 'skipped') {
                // Server báo giá không đổi, bỏ qua
                console.log("🟡 [SKIPPED] " + sheetResponse.data.message);
            } else if (sheetResponse.data.status === 'success') {
                // Server báo đã ghi thành công
                console.log("✅ [SUCCESS] " + sheetResponse.data.message);
            } else {
                // Là object nhưng không có status mong muốn
                console.log("ℹ️ [UNEXPECTED JSON] Server response:", JSON.stringify(sheetResponse.data));
            }
        } else {
             // Phản hồi không phải là object (thường là HTML do redirect)
             console.error("❌ [INVALID RESPONSE] Phản hồi từ Apps Script không phải là JSON. Có thể đã bị redirect hoặc lỗi server.");
             console.log("   Raw response data:", sheetResponse.data);
        }

    } catch (error) {
        console.error("❌ Lỗi:", error.message);
        if (error.response) {
            console.error("Chi tiết lỗi server:", error.response.data);
        }
        process.exit(1);
    }
}

main();