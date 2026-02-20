/**
 * Asset Atlas - Main module entry point
 * A visual, searchable, taggable browser for all Foundry assets
 */

import { AssetCache } from './AssetCache';
import { TagManager } from './TagManager';
import { AssetScanner } from './AssetScanner';
import { UsageTracker } from './UsageTracker';
import { AssetBrowserUI } from './AssetBrowserUI';
import { SettingsDialog } from './SettingsDialog';
import { FilePickerIntegration } from './FilePickerIntegration';
import { AssetAtlasFolder } from './AssetAtlasFolder';

// Module state
let assetCache: AssetCache;
let tagManager: TagManager;
let assetScanner: AssetScanner;
let usageTracker: UsageTracker;
let browserUI: AssetBrowserUI;
let filePickerIntegration: FilePickerIntegration;

/**
 * Initialize the module
 */
Hooks.once('init', async () => {
  console.log('Asset Atlas | Initializing module...');

  // Register Handlebars helpers
  Handlebars.registerHelper('formatBytes', function(bytes: number) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  });

  Handlebars.registerHelper('eq', function(a: any, b: any) {
    return a === b;
  });

  Handlebars.registerHelper('gt', function(a: any, b: any) {
    return a > b;
  });

  Handlebars.registerHelper('multiply', function(a: number, b: number) {
    return a * b;
  });

  Handlebars.registerHelper('decodeURI', function(str: string) {
    if (!str) return '';
    try {
      return decodeURIComponent(str);
    } catch (e) {
      return str;
    }
  });

  // Register module settings
  game.settings.register('asset-atlas', 'watchedDirectories', {
    name: 'Watched Directories',
    hint: 'Directories to scan for assets (comma-separated)',
    scope: 'world',
    config: true,
    type: String,
    default: 'asset-atlas/library,asset-atlas/worlds,worlds,modules,systems',
    onChange: (value: string) => {
      console.log('Asset Atlas | Watched directories changed:', value);
    }
  });

  game.settings.register('asset-atlas', 'excludedDirectories', {
    name: 'Excluded Directories',
    hint: 'Directories to exclude from scanning (comma-separated)',
    scope: 'world',
    config: true,
    type: String,
    default: '',
    onChange: (value: string) => {
      console.log('Asset Atlas | Excluded directories changed:', value);
    }
  });

  game.settings.register('asset-atlas', 'thumbnailSize', {
    name: 'Thumbnail Size',
    hint: 'Size of asset thumbnails',
    scope: 'client',
    config: true,
    type: String,
    choices: {
      small: 'Small',
      medium: 'Medium',
      large: 'Large'
    },
    default: 'medium'
  });

  game.settings.register('asset-atlas', 'theme', {
    name: 'Theme',
    hint: 'Visual theme for the Asset Atlas interface (requires reload)',
    scope: 'client',
    config: true,
    type: String,
    choices: {
      arcane: 'Arcane (D&D Style)',
      infernal: 'Infernal Red',
      druidic: 'Druidic Green',
      astral: 'Astral Blue',
      dark: 'Dark',
      light: 'Light',
      foundry: 'Foundry Default'
    },
    default: 'arcane',
    onChange: (value: string) => {
      console.log('Asset Atlas | Theme changed:', value);
      // Reload the world to apply the new theme
      window.location.reload();
    }
  });

  game.settings.register('asset-atlas', 'autoScanInterval', {
    name: 'Auto-Scan Interval',
    hint: 'Minutes between automatic scans (0 = disabled)',
    scope: 'world',
    config: true,
    type: Number,
    default: 0
  });

  game.settings.register('asset-atlas', 'folderTreeState', {
    name: 'Folder Tree State',
    hint: 'Persisted state of folder tree (expanded folders, selected folder)',
    scope: 'client',
    config: false,
    type: String,
    default: '{}'
  });

  game.settings.register('asset-atlas', 'assetsPerPage', {
    name: 'Assets Per Page',
    hint: 'Number of assets to display per page',
    scope: 'client',
    config: true,
    type: Number,
    default: 100,
    range: {
      min: 20,
      max: 500,
      step: 20
    }
  });

  game.settings.register('asset-atlas', 'showSidebarButton', {
    name: 'Show Sidebar Button',
    hint: 'Display Asset Atlas button in Token controls',
    scope: 'client',
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register('asset-atlas', 'enableFilePickerIntegration', {
    name: 'Enable FilePicker Integration',
    hint: 'Integrate Asset Atlas into Foundry\'s file picker dialogs',
    scope: 'client',
    config: true,
    type: Boolean,
    default: true
  });

  // Register keybinding
  game.keybindings.register('asset-atlas', 'toggleBrowser', {
    name: 'Toggle Asset Browser',
    hint: 'Open or close the Asset Atlas browser',
    editable: [
      {
        key: 'Backquote'
      }
    ],
    onDown: () => {
      console.log('Asset Atlas | Keybind triggered');
      
      try {
        if (!browserUI && assetCache && tagManager && usageTracker) {
          console.log('Asset Atlas | Creating new AssetBrowserUI');
          browserUI = new AssetBrowserUI(assetCache, tagManager, usageTracker);
          if (assetScanner) {
            browserUI.setScanner(assetScanner);
          }
        }
        
        if (browserUI) {
          // Toggle: if already rendered, close it; otherwise open it
          if (browserUI.rendered) {
            console.log('Asset Atlas | Closing browser');
            browserUI.close();
          } else {
            console.log('Asset Atlas | Opening browser');
            browserUI.render(true);
          }
        } else {
          console.error('Asset Atlas | Browser UI not initialized');
          ui.notifications?.error('Asset Atlas not ready. Please wait for initialization.');
        }
      } catch (error) {
        console.error('Asset Atlas | Error:', error);
        ui.notifications?.error('Failed to toggle Asset Atlas. Check console.');
      }
      
      return true; // Prevent default browser behavior
    },
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL
  });

  console.log('Asset Atlas | Settings and keybindings registered');
});

/**
 * Setup the module after Foundry is ready
 */
Hooks.once('ready', async () => {
  console.log('Asset Atlas | Setting up module...');

  try {
    // Initialize components with error handling
    try {
      assetCache = new AssetCache();
      await assetCache.initialize();
      console.log('Asset Atlas | Asset cache initialized');
    } catch (error) {
      console.error('Asset Atlas | Failed to initialize asset cache:', error);
      ui.notifications?.error('Asset Atlas: Failed to initialize asset cache. Some features may not work.');
      // Continue with degraded functionality
    }

    try {
      tagManager = new TagManager();
      await tagManager.initialize();
      console.log('Asset Atlas | Tag manager initialized');
    } catch (error) {
      console.error('Asset Atlas | Failed to initialize tag manager:', error);
      ui.notifications?.error('Asset Atlas: Failed to initialize tag manager. Tagging features will not work.');
      // Continue with degraded functionality
    }

    // Only initialize scanner and tracker if cache is available
    if (assetCache) {
      assetScanner = new AssetScanner(assetCache);
      usageTracker = new UsageTracker(assetCache);
    } else {
      console.error('Asset Atlas | Cannot initialize scanner/tracker without cache');
      ui.notifications?.error('Asset Atlas: Core features unavailable due to initialization failure.');
      return;
    }

    // Initialize FilePicker integration with error handling
    try {
      const enableFilePicker = game.settings.get('asset-atlas', 'enableFilePickerIntegration') as boolean;
      
      if (enableFilePicker && tagManager && usageTracker) {
        filePickerIntegration = new FilePickerIntegration(assetCache, tagManager, usageTracker);
        filePickerIntegration.registerHooks();
        console.log('Asset Atlas | FilePicker integration initialized');
      } else if (!enableFilePicker) {
        console.log('Asset Atlas | FilePicker integration disabled by user setting');
      }
    } catch (error) {
      console.error('Asset Atlas | Failed to initialize FilePicker integration:', error);
      ui.notifications?.warn('Asset Atlas: FilePicker integration unavailable.');
      // Continue without FilePicker integration
    }

    // Initialize Asset Atlas folder structure
    const folderManager = new AssetAtlasFolder();
    const currentWorldName = (game as any).world?.id || (game as any).world?.name || 'default';
    
    console.log('Asset Atlas | Initializing folder structure...');
    const folderResult = await folderManager.initializeFolders(currentWorldName);
    
    if (folderResult.created.length > 0) {
      console.log(`Asset Atlas | Created ${folderResult.created.length} new directories`);
      ui.notifications?.info(`Asset Atlas: Created ${folderResult.created.length} new directories`);
    }
    if (folderResult.existing.length > 0) {
      console.log(`Asset Atlas | Found ${folderResult.existing.length} existing directories`);
    }
    if (folderResult.errors.length > 0) {
      console.warn(`Asset Atlas | ${folderResult.errors.length} errors during folder creation:`, folderResult.errors);
      ui.notifications?.warn(`Asset Atlas: ${folderResult.errors.length} errors creating directories. Check console for details.`);
    }

    // Apply excluded directories setting to scanner
    const excludedDirs = game.settings.get('asset-atlas', 'excludedDirectories') as string;
    const excludedDirsArray = excludedDirs ? excludedDirs.split(',').map(d => d.trim()).filter(d => d) : [];
    assetScanner.setExcludedDirectories(excludedDirsArray);

    console.log('Asset Atlas | Components initialized');

    // Check if we need to perform initial scan
    const cachedAssets = await assetCache.searchAssets({ limit: 1 });
    const needsInitialScan = cachedAssets.length === 0;

    if (needsInitialScan) {
      // Perform initial scan only if cache is empty
      const watchedDirsStr = game.settings.get('asset-atlas', 'watchedDirectories') as string;
      const watchedDirs = watchedDirsStr ? watchedDirsStr.split(',').map(d => d.trim()).filter(d => d) : [];
      
      if (watchedDirs.length > 0) {
        console.log('Asset Atlas | Cache is empty, starting initial scan of:', watchedDirs);
        ui.notifications?.info('Asset Atlas: Scanning for assets (this may take a moment)...');
        
        const result = await assetScanner.scan(watchedDirs, true);
        console.log('Asset Atlas | Initial scan complete:', result);
        
        if (result.assetsAdded > 0) {
          ui.notifications?.info(`Asset Atlas: Found ${result.assetsAdded} new assets`);
        }
      }
    } else {
      console.log('Asset Atlas | Using cached assets, skipping initial scan');
      ui.notifications?.info('Asset Atlas: Loaded from cache');
    }

    // Set up auto-scan interval
    const autoScanInterval = game.settings.get('asset-atlas', 'autoScanInterval') as number;
    if (autoScanInterval > 0) {
      setInterval(async () => {
        console.log('Asset Atlas | Running automatic scan...');
        const watchedDirsStr = game.settings.get('asset-atlas', 'watchedDirectories') as string;
        const watchedDirs = watchedDirsStr ? watchedDirsStr.split(',').map(d => d.trim()).filter(d => d) : [];
        const result = await assetScanner.scan(watchedDirs, true);
        console.log('Asset Atlas | Automatic scan complete:', result);
      }, autoScanInterval * 60 * 1000);
    }

    // Add settings button to module settings
    Hooks.on('renderSettings', (app: any, html: JQuery) => {
      const moduleSettings = html.find('#settings-game');
      if (moduleSettings.length > 0) {
        const settingsButton = $(`
          <button class="asset-atlas-settings-button">
            <i class="fas fa-atlas"></i> Asset Atlas Settings
          </button>
        `);
        
        settingsButton.on('click', (event: any) => {
          event.preventDefault();
          const currentSettings = {
            watchedDirectories: game.settings.get('asset-atlas', 'watchedDirectories') as string[],
            excludedDirectories: game.settings.get('asset-atlas', 'excludedDirectories') as string[],
            thumbnailSize: game.settings.get('asset-atlas', 'thumbnailSize') as 'small' | 'medium' | 'large',
            autoScanInterval: game.settings.get('asset-atlas', 'autoScanInterval') as number,
            assetsPerPage: game.settings.get('asset-atlas', 'assetsPerPage') as number,
            showSidebarButton: game.settings.get('asset-atlas', 'showSidebarButton') as boolean,
            enableFilePickerIntegration: game.settings.get('asset-atlas', 'enableFilePickerIntegration') as boolean
          };
          
          const dialog = new SettingsDialog(currentSettings);
          dialog.render(true);
        });
        
        moduleSettings.append(settingsButton);
      }
    });

    console.log('Asset Atlas | Module ready');
    
    // Send welcome message to chat
    const welcomeMessage = `
      <div style="
        background: linear-gradient(135deg, #2A1F3D 0%, #3A2A55 100%);
        border: 2px solid #C0A97A;
        border-radius: 8px;
        padding: 1rem;
        margin: 0.5rem 0;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
        font-family: 'Crimson Pro', Georgia, serif;
        color: #E6E1D5;
      ">
        <h3 style="
          margin: 0 0 0.75rem 0;
          font-family: 'Cinzel Decorative', serif;
          color: #C0A97A;
          text-shadow: 0 0 8px rgba(192, 169, 122, 0.3);
          font-size: 1.3rem;
          text-align: center;
        ">
          <i class="fas fa-atlas" style="margin-right: 0.5rem;"></i>
          Sublymes Asset Atlas
        </h3>
        <p style="margin: 0.5rem 0; line-height: 1.6;">
          <strong style="color: #A67CFF;">Welcome!</strong> Asset Atlas is now ready to help you manage your Foundry VTT assets.
        </p>
        <div style="
          background: rgba(15, 14, 14, 0.5);
          border-left: 3px solid #A67CFF;
          padding: 0.75rem;
          margin: 0.75rem 0;
          border-radius: 4px;
        ">
          <p style="margin: 0.25rem 0; font-size: 0.95rem;"><strong style="color: #C0A97A;">Quick Start:</strong></p>
          <ul style="margin: 0.5rem 0; padding-left: 1.5rem; font-size: 0.9rem;">
            <li>Press <code style="background: rgba(166, 124, 255, 0.2); padding: 0.2rem 0.4rem; border-radius: 3px; font-family: monospace;">~</code> (tilde/backtick) to open the browser</li>
            <li>Or click the <i class="fas fa-atlas"></i> button in the Tiles controls</li>
            <li>Browse folders in the sidebar, search by name, or filter by type/tags</li>
            <li>Drag assets directly onto your canvas to place them</li>
            <li>Right-click assets for more options (rename, move, delete, etc.)</li>
            <li>Use the <i class="fas fa-file-import"></i> Import button to add new assets</li>
          </ul>
        </div>
        <p style="margin: 0.5rem 0 0 0; font-size: 0.85rem; text-align: center; color: #AFA89A;">
          <em>Tip: Select multiple assets with Ctrl+Click or Shift+Click, then drag them all at once!</em>
        </p>
      </div>
    `;
    
    ChatMessage.create({
      content: welcomeMessage,
      whisper: [game.user.id]
    });
    
    ui.notifications?.info('Asset Atlas is ready!');
  } catch (error) {
    console.error('Asset Atlas | Initialization error:', error);
    ui.notifications?.error('Asset Atlas failed to initialize. Check console for details.');
  }
});

/**
 * Add Asset Atlas button to scene controls
 * This hook is called whenever the scene controls are rendered
 */
Hooks.on('getSceneControlButtons', (controls: any) => {
  console.log('Asset Atlas | getSceneControlButtons hook fired');
  console.log('Asset Atlas | Controls:', controls);
  console.log('Asset Atlas | Controls type:', typeof controls, 'isArray:', Array.isArray(controls));
  
  // Check if sidebar button is enabled
  const showButton = game.settings.get('asset-atlas', 'showSidebarButton') as boolean;
  console.log('Asset Atlas | Show button setting:', showButton);
  
  if (!showButton) {
    console.log('Asset Atlas | Button disabled in settings, skipping');
    return;
  }
  
  // In Foundry v13, controls might be an object or array depending on the hook context
  // Convert to array if it's an object
  let controlsArray: any[];
  if (!Array.isArray(controls)) {
    console.log('Asset Atlas | Controls is an object, converting to array');
    controlsArray = Object.values(controls);
  } else {
    controlsArray = controls;
  }
  
  console.log('Asset Atlas | Control groups:', controlsArray.map((c: any) => c?.name));
  
  // Find the tiles control group
  const tilesControls = controlsArray.find((c: any) => c && c.name === 'tiles');
  
  if (!tilesControls) {
    console.warn('Asset Atlas | Tiles controls not found. Available groups:', controlsArray.map((c: any) => c?.name));
    return;
  }
  
  console.log('Asset Atlas | Found tiles controls:', tilesControls);
  console.log('Asset Atlas | Tiles tools:', tilesControls.tools);
  console.log('Asset Atlas | Tools type:', typeof tilesControls.tools, 'isArray:', Array.isArray(tilesControls.tools));
  
  // Ensure tools exists - it should be an object in v13
  if (!tilesControls.tools) {
    console.log('Asset Atlas | Creating tools object');
    tilesControls.tools = {};
  }
  
  // Check if button already exists
  if (Array.isArray(tilesControls.tools)) {
    // Array format (older Foundry?)
    if (tilesControls.tools.some((t: any) => t.name === 'asset-atlas')) {
      console.log('Asset Atlas | Button already exists, skipping');
      return;
    }
  } else {
    // Object format (v13)
    if (tilesControls.tools['asset-atlas']) {
      console.log('Asset Atlas | Button already exists, skipping');
      return;
    }
  }
  
  // Create the button tool
  const assetAtlasTool = {
    name: 'asset-atlas',
    title: 'Asset Atlas',
    icon: 'fas fa-atlas',
    button: true, // This makes it always visible, not a toggle tool
    onChange: () => {
      console.log('Asset Atlas | Button clicked!');
      
      try {
        if (!browserUI && assetCache && tagManager && usageTracker) {
          console.log('Asset Atlas | Creating new AssetBrowserUI');
          browserUI = new AssetBrowserUI(assetCache, tagManager, usageTracker);
          if (assetScanner) {
            browserUI.setScanner(assetScanner);
          }
        }
        
        if (browserUI) {
          console.log('Asset Atlas | Rendering browser');
          browserUI.render(true);
        } else {
          console.error('Asset Atlas | Browser UI not initialized');
          ui.notifications?.error('Asset Atlas not ready. Please wait for initialization.');
        }
      } catch (error) {
        console.error('Asset Atlas | Error:', error);
        ui.notifications?.error('Failed to open Asset Atlas. Check console.');
      }
    }
  };
  
  // Add the tool - handle both array and object formats
  if (Array.isArray(tilesControls.tools)) {
    // Array format (older Foundry?)
    tilesControls.tools.unshift(assetAtlasTool);
    console.log('Asset Atlas | Button added to array. Tools count:', tilesControls.tools.length);
  } else {
    // Object format (v13)
    tilesControls.tools['asset-atlas'] = assetAtlasTool;
    console.log('Asset Atlas | Button added to object. Tool keys:', Object.keys(tilesControls.tools));
  }
});

/**
 * Track document updates for usage tracking
 */
Hooks.on('updateScene', async (scene: any, changes: any, options: any, userId: string) => {
  if (usageTracker && assetCache) {
    // Scan updated scene for asset references
    const usageMap = await usageTracker.scanAllDocuments();
    
    // Update cache with new usage information
    for (const [path, usage] of usageMap.entries()) {
      await assetCache.updateUsage(path, usage);
    }
  }
});

Hooks.on('updateJournalEntry', async (journal: any, changes: any, options: any, userId: string) => {
  if (usageTracker && assetCache) {
    const usageMap = await usageTracker.scanAllDocuments();
    for (const [path, usage] of usageMap.entries()) {
      await assetCache.updateUsage(path, usage);
    }
  }
});

Hooks.on('updateActor', async (actor: any, changes: any, options: any, userId: string) => {
  if (usageTracker && assetCache) {
    const usageMap = await usageTracker.scanAllDocuments();
    for (const [path, usage] of usageMap.entries()) {
      await assetCache.updateUsage(path, usage);
    }
  }
});

/**
 * Handle canvas drop events for Asset Atlas assets
 */
Hooks.on('dropCanvasData', async (canvas: any, data: any) => {
  console.log('Asset Atlas | Canvas drop detected:', data);
  console.log('Asset Atlas | Drop data type:', data.type);
  
  // Check if this is a multi-asset drop
  if (data.type === 'MultiAsset' && Array.isArray(data.assets)) {
    console.log(`Asset Atlas | Dropping ${data.assets.length} assets`);
    
    // Get the drop position - use canvas center as fallback
    let dropPosition = { x: 0, y: 0 };
    
    try {
      // Try to get the current mouse position from canvas
      if (canvas.mousePosition) {
        dropPosition = canvas.mousePosition;
      } else if (canvas.app?.renderer?.plugins?.interaction?.mouse?.global) {
        const globalPos = canvas.app.renderer.plugins.interaction.mouse.global;
        dropPosition = canvas.canvasCoordinatesFromClient({ x: globalPos.x, y: globalPos.y });
      } else {
        // Fallback to center of viewport
        const viewBounds = canvas.scene.dimensions;
        dropPosition = {
          x: viewBounds.width / 2,
          y: viewBounds.height / 2
        };
      }
    } catch (error) {
      console.warn('Asset Atlas | Could not determine drop position, using scene center:', error);
      const viewBounds = canvas.scene.dimensions;
      dropPosition = {
        x: viewBounds.width / 2,
        y: viewBounds.height / 2
      };
    }
    
    console.log('Asset Atlas | Drop position:', dropPosition);
    
    const gridSize = canvas.scene.grid.size || 100;
    const diagonalOffset = gridSize * 0.5; // Offset for diagonal staggering
    
    let successCount = 0;
    let failCount = 0;
    
    for (let i = 0; i < data.assets.length; i++) {
      const assetData = data.assets[i];
      
      try {
        if (assetData.type === 'Tile' && assetData.texture?.src) {
          // Load image to get dimensions
          const img = new Image();
          img.src = assetData.texture.src;
          
          await new Promise((resolve) => {
            img.onload = resolve;
            img.onerror = resolve;
          });
          
          const tileWidth = img.width || gridSize * 2;
          const tileHeight = img.height || gridSize * 2;
          
          // Calculate diagonal stagger position from drop point
          const offsetX = i * diagonalOffset;
          const offsetY = i * diagonalOffset;
          
          // Create tile document data
          const tileData = {
            texture: {
              src: assetData.texture.src
            },
            width: tileWidth,
            height: tileHeight,
            x: dropPosition.x - (tileWidth / 2) + offsetX,
            y: dropPosition.y - (tileHeight / 2) + offsetY,
            z: 100 + i,
            rotation: 0,
            alpha: 1,
            hidden: false,
            locked: false,
            overhead: false,
            roof: false,
            occlusion: {
              mode: 0,
              alpha: 0
            }
          };
          
          // Add video properties if it's a video
          if (assetData.video) {
            (tileData.texture as any).video = assetData.video;
          }
          
          console.log('Asset Atlas | Creating tile at:', { x: tileData.x, y: tileData.y });
          await canvas.scene.createEmbeddedDocuments('Tile', [tileData]);
          successCount++;
        } else if (assetData.type === 'AmbientSound' && assetData.path) {
          // Handle audio drop with diagonal stagger
          const offsetX = i * diagonalOffset;
          const offsetY = i * diagonalOffset;
          
          const soundData = {
            x: dropPosition.x + offsetX,
            y: dropPosition.y + offsetY,
            path: assetData.path,
            radius: assetData.radius || 10,
            volume: assetData.volume || 0.5,
            easing: true,
            walls: true,
            hidden: false
          };
          
          await canvas.scene.createEmbeddedDocuments('AmbientSound', [soundData]);
          successCount++;
        }
      } catch (error) {
        console.error('Asset Atlas | Failed to create asset:', error);
        failCount++;
      }
    }
    
    if (successCount > 0) {
      ui.notifications?.info(`Created ${successCount} asset(s)${failCount > 0 ? ` (${failCount} failed)` : ''}`);
    } else {
      ui.notifications?.error('Failed to create assets');
    }
    
    return false; // Prevent default handling
  }
  
  // Check if this is a single Asset Atlas drop
  if (data.type === 'Tile' && data.texture?.src) {
    // Handle image/video tile drop
    const dropPosition = canvas.canvasCoordinatesFromClient({ x: data.x || 0, y: data.y || 0 });
    
    // Get image dimensions to size the tile appropriately
    const img = new Image();
    img.src = data.texture.src;
    
    await new Promise((resolve) => {
      img.onload = resolve;
      img.onerror = resolve;
    });
    
    const gridSize = canvas.scene.grid.size || 100;
    const tileWidth = img.width || gridSize * 2;
    const tileHeight = img.height || gridSize * 2;
    
    // Create tile document data
    const tileData = {
      texture: {
        src: data.texture.src
      },
      width: tileWidth,
      height: tileHeight,
      x: dropPosition.x - (tileWidth / 2),
      y: dropPosition.y - (tileHeight / 2),
      z: 100,
      rotation: 0,
      alpha: 1,
      hidden: false,
      locked: false,
      overhead: false,
      roof: false,
      occlusion: {
        mode: 0,
        alpha: 0
      }
    };
    
    // Add video properties if it's a video
    if (data.video) {
      (tileData.texture as any).video = data.video;
    }
    
    console.log('Asset Atlas | Creating tile:', tileData);
    
    try {
      const tile = await canvas.scene.createEmbeddedDocuments('Tile', [tileData]);
      ui.notifications?.info(`Created tile: ${data.name || 'Asset'}`);
      console.log('Asset Atlas | Tile created:', tile);
      return false; // Prevent default handling
    } catch (error) {
      console.error('Asset Atlas | Failed to create tile:', error);
      ui.notifications?.error('Failed to create tile from asset');
    }
  } else if (data.type === 'AmbientSound' && data.path) {
    // Handle audio drop
    const dropPosition = canvas.canvasCoordinatesFromClient({ x: data.x || 0, y: data.y || 0 });
    
    const soundData = {
      x: dropPosition.x,
      y: dropPosition.y,
      path: data.path,
      radius: data.radius || 10,
      volume: data.volume || 0.5,
      easing: true,
      walls: true,
      hidden: false
    };
    
    console.log('Asset Atlas | Creating ambient sound:', soundData);
    
    try {
      const sound = await canvas.scene.createEmbeddedDocuments('AmbientSound', [soundData]);
      ui.notifications?.info(`Created ambient sound: ${data.name || 'Audio'}`);
      console.log('Asset Atlas | Ambient sound created:', sound);
      return false; // Prevent default handling
    } catch (error) {
      console.error('Asset Atlas | Failed to create ambient sound:', error);
      ui.notifications?.error('Failed to create ambient sound from asset');
    }
  }
  
  // Let Foundry handle other drop types
  return true;
});

// Export for debugging
(window as any).AssetAtlas = {
  cache: () => assetCache,
  tagManager: () => tagManager,
  scanner: () => assetScanner,
  tracker: () => usageTracker,
  ui: () => browserUI
};

console.log('Asset Atlas | Module loaded');
