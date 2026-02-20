/**
 * DragDropHandler - Handles drag and drop functionality for assets
 */

import { CachedAsset } from './types';

export class DragDropHandler {
  /**
   * Enable drag-and-drop functionality for assets
   */
  enableDragDrop(
    html: JQuery,
    currentAssets: CachedAsset[],
    getSelectedAssets: () => Set<string>
  ): void {
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
        
        const asset = currentAssets.find(a => a.id === assetId);
        if (!asset) return;

        const selectedAssets = getSelectedAssets();
        
        // Check if dragging multiple assets
        if (selectedAssets.size > 1 && selectedAssets.has(assetId)) {
          // Multi-asset drag
          const draggedAssets = currentAssets.filter(a => selectedAssets.has(a.id));
          
          // Create drag data for multiple assets
          const dragData = {
            type: 'MultiAsset',
            assets: draggedAssets.map(a => this.createDragDataForAsset(a))
          };
          
          dragEvent.dataTransfer.setData('text/plain', JSON.stringify(dragData));
          
          // Visual feedback
          const dragImage = document.createElement('div');
          dragImage.style.position = 'absolute';
          dragImage.style.top = '-1000px';
          dragImage.style.padding = '8px 12px';
          dragImage.style.background = 'rgba(166, 124, 255, 0.9)';
          dragImage.style.color = 'white';
          dragImage.style.borderRadius = '4px';
          dragImage.style.fontWeight = 'bold';
          dragImage.textContent = `${draggedAssets.length} assets`;
          document.body.appendChild(dragImage);
          dragEvent.dataTransfer.setDragImage(dragImage, 0, 0);
          setTimeout(() => document.body.removeChild(dragImage), 0);
        } else {
          // Single asset drag
          const dragData = this.createDragDataForAsset(asset);
          dragEvent.dataTransfer.setData('text/plain', JSON.stringify(dragData));
        }
        
        dragEvent.dataTransfer.effectAllowed = 'copy';
      });
    });
  }

  /**
   * Create drag data for a single asset
   */
  private createDragDataForAsset(asset: CachedAsset): any {
    if (asset.type === 'image' || asset.type === 'video') {
      return {
        type: 'Tile',
        name: asset.name,
        texture: {
          src: asset.path
        },
        video: asset.type === 'video' ? {
          loop: true,
          autoplay: true,
          volume: 0.5
        } : undefined
      };
    } else if (asset.type === 'audio') {
      return {
        type: 'AmbientSound',
        name: asset.name,
        path: asset.path,
        radius: 10,
        volume: 0.5
      };
    }
    
    return null;
  }
}
