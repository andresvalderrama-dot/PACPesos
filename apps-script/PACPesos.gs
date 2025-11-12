/**
 * PAC Pesos - Helpers y endpoints (preparado para pegar en Google Apps Script)
 *
 * CONFIGURA:
 *  - SPREADSHEET_ID: ya rellenado con el ID que proporcionaste
 *  - QR_FOLDER_ID: ya rellenado con el ID de carpeta que proporcionaste
 *  - ADMIN_KEY: reemplaza 'SET_YOUR_ADMIN_KEY_HERE' por un secreto y, si no quieres subirlo al repo, pégalo directamente en el editor de Apps Script.
 *
 * NOTA: No ejecuto nada en tu cuenta. Debes desplegar el WebApp desde tu editor de Apps Script.
 */

const SPREADSHEET_ID = '1GHGj3oIRL3j9jy8hVnun2BpWxEvAxbfLVZFgmTL376c'; // tu spreadsheet
const QR_FOLDER_ID = '15CvEqA2pMT2hKssiYjxmmufetCS1DdfE'; // tu carpeta Drive
const ADMIN_KEY = 'SET_YOUR_ADMIN_KEY_HERE'; // reemplaza en Apps Script (no subir el secreto al repo)
const QR_SIZE = 350;

/* UTILIDADES */
function getSheetByName(name) {
  return SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(name);
}
function nowIso() { return new Date().toISOString(); }
function generarTokenAleatorio(longitud) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let t = '';
  for (let i = 0; i < longitud; i++) t += chars.charAt(Math.floor(Math.random() * chars.length));
  return t;
}

/* Asegurar columnas en Usuarios */
function ensureUsuariosColumns() {
  const hoja = getSheetByName('Usuarios');
  const lastCol = Math.max(hoja.getLastColumn(), 1);
  const header = hoja.getRange(1, 1, 1, lastCol).getValues()[0].map(h => (h || '').toString().trim().toLowerCase());
  const cols = {};
  header.forEach((h, i) => cols[h] = i + 1);
  const wanted = ['token', 'token_created', 'token_expiry', 'qr_url'];
  let nextCol = header.length + 1;
  wanted.forEach(w => {
    if (!cols[w]) {
      hoja.getRange(1, nextCol).setValue(w);
      cols[w] = nextCol;
      nextCol++;
    }
  });
  return cols;
}

/* Generar tokens para usuarios que no tengan */
function generarTokensParaUsuarios() {
  const hoja = getSheetByName('Usuarios');
  const data = hoja.getDataRange().getValues();
  if (data.length < 2) return { success: false, message: 'No hay usuarios.' };
  const header = data[0].map(h => (h || '').toString().toLowerCase());
  const idxNombre = header.indexOf('nombre');
  if (idxNombre === -1) return { success: false, message: 'Columna "nombre" no encontrada' };
  const cols = ensureUsuariosColumns();
  const idxToken = cols['token'];
  const created = [];
  for (let r = 2; r <= data.length; r++) {
    const fila = hoja.getRange(r, 1, 1, hoja.getLastColumn()).getValues()[0];
    const actualToken = fila[idxToken - 1];
    if (!actualToken) {
      const token = generarTokenAleatorio(28);
      hoja.getRange(r, idxToken).setValue(token);
      // token_created: si la columna fue añadida después, ubicar índice de token_created
      const tokenCreatedCol = Object.keys(cols).indexOf('token_created') !== -1 ? cols['token_created'] : (idxToken + 1);
      hoja.getRange(r, tokenCreatedCol).setValue(nowIso());
      created.push({ row: r, token: token });
    }
  }
  return { success: true, created_count: created.length, details: created };
}

/* Generar QR y subir a Drive */
function generarQRyGuardar(token, nombre) {
  if (!token) throw new Error('Token requerido');
  const urlDestino = 'https://andresvalderrama-dot.github.io/PACPesos/panel.html?token=' + encodeURIComponent(token);
  const qrApi = 'https://chart.googleapis.com/chart?chs=' + QR_SIZE + 'x' + QR_SIZE + '&cht=qr&chl=' + encodeURIComponent(urlDestino);
  const respuesta = UrlFetchApp.fetch(qrApi);
  const blob = respuesta.getBlob().setName((nombre || 'user') + '_qr.png');
  const folder = DriveApp.getFolderById(QR_FOLDER_ID);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getUrl();
}

/* Generar QRs para todos (si token existe y no existe qr_url) */
function generarQRsParaTodos() {
  const hoja = getSheetByName('Usuarios');
  const data = hoja.getDataRange().getValues();
  if (data.length < 2) return { success: false, message: 'No hay usuarios.' };
  const header = data[0].map(h => (h || '').toString().toLowerCase());
  const idxNombre = header.indexOf('nombre');
  if (idxNombre === -1) return { success: false, message: 'Columna "nombre" no encontrada.' };
  const cols = ensureUsuariosColumns();
  const idxToken = cols['token'] - 1;
  const idxQr = cols['qr_url'] - 1;
  const results = [];
  for (let r = 1; r < data.length; r++) {
    const nombre = data[r][idxNombre];
    const token = data[r][idxToken];
    const existingQr = data[r][idxQr];
    if (token && !existingQr) {
      try {
        const url = generarQRyGuardar(token, nombre);
        hoja.getRange(r + 1, idxQr + 1).setValue(url);
        results.push({ row: r + 1, nombre: nombre, qr: url });
      } catch (err) {
        results.push({ row: r + 1, nombre: nombre, error: err.message });
      }
    }
  }
  return { success: true, processed: results.length, details: results };
}

/* DoPost endpoints */
function doPost(e) {
  try {
    const body = e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};
    const accion = (body.accion || '').toString();
    switch (accion) {
      case 'login_con_token':
        return loginConTokenResponse(body.token);
      case 'generar_tokens_batch':
        if (!isAdminKey(body.adminKey)) return textOutputError('ADMIN_REQUIRED');
        return jsonOutput(generarTokensParaUsuarios());
      case 'generar_qrs_batch':
        if (!isAdminKey(body.adminKey)) return textOutputError('ADMIN_REQUIRED');
        return jsonOutput(generarQRsParaTodos());
      case 'resumen_por_curso':
        return jsonOutput(resumenPorCurso());
      case 'entrega_masiva':
        if (!isAdminKey(body.adminKey)) return textOutputError('ADMIN_REQUIRED');
        return jsonOutput(entregaMasiva(body));
      default:
        return textOutputError('ACTION_UNKNOWN');
    }
  } catch (err) {
    return textOutputError('ERROR:' + err.message);
  }
}

/* Helpers de salida */
function jsonOutput(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
function textOutputError(msg) { return ContentService.createTextOutput('ERROR:' + msg); }
function isAdminKey(key) { return key && ADMIN_KEY && key === ADMIN_KEY; }

/* login por token (valida estado) */
function loginConTokenResponse(token) {
  if (!token) return textOutputError('MISSING_TOKEN');
  const hoja = getSheetByName('Usuarios');
  const data = hoja.getDataRange().getValues();
  if (data.length < 2) return textOutputError('NO_USERS');
  const header = data[0].map(h => (h || '').toString().toLowerCase());
  const idxToken = header.indexOf('token');
  const idxEstado = header.indexOf('estado');
  const idxNombre = header.indexOf('nombre');
  const idxCurso = header.indexOf('curso');
  const idxRol = header.indexOf('rol');
  for (let r = 1; r < data.length; r++) {
    const rowToken = (data[r][idxToken] || '').toString();
    if (rowToken && rowToken === token) {
      const estado = (data[r][idxEstado] || '').toString().toLowerCase();
      if (estado === 'inactivo' || estado === 'bloqueado') return textOutputError('USER_INACTIVE');
      const user = {
        nombre: data[r][idxNombre],
        curso: data[r][idxCurso],
        rol: data[r][idxRol],
        estado: estado || 'activo'
      };
      return jsonOutput(user);
    }
  }
  return textOutputError('INVALID_TOKEN');
}

/* Resumen por curso (lee hoja Saldos) */
function resumenPorCurso() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const hojaSaldos = ss.getSheetByName('Saldos');
  if (!hojaSaldos) return { success: false, message: 'Hoja Saldos no encontrada' };
  const data = hojaSaldos.getDataRange().getValues();
  if (data.length < 2) return { success: true, summary: [] };
  const header = data[0].map(h => (h || '').toString().toLowerCase());
  const idxCurso = header.indexOf('curso');
  const idxSaldo = header.indexOf('saldo') !== -1 ? header.indexOf('saldo') : header.indexOf('saldo actual');
  const map = {};
  for (let r = 1; r < data.length; r++) {
    const curso = (data[r][idxCurso] || '').toString() || 'Sin curso';
    const saldo = Number(data[r][idxSaldo] || 0);
    map[curso] = (map[curso] || 0) + saldo;
  }
  const summary = Object.keys(map).map(c => ({ curso: c, saldo_total: map[c] }));
  return { success: true, summary: summary };
}

/* Entrega masiva */
function entregaMasiva(body) {
  if (!body || !body.curso) return { success: false, message: 'Faltan parámetros' };
  const curso = body.curso;
  const cantidad = Number(body.cantidad || 0);
  if (cantidad <= 0) return { success: false, message: 'Cantidad inválida' };
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const hojaSaldos = ss.getSheetByName('Saldos');
  const hojaTrans = ss.getSheetByName('Transacciones');
  const saldosData = hojaSaldos.getDataRange().getValues();
  const saldosHeader = saldosData[0].map(h => (h || '').toString().toLowerCase());
  const idxNombre = saldosHeader.indexOf('estudiante');
  const idxCurso = saldosHeader.indexOf('curso');
  const idxSaldo = saldosHeader.indexOf('saldo') !== -1 ? saldosHeader.indexOf('saldo') : saldosHeader.indexOf('saldo actual');
  const updated = [];
  for (let r = 1; r < saldosData.length; r++) {
    const rowCurso = (saldosData[r][idxCurso] || '').toString();
    if (rowCurso === curso) {
      const current = Number(saldosData[r][idxSaldo] || 0);
      const nuevo = current + cantidad;
      hojaSaldos.getRange(r + 1, idxSaldo + 1).setValue(nuevo);
      if (hojaTrans) {
        const fecha = new Date();
        hojaTrans.appendRow([fecha, saldosData[r][idxNombre], curso, 'Entrega masiva', cantidad, nuevo, body.motivo || 'Entrega masiva', body.registradoPor || 'Admin']);
      }
      updated.push({ estudiante: saldosData[r][idxNombre], before: current, after: nuevo });
    }
  }
  return { success: true, updated_count: updated.length, details: updated };
}

/* Validar nombre duplicado (útil al crear usuarios) */
function nombreDuplicado(nombre) {
  const hoja = getSheetByName('Usuarios');
  const data = hoja.getDataRange().getValues();
  if (data.length < 2) return false;
  const header = data[0].map(h => (h || '').toString().toLowerCase());
  const idxNombre = header.indexOf('nombre');
  for (let r = 1; r < data.length; r++) {
    if ((data[r][idxNombre] || '').toString().trim().toLowerCase() === nombre.trim().toLowerCase()) return true;
  }
  return false;
}

/* Menú en la hoja */
function onOpen(e) {
  SpreadsheetApp.getUi()
    .createMenu('PAC Pesos')
    .addItem('Generar tokens para usuarios', 'menuGenerarTokens')
    .addItem('Generar QRs y guardarlos en Drive', 'menuGenerarQRs')
    .addToUi();
}
function menuGenerarTokens() { const res = generarTokensParaUsuarios(); SpreadsheetApp.getUi().alert('Resultado: ' + JSON.stringify(res)); }
function menuGenerarQRs() { const res = generarQRsParaTodos(); SpreadsheetApp.getUi().alert('Resultado: ' + JSON.stringify(res)); }