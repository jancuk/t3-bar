import { Menu, Tray, nativeImage } from 'electron';
import { trayIconDataUrls } from './trayIcon';
import type { PopupWindow } from './window';

export interface TrayController {
  tray: Tray;
  imageSize: { width: number; height: number };
  setPinned(pinned: boolean): void;
  destroy(): void;
}

export function createTray(deps: {
  popup: PopupWindow;
  initialPinned: boolean;
  onTogglePin(pinned: boolean): void;
  onOpenT3(): void;
  onQuit(): void;
}): TrayController {
  const urls = trayIconDataUrls();
  const image = nativeImage.createFromDataURL(urls.x1);
  image.addRepresentation({ scaleFactor: 2, width: 16, height: 16, dataURL: urls.x2 });
  image.setTemplateImage(true);

  const tray = new Tray(image);
  tray.setToolTip('T3 Code Launcher');

  let pinned = deps.initialPinned;
  const buildMenu = () =>
    Menu.buildFromTemplate([
      { label: 'Show Launcher', click: () => deps.popup.showPopup(tray.getBounds()) },
      { label: 'Pin on Top', type: 'checkbox', checked: pinned, click: (item) => deps.onTogglePin(item.checked) },
      { label: 'Open T3 Code', click: () => deps.onOpenT3() },
      { type: 'separator' },
      { label: 'Quit', accelerator: 'Command+Q', click: () => deps.onQuit() },
    ]);

  tray.on('click', () => deps.popup.toggle(tray.getBounds()));
  tray.on('right-click', () => tray.popUpContextMenu(buildMenu()));

  return {
    tray,
    imageSize: image.getSize(),
    setPinned(p) {
      pinned = p;
    },
    destroy: () => tray.destroy(),
  };
}
