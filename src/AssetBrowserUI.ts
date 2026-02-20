/**
 * Asset Browser UI - Visual interface for browsing and managing assets
 * Extends Foundry VTT's Application class
 */

import { AssetCache } from './AssetCache';
import { TagManager } from './TagManager';
import { UsageTracker } from './UsageTracker';
import { AssetOrganizer } from './AssetOrganizer';
import { AssetAtlasFolder } from './AssetAtlasFolder';
import { AssetImporter } from './AssetImporter';
import { MoveRenameDialog } from './MoveRenameDialog';
import { DeleteConfirmationDialog } from './DeleteConfirmationDialog';
import { DryRunDialog } from './DryRunDialog';
import { ImportDialog } from './ImportDialog';
import { CustomImportDialog } from './CustomImportDialog';
import { FolderTree } from './FolderTree';
import { ImageLoader } from './ImageLoader';
import { SelectionManager } from './SelectionManager';
import { DragDropHandler } from './DragDropHandler';
import { CachedAsset, SearchCriteria, FolderNode } from './types';

export class AssetBrowserUI extends Application {
  private cache: AssetCache;
  private tagManager: TagManager;
  private usageTracker: UsageTracker;
  private organizer: AssetOrganizer;
  private folderManager: AssetAtlasFolder;
  private importer: AssetImporter;
  private folderTree: FolderTree;
  private imageLoader: ImageLoader;
  private selectionManager: SelectionManager;
  private dragDropHandler: DragDropHandler;
  private scanner?: any; // AssetScanner instance
  private currentAssets: CachedAsset[] = [];
  private currentFilters: SearchCriteria = {};
  private currentWorld: string = 'default';
  private filePickerMode: boolean = false;
  private onAssetSelectCallback?: (asset: CachedAsset) => void;
  private currentPage: number = 1;
  private assetsPerPage: number = 100; // Default, will be overridden by settings
  private totalAssets: number = 0;
  private selectedFolderPath: string | null = null;
  private sidebarCollapsed: boolean = false;
  private viewMode: 'grid' | 'list' = 'grid';
  private lastSelectedAssetId: string | null = null;

  // Getter for backward compatibility - delegates to SelectionManager
  private get selectedAssets(): Set<string> {
    return this.selectionManager.getSelectedAssets();
  }

  constructor(
    cache: AssetCache, 
    tagManager: TagManager, 
    usageTracker: UsageTracker,
    options = {}
  ) {
    super(options);
    this.cache = cache;
    this.tagManager = tagManager;
    this.usageTracker = usageTracker;
    this.organizer = new AssetOrganizer(cache, usageTracker);
    this.folderManager = new AssetAtlasFolder();
    this.importer = new AssetImporter(cache, this.folderManager);
    this.folderTree = new FolderTree();
    this.imageLoader = new ImageLoader();
    this.selectionManager = new SelectionManager();
    this.dragDropHandler = new DragDropHandler();
  }

  /**
   * Define default options for the Application
   */
  static get defaultOptions() {
    // Get theme from settings
    let theme = 'arcane';
    try {
      if (typeof game !== 'undefined' && (game as any).settings) {
        theme = (game as any).settings.get('asset-atlas', 'theme') || 'arcane';
      }
    } catch (error) {
      console.warn('Asset Atlas | Could not load theme setting:', error);
    }
    
    return {
      ...super.defaultOptions,
      id: 'asset-atlas-browser',
      template: 'modules/asset-atlas/templates/asset-browser.hbs',
      width: 900,
      height: 700,
      title: 'Sublymes Asset Atlas',
      resizable: true,
      classes: ['asset-atlas', 'asset-browser', `theme-${theme}`],
      tabs: [{ navSelector: '.tabs', contentSelector: '.content', initial: 'assets' }]
    };
  }

  /**
   * Prepare data for rendering
   */
  async getData(): Promise<any> {
    const data = await super.getData();
    
    // Load settings
    await this.loadSettings();
    
    // Load initial assets if not loaded yet
    if (this.currentAssets.length === 0) {
      // Get total count first
      const allAssets = await this.cache.searchAssets(this.currentFilters);
      this.totalAssets = allAssets.length;
      
      // Build folder tree from all assets
      this.folderTree.buildFromAssets(allAssets);
      
      // Restore folder tree state from settings
      await this.restoreFolderTreeState();
      
      // Get paginated assets
      const startIndex = (this.currentPage - 1) * this.assetsPerPage;
      this.currentAssets = allAssets.slice(startIndex, startIndex + this.assetsPerPage);
    }
    
    // Get all tags for filter dropdown
    const allTags = await this.tagManager.getAllTags();
    
    const totalPages = Math.ceil(this.totalAssets / this.assetsPerPage);
    
    // Get flattened folder tree for rendering
    const folderNodes = this.folderTree.getFlattenedNodes();
    
    // Generate breadcrumbs from selected folder path
    const breadcrumbs = this.generateBreadcrumbs(this.selectedFolderPath);
    
    // Get thumbnail size setting
    const thumbnailSize = await this.getThumbnailSize();
    
    return {
      ...data,
      assets: this.currentAssets,
      tags: allTags,
      selectedCount: this.selectionManager.getSelectedCount(),
      filters: this.currentFilters,
      hasAssets: this.totalAssets > 0,
      currentPage: this.currentPage,
      totalPages,
      totalAssets: this.totalAssets,
      showingStart: (this.currentPage - 1) * this.assetsPerPage + 1,
      showingEnd: Math.min(this.currentPage * this.assetsPerPage, this.totalAssets),
      folderNodes,
      selectedFolderPath: this.selectedFolderPath,
      breadcrumbs,
      thumbnailSize
    };
  }

  /**
   * Handle toggle sidebar
   */
  private _onToggleSidebar(event: JQuery.TriggeredEvent): void {
    event.preventDefault();
    this.sidebarCollapsed = !this.sidebarCollapsed;
    
    const sidebar = this.element.find('.folder-tree-sidebar');
    sidebar.toggleClass('collapsed', this.sidebarCollapsed);
  }

  /**
   * Handle toggle view mode (grid/list)
   */
  private _onToggleView(event: JQuery.TriggeredEvent): void {
    event.preventDefault();
    this.viewMode = this.viewMode === 'grid' ? 'list' : 'grid';
    
    const container = this.element.find('.asset-grid-container');
    const button = this.element.find('.toggle-view i');
    
    if (this.viewMode === 'list') {
      container.addClass('view-list');
      button.removeClass('fa-th').addClass('fa-list');
    } else {
      container.removeClass('view-list');
      button.removeClass('fa-list').addClass('fa-th');
    }
  }

  /**
   * Activate event listeners
   */
  activateListeners(html: JQuery): void {
    super.activateListeners(html);

    // Apply theme class to the window element (v13 compatibility)
    try {
      const theme = game.settings.get('asset-atlas', 'theme') as string || 'arcane';
      const windowElement = html.closest('.window-app');
      if (windowElement && windowElement.length > 0) {
        // Remove any existing theme classes
        windowElement.removeClass((index: number, className: string) => {
          return (className.match(/\btheme-\S+/g) || []).join(' ');
        });
        // Add the current theme class
        windowElement.addClass(`theme-${theme}`);
        console.log(`Asset Atlas | Applied theme class: theme-${theme}`);
      }
    } catch (error) {
      console.warn('Asset Atlas | Could not apply theme class:', error);
    }

    // Initialize lazy loading for images
    this.initializeLazyLoading(html);

    // Search input
    html.find('#asset-search').on('input', this._onSearchInput.bind(this));

    // Filter controls
    html.find('.filter-type').on('change', this._onFilterChange.bind(this));
    html.find('.filter-type-compact').on('change', this._onFilterChange.bind(this));
    html.find('.filter-tags').on('change', this._onFilterChange.bind(this));
    html.find('.filter-tags-compact').on('change', this._onFilterChange.bind(this));
    html.find('.filter-size-min').on('input', this._onFilterChange.bind(this));
    html.find('.filter-size-max').on('input', this._onFilterChange.bind(this));
    html.find('.filter-unused').on('change', this._onFilterChange.bind(this));

    // Folder tree interactions
    html.find('.folder-node').on('click', this._onFolderClick.bind(this));
    html.find('.folder-toggle').on('click', this._onFolderToggle.bind(this));
    html.find('.folder-node').on('contextmenu', this._onFolderContextMenu.bind(this));
    html.find('.clear-folder-filter').on('click', this._onClearFolderFilter.bind(this));
    html.find('.breadcrumb-segment').on('click', this._onBreadcrumbClick.bind(this));
    html.find('.toggle-sidebar').on('click', this._onToggleSidebar.bind(this));

    // Asset selection
    html.find('.asset-thumbnail').on('click', this._onAssetClick.bind(this));
    html.find('.asset-thumbnail').on('dblclick', this._onAssetDoubleClick.bind(this));
    html.find('.asset-thumbnail').on('contextmenu', this._onAssetContextMenu.bind(this));
    
    // Enable drag-and-drop for assets
    this._enableDragDrop(html);

    // Bulk operations
    html.find('.bulk-add-tags').on('click', this._onBulkAddTags.bind(this));
    html.find('.bulk-remove-tags').on('click', this._onBulkRemoveTags.bind(this));
    html.find('.clear-selection').on('click', this._onClearSelection.bind(this));

    // Asset organization
    html.find('.move-asset').on('click', this._onMoveAsset.bind(this));
    html.find('.rename-asset').on('click', this._onRenameAsset.bind(this));
    html.find('.delete-asset').on('click', this._onDeleteAsset.bind(this));
    html.find('.dry-run-delete').on('click', this._onDryRunDelete.bind(this));

    // Import functionality
    html.find('.import-to-world').on('click', this._onImportToWorld.bind(this));
    html.find('.view-library').on('click', this._onViewLibrary.bind(this));
    html.find('.view-world').on('click', this._onViewWorld.bind(this));

    // Refresh button
    html.find('.refresh-assets').on('click', this._onRefresh.bind(this));
    
    // Import to Atlas button
    html.find('.import-to-atlas').on('click', this._onImportToAtlas.bind(this));
    
    // View toggle button
    html.find('.toggle-view').on('click', this._onToggleView.bind(this));
    
    // Pagination
    html.find('.page-first').on('click', () => this.goToPage(1));
    html.find('.page-prev').on('click', () => this.goToPage(this.currentPage - 1));
    html.find('.page-next').on('click', () => this.goToPage(this.currentPage + 1));
    html.find('.page-last').on('click', async () => {
      const data = await this.getData();
      this.goToPage(data.totalPages);
    });
  }

  /**
   * Handle search input with debouncing
   */
  private _onSearchInput(event: JQuery.TriggeredEvent): void {
    const query = $(event.currentTarget).val() as string;
    
    // Debounce search
    if (this._searchTimeout) {
      clearTimeout(this._searchTimeout);
    }
    
    this._searchTimeout = setTimeout(() => {
      this.currentFilters.query = query;
      this.updateAssetDisplay();
    }, 300);
  }
  private _searchTimeout?: NodeJS.Timeout;

  /**
   * Handle filter changes
   */
  private async _onFilterChange(event: JQuery.TriggeredEvent): Promise<void> {
    const html = this.element;
    
    // Collect type filters from both old checkboxes and new compact select
    const typeCheckboxes = html.find('.filter-type:checked').map((i, el) => $(el).val()).get() as string[];
    const typeCompact = html.find('.filter-type-compact').val() as string[] || [];
    const typeFilters = [...typeCheckboxes, ...typeCompact].filter((v, i, a) => a.indexOf(v) === i);
    
    // Collect tag filters from both old and new selects
    const tagFiltersOld = html.find('.filter-tags').val() as string[] || [];
    const tagFiltersNew = html.find('.filter-tags-compact').val() as string[] || [];
    const tagFilters = [...tagFiltersOld, ...tagFiltersNew].filter((v, i, a) => a.indexOf(v) === i);
    
    const minSize = parseInt(html.find('.filter-size-min').val() as string) || undefined;
    const maxSize = parseInt(html.find('.filter-size-max').val() as string) || undefined;
    const unusedOnly = html.find('.filter-unused').is(':checked');

    this.currentFilters = {
      types: typeFilters.length > 0 ? typeFilters as any : undefined,
      tags: tagFilters,
      minSize,
      maxSize,
      unusedOnly
    };

    await this.updateAssetDisplay();
  }

  /**
   * Handle asset click (selection)
   */
  private _onAssetClick(event: JQuery.TriggeredEvent): void {
    event.preventDefault();
    const assetId = $(event.currentTarget).data('asset-id');
    
    // In FilePicker mode, select the asset and call callback
    if (this.filePickerMode && this.onAssetSelectCallback) {
      const asset = this.currentAssets.find(a => a.id === assetId);
      if (asset) {
        this.onAssetSelectCallback(asset);
        return;
      }
    }
    
    // Normal mode: File Explorer-style selection
    // Get the original mouse event for modifier keys
    const originalEvent = (event as any).originalEvent as MouseEvent;
    const ctrlKey = originalEvent.ctrlKey || originalEvent.metaKey; // Ctrl on Windows/Linux, Cmd on Mac
    const shiftKey = originalEvent.shiftKey;
    
    if (shiftKey && this.lastSelectedAssetId) {
      // Shift-click: Select range from last selected to current
      this.selectRange(this.lastSelectedAssetId, assetId);
    } else if (ctrlKey) {
      // Ctrl-click: Toggle individual selection
      this.toggleAssetSelection(assetId);
    } else {
      // Normal click: Select only this asset (deselect others)
      this.selectSingleAsset(assetId);
    }
    
    this.lastSelectedAssetId = assetId;
    this.updateSelectionUI();
  }

  /**
   * Select a single asset (deselect all others)
   */
  private selectSingleAsset(assetId: string): void {
    this.selectedAssets.clear();
    this.selectedAssets.add(assetId);
  }

  /**
   * Toggle selection of a single asset
   */
  private toggleAssetSelection(assetId: string): void {
    if (this.selectedAssets.has(assetId)) {
      this.selectedAssets.delete(assetId);
    } else {
      this.selectedAssets.add(assetId);
    }
  }

  /**
   * Select a range of assets from startId to endId
   */
  private selectRange(startId: string, endId: string): void {
    const startIndex = this.currentAssets.findIndex(a => a.id === startId);
    const endIndex = this.currentAssets.findIndex(a => a.id === endId);
    
    if (startIndex === -1 || endIndex === -1) return;
    
    const minIndex = Math.min(startIndex, endIndex);
    const maxIndex = Math.max(startIndex, endIndex);
    
    // Clear current selection and select the range
    this.selectedAssets.clear();
    for (let i = minIndex; i <= maxIndex; i++) {
      this.selectedAssets.add(this.currentAssets[i].id);
    }
  }

  /**
   * Update the UI to reflect current selection
   */
  private updateSelectionUI(): void {
    const html = this.element;
    
    // Update all thumbnails
    html.find('.asset-thumbnail').each((_index: number, element: Element) => {
      const $element = $(element);
      const assetId = $element.data('asset-id');
      $element.toggleClass('selected', this.selectedAssets.has(assetId));
    });
    
    // Update selection count
    html.find('.selected-count').text(this.selectedAssets.size.toString());
    
    // Show/hide selection info bar
    if (this.selectedAssets.size > 0) {
      html.find('.selection-info').show();
    } else {
      html.find('.selection-info').hide();
    }
  }

  /**
   * Handle asset double-click (show details)
   */
  private _onAssetDoubleClick(event: JQuery.TriggeredEvent): void {
    event.preventDefault();
    const assetId = $(event.currentTarget).data('asset-id');
    this.showAssetDetails(assetId);
  }

  /**
   * Handle asset context menu (right-click)
   */
  private _onAssetContextMenu(event: JQuery.TriggeredEvent): void {
    event.preventDefault();
    event.stopPropagation();
    
    const assetId = $(event.currentTarget).data('asset-id');
    const asset = this.currentAssets.find(a => a.id === assetId);
    
    if (!asset) return;
    
    // Get the original mouse event
    const originalEvent = (event as any).originalEvent as MouseEvent;
    
    // Create context menu
    const menu = document.createElement('div');
    menu.className = 'asset-context-menu';
    menu.style.position = 'fixed';
    menu.style.left = `${originalEvent.clientX}px`;
    menu.style.top = `${originalEvent.clientY}px`;
    menu.style.zIndex = '10000';
    
    // Copy Path option
    const copyPathOption = document.createElement('div');
    copyPathOption.className = 'context-menu-item';
    copyPathOption.innerHTML = '<i class="fas fa-copy"></i> Copy Path';
    copyPathOption.onclick = () => {
      navigator.clipboard.writeText(asset.path);
      ui.notifications?.info(`Copied path: ${asset.path}`);
      document.body.removeChild(menu);
    };
    
    // View Details option
    const viewDetailsOption = document.createElement('div');
    viewDetailsOption.className = 'context-menu-item';
    viewDetailsOption.innerHTML = '<i class="fas fa-info-circle"></i> View Details';
    viewDetailsOption.onclick = () => {
      this.showAssetDetails(assetId);
      document.body.removeChild(menu);
    };
    
    // Add to Scene option (for images)
    // Check if we have multiple selected assets or just this one
    const hasMultipleSelected = this.selectedAssets.size > 1 && this.selectedAssets.has(assetId);
    const assetsToAdd = hasMultipleSelected 
      ? this.currentAssets.filter(a => this.selectedAssets.has(a.id) && a.type === 'image')
      : (asset.type === 'image' ? [asset] : []);
    
    if (assetsToAdd.length > 0) {
      const addToSceneOption = document.createElement('div');
      addToSceneOption.className = 'context-menu-item';
      addToSceneOption.innerHTML = `<i class="fas fa-plus-square"></i> Add to Scene Center${hasMultipleSelected ? ` (${assetsToAdd.length})` : ''}`;
      addToSceneOption.onclick = async () => {
        document.body.removeChild(menu);
        await this._addAssetsToSceneCenter(assetsToAdd);
      };
      menu.appendChild(addToSceneOption);
    }
    
    // Separator
    const separator1 = document.createElement('div');
    separator1.className = 'context-menu-separator';
    
    // Rename option
    const renameOption = document.createElement('div');
    renameOption.className = 'context-menu-item';
    renameOption.innerHTML = '<i class="fas fa-edit"></i> Rename';
    renameOption.onclick = async () => {
      document.body.removeChild(menu);
      this.selectedAssets.clear();
      this.selectedAssets.add(assetId);
      await this._onRenameAsset(event);
    };
    
    // Move option
    const moveOption = document.createElement('div');
    moveOption.className = 'context-menu-item';
    moveOption.innerHTML = '<i class="fas fa-folder-open"></i> Move';
    moveOption.onclick = async () => {
      document.body.removeChild(menu);
      this.selectedAssets.clear();
      this.selectedAssets.add(assetId);
      await this._onMoveAsset(event);
    };
    
    // Separator
    const separator2 = document.createElement('div');
    separator2.className = 'context-menu-separator';
    
    // Delete option - support multiple selections
    const deleteOption = document.createElement('div');
    deleteOption.className = 'context-menu-item context-menu-item-danger';
    
    // Check if we have multiple selected assets or just this one
    const hasMultipleSelectedForDelete = this.selectedAssets.size > 1 && this.selectedAssets.has(assetId);
    const assetsToDelete = hasMultipleSelectedForDelete 
      ? this.currentAssets.filter(a => this.selectedAssets.has(a.id))
      : [asset];
    
    deleteOption.innerHTML = `<i class="fas fa-trash"></i> Delete${hasMultipleSelectedForDelete ? ` (${assetsToDelete.length})` : ''}`;
    deleteOption.onclick = async () => {
      document.body.removeChild(menu);
      
      if (!hasMultipleSelectedForDelete) {
        // Single asset - clear selection and select only this one
        this.selectedAssets.clear();
        this.selectedAssets.add(assetId);
      }
      // If multiple selected, keep the current selection
      
      await this._onDeleteAsset(event);
    };
    
    // Build menu
    menu.appendChild(copyPathOption);
    menu.appendChild(viewDetailsOption);
    menu.appendChild(separator1);
    menu.appendChild(renameOption);
    menu.appendChild(moveOption);
    menu.appendChild(separator2);
    menu.appendChild(deleteOption);
    
    document.body.appendChild(menu);
    
    // Remove menu when clicking elsewhere
    const removeMenu = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node)) {
        if (document.body.contains(menu)) {
          document.body.removeChild(menu);
        }
        document.removeEventListener('click', removeMenu);
      }
    };
    
    setTimeout(() => {
      document.addEventListener('click', removeMenu);
    }, 10);
  }

  /**
   * Add assets to scene center with diagonal staggering
   */
  private async _addAssetsToSceneCenter(assets: CachedAsset[]): Promise<void> {
    const gameCanvas = (canvas as any);
    if (!gameCanvas || !gameCanvas.scene) {
      ui.notifications?.warn('No active scene');
      return;
    }
    
    // Get exact center of the scene
    const sceneWidth = gameCanvas.scene.dimensions.width;
    const sceneHeight = gameCanvas.scene.dimensions.height;
    const centerX = sceneWidth / 2;
    const centerY = sceneHeight / 2;
    
    const gridSize = gameCanvas.scene.grid.size || 100;
    const diagonalOffset = gridSize * 0.5; // Offset for diagonal staggering
    
    let successCount = 0;
    let failCount = 0;
    
    for (let i = 0; i < assets.length; i++) {
      const asset = assets[i];
      
      try {
        // Load image to get dimensions
        const img = new Image();
        img.src = asset.path;
        await new Promise((resolve) => {
          img.onload = resolve;
          img.onerror = resolve;
        });
        
        const tileWidth = img.width || gridSize * 2;
        const tileHeight = img.height || gridSize * 2;
        
        // Calculate diagonal stagger position
        // Each asset is offset diagonally from the center
        const offsetX = i * diagonalOffset;
        const offsetY = i * diagonalOffset;
        
        const tileData = {
          texture: { src: asset.path },
          width: tileWidth,
          height: tileHeight,
          x: centerX - (tileWidth / 2) + offsetX,
          y: centerY - (tileHeight / 2) + offsetY,
          z: 100 + i, // Stack them slightly
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
        
        await gameCanvas.scene.createEmbeddedDocuments('Tile', [tileData]);
        successCount++;
      } catch (error) {
        console.error('Asset Atlas | Failed to add asset to scene:', error);
        failCount++;
      }
    }
    
    if (successCount > 0) {
      ui.notifications?.info(`Added ${successCount} asset(s) to scene center${failCount > 0 ? ` (${failCount} failed)` : ''}`);
    } else {
      ui.notifications?.error('Failed to add assets to scene');
    }
  }

  /**
   * Handle bulk add tags
   */
  private async _onBulkAddTags(event: JQuery.TriggeredEvent): Promise<void> {
    event.preventDefault();
    
    if (this.selectedAssets.size === 0) {
      ui.notifications?.warn('No assets selected');
      return;
    }

    // Show tag selection dialog
    const tagName = await this._promptForTag('Add tags to selected assets');
    if (!tagName) return;

    const assetPaths = Array.from(this.selectedAssets);
    await this.tagManager.addTagsToAssets(assetPaths, [tagName]);
    
    ui.notifications?.info(`Added tag "${tagName}" to ${assetPaths.length} assets`);
    await this.render(false);
  }

  /**
   * Handle bulk remove tags
   */
  private async _onBulkRemoveTags(event: JQuery.TriggeredEvent): Promise<void> {
    event.preventDefault();
    
    if (this.selectedAssets.size === 0) {
      ui.notifications?.warn('No assets selected');
      return;
    }

    const tagName = await this._promptForTag('Remove tags from selected assets');
    if (!tagName) return;

    const assetPaths = Array.from(this.selectedAssets);
    await this.tagManager.removeTagsFromAssets(assetPaths, [tagName]);
    
    ui.notifications?.info(`Removed tag "${tagName}" from ${assetPaths.length} assets`);
    await this.render(false);
  }

  /**
   * Handle clear selection
   */
  private _onClearSelection(event: JQuery.TriggeredEvent): void {
    event.preventDefault();
    this.selectedAssets.clear();
    this.lastSelectedAssetId = null;
    this.updateSelectionUI();
  }

  /**
   * Handle import to atlas
   */
  private async _onImportToAtlas(event: JQuery.TriggeredEvent): Promise<void> {
    event.preventDefault();
    
    // Create a custom dialog with clickable options
    new Dialog({
      title: "Import Assets to Atlas",
      content: `
        <div style="text-align: center; padding: 1rem;">
          <p style="margin-bottom: 1.5rem;">Where would you like to import assets from?</p>
          <div style="display: flex; gap: 1rem;">
            <button class="import-world-btn" style="flex: 1; padding: 1.5rem; background: var(--aa-accent-arcane); border: 1px solid var(--aa-border-gold); color: white; cursor: pointer; border-radius: 6px; font-size: 1rem; transition: all 0.2s;">
              <i class="fas fa-globe" style="font-size: 2rem; display: block; margin-bottom: 0.5rem;"></i>
              <strong>Import to World</strong>
            </button>
            <button class="import-global-btn" style="flex: 1; padding: 1.5rem; background: var(--aa-accent-metal); border: 1px solid var(--aa-border-gold); color: var(--aa-bg-primary); cursor: pointer; border-radius: 6px; font-size: 1rem; transition: all 0.2s;">
              <i class="fas fa-atlas" style="font-size: 2rem; display: block; margin-bottom: 0.5rem;"></i>
              <strong>Import to Global Library</strong>
            </button>
          </div>
        </div>
      `,
      buttons: {},
      render: (html: JQuery) => {
        // Add click handlers to the buttons
        html.find('.import-world-btn').on('click', async () => {
          // Close the dialog
          (html.closest('.dialog') as any).find('.close').click();
          
          // Open custom import dialog for world
          await CustomImportDialog.show({
            destination: 'world',
            worldName: this.currentWorld,
            cache: this.cache,
            folderManager: this.folderManager,
            onComplete: async () => {
              // Trigger a scan after import
              if (this.scanner) {
                ui.notifications?.info('Scanning for new assets...');
                try {
                  const watchedDirsStr = (game as any).settings.get('asset-atlas', 'watchedDirectories') as string;
                  const watchedDirs = watchedDirsStr ? watchedDirsStr.split(',').map((d: string) => d.trim()).filter((d: string) => d) : [];
                  await this.scanner.scan(watchedDirs, true);
                } catch (error) {
                  console.error('Asset Atlas | Scan error:', error);
                }
              }
              // Refresh the display
              await this.updateAssetDisplay();
            }
          });
        });
        
        html.find('.import-global-btn').on('click', async () => {
          // Close the dialog
          (html.closest('.dialog') as any).find('.close').click();
          
          // Open custom import dialog for global library
          await CustomImportDialog.show({
            destination: 'global',
            worldName: this.currentWorld,
            cache: this.cache,
            folderManager: this.folderManager,
            onComplete: async () => {
              // Trigger a scan after import
              if (this.scanner) {
                ui.notifications?.info('Scanning for new assets...');
                try {
                  const watchedDirsStr = (game as any).settings.get('asset-atlas', 'watchedDirectories') as string;
                  const watchedDirs = watchedDirsStr ? watchedDirsStr.split(',').map((d: string) => d.trim()).filter((d: string) => d) : [];
                  await this.scanner.scan(watchedDirs, true);
                } catch (error) {
                  console.error('Asset Atlas | Scan error:', error);
                }
              }
              // Refresh the display
              await this.updateAssetDisplay();
            }
          });
        });
        
        // Add hover effects
        html.find('.import-world-btn, .import-global-btn').on('mouseenter', function() {
          ($(this) as any).css('transform', 'scale(1.05)');
        }).on('mouseleave', function() {
          ($(this) as any).css('transform', 'scale(1)');
        });
      }
    }).render(true);
  }

  /**
   * Handle refresh
   */
  private async _onRefresh(event: JQuery.TriggeredEvent): Promise<void> {
    event.preventDefault();
    
    // If scanner is available, trigger a real scan
    if (this.scanner) {
      this.showLoading('Scanning for assets...');
      
      try {
        const watchedDirsStr = (game as any).settings.get('asset-atlas', 'watchedDirectories') as string;
        const watchedDirs = watchedDirsStr ? watchedDirsStr.split(',').map((d: string) => d.trim()).filter((d: string) => d) : [];
        
        console.log('Asset Atlas | Scanning directories:', watchedDirs);
        const result = await this.scanner.scan(watchedDirs, true);
        
        ui.notifications?.info(
          `Scan complete: ${result.assetsFound} found, ${result.assetsAdded} new, ${result.assetsUpdated} updated`
        );
      } catch (error) {
        console.error('Asset Atlas | Scan error:', error);
        ui.notifications?.error('Failed to scan assets. Check console for details.');
      } finally {
        this.hideLoading();
      }
    }
    
    // Update display from cache
    this.showLoading('Loading assets...');
    try {
      await this.updateAssetDisplay();
    } finally {
      this.hideLoading();
    }
  }

  /**
   * Update the displayed assets based on current filters
   */
  async updateAssetDisplay(): Promise<void> {
    // Apply folder filter if selected
    let searchCriteria = { ...this.currentFilters };
    
    // Get all assets matching current filters
    const allAssets = await this.cache.searchAssets(searchCriteria);
    
    // Apply folder filter if a folder is selected
    let filteredAssets = allAssets;
    if (this.selectedFolderPath) {
      filteredAssets = this.filterAssetsByFolder(allAssets, this.selectedFolderPath);
    }
    
    this.totalAssets = filteredAssets.length;
    
    // Rebuild folder tree from filtered assets
    this.folderTree.buildFromAssets(filteredAssets);
    
    // Restore folder tree state
    await this.restoreFolderTreeState();
    
    // Reset to page 1 when filters change
    this.currentPage = 1;
    
    // Get paginated assets
    const startIndex = (this.currentPage - 1) * this.assetsPerPage;
    this.currentAssets = filteredAssets.slice(startIndex, startIndex + this.assetsPerPage);
    
    await this.render(false);
  }

  /**
   * Filter assets by folder path
   */
  private filterAssetsByFolder(assets: CachedAsset[], folderPath: string, recursive: boolean = true): CachedAsset[] {
    if (!folderPath) return assets;
    
    return assets.filter(asset => {
      if (recursive) {
        // Include assets in this folder and all subfolders
        return asset.path.startsWith(folderPath + '/');
      } else {
        // Include only assets directly in this folder
        const assetFolder = asset.path.substring(0, asset.path.lastIndexOf('/'));
        return assetFolder === folderPath;
      }
    });
  }

  /**
   * Go to a specific page
   */
  async goToPage(page: number): Promise<void> {
    const allAssets = await this.cache.searchAssets(this.currentFilters);
    
    // Apply folder filter if selected
    let filteredAssets = allAssets;
    if (this.selectedFolderPath) {
      filteredAssets = this.filterAssetsByFolder(allAssets, this.selectedFolderPath);
    }
    
    this.totalAssets = filteredAssets.length;
    
    const totalPages = Math.ceil(this.totalAssets / this.assetsPerPage);
    this.currentPage = Math.max(1, Math.min(page, totalPages));
    
    // Get paginated assets
    const startIndex = (this.currentPage - 1) * this.assetsPerPage;
    this.currentAssets = filteredAssets.slice(startIndex, startIndex + this.assetsPerPage);
    
    await this.render(false);
  }

  /**
   * Show asset details panel
   */
  showAssetDetails(assetId: string): void {
    const asset = this.currentAssets.find(a => a.id === assetId);
    if (!asset) return;

    // In a real implementation, this would open a details dialog
    // For now, log to console
    console.log('Asset Details:', asset);
  }

  /**
   * Apply search and filter criteria
   */
  applyFilters(criteria: SearchCriteria): void {
    this.currentFilters = criteria;
    this.updateAssetDisplay();
  }

  /**
   * Prompt user for tag name
   */
  private async _promptForTag(title: string): Promise<string | null> {
    // In a real implementation, this would show a dialog
    // For now, use browser prompt
    return prompt(title);
  }

  /**
   * Handle move asset
   */
  private async _onMoveAsset(event: JQuery.TriggeredEvent): Promise<void> {
    event.preventDefault();
    
    if (this.selectedAssets.size !== 1) {
      ui.notifications?.warn('Please select exactly one asset to move');
      return;
    }

    const assetId = Array.from(this.selectedAssets)[0];
    const asset = this.currentAssets.find(a => a.id === assetId);
    
    if (!asset) return;

    // Show move dialog
    const newPath = await MoveRenameDialog.show({
      asset,
      operation: 'move',
      usageTracker: this.usageTracker
    });

    if (!newPath) return;

    // Perform move operation
    const success = await this.organizer.moveAsset(asset, newPath);
    
    if (success) {
      ui.notifications?.info(`Asset moved to ${newPath}`);
      await this.updateAssetDisplay();
    }
  }

  /**
   * Handle rename asset
   */
  private async _onRenameAsset(event: JQuery.TriggeredEvent): Promise<void> {
    event.preventDefault();
    
    if (this.selectedAssets.size !== 1) {
      ui.notifications?.warn('Please select exactly one asset to rename');
      return;
    }

    const assetId = Array.from(this.selectedAssets)[0];
    const asset = this.currentAssets.find(a => a.id === assetId);
    
    if (!asset) return;

    // Show rename dialog
    const newPath = await MoveRenameDialog.show({
      asset,
      operation: 'rename',
      usageTracker: this.usageTracker
    });

    if (!newPath) return;

    // Extract just the filename for rename
    const newName = newPath.split('/').pop() || newPath;
    
    // Perform rename operation
    const success = await this.organizer.renameAsset(asset, newName);
    
    if (success) {
      ui.notifications?.info(`Asset renamed to ${newName}`);
      await this.updateAssetDisplay();
    }
  }

  /**
   * Handle delete asset
   */
  private async _onDeleteAsset(event: JQuery.TriggeredEvent): Promise<void> {
    event.preventDefault();
    
    if (this.selectedAssets.size === 0) {
      ui.notifications?.warn('No assets selected');
      return;
    }

    const assets = this.currentAssets.filter(a => this.selectedAssets.has(a.id));
    
    // Show delete confirmation dialog
    const confirmed = await DeleteConfirmationDialog.show({ assets });
    
    if (!confirmed) return;

    // Perform delete operation
    const result = await this.organizer.deleteAssets(assets);
    
    // Show summary
    if (result.success > 0) {
      const sizeStr = this.formatBytes(result.totalSize);
      ui.notifications?.info(
        `Deleted ${result.success} asset(s) (${sizeStr})${
          result.failed > 0 ? `. Failed to delete ${result.failed} asset(s).` : ''
        }`
      );
    } else {
      ui.notifications?.error(`Failed to delete assets`);
    }
    
    // Clear selection and refresh
    this.selectedAssets.clear();
    await this.updateAssetDisplay();
  }

  /**
   * Handle dry run delete
   */
  private async _onDryRunDelete(event: JQuery.TriggeredEvent): Promise<void> {
    event.preventDefault();
    
    if (this.selectedAssets.size === 0) {
      ui.notifications?.warn('No assets selected');
      return;
    }

    const assets = this.currentAssets.filter(a => this.selectedAssets.has(a.id));
    
    // Perform dry run
    const dryRunResult = await this.organizer.dryRunDelete(assets);
    
    // Show dry run dialog
    const proceed = await DryRunDialog.show(dryRunResult);
    
    if (proceed) {
      // User wants to proceed with actual deletion
      const confirmed = await DeleteConfirmationDialog.show({ assets });
      
      if (!confirmed) return;

      // Perform delete operation
      const result = await this.organizer.deleteAssets(assets);
      
      // Show summary
      if (result.success > 0) {
        const sizeStr = this.formatBytes(result.totalSize);
        ui.notifications?.info(
          `Deleted ${result.success} asset(s) (${sizeStr})${
            result.failed > 0 ? `. Failed to delete ${result.failed} asset(s).` : ''
          }`
        );
      } else {
        ui.notifications?.error(`Failed to delete assets`);
      }
      
      // Clear selection and refresh
      this.selectedAssets.clear();
      await this.updateAssetDisplay();
    }
  }

  /**
   * Format bytes to human-readable string
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Handle import to world
   */
  private async _onImportToWorld(event: JQuery.TriggeredEvent): Promise<void> {
    event.preventDefault();
    
    if (this.selectedAssets.size === 0) {
      ui.notifications?.warn('No assets selected');
      return;
    }

    const assets = this.currentAssets.filter(a => this.selectedAssets.has(a.id));
    
    // Check if assets are from library
    const libraryAssets = assets.filter(a => this.folderManager.isLibraryPath(a.path));
    
    if (libraryAssets.length === 0) {
      ui.notifications?.warn('Selected assets are not from the library');
      return;
    }

    // Show import dialog
    const result = await ImportDialog.show({
      assets: libraryAssets,
      worldName: this.currentWorld,
      folderManager: this.folderManager
    });

    if (!result) return;

    // Perform import
    const importResult = await this.importer.importToWorld(libraryAssets, this.currentWorld, {
      copy: result.copy,
      overwrite: result.overwrite,
      preserveStructure: result.preserveStructure
    });

    // Show results
    if (importResult.success > 0) {
      ui.notifications?.info(
        `Imported ${importResult.success} asset(s) to ${this.currentWorld}${
          importResult.failed > 0 ? `. Failed: ${importResult.failed}` : ''
        }${
          importResult.skipped > 0 ? `. Skipped: ${importResult.skipped}` : ''
        }`
      );
    } else {
      ui.notifications?.error('Failed to import assets');
    }

    await this.updateAssetDisplay();
  }

  /**
   * Handle view library
   */
  private async _onViewLibrary(event: JQuery.TriggeredEvent): Promise<void> {
    event.preventDefault();
    
    const libraryAssets = await this.importer.getLibraryAssets();
    this.currentAssets = libraryAssets;
    await this.render(false);
    
    ui.notifications?.info(`Viewing library: ${libraryAssets.length} assets`);
  }

  /**
   * Handle view world
   */
  private async _onViewWorld(event: JQuery.TriggeredEvent): Promise<void> {
    event.preventDefault();
    
    const worldAssets = await this.importer.getWorldAssets(this.currentWorld);
    this.currentAssets = worldAssets;
    await this.render(false);
    
    ui.notifications?.info(`Viewing ${this.currentWorld}: ${worldAssets.length} assets`);
  }

  /**
   * Set the current world
   */
  setCurrentWorld(worldName: string): void {
    this.currentWorld = worldName;
  }

  /**
   * Set the scanner instance for refresh functionality
   */
  setScanner(scanner: any): void {
    this.scanner = scanner;
  }

  /**
   * Enable FilePicker mode
   */
  enableFilePickerMode(callback: (asset: CachedAsset) => void): void {
    this.filePickerMode = true;
    this.onAssetSelectCallback = callback;
  }

  /**
   * Disable FilePicker mode
   */
  disableFilePickerMode(): void {
    this.filePickerMode = false;
    this.onAssetSelectCallback = undefined;
  }

  /**
   * Check if in FilePicker mode
   */
  isFilePickerMode(): boolean {
    return this.filePickerMode;
  }

  /**
   * Show loading overlay
   */
  showLoading(message: string = 'Loading...'): void {
    const overlay = this.element.find('.loading-overlay');
    const messageEl = overlay.find('.loading-message');
    messageEl.text(message);
    (overlay as any).show();
  }

  /**
   * Hide loading overlay
   */
  hideLoading(): void {
    const overlay = this.element.find('.loading-overlay');
    (overlay as any).hide();
  }

  /**
   * Handle folder click (selection)
   */
  private async _onFolderClick(event: JQuery.TriggeredEvent): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    
    const folderPath = $(event.currentTarget).data('folder-path');
    this.selectedFolderPath = folderPath;
    this.folderTree.setSelectedFolder(folderPath);
    
    // Save state
    await this.saveFolderTreeState();
    
    // Apply folder filter
    await this.updateAssetDisplay();
  }

  /**
   * Handle folder toggle (expand/collapse)
   */
  private async _onFolderToggle(event: JQuery.TriggeredEvent): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    
    const folderPath = $(event.currentTarget).data('folder-path');
    this.folderTree.toggleFolder(folderPath);
    
    // Save state
    await this.saveFolderTreeState();
    
    // Re-render to show/hide children
    await this.render(false);
  }

  /**
   * Handle folder context menu
   */
  private _onFolderContextMenu(event: JQuery.TriggeredEvent): void {
    event.preventDefault();
    event.stopPropagation();
    
    const folderPath = $(event.currentTarget).data('folder-path');
    
    // Get the original mouse event
    const originalEvent = (event as any).originalEvent as MouseEvent;
    
    // Create a simple context menu using native browser context
    // In a real Foundry implementation, this would use Foundry's ContextMenu class
    const menu = document.createElement('div');
    menu.className = 'folder-context-menu';
    menu.style.position = 'fixed';
    menu.style.left = `${originalEvent.clientX}px`;
    menu.style.top = `${originalEvent.clientY}px`;
    menu.style.zIndex = '10000';
    
    const expandAllOption = document.createElement('div');
    expandAllOption.className = 'context-menu-item';
    expandAllOption.innerHTML = '<i class="fas fa-folder-open"></i> Expand All';
    expandAllOption.onclick = async () => {
      this.folderTree.expandAll();
      await this.saveFolderTreeState();
      await this.render(false);
      document.body.removeChild(menu);
    };
    
    const collapseAllOption = document.createElement('div');
    collapseAllOption.className = 'context-menu-item';
    collapseAllOption.innerHTML = '<i class="fas fa-folder"></i> Collapse All';
    collapseAllOption.onclick = async () => {
      this.folderTree.collapseAll();
      await this.saveFolderTreeState();
      await this.render(false);
      document.body.removeChild(menu);
    };
    
    menu.appendChild(expandAllOption);
    menu.appendChild(collapseAllOption);
    
    document.body.appendChild(menu);
    
    // Remove menu when clicking elsewhere
    const removeMenu = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node)) {
        if (document.body.contains(menu)) {
          document.body.removeChild(menu);
        }
        document.removeEventListener('click', removeMenu);
      }
    };
    
    setTimeout(() => {
      document.addEventListener('click', removeMenu);
    }, 10);
  }

  /**
   * Handle clear folder filter
   */
  private async _onClearFolderFilter(event: JQuery.TriggeredEvent): Promise<void> {
    event.preventDefault();
    
    this.selectedFolderPath = null;
    this.folderTree.setSelectedFolder(null);
    
    // Save state
    await this.saveFolderTreeState();
    
    // Update display
    await this.updateAssetDisplay();
  }

  /**
   * Save folder tree state to settings
   */
  private async saveFolderTreeState(): Promise<void> {
    const state = this.folderTree.getState();
    
    try {
      if (typeof game !== 'undefined' && (game as any).settings) {
        await (game as any).settings.set('asset-atlas', 'folderTreeState', JSON.stringify(state));
      }
    } catch (error) {
      console.warn('Asset Atlas | Failed to save folder tree state:', error);
    }
  }

  /**
   * Restore folder tree state from settings
   */
  private async restoreFolderTreeState(): Promise<void> {
    try {
      if (typeof game !== 'undefined' && (game as any).settings) {
        const stateJson = await (game as any).settings.get('asset-atlas', 'folderTreeState');
        if (stateJson) {
          const state = JSON.parse(stateJson);
          this.folderTree.restoreState(state);
          this.selectedFolderPath = state.selectedFolder;
        }
      }
    } catch (error) {
      console.warn('Asset Atlas | Failed to restore folder tree state:', error);
    }
  }

  /**
   * Generate breadcrumbs from folder path
   */
  private generateBreadcrumbs(folderPath: string | null): Array<{ name: string; path: string | null }> {
    if (!folderPath) {
      return [{ name: 'All Assets', path: null }];
    }

    const parts = folderPath.split('/').filter(p => p.length > 0);
    const breadcrumbs: Array<{ name: string; path: string | null }> = [
      { name: 'All Assets', path: null }
    ];

    let currentPath = '';
    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      breadcrumbs.push({ name: part, path: currentPath });
    }

    return breadcrumbs;
  }

  /**
   * Handle breadcrumb click
   */
  private async _onBreadcrumbClick(event: JQuery.TriggeredEvent): Promise<void> {
    event.preventDefault();
    
    const folderPath = $(event.currentTarget).data('folder-path');
    this.selectedFolderPath = folderPath || null;
    this.folderTree.setSelectedFolder(this.selectedFolderPath);
    
    // Save state
    await this.saveFolderTreeState();
    
    // Update display
    await this.updateAssetDisplay();
  }

  /**
   * Load settings from Foundry
   */
  private async loadSettings(): Promise<void> {
    try {
      if (typeof game !== 'undefined' && (game as any).settings) {
        this.assetsPerPage = await (game as any).settings.get('asset-atlas', 'assetsPerPage') || 100;
      }
    } catch (error) {
      console.warn('Asset Atlas | Failed to load settings:', error);
      this.assetsPerPage = 100; // Fallback
    }
  }

  /**
   * Get thumbnail size setting
   */
  private async getThumbnailSize(): Promise<string> {
    try {
      if (typeof game !== 'undefined' && (game as any).settings) {
        return await (game as any).settings.get('asset-atlas', 'thumbnailSize') || 'medium';
      }
    } catch (error) {
      console.warn('Asset Atlas | Failed to get thumbnail size:', error);
    }
    return 'medium';
  }

  /**
   * Initialize lazy loading for images using Intersection Observer
   */
  private initializeLazyLoading(html: JQuery): void {
    // Check if Intersection Observer is supported
    if (!('IntersectionObserver' in window)) {
      console.warn('Asset Atlas | Intersection Observer not supported, falling back to native lazy loading');
      return;
    }

    const gridElements = html.find('.asset-grid');
    if (gridElements.length === 0) return;
    
    const gridElement = gridElements[0] as Element;

    // Create observer for lazy loading images
    const imageObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const img = entry.target as HTMLImageElement;
            
            // Only load if not already loaded
            if (!img.dataset.loaded) {
              const src = img.getAttribute('src');
              if (src) {
                // Create a new image to preload
                const tempImg = new Image();
                tempImg.onload = () => {
                  // Downsample the image for better performance
                  const maxDimension = 400; // Maximum width or height for thumbnails
                  let width = tempImg.width;
                  let height = tempImg.height;
                  
                  // Only downsample if image is larger than max dimension
                  if (width > maxDimension || height > maxDimension) {
                    const ratio = Math.min(maxDimension / width, maxDimension / height);
                    width = Math.floor(width * ratio);
                    height = Math.floor(height * ratio);
                    
                    // Create canvas to downsample
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    
                    if (ctx) {
                      // Use high-quality downsampling
                      ctx.imageSmoothingEnabled = true;
                      ctx.imageSmoothingQuality = 'high';
                      ctx.drawImage(tempImg, 0, 0, width, height);
                      
                      // Convert to data URL and set as src
                      img.src = canvas.toDataURL('image/jpeg', 0.85);
                    } else {
                      // Fallback: use original image
                      img.src = src;
                    }
                  } else {
                    // Image is small enough, use original
                    img.src = src;
                  }
                  
                  img.dataset.loaded = 'true';
                  img.style.opacity = '1';
                };
                tempImg.onerror = () => {
                  console.warn(`Asset Atlas | Failed to load image: ${src}`);
                  img.style.opacity = '0.5';
                };
                tempImg.src = src;
              }
              
              // Stop observing this image
              observer.unobserve(img);
            }
          }
        });
      },
      {
        root: gridElement,
        rootMargin: '50px', // Start loading 50px before image enters viewport
        threshold: 0.01
      }
    );

    // Observe all images in the asset grid
    const lazyImages = html.find('.asset-thumbnail img[loading="lazy"]');
    lazyImages.each((_index: number, img: Element) => {
      imageObserver.observe(img);
    });

    // Store observer for cleanup
    (this as any)._imageObserver = imageObserver;
  }

  /**
   * Enable drag-and-drop functionality for assets
   */
  private _enableDragDrop(html: JQuery): void {
    const assetThumbnails = html.find('.asset-thumbnail');
    
    assetThumbnails.each((_index: number, element: Element) => {
      const $element = $(element);
      const assetId = $element.data('asset-id');
      const assetPath = $element.data('asset-path');
      
      // Make element draggable
      element.setAttribute('draggable', 'true');
      
      // Add drag start handler
      element.addEventListener('dragstart', (event: Event) => {
        const dragEvent = event as DragEvent;
        if (!dragEvent.dataTransfer) return;
        
        const asset = this.currentAssets.find(a => a.id === assetId);
        if (!asset) return;
        
        // Check if this asset is part of a selection
        let assetsToTransfer: CachedAsset[] = [];
        
        if (this.selectedAssets.has(assetId) && this.selectedAssets.size > 1) {
          // Dragging a selected asset with multiple selections - transfer all selected assets
          assetsToTransfer = this.currentAssets.filter(a => this.selectedAssets.has(a.id));
          console.log(`Asset Atlas | Dragging ${assetsToTransfer.length} selected assets`);
          
          // Add selection count to element for CSS display
          element.setAttribute('data-selection-count', assetsToTransfer.length.toString());
        } else {
          // Dragging a single asset (or unselected asset)
          assetsToTransfer = [asset];
        }
        
        // Set drag data for Foundry VTT
        const dragData = this._createDragData(assetsToTransfer);
        
        // Store the drag data globally so the drop handler can access it
        (window as any)._assetAtlasDragData = dragData;
        
        dragEvent.dataTransfer.setData('text/plain', JSON.stringify(dragData));
        
        // Set visual feedback
        $element.addClass('dragging');
        dragEvent.dataTransfer.effectAllowed = 'copy';
        
        // Create a smaller drag image for better performance
        const img = $element.find('img')[0];
        if (img) {
          // Use the thumbnail image for drag preview (it's already small)
          dragEvent.dataTransfer.setDragImage(img, 75, 75);
        }
        
        console.log('Asset Atlas | Drag started:', assetsToTransfer.length === 1 ? asset.name : `${assetsToTransfer.length} assets`);
        console.log('Asset Atlas | Drag data:', dragData);
      });
      
      // Add drag end handler
      element.addEventListener('dragend', () => {
        $element.removeClass('dragging');
        element.removeAttribute('data-selection-count');
      });
    });
  }

  /**
   * Create drag data for Foundry VTT based on asset type
   */
  private _createDragData(assets: CachedAsset | CachedAsset[]): any {
    // Handle array of assets
    if (Array.isArray(assets)) {
      if (assets.length === 1) {
        // Single asset in array - use single asset logic
        return this._createSingleAssetDragData(assets[0]);
      } else {
        // Multiple assets - create a special multi-asset drag data
        return {
          type: 'MultiAsset',
          assets: assets.map(asset => this._createSingleAssetDragData(asset))
        };
      }
    }
    
    // Single asset
    return this._createSingleAssetDragData(assets);
  }

  /**
   * Create drag data for a single asset
   */
  private _createSingleAssetDragData(asset: CachedAsset): any {
    // Determine what type of Foundry entity to create based on asset type
    if (asset.type === 'image') {
      // For images, create a Tile using Foundry's expected format
      return {
        type: 'Tile',
        texture: {
          src: asset.path
        }
      };
    } else if (asset.type === 'audio') {
      // For audio, create an AmbientSound
      return {
        type: 'AmbientSound',
        path: asset.path,
        radius: 10,
        volume: 0.5
      };
    } else if (asset.type === 'video') {
      // For video, create a Tile with video texture
      return {
        type: 'Tile',
        texture: {
          src: asset.path
        },
        video: {
          loop: true,
          autoplay: true,
          volume: 0.5
        }
      };
    }

    // Default fallback - just the path
    return {
      type: 'Tile',
      texture: {
        src: asset.path
      }
    };
  }

  /**
   * Clean up observers when closing
   */
  async close(options?: any): Promise<void> {
    // Disconnect image observer if it exists
    if ((this as any)._imageObserver) {
      (this as any)._imageObserver.disconnect();
      delete (this as any)._imageObserver;
    }
    
    return super.close(options);
  }
}
