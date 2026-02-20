/**
 * SelectionManager - Manages asset selection state and multi-select behavior
 */

export class SelectionManager {
  private selectedAssets: Set<string> = new Set();
  private lastSelectedIndex: number = -1;

  /**
   * Get the set of selected asset IDs
   */
  getSelectedAssets(): Set<string> {
    return this.selectedAssets;
  }

  /**
   * Get the count of selected assets
   */
  getSelectedCount(): number {
    return this.selectedAssets.size;
  }

  /**
   * Check if an asset is selected
   */
  isSelected(assetId: string): boolean {
    return this.selectedAssets.has(assetId);
  }

  /**
   * Handle asset click with modifier keys for multi-select
   */
  handleAssetClick(
    assetId: string,
    assetIndex: number,
    ctrlKey: boolean,
    shiftKey: boolean,
    allAssetIds: string[]
  ): void {
    if (ctrlKey || (window.navigator.platform.includes('Mac') && ctrlKey)) {
      // Ctrl+Click: Toggle selection
      if (this.selectedAssets.has(assetId)) {
        this.selectedAssets.delete(assetId);
      } else {
        this.selectedAssets.add(assetId);
      }
      this.lastSelectedIndex = assetIndex;
    } else if (shiftKey && this.lastSelectedIndex >= 0) {
      // Shift+Click: Range selection
      const start = Math.min(this.lastSelectedIndex, assetIndex);
      const end = Math.max(this.lastSelectedIndex, assetIndex);
      
      for (let i = start; i <= end; i++) {
        if (i < allAssetIds.length) {
          this.selectedAssets.add(allAssetIds[i]);
        }
      }
    } else {
      // Regular click: Select only this asset
      this.selectedAssets.clear();
      this.selectedAssets.add(assetId);
      this.lastSelectedIndex = assetIndex;
    }
  }

  /**
   * Clear all selections
   */
  clearSelection(): void {
    this.selectedAssets.clear();
    this.lastSelectedIndex = -1;
  }

  /**
   * Select all assets
   */
  selectAll(assetIds: string[]): void {
    this.selectedAssets.clear();
    assetIds.forEach(id => this.selectedAssets.add(id));
  }

  /**
   * Update visual selection state in the UI
   */
  updateVisualSelection(html: JQuery): void {
    html.find('.asset-thumbnail').each((_index: number, element: Element) => {
      const $element = $(element);
      const assetId = $element.data('asset-id');
      
      if (this.selectedAssets.has(assetId)) {
        $element.addClass('selected');
      } else {
        $element.removeClass('selected');
      }
    });

    // Update selection info visibility
    if (this.selectedAssets.size > 0) {
      (html.find('.selection-info') as any).show();
    } else {
      (html.find('.selection-info') as any).hide();
    }
  }
}
