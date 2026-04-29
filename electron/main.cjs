const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { pathToFileURL } = require('url');

let mainWindow;
const isDev = !app.isPackaged;

// ── File-based store (survives Electron/Vite restarts) ─────────────
function storePath() {
  return path.join(app.getPath('userData'), 'localreader-store.json');
}
function readStore() {
  try { return JSON.parse(fs.readFileSync(storePath(), 'utf-8')); } catch { return {}; }
}
function writeStore(data) {
  try { fs.writeFileSync(storePath(), JSON.stringify(data, null, 2), 'utf-8'); } catch (_) {}
}

app.whenReady().then(async () => {
  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function canReachDevServer(url) {
  return new Promise((resolve) => {
    const request = http.get(url, (response) => {
      response.resume();
      resolve(true);
    });

    request.on('error', () => resolve(false));
    request.setTimeout(1500, () => {
      request.destroy();
      resolve(false);
    });
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 900,
    minHeight: 600,
    // Frameless window — React draws the title bar with traffic lights
    frame: false,
    transparent: false,
    backgroundColor: '#EDEAE2',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const devServerUrl = 'http://127.0.0.1:5173';
  const distIndexPath = path.join(__dirname, '../dist/index.html');

  if (isDev && await canReachDevServer(devServerUrl)) {
    await mainWindow.loadURL(devServerUrl);
  } else {
    await mainWindow.loadFile(distIndexPath);
  }
}

// ── Window controls ────────────────────────────────────────────────
ipcMain.handle('window:close', () => mainWindow?.close());
ipcMain.handle('window:minimize', () => mainWindow?.minimize());
ipcMain.handle('window:maximize', () => {
  if (!mainWindow) return;

  if (process.platform === 'darwin') {
    mainWindow.setFullScreen(!mainWindow.isFullScreen());
    return;
  }

  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});

// ── Folder picking ─────────────────────────────────────────────────
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Books Folder',
  });
  return result.canceled ? null : result.filePaths[0];
});

// ── Directory scan ─────────────────────────────────────────────────
ipcMain.handle('scan-folder', async (_event, folderPath) => {
  try {
    const entries = fs.readdirSync(folderPath);
    const books = [];
    for (const entry of entries) {
      if (!/\.(epub|pdf)$/i.test(entry)) continue;
      const filePath = path.join(folderPath, entry);
      const format = path.extname(entry).slice(1).toUpperCase();
      let title = path.basename(entry, path.extname(entry));
      let author = 'Unknown';
      let coverImage = null;

      if (format === 'EPUB') {
        try {
          const meta = extractEpubMeta(filePath);
          if (meta.title) title = meta.title;
          if (meta.author) author = meta.author;
          if (meta.coverImage) coverImage = meta.coverImage;
        } catch (_) {}
      }

      books.push({ name: entry, filePath, format, title, author, coverImage });
    }
    return books;
  } catch (_) {
    return [];
  }
});

// ── Full-text search ───────────────────────────────────────────────
ipcMain.handle('search-books', async (_event, books, query) => {
  const q = String(query || '').trim();
  if (q.length < 2 || !Array.isArray(books)) return [];

  const results = [];
  for (const book of books) {
    if (!book?.filePath || !fs.existsSync(book.filePath)) continue;
    try {
      const matches = book.format === 'PDF'
        ? await searchPdfBook(book, q)
        : searchEpubBook(book, q);
      results.push(...matches);
    } catch (err) {
      results.push({
        id: `${book.id || book.filePath}-error`,
        bookId: book.id,
        bookTitle: book.title,
        bookAuthor: book.author,
        format: book.format,
        error: err.message || 'Could not search this book.',
      });
    }
  }
  return results;
});

// ── App store (file-based, survives renderer session resets) ──────
ipcMain.handle('store-get', () => readStore());
ipcMain.handle('store-set', (_event, data) => { writeStore(data); return true; });

// ── Write file (for notes export) ────────────────────────────────
ipcMain.handle('write-file', async (_event, filePath, content) => {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf-8');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ── File buffer (for epubjs / pdfjs in renderer) ──────────────────
ipcMain.handle('get-file-buffer', async (_event, filePath) => {
  const buffer = fs.readFileSync(filePath);
  // Return as plain Uint8Array — Electron IPC serialises it cleanly
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
});

// ── EPUB metadata ──────────────────────────────────────────────────
function extractEpubMeta(filePath) {
  const AdmZip = require('adm-zip');
  const zip = new AdmZip(filePath);

  const containerXml = zip.readAsText('META-INF/container.xml');
  const opfPathMatch = containerXml.match(/full-path="([^"]+)"/);
  if (!opfPathMatch) return {};

  const opfPath = opfPathMatch[1];
  const opfDir = path.dirname(opfPath).replace(/^\./, '');
  const prefix = opfDir ? opfDir + '/' : '';
  const opf = zip.readAsText(opfPath);

  const title = (opf.match(/<dc:title[^>]*>([^<]+)<\/dc:title>/i) || [])[1]?.trim();
  const author = (opf.match(/<dc:creator[^>]*>([^<]+)<\/dc:creator>/i) || [])[1]?.trim();

  // Find cover image href
  let coverHref = null;
  const propMatch = opf.match(/<item[^>]+properties="[^"]*cover-image[^"]*"[^>]+href="([^"]+)"/i)
    || opf.match(/href="([^"]+)"[^>]+properties="[^"]*cover-image[^"]*"/i);
  if (propMatch) {
    coverHref = propMatch[1];
  } else {
    const metaMatch = opf.match(/<meta[^>]+name="cover"[^>]+content="([^"]+)"/i);
    if (metaMatch) {
      const id = metaMatch[1];
      const idMatch = opf.match(new RegExp(`id="${id}"[^>]+href="([^"]+)"`, 'i'))
        || opf.match(new RegExp(`href="([^"]+)"[^>]+id="${id}"`, 'i'));
      if (idMatch) coverHref = idMatch[1];
    }
  }

  let coverImage = null;
  if (coverHref) {
    try {
      const coverPath = prefix + coverHref;
      const buf = zip.readFile(coverPath);
      if (buf) {
        const ext = path.extname(coverHref).toLowerCase();
        const mime = ext === '.png' ? 'image/png' : ext === '.gif' ? 'image/gif' : 'image/jpeg';
        coverImage = `data:${mime};base64,${buf.toString('base64')}`;
      }
    } catch (_) {}
  }

  return { title, author, coverImage };
}

function decodeXmlEntities(text) {
  return String(text || '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function stripHtmlToText(html) {
  return decodeXmlEntities(String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim());
}

function resolveZipPath(baseDir, href) {
  return path.posix.normalize(path.posix.join(baseDir, decodeURIComponent(href || '').split('#')[0]));
}

function getOpfInfo(zip) {
  const containerXml = zip.readAsText('META-INF/container.xml');
  const opfPathMatch = containerXml.match(/full-path="([^"]+)"/);
  if (!opfPathMatch) return null;

  const opfPath = opfPathMatch[1];
  const opfDir = path.posix.dirname(opfPath).replace(/^\.$/, '');
  const opf = zip.readAsText(opfPath);
  return { opf, opfDir };
}

function extractManifest(opf, opfDir) {
  const manifest = new Map();
  const itemRe = /<item\b[^>]*>/gi;
  let match;
  while ((match = itemRe.exec(opf))) {
    const tag = match[0];
    const id = (tag.match(/\bid=["']([^"']+)["']/i) || [])[1];
    const href = (tag.match(/\bhref=["']([^"']+)["']/i) || [])[1];
    const mediaType = (tag.match(/\bmedia-type=["']([^"']+)["']/i) || [])[1] || '';
    if (!id || !href) continue;
    manifest.set(id, {
      href,
      zipPath: resolveZipPath(opfDir, href),
      mediaType,
    });
  }
  return manifest;
}

function extractSpine(opf, manifest) {
  const spine = [];
  const itemrefRe = /<itemref\b[^>]*\bidref=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = itemrefRe.exec(opf))) {
    const item = manifest.get(match[1]);
    if (item) spine.push(item);
  }
  return spine;
}

function makeSnippets(text, query, book, target, label) {
  const haystack = String(text || '');
  const lower = haystack.toLowerCase();
  const needle = query.toLowerCase();
  const matches = [];
  let index = lower.indexOf(needle);

  while (index !== -1) {
    const start = Math.max(0, index - 70);
    const end = Math.min(haystack.length, index + query.length + 90);
    const prefix = start > 0 ? '…' : '';
    const suffix = end < haystack.length ? '…' : '';
    matches.push({
      id: `${book.id || book.filePath}-${target.href || target.pageNum}-${index}`,
      bookId: book.id,
      bookTitle: book.title,
      bookAuthor: book.author,
      format: book.format,
      label,
      snippet: prefix + haystack.slice(start, end).trim() + suffix,
      href: target.href || null,
      pageNum: target.pageNum || null,
    });
    index = lower.indexOf(needle, index + needle.length);
  }

  return matches;
}

function searchEpubBook(book, query) {
  const AdmZip = require('adm-zip');
  const zip = new AdmZip(book.filePath);
  const opfInfo = getOpfInfo(zip);
  if (!opfInfo) return [];

  const manifest = extractManifest(opfInfo.opf, opfInfo.opfDir);
  const spine = extractSpine(opfInfo.opf, manifest);
  const results = [];

  for (const item of spine) {
    if (!/x?html|xml/i.test(item.mediaType)) continue;
    const html = zip.readAsText(item.zipPath);
    const text = stripHtmlToText(html);
    if (!text) continue;
    const href = item.href;
    const label = path.basename(href, path.extname(href)) || 'Chapter';
    results.push(...makeSnippets(text, query, book, { href }, label));
  }

  return results;
}

async function searchPdfBook(book, query) {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(fs.readFileSync(book.filePath));
  const loadingTask = pdfjsLib.getDocument({ data, disableWorker: true });
  const pdf = await loadingTask.promise;
  const results = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const text = content.items.map((item) => item.str || '').join(' ').replace(/\s+/g, ' ').trim();
    results.push(...makeSnippets(text, query, book, { pageNum }, `Page ${pageNum}`));
  }

  await pdf.destroy();
  return results;
}
