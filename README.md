# Flux Reader

Flux Reader is a local-first EPUB and PDF reader for macOS. It is built for people who want to read, search, connect, and explain their own book library with AI while keeping the files on their own computer.

## What It Does

Flux Reader helps turn a folder of books into a searchable reading workspace.

- Read local EPUB and PDF files
- Organize books by folders
- Search across book contents
- Build an AI Index for semantic search and faster AI answers
- Explore search results with a semantic map
- Chat with AI about your library or a selected passage
- Highlight passages and export notes as Markdown
- Use a whiteboard to collect quotes, notes, text, shapes, and connections

## Core Features

### Local Library

Add folders from your Mac and Flux Reader scans EPUB and PDF files inside them. Selecting a folder in the sidebar limits the library, search, highlights, and AI Chat to that folder.

### Reader

Open EPUB and PDF books in a clean reading interface. EPUB books support selection, highlights, notes, and passage-based AI Chat.

### Search

Search inside all books or inside the currently selected folder. Search results show matched excerpts and can be opened directly in the reader.

### Semantic Map

Search results can be turned into a semantic map. Each island represents a cluster of related excerpts, helping you see how a word or idea appears across different books.

The map supports:

- Zoom
- Pan
- Clickable regions
- Clickable excerpt dots
- AI explanation for selected themes

### AI Chat

Flux Reader can use your OpenAI-compatible API key to answer questions about your books.

AI Chat can use:

- The full library inventory
- Search results
- AI Index semantic matches
- Selected text from the current book

### AI Index

The AI Index embeds book chunks once and caches them locally. After indexing, semantic search and AI Chat can reuse existing embeddings instead of rebuilding them every time.

### Whiteboard

Each book has a whiteboard for thinking visually. You can add cards, quotes, notes, text, shapes, arrows, and links. The whiteboard supports Mac trackpad two-finger panning, zooming, dragging, and double-click text entry.

## Development

Install dependencies:

```bash
npm install
```

Run the app in development:

```bash
npm run dev
```

Build the frontend:

```bash
npm run build
```

Package the macOS app:

```bash
npm run dist
```

## Notes

Flux Reader is designed as a local reading tool. Your books are read from local folders, and app data is stored locally. AI features require an API key configured in Settings.
