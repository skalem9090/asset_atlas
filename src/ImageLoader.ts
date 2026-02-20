/**
 * ImageLoader - Handles lazy loading and thumbnail downsampling for images
 */

export class ImageLoader {
  private imageObserver: IntersectionObserver | null = null;

  /**
   * Initialize lazy loading for images in the asset grid
   */
  initializeLazyLoading(html: JQuery): void {
    const gridElements = html.find('.asset-grid');
    if (gridElements.length === 0) {
      console.warn('Asset Atlas | No asset grid found for lazy loading');
      return;
    }

    const gridElement = gridElements[0] as Element;

    // Clean up existing observer
    if (this.imageObserver) {
      this.imageObserver.disconnect();
    }

    // Create intersection observer for lazy loading
    this.imageObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const img = entry.target as HTMLImageElement;
            
            // Only load if not already loaded
            if (!img.dataset.loaded) {
              const src = img.getAttribute('src');
              if (src) {
                this.loadAndDownsampleImage(img, src);
              }
              
              // Stop observing this image
              this.imageObserver!.unobserve(img);
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
      this.imageObserver!.observe(img);
    });
  }

  /**
   * Load and downsample an image for better performance
   */
  private loadAndDownsampleImage(img: HTMLImageElement, src: string): void {
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

  /**
   * Clean up the image observer
   */
  cleanup(): void {
    if (this.imageObserver) {
      this.imageObserver.disconnect();
      this.imageObserver = null;
    }
  }
}
