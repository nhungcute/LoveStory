// =======================================================
// CODE.GS - SOCIAL MEMORY API (FIXED SORTING & TIMEZONE)
// =======================================================

var READ_ONLY_ACTIONS = [
  'get_critical_stats',
  'get_background_info',
  'get_profile',
  'get_profile_by_username',
  'get_babyrun_count',
  'get_bike_stats',
  'get_feed',
  'get_gold_data',
  'get_notifications',
  'get_unread_count',
  'get_post_comments',
  'ai_chat',
  'list_documents'
];


function doPost(e) {
  var data = JSON.parse(e.postData.contents);
  var action = data.action;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var result = {};
 
  // --- PHÂN LUỒNG: ĐỌC hay GHI? ---
  var isReadOnly = READ_ONLY_ACTIONS.indexOf(action) !== -1;
 
  if (isReadOnly) {
    // ==============================================
    // LUỒNG ĐỌC: Không cần lock, chạy ngay lập tức
    // ==============================================
    try {
      result = routeAction(ss, action, data);
      return responseJSON(result);
    } catch (err) {
      return responseJSON({ status: 'error', message: err.toString() });
    }
 
  } else {
    // ==============================================
    // LUỒNG GHI: Cần lock để tránh xung đột dữ liệu
    // ==============================================
    var lock = LockService.getScriptLock();
    if (lock.tryLock(10000)) {
      try {
        result = routeAction(ss, action, data);
        return responseJSON(result);
      } catch (err) {
        return responseJSON({ status: 'error', message: err.toString() });
      } finally {
        lock.releaseLock();
      }
    } else {
      return responseJSON({ status: 'error', message: 'Server busy, try again.' });
    }
  }
}
 
// ==========================================================
// HÀM ĐIỀU PHỐI — Tách switch/case ra hàm riêng cho gọn
// ==========================================================
function routeAction(ss, action, data) {
  switch (action) {
    // --- TẢI TRANG ---
    case 'get_critical_stats':
      return handleGetCriticalStats(ss, data);
    case 'get_background_info':
      return handleGetBackgroundInfo(ss, data);
 
    // --- NHÓM 1: PROFILE ---
    case 'get_profile':
      return handleGetProfile(ss, data);
    case 'save_profile':
      return handleSaveProfile(ss, data);
    case 'get_profile_by_username':
      return handleGetProfileByUsername(ss, data);
 
    // --- NHÓM 2: BABY RUN & STATS ---
    case 'get_babyrun_count':
      return handleGetBabyRunCount(ss, data);
    case 'log_babyrun':
      return handleLogBabyRun(ss, data);
    case 'get_bike_stats':
      return handleGetBikeStats(ss, data);
 
    // --- NHÓM 3: FEED ---
    case 'feed_action':
      return handleFeedAction(ss, data);
    case 'get_feed':
      return handleGetFeed(ss, data);
    case 'upload_single_image':
      return handleUploadSingleImage(data);
 
    // --- NHÓM 4: GOLD ---
    case 'log_gold_transaction':
      return handleLogGoldTransaction(ss, data);
    case 'get_gold_data':
      return handleGetGoldData(ss, data);
    case 'delete_gold_transaction':
      return handleDeleteGoldTransaction(ss, data);
    case 'update_gold_price':
      return handleAutoUpdateGold(ss, data);
    case 'update_gold_transaction':
      return handleUpdateGoldTransaction(ss, data);
 
    // --- NHÓM 5: THÔNG BÁO ---
    case 'notification_action':
      return handleNotificationAction(ss, data);
    case 'get_notifications':
      return handleGetNotifications(ss, data);
    case 'get_unread_count':
      return handleGetUnreadCount(ss);
 
    // --- NHÓM 6: LIKE & COMMENT ---
    case 'like_post':
      return handleLikePost(ss, data);
    case 'comment_action':
      return handleCommentAction(ss, data);
    case 'get_post_comments':
      return handleGetPostComments(ss, data);
 
    // --- NHÓM 7: ALERT ---
    case 'create_alert_bot':
      return handleCreateAlert(ss, data);
 
    // --- NHÓM 8: AI CHAT & TÀI LIỆU ---
    case 'ai_chat':
      return handleAiChat(ss, data);
    case 'upload_document':
      return handleUploadDocument(ss, data);
    case 'upload_file_chunk':
      return handleUploadFileChunk(ss, data);
    case 'process_text_chunks':
      return handleProcessTextChunks(ss, data);
    case 'list_documents':
      return handleListDocuments(ss);
    case 'delete_document':
      return handleDeleteDocument(ss, data);

    default:
      return { status: 'error', message: 'Unknown action: ' + action };
  }
}

// --- CẤU HÌNH ---
// Thay ID thư mục bạn vừa lấy được vào đây
const DRIVE_FOLDER_ID = "1J6s_9PbYjB86Qe2fYhhz1oaki35yBDDF";
const GA_K1 = "AIzaSyA-D8bfUojVy";
const GA_K2 = "PTDuBFv2CJNHeZSrVYBO7I";

// --- CORE FUNCTIONS ---

function handleGetProfile(ss, data) {
  var sheet = getSheet(ss, "profiles");
  var rows = sheet.getDataRange().getValues();
  for (var i = rows.length - 1; i >= 1; i--) {
    if (rows[i][0] == data.fingerprint) {
      return {
        status: 'success',
        data: {
          username: rows[i][1], fullname: rows[i][2],
          theme: rows[i][3], avaurl: rows[i][4]
        }
      };
    }
  }
  return { status: 'not_found' };
}



// --- HÀM LẤY THỐNG KÊ BIKE (HỖ TRỢ PHÂN TRANG & TỐI ƯU TỐC ĐỘ) ---
function handleGetBikeStats(ss, data) {
  // Tham số phân trang (Mặc định trang 1, 20 dòng)
  var page = data.page || 1;
  var limit = data.limit || 20;
  
  var stats = { today: 0, week: 0, month: 0 };
  var chartHistory = [];
  
  // 1. CHỈ TÍNH STATS KHI Ở TRANG 1 (Để tải thêm lịch sử nhanh hơn)
  if (page === 1) {
    var sheetTotal = ss.getSheetByName("totalbabyrun");
    
    // Cấu hình thời gian
    var now = new Date();
    var todayStr = Utilities.formatDate(now, "GMT+7", "dd/MM/yyyy");
    var currentMonthStr = Utilities.formatDate(now, "GMT+7", "MM/yyyy");

    // Tính ngày đầu tuần (Thứ 2)
    var tempDate = new Date(now.getTime());
    var day = tempDate.getDay(); 
    var diff = tempDate.getDate() - day + (day == 0 ? -6 : 1);
    var monday = new Date(tempDate.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    var startOfWeekTime = monday.getTime();

    if (sheetTotal) {
      var rows = sheetTotal.getDataRange().getValues();
      for (var i = 1; i < rows.length; i++) {
        var rawDate = rows[i][0];
        var count = parseInt(rows[i][1]);
        if (rawDate == "" || isNaN(count)) continue;

        var dateStr = "";
        if (Object.prototype.toString.call(rawDate) === '[object Date]') {
          dateStr = Utilities.formatDate(rawDate, "GMT+7", "dd/MM/yyyy");
        } else {
          dateStr = String(rawDate).trim();
        }

        // Stats Logic
        if (dateStr === todayStr) stats.today = count;
        if (dateStr.length >= 10 && dateStr.substring(3) === currentMonthStr) stats.month += count;
        
        // Week Logic
        var parts = dateStr.split('/');
        if (parts.length === 3) {
          var rowTime = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0])).getTime();
          if (rowTime >= startOfWeekTime) stats.week += count;
        }

        // Chart Data
        if (count > 0) chartHistory.push({ date: dateStr, count: count });
      }
      
      // Sắp xếp Chart
      chartHistory.sort(function(a, b) {
         return parseDateToTime(a.date) - parseDateToTime(b.date);
      });
    }
  }

  // 2. LẤY LOGS CHI TIẾT (PHÂN TRANG)
  var detailLogs = [];
  var sheetRaw = ss.getSheetByName("babyrun");
  if (sheetRaw) {
    var lastRow = sheetRaw.getLastRow(); // Ví dụ: 100 dòng
    var totalDataRows = lastRow - 1;     // Trừ header
    
    if (totalDataRows > 0) {
      // Công thức phân trang từ dưới lên (Mới nhất nằm dưới cùng)
      // Trang 1: Lấy từ (Total) -> lùi về limit
      var endIndex = totalDataRows - ((page - 1) * limit); 
      var startIndex = endIndex - limit + 1;
      
      // Giới hạn không lấy âm
      if (endIndex > 0) {
        if (startIndex < 1) startIndex = 1;
        
        var numRowsToGet = endIndex - startIndex + 1;
        // +1 vì dòng 1 là Header, dữ liệu bắt đầu từ dòng 2
        var rangeStartRow = startIndex + 1; 
        
        var rawData = sheetRaw.getRange(rangeStartRow, 1, numRowsToGet, 4).getDisplayValues();
        
        // Đảo ngược để Mới nhất lên đầu
        detailLogs = rawData.reverse().map(function(r) {
          return { username: r[1], date: r[2], time: r[3] };
        });
      }
    }
  }

  return {
    status: 'success',
    page: page,
    stats: stats,
    history: chartHistory, 
    logs: detailLogs,
    hasMore: (detailLogs.length === limit) // Cờ báo còn dữ liệu không
  };
}

// Hàm phụ trợ: Chuyển chuỗi "dd/MM/yyyy" thành timestamp để so sánh
function parseDateToTime(dateStr) {
  if (!dateStr) return 0;
  var parts = dateStr.split('/'); // [dd, MM, yyyy]
  if (parts.length < 3) return 0;
  // Lưu ý: Month trong JS bắt đầu từ 0 (Tháng 1 là 0)
  return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0])).getTime();
}

// [CẬP NHẬT] Lấy thống kê Home (Lượt đạp + Giá vàng mới nhất)
// [CẬP NHẬT] Lấy thống kê Home (Lượt đạp + Giá vàng mới nhất)
function handleGetBabyRunCount(ss, data) {
  // 1. LẤY SỐ LƯỢT ĐẠP (Giữ nguyên logic cũ)
  var dateStr = data.date; 
  var sheet = ss.getSheetByName("totalbabyrun");
  var count = 0;
  
  if (sheet) {
    var rows = sheet.getDataRange().getDisplayValues();
    for (var i = 1; i < rows.length; i++) {
      if (rows[i][0] === dateStr) {
        count = parseInt(rows[i][1]) || 0;
        break;
      }
    }
  }

  // 2. [MỚI] LẤY GIÁ VÀNG TỪ SHEET 'goldchart' (Lấy max date và data chart)
  var goldSheet = ss.getSheetByName("goldchart");
  var goldPrice = { buy: 0, sell: 0, timestamp: '' };
  var goldHistory = [];
  
  if (goldSheet && goldSheet.getLastRow() > 1) {
    var goldData = goldSheet.getDataRange().getValues();
    // Cấu trúc: [Timestamp, Date, Time, Buy, Sell]
    var parsedGold = [];
    for (var i = 1; i < goldData.length; i++) {
        var r = goldData[i];
        if (!r[1]) continue; // Skip empty rows
        
        var tValue = r[0]; // Timestamp
        
        var dateStr = "";
        if (Object.prototype.toString.call(r[1]) === '[object Date]') {
            dateStr = Utilities.formatDate(r[1], "GMT+7", "dd/MM/yyyy");
        } else {
            dateStr = String(r[1]).trim();
        }
        var dateParts = dateStr.split('/'); // dd/MM/yyyy
        
        if (dateParts.length === 3) {
            // Sort keys: use Date + Time if possible
            var timeStr = "";
            if (Object.prototype.toString.call(r[2]) === '[object Date]') {
                timeStr = Utilities.formatDate(r[2], "GMT+7", "HH:mm:ss");
            } else {
                timeStr = String(r[2] || "00:00:00").trim();
            }
            var timeParts = timeStr.split(':');
            
            var hr = parseInt(timeParts[0]) || 0;
            var min = parseInt(timeParts[1]) || 0;
            var sec = parseInt(timeParts[2]) || 0;
            
            var timeMs = new Date(parseInt(dateParts[2]), parseInt(dateParts[1]) - 1, parseInt(dateParts[0]), hr, min, sec).getTime();
            
            parsedGold.push({
                timeMs: timeMs,
                dateStr: dateStr,
                timestampStr: (tValue instanceof Date) ? Utilities.formatDate(tValue, "GMT+7", "dd/MM/yyyy HH:mm:ss") : String(tValue),
                buy: parseInt(r[3]) || 0,
                sell: parseInt(r[4]) || 0
            });
        }
    }
    
    // Sort by timeMs ascending for chart
    parsedGold.sort(function(a, b) { return a.timeMs - b.timeMs; });
    
    // Get latest (last element after sorting)
    if (parsedGold.length > 0) {
        var latest = parsedGold[parsedGold.length - 1];
        goldPrice.buy = latest.buy;
        goldPrice.sell = latest.sell;
        goldPrice.timestamp = latest.timestampStr;
        
        goldHistory = parsedGold.map(function(item) {
            return { date: item.dateStr, buy: item.buy, sell: item.sell };
        });
    }
  }

  return { status: 'success', count: count, gold: goldPrice, goldHistory: goldHistory };
}

function handleLogBabyRun(ss, data) {
  var sheet = getSheet(ss, "babyrun");
  var id = Utilities.getUuid();
  var dateLog, timeLog;

  // Xử lý ngày giờ
  if (data.customDate && data.customTime) {
    dateLog = data.customDate;
    timeLog = data.customTime;
  } else {
    var now = new Date();
    dateLog = Utilities.formatDate(now, "GMT+7", "dd/MM/yyyy");
    timeLog = Utilities.formatDate(now, "GMT+7", "HH:mm:ss");
  }

  // Ghi log chi tiết
  sheet.appendRow([id, data.username, dateLog, timeLog]);
  
  // NOTE: Bạn cần có Trigger hoặc công thức trong Sheet để tự cập nhật vào 'totalbabyrun'
  // Script này chỉ ghi vào 'babyrun' (log thô) và đọc từ 'totalbabyrun' (log tổng).
  
  return { status: 'success', id: id };
}



// --- FEED HANDLERS ---
// --- XỬ LÝ ACTION THÔNG BÁO (ĐÃ BỔ SUNG TOGGLE READ) ---
// --- XỬ LÝ ACTION THÔNG BÁO ---
function handleNotificationAction(ss, data) {
  var sheet = getSheet(ss, "logs");
  var type = data.type; 
  var rows = sheet.getDataRange().getValues();
  
  // 1. Đánh dấu tất cả (Giữ nguyên)
  if (type === 'mark_all_read') {
    for (var i = 1; i < rows.length; i++) {
      if (rows[i][6] === false || rows[i][6] === 'false') {
        sheet.getRange(i + 1, 7).setValue(true);
      }
    }
    return { status: 'success' };
  }
  
  // 2. Xóa tất cả (Giữ nguyên)
  if (type === 'delete_all') {
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
       sheet.deleteRows(2, lastRow - 1);
    }
    return { status: 'success' };
  }

  // 3. Đổi trạng thái 1 thông báo (Giữ nguyên)
  if (type === 'toggle_read') {
    var id = data.id;
    var newStatus = data.status; 
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === String(id)) {
        sheet.getRange(i + 1, 7).setValue(newStatus);
        return { status: 'success' };
      }
    }
    return { status: 'error', message: 'Not found' };
  }

  // ======================================================
  // 4. [THÊM MỚI] XÓA 1 THÔNG BÁO CỤ THỂ
  // ======================================================
  if (type === 'delete_one') {
    var id = data.id;
    // Duyệt tìm dòng có ID trùng khớp để xóa
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === String(id)) {
        sheet.deleteRow(i + 1); // Xóa dòng (Row index bắt đầu từ 1)
        return { status: 'success' };
      }
    }
    return { status: 'error', message: 'Notification not found' };
  }
  
  return { status: 'error', message: 'Unknown type' };
}

// [MỚI] Hàm ghi Log vào sheet "logs"
function createLog(ss, username, actionType, title, content, relatedId) {
  var sheet = getSheet(ss, "logs");
  var id = Utilities.getUuid();
  var now = new Date();
  
  // Cắt nội dung ngắn gọn nếu quá dài
  var shortContent = content ? String(content).substring(0, 50) + (String(content).length > 50 ? '...' : '') : '';
  
  // Cấu trúc: [ID, Time, Username, Action, Title, ShortContent, IsRead, relatedId]
  sheet.appendRow([id, now, username, actionType, title, shortContent, false, relatedId || ""]);
}

// --- HÀM LẤY BẢNG TIN (CÓ PHÂN TRANG) ---
// [SỬA LẠI] Hàm lấy Feed: Đọc thêm cột Layout
// [FIX] Hàm lấy Feed: Sort chuẩn (Mới nhất lên đầu) + Lấy Layout
// --- CẬP NHẬT: LẤY FEED KÈM TRẠNG THÁI LIKE TỪ SHEET RIÊNG ---
// --- CẬP NHẬT: LẤY FEED + LIKE + COMMENT (LOAD LUÔN COMMENT) ---
// --- HÀM LẤY BẢNG TIN (CÓ PHÂN TRANG & LỌC HASHTAG) ---
// --- HÀM LẤY BẢNG TIN (CÓ PHÂN TRANG & LỌC ID & HASHTAG) ---
// --- HÀM LẤY BẢNG TIN (CÓ PHÂN TRANG, LỌC ID, HASHTAG & SEARCH) ---
function handleGetFeed(ss, data) {
  var page = data.page || 1;
  var limit = data.limit || 10;
  var currentUser = data.username || "";
  
  // Lấy các tham số lọc
  var filterHashtag = data.hashtag ? String(data.hashtag).toLowerCase().trim() : "";
  var filterId = data.postId ? String(data.postId) : ""; 
  // [MỚI] Lấy tham số tìm kiếm text
  var searchQuery = data.searchQuery ? String(data.searchQuery).toLowerCase().trim() : "";

  var feedSheet = ss.getSheetByName("feed");
  if (!feedSheet) return { status: 'success', data: [], hasMore: false };

  // 1. Lấy dữ liệu Like
  var likeSheet = getSheet(ss, "dtdlike");
  var likeRows = likeSheet.getDataRange().getValues();
  var likeStats = {};
  for (var k = 1; k < likeRows.length; k++) {
    var pId = String(likeRows[k][1]);
    var uName = String(likeRows[k][2]);
    if (!likeStats[pId]) likeStats[pId] = { count: 0, isLiked: false };
    likeStats[pId].count++;
    if (currentUser && uName === currentUser) likeStats[pId].isLiked = true;
  }

  // 2. Lấy dữ liệu Comment
  var commentSheet = getSheet(ss, "dtdcomment");
  var commentRows = commentSheet.getDataRange().getValues();
  var commentMap = {};

  // 3. Lấy Map Profile
  var profileSheet = ss.getSheetByName("profiles");
  var profileMap = {};
  if (profileSheet) {
    var pRows = profileSheet.getDataRange().getValues();
    for (var i = 1; i < pRows.length; i++) {
      var uKey = String(pRows[i][1]).toLowerCase();
      profileMap[uKey] = { fullname: pRows[i][2], avatar: pRows[i][4] };
    }
  }

  // Map Comment vào bài viết
  for (var c = 1; c < commentRows.length; c++) {
    var cPostId = String(commentRows[c][1]);
    var cUser = String(commentRows[c][2]);
    var cInfo = profileMap[cUser.toLowerCase()] || {};
    
    if (!commentMap[cPostId]) commentMap[cPostId] = [];
    commentMap[cPostId].push({
      id: commentRows[c][0],
      username: cUser,
      fullname: cInfo.fullname || cUser,
      avatar: cInfo.avatar || '',
      content: commentRows[c][3],
      time: commentRows[c][4],
      formattedTime: Utilities.formatDate(new Date(commentRows[c][4]), "GMT+7", "HH:mm dd/MM/yyyy")
    });
  }

  // 4. Xử lý bài viết và LỌC DỮ LIỆU
  var rows = feedSheet.getDataRange().getDisplayValues();
  var allPosts = [];
  
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    if (r[0]) {
      var currentId = String(r[0]);
      var content = r[3] || "";
      var uName = String(r[2]).toLowerCase();
      var info = profileMap[uName] || {};
      var fullname = info.fullname || r[2];
      
      // LOGIC LỌC
      // 1. Lọc theo ID (Ưu tiên cao nhất)
      if (filterId !== "" && currentId !== filterId) {
          continue;
      }
      
      // 2. Lọc theo Hashtag (Nếu không lọc ID)
      if (filterId === "" && filterHashtag !== "" && content.toLowerCase().indexOf(filterHashtag) === -1) {
        continue;
      }

      // 3. [MỚI] Lọc theo Search Query (Nếu không lọc ID và Hashtag)
      // Tìm trong nội dung HOẶC tên người đăng
      if (filterId === "" && filterHashtag === "" && searchQuery !== "") {
          var matchContent = content.toLowerCase().indexOf(searchQuery) > -1;
          var matchAuthor = fullname.toLowerCase().indexOf(searchQuery) > -1 || uName.indexOf(searchQuery) > -1;
          
          if (!matchContent && !matchAuthor) {
              continue; // Bỏ qua bài này nếu không khớp
          }
      }

      // ... Xử lý Timestamp ...
      var timestamp = 0;
      var createdAtStr = r[1] ? String(r[1]) : ""; // Store string to pass to frontend
      try {
        if (createdAtStr) {
           // Parse "dd/MM/yyyy HH:mm:ss" or similar
           // Example string: 18/03/2026 10:30:15
           var dateParts = createdAtStr.split(" ");
           var dayPart = dateParts[0];
           var timePart = dateParts.length > 1 ? dateParts[1] : "00:00:00";
           
           if(dayPart.indexOf("/") > -1) {
             var dParts = dayPart.split("/");
             var isoStr = dParts[2] + "-" + dParts[1] + "-" + dParts[0] + "T" + timePart;
             var d = new Date(isoStr);
             if(!isNaN(d.getTime())) {
                timestamp = d.getTime();
             }
           } else {
             var d = new Date(createdAtStr);
             if(!isNaN(d.getTime())) timestamp = d.getTime();
           }
        }
      } catch(e) { timestamp = 0; }

      var postId = String(r[0]);
      var stat = likeStats[postId] || { count: 0, isLiked: false };
      var postComments = commentMap[postId] || [];
      postComments.sort(function(a, b) { return new Date(a.time) - new Date(b.time); });

      allPosts.push({
        __backendId: r[0],
        id: r[0], // Explicit ID mapping
        createdAt: createdAtStr, // Pass raw string or formatted string
        timestamp: timestamp,
        username: r[2],
        fullname: fullname,
        avatar: info.avatar || '',
        content: content,
        imageURLs: r[4], // UI uses imageURLs array parser
        layout: r[5] || 'grid-2x2',
        likeCount: stat.count, // UI uses likeCount
        likedBy: stat.isLiked ? currentUser : '', // UI expects current user in likedBy
        commentCount: postComments.length, // UI uses commentCount
        commentsData: postComments 
      });
    }
  }

  // 5. Sắp xếp và Phân trang
  allPosts.sort(function(a, b) { return b.timestamp - a.timestamp; });
  var startIndex = (page - 1) * limit;
  var endIndex = startIndex + limit;
  var pagedPosts = allPosts.slice(startIndex, endIndex);
  return { status: 'success', data: pagedPosts, hasMore: endIndex < allPosts.length };
}

function handleSaveProfile(ss, data) {
  var sheet = getSheet(ss, "profiles");
  // Cột: A=DeviceID, B=Username, C=Fullname, D=Theme, E=Avatar, F=Timestamp
  var p = data.profile || {};
  var username = String(p.username || data.username || "").trim();
  if (!username || username === 'Guest' || username === 'undefined') return { status: 'error', message: 'Invalid username' };

  var fullname = String(p.fullname || username).trim();
  var theme = String(p.theme || "green").trim();
  var avatar = String(p.avaUrl || "").trim();
  var deviceId = String(data.deviceFingerprint || "").trim();
  var nowStr = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss");

  var rows = sheet.getDataRange().getValues();
  var rowIndex = -1;
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][1]).toLowerCase() === username.toLowerCase()) {
      rowIndex = i + 1;
      break;
    }
  }

  if (rowIndex > -1) {
    // Lấy avatar cũ để so sánh và xóa nếu cần
    var oldAvaUrl = sheet.getRange(rowIndex, 5).getValue();
    if (oldAvaUrl && avatar && String(oldAvaUrl) !== avatar && String(oldAvaUrl).indexOf('drive.google.com') !== -1) {
      try {
        var match = String(oldAvaUrl).match(/id=([a-zA-Z0-9_-]+)/) || String(oldAvaUrl).match(/file\/d\/([a-zA-Z0-9_-]+)/);
        if (match && match[1]) {
          DriveApp.getFileById(match[1]).setTrashed(true);
        }
      } catch(e) {
        // Bỏ qua nếu lỗi
      }
    }

    // Cập nhật (Cột A -> F)
    sheet.getRange(rowIndex, 1, 1, 6).setValues([[deviceId, username, fullname, theme, avatar, nowStr]]);
    return { status: 'success', message: 'Updated existing profile' };
  } else {
    // Thêm mới
    sheet.appendRow([deviceId, username, fullname, theme, avatar, nowStr]);
    return { status: 'success', message: 'Created new profile' };
  }
}

function handleGetProfileByUsername(ss, data) {
  var sheet = getSheet(ss, "profiles");
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][1]).toLowerCase() == String(data.username).toLowerCase()) {
      return {
        status: 'success',
        data: {
          username: rows[i][1], fullname: rows[i][2],
          theme: rows[i][3], avaurl: rows[i][4]
        }
      };
    }
  }
  return { status: 'not_found' };
}

// --- HÀM ĐẾM THÔNG BÁO CHƯA ĐỌC (Lightweight, for badge preload) ---


// [THÊM HÀM MỚI] GetNotifications
// --- HÀM LẤY THÔNG BÁO (CÓ FULLNAME & FORMAT NGÀY GIỜ) ---
function handleGetNotifications(ss, data) {
  var page = data.page || 1;
  var limit = data.limit || 10;
  
  var sheet = ss.getSheetByName("logs");
  if (!sheet) return { status: 'success', data: [], hasMore: false };

  // 1. Lấy Map Profile để tra cứu Fullname từ Username
  var profileSheet = ss.getSheetByName("profiles");
  var profileMap = {};
  if (profileSheet) {
    var pRows = profileSheet.getDataRange().getValues();
    for (var i = 1; i < pRows.length; i++) {
      var uName = String(pRows[i][1]).toLowerCase();
      // Key: username, Value: Fullname
      profileMap[uName] = pRows[i][2]; 
    }
  }

  var lastRow = sheet.getLastRow();
  var totalDataRows = lastRow - 1; 
  var notifications = [];
  var hasMore = false;

  if (totalDataRows > 0) {
    var endIndex = totalDataRows - ((page - 1) * limit);
    var startIndex = endIndex - limit + 1;
    
    if (endIndex >= 1) {
      if (startIndex < 1) startIndex = 1;
      hasMore = (startIndex > 1);
      
      var numRows = endIndex - startIndex + 1;
      var rangeStartRow = startIndex + 1;

      // [SỬA] Đọc 8 cột thay vì 7 (Để lấy thêm RelatedId ở cột H)
      var rows = sheet.getRange(rangeStartRow, 1, numRows, 8).getValues();

      notifications = rows.map(function(r) {
        var uName = String(r[2]).toLowerCase();
        
        var rawDate = r[1];
        var formattedTime = "";
        if (rawDate instanceof Date) {
             formattedTime = Utilities.formatDate(rawDate, "GMT+7", "dd/MM/yyyy HH:mm:ss");
        } else {
             formattedTime = String(rawDate);
        }

        return {
          __backendId: r[0],
          formattedTime: formattedTime,
          username: r[2],
          fullname: profileMap[uName] || r[2],
          action: r[3],
          title: r[4],
          message: r[5],
          isRead: (r[6] === true || r[6] === 'true' || r[6] === 'TRUE'),
          
          // [MỚI] Map thêm trường relatedId từ cột số 8 (index 7)
          relatedId: r[7] ? String(r[7]) : "" 
        };
      });
      notifications.reverse();
    }
  }
  
  return { status: 'success', data: notifications, hasMore: hasMore };
}

// --- HÀM XỬ LÝ THÊM/SỬA/XÓA BÀI VIẾT (QUAN TRỌNG: CẦN THÊM VÀO) ---
// [SỬA LẠI] Hàm xử lý Feed: Thêm lưu cột Layout
// [FIX] Hàm xử lý Feed: Tên file ngắn + Lưu Layout chuẩn
function handleFeedAction(ss, data) {
  var sheet = getSheet(ss, "feed");
  var type = data.type;
  var username = data.username || 'Ẩn danh';

  // --- 1. TẠO BÀI VIẾT MỚI (Giữ nguyên) ---
  if (type === 'create') {
    var id = Utilities.getUuid();
    var nowStr = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss");
    var finalMediaData = [];
    if (data.image) {
      try {
        var mediaItems = JSON.parse(data.image);
        finalMediaData = mediaItems.map(function(item, index) {
          if (String(item.url).startsWith('data:')) {
            var shortName = new Date().getTime() + "_" + index;
            var uploadedUrl = uploadImageToDrive(item.url, shortName);
            return { type: item.type, url: uploadedUrl };
          }
          return item;
        });
      } catch (e) {}
    }
    sheet.appendRow([id, nowStr, data.username, data.content, JSON.stringify(finalMediaData), data.layout || 'grid-2x2']);
    createLog(ss, username, 'create_post', 'Đã đăng bài viết mới', data.content, id);
    return { status: 'success', id: id, time: nowStr, images: finalMediaData };
  }

  // CHỈ TÌM ID KHI TYPE HOẶC SUB LÀ UPDATE HOẶC DELETE
  var rowIndex = -1;
  var oldContent = "";
  var oldImages = "[]"; 

  // Support both data.postId and data.id for backward compatibility
  var targetId = data.postId || data.id;

  if (targetId && targetId !== "null" && targetId !== "undefined") {
      var dataRange = sheet.getDataRange();
      var values = dataRange.getDisplayValues();
      for (var i = values.length - 1; i >= 1; i--) {
        if (values[i][0] == targetId) { 
          rowIndex = i + 1;
          oldContent = values[i][3]; 
          oldImages = values[i][4];
          break;
        }
      }
  }

  // Tạm bỏ return lỗi ở đây nếu là CREATE, vì CREATE không cần tìm ID
  var actionType = data.type || data.sub; // Fallback for actionType
  if (actionType !== 'create' && rowIndex === -1) {
      return { status: 'error', message: 'Bài viết không tồn tại' };
  }

  // --- 2. CẬP NHẬT (SỬA LOGIC XÓA ẢNH) ---
  if (type === 'update') {
    sheet.getRange(rowIndex, 4).setValue(data.content);
    
    var finalMediaData = [];

    if (data.image) {
       try {
        var inputMedia = JSON.parse(data.image);

        // A. Xử lý ảnh mới: Nếu là Base64 thì upload, nếu là Link thì giữ nguyên
        finalMediaData = inputMedia.map(function(item, index) {
          // Chỉ upload nếu là dữ liệu base64 mới
          if (String(item.url).startsWith('data:')) {
             var shortName = "EDIT_" + new Date().getTime() + "_" + index;
             var uploadedUrl = uploadImageToDrive(item.url, shortName);
             return { type: item.type, url: uploadedUrl };
          } else {
             return item; // Giữ nguyên object {type, url} nếu đã là URL
          }
        });

        // B. Lưu danh sách ảnh MỚI vào Sheet
        sheet.getRange(rowIndex, 5).setValue(JSON.stringify(finalImageUrls));

        // C. [QUAN TRỌNG] SO SÁNH VÀ XÓA ẢNH THỪA
        // Parse danh sách ảnh CŨ
        var oldUrlList = [];
        try { oldUrlList = JSON.parse(oldImages); } catch(e){}

        if (Array.isArray(oldUrlList) && oldUrlList.length > 0) {
            var imagesToDelete = [];

            oldUrlList.forEach(function(oldUrl) {
                // Logic: Nếu ảnh CŨ không còn nằm trong danh sách MỚI -> Nghĩa là user đã xóa nó
                if (!finalMediaData.some(function(newItem) { return newItem.url === oldUrl; })) {
                    imagesToDelete.push(oldUrl);
                }
            });

            // Gọi hàm xóa file trên Drive cho những ảnh bị loại bỏ
            if (imagesToDelete.length > 0) {
                deleteImagesFromDrive(JSON.stringify(imagesToDelete));
            }
        }

      } catch(e) {
        // Ghi log lỗi nếu cần thiết
        Logger.log("Lỗi xử lý ảnh update: " + e.toString());
      }
    }

    if (data.layout) sheet.getRange(rowIndex, 6).setValue(data.layout);
    createLog(ss, username, 'update_post', 'Đã chỉnh sửa bài viết', data.content, data.id);
    
    // Trả về danh sách ảnh mới nhất để Client cập nhật ngay lập tức
    return { status: 'success', images: finalMediaData };
  }

  // --- 3. XÓA BÀI VIẾT (Giữ nguyên) ---
  if (type === 'delete') {
    deleteImagesFromDrive(oldImages); // Xóa toàn bộ ảnh
    sheet.deleteRow(rowIndex);
    createLog(ss, username, 'delete_post', 'Đã xóa một bài viết', oldContent);
    return { status: 'success' };
  }
  
  return { status: 'error', message: 'Unknown type' };
}

// TRONG FILE: web/code.gs

function uploadImageToDrive(base64Data, fileName) {
  try {
    // Kiểm tra dữ liệu đầu vào
    if (base64Data.indexOf('base64,') === -1) return base64Data;
    
    var split = base64Data.split('base64,');
    var contentType = split[0].replace('data:', '').replace(';', '');
    var decoded = Utilities.base64Decode(split[1]);
    var blob = Utilities.newBlob(decoded, contentType, fileName);
    
    // 1. Lấy folder (Đảm bảo ID folder chính xác)
    var folderId = DRIVE_FOLDER_ID; 
    var folder = DriveApp.getFolderById(folderId);
    
    // 2. Tạo file và set quyền (Bỏ setSharing vì thư mục đã set quyền chung)
    var file = folder.createFile(blob);
    // file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    // 3. [QUAN TRỌNG] Lấy ID file (Dòng này bị thiếu trong code cũ của bạn gây lỗi ReferenceError)
    var fileId = file.getId();

    // 4. Trả về URL theo loại file
    if (contentType.startsWith('video/')) {
      // VIDEO: Trả về link Preview để chạy trong Iframe (Fix lỗi video)
      return "https://drive.google.com/file/d/" + fileId + "/preview";
    } else {
      // ẢNH: Trả về link xem trực tiếp (Fix lỗi ảnh)
      return "https://lh3.googleusercontent.com/d/" + fileId + "=s600";
    }

  } catch (e) {
    // Trả về lỗi chi tiết để Client hiện thông báo
    return "ERROR_UPLOAD: " + e.toString();
  }
}

// [CẬP NHẬT 2] Thêm hàm đếm số lượng chưa đọc (Copy xuống cuối file)
function handleGetUnreadCount(ss) {
  var sheet = getSheet(ss, "logs");
  if (!sheet) return { status: 'success', count: 0 };
  
  var rows = sheet.getDataRange().getValues();
  var count = 0;
  
  // Duyệt từ dòng 2 (bỏ header)
  for (var i = 1; i < rows.length; i++) {
    // Cột G (index 6) là IsRead. Đếm nếu là false hoặc rỗng
    var isRead = rows[i][6];
    if (isRead === false || isRead === 'false' || isRead === '' || isRead === undefined) {
      count++;
    }
  }
  
  return { status: 'success', count: count };
}

// --- HÀM UPLOAD ẢNH LẺ (Dành cho file lớn) ---
function handleUploadSingleImage(data) {
  try {
    // data.image là chuỗi Base64
    // data.name là tên file muốn lưu
    var url = uploadImageToDrive(data.image, data.name);
    
    if (url.startsWith("ERROR")) {
      return { status: 'error', message: url };
    }
    return { status: 'success', url: url };
  } catch (e) {
    return { status: 'error', message: e.toString() };
  }
}

// --- [MỚI] HÀM XÓA ẢNH TRÊN DRIVE ---
// [FIX] Hàm Xóa ảnh: Hỗ trợ xóa cả link cũ (profile) và link mới (lh3/d)
function deleteImagesFromDrive(imageJson) {
  if (!imageJson || imageJson === '[]') return;
  
  try {
    var mediaItems = JSON.parse(imageJson);
    
    if (Array.isArray(mediaItems)) {
      mediaItems.forEach(function(item) {
        // Xử lý cả định dạng cũ (string) và mới (object)
        var url = (typeof item === 'string') ? item : item.url;
        if (typeof url !== 'string') return;
        
        var fileId = null;

        // TRƯỜNG HỢP 1: Link mới (Chất lượng cao) -> dạng .../d/FILE_ID=s0
        if (url.indexOf("/d/") > -1) {
          var parts = url.split("/d/");
          if (parts.length > 1) {
            // Lấy phần ID trước dấu = (nếu có)
            fileId = parts[1].split("=")[0]; 
          }
        } 
        // TRƯỜNG HỢP 2: Link cũ (Bị mờ) -> dạng .../profile/picture/0FILE_ID=s0
        else if (url.indexOf("/profile/picture/0") > -1) {
          var parts = url.split("/picture/0");
          if (parts.length > 1) {
            fileId = parts[1].split("=")[0];
          }
        }

        // Thực hiện xóa nếu tìm thấy ID
        if (fileId) {
          try {
            DriveApp.getFileById(fileId).setTrashed(true); // Chuyển vào thùng rác
            Logger.log("Đã xóa file: " + fileId);
          } catch (e) {
            Logger.log("Không xóa được file (có thể file không tồn tại): " + fileId);
          }
        }

      });
    }
  } catch (e) {
    Logger.log("Lỗi parse ảnh để xóa: " + e.toString());
  }
}

// --- [CẬP NHẬT] LOGIC GHI GIÁ VÀNG TỰ ĐỘNG ---
// Quy tắc:
// 1. Luôn ghi nếu là lần đầu tiên trong ngày.
// 2. Trong cùng ngày, chỉ ghi nếu giá thay đổi so với lần ghi cuối cùng.
function handleAutoUpdateGold(ss, data) {
  var sheetName = "goldchart";
  var sheet = ss.getSheetByName(sheetName);
  
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(["Timestamp", "Date", "Time", "Buy Price", "Sell Price"]);
  }

  var newBuy = Number(data.buy);
  var newSell = Number(data.sell);
  var dateObj = new Date(data.timestamp);
  var currentDateStr = Utilities.formatDate(dateObj, "GMT+7", "dd/MM/yyyy");

  var lastRow = sheet.getLastRow();

  // Hàm phụ trợ dùng chung để lưu sheet và thông báo ra Telegram/chuông của ứng dụng
  function notifyAndWrite() {
    var notifTitle = "Biến động giá vàng 🔔";
    var notifContent = "Giá mua: " + newBuy.toLocaleString() + " - Giá bán: " + newSell.toLocaleString();
    
    // Gọi hàm createLog có sẵn của bạn để ghi vào sheet 'logs'
    createLog(ss, "System", "notification", notifTitle, notifContent, '');
    
    // Bắn tin qua điện thoại (Telegram không hỗ trợ <br>, dùng \n)
    sendTelegramAlert("🪙 <b>" + notifTitle + "</b>", notifContent);

    return writeGoldPrice(sheet, data.timestamp, dateObj, newBuy, newSell);
  }

  // TRƯỜNG HỢP 1: Sheet rỗng hoặc chỉ có header -> Luôn ghi & Thông báo
  if (lastRow <= 1) {
    return notifyAndWrite();
  }

  // TRƯỜNG HỢP 2: Sheet đã có dữ liệu
  var lastRowData = sheet.getRange(lastRow, 2, 1, 4).getValues()[0]; // [Date, Time, Buy, Sell]
  var lastDateStr = lastRowData[0].replace(/'/g, ''); // Bỏ dấu ' nếu có
  var lastBuy = Number(lastRowData[2]);
  var lastSell = Number(lastRowData[3]);

  // ĐIỀU KIỆN A: Nếu là ngày mới -> Luôn ghi & Thông báo
  if (lastDateStr !== currentDateStr) {
    return notifyAndWrite();
  }

  // ĐIỀU KIỆN B: Cùng ngày, kiểm tra giá có thay đổi không
  if (lastBuy === newBuy && lastSell === newSell) {
    return { 
      status: "skipped", 
      message: "Giá không đổi (" + newBuy.toLocaleString() + "). Bỏ qua." 
    };
  } else {
    // Giá thay đổi -> Ghi & Thông báo
    return notifyAndWrite();
  }
}

// Hàm trợ giúp để tránh lặp code
function writeGoldPrice(sheet, timestamp, dateObj, buy, sell) {
  var dateStr = Utilities.formatDate(dateObj, "GMT+7", "dd/MM/yyyy");
  var timeStr = Utilities.formatDate(dateObj, "GMT+7", "HH:mm:ss");

  sheet.appendRow([
    timestamp,
    "'" + dateStr, // Thêm dấu ' để Google Sheet không tự đổi format
    timeStr,
    buy,
    sell
  ]);
  
  return {
    status: "success",
    message: "Đã cập nhật giá: " + buy.toLocaleString() + " - " + sell.toLocaleString()
  };
}

// --- XỬ LÝ GIAO DỊCH VÀNG (SHEET "goldmb") ---

// 1. Lưu giao dịch Mua/Bán
function handleLogGoldTransaction(ss, data) {
  var sheet = getSheet(ss, "goldmb");
  // Header: [ID, Date, Type, Quantity, Price, Note, CreatedAt]
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["ID", "Date", "Type", "Quantity", "Price", "Note", "CreatedAt"]);
  }
  
  var id = Utilities.getUuid();
  // data: date (dd-MM-yyyy), type (buy/sell), quantity (chỉ), price (VND/chỉ), note
  sheet.appendRow([
    id, 
    data.date, 
    data.type, 
    Number(data.quantity), 
    Number(data.price), 
    data.note, 
    new Date()
  ]);
  
  return { status: 'success', id: id };
}

// 2. Lấy dữ liệu Vàng (Gồm Lịch sử giá thị trường + Giao dịch cá nhân)
// Thay thế hàm cũ trong code.gs
function handleGetGoldData(ss, data) {
  // A. Lấy lịch sử giá thị trường (để vẽ biểu đồ)
  var chartSheet = ss.getSheetByName("goldchart");
  var chartData = [];
  if (chartSheet && chartSheet.getLastRow() > 1) {
    // Cấu trúc goldchart: [Timestamp, Date, Time, Buy, Sell]
    // Cột B (index 1) là cột Ngày
    var vals = chartSheet.getRange(2, 1, chartSheet.getLastRow() - 1, 5).getValues();
    
    // Map dữ liệu và chuẩn hóa ngày tháng
    chartData = vals.map(r => {
      var rawDate = r[1];
      var dateStr = "";
      
      // KIỂM TRA VÀ CHUẨN HÓA NGÀY
      if (rawDate instanceof Date) {
        // Nếu là đối tượng Date, ép về chuỗi dd/MM/yyyy
        dateStr = Utilities.formatDate(rawDate, "GMT+7", "dd/MM/yyyy");
      } else {
        // Nếu là text hoặc số, chuyển thẳng thành chuỗi
        dateStr = String(rawDate);
      }

      return {
        date: dateStr, 
        buy: Number(r[3]),
        sell: Number(r[4])
      };
    });
  }

  // B. Lấy giao dịch cá nhân (để tính P&L)
  var mbSheet = ss.getSheetByName("goldmb");
  var transactions = [];
  if (mbSheet && mbSheet.getLastRow() > 1) {
    var mbVals = mbSheet.getRange(2, 1, mbSheet.getLastRow() - 1, 6).getValues();
    transactions = mbVals.map(r => {
      // Xử lý tương tự cho cột ngày của giao dịch cá nhân (nếu cần)
      var rawDate = r[1];
      var dateStr = "";
      if (rawDate instanceof Date) {
         // Giao dịch cá nhân thường dùng yyyy-MM-dd để khớp với input type="date"
         // Tuy nhiên nếu bạn muốn hiển thị đẹp thì format lại, 
         // nhưng lưu ý frontend đang dùng nó để tính toán hay hiển thị.
         // Ở đây giữ nguyên giá trị gốc nhưng đảm bảo là string để an toàn
         dateStr = Utilities.formatDate(rawDate, "GMT+7", "yyyy-MM-dd"); 
      } else {
         dateStr = String(rawDate);
      }

      return {
        id: r[0],
        date: dateStr,
        type: r[2],          
        quantity_chi: r[3],
        price_per_chi: r[4],
        note: r[5]
      };
    });
  }

  return { 
    status: 'success', 
    chartData: chartData, 
    portfolio: transactions 
  };
}

// 3. Xóa giao dịch
function handleDeleteGoldTransaction(ss, data) {
  var sheet = getSheet(ss, "goldmb");
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(data.id)) {
      sheet.deleteRow(i + 1);
      return { status: 'success' };
    }
  }
  return { status: 'error', message: 'Not found' };
}

// [MỚI] Hàm cập nhật giao dịch vàng
function handleUpdateGoldTransaction(ss, data) {
  var sheet = getSheet(ss, "goldmb");
  var rows = sheet.getDataRange().getValues();
  
  // Tìm dòng có ID khớp để sửa
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(data.id)) {
      var rowIndex = i + 1;
      
      // Cập nhật các cột: Date(1), Type(2), Qty(3), Price(4), Note(5)
      sheet.getRange(rowIndex, 2).setValue(data.date);
      sheet.getRange(rowIndex, 3).setValue(data.type);
      sheet.getRange(rowIndex, 4).setValue(Number(data.quantity));
      sheet.getRange(rowIndex, 5).setValue(Number(data.price));
      sheet.getRange(rowIndex, 6).setValue(data.note);
      
      return { status: 'success' };
    }
  }
  return { status: 'error', message: 'Transaction not found' };
}

// --- XỬ LÝ LIKE (SHEET dtdlike) ---
// --- XỬ LÝ LIKE (SHEET dtdlike) ---
function handleLikePost(ss, data) {
  var sheet = getSheet(ss, "dtdlike");
  // Header: [ID, PostID, Username, Time]
  if (sheet.getLastRow() === 0) sheet.appendRow(["ID", "PostID", "Username", "Time"]);

  var postId = String(data.postId);
  var username = String(data.username);
  var rows = sheet.getDataRange().getValues();
  
  var foundIndex = -1;
  var currentLikeCount = 0;
  
  // 1. Kiểm tra xem user đã like chưa & đếm tổng like luôn
  for (var i = 1; i < rows.length; i++) {
    var rPostId = String(rows[i][1]);
    var rUser = String(rows[i][2]);
    
    if (rPostId === postId) {
      currentLikeCount++; // Đếm like của bài viết này
      if (rUser === username) {
        foundIndex = i + 1; // Đã tìm thấy like của user này
      }
    }
  }

  if (foundIndex > -1) {
    // Đã like -> Xóa (Unlike)
    sheet.deleteRow(foundIndex);
    currentLikeCount--; // Trừ đi 1
  } else {
    // Chưa like -> Thêm (Like)
    sheet.appendRow([Utilities.getUuid(), postId, username, new Date()]);
    currentLikeCount++; // Cộng thêm 1
    
    createLog(ss, username, 'like', 'Thích bài viết', 'đã thích bài viết của bạn', postId);
  }

  // [QUAN TRỌNG] Trả về đúng tên trường mà Client mong đợi để đồng bộ (likeCount và liked)
  return { 
    status: 'success', 
    liked: foundIndex === -1, // Nếu lúc đầu không tìm thấy -> Giờ đã thêm (Like) -> true
    likeCount: currentLikeCount 
  };
}

// --- XỬ LÝ COMMENT (SHEET dtdcomment) ---
// --- CẬP NHẬT: XỬ LÝ COMMENT (THÊM, SỬA, XÓA) ---
function handleCommentAction(ss, data) {
  var sheet = getSheet(ss, "dtdcomment");
  var type = data.type; 

  if (type === 'add') {
    var id = Utilities.getUuid();
    var time = new Date(); 
    sheet.appendRow([id, data.postId, data.username, data.content, time]);
    createLog(ss, data.username, 'comment', 'Bình luận mới', data.content, data.postId);
    return { status: 'success', id: id, formattedTime: Utilities.formatDate(time, "GMT+7", "HH:mm dd/MM/yyyy") };
  }

  if (type === 'delete') {
    var rows = sheet.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === String(data.commentId) && String(rows[i][2]) === String(data.username)) {
        sheet.deleteRow(i + 1);
        return { status: 'success' };
      }
    }
    return { status: 'error', message: 'Không tìm thấy hoặc không có quyền' };
  }

  // [MỚI] Sửa bình luận
  if (type === 'edit') {
    var rows = sheet.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === String(data.commentId) && String(rows[i][2]) === String(data.username)) {
        // Cập nhật nội dung (Cột index 3)
        sheet.getRange(i + 1, 4).setValue(data.content);
        return { status: 'success' };
      }
    }
    return { status: 'error', message: 'Không tìm thấy hoặc không có quyền' };
  }
}

// --- LẤY DANH SÁCH COMMENT CỦA 1 BÀI VIẾT ---
function handleGetPostComments(ss, data) {
  var sheet = getSheet(ss, "dtdcomment");
  var postId = String(data.postId);
  var rows = sheet.getDataRange().getValues();
  var comments = [];

  // Lấy Map Profile để hiện Avatar người comment
  var profileSheet = ss.getSheetByName("profiles");
  var profileMap = {};
  if (profileSheet) {
    var pRows = profileSheet.getDataRange().getValues();
    for (var k = 1; k < pRows.length; k++) {
      profileMap[String(pRows[k][1])] = { fullname: pRows[k][2], avatar: pRows[k][4] };
    }
  }

  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][1]) === postId) {
      var uName = String(rows[i][2]);
      var info = profileMap[uName] || {};
      
      comments.push({
        id: rows[i][0],
        username: uName,
        fullname: info.fullname || uName,
        avatar: info.avatar || '',
        content: rows[i][3],
        time: rows[i][4]
      });
    }
  }

  // Sắp xếp comment cũ nhất lên trên (tăng dần thời gian)
  comments.sort(function(a, b) { return new Date(a.time) - new Date(b.time); });
  
  // Format lại thời gian sang string trước khi trả về
  var formattedComments = comments.map(function(c) {
    c.formattedTime = Utilities.formatDate(new Date(c.time), "GMT+7", "HH:mm dd/MM/yyyy");
    return c;
  });

  return { status: 'success', data: formattedComments };
}

// --- UTILS ---
function getSheet(ss, name) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (name === 'feed') sheet.appendRow(["ID", "Time", "Username", "Content", "Image", "Layout"]);
    if (name === 'babyrun') sheet.appendRow(["ID", "Username", "Date", "Time"]);
    if (name === 'profiles') sheet.appendRow(["Fingerprint", "Username", "Fullname", "Theme", "Avatar", "Updated"]);
    // Thêm header cho logs
    if (name === 'logs') sheet.appendRow(["ID", "Time", "Username", "Action", "Title", "Content", "IsRead", "RelatedId"]);
  }
  return sheet;
}

function responseJSON(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}



// --- [MỚI] HÀM XỬ LÝ LUỒNG 1: QUAN TRỌNG NHẤT (BabyRun + Giá Vàng) ---
function handleGetCriticalStats(ss, data) {
  // Tự động set ngày hôm nay nếu client không gửi
  if (!data.date) {
    var now = new Date();
    data.date = Utilities.formatDate(now, "GMT+7", "dd/MM/yyyy");
  }
  // Tận dụng lại hàm cũ để lấy số liệu, hàm này đã bao gồm cả Giá Vàng
  return handleGetBabyRunCount(ss, data); 
}

// --- [MỚI] HÀM XỬ LÝ LUỒNG 2: CHẠY NỀN (Profile + Thông báo) ---
function handleGetBackgroundInfo(ss, data) {
  var profileRes = handleGetProfile(ss, data);
  var notifRes = handleGetUnreadCount(ss);
  
  return {
    status: 'success',
    // Trả về dữ liệu gộp
    profile: (profileRes.status === 'success') ? profileRes.data : null,
    unreadCount: (notifRes.status === 'success') ? notifRes.count : 0
  };
}



// ==========================================
// VECTOR EMBEDDING PIPELINE
// ==========================================

// Chia text thành các chunks nhỏ (~500 từ, overlap 50 từ)
function chunkText(text, chunkSize, overlap) {
  chunkSize = chunkSize || 500;
  overlap = overlap || 50;
  var words = text.split(/\s+/).filter(function(w) { return w.length > 0; });
  var chunks = [];
  var i = 0;
  while (i < words.length) {
    var end = Math.min(i + chunkSize, words.length);
    chunks.push(words.slice(i, end).join(' '));
    if (end === words.length) break;
    i += chunkSize - overlap;
  }
  return chunks;
}

// Gọi Gemini Embedding API, trả về mảng 768 số
// taskType: 'RETRIEVAL_DOCUMENT' khi embed tài liệu, 'RETRIEVAL_QUERY' khi embed câu hỏi
function embedText(text, taskType) {
  taskType = taskType || 'RETRIEVAL_DOCUMENT';
  var apiKey = GA_K1 + GA_K2;
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=' + apiKey;
  var payload = {
    model: 'models/gemini-embedding-001',
    taskType: taskType,
    content: { parts: [{ text: text }] },
    outputDimensionality: 768
  };
  var options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  var res = UrlFetchApp.fetch(url, options);
  var json = JSON.parse(res.getContentText());
  if (json.error) {
    Logger.log('Embedding error: ' + JSON.stringify(json.error));
    throw new Error('Embedding API lỗi ' + json.error.code + ': ' + json.error.message);
  }
  if (!json.embedding || !json.embedding.values) {
    throw new Error('Embedding API trả về dữ liệu không hợp lệ: ' + JSON.stringify(json));
  }
  return json.embedding.values; // Mảng 768 số
}

// Tính cosine similarity giữa 2 vector
function cosineSimilarity(vecA, vecB) {
  var dot = 0, normA = 0, normB = 0;
  for (var i = 0; i < vecA.length; i++) {
    dot   += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Lấy hoặc tạo sheet EmbeddingIndex
function getEmbeddingSheet(ss) {
  var sheet = ss.getSheetByName('EmbeddingIndex');
  if (!sheet) {
    sheet = ss.insertSheet('EmbeddingIndex');
    sheet.appendRow(['chunk_id', 'file_name', 'chunk_index', 'chunk_text', 'embedding', 'created_at']);
  }
  return sheet;
}

// ==========================================
// HÀM XỬ LÝ UPLOAD TÀI LIỆU (VECTOR EMBEDDING)
// ==========================================
function handleUploadDocument(ss, data) {
  try {
    var base64Data = data.fileData;
    var fileName = data.fileName;

    if (!base64Data || base64Data.indexOf('base64,') === -1) {
      return { status: 'error', message: 'Dữ liệu file không hợp lệ' };
    }

    // 1. Decode và lưu file lên Drive
    var split = base64Data.split('base64,');
    var contentType = split[0].replace('data:', '').replace(';', '');
    var decoded = Utilities.base64Decode(split[1]);
    var blob = Utilities.newBlob(decoded, contentType, fileName);

    var folderName = 'LoveStory_Documents';
    var folders = DriveApp.getFoldersByName(folderName);
    var targetFolder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);

    // Xóa file cũ nếu trùng tên
    var existingFiles = targetFolder.getFilesByName(fileName);
    while (existingFiles.hasNext()) {
      existingFiles.next().setTrashed(true);
    }
    targetFolder.createFile(blob);

    // 2. Đọc nội dung text của file
    var textContent = '';
    var supportedTypes = [MimeType.PLAIN_TEXT, 'text/markdown', MimeType.CSV];
    if (supportedTypes.indexOf(contentType) > -1 || contentType.indexOf('text') > -1) {
      textContent = Utilities.newBlob(decoded, contentType).getDataAsString('UTF-8');
    } else {
      // Không phải text: Lưu file nhưng không embed
      return { status: 'success', message: 'Đã tải lên ' + fileName + ' (định dạng không hỗ trợ embedding, chỉ lưu file)', chunks: 0 };
    }

    if (!textContent || textContent.trim().length === 0) {
      return { status: 'success', message: 'Đã tải lên ' + fileName + ' nhưng nội dung rỗng', chunks: 0 };
    }

    // 3. XÓA embedding cũ của file này trong EmbeddingIndex
    var embSheet = getEmbeddingSheet(ss);
    var existingRows = embSheet.getDataRange().getValues();
    var rowsToDelete = [];
    for (var i = existingRows.length - 1; i >= 1; i--) {
      if (String(existingRows[i][1]) === String(fileName)) {
        rowsToDelete.push(i + 1);
      }
    }
    rowsToDelete.forEach(function(rowNum) { embSheet.deleteRow(rowNum); });

    // 4. Chia thành chunks và embed từng chunk
    var chunks = chunkText(textContent, 500, 50);
    // Giới hạn tối đa 50 chunks để tránh timeout
    var maxChunks = Math.min(chunks.length, 50);
    var now = new Date();
    var embeddedCount = 0;

    for (var j = 0; j < maxChunks; j++) {
      var chunkContent = chunks[j];
      if (chunkContent.trim().length < 20) continue; // Bỏ chunk quá ngắn

      var lastEmbedError = null;
      try {
        var vector = embedText(chunkContent, 'RETRIEVAL_DOCUMENT');
        var chunkId = Utilities.getUuid();
        embSheet.appendRow([
          chunkId,
          fileName,
          j,
          chunkContent,
          JSON.stringify(vector),
          now
        ]);
        embeddedCount++;

        // [MỚI] Thêm thời gian nghỉ 2.5 giây để tránh lỗi 429 Quota Exceeded từ Google Gemini API!
        Utilities.sleep(2500);
      } catch (embErr) {
        lastEmbedError = embErr.toString();
        Logger.log('Lỗi embed chunk ' + j + ': ' + lastEmbedError);
        // Dừng ngay ở chunk đầu tiên nếu lỗi API (tránh thử lại nhiều lần vô ích)
        if (j === 0) break;
      }
    }

    // Nếu tất cả chunks đều thất bại, trả về lỗi rõ ràng
    if (embeddedCount === 0 && maxChunks > 0) {
      return { status: 'error', message: 'Embedding thất bại: ' + (lastEmbedError || 'Không rõ lỗi') };
    }

    return {
      status: 'success',
      message: 'Đã tải lên và xử lý ' + fileName + ': ' + embeddedCount + '/' + maxChunks + ' chunks',
      chunks: embeddedCount,
      totalChunks: chunks.length
    };

  } catch (e) {
    Logger.log('Lỗi upload tài liệu: ' + e.toString());
    return { status: 'error', message: e.toString() };
  }
}

// ==========================================
// HÀM MỚI: UPLOAD CHUNK FILE LÊN DRIVE (XỬ LÝ FILE NẶNG)
// ==========================================
function handleUploadFileChunk(ss, data) {
  try {
    var targetFolderName = 'LoveStory_Documents';
    var tempFolderName = 'LoveStory_TempChunks';
    
    var folders = DriveApp.getFoldersByName(targetFolderName);
    var targetFolder = folders.hasNext() ? folders.next() : DriveApp.createFolder(targetFolderName);
    
    var tempFolders = DriveApp.getFoldersByName(tempFolderName);
    var tempFolder = tempFolders.hasNext() ? tempFolders.next() : DriveApp.createFolder(tempFolderName);

    var fileIdTemp = data.fileIdTemp;
    var chunkIndex = data.chunkIndex;
    var totalChunks = data.totalChunks;
    var fileName = data.fileName;
    var chunkData = data.chunkData;
    var mimeType = data.mimeType;

    // Lưu chunk vào folder tạm
    tempFolder.createFile(fileIdTemp + '_' + chunkIndex + '.txt', chunkData);

    // Nếu là mảnh cuối cùng -> Ghép file
    if (chunkIndex === totalChunks - 1) {
      var fullBase64 = '';
      for (var i = 0; i < totalChunks; i++) {
        var chunkName = fileIdTemp + '_' + i + '.txt';
        var chunkFiles = tempFolder.getFilesByName(chunkName);
        if (chunkFiles.hasNext()) {
          var cf = chunkFiles.next();
          fullBase64 += cf.getBlob().getDataAsString();
          cf.setTrashed(true); // Dọn dẹp mảnh rác
        }
      }
      
      try {
        var decoded = Utilities.base64Decode(fullBase64);
        var blob = Utilities.newBlob(decoded, mimeType || 'application/octet-stream', fileName);
        
        var existingFiles = targetFolder.getFilesByName(fileName);
        while (existingFiles.hasNext()) {
          existingFiles.next().setTrashed(true);
        }
        
        targetFolder.createFile(blob);
      } catch(decErr) {
        Logger.log('Lỗi ghép file: ' + decErr.toString());
        return {status: 'error', message: 'Ghép file thất bại: ' + decErr.toString()};
      }
    }

    return { status: 'success', chunkIndex: chunkIndex };
  } catch (e) {
    Logger.log('Lỗi chunk upload: ' + e.toString());
    return { status: 'error', message: e.toString() };
  }
}

// ==========================================
// HÀM MỚI: XỬ LÝ TEXT CHUNKS (RAG EMBEDDING HÀNG LOẠT)
// ==========================================
function handleProcessTextChunks(ss, data) {
  try {
    var fileName = data.fileName;
    var chunks = data.chunks; // Mảng text chunks
    var batchIndex = data.batchIndex;
    var startIndex = data.startIndex;
    var totalChunks = data.totalChunks;

    var embSheet = getEmbeddingSheet(ss);

    // Xóa index cũ của file nếu đây là lô đầu tiên
    if (batchIndex === 0) {
      var existingRows = embSheet.getDataRange().getValues();
      var rowsToDelete = [];
      for (var i = existingRows.length - 1; i >= 1; i--) {
        if (String(existingRows[i][1]) === String(fileName)) {
          rowsToDelete.push(i + 1);
        }
      }
      rowsToDelete.forEach(function(rowNum) { embSheet.deleteRow(rowNum); });
    }

    var now = new Date();
    var embeddedCount = 0;

    for (var j = 0; j < chunks.length; j++) {
      var chunkContent = chunks[j];
      if (chunkContent.trim().length < 10) continue; 
      
      var globalIndex = startIndex + j;

      try {
        var vector = embedText(chunkContent, 'RETRIEVAL_DOCUMENT');
        var chunkId = Utilities.getUuid();
        embSheet.appendRow([
          chunkId,
          fileName,
          globalIndex,
          chunkContent,
          JSON.stringify(vector),
          now
        ]);
        embeddedCount++;
        Utilities.sleep(2500); // Tránh lỗi Rate Limit (429) của Gemini
      } catch(embErr) {
        Logger.log('Lỗi embed chunk ' + globalIndex + ': ' + embErr.toString());
      }
    }

    return { 
      status: 'success', 
      embedded: embeddedCount,
      batchIndex: batchIndex
    };

  } catch(e) {
    Logger.log('Lỗi text chunks batch: ' + e.toString());
    return { status: 'error', message: e.toString() };
  }
}

// Liệt kê tài liệu đã upload (tên file + số chunks)
function handleListDocuments(ss) {
  try {
    var folderName = 'LoveStory_Documents';
    var folders = DriveApp.getFoldersByName(folderName);
    var targetFolder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
    
    // 1. Lấy danh sách file từ Drive
    var files = targetFolder.getFiles();
    var fileList = [];
    while (files.hasNext()) {
      var f = files.next();
      fileList.push({
        id: f.getId(),
        name: f.getName(),
        size: f.getSize(),
        date: f.getLastUpdated().toISOString(),
        chunks: 0
      });
    }

    // 2. Điểm danh số chunks từ EmbeddingIndex (nếu có)
    var embSheet = ss.getSheetByName('EmbeddingIndex');
    if (embSheet && embSheet.getLastRow() > 1) {
      var embRows = embSheet.getRange(2, 2, embSheet.getLastRow() - 1, 1).getValues(); // Cột fileName
      var chunkCounts = {};
      embRows.forEach(function(r) {
        var fn = String(r[0]);
        chunkCounts[fn] = (chunkCounts[fn] || 0) + 1;
      });
      
      fileList.forEach(function(f) {
        if (chunkCounts[f.name]) f.chunks = chunkCounts[f.name];
      });
    }

    return { status: 'success', data: fileList };
  } catch (e) {
    return { status: 'error', message: e.toString() };
  }
}

// Xóa tài liệu: Xóa file trên Drive + xóa toàn bộ chunks trong EmbeddingIndex
function handleDeleteDocument(ss, data) {
  try {
    var fileName = data.fileName || data.filename;
    if (!fileName) return { status: 'error', message: 'Thiếu tên file' };

    // Xóa trên Drive
    var folderName = 'LoveStory_Documents';
    var folders = DriveApp.getFoldersByName(folderName);
    if (folders.hasNext()) {
      var folder = folders.next();
      var filesToDelete = folder.getFilesByName(fileName);
      while (filesToDelete.hasNext()) {
        filesToDelete.next().setTrashed(true);
      }
    }

    // Xóa chunks trong EmbeddingIndex
    var embSheet = ss.getSheetByName('EmbeddingIndex');
    if (embSheet && embSheet.getLastRow() > 1) {
      var rows = embSheet.getDataRange().getValues();
      var toDelete = [];
      for (var i = rows.length - 1; i >= 1; i--) {
        if (String(rows[i][1]) === String(fileName)) toDelete.push(i + 1);
      }
      toDelete.forEach(function(rowNum) { embSheet.deleteRow(rowNum); });
    }

    return { status: 'success', message: 'Đã xóa ' + fileName };
  } catch (e) {
    return { status: 'error', message: e.toString() };
  }
}

// ==========================================
// HÀM XỬ LÝ AI CHAT (GEMINI API)
// ==========================================
function handleAiChat(ss, data) {
  var query = data.query || "";
  var chatHistory = data.history || []; // Lịch sử chat trước đó (nếu có)
  
  if (!query) {
    return { status: 'error', message: 'Query is empty' };
  }

  // Tự động chuyển sang chế độ tài liệu nếu thấy @
  var chatMode = data.chatMode || (query.indexOf('@') > -1 ? "document" : "memory");
  
  // 1. Lấy ngữ cảnh dựa trên chế độ Chat
  var contextText = "";
  var systemPrompt = "";

  if (chatMode === "document") {
     // CHẾ ĐỘ PHÂN TÍCH TÀI LIỆU (VECTOR EMBEDDING SEARCH)
     var embSheet = ss.getSheetByName('EmbeddingIndex');

     if (!embSheet || embSheet.getLastRow() <= 1) {
       contextText = "Chưa có tài liệu nào được tải lên và xử lý.";
     } else {
       // --- TÌM VÀ LỌC TÊN FILE DỰA TRÊN CÚ PHÁP ***tên file*** ---
       var targetFiles = [];
       var regex = /\*\*\*(.*?)\*\*\*/g;
       var match;
       while ((match = regex.exec(query)) !== null) {
           targetFiles.push(match[1].trim().toLowerCase());
       }
       
       if (targetFiles.length > 0) {
           // Xóa tất cả cụm ***filename*** ra khỏi câu hỏi để AI không bị nhiễu
           query = query.replace(/\*\*\*(.*?)\*\*\*/g, '').trim();
       }

       if (!query) {
           return { status: 'error', message: 'Vui lòng nhập thêm câu hỏi. (Ví dụ: ***tailieu.pdf*** tóm tắt nội dung này)' };
       }

       // 1. Embed câu hỏi của user (dùng RETRIEVAL_QUERY để tối ưu semantic search)
       var queryVector;
       try {
         queryVector = embedText(query, 'RETRIEVAL_QUERY');
       } catch (embErr) {
         return { status: 'error', message: 'Lỗi xử lý câu hỏi: ' + embErr.toString() };
       }

       // 2. Đọc toàn bộ EmbeddingIndex và tính similarity
       var embRows = embSheet.getRange(2, 1, embSheet.getLastRow() - 1, 5).getValues();
       var scored = [];
       for (var ei = 0; ei < embRows.length; ei++) {
         var row = embRows[ei];
         var rowFileName = String(row[1]);

         // Nếu user có chọn file (targetFiles), bỏ qua các file KHÔNG có trong danh sách
         if (targetFiles.length > 0 && targetFiles.indexOf(rowFileName.toLowerCase()) === -1) {
             continue;
         }

         var chunkText_val = String(row[3]);
         var embeddingRaw = String(row[4]);
         if (!embeddingRaw || embeddingRaw === '') continue;
         try {
           var vec = JSON.parse(embeddingRaw);
           var score = cosineSimilarity(queryVector, vec);
           scored.push({ score: score, fileName: String(row[1]), text: chunkText_val });
         } catch (parseErr) { /* Bỏ qua chunk lỗi */ }
       }

       // 3. Sắp xếp và lấy top-5 chunks
       scored.sort(function(a, b) { return b.score - a.score; });
       var topChunks = scored.slice(0, 5);

       Logger.log('Top chunks found: ' + topChunks.map(function(c) {
         return c.fileName + ' (score=' + c.score.toFixed(3) + ')';
       }).join(', '));

       if (topChunks.length === 0 || topChunks[0].score < 0.3) {
         contextText = "Không tìm thấy đoạn văn bản liên quan đến câu hỏi trong kho tài liệu.";
       } else {
         contextText = "Dưới đây là các đoạn văn bản liên quan nhất được trích xuất từ kho tài liệu:\n\n";
         topChunks.forEach(function(chunk, idx) {
           contextText += "--- Đoạn " + (idx + 1) + " (từ file: " + chunk.fileName + ") ---\n";
           contextText += chunk.text + "\n\n";
         });
       }
     }

     systemPrompt = "Bạn là trợ lý AI phân tích tài liệu chuyên nghiệp. " +
      "Nhiệm vụ của bạn là trả lời các câu hỏi của người dùng dựa TRÊN THÔNG TIN TỪ CÁC ĐOẠN TÀI LIỆU được cung cấp dưới đây.\n\n" +
      "--- TÀI LIỆU LIÊN QUAN ---\n" + contextText + "\n--------------------------\n" +
      "Nếu câu trả lời có trong tài liệu, hãy trích xuất và trình bày rõ ràng. Nếu hoàn toàn không có thông tin, hãy nói rõ là dữ liệu chưa đề cập đến vấn đề này.";

  } else {
     // CHẾ ĐỘ KỶ NIỆM (MẶC ĐỊNH)
     contextText = "Đây là ứng dụng LoveStory lưu giữ kỷ niệm.\nDanh sách các bài đăng gần đây:\n";
     var feedSheet = ss.getSheetByName("feed");
     
     if (feedSheet) {
       var rows = feedSheet.getDataRange().getDisplayValues();
       // Bỏ qua header (row 0), lấy tất cả bài viết (từ dưới lên)
       var count = 0;
       for (var i = rows.length - 1; i >= 1; i--) {
         var r = rows[i];
         if (r[0]) {
           var date = r[1];
           var author = r[2];
           var content = r[3];
           contextText += "- Ngày " + date + ", " + author + " đã đăng: " + content + ".\n";
           count++;
         }
       }
     }

     systemPrompt = "Bạn là trợ lý ảo thân thiện của ứng dụng LoveStory (Social Memory). " +
      "Nhiệm vụ của bạn là trò chuyện với người dùng, trả lời câu hỏi dựa trên các Kỷ Niệm (bài đăng) mà tôi cung cấp dưới đây. " +
      "ĐỒNG THỜI, bạn có thể trả lời các kiến thức chung bên ngoài giống như một AI thông thường, nhưng hãy giữ thái độ thân thiện và luôn sẵn sàng gắn kết với ứng dụng LoveStory nếu có thể.\n\n" +
      "--- DỮ LIỆU KỶ NIỆM ---\n" + contextText + "\n----------------------\n" +
      "Nếu câu hỏi liên quan đến kỷ niệm, hãy trả lời chính xác dựa theo dữ liệu. Nếu không có trong dữ liệu, hãy nói không biết hoặc trả lời bằng kiến thức chung của bạn.";
  }

  // 3. Chuẩn bị payload gửi Gemini
  // Format history for Gemini: { role: "user" | "model", parts: [{ text: "..." }] }
  var contents = [];

  // Nạp lịch sử (nếu có)
  if (chatHistory && chatHistory.length > 0) {
      for(var j=0; j < chatHistory.length; j++){
          var msg = chatHistory[j];
          var msgText = "";
          
          if (msg.parts && msg.parts.length > 0) {
            msgText = msg.parts[0].text;
          } else if (msg.text) {
            msgText = msg.text;
          }
          
          if (msgText === null || msgText === undefined || String(msgText).trim() === "") continue;

          contents.push({
              role: (msg.role === 'ai' || msg.role === 'model') ? 'model' : 'user',
              parts: [{ text: String(msgText) }]
          });
      }
  }

  // Nạp câu hỏi hiện tại
  if (query && String(query).trim() !== "") {
    contents.push({
      role: "user",
      parts: [{ text: String(query) }]
    });
  }

  if (contents.length === 0) {
    return { status: 'error', message: 'Nội dung gửi AI không được để trống.' };
  }
  
  // CHÈN SYSTEM PROMPT VÀO TIN NHẮN ĐẦU TIÊN CỦA USER (Để ổn định nhất)
  // Tìm tin nhắn 'user' đầu tiên để gắn prompt
  var firstUserMsg = contents.find(function(c) { return c.role === 'user'; });
  if (firstUserMsg) {
    firstUserMsg.parts[0].text = "SYSTEM INSTRUCTION: " + systemPrompt + "\n\nUSER QUESTION: " + firstUserMsg.parts[0].text;
  }

  var payload = {
    contents: contents,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 1000
    }
  };

  Logger.log("GEMINI PAYLOAD (Simplified): " + JSON.stringify(payload));

  // 4. Gọi Gemini API
  var url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + GA_K1 + GA_K2;
  var options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    var response = UrlFetchApp.fetch(url, options);
    var jsonRes = JSON.parse(response.getContentText());

    if (jsonRes.error) {
       Logger.log("GEMINI API ERROR: " + JSON.stringify(jsonRes.error));
       return { status: 'error', message: 'Lỗi từ AI: ' + jsonRes.error.message };
    }

    if (jsonRes.candidates && jsonRes.candidates.length > 0) {
      var aiReply = jsonRes.candidates[0].content.parts[0].text;
      return { status: 'success', reply: aiReply };
    } else {
      return { status: 'error', message: 'Không nhận được câu trả lời từ AI.' };
    }

  } catch (e) {
    Logger.log("Lỗi gọi Gemini: " + e.toString());
    return { status: 'error', message: 'Lỗi kết nối máy chủ AI: ' + e.toString() };
  }
}


// Thay bằng thông tin cấu hình Zalo của bạn
const TELEGRAM_BOT_TOKEN = "8365701527:AAEn2Sy2pr-tfpxG_v6dNMeStVGzusUJZ4o"; // Ví dụ: "7123456789:AAH..."
 const TELEGRAM_CHAT_ID = "1485590752";
// ==========================================
// HÀM XỬ LÝ TẠO CẢNH BÁO (Lưu Log & Gửi Telegram)
// ==========================================
function handleCreateAlert(ss, data) {
  var title = data.title || "Cảnh báo hệ thống";
  var message = data.message || "Có hoạt động mới được ghi nhận.";
  var username = data.username || "System";

  // 1. Lưu vào sheet 'logs' để hiện trên chuông thông báo của Website
  // actionType để là 'alert' để web dễ nhận diện icon (nếu cần)
  createLog(ss, username, "alert", title, message, "");

  // 2. Bắn tin nhắn qua Telegram Bot về điện thoại
  sendTelegramAlert(title, message);

  return { status: 'success', message: 'Đã lưu thông báo và gửi Telegram' };
}

function sendTelegramAlert(title, message) {
  // Tạo URL gọi API của Telegram
  const url = "https://api.telegram.org/bot" + TELEGRAM_BOT_TOKEN + "/sendMessage";
  
  // Format ngày giờ chuẩn của GAS
  var now = new Date();
  var timeStr = Utilities.formatDate(now, "GMT+7", "HH:mm:ss dd/MM/yyyy");

  // Soạn nội dung tin nhắn (Hỗ trợ định dạng HTML như <b> in đậm, <i> in nghiêng)
  const textContent = title + "\n\n📝 " + message + "\n⏰ <i>" + timeStr + "</i>";

  // Gói dữ liệu
  const payload = {
    chat_id: TELEGRAM_CHAT_ID,
    text: textContent,
    parse_mode: "HTML" // Để Telegram hiểu các thẻ <b>, <i>
  };

  // Cấu hình request
  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  // Gửi lệnh
  try {
    const response = UrlFetchApp.fetch(url, options);
    const result = JSON.parse(response.getContentText());
    
    // Dùng Logger.log thay cho console.log để xem lỗi trong GAS
    if (!result.ok) {
      Logger.log("LỖI GỬI TELEGRAM: " + result.description);
    } else {
      Logger.log("Gửi Telegram thành công!");
    }
  } catch (e) {
    Logger.log("Lỗi kết nối Telegram API: " + e.toString());
  }
}


