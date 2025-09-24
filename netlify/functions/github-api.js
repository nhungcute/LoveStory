// netlify/functions/github-api.js

// Lấy thông tin từ biến môi trường, an toàn tuyệt đối
const { GH_PAT, GITHUB_USERNAME, REPO_NAME, FILE_PATH } = process.env;
const API_URL = `https://api.github.com/repos/${GITHUB_USERNAME}/${REPO_NAME}/contents/${FILE_PATH}`;

// Hàm mã hóa/giải mã Base64
const base64Encode = (str) => Buffer.from(str).toString('base64');
const base64Decode = (str) => Buffer.from(str, 'base64').toString('utf8');

exports.handler = async (event, context) => {
    const headers = {
        'Authorization': `token ${GH_PAT}`,
        'Accept': 'application/vnd.github.v3+json'
    };

    // ----- XỬ LÝ YÊU CẦU LẤY DỮ LIỆU (GET) -----
    if (event.httpMethod === 'GET') {
        try {
            const response = await fetch(API_URL, { headers });
            if (!response.ok) {
                return { statusCode: response.status, body: response.statusText };
            }
            const data = await response.json();
            return {
                statusCode: 200,
                body: JSON.stringify({
                    content: JSON.parse(base64Decode(data.content)),
                    sha: data.sha
                })
            };
        } catch (error) {
            return { statusCode: 500, body: `Lỗi khi đọc file: ${error.message}` };
        }
    }

    // ----- XỬ LÝ YÊU CẦU CẬP NHẬT DỮ LIỆU (POST/PUT) -----
    if (event.httpMethod === 'POST') {
        try {
            const { message, content, sha } = JSON.parse(event.body);

            const body = JSON.stringify({
                message: message,
                content: base64Encode(JSON.stringify(content, null, 2)),
                sha: sha
            });

            const response = await fetch(API_URL, {
                method: 'PUT',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: body
            });

            if (!response.ok) {
                const errorData = await response.json();
                return { statusCode: response.status, body: JSON.stringify(errorData) };
            }
            const data = await response.json();
            return { statusCode: 200, body: JSON.stringify(data) };

        } catch (error) {
            return { statusCode: 500, body: `Lỗi khi ghi file: ${error.message}` };
        }
    }

    // Trả về lỗi nếu phương thức không được hỗ trợ
    return { statusCode: 405, body: 'Method Not Allowed' };
};
