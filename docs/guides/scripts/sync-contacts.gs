// ===== 설정 =====
var FOLDER_ID = '1bb7ZabqQnC1XdC76hVAmD2fPFKX4AGUR';

function syncContacts() {
  var folder = DriveApp.getFolderById(FOLDER_ID);

  var files = [];
  var csvFiles = folder.getFilesByType(MimeType.CSV);
  while (csvFiles.hasNext()) {
    files.push({ file: csvFiles.next(), type: 'csv' });
  }

  var sheetFiles = folder.getFilesByType(MimeType.GOOGLE_SHEETS);
  while (sheetFiles.hasNext()) {
    var sheetFile = sheetFiles.next();
    // Apps Script가 바인딩된 Sheets는 스킵
    if (isAppsScriptFile(sheetFile)) continue;
    files.push({ file: sheetFile, type: 'sheets' });
  }

  var xlsxFiles = folder.getFilesByType(MimeType.MICROSOFT_EXCEL);
  while (xlsxFiles.hasNext()) {
    files.push({ file: xlsxFiles.next(), type: 'excel' });
  }

  if (files.length === 0) {
    Logger.log('처리할 파일 없음');
    return;
  }

  Logger.log('발견된 파일: ' + files.length + '건');

  var existingPhones = getExistingPhones();
  Logger.log('기존 연락처: ' + existingPhones.size + '건');

  var totalCreated = 0;
  var totalSkipped = 0;

  for (var f = 0; f < files.length; f++) {
    var item = files[f];
    Logger.log('파일 처리: ' + item.file.getName() + ' (' + item.type + ')');

    var contacts = (item.type === 'sheets')
      ? parseSheets(item.file)
      : parseCsv(item.file);

    var result = registerContacts(contacts, existingPhones);
    totalCreated += result.created;
    totalSkipped += result.skipped;

    // 처리 완료 → 파일 삭제 (휴지통)
    item.file.setTrashed(true);
    Logger.log('삭제: ' + item.file.getName());
  }

  Logger.log('완료 - 등록: ' + totalCreated + '건, 중복 스킵: ' + totalSkipped + '건');
}

/**
 * Apps Script가 바인딩된 파일인지 확인
 */
function isAppsScriptFile(file) {
  try {
    var id = file.getId();
    var driveFile = Drive.Files.get(id, { fields: 'mimeType' });
    if (driveFile.mimeType === 'application/vnd.google-apps.script') return true;
  } catch (e) {}

  // 이름에 '동기화', 'sync', 'script' 포함 시 안전하게 스킵
  var name = file.getName().toLowerCase();
  if (name.indexOf('동기화') >= 0 || name.indexOf('sync') >= 0 || name.indexOf('script') >= 0) {
    Logger.log('스킵 (스크립트 파일): ' + file.getName());
    return true;
  }

  return false;
}

function parseCsv(file) {
  var content = file.getBlob().getDataAsString('UTF-8');
  var lines = content.split('\n');

  var contacts = [];
  for (var i = 1; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;

    var cols = line.split(',');
    if (cols.length < 2) continue;

    var name = cols[0].trim();
    var phone = normalizePhoneFormat(cols[1].trim());

    if (name && phone) {
      contacts.push({ name: name, phone: phone });
    }
  }

  Logger.log('파싱: ' + contacts.length + '건');
  return contacts;
}

function parseSheets(file) {
  var spreadsheet = SpreadsheetApp.open(file);
  var sheet = spreadsheet.getSheets()[0];
  var data = sheet.getDataRange().getValues();

  var contacts = [];
  for (var i = 1; i < data.length; i++) {
    var name = String(data[i][0]).trim();
    var phone = normalizePhoneFormat(String(data[i][1]).trim());

    if (name && phone) {
      contacts.push({ name: name, phone: phone });
    }
  }

  Logger.log('파싱 (Sheets): ' + contacts.length + '건');
  return contacts;
}

function normalizePhoneFormat(phone) {
  if (phone.indexOf('-') >= 0) return phone;

  var digits = phone.replace(/\D/g, '');

  if (digits.length === 10 && digits.charAt(0) !== '0') {
    var full = '0' + digits;
    return full.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
  }

  if (digits.length === 11 && digits.substring(0, 3) === '010') {
    return digits.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
  }

  return phone;
}

function getExistingPhones() {
  var phones = new Set();
  var pageToken = '';

  do {
    var options = { personFields: 'phoneNumbers', pageSize: 1000 };
    if (pageToken) options.pageToken = pageToken;

    var response = People.People.Connections.list('people/me', options);
    var connections = response.connections || [];

    for (var i = 0; i < connections.length; i++) {
      var numbers = connections[i].phoneNumbers || [];
      for (var j = 0; j < numbers.length; j++) {
        phones.add(normalizePhone(numbers[j].value));
      }
    }

    pageToken = response.nextPageToken || '';
  } while (pageToken);

  return phones;
}

function normalizePhone(phone) {
  return phone.replace(/[-\s]/g, '');
}

function registerContacts(contacts, existingPhones) {
  var created = 0;
  var skipped = 0;

  for (var i = 0; i < contacts.length; i++) {
    var contact = contacts[i];
    var normalized = normalizePhone(contact.phone);

    if (existingPhones.has(normalized)) {
      Logger.log('스킵 (중복): ' + contact.name + ' ' + contact.phone);
      skipped++;
      continue;
    }

    try {
      People.People.createContact({
        names: [{ displayName: contact.name }],
        phoneNumbers: [{ value: contact.phone }]
      });

      existingPhones.add(normalized);
      created++;
      Logger.log('등록: ' + contact.name + ' ' + contact.phone);
    } catch (e) {
      Logger.log('에러: ' + contact.name + ' - ' + e.message);
    }
  }

  return { created: created, skipped: skipped };
}
