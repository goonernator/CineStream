# 🎬 CineStream

A beautiful, feature-rich desktop application for streaming movies and TV shows. Built with Electron.

![CineStream Banner](https://img.shields.io/badge/CineStream-v1.0.4.0-e63946?style=for-the-badge)
![Electron](https://img.shields.io/badge/Electron-28.x-47848F?style=for-the-badge&logo=electron)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

---

## ✨ Features

### 🎥 Streaming
- **High-Quality Streams** - Automatically selects the best available quality
- **HLS Support** - Seamless playback of HLS (.m3u8) streams
- **Quality Selector** - Manually choose your preferred streaming quality
- **Movies & TV Shows** - Full support for both content types
- **Episode Browser** - Easy season and episode selection for TV shows

### 🔍 Discovery
- **Featured Latest Carousel** - Prominent large carousel showcasing the latest movies and TV shows with stunning backdrop images, detailed descriptions, and instant play
- **Continue Watching** - Resume your viewing progress with automatic timestamp tracking
- **Browse by Genre** - Explore content by genre with dynamic category sections
- **Browse by Provider** - Discover content available on your favorite streaming services (Netflix, Hulu, Disney+, etc.)
- **Powerful Search** - Search movies, TV shows, and people with filters
- **Homepage Categories** - Browse Top Rated, Popular, and New Releases with carousel navigation
- **Trailer Previews** - Hover over cards to preview trailers
- **Detailed Info** - Ratings, runtime, genres, cast, and more

### 📝 Subtitles & Captions
- **Auto-Fetch Subtitles** - Automatically downloads English subtitles
- **OpenSubtitles Integration** - Access millions of subtitles
- **SRT to VTT Conversion** - Automatic format conversion for compatibility
- **Subtitle Customization**:
  - Font size (12-48px)
  - Font color
  - Background color & opacity
  - Font family selection
  - Text shadow styles (Outline, Drop Shadow, Raised)
- **Settings Persistence** - Your preferences are saved automatically

### 👤 TMDB Account Integration
- **Sign In with TMDB** - Connect your TMDB account
- **Favorites** - Save movies and shows to your favorites
- **Watchlist** - Keep track of what you want to watch
- **Ratings** - Rate movies and shows (syncs with TMDB)
- **Persistent Sessions** - Stay logged in across app restarts

### 🎨 Modern UI/UX
- **Dark Theme** - Easy on the eyes with a sleek dark interface
- **Custom Title Bar** - Frameless window with custom controls
- **Collapsible Sidebar** - Toggle with hamburger menu for more space
- **Smooth Animations** - Polished transitions throughout
- **Responsive Layout** - Adapts to different window sizes
- **Toast Notifications** - Non-intrusive feedback messages

### ⌨️ Keyboard Shortcuts
| Shortcut | Action |
|----------|--------|
| `Ctrl + K` | Open/Close Search |
| `Escape` | Close Search / Exit Player |

---

## 🆕 What's New in v1.0.4.0

### Major Updates
- **✨ Featured Latest Carousel** - Brand new large, prominent carousel at the top of the homepage displaying the latest movies and TV shows. Features:
  - Large 800px wide cards with backdrop images
  - Poster images with ratings and metadata
  - Detailed descriptions and overview text
  - Instant "Watch Now" buttons
  - Smooth horizontal scrolling navigation
  - Combines latest movies and TV shows in one stunning showcase

- **🏠 Enhanced Homepage Experience**
  - Reorganized category layout for better content discovery
  - Improved carousel navigation throughout all sections
  - Better visual hierarchy with the featured carousel

### Improvements
- Better content filtering to ensure quality
- Improved loading states and error handling
- Enhanced UI responsiveness

---

## 📸 Screenshots

### Homepage
Featured latest carousel at the top showcasing the newest releases, followed by Continue Watching and curated categories of movies and TV shows with trailer previews on hover.

<img width="2557" height="1343" alt="Screenshot_12" src="https://github.com/user-attachments/assets/9565f308-05be-49cf-a9b4-a801a353acfa" />


### Search
Full-screen search overlay with filters for Movies, TV Shows, and People.

<img width="2557" height="1342" alt="Screenshot_13" src="https://github.com/user-attachments/assets/44095dbd-fdd5-4e78-8b63-e5c67b9f6960" />


### Player & Subtitle Settings
Clean basic player with customizable subtitles with font, color, size, and shadow options.

<img width="2556" height="1341" alt="Screenshot_14" src="https://github.com/user-attachments/assets/3335cb87-5fee-4083-b883-0280e3e4b80d" />


---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ 
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/goonernator/CineStream.git
   cd cinestream
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure API Keys**
   
   Open `renderer.js` and add your API keys:
   ```javascript
   const TMDB_API_KEY = 'your-tmdb-api-key';
   const OPENSUBTITLES_API_KEY = 'your-opensubtitles-api-key'; // Optional
   ```
   
   - Get a free TMDB API key: [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api)
   - Get an OpenSubtitles API key: [opensubtitles.com/consumers](https://www.opensubtitles.com/consumers)

4. **Run the app**
   ```bash
   npm start
   ```

### Development
```bash
npm run dev  # Run with logging enabled
```

---

## 📦 Building

Build executables for distribution:

```bash
# Windows
npm run build:win

# macOS
npm run build:mac

# Linux
npm run build:linux
```

Output files will be in the `dist` folder:
- **Windows**: Installer (.exe) and Portable version
- **macOS**: DMG file
- **Linux**: AppImage and .deb package

---

## 🛠️ Tech Stack

- **Electron** - Cross-platform desktop framework
- **HLS.js** - HTTP Live Streaming library
- **TMDB API** - Movie and TV show metadata
- **OpenSubtitles API** - Subtitle database
- **electron-builder** - App packaging and distribution

---

## 📁 Project Structure

```
cinestream/
├── main.js          # Electron main process
├── preload.js       # Preload script for IPC
├── renderer.js      # Frontend logic
├── index.html       # Main HTML file
├── styles.css       # Styling
├── assets/
│   ├── icon.png     # App icon (PNG)
│   └── icon.ico     # App icon (Windows)
└── dist/            # Built executables
```

---

## 🔒 Security

- Context isolation enabled
- Node integration disabled
- Content Security Policy configured
- Secure IPC communication
- No tracking or analytics

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- [TMDB](https://www.themoviedb.org/) for the amazing movie database API
- [OpenSubtitles](https://www.opensubtitles.com/) for subtitle support
- [Electron](https://www.electronjs.org/) for making cross-platform apps possible
- [Joshua](https://github.com/barcodebimbo) for supplying me the api backend for the streams!

---

## ⚠️ Disclaimer

This application is for educational purposes only. Please respect copyright laws and only stream content you have the right to access.

---

<p align="center">Made with ❤️ using Electron</p>
