const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const { pathToFileURL } = require('url');

let mainWindow;
const isDev = !app.isPackaged;
const APP_DISPLAY_NAME = 'Flux Reader';

app.setName(APP_DISPLAY_NAME);
try {
  app.setPath('userData', path.join(app.getPath('appData'), 'localreader'));
} catch (_) {}

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
function embeddingCachePath() {
  return path.join(app.getPath('userData'), 'localreader-embedding-cache.json');
}
function readEmbeddingCache() {
  try { return JSON.parse(fs.readFileSync(embeddingCachePath(), 'utf-8')); } catch { return { version: 1, items: {} }; }
}
function writeEmbeddingCache(cache) {
  try { fs.writeFileSync(embeddingCachePath(), JSON.stringify(cache), 'utf-8'); } catch (_) {}
}
function aiIndexPath() {
  return path.join(app.getPath('userData'), 'localreader-ai-index.json');
}
function readAIIndex() {
  try { return JSON.parse(fs.readFileSync(aiIndexPath(), 'utf-8')); } catch { return { version: 1, embeddingModel: '', chunks: [] }; }
}
function writeAIIndex(index) {
  try { fs.writeFileSync(aiIndexPath(), JSON.stringify(index), 'utf-8'); } catch (_) {}
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

ipcMain.handle('ai-chat', async (_event, payload) => {
  const store = readStore();
  const tweaks = store['app:tweaks'] || {};
  const apiKey = String(tweaks.aiApiKey || '').trim();
  const model = String(tweaks.aiModel || 'gpt-5.1-mini').trim();
  const embeddingModel = String(tweaks.aiEmbeddingModel || 'text-embedding-3-small').trim();
  const baseUrl = String(tweaks.aiBaseUrl || 'https://api.openai.com/v1').trim().replace(/\/+$/, '');

  if (!apiKey) {
    return { ok: false, error: 'Add an API key in Settings > AI API first.' };
  }
  if (!model) {
    return { ok: false, error: 'Choose a model in Settings > AI API first.' };
  }

  const messages = Array.isArray(payload?.messages) ? payload.messages : [];
  const lastUserMessage = [...messages].reverse().find((message) => message?.role === 'user');
  const question = String(lastUserMessage?.content || '').trim();
  if (!question) {
    return { ok: false, error: 'Ask a question first.' };
  }

  const books = Array.isArray(payload?.books) ? payload.books : [];
  const context = await buildChatContext(books, question, { baseUrl, apiKey, embeddingModel });
  const selectedTextContext = normalizeSelectedTextContext(payload?.selectedTextContext);
  const requestMessages = [
    {
      role: 'system',
      content: [
        'You are Flux Reader AI, a careful reading assistant inside a local EPUB/PDF library app.',
        'Answer in the same language as the user.',
        'If Selected text context is supplied, prioritize it over broader library context.',
        'Use the supplied library context when it is relevant.',
        'Treat the Library inventory list as the complete list of visible books for this chat request.',
        'When Relevant text matches are supplied, treat them as retrieved passages from the library search.',
        'If Full-library retrieved passages are supplied, answer from those passages first and do not claim the app cannot search the books.',
        'If the context is not enough, say so plainly and answer from general knowledge only if that is useful.',
        'When referring to library material, name the book title.',
      ].join(' '),
    },
    ...(selectedTextContext ? [{
      role: 'system',
      content: `Selected text context:\n${selectedTextContext}`,
    }] : []),
    {
      role: 'system',
      content: `Library context:\n${context || 'No matching book context was found for this question.'}`,
    },
    ...messages
      .filter((message) => ['user', 'assistant'].includes(message?.role))
      .slice(-10)
      .map((message) => ({
        role: message.role,
        content: String(message.content || '').slice(0, 6000),
      })),
  ];

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: requestMessages,
        temperature: 0.2,
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = data?.error?.message || `AI request failed with status ${response.status}.`;
      return { ok: false, error: message };
    }

    const content = data?.choices?.[0]?.message?.content?.trim();
    if (!content) {
      return { ok: false, error: 'The model returned an empty response.' };
    }

    return { ok: true, message: content };
  } catch (err) {
    return { ok: false, error: err.message || 'Could not reach the AI service.' };
  }
});

function normalizeSelectedTextContext(input) {
  const text = String(input?.text || '').replace(/\s+/g, ' ').trim();
  if (text.length < 2) return '';
  const title = String(input?.bookTitle || '').trim();
  const author = String(input?.bookAuthor || '').trim();
  const label = String(input?.label || input?.chapter || '').trim();
  const format = String(input?.format || '').trim();
  const locationParts = [
    label && `Location: ${label}`,
    input?.pageNum ? `Page: ${input.pageNum}` : '',
    input?.cfi ? `CFI: ${String(input.cfi).slice(0, 180)}` : '',
  ].filter(Boolean);
  return [
    title ? `Book: ${title}${author ? ` — ${author}` : ''}` : '',
    format ? `Format: ${format}` : '',
    ...locationParts,
    '',
    'Text:',
    text.slice(0, 5000),
  ].filter((line) => line !== '').join('\n');
}

ipcMain.handle('ai-explain-search', async (_event, payload) => {
  const store = readStore();
  const tweaks = store['app:tweaks'] || {};
  const apiKey = String(tweaks.aiApiKey || '').trim();
  const model = String(tweaks.aiModel || 'gpt-5.1-mini').trim();
  const baseUrl = String(tweaks.aiBaseUrl || 'https://api.openai.com/v1').trim().replace(/\/+$/, '');
  const query = String(payload?.query || '').trim();
  const results = Array.isArray(payload?.results) ? payload.results : [];

  if (!apiKey) {
    return { ok: false, error: 'Add an API key in Settings > AI API first.' };
  }
  if (!model) {
    return { ok: false, error: 'Choose a model in Settings > AI API first.' };
  }
  if (query.length < 2) {
    return { ok: false, error: 'Search for a word first.' };
  }

  const usableResults = sampleSearchResultsByBook(
    results.filter((item) => !item?.error && item?.snippet)
  );
  if (usableResults.length === 0) {
    return { ok: false, error: 'No excerpts are available to explain yet.' };
  }

  const excerptContext = buildSearchExplanationContext(query, usableResults);
  const messages = [
    {
      role: 'system',
      content: [
        'You are Flux Reader AI, explaining search results from a personal reading library.',
        'Answer in the same language as the user interface context.',
        'Use only the supplied excerpts for claims about books.',
        'Compare how the searched term is used across different books.',
        'Return concise Markdown with headings and bullet lists.',
      ].join(' '),
    },
    {
      role: 'user',
      content: [
        `Search term: ${query}`,
        '',
        'Task:',
        '1. Summarize the common meaning across the excerpts.',
        '2. Compare different meanings or emotional tones by book.',
        '3. Mention when a book uses the word literally, psychologically, philosophically, practically, or metaphorically.',
        '4. Avoid inventing book content that is not visible in the excerpts.',
        '',
        excerptContext,
      ].join('\n'),
    },
  ];

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.2,
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = data?.error?.message || `AI request failed with status ${response.status}.`;
      return { ok: false, error: message };
    }

    const content = data?.choices?.[0]?.message?.content?.trim();
    if (!content) {
      return { ok: false, error: 'The model returned an empty response.' };
    }

    return { ok: true, explanation: content };
  } catch (err) {
    return { ok: false, error: err.message || 'Could not reach the AI service.' };
  }
});

ipcMain.handle('ai-semantic-search-map', async (_event, payload) => {
  const store = readStore();
  const tweaks = store['app:tweaks'] || {};
  const apiKey = String(tweaks.aiApiKey || '').trim();
  const chatModel = String(tweaks.aiModel || 'gpt-5.1-mini').trim();
  const embeddingModel = String(tweaks.aiEmbeddingModel || 'text-embedding-3-small').trim();
  const baseUrl = String(tweaks.aiBaseUrl || 'https://api.openai.com/v1').trim().replace(/\/+$/, '');
  const query = String(payload?.query || '').trim();
  const results = Array.isArray(payload?.results) ? payload.results : [];

  if (!apiKey) {
    return { ok: false, error: 'Add an API key in Settings > AI API first.' };
  }
  if (!embeddingModel) {
    return { ok: false, error: 'Choose an embedding model first.' };
  }
  if (query.length < 2) {
    return { ok: false, error: 'Search for a word first.' };
  }

  try {
    const usableResults = results.filter((item) => !item?.error && item?.snippet);
    let items = [];
    let embeddings = [];
    let cachedCount = 0;
    let requestedCount = 0;
    let source = 'search-results';

    if (usableResults.length >= 3) {
      items = usableResults.map((result, index) => ({
        id: result.id || `${result.bookTitle || 'Book'}-${result.label || index}-${index}`,
        bookId: result.bookId,
        bookTitle: result.bookTitle || 'Untitled',
        bookAuthor: result.bookAuthor || 'Unknown',
        format: result.format || 'Book',
        label: result.label || result.format || 'Excerpt',
        href: result.href || null,
        pageNum: result.pageNum || null,
        snippet: String(result.snippet || '').replace(/\s+/g, ' ').slice(0, 700),
      }));
      const embedded = await getCachedEmbeddings({ baseUrl, apiKey, model: embeddingModel, items });
      embeddings = embedded.embeddings;
      cachedCount = embedded.cachedCount;
      requestedCount = embedded.requestedCount;
    } else {
      const indexed = await collectSemanticMapIndexItems(query, { baseUrl, apiKey, embeddingModel });
      items = indexed.items;
      embeddings = indexed.embeddings;
      cachedCount = indexed.cachedCount;
      requestedCount = indexed.requestedCount;
      source = indexed.source;

      if (items.length < 3) {
        return { ok: false, error: 'Semantic Map needs at least 3 search results or a built AI Index.' };
      }
    }

    const clusters = buildSemanticClusters({ query, items, embeddings });
    const namedClusters = chatModel
      ? await nameSemanticClusters({ baseUrl, apiKey, model: chatModel, query, clusters })
      : clusters;

    return {
      ok: true,
      map: {
        query,
        embeddingModel,
        totalResults: items.length,
        totalBooks: new Set(items.map((item) => item.bookTitle)).size,
        embeddingCache: { cachedCount, requestedCount, source },
        clusters: namedClusters,
      },
    };
  } catch (err) {
    return { ok: false, error: err.message || 'Could not build the semantic map.' };
  }
});

ipcMain.handle('ai-explain-semantic-theme', async (_event, payload) => {
  const store = readStore();
  const tweaks = store['app:tweaks'] || {};
  const apiKey = String(tweaks.aiApiKey || '').trim();
  const model = String(tweaks.aiModel || 'gpt-5.1-mini').trim();
  const baseUrl = String(tweaks.aiBaseUrl || 'https://api.openai.com/v1').trim().replace(/\/+$/, '');
  const query = String(payload?.query || '').trim();
  const cluster = payload?.cluster || {};
  const items = Array.isArray(cluster.items) ? cluster.items.filter((item) => item?.snippet) : [];

  if (!apiKey) {
    return { ok: false, error: 'Add an API key in Settings > AI API first.' };
  }
  if (!model) {
    return { ok: false, error: 'Choose a model in Settings > AI API first.' };
  }
  if (!query || !cluster?.name) {
    return { ok: false, error: 'Select a semantic theme first.' };
  }
  if (items.length === 0) {
    return { ok: false, error: 'No excerpts are available for this theme.' };
  }

  const sampled = sampleSearchResultsByBook(items);
  const excerptContext = buildSearchExplanationContext(query, sampled);
  const messages = [
    {
      role: 'system',
      content: [
        'You are Flux Reader AI, explaining one semantic theme from a personal reading library.',
        'Answer in the same language as the search term.',
        'Use only the supplied excerpts for claims about books.',
        'Focus on the selected semantic theme, not the whole search result set.',
        'Return concise Markdown with short headings and bullets.',
      ].join(' '),
    },
    {
      role: 'user',
      content: [
        `Search term: ${query}`,
        `Selected theme: ${cluster.name}`,
        `Theme summary: ${cluster.summary || ''}`,
        `Theme keywords: ${(cluster.keywords || []).join(', ')}`,
        '',
        'Task:',
        '1. Explain what this theme means across the selected excerpts.',
        '2. Compare how different books understand or frame this theme.',
        '3. Mention representative books only when the excerpt supports it.',
        '4. Avoid inventing content that is not visible in the excerpts.',
        '',
        excerptContext,
      ].join('\n'),
    },
  ];

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.2,
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = data?.error?.message || `AI request failed with status ${response.status}.`;
      return { ok: false, error: message };
    }

    const content = data?.choices?.[0]?.message?.content?.trim();
    if (!content) {
      return { ok: false, error: 'The model returned an empty response.' };
    }

    return { ok: true, explanation: content };
  } catch (err) {
    return { ok: false, error: err.message || 'Could not reach the AI service.' };
  }
});

ipcMain.handle('ai-build-index', async (event, payload) => {
  const store = readStore();
  const tweaks = store['app:tweaks'] || {};
  const apiKey = String(tweaks.aiApiKey || '').trim();
  const embeddingModel = String(tweaks.aiEmbeddingModel || 'text-embedding-3-small').trim();
  const baseUrl = String(tweaks.aiBaseUrl || 'https://api.openai.com/v1').trim().replace(/\/+$/, '');
  const books = Array.isArray(payload?.books) ? payload.books : [];

  if (!apiKey) {
    return { ok: false, error: 'Add an API key in Settings > AI API first.' };
  }
  if (!embeddingModel) {
    return { ok: false, error: 'Choose an embedding model first.' };
  }

  const searchableBooks = books.filter((book) => book?.isRealFile && book?.filePath && fs.existsSync(book.filePath));
  if (searchableBooks.length === 0) {
    return { ok: false, error: 'No local books are available to index.' };
  }

  try {
    const chunks = [];
    for (const [index, book] of searchableBooks.entries()) {
      event.sender.send('ai-index-progress', {
        phase: 'extracting',
        currentBook: index + 1,
        totalBooks: searchableBooks.length,
        bookTitle: book.title || 'Untitled',
        chunksCount: chunks.length,
      });
      const bookChunks = book.format === 'PDF'
        ? await extractPdfIndexChunks(book)
        : extractEpubIndexChunks(book);
      chunks.push(...bookChunks);
      event.sender.send('ai-index-progress', {
        phase: 'extracting',
        currentBook: index + 1,
        totalBooks: searchableBooks.length,
        bookTitle: book.title || 'Untitled',
        chunksCount: chunks.length,
      });
    }

    if (chunks.length === 0) {
      return { ok: false, error: 'No readable text was found in the selected books.' };
    }

    event.sender.send('ai-index-progress', {
      phase: 'embedding',
      currentBook: searchableBooks.length,
      totalBooks: searchableBooks.length,
      chunksCount: chunks.length,
      cachedCount: 0,
      requestedCount: chunks.length,
    });
    const { cachedCount, requestedCount } = await getCachedEmbeddings({
      baseUrl,
      apiKey,
      model: embeddingModel,
      items: chunks,
      onProgress: (progress) => {
        event.sender.send('ai-index-progress', {
          phase: 'embedding',
          currentBook: searchableBooks.length,
          totalBooks: searchableBooks.length,
          chunksCount: chunks.length,
          cachedCount: progress.cachedCount,
          requestedCount: progress.requestedCount,
          batchIndex: progress.batchIndex,
          batchCount: progress.batchCount,
        });
      },
    });
    const indexedAt = new Date().toISOString();
    writeAIIndex({
      version: 1,
      embeddingModel,
      indexedAt,
      booksCount: searchableBooks.length,
      chunks: chunks.map((chunk) => ({
        ...chunk,
        embeddingKey: hashEmbeddingItem(embeddingModel, chunk),
      })),
    });

    return {
      ok: true,
      index: {
        indexedAt,
        booksCount: searchableBooks.length,
        chunksCount: chunks.length,
        cachedCount,
        requestedCount,
        embeddingModel,
      },
    };
  } catch (err) {
    return { ok: false, error: err.message || 'Could not build the AI index.' };
  }
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

function makeTextChunks(text, maxChars = 900, overlap = 160) {
  const source = String(text || '').replace(/\s+/g, ' ').trim();
  if (!source) return [];
  const chunks = [];
  let start = 0;

  while (start < source.length) {
    let end = Math.min(source.length, start + maxChars);
    if (end < source.length) {
      const boundary = Math.max(
        source.lastIndexOf('。', end),
        source.lastIndexOf('！', end),
        source.lastIndexOf('？', end),
        source.lastIndexOf('.', end),
        source.lastIndexOf('\n', end)
      );
      if (boundary > start + Math.floor(maxChars * 0.55)) end = boundary + 1;
    }
    const chunk = source.slice(start, end).trim();
    if (chunk.length >= 80) chunks.push(chunk);
    if (end >= source.length) break;
    start = Math.max(end - overlap, start + 1);
  }

  return chunks;
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
    const properties = (tag.match(/\bproperties=["']([^"']+)["']/i) || [])[1] || '';
    if (!id || !href) continue;
    manifest.set(id, {
      href,
      zipPath: resolveZipPath(opfDir, href),
      mediaType,
      properties,
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

function extractChatTerms(question) {
  const normalized = String(question || '').replace(/\s+/g, ' ').trim();
  const terms = [];
  const pinnedTerms = [];
  const quoted = normalized.match(/[“"『「《']([^”"』」》']{2,40})[”"』」》']/g) || [];
  for (const value of quoted) {
    const term = value.replace(/^[“"『「《']|[”"』」》']$/g, '').trim();
    if (term) pinnedTerms.push(term);
  }

  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    try {
      const segmenter = new Intl.Segmenter('zh', { granularity: 'word' });
      for (const part of segmenter.segment(normalized)) {
        if (part.isWordLike) terms.push(part.segment);
      }
    } catch (_) {}
  }

  terms.push(...(normalized.match(/[A-Za-z0-9_-]{3,}/g) || []));
  const cjkRuns = normalized.match(/[\u4e00-\u9fff]{2,}/g) || [];
  for (const run of cjkRuns) {
    if (run.length <= 4) terms.push(run);
    for (let i = 0; i < run.length - 1; i++) {
      terms.push(run.slice(i, i + 2));
    }
  }

  const stopWords = new Set([
    '什么', '怎么', '如何', '为什么', '请问', '帮我', '能否', '可以', '一下', '这个', '那个',
    '里面', '书里', '库里', '定义', '具体', '进行', '检索', '搜索', '定位', '相关', '结果',
    '关于', '是否', '解释', '意思', '含义', '准确', '回答', '直接', '目前', '无法', '给出',
    '这批', '批书', '里的', '看到', '提供', '上下', '下文', '原文', '段落', '出现', '足够',
    'the', 'and', 'that', 'this', 'with', 'from', 'what', 'why', 'how',
  ]);

  const unique = [];
  const seen = new Set();
  for (const rawTerm of [...pinnedTerms, ...terms]) {
    const term = String(rawTerm || '').trim();
    const normalizedTerm = term.toLowerCase();
    if (term.length < 2 || stopWords.has(normalizedTerm) || /^\d+$/.test(term)) continue;
    if (!/[a-zA-Z\u4e00-\u9fff]/.test(term)) continue;
    if (seen.has(normalizedTerm)) continue;
    seen.add(normalizedTerm);
    unique.push(term);
  }

  return unique
    .sort((a, b) => scoreChatTerm(b, normalized, pinnedTerms) - scoreChatTerm(a, normalized, pinnedTerms))
    .slice(0, 8);
}

function scoreChatTerm(term, question, pinnedTerms) {
  const normalized = String(term || '').toLowerCase();
  let score = 0;
  if (pinnedTerms.some((pinned) => pinned.toLowerCase() === normalized)) score += 100;
  if (/^[\u4e00-\u9fff]{2,4}$/.test(term)) score += 20;
  if (/^[\u4e00-\u9fff]{2}$/.test(term)) score += 14;
  if (/[痛苦悲伤恐惧焦虑幸福财富决策关系学习时间金钱原则]/.test(term)) score += 18;
  if (question.includes(`“${term}”`) || question.includes(`"${term}"`) || question.includes(`《${term}》`)) score += 60;
  score -= Math.max(0, String(term).length - 6) * 3;
  return score;
}

function sampleSearchResultsByBook(results) {
  const byBook = new Map();

  for (const result of results) {
    const title = result.bookTitle || 'Untitled';
    const author = result.bookAuthor || 'Unknown';
    const key = `${title}|||${author}`;
    if (!byBook.has(key)) byBook.set(key, []);
    byBook.get(key).push(result);
  }

  const groups = [...byBook.values()];
  const maxBooks = 24;
  const maxTotal = 96;
  const selectedGroups = groups.slice(0, maxBooks);
  const perBookLimit = Math.max(1, Math.floor(maxTotal / Math.max(selectedGroups.length, 1)));
  const sampled = [];

  for (const group of selectedGroups) {
    const localLimit = Math.min(5, perBookLimit);
    if (group.length <= localLimit) {
      sampled.push(...group);
      continue;
    }

    const picks = new Map();
    const first = group[0];
    const middle = group[Math.floor(group.length / 2)];
    const last = group[group.length - 1];
    [first, middle, last].forEach((item) => {
      if (item) picks.set(item.id || `${item.bookTitle}-${item.label}-${item.snippet}`, item);
    });

    for (const item of group) {
      if (picks.size >= localLimit) break;
      picks.set(item.id || `${item.bookTitle}-${item.label}-${item.snippet}`, item);
    }

    sampled.push(...picks.values());
  }

  return sampled;
}

function buildSearchExplanationContext(query, results) {
  const byBook = new Map();

  for (const result of results) {
    const title = result.bookTitle || 'Untitled';
    const author = result.bookAuthor || 'Unknown';
    const key = `${title}|||${author}`;
    if (!byBook.has(key)) {
      byBook.set(key, { title, author, format: result.format || 'Book', items: [] });
    }
    const group = byBook.get(key);
    if (group.items.length >= 5) continue;
    group.items.push({
      label: result.label || result.format || 'Excerpt',
      snippet: String(result.snippet || '').replace(/\s+/g, ' ').slice(0, 900),
    });
  }

  const groups = [...byBook.values()];
  return [
    'Search excerpts:',
    `Covered books: ${groups.length}`,
    ...groups.map((group, groupIndex) => (
      [
        '',
        `Book ${groupIndex + 1}: ${group.title}`,
        `Author: ${group.author}`,
        `Format: ${group.format}`,
        ...group.items.map((item, itemIndex) => (
          `Excerpt ${itemIndex + 1} (${item.label}): ${item.snippet}`
        )),
      ].join('\n')
    )),
    '',
    `The searched term is: ${query}`,
  ].join('\n');
}

function hashEmbeddingItem(model, item) {
  const text = [
    model,
    item.bookTitle || '',
    item.bookAuthor || '',
    item.format || '',
    item.label || '',
    item.snippet || '',
  ].join('\n');
  return crypto.createHash('sha256').update(text).digest('hex');
}

async function getCachedEmbeddings({ baseUrl, apiKey, model, items, onProgress }) {
  const cache = readEmbeddingCache();
  if (!cache.items || typeof cache.items !== 'object') cache.items = {};

  const embeddings = new Array(items.length);
  const missing = [];
  let cachedCount = 0;

  items.forEach((item, index) => {
    const key = hashEmbeddingItem(model, item);
    const cached = cache.items[key];
    if (Array.isArray(cached?.embedding) && cached.embedding.length > 0) {
      embeddings[index] = cached.embedding;
      cachedCount += 1;
    } else {
      missing.push({ item, index, key });
    }
  });
  onProgress?.({
    cachedCount,
    requestedCount: missing.length,
    batchIndex: 0,
    batchCount: missing.length > 0 ? Math.ceil(missing.length / 48) : 0,
  });

  if (missing.length > 0) {
    const fetched = await fetchEmbeddings({
      baseUrl,
      apiKey,
      model,
      items: missing.map((entry) => entry.item),
      cachedCount,
      totalMissing: missing.length,
      onProgress,
    });

    fetched.forEach((embedding, fetchedIndex) => {
      const target = missing[fetchedIndex];
      embeddings[target.index] = embedding;
      cache.items[target.key] = {
        model,
        embedding,
        bookTitle: target.item.bookTitle,
        label: target.item.label,
        createdAt: new Date().toISOString(),
      };
    });

    pruneEmbeddingCache(cache);
    writeEmbeddingCache(cache);
  }

  return {
    embeddings,
    cachedCount,
    requestedCount: missing.length,
  };
}

function pruneEmbeddingCache(cache) {
  const entries = Object.entries(cache.items || {});
  const maxItems = 12000;
  if (entries.length <= maxItems) return;

  entries
    .sort((a, b) => String(a[1]?.createdAt || '').localeCompare(String(b[1]?.createdAt || '')))
    .slice(0, entries.length - maxItems)
    .forEach(([key]) => {
      delete cache.items[key];
    });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function estimateEmbeddingTokens(items) {
  return items.reduce((sum, item) => {
    const text = [item.bookTitle, item.label, item.snippet].join(' ');
    const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const ascii = text.length - cjk;
    return sum + Math.ceil(cjk * 1.1 + ascii / 4) + 24;
  }, 0);
}

function parseRetryDelay(errorMessage) {
  const message = String(errorMessage || '');
  const seconds = message.match(/try again in ([\d.]+)s/i);
  if (seconds) return Math.ceil(Number(seconds[1]) * 1000) + 800;
  const ms = message.match(/try again in ([\d.]+)ms/i);
  if (ms) return Math.ceil(Number(ms[1])) + 800;
  return 5000;
}

async function fetchEmbeddings({ baseUrl, apiKey, model, items, cachedCount = 0, totalMissing = items.length, onProgress }) {
  const embeddings = [];
  const batchSize = 48;
  const targetTokensPerMinute = 650000;
  const batchCount = Math.ceil(items.length / batchSize);

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchIndex = Math.floor(i / batchSize) + 1;
    onProgress?.({
      cachedCount,
      requestedCount: totalMissing,
      batchIndex,
      batchCount,
    });
    const estimatedTokens = estimateEmbeddingTokens(batch);
    const minDelay = Math.max(900, Math.ceil((estimatedTokens / targetTokensPerMinute) * 60000));
    let data = null;

    for (let attempt = 0; attempt < 5; attempt++) {
      const response = await fetch(`${baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          input: batch.map((item) => [
            `Book: ${item.bookTitle}`,
            `Place: ${item.label}`,
            `Excerpt: ${item.snippet}`,
          ].join('\n')),
        }),
      });

      data = await response.json().catch(() => ({}));
      if (response.ok) break;

      const message = data?.error?.message || `Embedding request failed with status ${response.status}.`;
      const isRateLimit = response.status === 429 || /rate limit|TPM|try again/i.test(message);
      if (!isRateLimit || attempt === 4) {
        throw new Error(message);
      }
      await sleep(parseRetryDelay(message) * (attempt + 1));
    }

    const vectors = Array.isArray(data?.data) ? data.data.slice().sort((a, b) => a.index - b.index) : [];
    if (vectors.length !== batch.length) {
      throw new Error('The embedding service returned an unexpected response.');
    }
    embeddings.push(...vectors.map((item) => normalizeVector(item.embedding || [])));
    onProgress?.({
      cachedCount,
      requestedCount: totalMissing,
      batchIndex,
      batchCount,
      embeddedCount: Math.min(i + batch.length, items.length),
    });
    if (i + batchSize < items.length) await sleep(minDelay);
  }

  return embeddings;
}

function normalizeVector(vector) {
  const values = Array.isArray(vector) ? vector.map((value) => Number(value) || 0) : [];
  const length = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0)) || 1;
  return values.map((value) => value / length);
}

function cosineSimilarity(a, b) {
  const length = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < length; i++) sum += a[i] * b[i];
  return sum;
}

function averageVectors(vectors) {
  if (vectors.length === 0) return [];
  const dims = vectors[0].length;
  const center = new Array(dims).fill(0);
  for (const vector of vectors) {
    for (let i = 0; i < dims; i++) center[i] += vector[i] || 0;
  }
  return normalizeVector(center.map((value) => value / vectors.length));
}

function chooseClusterCount(count) {
  if (count < 8) return 2;
  return Math.min(8, Math.max(3, Math.round(Math.sqrt(count / 7))));
}

function initialCenters(vectors, k) {
  const centers = [vectors[0]];
  while (centers.length < k) {
    let bestIndex = 0;
    let bestDistance = -Infinity;
    for (let i = 0; i < vectors.length; i++) {
      const nearest = Math.max(...centers.map((center) => cosineSimilarity(vectors[i], center)));
      const distance = 1 - nearest;
      if (distance > bestDistance) {
        bestDistance = distance;
        bestIndex = i;
      }
    }
    centers.push(vectors[bestIndex]);
  }
  return centers;
}

function clusterEmbeddings(vectors) {
  const k = chooseClusterCount(vectors.length);
  let centers = initialCenters(vectors, k);
  let assignments = new Array(vectors.length).fill(0);

  for (let iteration = 0; iteration < 12; iteration++) {
    assignments = vectors.map((vector) => {
      let bestIndex = 0;
      let bestScore = -Infinity;
      centers.forEach((center, index) => {
        const score = cosineSimilarity(vector, center);
        if (score > bestScore) {
          bestScore = score;
          bestIndex = index;
        }
      });
      return bestIndex;
    });

    centers = centers.map((center, index) => {
      const group = vectors.filter((_, vectorIndex) => assignments[vectorIndex] === index);
      return group.length > 0 ? averageVectors(group) : center;
    });
  }

  return { assignments, centers };
}

function semanticTokens(text) {
  const source = String(text || '');
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    try {
      const segmenter = new Intl.Segmenter('zh', { granularity: 'word' });
      return [...segmenter.segment(source)]
        .filter((part) => part.isWordLike)
        .map((part) => part.segment);
    } catch (_) {}
  }

  const tokens = source.match(/[A-Za-z][A-Za-z'-]{2,}|[\u4e00-\u9fff]{2,}/g) || [];
  const bigrams = [];
  for (const token of tokens) {
    if (/^[\u4e00-\u9fff]{3,}$/.test(token)) {
      for (let i = 0; i < token.length - 1; i++) bigrams.push(token.slice(i, i + 2));
    } else {
      bigrams.push(token);
    }
  }
  return bigrams;
}

const SEMANTIC_STOP_WORDS = new Set([
  '一个', '一种', '这个', '这些', '那些', '他们', '我们', '你们', '自己', '没有', '因为', '所以',
  '如果', '但是', '只是', '就是', '还是', '可以', '不是', '而是', '已经', '应该', '这种', '那种',
  '什么', '时候', '可能', '进行', '通过', '对于', '以及', '或者', '并且', '其中', '它们', '这是',
  '你的', '我的', '他的', '她的', '并不', '人们', '这样', '非常', '很多', '一些', '东西', '真的',
  '所有', '任何', '每个', '每种', '一次', '一切', '而言', '起来', '出来', '下去', '不会', '不能',
  '不要', '总是', '甚至', '如此', '比较', '更加', '成为', '发生', '看到', '知道', 'the', 'and',
  'that', 'this', 'with', 'from', 'have', 'will', 'would', 'could', 'should', 'about', 'there', 'their',
  'then', 'than', 'when', 'what', 'which', 'where', 'who', 'whom', 'whose', 'why', 'how', 'into', 'onto',
  'over', 'under', 'after', 'before', 'between', 'among', 'through', 'during', 'without', 'within', 'also',
  'just', 'only', 'very', 'more', 'most', 'much', 'many', 'some', 'such', 'each', 'every', 'other', 'another',
  'same', 'make', 'made', 'making', 'does', 'done', 'doing', 'was', 'were', 'been', 'being', 'are', 'is',
  'am', 'can', 'may', 'might', 'must', 'shall', 'upon', 'your', 'you', 'our', 'ours', 'his', 'her', 'hers',
  'its', 'they', 'them', 'these', 'those', 'all', 'any', 'not', 'nor', 'for', 'but', 'or', 'as', 'at',
  'by', 'in', 'of', 'on', 'to', 'up', 'we', 'he', 'she', 'it',
]);

function hasCjk(text) {
  return /[\u4e00-\u9fff]/.test(String(text || ''));
}

function clusterKeywords(items, query) {
  const queryToken = String(query || '').trim().toLowerCase();
  const preferCjk = hasCjk(query);
  const counts = new Map();
  for (const item of items) {
    const seen = new Set();
    for (const raw of semanticTokens(item.snippet)) {
      const token = String(raw || '').trim().toLowerCase();
      if (preferCjk && !hasCjk(token)) continue;
      if (!token || token.length <= 1 || token === queryToken || SEMANTIC_STOP_WORDS.has(token) || /^\d+$/.test(token)) continue;
      if (!/[a-zA-Z\u4e00-\u9fff]/.test(token)) continue;
      counts.set(token, (counts.get(token) || 0) + (seen.has(token) ? 0.25 : 1));
      seen.add(token);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([word]) => word);
}

function layoutSemanticClusters(clusters) {
  const count = clusters.length;
  if (count === 1) return clusters.map((cluster) => ({ ...cluster, x: 0.5, y: 0.5 }));

  const positions = clusters.map((_, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / count;
    return { x: 0.5 + Math.cos(angle) * 0.28, y: 0.5 + Math.sin(angle) * 0.28 };
  });

  for (let iteration = 0; iteration < 160; iteration++) {
    for (let i = 0; i < count; i++) {
      for (let j = i + 1; j < count; j++) {
        const similarity = cosineSimilarity(clusters[i].center, clusters[j].center);
        const target = 0.18 + (1 - Math.max(-0.2, Math.min(0.9, similarity))) * 0.42;
        const dx = positions[j].x - positions[i].x;
        const dy = positions[j].y - positions[i].y;
        const distance = Math.sqrt(dx * dx + dy * dy) || 0.001;
        const force = (distance - target) * 0.012;
        const fx = (dx / distance) * force;
        const fy = (dy / distance) * force;
        positions[i].x += fx;
        positions[i].y += fy;
        positions[j].x -= fx;
        positions[j].y -= fy;
      }
    }
  }

  return clusters.map((cluster, index) => ({
    ...cluster,
    x: Math.max(0.13, Math.min(0.87, positions[index].x)),
    y: Math.max(0.15, Math.min(0.85, positions[index].y)),
  }));
}

function buildSemanticClusters({ query, items, embeddings }) {
  const { assignments, centers } = clusterEmbeddings(embeddings);
  const grouped = new Map();

  assignments.forEach((clusterIndex, itemIndex) => {
    if (!grouped.has(clusterIndex)) grouped.set(clusterIndex, []);
    grouped.get(clusterIndex).push({ item: items[itemIndex], vector: embeddings[itemIndex] });
  });

  const clusters = [...grouped.entries()]
    .map(([clusterIndex, group], index) => {
      const clusterItems = group.map((entry) => entry.item);
      const center = averageVectors(group.map((entry) => entry.vector));
      const keywords = clusterKeywords(clusterItems, query);
      const cohesion = group.reduce((sum, entry) => sum + cosineSimilarity(entry.vector, center), 0) / Math.max(group.length, 1);
      return {
        id: `semantic-cluster-${index}`,
        rawIndex: clusterIndex,
        name: keywords.slice(0, 2).join(' / ') || `Theme ${index + 1}`,
        summary: 'Semantic group based on nearby excerpts.',
        keywords,
        size: clusterItems.length,
        booksCount: new Set(clusterItems.map((item) => item.bookTitle)).size,
        cohesion,
        center,
        items: clusterItems.slice(0, 80),
        examples: clusterItems.slice(0, 4),
      };
    })
    .filter((cluster) => cluster.size > 0)
    .sort((a, b) => b.size - a.size);

  return layoutSemanticClusters(clusters).map(({ center, rawIndex, ...cluster }) => ({
    ...cluster,
    radius: Math.max(0.1, Math.min(0.22, 0.09 + Math.sqrt(cluster.size) / 35)),
  }));
}

function extractJsonArray(text) {
  const source = String(text || '').trim();
  try { return JSON.parse(source); } catch (_) {}
  const match = source.match(/\[[\s\S]*\]/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch (_) { return null; }
}

async function nameSemanticClusters({ baseUrl, apiKey, model, query, clusters }) {
  const useChinese = hasCjk(query);
  const payload = clusters.map((cluster, index) => ({
    index,
    keywords: cluster.keywords,
    size: cluster.size,
    booksCount: cluster.booksCount,
    examples: cluster.examples.slice(0, 3).map((item) => ({
      book: item.bookTitle,
      excerpt: item.snippet.slice(0, 260),
    })),
  }));

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: [
            'Name semantic clusters for a reading app.',
            'Use only the supplied excerpts.',
            'Return valid JSON only: an array of objects with index, name, summary, keywords.',
            'keywords must be an array of 3 to 6 short terms.',
            useChinese
              ? 'The search term is Chinese, so every name, summary, and keyword must be concise Simplified Chinese. Translate English concepts into Chinese. Do not output English stop words.'
              : 'Use the same language as the search term. Do not output stop words.',
          ].join(' '),
        },
        {
          role: 'user',
          content: JSON.stringify({ searchTerm: query, clusters: payload }),
        },
      ],
      temperature: 0.2,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) return clusters;

  const labels = extractJsonArray(data?.choices?.[0]?.message?.content);
  if (!Array.isArray(labels)) return clusters;
  const byIndex = new Map(labels.map((item) => [Number(item.index), item]));

  return clusters.map((cluster, index) => {
    const label = byIndex.get(index);
    const name = String(label?.name || '').trim();
    const summary = String(label?.summary || '').trim();
    const keywords = Array.isArray(label?.keywords)
      ? label.keywords
          .map((word) => String(word || '').trim())
          .filter((word) => word && (!useChinese || hasCjk(word)))
          .slice(0, 6)
      : [];
    return {
      ...cluster,
      name: name || cluster.name,
      summary: summary || cluster.summary,
      keywords: keywords.length > 0 ? keywords : cluster.keywords,
    };
  });
}

function normalizeForMatch(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function scoreBookForQuestion(book, question, terms) {
  const title = normalizeForMatch(book.title);
  const author = normalizeForMatch(book.author);
  const fileName = normalizeForMatch(path.basename(book.filePath || '', path.extname(book.filePath || '')));
  const q = normalizeForMatch(question);
  let score = 0;

  if (title && q.includes(title)) score += 100;
  if (author && q.includes(author)) score += 25;
  if (fileName && q.includes(fileName)) score += 40;

  for (const term of terms) {
    const t = normalizeForMatch(term);
    if (!t) continue;
    if (title.includes(t) || t.includes(title)) score += 20;
    if (fileName.includes(t) || t.includes(fileName)) score += 10;
    if (author.includes(t)) score += 8;
  }

  return score;
}

function selectRelevantBooks(books, question, terms) {
  const scored = books
    .map((book) => ({ book, score: scoreBookForQuestion(book, question, terms) }))
    .sort((a, b) => b.score - a.score);
  const matched = scored.filter((item) => item.score > 0).map((item) => item.book);
  return matched.length > 0 ? matched.slice(0, 5) : books.slice(0, 8);
}

async function collectFullLibraryTextMatches(books, terms) {
  const snippets = [];
  const seenMatches = new Set();

  for (const term of terms) {
    let termMatches = 0;
    for (const book of books) {
      if (snippets.length >= 48 || termMatches >= 18) break;
      try {
        const matches = book.format === 'PDF'
          ? await searchPdfBook(book, term)
          : searchEpubBook(book, term);
        for (const match of matches.slice(0, 2)) {
          const key = `${match.bookTitle || ''}-${match.label || ''}-${match.snippet || ''}`;
          if (seenMatches.has(key)) continue;
          snippets.push({ ...match, matchedTerm: term });
          seenMatches.add(key);
          termMatches += 1;
          if (snippets.length >= 48 || termMatches >= 18) break;
        }
      } catch (_) {}
    }
    if (snippets.length >= 48) break;
  }

  return sampleSearchResultsByBook(snippets);
}

async function collectAIIndexMatches(question, options) {
  const index = readAIIndex();
  const allowedBookIds = options?.allowedBookIds instanceof Set ? options.allowedBookIds : null;
  const chunks = (Array.isArray(index.chunks) ? index.chunks : [])
    .filter((chunk) => !allowedBookIds || allowedBookIds.has(chunk.bookId));
  if (!options?.apiKey || !options?.embeddingModel || index.embeddingModel !== options.embeddingModel || chunks.length === 0) return [];

  const cache = readEmbeddingCache();
  const { embeddings } = await getCachedEmbeddings({
    baseUrl: options.baseUrl,
    apiKey: options.apiKey,
    model: options.embeddingModel,
    items: [{
      id: 'chat-query',
      bookTitle: 'User question',
      bookAuthor: 'Flux Reader',
      format: 'Query',
      label: 'Question',
      snippet: question,
    }],
  });
  const queryVector = embeddings[0];
  const matches = [];

  for (const chunk of chunks) {
    const embedding = cache.items?.[chunk.embeddingKey]?.embedding;
    if (!Array.isArray(embedding)) continue;
    matches.push({
      ...chunk,
      score: cosineSimilarity(queryVector, embedding),
    });
  }

  return matches
    .sort((a, b) => b.score - a.score)
    .slice(0, 18);
}

async function collectSemanticMapIndexItems(query, options) {
  const index = readAIIndex();
  const chunks = Array.isArray(index.chunks) ? index.chunks : [];
  if (!options?.apiKey || !options?.embeddingModel || index.embeddingModel !== options.embeddingModel || chunks.length === 0) {
    return { items: [], embeddings: [], cachedCount: 0, requestedCount: 0, source: 'search-results' };
  }

  const cache = readEmbeddingCache();
  const { embeddings: queryEmbeddings, requestedCount } = await getCachedEmbeddings({
    baseUrl: options.baseUrl,
    apiKey: options.apiKey,
    model: options.embeddingModel,
    items: [{
      id: 'semantic-map-query',
      bookTitle: 'Semantic Map',
      bookAuthor: 'Flux Reader',
      format: 'Query',
      label: 'Search term',
      snippet: query,
    }],
  });
  const queryVector = queryEmbeddings[0];
  const matches = [];

  for (const chunk of chunks) {
    const embedding = cache.items?.[chunk.embeddingKey]?.embedding;
    if (!Array.isArray(embedding)) continue;
    matches.push({
      item: {
        ...chunk,
        snippet: String(chunk.snippet || '').slice(0, 900),
      },
      embedding,
      score: cosineSimilarity(queryVector, embedding),
    });
  }

  const selected = matches
    .sort((a, b) => b.score - a.score)
    .slice(0, 160);

  return {
    items: selected.map((entry) => entry.item),
    embeddings: selected.map((entry) => entry.embedding),
    cachedCount: selected.length,
    requestedCount,
    source: 'ai-index',
  };
}

async function buildChatContext(books, question, options = {}) {
  const searchableBooks = books
    .filter((book) => book?.isRealFile && book?.filePath && fs.existsSync(book.filePath))
    .slice(0, 60);
  if (searchableBooks.length === 0) return '';

  const terms = extractChatTerms(question);
  const indexMatches = await collectAIIndexMatches(question, {
    ...options,
    allowedBookIds: new Set(searchableBooks.map((book) => book.id).filter(Boolean)),
  });
  const snippets = await collectFullLibraryTextMatches(searchableBooks, terms);
  const snippetBookIds = new Set([...indexMatches, ...snippets].map((item) => item.bookId).filter(Boolean));
  const matchedBooks = searchableBooks.filter((book) => snippetBookIds.has(book.id));
  const relevantBooks = matchedBooks.length > 0
    ? matchedBooks.slice(0, 8)
    : selectRelevantBooks(searchableBooks, question, terms);
  const bookOverviews = [];
  const sections = [
    [
      `Library inventory: ${searchableBooks.length} visible books`,
      ...searchableBooks.map((book, index) => (
        `${index + 1}. ${book.title || 'Untitled'} — ${book.author || 'Unknown'} (${book.format || 'Book'})`
      )),
    ].join('\n'),
  ];

  if (indexMatches.length > 0) {
    sections.push(`Semantic AI index matches:\nThese passages were retrieved from the local all-book embedding index and should be used first.\n\n${indexMatches.map((item, index) => (
      `[${index + 1}] ${item.bookTitle} — ${item.label || item.format} — score ${Number(item.score || 0).toFixed(3)}\n${String(item.snippet || '').slice(0, 1000)}`
    )).join('\n\n')}`);
  }

  if (snippets.length > 0) {
    sections.push(`Full-library retrieved passages:\nSearch terms used first: ${terms.join(', ')}\nMatched passages: ${snippets.length}\n\n${snippets.map((item, index) => (
      `[${index + 1}] ${item.bookTitle} — ${item.label || item.format} — matched "${item.matchedTerm || ''}"\n${String(item.snippet || '').slice(0, 900)}`
    )).join('\n\n')}`);
  } else {
    sections.push(`Full-library retrieved passages:\nSearch terms used first: ${terms.join(', ')}\nMatched passages: 0`);
  }

  for (const book of relevantBooks) {
    try {
      const overview = book.format === 'PDF'
        ? await buildPdfBookContext(book)
        : buildEpubBookContext(book);
      if (overview) bookOverviews.push(overview);
    } catch (_) {}
  }

  if (bookOverviews.length > 0) {
    sections.push(`Book structure context for matched or likely relevant books:\n\n${bookOverviews.join('\n\n---\n\n')}`);
  }

  return sections.join('\n\n');
}

function pickAttribute(tag, attr) {
  return (String(tag || '').match(new RegExp(`\\b${attr}=["']([^"']+)["']`, 'i')) || [])[1] || '';
}

function stripFragment(href) {
  return String(href || '').split('#')[0];
}

function normalizeHref(href) {
  return decodeURIComponent(stripFragment(href)).replace(/^\.\//, '');
}

function extractHtmlTitle(html) {
  const heading = (String(html || '').match(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/i) || [])[1]
    || (String(html || '').match(/<title\b[^>]*>([\s\S]*?)<\/title>/i) || [])[1];
  return stripHtmlToText(heading || '').slice(0, 120);
}

function extractEpubNavToc(zip, manifest) {
  const navItem = [...manifest.values()].find((item) =>
    /\bnav\b/i.test(item.properties || '') || /nav|toc/i.test(item.href || '')
  );
  if (!navItem) return [];

  try {
    const html = zip.readAsText(navItem.zipPath);
    const tocNav = (html.match(/<nav\b[^>]*(?:epub:type|type)=["'][^"']*toc[^"']*["'][^>]*>([\s\S]*?)<\/nav>/i) || [])[1]
      || (html.match(/<nav\b[^>]*>([\s\S]*?)<\/nav>/i) || [])[1]
      || html;
    const items = [];
    const linkRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = linkRe.exec(tocNav))) {
      const href = pickAttribute(match[1], 'href');
      const label = stripHtmlToText(match[2]);
      const zipPath = href ? resolveZipPath(path.posix.dirname(navItem.zipPath), href) : '';
      if (label) items.push({ label, href: normalizeHref(href), zipPath: normalizeHref(zipPath) });
    }
    return items;
  } catch (_) {
    return [];
  }
}

function extractEpubNcxToc(zip, manifest) {
  const ncxItem = [...manifest.values()].find((item) =>
    /application\/x-dtbncx\+xml/i.test(item.mediaType || '') || /\.ncx$/i.test(item.href || '')
  );
  if (!ncxItem) return [];

  try {
    const ncx = zip.readAsText(ncxItem.zipPath);
    const items = [];
    const pointRe = /<navPoint\b[\s\S]*?<\/navPoint>/gi;
    let match;
    while ((match = pointRe.exec(ncx))) {
      const block = match[0];
      const label = stripHtmlToText((block.match(/<navLabel\b[^>]*>[\s\S]*?<text\b[^>]*>([\s\S]*?)<\/text>[\s\S]*?<\/navLabel>/i) || [])[1] || '');
      const contentTag = (block.match(/<content\b[^>]*>/i) || [])[0] || '';
      const href = pickAttribute(contentTag, 'src');
      const zipPath = href ? resolveZipPath(path.posix.dirname(ncxItem.zipPath), href) : '';
      if (label) items.push({ label, href: normalizeHref(href), zipPath: normalizeHref(zipPath) });
    }
    return items;
  } catch (_) {
    return [];
  }
}

function labelForSpineItem(item, tocItems, html) {
  const href = normalizeHref(item.href);
  const zipPath = normalizeHref(item.zipPath);
  const toc = tocItems.find((tocItem) => (
    normalizeHref(tocItem.href) === href ||
    normalizeHref(tocItem.zipPath) === zipPath
  ));
  if (toc?.label) return toc.label;

  const title = extractHtmlTitle(html);
  if (title) return title;

  return path.basename(href, path.extname(href)) || 'Chapter';
}

function buildEpubBookContext(book) {
  const AdmZip = require('adm-zip');
  const zip = new AdmZip(book.filePath);
  const opfInfo = getOpfInfo(zip);
  if (!opfInfo) return '';

  const manifest = extractManifest(opfInfo.opf, opfInfo.opfDir);
  const spine = extractSpine(opfInfo.opf, manifest);
  const tocItems = extractEpubNavToc(zip, manifest);
  const ncxItems = tocItems.length > 0 ? [] : extractEpubNcxToc(zip, manifest);
  const toc = tocItems.length > 0 ? tocItems : ncxItems;
  const spineEntries = [];
  const excerpts = [];

  for (const item of spine) {
    if (!/x?html|xml/i.test(item.mediaType)) continue;
    let html = '';
    try {
      html = zip.readAsText(item.zipPath);
    } catch (_) {
      continue;
    }
    const label = labelForSpineItem(item, toc, html);
    spineEntries.push(label);
    if (excerpts.length < 4) {
      const text = stripHtmlToText(html);
      if (text) excerpts.push(`${label}: ${text.slice(0, 700)}`);
    }
    if (spineEntries.length >= 30 && excerpts.length >= 4) break;
  }

  const tocText = toc.length > 0
    ? toc.slice(0, 50).map((item, index) => `${index + 1}. ${item.label}`).join('\n')
    : 'No explicit EPUB table of contents found.';
  const spineText = spineEntries.slice(0, 30).map((label, index) => `${index + 1}. ${label}`).join('\n');

  return [
    `Book: ${book.title || 'Untitled'}`,
    `Author: ${book.author || 'Unknown'}`,
    `Format: EPUB`,
    `EPUB table of contents:\n${tocText}`,
    spineText ? `EPUB reading order:\n${spineText}` : '',
    excerpts.length > 0 ? `Opening chapter excerpts:\n${excerpts.join('\n\n')}` : '',
  ].filter(Boolean).join('\n\n');
}

function extractEpubIndexChunks(book) {
  const AdmZip = require('adm-zip');
  const zip = new AdmZip(book.filePath);
  const opfInfo = getOpfInfo(zip);
  if (!opfInfo) return [];

  const manifest = extractManifest(opfInfo.opf, opfInfo.opfDir);
  const spine = extractSpine(opfInfo.opf, manifest);
  const tocItems = extractEpubNavToc(zip, manifest);
  const ncxItems = tocItems.length > 0 ? [] : extractEpubNcxToc(zip, manifest);
  const toc = tocItems.length > 0 ? tocItems : ncxItems;
  const chunks = [];

  for (const item of spine) {
    if (!/x?html|xml/i.test(item.mediaType)) continue;
    let html = '';
    try {
      html = zip.readAsText(item.zipPath);
    } catch (_) {
      continue;
    }
    const text = stripHtmlToText(html);
    if (!text) continue;
    const label = labelForSpineItem(item, toc, html);
    const textChunks = makeTextChunks(text);
    textChunks.forEach((snippet, index) => {
      chunks.push({
        id: `${book.id || book.filePath}-${item.href || item.zipPath}-${index}`,
        bookId: book.id,
        bookTitle: book.title || 'Untitled',
        bookAuthor: book.author || 'Unknown',
        format: book.format || 'EPUB',
        label: `${label} · ${index + 1}`,
        href: item.href || null,
        pageNum: null,
        snippet,
      });
    });
  }

  return chunks;
}

async function buildPdfBookContext(book) {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(fs.readFileSync(book.filePath));
  const loadingTask = pdfjsLib.getDocument({ data, disableWorker: true });
  const pdf = await loadingTask.promise;
  const excerpts = [];
  const maxPages = Math.min(pdf.numPages, 4);

  for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const text = content.items.map((item) => item.str || '').join(' ').replace(/\s+/g, ' ').trim();
    if (text) excerpts.push(`Page ${pageNum}: ${text.slice(0, 800)}`);
  }

  await pdf.destroy();
  return [
    `Book: ${book.title || 'Untitled'}`,
    `Author: ${book.author || 'Unknown'}`,
    `Format: PDF`,
    `Pages: ${pdf.numPages}`,
    excerpts.length > 0 ? `Opening page excerpts:\n${excerpts.join('\n\n')}` : '',
  ].filter(Boolean).join('\n\n');
}

async function extractPdfIndexChunks(book) {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(fs.readFileSync(book.filePath));
  const loadingTask = pdfjsLib.getDocument({ data, disableWorker: true });
  const pdf = await loadingTask.promise;
  const chunks = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const text = content.items.map((item) => item.str || '').join(' ').replace(/\s+/g, ' ').trim();
    const textChunks = makeTextChunks(text);
    textChunks.forEach((snippet, index) => {
      chunks.push({
        id: `${book.id || book.filePath}-page-${pageNum}-${index}`,
        bookId: book.id,
        bookTitle: book.title || 'Untitled',
        bookAuthor: book.author || 'Unknown',
        format: book.format || 'PDF',
        label: `Page ${pageNum}${textChunks.length > 1 ? ` · ${index + 1}` : ''}`,
        href: null,
        pageNum,
        snippet,
      });
    });
  }

  await pdf.destroy();
  return chunks;
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
