// =======================================================
// CODE.GS - SOCIAL MEMORY API (FIXED SORTING & TIMEZONE)
// =======================================================

function doPost(e) {
  var lock = LockService.getScriptLock();
  // Thử khóa trong 10s để tránh xung đột khi ghi dữ liệu
  if (lock.tryLock(10000)) {
    try {
      var data = JSON.parse(e.postData.contents);
      var action = data.action;
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var result = {};

      switch (action) {
        // Load trang
        case 'get_critical_stats': // Luồng 1: Chỉ lấy số liệu quan trọng nhất (nhanh)
          result = handleGetCriticalStats(ss, data);
          break;
        case 'get_background_info': // Luồng 2: Lấy profile và thông báo (chạy ngầm)
          result = handleGetBackgroundInfo(ss, data);
          break;
        // --- NHÓM 1: PROFILE ---
        case 'get_profile':
          result = handleGetProfile(ss, data);
          break;
        case 'save_profile':
          result = handleSaveProfile(ss, data);
          break;
        case 'get_profile_by_username':
          result = handleGetProfileByUsername(ss, data);
          break;

        // --- NHÓM 2: BABY RUN & STATS ---
        case 'get_babyrun_count':
          result = handleGetBabyRunCount(ss, data);
          break;
        case 'log_babyrun':
          result = handleLogBabyRun(ss, data);
          break;
        case 'get_bike_stats':
          result = handleGetBikeStats(ss, data); // <--- ĐÃ SỬA HÀM NÀY
          break;

        // --- NHÓM 3: FEED ---
        case 'feed_action':
          result = handleFeedAction(ss, data);
          break;
        case 'get_feed':
          result = handleGetFeed(ss, data); // <-- Thêm ", data" vào
          break;
        case 'upload_single_image':
          result = handleUploadSingleImage(data);
          break;
          
        // --- NHÓM 4: GOLD --- 
        case 'log_gold_transaction': // Thay thế cho gold_entry cũ
          result = handleLogGoldTransaction(ss, data);
          break;
        case 'get_gold_data': // Lấy cả lịch sử giá và giao dịch mua bán
          result = handleGetGoldData(ss, data);
          break;
        case 'delete_gold_transaction':
          result = handleDeleteGoldTransaction(ss, data);
          break;
        // [THÊM MỚI] Xử lý cập nhật giá vàng tự động từ GitHub Actions
        case 'update_gold_price':
          result = handleAutoUpdateGold(ss, data);
          break;
        // [THÊM MỚI] Case sửa giao dịch
        case 'update_gold_transaction': 
          result = handleUpdateGoldTransaction(ss, data);
          break;

        //NHÓM 5: LOG
        case 'notification_action':
          result = handleNotificationAction(ss, data);
          break;
        case 'get_notifications':
          result = handleGetNotifications(ss, data);
          break;
        case 'get_unread_count':
          result = handleGetUnreadCount(ss);
          break;
        //NHÓM 6: like, comment
        // --- NHÓM TƯƠNG TÁC (LIKE & COMMENT) ---
        case 'like_post':
          result = handleLikePost(ss, data);
          break;
        case 'comment_action':
          result = handleCommentAction(ss, data); // Thêm, Sửa, Xóa comment
          break;
        case 'get_post_comments':
          result = handleGetPostComments(ss, data);
          break;
          
        default:
          result = { status: 'error', message: 'Unknown action: ' + action };
      }
      
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

// --- CẤU HÌNH ---
// Thay ID thư mục bạn vừa lấy được vào đây
const DRIVE_FOLDER_ID = "1J6s_9PbYjB86Qe2fYhhz1oaki35yBDDF";

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

function handleSaveProfile(ss, data) {
  var sheet = getSheet(ss, "profiles");
  var rows = sheet.getDataRange().getValues();
  var rowIndex = -1;
  
  for (var i = 1; i < rows.length; i++) {
    // Tìm theo Username (ưu tiên) hoặc Fingerprint
    if (String(rows[i][1]) == String(data.username)) { 
      rowIndex = i + 1; 
      break; 
    }
  }
  
  var time = new Date();
  if (rowIndex > 0) {
    // Update
    sheet.getRange(rowIndex, 1).setValue(data.fingerprint);
    sheet.getRange(rowIndex, 3).setValue(data.fullname);
    sheet.getRange(rowIndex, 4).setValue(data.theme);
    sheet.getRange(rowIndex, 5).setValue(data.avaurl);
    sheet.getRange(rowIndex, 6).setValue(time);
  } else {
    // Insert
    sheet.appendRow([data.fingerprint, data.username, data.fullname, data.theme, data.avaurl, time]);
  }
  return { status: 'success' };
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

  // 2. [MỚI] LẤY GIÁ VÀNG MỚI NHẤT TỪ SHEET 'goldchart'
  var goldSheet = ss.getSheetByName("goldchart");
  var goldPrice = { buy: 0, sell: 0 };
  
  if (goldSheet && goldSheet.getLastRow() > 1) {
    var lastRow = goldSheet.getLastRow();
    // Cấu trúc: [Timestamp, Date, Time, Buy, Sell]
    // Buy là cột 4, Sell là cột 5
    var prices = goldSheet.getRange(lastRow, 4, 1, 2).getValues()[0];
    goldPrice.buy = prices[0];
    goldPrice.sell = prices[1];
  }

  return { status: 'success', count: count, gold: goldPrice };
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

function handleCreateGoldEntry(ss, data) {
  var sheet = getSheet(ss, "gold_entries");
  sheet.appendRow([Utilities.getUuid(), data.buyPrice, data.sellPrice, data.date, data.note, new Date()]);
  return { status: 'success' };
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
      try {
        if (r[1]) {
           var d = new Date(Date.parse(r[1].replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$3-$2-$1')));
           if(isNaN(d.getTime())) d = new Date(); 
           timestamp = d.getTime();
        }
      } catch(e) { timestamp = 0; }

      var postId = String(r[0]);
      var stat = likeStats[postId] || { count: 0, isLiked: false };
      var postComments = commentMap[postId] || [];
      postComments.sort(function(a, b) { return new Date(a.time) - new Date(b.time); });

      allPosts.push({
        __backendId: r[0],
        createdAt: r[1],
        timestamp: timestamp,
        username: r[2],
        fullname: fullname,
        avatar: info.avatar || '',
        content: content,
        imageData: r[4],
        layout: r[5] || 'grid-2x2',
        likes: stat.count,
        liked: stat.isLiked,
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
    var imageUrls = [];
    if (data.image) {
      try {
        var images = JSON.parse(data.image);
        imageUrls = images.map(function(base64, index) {
          var shortName = new Date().getTime() + "_" + index;
          return uploadImageToDrive(base64, shortName); 
        });
      } catch (e) {}
    }
    sheet.appendRow([id, nowStr, data.username, data.content, JSON.stringify(imageUrls), data.layout || 'grid-2x2']);
    createLog(ss, username, 'create_post', 'Đã đăng bài viết mới', data.content, id);
    return { status: 'success', id: id, time: nowStr, images: imageUrls };
  }

  // --- TÌM DÒNG CẦN SỬA/XÓA ---
  var dataRange = sheet.getDataRange();
  var values = dataRange.getDisplayValues();
  var rowIndex = -1;
  var oldContent = "";
  var oldImages = "[]"; // Mặc định là mảng rỗng nếu không có ảnh

  for (var i = values.length - 1; i >= 1; i--) {
    if (values[i][0] == data.id) { 
      rowIndex = i + 1;
      oldContent = values[i][3]; 
      oldImages = values[i][4]; // Lấy danh sách ảnh CŨ đang lưu trong Sheet
      break;
    }
  }

  if (rowIndex === -1) return { status: 'error', message: 'Bài viết không tồn tại' };

  // --- 2. CẬP NHẬT (SỬA LOGIC XÓA ẢNH) ---
  if (type === 'update') {
    sheet.getRange(rowIndex, 4).setValue(data.content);
    
    // Mảng chứa danh sách ảnh cuối cùng (sẽ lưu vào Sheet)
    var finalImageUrls = [];

    if (data.image) {
       try {
        var inputImages = JSON.parse(data.image);

        // A. Xử lý ảnh mới: Nếu là Base64 thì upload, nếu là Link thì giữ nguyên
        finalImageUrls = inputImages.map(function(imgItem, index) {
          if (imgItem.indexOf('base64,') > -1) {
             var shortName = "EDIT_" + new Date().getTime() + "_" + index;
             return uploadImageToDrive(imgItem, shortName);
          } else {
             return imgItem;
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
                if (finalImageUrls.indexOf(oldUrl) === -1) {
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
    return { status: 'success', images: finalImageUrls };
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

// [MỚI] Hàm Upload ảnh lên Drive (Dành riêng cho Feed)  
// [SỬA LẠI] Hàm Upload: Trả về lỗi chi tiết để debug
// [FIX] Hàm Upload ảnh: Trả về link lh3 để không bị lỗi hiển thị
// [FIX] Hàm Upload ảnh: Trả về link lh3 chuẩn để ảnh nét (Không dùng link profile cũ)
function uploadImageToDrive(base64Data, fileName) {
  try {
    // 1. Nếu là link cũ thì trả về nguyên vẹn
    if (base64Data.indexOf('base64,') === -1) return base64Data;
    
    var split = base64Data.split('base64,');
    var contentType = split[0].replace('data:', '').replace(';', '');
    var decoded = Utilities.base64Decode(split[1]);
    var blob = Utilities.newBlob(decoded, contentType, fileName);

    // 2. Lấy folder
    var folderId = "1J6s_9PbYjB86Qe2fYhhz1oaki35yBDDF"; // ID folder của bạn
    var folder = DriveApp.getFolderById(folderId);

    // 3. Tạo file
    var file = folder.createFile(blob);
    
    // Bắt buộc set quyền xem công khai
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    // 4. [QUAN TRỌNG] Trả về link /d/ (Download/Display) thay vì /profile/
    // Link này hỗ trợ =s0 (full size) và cực nét
    return "https://lh3.googleusercontent.com/d/" + file.getId() + "=s0";

  } catch (e) {
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
    var imageUrls = JSON.parse(imageJson);
    
    if (Array.isArray(imageUrls)) {
      imageUrls.forEach(function(url) {
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

// [MỚI] Hàm ghi giá vàng tự động vào sheet 'goldchart'
// [LOGIC MỚI] Xử lý cập nhật giá vàng thông minh
// Quy tắc: 
// 1. Luôn lưu dòng đầu tiên của ngày mới.
// 2. Trong ngày: Chỉ lưu và thông báo nếu giá thay đổi.
function handleAutoUpdateGold(ss, data) {
  var sheetName = "goldchart"; // 1. Tên sheet chính xác
  var sheet = ss.getSheetByName(sheetName);
  
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    // Tạo header đúng cấu trúc nếu chưa có
    sheet.appendRow(["Timestamp", "Date", "Time", "Buy Price", "Sell Price"]);
  }

  // 2. Kiểm tra trùng lặp ở dòng cuối cùng
  var lastRow = sheet.getLastRow();
  var isDuplicate = false;
  var newBuy = Number(data.buy);
  var newSell = Number(data.sell);

  if (lastRow > 1) { 
    // Lấy dữ liệu 2 cột cuối: Cột 4 (Buy Price) và Cột 5 (Sell Price)
    // getRange(row, column, numRows, numColumns)
    var lastValues = sheet.getRange(lastRow, 4, 1, 2).getValues()[0]; 
    var lastBuy = Number(lastValues[0]);
    var lastSell = Number(lastValues[1]);

    // So sánh
    if (lastBuy === newBuy && lastSell === newSell) {
      isDuplicate = true;
    }
  }

  // 3. Xử lý lưu hoặc bỏ qua
  if (isDuplicate) {
    return { 
      status: "skipped", 
      message: "Giá không đổi (" + newBuy + " - " + newSell + "). Bỏ qua." 
    };
  } else {
    // Xử lý thời gian để tách ra cột Date và Time
    var dateObj = new Date(data.timestamp); // Chuyển chuỗi ISO thành Date object
    var dateStr = "'" + Utilities.formatDate(dateObj, "GMT+7", "dd/MM/yyyy");
    var timeStr = Utilities.formatDate(dateObj, "GMT+7", "HH:mm:ss"); 

    // Ghi đúng 5 cột: Timestamp, Date, Time, Buy Price, Sell Price
    sheet.appendRow([
      data.timestamp, // Cột 1: Timestamp gốc
      dateStr,        // Cột 2: Ngày (dd/MM/yyyy)
      timeStr,        // Cột 3: Giờ (HH:mm:ss)
      newBuy,         // Cột 4: Giá mua
      newSell         // Cột 5: Giá bán
    ]);
    
    return { 
      status: "success", 
      message: "Đã cập nhật: " + newBuy + " - " + newSell 
    };
  }
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
    
    // [QUAN TRỌNG] Chỉ tạo thông báo khi LIKE (không tạo khi Unlike)
    // Và nhớ truyền postId vào tham số cuối cùng để tính năng click hoạt động
    createLog(ss, username, 'like', 'Thích bài viết', 'đã thích bài viết của bạn', postId);
  }

  // [QUAN TRỌNG] Phải trả về dữ liệu JSON để Client không bị lỗi "Unexpected end of JSON"
  return { status: 'success', newCount: currentLikeCount };
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

// "1J6s_9PbYjB86Qe2fYhhz1oaki35yBDDF"
function testPermissions() {
  // 1. Lấy thư mục
  var folder = DriveApp.getFolderById("1J6s_9PbYjB86Qe2fYhhz1oaki35yBDDF");
  
  // 2. Thử TẠO một file nháp (Lệnh này sẽ kích hoạt yêu cầu quyền Ghi)
  var file = folder.createFile("test_permission.txt", "Xin chào, đây là file kiểm tra quyền");
  
  // 3. In kết quả
  Logger.log("Thành công! Đã tạo được file: " + file.getUrl());
  
  // (Tùy chọn) Xóa file nháp đi cho sạch
  file.setTrashed(true); 
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