// Cập nhật scripts/gold_scraper.js
const axios = require('axios');
const fs = require('fs').promises; 
const { parseStringPromise } = require('xml2js');

// 1. Định nghĩa các hằng số
const API_KEY = process.env.DOJI_API_KEY; 
const API_URL = `http://giavang.doji.vn/api/giavang/?api_key=${API_KEY}`;
const HISTORY_FILE = 'gold_history.json';
const TARGET_PRODUCT_NAME = "Nhẫn Tròn 9999 Hưng Thịnh Vượng";
const MAX_HISTORY_ENTRIES = 300; // Giới hạn số bản ghi giá cho mỗi sản phẩm

// 2. Hàm chính để chạy tác vụ
async function scrapeAndSaveRingPrice() {
    try {
        console.log(`Đang gọi API DOJI để lấy giá tại: ${new Date().toISOString()}`);

        // --- 1. GỌI API VÀ PARSE XML (Giữ nguyên) ---
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
            process.exit(1); // Thoát nếu không có dữ liệu
        }

        // --- 2. TRÍCH XUẤT DỮ LIỆU GIÁ MỚI ---
        const newPriceEntry = {
            timestamp: new Date().toISOString(),
            ring_buy: ringRow.Attr.Buy.replace(/,/g, ''),
            ring_sell: ringRow.Attr.Sell.replace(/,/g, '')
        };
        
        console.log("Dữ liệu mới thu thập:", newPriceEntry);

        // --- 3. ĐỌC DỮ LIỆU LỊCH SỬ (THEO FORMAT MỚI) ---
        let history = []; // Đây là mảng chứa các đối tượng SẢN PHẨM
        try {
            const historyContent = await fs.readFile(HISTORY_FILE, 'utf8');
            history = JSON.parse(historyContent);
            if (!Array.isArray(history)) history = [];
        } catch (readError) {
            console.log("File lịch sử chưa tồn tại hoặc rỗng, tạo mới.");
            history = [];
        }

        // --- 4. TÌM HOẶC TẠO ĐỐI TƯỢNG SẢN PHẨM ---
        // (Sửa lỗi format của bạn: Cần một đối tượng {} bao quanh)
        let productData = history.find(p => p.product_name === TARGET_PRODUCT_NAME);

        if (!productData) {
            console.log(`Tạo mục mới cho sản phẩm "${TARGET_PRODUCT_NAME}"`);
            productData = {
                product_name: TARGET_PRODUCT_NAME,
                gia: [] // 'gia' là một mảng chứa các mức giá
            };
            history.push(productData); // Thêm sản phẩm mới này vào mảng chính
        }

        // --- 5. KIỂM TRA THAY ĐỔI GIÁ (LOGIC CỐT LÕI) ---
        // Lấy bản ghi giá gần nhất (nằm ở đầu mảng 'gia')
        const latestEntry = productData.gia[0]; 

        let hasChanged = false;

        if (!latestEntry) {
            // Nếu mảng 'gia' rỗng, đây là giá đầu tiên
            console.log("Thêm giá đầu tiên cho sản phẩm.");
            hasChanged = true;
        } else if (latestEntry.ring_buy !== newPriceEntry.ring_buy || latestEntry.ring_sell !== newPriceEntry.ring_sell) {
            // Nếu giá mua HOẶC giá bán có thay đổi
            console.log("Phát hiện thay đổi giá. Thêm vào lịch sử.");
            console.log(`  Giá mua: ${latestEntry.ring_buy} -> ${newPriceEntry.ring_buy}`);
            console.log(`  Giá bán: ${latestEntry.ring_sell} -> ${newPriceEntry.ring_sell}`);
            hasChanged = true;
        } else {
            // Giá không thay đổi
            console.log("Giá không thay đổi. Bỏ qua không lưu.");
            hasChanged = false;
        }

        // --- 6. LƯU LỊCH SỬ NẾU CÓ THAY ĐỔI ---
        if (hasChanged) {
            // Thêm mục nhập mới vào đầu mảng 'gia'
            productData.gia.unshift(newPriceEntry);

            // Giới hạn số lượng bản ghi giá trong mảng 'gia'
            if (productData.gia.length > MAX_HISTORY_ENTRIES) {
                productData.gia = productData.gia.slice(0, MAX_HISTORY_ENTRIES);
            }
            
            // Lưu lại TOÀN BỘ mảng 'history' (chứa các đối tượng sản phẩm)
            await fs.writeFile(HISTORY_FILE, JSON.stringify(history, null, 2));
            
            console.log(`Lưu thành công. "${TARGET_PRODUCT_NAME}" hiện có ${productData.gia.length} bản ghi giá.`);
        }

    } catch (error) {
        console.error("Lỗi nghiêm trọng khi lấy/xử lý dữ liệu:", error.message);
        process.exit(1); // Thoát với mã lỗi
    }
}

// Chạy hàm
scrapeAndSaveRingPrice();
