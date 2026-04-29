import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { applyTheme, applyFont } from './theme.js';
import { DEMO_BOOKS } from './data/books.js';
import MacChrome from './components/MacChrome.jsx';
import Sidebar from './components/Sidebar.jsx';
import Toolbar from './components/Toolbar.jsx';
import LibraryGrid from './components/LibraryGrid.jsx';
import HighlightsPanel from './components/HighlightsPanel.jsx';
import SearchResultsPanel from './components/SearchResultsPanel.jsx';
import AiChatPanel from './components/AiChatPanel.jsx';
import ReaderView from './components/ReaderView.jsx';
import TweaksPanel from './components/TweaksPanel.jsx';
import { storeGet, storeSet } from './data/store.js';
import { getAnnotations } from './data/annotations.js';

const DEMO_FOLDERS = [
  { name: 'Classics', path: '~/Documents/Books/Classics', count: 7 },
  { name: 'Fiction', path: '~/Documents/Books/Fiction', count: 5 },
  { name: 'Essays', path: '~/Documents/Books/Essays', count: 2 },
  { name: 'iCloud Drive', path: '~/iCloud/Books', count: 3 },
];

const TWEAK_DEFAULTS = {
  theme: 'light',
  font: 'serif',
  size: 17,
  width: 640,
  notesFolder: '',
  aiProvider: 'openai',
  aiApiKey: '',
  aiModel: 'gpt-5.1-mini',
  aiEmbeddingModel: 'text-embedding-3-small',
  aiBaseUrl: 'https://api.openai.com/v1',
};

const COVER_STYLES = ['ornate', 'wave', 'bloom', 'frame', 'rule', 'block', 'moor'];
const PALETTES = [
  { bg: '#E8DFD3', fg: '#2B2118', accent: '#8B6B47' },
  { bg: '#1E2A35', fg: '#E8DCC4', accent: '#C4A15A' },
  { bg: '#F2E8E4', fg: '#3A2A2F', accent: '#A85D6E' },
  { bg: '#2A1F2E', fg: '#D9C79A', accent: '#9C7A3C' },
  { bg: '#E4E6E1', fg: '#1C2420', accent: '#5B6B5C' },
  { bg: '#D4C9B8', fg: '#1A1A1A', accent: '#8B2E2E' },
  { bg: '#3A3530', fg: '#E6D9C2', accent: '#A67B4E' },
];

function makeRealBook(file, index) {
  return {
    id: `real-${file.filePath}`,
    title: file.title || file.name.replace(/\.(epub|pdf)$/i, ''),
    author: file.author || 'Unknown',
    format: file.format,
    progress: parseFloat(localStorage.getItem(`epub-progress-${file.filePath}`) || '0'),
    palette: PALETTES[index % PALETTES.length],
    coverStyle: COVER_STYLES[index % COVER_STYLES.length],
    coverImage: file.coverImage || null,
    filePath: file.filePath,
    isRealFile: true,
  };
}

function isBookInFolder(book, folderPath) {
  if (!folderPath) return true;
  const filePath = String(book?.filePath || '');
  return filePath === folderPath || filePath.startsWith(`${folderPath}/`);
}

const isElectron = typeof window !== 'undefined' && !!window.electronAPI;

function readLegacyJson(key, defaultValue) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function readLegacyText(key, defaultValue) {
  try {
    const raw = localStorage.getItem(key);
    return raw ?? defaultValue;
  } catch {
    return defaultValue;
  }
}

function readPersistedFolders() {
  const stored = storeGet('library:folders', null);
  const legacy = readLegacyJson('localreader-folders', []);
  if (Array.isArray(stored) && stored.length > 0) return stored;
  return legacy;
}

function readPersistedSelectedFolder() {
  const stored = storeGet('library:selectedFolder', null);
  const legacy = readLegacyText('localreader-selected-folder', null);
  return stored || legacy;
}

export default function App() {
  const [tweaks, _setTweaks] = useState(() => {
    const saved = storeGet('app:tweaks', readLegacyJson('localreader-tweaks', null));
    return saved ? { ...TWEAK_DEFAULTS, ...saved } : TWEAK_DEFAULTS;
  });
  const [route, setRoute] = useState(() => {
    return { highlightCfi: null, searchTarget: null, ...storeGet('app:route', readLegacyJson('localreader-route', { view: 'library', bookId: null })) };
  });
  const [folders, setFolders] = useState(() => {
    if (!isElectron) return DEMO_FOLDERS;
    return readPersistedFolders();
  });
  const [selectedFolder, setSelectedFolder] = useState(() => {
    if (!isElectron) return DEMO_FOLDERS[0].path;
    return readPersistedSelectedFolder();
  });
  const [realBooks, setRealBooks] = useState([]);
  const [filterView, setFilterView] = useState('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('recent');
  const [tweaksOpen, setTweaksOpen] = useState(false);
  const [refreshingFolders, setRefreshingFolders] = useState(false);
  const [fullTextResults, setFullTextResults] = useState([]);
  const [fullTextStatus, setFullTextStatus] = useState('idle');
  const [semanticSearchMap, setSemanticSearchMap] = useState({ query: '', status: 'idle', map: null, error: '' });
  const [semanticThemeExplanation, setSemanticThemeExplanation] = useState({ query: '', clusterId: '', status: 'idle', content: '', error: '' });
  const [aiIndexStatus, setAiIndexStatus] = useState({ status: 'idle', message: '', error: '', index: null });
  const [aiMessages, setAiMessages] = useState(() => storeGet('ai:messages', []));
  const [aiStatus, setAiStatus] = useState('idle');
  const searchRequestRef = useRef(0);

  const allBooks = isElectron
    ? realBooks
    : (realBooks.length > 0 ? realBooks : DEMO_BOOKS);
  const scopedBooks = useMemo(() => (
    isElectron && selectedFolder
      ? allBooks.filter((book) => isBookInFolder(book, selectedFolder))
      : allBooks
  ), [allBooks, selectedFolder]);

  useEffect(() => { applyTheme(tweaks.theme); }, [tweaks.theme]);
  useEffect(() => { applyFont(tweaks.font); }, [tweaks.font]);
  useEffect(() => { document.documentElement.style.setProperty('--reader-size', tweaks.size + 'px'); }, [tweaks.size]);
  useEffect(() => { document.documentElement.style.setProperty('--reader-width', tweaks.width + 'px'); }, [tweaks.width]);
  useEffect(() => { void storeSet('app:tweaks', tweaks); }, [tweaks]);
  useEffect(() => { void storeSet('app:route', { view: route.view, bookId: route.bookId }); }, [route]);
  useEffect(() => { void storeSet('ai:messages', aiMessages); }, [aiMessages]);
  useEffect(() => {
    const unsubscribe = window.electronAPI?.onAIIndexProgress?.((progress) => {
      setAiIndexStatus((current) => {
        if (current.status !== 'building') return current;
        const totalBooks = progress.totalBooks || 0;
        const currentBook = progress.currentBook || 0;
        const bookText = progress.bookTitle ? ` · ${progress.bookTitle}` : '';
        const batchText = progress.batchCount
          ? ` · batch ${progress.batchIndex || 0}/${progress.batchCount}`
          : '';
        const phaseText = progress.phase === 'embedding' ? 'Embedding chunks' : 'Reading books';
        return {
          ...current,
          progress,
          message: `${phaseText}: ${currentBook}/${totalBooks} books${bookText} · ${progress.chunksCount || 0} chunks${batchText}`,
        };
      });
    });
    return () => { if (unsubscribe) unsubscribe(); };
  }, []);
  useEffect(() => {
    if (filterView === 'reading' || filterView === 'finished') setFilterView('all');
  }, [filterView]);
  useEffect(() => {
    setSemanticSearchMap({ query: search.trim(), status: 'idle', map: null, error: '' });
    setSemanticThemeExplanation({ query: search.trim(), clusterId: '', status: 'idle', content: '', error: '' });
  }, [selectedFolder]);
  useEffect(() => {
    const validSorts = filterView === 'search'
      ? ['relevance', 'title']
      : filterView === 'chat'
      ? ['recent']
      : filterView === 'highlights'
      ? ['recent', 'oldest', 'title']
      : ['recent', 'title', 'author', 'progress'];
    if (!validSorts.includes(sort)) setSort(validSorts[0]);
  }, [filterView, sort]);
  useEffect(() => {
    if (filterView !== 'search') return;
    const q = search.trim();
    setSemanticSearchMap((current) => (
      current.query === q ? current : { query: q, status: 'idle', map: null, error: '' }
    ));
    setSemanticThemeExplanation((current) => (
      current.query === q ? current : { query: q, clusterId: '', status: 'idle', content: '', error: '' }
    ));
    if (q.length < 2) {
      setFullTextStatus('idle');
      setFullTextResults([]);
      return;
    }

    const requestId = searchRequestRef.current + 1;
    searchRequestRef.current = requestId;
    setFullTextStatus('searching');

    const timer = setTimeout(async () => {
      try {
        const searchableBooks = scopedBooks
          .filter((book) => book.isRealFile && book.filePath)
          .map(({ id, title, author, format, filePath }) => ({ id, title, author, format, filePath }));
        const results = await window.electronAPI?.searchBooks?.(searchableBooks, q);
        if (searchRequestRef.current !== requestId) return;
        setFullTextResults(Array.isArray(results) ? results : []);
        setFullTextStatus('done');
      } catch (_) {
        if (searchRequestRef.current !== requestId) return;
        setFullTextResults([]);
        setFullTextStatus('done');
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [filterView, search, scopedBooks]);
  useEffect(() => {
    if (!isElectron) return;
    if (folders.length > 0) void storeSet('library:folders', folders);
    if (selectedFolder) void storeSet('library:selectedFolder', selectedFolder);
  }, []); // Migrate legacy values without overwriting saved data with empty defaults.
  useEffect(() => {
    if (!isElectron || folders.length === 0) return;
    if (selectedFolder && !folders.some((folder) => folder.path === selectedFolder)) {
      setSelectedFolder('');
      void storeSet('library:selectedFolder', '');
    }
  }, [folders, selectedFolder]);
  const setTweaks = (partial) => _setTweaks(t => ({ ...t, ...partial }));
  const selectFolder = (folderPath) => {
    setSelectedFolder(folderPath);
    void storeSet('library:selectedFolder', folderPath);
  };

  const scanFolders = useCallback(async (foldersToScan) => {
    if (!isElectron || foldersToScan.length === 0) {
      setRealBooks([]);
      return;
    }

    setRefreshingFolders(true);
    try {
      const scanResults = await Promise.all(
        foldersToScan.map(async (folder) => {
          const files = await window.electronAPI.scanFolder(folder.path);
          return { folder, files };
        })
      );

      const nextFolders = scanResults.map(({ folder, files }) => ({
        ...folder,
        count: files.length,
      }));
      const nextBooks = scanResults.flatMap(({ files }) => files);

      setFolders(nextFolders);
      setRealBooks(nextBooks.map((file, index) => makeRealBook(file, index)));
      await storeSet('library:folders', nextFolders);
    } finally {
      setRefreshingFolders(false);
    }
  }, []);

  const refreshLibrary = useCallback(async () => {
    await scanFolders(folders);
  }, [folders, scanFolders]);

  useEffect(() => {
    if (!isElectron || folders.length === 0) return;
    void scanFolders(folders);
  }, [folders.length, scanFolders]);

  useEffect(() => {
    if (!isElectron) return;
    const handleWindowFocus = () => { void refreshLibrary(); };
    window.addEventListener('focus', handleWindowFocus);
    return () => window.removeEventListener('focus', handleWindowFocus);
  }, [refreshLibrary]);

  const addFolder = async () => {
    if (isElectron) {
      const folderPath = await window.electronAPI.selectFolder();
      if (!folderPath) return;

      const files = await window.electronAPI.scanFolder(folderPath);
      if (files.length === 0) {
        alert('No EPUB or PDF files found in that folder.');
        return;
      }

      const newBooks = files.map((f, i) => makeRealBook(f, realBooks.length + i));
      const folderName = folderPath.split('/').pop();
      const nextFolders = folders.find(f => f.path === folderPath)
        ? folders
        : [...folders, { name: folderName, path: folderPath, count: files.length }];

      setFolders(nextFolders);
      setRealBooks(prev => {
        const existingPaths = new Set(prev.map(b => b.filePath));
        const fresh = newBooks.filter(b => !existingPaths.has(b.filePath));
        return [...prev, ...fresh];
      });
      selectFolder(folderPath);
      await Promise.all([
        storeSet('library:folders', nextFolders),
        storeSet('library:selectedFolder', folderPath),
      ]);
      setFilterView('all');
    } else if (window.showDirectoryPicker) {
      try {
        const dirHandle = await window.showDirectoryPicker({ mode: 'read' });
        const newFiles = [];
        let i = 0;
        for await (const entry of dirHandle.values()) {
          if (entry.kind === 'file' && /\.(epub|pdf)$/i.test(entry.name)) {
            const file = await entry.getFile();
            newFiles.push({ filePath: entry.name, name: entry.name, format: entry.name.split('.').pop().toUpperCase(), title: entry.name.replace(/\.(epub|pdf)$/i, ''), author: 'Unknown', coverImage: null });
            i++;
          }
        }
        if (newFiles.length === 0) { alert('No EPUB or PDF files found.'); return; }
        const newBooks = newFiles.map((f, idx) => makeRealBook(f, idx));
        setRealBooks(prev => [...prev, ...newBooks]);
        const nextFolders = [...folders, { name: dirHandle.name, path: dirHandle.name, count: newFiles.length }];
        setFolders(nextFolders);
        selectFolder(dirHandle.name);
        await Promise.all([
          storeSet('library:folders', nextFolders),
          storeSet('library:selectedFolder', dirHandle.name),
        ]);
      } catch (err) {
        if (err.name !== 'AbortError') console.error(err);
      }
    } else {
      alert('Please run this app in Electron or a modern browser (Chrome/Edge) to open local folders.');
    }
  };

  const removeFolder = async (folderPath) => {
    const nextFolders = folders.filter(folder => folder.path !== folderPath);
    setFolders(nextFolders);
    await storeSet('library:folders', nextFolders);

    if (selectedFolder === folderPath) {
      setSelectedFolder('');
      await storeSet('library:selectedFolder', '');
      setFilterView('all');
    }

    setRealBooks(prev => prev.filter(book => book.filePath && !book.filePath.startsWith(`${folderPath}/`)));
  };

  const chooseNotesFolder = async () => {
    if (!window.electronAPI) return;
    const folder = await window.electronAPI.selectFolder();
    if (folder) setTweaks({ notesFolder: folder });
  };

  const filteredBooks = useMemo(() => {
    let list = scopedBooks.slice();
    if (filterView === 'reading') list = list.filter(b => b.progress > 0 && b.progress < 1);
    if (filterView === 'finished') list = list.filter(b => b.progress >= 1);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(b => b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q));
    }
    if (sort === 'title') list.sort((a, b) => a.title.localeCompare(b.title));
    else if (sort === 'author') list.sort((a, b) => a.author.split(' ').slice(-1)[0].localeCompare(b.author.split(' ').slice(-1)[0]));
    else if (sort === 'progress') list.sort((a, b) => b.progress - a.progress);
    return list;
  }, [scopedBooks, filterView, search, sort]);

  const allHighlights = useMemo(() => (
    scopedBooks.flatMap((book) => (
      getAnnotations(book.id).map((annotation) => ({ ...annotation, book }))
    ))
  ), [scopedBooks, route.view, route.bookId]);

  const filteredHighlights = useMemo(() => {
    let list = allHighlights.slice();
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((item) =>
        item.text.toLowerCase().includes(q) ||
        (item.note || '').toLowerCase().includes(q) ||
        (item.chapter || '').toLowerCase().includes(q) ||
        item.book.title.toLowerCase().includes(q) ||
        item.book.author.toLowerCase().includes(q)
      );
    }
    if (sort === 'title') list.sort((a, b) => a.book.title.localeCompare(b.book.title));
    else if (sort === 'oldest') list.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    else list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return list;
  }, [allHighlights, search, sort]);

  const sortedFullTextResults = useMemo(() => {
    const list = fullTextResults.slice();
    if (sort === 'title') {
      list.sort((a, b) => (a.bookTitle || '').localeCompare(b.bookTitle || ''));
    }
    return list;
  }, [fullTextResults, sort]);

  const openBook = (book) => setRoute({ view: 'reader', bookId: book.id, highlightCfi: null, searchTarget: null });
  const openHighlight = (item) => setRoute({ view: 'reader', bookId: item.book.id, highlightCfi: item.cfi || null, searchTarget: null });
  const openSearchResult = (item) => {
    if (item.error) return;
    setRoute({
      view: 'reader',
      bookId: item.bookId,
      highlightCfi: null,
      searchTarget: { href: item.href || null, pageNum: item.pageNum || null },
    });
  };
  const buildSemanticSearchMap = async () => {
    const query = search.trim();
    if (query.length < 2 || semanticSearchMap.status === 'building') return;

    const results = sortedFullTextResults
      .filter((item) => !item.error && item.snippet);

    setSemanticSearchMap({ query, status: 'building', map: null, error: '' });
    try {
      const result = await window.electronAPI?.buildSemanticSearchMap?.({ query, results });
      setSemanticSearchMap({
        query,
        status: 'idle',
        map: result?.ok ? result.map : null,
        error: result?.ok ? '' : (result?.error || 'Semantic map is not available right now.'),
      });
    } catch (err) {
      setSemanticSearchMap({
        query,
        status: 'idle',
        map: null,
        error: err.message || 'Semantic map is not available right now.',
      });
    }
  };
  const explainSemanticTheme = async (cluster) => {
    const query = search.trim();
    if (!cluster?.id || query.length < 2 || semanticThemeExplanation.status === 'explaining') return;

    setSemanticThemeExplanation({ query, clusterId: cluster.id, status: 'explaining', content: '', error: '' });
    try {
      const result = await window.electronAPI?.explainSemanticTheme?.({ query, cluster });
      setSemanticThemeExplanation({
        query,
        clusterId: cluster.id,
        status: 'idle',
        content: result?.ok ? result.explanation : '',
        error: result?.ok ? '' : (result?.error || 'Theme explanation is not available right now.'),
      });
    } catch (err) {
      setSemanticThemeExplanation({
        query,
        clusterId: cluster.id,
        status: 'idle',
        content: '',
        error: err.message || 'Theme explanation is not available right now.',
      });
    }
  };
  const buildAIIndex = async () => {
    if (aiIndexStatus.status === 'building') return;
    const searchableBooks = allBooks
      .filter((book) => book.isRealFile && book.filePath)
      .map(({ id, title, author, format, filePath, isRealFile }) => ({ id, title, author, format, filePath, isRealFile }));

    setAiIndexStatus({ status: 'building', message: `Indexing ${searchableBooks.length} books…`, error: '', index: null, progress: { currentBook: 0, totalBooks: searchableBooks.length } });
    try {
      const result = await window.electronAPI?.buildAIIndex?.({ books: searchableBooks });
      if (result?.ok) {
        setAiIndexStatus({
          status: 'idle',
          message: `Indexed ${result.index.chunksCount} chunks from ${result.index.booksCount} books. ${result.index.cachedCount} cached / ${result.index.requestedCount} new.`,
          error: '',
          index: result.index,
        });
      } else {
        setAiIndexStatus({ status: 'idle', message: '', error: result?.error || 'AI index could not be built.', index: null });
      }
    } catch (err) {
      setAiIndexStatus({ status: 'idle', message: '', error: err.message || 'AI index could not be built.', index: null });
    }
  };
  const sendAiMessage = async (content) => {
    const userMessage = { id: `user-${Date.now()}`, role: 'user', content };
    const nextMessages = [...aiMessages, userMessage];
    setAiMessages(nextMessages);
    setAiStatus('sending');

    try {
      const searchableBooks = scopedBooks
        .filter((book) => book.isRealFile && book.filePath)
        .map(({ id, title, author, format, filePath, isRealFile }) => ({ id, title, author, format, filePath, isRealFile }));
      const result = await window.electronAPI?.chatWithAI?.({
        messages: nextMessages.map(({ role, content }) => ({ role, content })),
        books: searchableBooks,
      });
      setAiMessages((current) => [...current, {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: result?.ok ? result.message : (result?.error || 'AI chat is not available right now.'),
      }]);
    } catch (err) {
      setAiMessages((current) => [...current, {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: err.message || 'AI chat is not available right now.',
      }]);
    } finally {
      setAiStatus('idle');
    }
  };
  const clearAiMessages = () => setAiMessages([]);
  const backToLibrary = () => setRoute({ view: 'library', bookId: null, highlightCfi: null, searchTarget: null });
  const activeBook = route.bookId ? allBooks.find(b => b.id === route.bookId) : null;

  const folderInfo = folders.find(f => f.path === selectedFolder);
  const activeBookCount = scopedBooks.length;
  const activeFolderLabel = folderInfo ? folderInfo.path : 'All folders';
  const highlightedBooksCount = new Set(filteredHighlights.map((item) => item.book.id)).size;
  const sub = filterView === 'search'
    ? (search.trim().length >= 2
        ? `${sortedFullTextResults.length} result${sortedFullTextResults.length !== 1 ? 's' : ''} · ${activeBookCount} book${activeBookCount !== 1 ? 's' : ''}`
        : `${activeBookCount} book${activeBookCount !== 1 ? 's' : ''} available`)
    : filterView === 'chat'
    ? `${activeBookCount} book${activeBookCount !== 1 ? 's' : ''} available · ${aiMessages.length} message${aiMessages.length !== 1 ? 's' : ''}`
    : filterView === 'highlights'
    ? `${filteredHighlights.length} highlight${filteredHighlights.length !== 1 ? 's' : ''} · ${highlightedBooksCount} book${highlightedBooksCount !== 1 ? 's' : ''}`
    : `${filteredBooks.length} book${filteredBooks.length !== 1 ? 's' : ''} · ${activeFolderLabel}`;
  const title = filterView === 'reading' ? 'Currently Reading' :
                filterView === 'finished' ? 'Finished' :
                filterView === 'highlights' ? 'Highlights' :
                filterView === 'search' ? 'Search' :
                filterView === 'chat' ? 'AI Chat' :
                folderInfo ? folderInfo.name : (isElectron && folders.length === 0 ? 'Add a folder to get started' : 'All Books');
  const sortOptions = filterView === 'search'
    ? [
        { value: 'relevance', label: 'Relevance' },
        { value: 'title', label: 'Book Title' },
      ]
    : filterView === 'chat'
    ? [
        { value: 'recent', label: 'Recent' },
      ]
    : filterView === 'highlights'
    ? [
        { value: 'recent', label: 'Newest First' },
        { value: 'oldest', label: 'Oldest First' },
        { value: 'title', label: 'Book Title' },
      ]
    : [
        { value: 'recent', label: 'Recently Added' },
        { value: 'title', label: 'Title' },
        { value: 'author', label: 'Author' },
        { value: 'progress', label: 'Progress' },
      ];
  const searchPlaceholder = filterView === 'search'
    ? (folderInfo ? `Search inside ${folderInfo.name}` : 'Search inside all books')
    : filterView === 'highlights' ? 'Search highlight, note, or book' : 'Search title or author';

  return (
    <div style={{
      width: '100vw', height: '100vh',
      display: 'flex', alignItems: 'stretch', justifyContent: 'center',
    }}>
      <div style={{ width: '100%', height: '100%', display: 'flex' }}>
        {route.view === 'library' ? (
          <MacChrome title="Flux Reader">
            <Sidebar
              currentFolder={folderInfo ? folderInfo.path : 'All folders'}
              folders={folders.length > 0 ? folders : (isElectron ? [] : DEMO_FOLDERS)}
              selectedFolder={selectedFolder}
              onSelectFolder={(p) => { selectFolder(p); setFilterView('all'); }}
              books={allBooks}
              highlightsCount={allHighlights.length}
              searchResultsCount={fullTextResults.length}
              view={filterView}
              onView={setFilterView}
              onAddFolder={addFolder}
              onRemoveFolder={removeFolder}
            />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--app-bg)' }}>
              <Toolbar
                title={title}
                subtitle={sub}
                sort={sort} onSort={setSort}
                search={search} onSearch={setSearch}
                searchPlaceholder={searchPlaceholder}
                sortOptions={sortOptions}
                showSearch={filterView !== 'chat'}
                showSort={filterView !== 'chat'}
                onRefresh={isElectron && folders.length > 0 ? (() => void refreshLibrary()) : null}
                refreshing={refreshingFolders}
                onOpenTweaks={() => setTweaksOpen(o => !o)}
              />
              <div style={{ flex: 1, overflow: 'auto' }}>
                {isElectron && allBooks.length === 0 ? (
                  <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    height: '100%', gap: 16, color: 'var(--fg-faint)', fontFamily: 'var(--ui-font)',
                  }}>
                    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" style={{ opacity: 0.3 }}>
                      <path d="M8 12a4 4 0 014-4h12l4 4h12a4 4 0 014 4v20a4 4 0 01-4 4H12a4 4 0 01-4-4V12z" stroke="currentColor" strokeWidth="2" />
                    </svg>
                    <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--fg-muted)' }}>No books yet</div>
                    <div style={{ fontSize: 13 }}>Click "+ Add folder…" in the sidebar to open a folder of EPUB or PDF files.</div>
                  </div>
                ) : filterView === 'search' ? (
                  <SearchResultsPanel
                    query={search}
	                    status={fullTextStatus}
	                    results={sortedFullTextResults}
	                    onOpenResult={openSearchResult}
                      semanticMap={semanticSearchMap}
                      onBuildSemanticMap={buildSemanticSearchMap}
                      themeExplanation={semanticThemeExplanation}
                      onExplainSemanticTheme={explainSemanticTheme}
	                    hasApiKey={!!tweaks.aiApiKey}
	                  />
                ) : filterView === 'chat' ? (
                  <AiChatPanel
                    messages={aiMessages}
                    status={aiStatus}
                    onSend={sendAiMessage}
                    onClear={clearAiMessages}
                    hasApiKey={!!tweaks.aiApiKey}
                  />
                ) : filterView === 'highlights' ? (
                  <HighlightsPanel highlights={filteredHighlights} onOpenHighlight={openHighlight} />
                ) : (
                  <LibraryGrid books={filteredBooks} onOpen={openBook} />
                )}
              </div>
            </div>
          </MacChrome>
        ) : activeBook ? (
          <ReaderView book={activeBook} onBack={backToLibrary} onOpenTweaks={() => setTweaksOpen(o => !o)} notesFolder={tweaks.notesFolder} onSetNotesFolder={(f) => setTweaks({ notesFolder: f })} initialLocationCfi={route.highlightCfi} initialSearchTarget={route.searchTarget} />
        ) : (
          <MacChrome title="Flux Reader">
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-faint)', fontFamily: 'var(--ui-font)', fontSize: 13 }}>
              <button onClick={backToLibrary} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 13 }}>← Back to Library</button>
            </div>
          </MacChrome>
        )}
      </div>
      <TweaksPanel
        open={tweaksOpen}
        onClose={() => setTweaksOpen(false)}
        tweaks={tweaks}
        setTweaks={setTweaks}
        folders={folders}
        selectedFolder={selectedFolder}
        onAddBookFolder={addFolder}
        onSelectBookFolder={(folderPath) => {
          selectFolder(folderPath);
          setFilterView('all');
        }}
        onRemoveBookFolder={removeFolder}
            onChooseNotesFolder={chooseNotesFolder}
            aiIndexStatus={aiIndexStatus}
            onBuildAIIndex={buildAIIndex}
          />
    </div>
  );
}
