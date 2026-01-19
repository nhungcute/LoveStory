const axios = require('axios');
const { parseStringPromise } = require('xml2js');

// Lấy biến môi trường
const { DOJI_API_KEY, APPS_SCRIPT_URL } = process.env;

// Cấu hình
const TARGET_PRODUCT_NAME = "Nhẫn Tròn 9999 Hưng Thịnh Vượng";
const DOJI_API_URL = `http://giavang.doji.vn/api/giavang/?api_key=${DOJI_API_KEY}`;

async function main() {
    // Kiểm tra cấu hình
    if (!APPS_SCRIPT_URL) {
        console.error("❌ Lỗi: Thiếu APPS_SCRIPT_URL trong Secrets.");
        process.exit(1);
    }

    try {
        // BƯỚC 1: LẤY GIÁ VÀNG TỪ DOJI
        console.log("⏳ Đang lấy dữ liệu từ DOJI...");
        const response = await axios.get(DOJI_API_URL);
        
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
        
        await axios.post(APPS_SCRIPT_URL, {
            action: 'update_gold_price',
            timestamp: now,
            buy: buyPrice,
            sell: sellPrice
        }, {
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            followRedirects: true
        });

        console.log("✅ Thành công! Dữ liệu đã được cập nhật.");

    } catch (err) {
        console.error("❌ Có lỗi xảy ra:", err.message);
        process.exit(1);
    }
}

main();
