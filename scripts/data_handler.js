const fs = require('fs').promises;
const path = require('path');

// 1. Lấy biến môi trường (do YML cung cấp)
const { FILE_PATH, ACTION_TYPE, PAYLOAD } = process.env;

if (!FILE_PATH || !ACTION_TYPE || !PAYLOAD) {
    console.error("Thiếu các biến môi trường!");
    process.exit(1);
}

// 2. Hàm đọc file an toàn (tạo mảng rỗng nếu file không tồn tại)
async function readJsonFile(filePath) {
    try {
        const content = await fs.readFile(filePath, 'utf8');
        return JSON.parse(content);
    } catch (e) {
        console.warn(`Không tìm thấy file ${filePath}, sẽ tạo mới.`);
        return [];
    }
}

// 3. Hàm chạy chính
async function handleData() {
    let data = await readJsonFile(FILE_PATH);
    if (!Array.isArray(data)) data = [];
    
    // Parse payload từ JSON string
    const payload = JSON.parse(PAYLOAD);

    console.log(`Đang thực thi: ${ACTION_TYPE} trên file ${FILE_PATH}`);

    // 4. Xử lý các "lệnh" (action)
    switch (ACTION_TYPE) {
        
        // Ghi đè toàn bộ file (dùng cho Logs, Comments, Portfolio)
        case 'OVERWRITE':
            data = payload;
            break;

        // Thêm một mục mới (dùng cho Events)
        case 'ADD':
            data.push(payload);
            break;
            
        // Cập nhật một mục (dùng cho Events)
        case 'UPDATE':
            const indexToUpdate = data.findIndex(item => item.id === payload.id);
            if (indexToUpdate > -1) {
                data[indexToUpdate] = payload;
            } else {
                data.push(payload); // An toàn: Thêm mới nếu không tìm thấy
            }
            break;

        // Xóa một mục (dùng cho Events, Giao dịch vàng)
        case 'DELETE':
            data = data.filter(item => item.id !== payload.id);
            break;

        // Thêm một loạt log (dùng cho saveLogsBatch)
        case 'ADD_LOGS':
            data.unshift(...payload.reverse());
            if (data.length > 1000) {
                 data = data.slice(0, 1000);
            }
            break;
            
        default:
            console.error(`Loại hành động không xác định: ${ACTION_TYPE}`);
            process.exit(1);
    }

    // 5. Ghi lại file
    await fs.writeFile(FILE_PATH, JSON.stringify(data, null, 2));
    console.log(`✅ Đã xử lý và lưu ${FILE_PATH} thành công.`);
}

handleData().catch(err => {
    console.error(err);
    process.exit(1);
});
