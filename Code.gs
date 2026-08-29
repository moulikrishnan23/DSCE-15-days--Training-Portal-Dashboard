/****************************************************
 * DSCE / PPG TRAINING MANAGEMENT PORTAL
 * ULTRA HIGH-PERFORMANCE GOOGLE APPS SCRIPT BACKEND
 * With Dynamic Department Filtering, Present Count Tracking,
 * and Strict Day 15 Role Lock Enforcement
 ****************************************************/

/***********************
 * CONFIGURATION
 ***********************/

const CONFIG = {
  SPREADSHEET_ID: 'YOUR_DSCE_GOOGLE_SHEET_ID', // Paste live Google Sheet ID here
  SESSION_TIMEOUT_SECONDS: 21600,              // 6 Hours sliding session
  TIMEZONE: 'Asia/Kolkata',
  APP_NAME: 'DSCE Training Management Portal',
  INSTITUTION_NAME: 'Dhanalakshmi Srinivasan College of Engineering, Coimbatore',
  TOTAL_DAYS: 15,
  CACHE_TTL: {
    DEPT_LIST: 600,         // 10 minutes
    TRAINING_DAYS: 180,     // 3 minutes
    DASHBOARD: 120,         // 2 minutes
    STUDENT_PROFILE: 300    // 5 minutes
  }
};

/***********************
 * SHEET CONFIGURATION & CATEGORIZATION
 ***********************/

const GLOBAL_SHEETS = {
  USERS: 'Users',
  DASHBOARD: 'Dashboard',
  DASHBOARD_SUMMARY: 'Dashboard_Summary',
  SYLLABUS: 'Syllabus_Tracker',
  PRE_POST: 'Pre-Post-Comparison'
};

const ROLES = {
  LESUCCESS_ADMIN: 'lesuccess admin',
  COLLEGE_ADMIN: 'college admin',
  TRAINER: 'trainer'
};

/***********************
 * SERVER-SIDE CACHE HELPERS
 ***********************/

function getFromCache_(key) {
  try {
    const cache = CacheService.getScriptCache();
    const cached = cache.get(key);
    return cached ? JSON.parse(cached) : null;
  } catch (e) {
    return null;
  }
}

function putInCache_(key, data, ttlSeconds) {
  try {
    const cache = CacheService.getScriptCache();
    const str = JSON.stringify(data);
    if (str.length < 95000) {
      cache.put(key, str, ttlSeconds || 120);
    }
  } catch (e) {}
}

function clearAllServerCache_() {
  try {
    const cache = CacheService.getScriptCache();
    cache.removeAll([
      'dept_list',
      'dept_names',
      'training_day_status',
      'dashboard_summary_rows',
      'dashboard_data_All',
      'att_summary_All',
      'dash_rankings_All_default'
    ]);
  } catch (e) {}
}

/***********************
 * MAIN HTTP ROUTERS
 ***********************/

function doGet(e) {
  return jsonResponse({
    success: true,
    appName: CONFIG.APP_NAME,
    message: CONFIG.APP_NAME + ' API is online and running successfully.'
  });
}

function doPost(e) {
  try {
    const contents = JSON.parse(e.postData.contents);
    const action = contents.action;
    const args = contents.args || [];

    // Initialize environment (ensure Users sheet exists)
    ensureUsersSheet();

    // Route public/auth actions first
    if (action === 'login') {
      return jsonResponse(handleLogin(args[0], args[1]));
    }
    if (action === 'validateSession') {
      return jsonResponse(handleValidateSession(args[0]));
    }

    // Require valid session for all subsequent API endpoints
    const token = args[0];
    const session = validateSessionInternal(token);

    if (!session.valid) {
      return jsonResponse({ success: false, message: 'SESSION_EXPIRED' });
    }

    const user = session.user;
    const userRole = (user.role || '').toLowerCase().trim();
    const actionArgs = args.slice(1);

    // Enforce Role-Based Access Control (RBAC)
    const isWriteAction = isActionModifyingData(action);
    const isAdminOnlyAction = isActionAdminOnly(action);

    if (userRole === ROLES.COLLEGE_ADMIN && isWriteAction) {
      return jsonResponse({
        success: false,
        message: 'Forbidden: Read-only access for College Admin.'
      });
    }

    if (isAdminOnlyAction && userRole !== ROLES.LESUCCESS_ADMIN) {
      return jsonResponse({
        success: false,
        message: 'Forbidden: Only LeSuccess Admin can perform this administrative action.'
      });
    }

    // Strict Backend Day 15 Access Lock for College Admin
    if (userRole === ROLES.COLLEGE_ADMIN) {
      if (action === 'getPostTestData' || action === 'getPostTestPageData' || action === 'getPrePostComparison') {
        var dayStatus = handleGetTrainingDayStatus();
        if (!dayStatus.postTestVisible) {
          return jsonResponse({
            success: false,
            locked: true,
            message: 'ACCESS_RESTRICTED: Post-Test Report and Pre vs Post Analytics are locked until Day 15.'
          });
        }
      }
    }

    // Clear server cache on modifying actions
    if (isWriteAction) {
      clearAllServerCache_();
    }

    // Route actions
    var result;
    switch (action) {
      case 'logout':
        result = handleLogout(token);
        break;
      case 'getDashboardData':
        result = handleGetDashboardData(actionArgs[0], userRole);
        break;
      case 'getDashboardDepartmentAnalytics':
        result = handleGetDashboardDepartmentAnalytics(actionArgs[0], userRole);
        break;
      case 'getDashboardStudentRankings':
        result = handleGetDashboardStudentRankings(actionArgs[0], actionArgs[1], actionArgs[2]);
        break;
      case 'rebuildDashboardSummary':
        result = rebuildDashboardSummary();
        break;
      case 'getDepartmentList':
        result = handleGetDepartmentList();
        break;
      case 'getAttendance':
        result = handleGetAttendance(actionArgs[0]); // department
        break;
      case 'saveAttendance':
        result = handleSaveAttendance(actionArgs[0], actionArgs[1], actionArgs[2]); // department, dateColIndex, records
        break;
      case 'getSyllabus':
        result = handleGetSyllabus(actionArgs[0]); // department (optional)
        break;
      case 'saveSyllabus':
        result = handleSaveSyllabus(actionArgs[0]); // rowData
        break;
      case 'getTestData':
        result = handleGetTestData(actionArgs[0], actionArgs[1]); // department, testIndex
        break;
      case 'getTestsPageData':
        result = handleGetTestsPageData(actionArgs[0], actionArgs[1]); // department, testIndex
        break;
      case 'saveTestBlock':
        result = handleSaveTestBlock(actionArgs[0], actionArgs[1], actionArgs[2]); // department, records, testIndex
        break;
      case 'getPostTestData':
        result = handleGetPostTestData(actionArgs[0]); // department
        break;
      case 'getPostTestPageData':
        result = handleGetPostTestPageData(actionArgs[0]); // department
        break;
      case 'savePostTestData':
        result = handleSavePostTestData(actionArgs[0], actionArgs[1]); // department, records
        break;
      case 'getMockInterviewData':
        result = handleGetMockInterviewData(actionArgs[0]); // department
        break;
      case 'getMockInterviewPageData':
        result = handleGetMockInterviewPageData(actionArgs[0]); // department
        break;
      case 'saveMockInterviewData':
        result = handleSaveMockInterviewData(actionArgs[0], actionArgs[1]); // department, records
        break;
      case 'getPrePostComparison':
        result = handleGetPrePostComparison();
        break;
      case 'getStudentProfile':
        result = handleGetStudentProfile(actionArgs[0], userRole); // regNo, userRole
        break;
      case 'getAllStudentsCount':
        result = handleGetAllStudentsCount(actionArgs[0]); // department optional
        break;
      case 'getTestBlocks':
        result = handleGetTestBlocks(actionArgs[0]); // department
        break;
      case 'addNextTest':
        result = handleAddNextTest(actionArgs[0]); // testLabel
        break;
      case 'addSyllabusDepartment':
        result = handleAddSyllabusDepartment(actionArgs[0]); // departmentName
        break;
      case 'getTrainingDayStatus':
        result = handleGetTrainingDayStatus();
        break;
      case 'getAdminSheetConfig':
        result = handleGetAdminSheetConfig();
        break;
      case 'addSheet':
        result = handleAddSheet(actionArgs[0], actionArgs[1], actionArgs[2]);
        break;
      case 'removeSheet':
        result = handleRemoveSheet(actionArgs[0]);
        break;
      default:
        result = { success: false, message: 'Unknown API action: ' + action };
    }

    return jsonResponse(result);
  } catch (error) {
    return jsonResponse({ success: false, message: error.toString() });
  }
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/***********************
 * RBAC HELPER FUNCTIONS
 ***********************/

function isActionModifyingData(action) {
  return [
    'saveAttendance',
    'saveSyllabus',
    'saveTestBlock',
    'savePostTestData',
    'saveMockInterviewData',
    'addSheet',
    'removeSheet',
    'addNextTest',
    'addSyllabusDepartment'
  ].indexOf(action) !== -1;
}

function isActionAdminOnly(action) {
  return ['addSheet', 'removeSheet', 'getAdminSheetConfig', 'rebuildDashboardSummary'].indexOf(action) !== -1;
}

/***********************
 * SPREADSHEET & SHEET DISCOVERY
 ***********************/

function getSpreadsheet() {
  if (CONFIG.SPREADSHEET_ID && CONFIG.SPREADSHEET_ID !== 'YOUR_DSCE_GOOGLE_SHEET_ID') {
    return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

function ensureUsersSheet() {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(GLOBAL_SHEETS.USERS);
  if (!sheet) {
    sheet = ss.insertSheet(GLOBAL_SHEETS.USERS, 0);
    sheet.appendRow(['User ID', 'Password', 'Name', 'Role', 'Employee ID', 'Status']);
    sheet.appendRow(['1001', 'admin@lesuccess', 'LeSuccess Admin', 'lesuccess admin', 'LES01', 'Active']);
    sheet.appendRow(['1002', 'admin@dsce', 'DSCE College Admin', 'college admin', 'DSCE01', 'Active']);
    sheet.appendRow(['1003', 'trainer@123', 'Trainer 1', 'trainer', 'TR01', 'Active']);
  }
}

/**
 * Discovers departments and room numbers dynamically with caching.
 */
function handleGetDepartmentList() {
  const cacheKey = 'dept_list';
  const cached = getFromCache_(cacheKey);
  if (cached) return cached;

  var ss = getSpreadsheet();
  var sheets = ss.getSheets();
  var deptList = [];

  sheets.forEach(function(s) {
    var name = s.getName().trim();
    if (name.indexOf('Attendance_') === 0) {
      var dep = name.substring('Attendance_'.length).trim();
      if (dep) {
        var room = '';
        try {
          if (s.getLastRow() >= 4 && s.getLastColumn() >= 2) {
            room = String(s.getRange(4, 2).getValue() || '').trim();
          }
        } catch (e) {}
        deptList.push({
          name: dep,
          room: room,
          displayName: room ? (dep + ' - ' + room) : dep
        });
      }
    }
  });

  deptList.sort(function(a, b) {
    return a.name.localeCompare(b.name);
  });

  var departments = deptList.map(function(d) { return d.name; });

  const response = {
    success: true,
    departments: departments,
    departmentDetails: deptList
  };

  putInCache_(cacheKey, response, CONFIG.CACHE_TTL.DEPT_LIST);
  return response;
}

/***********************
 * AUTHENTICATION & SESSION MANAGEMENT
 ***********************/

function handleLogin(userId, password) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(GLOBAL_SHEETS.USERS);
  if (!sheet) {
    return { success: false, message: 'Users sheet not found.' };
  }

  var values = sheet.getDataRange().getValues();
  if (values.length <= 1) {
    return { success: false, message: 'No users configured.' };
  }

  var headers = values[0];
  var uIdx = headers.indexOf('User ID');
  var pIdx = headers.indexOf('Password');
  var nIdx = headers.indexOf('Name');
  var rIdx = headers.indexOf('Role');
  var eIdx = headers.indexOf('Employee ID');
  var sIdx = headers.indexOf('Status');

  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var uVal = String(row[uIdx]).trim();
    var pVal = String(row[pIdx]).trim();
    var status = String(row[sIdx]).trim();

    if ((uVal === String(userId).trim() || String(row[eIdx]).trim() === String(userId).trim()) && pVal === String(password).trim()) {
      if (status.toLowerCase() !== 'active') {
        return { success: false, message: 'User account is inactive.' };
      }

      var token = Utilities.getUuid();
      var user = {
        userId: uVal,
        name: row[nIdx],
        role: row[rIdx],
        employeeId: row[eIdx]
      };

      var props = PropertiesService.getScriptProperties();
      var sessionData = {
        user: user,
        expiresAt: Date.now() + (CONFIG.SESSION_TIMEOUT_SECONDS * 1000)
      };

      props.setProperty('SESSION_' + token, JSON.stringify(sessionData));

      return {
        success: true,
        sessionToken: token,
        user: user
      };
    }
  }

  return { success: false, message: 'Invalid User ID or Password.' };
}

function validateSessionInternal(token) {
  if (!token) return { valid: false };

  var props = PropertiesService.getScriptProperties();
  var json = props.getProperty('SESSION_' + token);
  if (!json) return { valid: false };

  try {
    var data = JSON.parse(json);
    if (data.expiresAt < Date.now()) {
      props.deleteProperty('SESSION_' + token);
      return { valid: false };
    }

    if (data.expiresAt - Date.now() < 1800000) {
      data.expiresAt = Date.now() + (CONFIG.SESSION_TIMEOUT_SECONDS * 1000);
      props.setProperty('SESSION_' + token, JSON.stringify(data));
    }

    return { valid: true, user: data.user };
  } catch (e) {
    return { valid: false };
  }
}

function handleValidateSession(token) {
  var result = validateSessionInternal(token);
  return { success: result.valid, user: result.user || null };
}

function handleLogout(token) {
  if (token) {
    PropertiesService.getScriptProperties().deleteProperty('SESSION_' + token);
  }
  return { success: true };
}

/***********************
 * DASHBOARD METRICS (DYNAMIC & FAST)
 ***********************/

const DASHBOARD_SUMMARY_SHEET = 'Dashboard_Summary';
const DASHBOARD_SUMMARY_HEADERS = [
  'Department',
  'Students',
  'Attendance %',
  'Pre-Test Avg',
  'Post-Test Avg',
  'Improvement',
  'Pre-Test Count',
  'Post-Test Count',
  'Mock Interview Avg',
  'Mock Interview Count'
];

function normalizeDepartment_(value) {
  return String(value || '').trim();
}

function escapeSheetName_(name) {
  return "'" + String(name).replace(/'/g, "''") + "'";
}

function findDepartmentSheet_(ss, prefix, department) {
  const wanted = prefix + normalizeDepartment_(department);
  let sheet = ss.getSheetByName(wanted);
  if (sheet) return sheet;

  const normalizedWanted = wanted.replace(/\s+/g, '').toLowerCase();
  const candidates = ss.getSheets();
  for (let i = 0; i < candidates.length; i++) {
    const normalized = candidates[i].getName().replace(/\s+/g, '').toLowerCase();
    if (normalized === normalizedWanted) return candidates[i];
  }
  return null;
}

function getDSCEDepartments_(ss) {
  const cached = getFromCache_('dept_names');
  if (cached) return cached;

  var departmentsSet = {};
  ss.getSheets().forEach(function(sheet) {
    var name = sheet.getName().trim();
    if (name.indexOf('Attendance_') === 0) {
      var dep = name.substring('Attendance_'.length).trim();
      if (dep) departmentsSet[dep] = true;
    }
  });
  var departments = Object.keys(departmentsSet);
  departments.sort();

  putInCache_('dept_names', departments, CONFIG.CACHE_TTL.DEPT_LIST);
  return departments;
}

function ensureDashboardSummarySheet_() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(DASHBOARD_SUMMARY_SHEET);
  const departments = getDSCEDepartments_(ss);

  if (!sheet) sheet = ss.insertSheet(DASHBOARD_SUMMARY_SHEET);

  const existingRows = Math.max(sheet.getLastRow() - 1, 0);
  const existingHeader = existingRows > 0 ? sheet.getRange(1, 1, 1, DASHBOARD_SUMMARY_HEADERS.length).getValues()[0] : [];
  const headerOk = existingHeader.length >= DASHBOARD_SUMMARY_HEADERS.length && DASHBOARD_SUMMARY_HEADERS.every(function(v, i) { return existingHeader[i] === v; });

  let deptsMatch = false;
  if (existingRows === departments.length && headerOk) {
    const existingDeptCol = sheet.getRange(2, 1, existingRows, 1).getValues();
    deptsMatch = departments.every(function(dep, i) {
      return String(existingDeptCol[i][0]).trim() === dep;
    });
  }

  if (deptsMatch && headerOk) {
    if (!sheet.isSheetHidden()) sheet.hideSheet();
    return sheet;
  }

  sheet.showSheet();
  sheet.clearContents();
  sheet.getRange(1, 1, 1, DASHBOARD_SUMMARY_HEADERS.length).setValues([DASHBOARD_SUMMARY_HEADERS]);

  const rows = departments.map(function(dep, index) {
    const att = findDepartmentSheet_(ss, 'Attendance_', dep);
    const pre = findDepartmentSheet_(ss, 'PreTest_Report_', dep);
    const post = findDepartmentSheet_(ss, 'PostTest_Report_', dep);
    const mock = findDepartmentSheet_(ss, 'MockInterview_', dep);
    const attRef = att ? escapeSheetName_(att.getName()) : null;
    const preRef = pre ? escapeSheetName_(pre.getName()) : null;
    const postRef = post ? escapeSheetName_(post.getName()) : null;
    const mockRef = mock ? escapeSheetName_(mock.getName()) : null;
    const rowNo = index + 2;

    return [
      dep,
      attRef ? '=IFERROR(COUNTIF(' + attRef + '!C14:C1003,"<>"),0)' : '=0',
      attRef ? '=IFERROR(AVERAGEIF(' + attRef + '!C14:C1003,"<>",' + attRef + '!BW14:BW1003),0)' : '=0',
      preRef ? '=IFERROR(AVERAGEIF(' + preRef + '!C6:C1003,"<>",' + preRef + '!G6:G1003),0)' : '=0',
      postRef ? '=IFERROR(AVERAGEIF(' + postRef + '!C6:C1003,"<>",' + postRef + '!G6:G1003),0)' : '=0',
      '=E' + rowNo + '-D' + rowNo,
      preRef ? '=IFERROR(COUNTIFS(' + preRef + '!F6:F1003,"<>",' + preRef + '!F6:F1003,"<>A",' + preRef + '!F6:F1003,"<>0"),0)' : '=0',
      postRef ? '=IFERROR(COUNTIFS(' + postRef + '!F6:F1003,"<>",' + postRef + '!F6:F1003,"<>A",' + postRef + '!F6:F1003,"<>0"),0)' : '=0',
      mockRef ? '=IFERROR(AVERAGEIF(' + mockRef + '!C6:C1003,"<>",' + mockRef + '!E6:E1003),0)' : '=0',
      mockRef ? '=IFERROR(COUNTIFS(' + mockRef + '!E6:E1003,"<>",' + mockRef + '!E6:E1003,"<>0"),0)' : '=0'
    ];
  });

  if (rows.length) sheet.getRange(2, 1, rows.length, DASHBOARD_SUMMARY_HEADERS.length).setValues(rows);
  sheet.hideSheet();
  SpreadsheetApp.flush();
  return sheet;
}

function readDashboardSummary_(depFilter) {
  const sheet = ensureDashboardSummarySheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const rows = sheet.getRange(2, 1, lastRow - 1, 10).getValues();
  const wanted = normalizeDepartment_(depFilter);

  return rows
    .filter(function(row) {
      const depName = String(row[0] || '').trim();
      return depName && (!wanted || wanted === 'All' || depName.toLowerCase() === wanted.toLowerCase());
    })
    .map(function(row) {
      return {
        department: String(row[0]),
        students: Number(row[1]) || 0,
        attendancePct: Number(row[2]) || 0,
        preTestAverage: Number(row[3]) || 0,
        postTestAverage: Number(row[4]) || 0,
        improvement: Number(row[5]) || 0,
        preTestCount: Number(row[6]) || 0,
        postTestCount: Number(row[7]) || 0,
        mockInterviewAvg: Number(row[8]) || 0,
        mockInterviewCount: Number(row[9]) || 0
      };
    });
}

/**
 * Ultra-fast Unified Dashboard API with dynamic department filtering & Present Counts
 */
function handleGetDashboardData(depFilter, userRole) {
  const cacheKey = 'dashboard_data_' + (depFilter || 'All') + '_' + (userRole || '');
  const cached = getFromCache_(cacheKey);
  if (cached) return cached;

  const ss = getSpreadsheet();
  const departments = getDSCEDepartments_(ss);
  const allSummaryRows = readDashboardSummary_('All');
  const isIndividualDept = depFilter && depFilter !== 'All';
  const targetDept = isIndividualDept ? normalizeDepartment_(depFilter) : null;

  const dayStatus = handleGetTrainingDayStatus();
  const isCollegeAdmin = userRole === ROLES.COLLEGE_ADMIN;
  const hidePostTest = isCollegeAdmin && !dayStatus.postTestVisible;

  const attendance = getLatestAttendanceSummary_(ss, depFilter);
  const rankings = handleGetDashboardStudentRankings(10, depFilter);

  const rows = isIndividualDept
    ? allSummaryRows.filter(function(r) { return r.department.toLowerCase() === targetDept.toLowerCase(); })
    : allSummaryRows;

  let totalStudents = 0;
  let overallAttendancePct = 0;
  let preTestAverage = 0;
  let postTestAverage = 0;
  let averageImprovement = 0;
  let mockInterviewAvgScore = 0;
  let preCount = 0;
  let postCount = 0;
  let mockCount = 0;

  if (isIndividualDept && rows.length > 0) {
    const d = rows[0];
    totalStudents = d.students;
    overallAttendancePct = d.attendancePct;
    preTestAverage = d.preTestAverage;
    postTestAverage = hidePostTest ? 0 : d.postTestAverage;
    averageImprovement = hidePostTest ? 0 : d.improvement;
    mockInterviewAvgScore = d.mockInterviewAvg;
    preCount = d.preTestCount;
    postCount = hidePostTest ? 0 : d.postTestCount;
    mockCount = d.mockInterviewCount;
  } else if (allSummaryRows.length > 0) {
    totalStudents = allSummaryRows.reduce(function(sum, r) { return sum + r.students; }, 0);
    const attendanceWeight = allSummaryRows.reduce(function(sum, r) { return sum + r.attendancePct * r.students; }, 0);
    overallAttendancePct = totalStudents ? attendanceWeight / totalStudents : 0;
    const preWeight = allSummaryRows.reduce(function(sum, r) { return sum + r.preTestAverage * r.preTestCount; }, 0);
    preCount = allSummaryRows.reduce(function(sum, r) { return sum + r.preTestCount; }, 0);
    preTestAverage = preCount ? preWeight / preCount : 0;
    
    if (!hidePostTest) {
      const postWeight = allSummaryRows.reduce(function(sum, r) { return sum + r.postTestAverage * r.postTestCount; }, 0);
      postCount = allSummaryRows.reduce(function(sum, r) { return sum + r.postTestCount; }, 0);
      postTestAverage = postCount ? postWeight / postCount : 0;
      averageImprovement = postCount && preCount ? postTestAverage - preTestAverage : 0;
    }

    const mockWeight = allSummaryRows.reduce(function(sum, r) { return sum + r.mockInterviewAvg * r.mockInterviewCount; }, 0);
    mockCount = allSummaryRows.reduce(function(sum, r) { return sum + r.mockInterviewCount; }, 0);
    mockInterviewAvgScore = mockCount ? mockWeight / mockCount : 0;
  }

  // Build department summary rows with dynamic presentCount, absentCount, halfDayCount
  const deptSummary = (isIndividualDept ? rows : allSummaryRows).map(function(r) {
    const depAtt = (attendance.deptAttendance && attendance.deptAttendance[r.department])
      ? attendance.deptAttendance[r.department]
      : (isIndividualDept ? { present: attendance.presentToday, absent: attendance.absentToday, halfDay: attendance.halfDayToday } : { present: 0, absent: 0, halfDay: 0 });

    return {
      department: r.department,
      count: r.students,
      students: r.students,
      presentCount: depAtt.present,
      absentCount: depAtt.absent,
      halfDayCount: depAtt.halfDay,
      attendancePct: r.attendancePct,
      preTestAverage: r.preTestAverage,
      postTestAverage: hidePostTest ? 0 : r.postTestAverage,
      improvement: hidePostTest ? 0 : r.improvement,
      mockInterviewAvg: r.mockInterviewAvg
    };
  });

  const response = {
    success: true,
    kpis: {
      totalStudents: totalStudents,
      overallAttendancePct: overallAttendancePct,
      preTestConducted: preCount,
      preTestAverage: preTestAverage,
      postTestConducted: postCount,
      postTestAverage: postTestAverage,
      averageImprovement: averageImprovement,
      mockInterviewAttended: mockCount,
      mockInterviewAvgScore: mockInterviewAvgScore,
      totalDepartments: isIndividualDept ? 1 : departments.length,
      trainingDay: attendance.trainingDay,
      totalTrainingDays: attendance.totalTrainingDays,
      completedDays: attendance.completedDays,
      remainingDays: attendance.remainingDays,
      presentToday: attendance.presentToday,
      absentToday: attendance.absentToday,
      halfDayToday: attendance.halfDayToday,
      attendanceDateKey: attendance.dateKey,
      attendanceDateLabel: attendance.dateLabel,
      postTestUnlocked: !hidePostTest
    },
    departmentSummary: deptSummary,
    allDepartmentsSummary: allSummaryRows.map(function(r) {
      return {
        department: r.department,
        count: r.students,
        students: r.students,
        attendancePct: r.attendancePct,
        preTestAverage: r.preTestAverage,
        postTestAverage: hidePostTest ? 0 : r.postTestAverage,
        improvement: hidePostTest ? 0 : r.improvement,
        mockInterviewAvg: r.mockInterviewAvg
      };
    }),
    topStudents: rankings.topStudents || [],
    leastStudents: rankings.leastStudents || []
  };

  putInCache_(cacheKey, response, CONFIG.CACHE_TTL.DASHBOARD);
  return response;
}

/**
 * Attendance Summary with per-department breakdown (Ultra-Fast 1-Pass)
 */
function getLatestAttendanceSummary_(ss, depFilter) {
  const allDepts = getDSCEDepartments_(ss);
  const departments = depFilter && depFilter !== 'All' ? [depFilter] : allDepts;

  if (!departments.length) {
    return {
      presentToday: 0, absentToday: 0, halfDayToday: 0,
      trainingDay: 1, totalTrainingDays: CONFIG.TOTAL_DAYS,
      completedDays: 0, remainingDays: CONFIG.TOTAL_DAYS,
      dateKey: null, dateLabel: 'Day 1',
      deptAttendance: {}
    };
  }

  // Pre-index all sheets in 1 RPC roundtrip
  const sheets = ss.getSheets();
  const sheetsMap = {};
  sheets.forEach(function(s) {
    sheetsMap[s.getName().toLowerCase().trim()] = s;
  });

  function getSheetFast_(prefix, dep) {
    const key = (prefix + dep).toLowerCase().trim();
    return sheetsMap[key] || null;
  }

  // Step 1: Read schedule mapping from reference sheet
  const refSheet = getSheetFast_('attendance_', allDepts[0] || departments[0]);
  if (!refSheet || refSheet.getLastColumn() < 5) {
    return {
      presentToday: 0, absentToday: 0, halfDayToday: 0,
      trainingDay: 1, totalTrainingDays: CONFIG.TOTAL_DAYS,
      completedDays: 0, remainingDays: CONFIG.TOTAL_DAYS,
      dateKey: null, dateLabel: 'Day 1',
      deptAttendance: {}
    };
  }

  const lastCol = refSheet.getLastColumn();
  const width = lastCol - 4;
  const schedBlock = refSheet.getRange(8, 5, 6, width).getValues();
  const dayHeaders = schedBlock[2];
  const dates = schedBlock[3];
  const dayTypes = schedBlock[4];
  const counters = schedBlock[5];

  // Step 2: Detect latest marked training day (Sample first 3 department sheets for maximum speed)
  let latestColIdx = -1;
  let latestDate = null;
  let latestTrainingDay = 0;

  const sampleDepts = allDepts.slice(0, 3);
  for (let d = 0; d < sampleDepts.length; d++) {
    const sheet = getSheetFast_('attendance_', sampleDepts[d]);
    if (!sheet) continue;
    const sLastRow = sheet.getLastRow();
    if (sLastRow < 14) continue;
    const sWidth = Math.min(sheet.getLastColumn() - 4, width);
    if (sWidth <= 0) continue;

    const numStudents = Math.min(sLastRow - 13, 20); // sample first 20 students
    const attMatrix = sheet.getRange(14, 5, numStudents, sWidth).getValues();

    for (let c = sWidth - 1; c >= 0; c--) {
      if (String(dayTypes[c] || '').trim() !== 'Training Day') continue;

      let hasEntry = false;
      for (let r = 0; r < attMatrix.length; r++) {
        const v = String(attMatrix[r][c] || '').trim();
        if (v === 'Present' || v === 'Absent' || v === 'Half Day') {
          hasEntry = true;
          break;
        }
      }

      if (hasEntry) {
        if (c > latestColIdx) {
          latestColIdx = c;
          latestDate = dates[c] instanceof Date ? dates[c] : null;
          latestTrainingDay = Number(counters[c]) || (c + 1);
        }
        break;
      }
    }
    if (latestColIdx >= 0) break; // Found latest day
  }

  // Fallback to Day 1 if no entries
  if (latestColIdx < 0) {
    for (let c = 0; c < dayTypes.length; c++) {
      if (String(dayTypes[c] || '').trim() === 'Training Day') {
        latestColIdx = c;
        latestDate = dates[c] instanceof Date ? dates[c] : null;
        latestTrainingDay = Number(counters[c]) || 1;
        break;
      }
    }
  }

  // Step 3: Count Present, Absent, Half Day on latestColIdx across targeted departments
  let totalPresent = 0, totalAbsent = 0, totalHalfDay = 0;
  const deptAttendance = {};
  const targetColNumber = 5 + (latestColIdx >= 0 ? latestColIdx : 0);
  const targetDeptsToScan = depFilter && depFilter !== 'All' ? [depFilter] : allDepts;

  targetDeptsToScan.forEach(function(dep) {
    const sheet = getSheetFast_('attendance_', dep);
    if (!sheet) return;
    const sLastRow = sheet.getLastRow();
    if (sLastRow < 14) return;
    const numStudents = sLastRow - 13;

    const colVals = sheet.getRange(14, targetColNumber, numStudents, 1).getValues();
    let dp = 0, da = 0, dh = 0;
    for (let r = 0; r < colVals.length; r++) {
      const v = String(colVals[r][0] || '').trim();
      if (v === 'Present') dp++;
      else if (v === 'Absent') da++;
      else if (v === 'Half Day') dh++;
    }

    deptAttendance[dep] = { present: dp, absent: da, halfDay: dh };
    totalPresent += dp;
    totalAbsent += da;
    totalHalfDay += dh;
  });

  const hasAnyEntries = (totalPresent > 0 || totalAbsent > 0 || totalHalfDay > 0);
  const completedDays = hasAnyEntries ? latestTrainingDay : 0;
  const remainingDays = Math.max(CONFIG.TOTAL_DAYS - completedDays, 0);
  const activeTrainingDay = hasAnyEntries ? (latestTrainingDay || 1) : 0;

  return {
    presentToday: totalPresent,
    absentToday: totalAbsent,
    halfDayToday: totalHalfDay,
    trainingDay: activeTrainingDay,
    totalTrainingDays: CONFIG.TOTAL_DAYS,
    completedDays: completedDays,
    remainingDays: remainingDays,
    dateKey: latestDate ? Utilities.formatDate(latestDate, CONFIG.TIMEZONE, 'yyyy-MM-dd') : null,
    dateLabel: hasAnyEntries ? (latestDate ? Utilities.formatDate(latestDate, CONFIG.TIMEZONE, 'dd MMM yyyy') : (dayHeaders[latestColIdx] || 'Day 1')) : 'Not Started',
    deptAttendance: deptAttendance
  };
}

function handleGetDashboardDepartmentAnalytics(depFilter, userRole) {
  const dayStatus = handleGetTrainingDayStatus();
  const hidePostTest = userRole === ROLES.COLLEGE_ADMIN && !dayStatus.postTestVisible;

  return readDashboardSummary_(depFilter).map(function(r) {
    return {
      department: r.department,
      students: r.students,
      attendancePct: r.attendancePct,
      testAverage: r.preTestAverage,
      preTestAverage: r.preTestAverage,
      postTestAverage: hidePostTest ? 0 : r.postTestAverage,
      improvement: hidePostTest ? 0 : r.improvement,
      mockInterviewAvg: r.mockInterviewAvg
    };
  });
}

function handleGetDashboardStudentRankings(limit, depFilter, testIndex) {
  const cacheKey = 'dash_rankings_' + (depFilter || 'All') + '_' + (testIndex || 'default');
  const cached = getFromCache_(cacheKey);
  if (cached) return cached;

  const ss = getSpreadsheet();
  const departments = depFilter && depFilter !== 'All' ? [depFilter] : getDSCEDepartments_(ss);
  const studentMap = {};

  departments.forEach(function(dep) {
    // 1. Read PreTest / Test scores
    const pre = findDepartmentSheet_(ss, 'PreTest_Report_', dep);
    if (pre) {
      const pLastRow = pre.getLastRow();
      const pMaxCol = pre.getLastColumn();
      if (pLastRow >= 6 && pMaxCol >= 4) {
        const headerBlock = pre.getRange(1, 1, 5, pMaxCol).getValues();
        const row1 = headerBlock[0];
        const row5 = headerBlock[4];

        var blocks = [];
        for (var c = 3; c < row1.length; c++) {
          var lbl = String(row1[c] || '').trim();
          if (lbl && (lbl.toLowerCase().indexOf('test') !== -1 || lbl.toLowerCase().indexOf('pre') !== -1)) {
            var hasPct = (c + 3 < row5.length && String(row5[c + 3] || '').toLowerCase().indexOf('percent') !== -1);
            blocks.push({ id: blocks.length, label: lbl, startCol: c + 1, hasPctCol: hasPct });
          }
        }
        if (!blocks.length) blocks.push({ id: 0, label: 'Pre Test 1', startCol: 4, hasPctCol: true });

        const values = pre.getRange(6, 1, pLastRow - 5, pMaxCol).getValues();

        // Identify which test blocks have actually been conducted (have at least one student with marks > 0)
        const conductedBlocks = [];
        blocks.forEach(function(blk) {
          const totalCol = blk.startCol + 2;
          let hasScores = false;
          for (let r = 0; r < values.length; r++) {
            const v = Number(values[r][totalCol - 1]);
            if (v > 0) {
              hasScores = true;
              break;
            }
          }
          if (hasScores) conductedBlocks.push(blk);
        });

        const activeBlocks = conductedBlocks.length > 0 ? conductedBlocks : [blocks[0]];

        values.forEach(function(row) {
          const regNo = String(row[1] || '').trim();
          const name = String(row[2] || '').trim();
          if (!name) return;

          const key = (dep + '_' + regNo).toLowerCase();
          if (!studentMap[key]) {
            studentMap[key] = {
              department: dep,
              regNo: regNo,
              name: name,
              scores: [],
              scoreBreakdown: []
            };
          }

          activeBlocks.forEach(function(blk) {
            const totalCol = blk.startCol + 2;
            const pctCol = blk.hasPctCol ? blk.startCol + 3 : null;
            const totalVal = row[totalCol - 1];
            const pctVal = pctCol ? row[pctCol - 1] : null;

            const total = (totalVal !== '' && totalVal !== null && totalVal !== undefined && totalVal !== 'A') ? Number(totalVal) || 0 : 0;
            const pct = (pctVal !== null && pctVal !== '' && pctVal !== undefined && pctVal !== 'A') ? Number(pctVal) || 0 : total;
            
            // Only include in average if scored > 0
            if (pct > 0) {
              studentMap[key].scores.push(pct);
              studentMap[key].scoreBreakdown.push({ label: blk.label, pct: pct });
            }
          });
        });
      }
    }

    // 2. Read Mock Interview scores
    const mock = findDepartmentSheet_(ss, 'MockInterview_', dep);
    if (mock) {
      const mLastRow = mock.getLastRow();
      const mMaxCol = mock.getLastColumn();
      if (mLastRow >= 6 && mMaxCol >= 4) {
        const mValues = mock.getRange(6, 1, mLastRow - 5, mMaxCol).getValues();

        mValues.forEach(function(row) {
          const regNo = String(row[1] || '').trim();
          const name = String(row[2] || '').trim();
          if (!name) return;

          const key = (dep + '_' + regNo).toLowerCase();
          if (!studentMap[key]) {
            studentMap[key] = {
              department: dep,
              regNo: regNo,
              name: name,
              scores: [],
              scoreBreakdown: []
            };
          }

          const scoreVal = row[3];
          const pctVal = mMaxCol >= 5 ? row[4] : null;

          const score = (scoreVal !== '' && scoreVal !== null && scoreVal !== undefined && scoreVal !== 'A') ? Number(scoreVal) || 0 : 0;
          const pct = (pctVal !== null && pctVal !== '' && pctVal !== undefined && pctVal !== 'A') ? Number(pctVal) || 0 : score;

          // Only include in average if scored > 0
          if (pct > 0) {
            studentMap[key].scores.push(pct);
            studentMap[key].scoreBreakdown.push({ label: 'Mock Interview', pct: pct });
          }
        });
      }
    }
  });

  // Calculate composite average percentage for each student (only averaging tests where score > 0)
  const rows = [];
  Object.keys(studentMap).forEach(function(k) {
    const s = studentMap[k];
    if (s.scores.length > 0) {
      const sum = s.scores.reduce(function(a, b) { return a + b; }, 0);
      const avgPct = sum / s.scores.length;
      rows.push({
        department: s.department,
        regNo: s.regNo,
        name: s.name,
        percentage: avgPct,
        evalCount: s.scores.length,
        testName: s.scoreBreakdown.map(function(b) { return b.label + ' (' + b.pct.toFixed(0) + '%)'; }).join(', ')
      });
    } else {
      rows.push({
        department: s.department,
        regNo: s.regNo,
        name: s.name,
        percentage: 0,
        evalCount: 0,
        testName: 'No graded assessments'
      });
    }
  });

  const topN = Number(limit) > 0 ? Number(limit) : 10;
  const topStudents = rows.slice().sort(function(a, b) { return b.percentage - a.percentage; }).slice(0, topN)
    .map(function(r, i) { return Object.assign({ rank: i + 1 }, r); });
  const leastStudents = rows.slice().sort(function(a, b) { return a.percentage - b.percentage; }).slice(0, topN)
    .map(function(r, i) { return Object.assign({ rank: i + 1 }, r); });

  const response = { success: true, topStudents: topStudents, leastStudents: leastStudents };
  putInCache_(cacheKey, response, 180);
  return response;
}

function rebuildDashboardSummary() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(DASHBOARD_SUMMARY_SHEET);
  if (sheet) {
    sheet.clearContents();
  }
  ensureDashboardSummarySheet_();
  clearAllServerCache_();
  SpreadsheetApp.flush();
  return { success: true, message: 'Dashboard summary rebuilt successfully.' };
}

/***********************
 * ATTENDANCE MODULE
 ***********************/

function handleGetAttendance(department) {
  var ss = getSpreadsheet();
  var targetDep = department || getFirstDepartment();
  var sheetName = 'Attendance_' + targetDep;
  var sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    return { success: false, message: 'Sheet ' + sheetName + ' not found.' };
  }

  var values = sheet.getDataRange().getValues();
  if (values.length < 14) {
    return { success: true, dates: [], students: [], trainingDays: [], metadata: {} };
  }

  var headerRow = values[9];

  var metadata = {
    collegeName: values[2] ? (values[2][1] || '') : '',
    roomNumber: values[3] ? (values[3][1] || '') : '',
    department: values[4] ? (values[4][1] || '') : '',
    section: values[5] ? (values[5][1] || '') : '',
    totalStrength: values[5] ? (values[5][13] || 0) : 0
  };

  var trainingDays = [];
  for (var c = 4; c < headerRow.length; c++) {
    var header = String(headerRow[c] || '').trim();
    if (!header) continue;
    if (header.toLowerCase() === 'off') continue;
    if (header.toLowerCase().indexOf('attendance') !== -1) continue;
    trainingDays.push({
      label: header,
      colIndex: c
    });
  }

  var dateRow = values[10];
  var dates = trainingDays.map(function(td) {
    var dateVal = dateRow[td.colIndex];
    if (dateVal instanceof Date) {
      return Utilities.formatDate(dateVal, CONFIG.TIMEZONE, 'dd/MM/yyyy');
    }
    return String(dateVal || '');
  });

  var students = [];
  for (var r = 13; r < values.length; r++) {
    var row = values[r];
    var name = row[2];

    if (name && String(name).trim() !== '') {
      var attendanceMap = {};
      for (var di = 0; di < trainingDays.length; di++) {
        var ci = trainingDays[di].colIndex;
        attendanceMap[di] = row[ci] || '';
      }
      students.push({
        sNo: row[0],
        regNo: row[1],
        name: name,
        dept: row[3] || targetDep,
        rowIdx: r + 1,
        attendance: attendanceMap
      });
    }
  }

  return {
    success: true,
    department: targetDep,
    dates: dates,
    trainingDays: trainingDays.map(function(td) { return td.label; }),
    students: students,
    metadata: metadata
  };
}

function handleSaveAttendance(department, dateColIdx, records) {
  var ss = getSpreadsheet();
  var targetDep = department || getFirstDepartment();
  var sheetName = 'Attendance_' + targetDep;
  var sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    return { success: false, message: 'Sheet ' + sheetName + ' not found.' };
  }

  var values = sheet.getDataRange().getValues();
  var headerRow = values[9];

  var trainingDays = [];
  for (var c = 4; c < headerRow.length; c++) {
    var header = String(headerRow[c] || '').trim();
    if (!header) continue;
    if (header.toLowerCase() === 'off') continue;
    if (header.toLowerCase().indexOf('attendance') !== -1) continue;
    trainingDays.push({ colIndex: c });
  }

  if (dateColIdx < 0 || dateColIdx >= trainingDays.length) {
    return { success: false, message: 'Invalid training day index: ' + dateColIdx };
  }

  var actualCol = trainingDays[dateColIdx].colIndex + 1;

  records.forEach(function(rec) {
    if (rec.rowIdx) {
      sheet.getRange(rec.rowIdx, actualCol).setValue(rec.status);
    }
  });

  clearAllServerCache_();
  return { success: true, message: 'Attendance saved successfully for ' + targetDep };
}

/***********************
 * SYLLABUS TRACKER MODULE
 ***********************/

function handleGetSyllabus(department) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(GLOBAL_SHEETS.SYLLABUS);
  if (!sheet) {
    return { success: false, message: 'Syllabus sheet not found.' };
  }

  var values = sheet.getDataRange().getValues();
  if (values.length < 5) {
    return { success: true, syllabus: [], departments: [] };
  }

  var deptRow = values[2];

  var deptBlocks = [];
  for (var c = 0; c < deptRow.length; c++) {
    var val = String(deptRow[c] || '').trim();
    if (val && val !== '') {
      deptBlocks.push({
        department: val,
        startCol: c
      });
    }
  }

  var targetBlock = null;
  if (department && department !== 'All') {
    for (var b = 0; b < deptBlocks.length; b++) {
      if (deptBlocks[b].department.toLowerCase() === department.toLowerCase()) {
        targetBlock = deptBlocks[b];
        break;
      }
    }
    if (!targetBlock && deptBlocks.length > 0) {
      targetBlock = deptBlocks[0];
    }
  } else if (deptBlocks.length > 0) {
    targetBlock = deptBlocks[0];
  }

  if (!targetBlock) {
    return { success: true, syllabus: [], departments: deptBlocks.map(function(d) { return d.department; }) };
  }

  var list = [];
  var sc = targetBlock.startCol;
  for (var r = 4; r < values.length; r++) {
    var row = values[r];
    var day = row[sc];
    if (day && String(day).trim() !== '') {
      var dateVal = row[sc + 1];
      if (dateVal instanceof Date) {
        dateVal = Utilities.formatDate(dateVal, CONFIG.TIMEZONE, 'dd/MM/yyyy');
      }
      list.push({
        rowIdx: r + 1,
        colOffset: sc,
        day: day,
        date: dateVal || '',
        topic: row[sc + 2] || '',
        trainer: row[sc + 3] || ''
      });
    }
  }

  return {
    success: true,
    syllabus: list,
    currentDepartment: targetBlock.department,
    departments: deptBlocks.map(function(d) { return d.department; })
  };
}

function handleSaveSyllabus(rowData) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(GLOBAL_SHEETS.SYLLABUS);
  if (!sheet) return { success: false, message: 'Syllabus sheet not found.' };

  if (rowData.rowIdx && rowData.colOffset !== undefined) {
    var col = rowData.colOffset + 1;
    sheet.getRange(rowData.rowIdx, col, 1, 4).setValues([[
      rowData.day,
      rowData.date,
      rowData.topic,
      rowData.trainer
    ]]);
  }

  return { success: true, message: 'Syllabus updated successfully.' };
}

/***********************
 * PRE-TEST & DYNAMIC REGULAR TESTS MODULE (OPTIMIZED)
 ***********************/

function handleGetTestBlocks(department) {
  var ss = getSpreadsheet();
  var targetDep = department || getFirstDepartment();
  var sheet = ss.getSheetByName('PreTest_Report_' + targetDep);
  if (!sheet) {
    return { success: true, testBlocks: [{ id: 0, label: 'Pre Test 1', startCol: 4, hasPctCol: true }] };
  }

  var maxCol = sheet.getLastColumn();
  if (maxCol < 4) return { success: true, testBlocks: [{ id: 0, label: 'Pre Test 1', startCol: 4, hasPctCol: true }] };

  var row1 = sheet.getRange(1, 1, 1, maxCol).getValues()[0];
  var row5 = sheet.getRange(5, 1, 1, maxCol).getValues()[0];

  var blocks = [];
  for (var c = 3; c < row1.length; c++) {
    var lbl = String(row1[c] || '').trim();
    if (lbl && (lbl.toLowerCase().indexOf('test') !== -1 || lbl.toLowerCase().indexOf('pre') !== -1)) {
      var hasPct = (c + 3 < row5.length && String(row5[c + 3] || '').toLowerCase().indexOf('percent') !== -1);
      blocks.push({
        id: blocks.length,
        label: lbl,
        startCol: c + 1,
        hasPctCol: hasPct
      });
    }
  }

  if (blocks.length === 0) {
    blocks.push({ id: 0, label: 'Pre Test 1', startCol: 4, hasPctCol: true });
  }

  return { success: true, testBlocks: blocks };
}

function handleGetTestData(department, testIndex) {
  var ss = getSpreadsheet();
  var targetDep = department || getFirstDepartment();
  var sheet = ss.getSheetByName('PreTest_Report_' + targetDep);

  if (!sheet) {
    return { success: false, message: 'Sheet PreTest_Report_' + targetDep + ' not found.' };
  }

  var blocksRes = handleGetTestBlocks(targetDep);
  var blocks = blocksRes.testBlocks || [];
  var tIdx = Number(testIndex) || 0;
  if (tIdx < 0 || tIdx >= blocks.length) tIdx = 0;
  var targetBlock = blocks[tIdx] || { startCol: 4, label: 'Pre Test 1', hasPctCol: true };

  var values = sheet.getDataRange().getValues();
  var students = [];
  var sc = targetBlock.startCol - 1;

  var row3 = values[2] || [];
  var maxMark = 100;
  if (sc + 2 < row3.length && Number(row3[sc + 2]) > 0) {
    maxMark = Number(row3[sc + 2]);
  } else if (sc + 3 < row3.length && Number(row3[sc + 3]) > 0) {
    maxMark = Number(row3[sc + 3]);
  }

  for (var r = 5; r < values.length; r++) {
    var row = values[r];
    if (row[2] && String(row[2]).trim() !== '') {
      var marks2 = Number(row[sc]) || 0;
      var mcq = Number(row[sc + 1]) || 0;
      var total = Number(row[sc + 2]) || (marks2 + mcq);
      var pct = targetBlock.hasPctCol && row[sc + 3] !== undefined && row[sc + 3] !== ''
        ? Number(row[sc + 3]) || 0
        : (maxMark ? Math.round((total / maxMark) * 1000) / 10 : 0);

      students.push({
        rowIdx: r + 1,
        sNo: row[0],
        regNo: row[1],
        name: row[2],
        marks2: marks2,
        mcq: mcq,
        total: total,
        percentage: pct
      });
    }
  }

  return {
    success: true,
    department: targetDep,
    testIndex: tIdx,
    testLabel: targetBlock.label,
    testBlocks: blocks,
    students: students
  };
}

/**
 * Unified endpoint for the Tests page: loads tests, blocks, and student count in 1 single roundtrip
 */
function handleGetTestsPageData(department, testIndex) {
  const testData = handleGetTestData(department, testIndex);
  const countData = handleGetAllStudentsCount(department);
  return Object.assign({}, testData, { totalStudents: countData.totalStudents || 0 });
}

function handleSaveTestBlock(department, records, testIndex) {
  var ss = getSpreadsheet();
  var targetDep = department || getFirstDepartment();
  var sheet = ss.getSheetByName('PreTest_Report_' + targetDep);

  if (!sheet) return { success: false, message: 'Sheet PreTest_Report_' + targetDep + ' not found.' };

  var blocksRes = handleGetTestBlocks(targetDep);
  var blocks = blocksRes.testBlocks || [];
  var tIdx = Number(testIndex) || 0;
  if (tIdx < 0 || tIdx >= blocks.length) tIdx = 0;
  var targetBlock = blocks[tIdx] || { startCol: 4, hasPctCol: true };

  var sc = targetBlock.startCol;

  records.forEach(function(rec) {
    if (rec.rowIdx) {
      var marks2 = parseFloat(rec.marks2) || 0;
      var mcq = parseFloat(rec.mcq) || 0;
      var total = marks2 + mcq;
      if (targetBlock.hasPctCol) {
        var pct = ((total / 100) * 100).toFixed(1);
        sheet.getRange(rec.rowIdx, sc, 1, 4).setValues([[marks2, mcq, total, pct]]);
      } else {
        sheet.getRange(rec.rowIdx, sc, 1, 3).setValues([[marks2, mcq, total]]);
      }
    }
  });

  clearAllServerCache_();
  return { success: true, message: 'Scores saved successfully for ' + (targetBlock.label || 'Test') + ' (' + targetDep + ')' };
}

function handleAddNextTest(testLabel) {
  var ss = getSpreadsheet();
  var departments = getDSCEDepartments_(ss);
  var addedCount = 0;

  departments.forEach(function(dep) {
    var sheet = ss.getSheetByName('PreTest_Report_' + dep);
    if (!sheet) return;

    var blocksRes = handleGetTestBlocks(dep);
    var blocks = blocksRes.testBlocks || [];
    var lastBlock = blocks[blocks.length - 1];
    var nextTestNum = blocks.length + 1;
    var label = (testLabel && String(testLabel).trim()) || ('Test ' + nextTestNum);

    var lastEndCol = lastBlock ? (lastBlock.hasPctCol ? lastBlock.startCol + 3 : lastBlock.startCol + 2) : 7;
    var newStartCol = lastEndCol + 2;

    sheet.getRange(1, newStartCol).setValue(label);
    sheet.getRange(1, newStartCol + 1).setValue('Total number of students');
    sheet.getRange(1, newStartCol + 2).setValue(0);

    sheet.getRange(2, newStartCol + 1).setValue('Date');

    sheet.getRange(3, newStartCol + 1).setValue('Total Mark');
    sheet.getRange(3, newStartCol + 2).setValue(100);

    sheet.getRange(5, newStartCol, 1, 3).setValues([['2 Marks', 'MCQ', 'Total']]);

    addedCount++;
  });

  clearAllServerCache_();
  return { success: true, message: 'Test "' + (testLabel || 'New Test') + '" added dynamically across ' + addedCount + ' department sheets.' };
}

/***********************
 * POST-TEST MODULE (OPTIMIZED)
 ***********************/

function handleGetPostTestData(department) {
  var ss = getSpreadsheet();
  var targetDep = department || getFirstDepartment();
  var sheetName = 'PostTest_Report_' + targetDep;
  var sheet = ss.getSheetByName(sheetName);

  if (!sheet) return { success: false, message: 'Sheet ' + sheetName + ' not found.' };

  var values = sheet.getDataRange().getValues();
  var students = [];

  for (var r = 5; r < values.length; r++) {
    var row = values[r];
    if (row[2] && String(row[2]).trim() !== '') {
      students.push({
        rowIdx: r + 1,
        sNo: row[0],
        regNo: row[1],
        name: row[2],
        mcq: row[3] || 0,
        marks2: row[4] || 0,
        total: row[5] || 0,
        percentage: row[6] || 0
      });
    }
  }

  return { success: true, department: targetDep, students: students };
}

/**
 * Unified endpoint for the PostTest page: loads scores, total students, and Day 15 lock status in 1 roundtrip
 */
function handleGetPostTestPageData(department) {
  const postData = handleGetPostTestData(department);
  const countData = handleGetAllStudentsCount(department);
  const dayStatus = handleGetTrainingDayStatus();
  return Object.assign({}, postData, {
    totalStudents: countData.totalStudents || 0,
    postTestVisible: dayStatus.postTestVisible
  });
}

function handleSavePostTestData(department, records) {
  var ss = getSpreadsheet();
  var targetDep = department || getFirstDepartment();
  var sheetName = 'PostTest_Report_' + targetDep;
  var sheet = ss.getSheetByName(sheetName);

  if (!sheet) return { success: false, message: 'Sheet ' + sheetName + ' not found.' };

  records.forEach(function(rec) {
    if (rec.rowIdx) {
      var mcq = parseFloat(rec.mcq) || 0;
      var marks2 = parseFloat(rec.marks2) || 0;
      var total = mcq + marks2;
      sheet.getRange(rec.rowIdx, 4, 1, 3).setValues([[mcq, marks2, total]]);
    }
  });

  clearAllServerCache_();
  return { success: true, message: 'PostTest scores saved for ' + targetDep };
}

/***********************
 * MOCK INTERVIEW MODULE (OPTIMIZED)
 ***********************/

function handleGetMockInterviewData(department) {
  var ss = getSpreadsheet();
  var targetDep = department || getFirstDepartment();
  var sheetName = 'MockInterview_' + targetDep;
  var sheet = ss.getSheetByName(sheetName);

  if (!sheet) return { success: false, message: 'Sheet ' + sheetName + ' not found.' };

  var values = sheet.getDataRange().getValues();
  var students = [];
  var hasRemarks = sheet.getLastColumn() >= 6;

  for (var r = 5; r < values.length; r++) {
    var row = values[r];
    if (row[2] && String(row[2]).trim() !== '') {
      students.push({
        rowIdx: r + 1,
        sNo: row[0],
        regNo: row[1],
        name: row[2],
        score: row[3] || 0,
        percentage: row[4] || 0,
        remarks: hasRemarks ? (row[5] || '') : ''
      });
    }
  }

  return { success: true, department: targetDep, students: students, hasRemarks: hasRemarks };
}

/**
 * Unified endpoint for the Mock Interview page: loads evaluation data and count in 1 single roundtrip
 */
function handleGetMockInterviewPageData(department) {
  const mockData = handleGetMockInterviewData(department);
  const countData = handleGetAllStudentsCount(department);
  return Object.assign({}, mockData, { totalStudents: countData.totalStudents || 0 });
}

function handleSaveMockInterviewData(department, records) {
  var ss = getSpreadsheet();
  var targetDep = department || getFirstDepartment();
  var sheetName = 'MockInterview_' + targetDep;
  var sheet = ss.getSheetByName(sheetName);

  if (!sheet) return { success: false, message: 'Sheet ' + sheetName + ' not found.' };

  var hasRemarks = sheet.getLastColumn() >= 6;
  if (!hasRemarks) {
    sheet.getRange(5, 6).setValue('Remarks');
    hasRemarks = true;
  }

  records.forEach(function(rec) {
    if (rec.rowIdx) {
      var score = parseFloat(rec.score) || 0;
      var pct = ((score / 100) * 100).toFixed(1);
      var remarks = rec.remarks || '';
      sheet.getRange(rec.rowIdx, 4, 1, 3).setValues([[score, pct, remarks]]);
    }
  });

  clearAllServerCache_();
  return { success: true, message: 'Mock Interview evaluation saved for ' + targetDep };
}

/***********************
 * PRE-POST COMPARISON
 ***********************/

function handleGetPrePostComparison() {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(GLOBAL_SHEETS.PRE_POST);
  if (!sheet) return { success: false, message: 'Comparison sheet not found.' };

  var values = sheet.getDataRange().getValues();
  var report = [];

  for (var r = 3; r < values.length; r++) {
    var row = values[r];
    if (row[0] && String(row[0]).trim() !== '') {
      report.push({
        department: String(row[0]).trim(),
        preAvg: row[1] || 0,
        postAvg: row[2] || 0,
        improvement: row[3] || 0,
        avgAttendance: row[4] || 0,
        studentsCompared: row[5] || 0
      });
    }
  }

  return { success: true, report: report, trainingDay: handleGetTrainingDayStatus() };
}

/***********************
 * FAST TARGETED STUDENT PROFILE (360° DOSSIER)
 ***********************/

function handleGetStudentProfile(regNo, userRole) {
  if (!regNo) return { success: false, message: 'Register Number is required.' };
  
  const cacheKey = 'student_prof_' + String(regNo).trim() + '_' + (userRole || '');
  const cached = getFromCache_(cacheKey);
  if (cached) return cached;

  var ss = getSpreadsheet();
  var departments = getDSCEDepartments_(ss);
  var regStr = String(regNo).trim();

  const dayStatus = handleGetTrainingDayStatus();
  const isCollegeAdmin = userRole === ROLES.COLLEGE_ADMIN;
  const hidePostTest = isCollegeAdmin && !dayStatus.postTestVisible;

  var profile = null;
  var targetDep = null;
  var attendanceSummary = { present: 0, absent: 0, halfDay: 0, total: 0, percentage: 0 };
  var testScores = [];
  var postTestScore = null;
  var mockScore = null;

  // Step 1: Find student in Attendance sheets
  for (var d = 0; d < departments.length; d++) {
    var dep = departments[d];
    var attSheet = ss.getSheetByName('Attendance_' + dep);
    if (!attSheet) continue;

    var attValues = attSheet.getDataRange().getValues();
    for (var r = 13; r < attValues.length; r++) {
      if (String(attValues[r][1]).trim() === regStr) {
        targetDep = dep;
        profile = {
          name: attValues[r][2],
          regNo: regStr,
          department: attValues[r][3] || dep,
          sNo: attValues[r][0]
        };

        var headerRow = attValues[9] || [];
        var tdCols = [];
        for (var c = 4; c < headerRow.length; c++) {
          var h = String(headerRow[c] || '').trim();
          if (!h || h.toLowerCase() === 'off' || h.toLowerCase().indexOf('attendance') !== -1) continue;
          tdCols.push(c);
        }

        var p = 0, a = 0, hd = 0, tot = 0;
        for (var ti = 0; ti < tdCols.length; ti++) {
          var v = String(attValues[r][tdCols[ti]] || '').trim();
          if (v === 'Present') { p++; tot++; }
          else if (v === 'Absent') { a++; tot++; }
          else if (v === 'Half Day') { hd++; tot++; }
        }
        attendanceSummary = { present: p, absent: a, halfDay: hd, total: tot, percentage: tot ? Math.round((p / tot) * 100) : 0 };
        break;
      }
    }
    if (profile) break;
  }

  if (!profile || !targetDep) {
    return { success: false, message: 'Student record not found for: ' + regNo };
  }

  // Step 2: Directly open ONLY the student's department sheets
  // PreTest
  var preSheet = ss.getSheetByName('PreTest_Report_' + targetDep);
  if (preSheet) {
    var preValues = preSheet.getDataRange().getValues();
    var blocksRes = handleGetTestBlocks(targetDep);
    var blocks = blocksRes.testBlocks || [];

    for (var pr = 5; pr < preValues.length; pr++) {
      if (String(preValues[pr][1]).trim() === regStr) {
        for (var bi = 0; bi < blocks.length; bi++) {
          var blk = blocks[bi];
          var totalColIdx = blk.startCol + 1;
          var pctColIdx = blk.hasPctCol ? blk.startCol + 2 : null;
          var total = Number(preValues[pr][totalColIdx]) || 0;
          var pct = pctColIdx ? Number(preValues[pr][pctColIdx]) || 0 : (total / 100) * 100;
          if (total > 0 || pct > 0 || bi === 0) {
            testScores.push({ testName: blk.label, total: total, percentage: pct });
          }
        }
        break;
      }
    }
  }

  // PostTest (strictly hidden for College Admin until Day 15)
  if (!hidePostTest) {
    var postSheet = ss.getSheetByName('PostTest_Report_' + targetDep);
    if (postSheet) {
      var postValues = postSheet.getDataRange().getValues();
      for (var ptr = 5; ptr < postValues.length; ptr++) {
        if (String(postValues[ptr][1]).trim() === regStr) {
          postTestScore = {
            total: Number(postValues[ptr][5]) || 0,
            percentage: Number(postValues[ptr][6]) || 0
          };
          break;
        }
      }
    }
  }

  // MockInterview
  var mockSheet = ss.getSheetByName('MockInterview_' + targetDep);
  if (mockSheet) {
    var mockValues = mockSheet.getDataRange().getValues();
    for (var mr = 5; mr < mockValues.length; mr++) {
      if (String(mockValues[mr][1]).trim() === regStr) {
        mockScore = {
          score: Number(mockValues[mr][3]) || 0,
          percentage: Number(mockValues[mr][4]) || 0
        };
        break;
      }
    }
  }

  const response = {
    success: true,
    profile: profile,
    attendance: attendanceSummary,
    testScores: testScores,
    postTest: postTestScore,
    mockInterview: mockScore
  };

  putInCache_(cacheKey, response, CONFIG.CACHE_TTL.STUDENT_PROFILE);
  return response;
}

/***********************
 * ALL STUDENTS COUNT (FAST SUMMARY READ)
 ***********************/

function handleGetAllStudentsCount(depFilter) {
  var summaryRows = readDashboardSummary_(depFilter);
  var total = summaryRows.reduce(function(sum, r) { return sum + r.students; }, 0);
  return { success: true, totalStudents: total };
}

/***********************
 * ADD SYLLABUS DEPARTMENT
 ***********************/

function handleAddSyllabusDepartment(departmentName) {
  if (!departmentName) return { success: false, message: 'Department name is required.' };
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(GLOBAL_SHEETS.SYLLABUS);
  if (!sheet) return { success: false, message: 'Syllabus sheet not found.' };

  var values = sheet.getDataRange().getValues();
  var deptRow = values[2] || [];

  var lastCol = 0;
  for (var c = 0; c < deptRow.length; c++) {
    if (deptRow[c] && String(deptRow[c]).trim() !== '') {
      lastCol = c;
    }
  }

  var newStart = lastCol + 5 + 1;

  sheet.getRange(3, newStart).setValue(departmentName.trim());
  sheet.getRange(4, newStart, 1, 4).setValues([['Day', 'Date', 'Topic', 'Trainer Name']]);

  for (var d = 1; d <= CONFIG.TOTAL_DAYS; d++) {
    sheet.getRange(4 + d, newStart).setValue('Day ' + d);
  }

  clearAllServerCache_();
  return { success: true, message: 'Department "' + departmentName + '" added to Syllabus Tracker.' };
}

/***********************
 * TRAINING DAY STATUS (DYNAMICALLY COMPUTED)
 ***********************/

function handleGetTrainingDayStatus() {
  const cacheKey = 'training_day_status';
  const cached = getFromCache_(cacheKey);
  if (cached) return cached;

  var ss = getSpreadsheet();
  var attSummary = getLatestAttendanceSummary_(ss, 'All');
  var completedDays = attSummary.completedDays || 0;
  var currentTrainingDay = attSummary.trainingDay !== undefined ? attSummary.trainingDay : 0;

  // Post-Test is visible ONLY when Day 15 is reached (completedDays >= 14 or current training day is 15 with attendance)
  var postTestVisible = completedDays >= 14 || (currentTrainingDay >= 15 && completedDays >= 1);

  const response = {
    success: true,
    completedDays: completedDays,
    trainingDay: currentTrainingDay,
    totalDays: CONFIG.TOTAL_DAYS,
    isLastDay: currentTrainingDay >= CONFIG.TOTAL_DAYS,
    postTestVisible: postTestVisible
  };

  putInCache_(cacheKey, response, CONFIG.CACHE_TTL.TRAINING_DAYS);
  return response;
}

/***********************
 * ADMIN SHEET MANAGEMENT (LESUCCESS ADMIN ONLY)
 ***********************/

function handleGetAdminSheetConfig() {
  var ss = getSpreadsheet();
  var sheets = ss.getSheets();
  var list = sheets.map(function(s) {
    return {
      name: s.getName(),
      rowCount: s.getLastRow(),
      colCount: s.getLastColumn(),
      isProtected: s.isSheetHidden()
    };
  });

  return { success: true, sheets: list };
}

function handleAddSheet(sheetName, sheetType, department) {
  var ss = getSpreadsheet();

  var targetName = sheetName;
  if (sheetType && department) {
    targetName = sheetType + '_' + department;
  }

  if (ss.getSheetByName(targetName)) {
    return { success: false, message: 'Sheet "' + targetName + '" already exists.' };
  }

  var sheet = ss.insertSheet(targetName);

  if (targetName.indexOf('Attendance_') === 0) {
    var dep = targetName.substring('Attendance_'.length);
    sheet.appendRow([null, null, null, null, 'ATTENDANCE SHEET']);
    sheet.appendRow([]);
    sheet.appendRow(['College Name', CONFIG.INSTITUTION_NAME, '', '', '', '', '', 'Technology / Course', 'Aptitude & Soft Skills']);
    sheet.appendRow(['Room Number', 'Main Hall', '', '', '', '', '', 'Total Training Days', CONFIG.TOTAL_DAYS]);
    sheet.appendRow(['Department', dep, '', '', '', '', '', 'Training Start Date', '']);
    sheet.appendRow(['Section', '', '', '', '', '', '', 'Training End Date', '', '', '', '', 'Total Strength', 0]);
    sheet.appendRow([]);
    sheet.appendRow(['No.of Present']);
    sheet.appendRow(['No.of Absent']);
    var headerRow = ['S.No', 'Register Number', 'Student Name', 'Department'];
    for (var d = 1; d <= CONFIG.TOTAL_DAYS; d++) {
      headerRow.push('Day ' + d);
    }
    headerRow.push('Attendance %');
    sheet.appendRow(headerRow);
  } else if (targetName.indexOf('PreTest_Report_') === 0 || targetName.indexOf('PostTest_Report_') === 0) {
    var testLabel = targetName.indexOf('PreTest') !== -1 ? 'Pre Test 1' : 'Post Test 1';
    sheet.appendRow(['Room Number', '', '', testLabel, '', 'Total number of students', 0]);
    sheet.appendRow(['Department', department || '']);
    sheet.appendRow(['Section', '']);
    sheet.appendRow([]);
    if (targetName.indexOf('PreTest') !== -1) {
      sheet.appendRow(['S.No', 'Reg. No', 'Student Name', '2 Marks', 'MCQ', 'Total', 'Percentage']);
    } else {
      sheet.appendRow(['S.No', 'Reg. No', 'Student Name', 'MCQ', '2 Marks', 'Total', 'Percentage']);
    }
  } else if (targetName.indexOf('MockInterview_') === 0) {
    sheet.appendRow(['Room Number', '', '', 'Total number of students', 0]);
    sheet.appendRow(['Department', department || '', '', 'Total Mark', '']);
    sheet.appendRow(['Section', '', '', 'Average', 0]);
    sheet.appendRow([]);
    sheet.appendRow(['S.No', 'Reg. No', 'Student Name', 'Score', 'Percentage', 'Remarks']);
  } else {
    sheet.appendRow(['Column 1', 'Column 2', 'Column 3', 'Column 4']);
  }

  clearAllServerCache_();
  return { success: true, message: 'Sheet "' + targetName + '" created successfully.' };
}

function handleRemoveSheet(sheetName) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    return { success: false, message: 'Sheet "' + sheetName + '" not found.' };
  }

  if (sheetName === GLOBAL_SHEETS.USERS || sheetName === GLOBAL_SHEETS.DASHBOARD || sheetName === GLOBAL_SHEETS.DASHBOARD_SUMMARY) {
    return { success: false, message: 'Cannot delete critical system sheet "' + sheetName + '".' };
  }

  ss.deleteSheet(sheet);
  clearAllServerCache_();
  return { success: true, message: 'Sheet "' + sheetName + '" removed successfully.' };
}

/***********************
 * UTILITY HELPERS
 ***********************/

function getFirstDepartment() {
  var result = handleGetDepartmentList();
  if (result.departments && result.departments.length > 0) {
    return result.departments[0];
  }
  return 'Agri';
}
