# Asset Atlas

A visual, searchable, taggable browser for all Foundry VTT assets with tools for organization and cleanup.

## 🚀 Quick Start

**New to Asset Atlas?** Start here: [QUICK_START.md](QUICK_START.md)

**Ready to deploy?** Follow: [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)

## Features

- Visual asset browser with thumbnails
- Search and filter by name, type, tags, and size
- Custom tagging system for organization
- Asset usage tracking across scenes, journals, and actors
- Non-destructive operations
- Fast performance with caching and incremental scanning
- FilePicker integration
- Bulk operations and cleanup tools

## 📚 Documentation

### For Users
- **[QUICK_START.md](QUICK_START.md)** - Get started in 5 minutes
- **[DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)** - Detailed installation and configuration
- **[TESTING_GUIDE.md](TESTING_GUIDE.md)** - How to test the module

### For Developers
- **[QUICK_REFERENCE.md](QUICK_REFERENCE.md)** - Code overview and API reference
- **[IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md)** - Current development status
- **[PROJECT_SUMMARY.md](PROJECT_SUMMARY.md)** - Technical overview and statistics
- **[COMPLETION_SUMMARY.md](COMPLETION_SUMMARY.md)** - Development completion summary

### For Contributors
- **[.kiro/specs/asset-atlas/requirements.md](.kiro/specs/asset-atlas/requirements.md)** - Requirements specification
- **[.kiro/specs/asset-atlas/design.md](.kiro/specs/asset-atlas/design.md)** - Design document with architecture
- **[.kiro/specs/asset-atlas/tasks.md](.kiro/specs/asset-atlas/tasks.md)** - Implementation task list
- **[FOUNDRY_DEPLOYMENT_CHECKLIST.md](FOUNDRY_DEPLOYMENT_CHECKLIST.md)** - Deployment checklist

## Development

### Setup

```bash
npm install
```

### Build

```bash
npm run build
```

### Watch Mode

```bash
npm run watch
```

### Testing

```bash
npm test
```

### Current Status

- ✅ **87% Complete** - Core functionality implemented and tested
- ✅ **50 Tests Passing** - Comprehensive test coverage
- ✅ **13 Properties Validated** - Property-based testing with fast-check
- ✅ **Build Success** - No TypeScript errors or warnings
- 🔄 **Remaining Work** - Requires Foundry runtime for completion

See [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) for detailed progress.

## Installation

### Quick Install

1. Copy or link this module to your Foundry VTT `Data/modules` directory
2. Enable "Asset Atlas" in your world's module settings
3. Look for the "Asset Atlas" button in the controls panel

### Detailed Instructions

See [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) for step-by-step installation instructions.

## Usage

### Opening Asset Browser

Click the "Asset Atlas" button in the controls panel, or run in console:

```javascript
AssetAtlas.ui().render(true);
```

### Basic Operations

- **Search**: Type in the search bar to filter assets by name
- **Filter**: Use type, tag, size, and usage filters
- **Select**: Click assets to select, Ctrl+Click for multi-select
- **Tag**: Select assets and use bulk tag operations
- **Details**: Double-click an asset to view details

### Debug API

Access module components in the browser console:

```javascript
AssetAtlas.cache()       // Asset cache
AssetAtlas.tagManager()  // Tag manager
AssetAtlas.scanner()     // Asset scanner
AssetAtlas.tracker()     // Usage tracker
AssetAtlas.ui()          // Browser UI
```

See [TESTING_GUIDE.md](TESTING_GUIDE.md) for more examples.

## Architecture

Asset Atlas follows a clean, modular architecture:

- **Data Layer**: AssetCache and TagManager with IndexedDB persistence
- **Business Logic**: AssetScanner and UsageTracker for asset management
- **UI Layer**: AssetBrowserUI with responsive design
- **Integration**: Foundry VTT hooks and settings

See [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md) for technical details.

## Contributing

Contributions are welcome! Please:

1. Review [.kiro/specs/asset-atlas/tasks.md](.kiro/specs/asset-atlas/tasks.md) for remaining work
2. Follow the spec-driven development approach
3. Write tests for new functionality
4. Update documentation as needed

## License

TBD
