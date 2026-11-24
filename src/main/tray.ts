import { Menu, Tray, nativeImage } from 'electron';
import { trayIconDataUrls } from './trayIcon';
import type { PopupWindow } from './window';

export interface TrayController {
  tray: Tray;
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
  const image = nativeImage.createEmpty();
  image.addRepresentation({ scaleFactor: 1, dataURL: urls.x1 });
  image.addRepresentation({ scaleFactor: 2, dataURL: urls.x2 });
  image.setTemplateImage(true);

  const tray = new Tray(image);
  tray.setToolTip('T3 Widget');

  let pinned = deps.initialPinned;
  const buildMenu = () =>
    Menu.buildFromTemplate([
      { label: 'Show Widget', click: () => deps.popup.showPopup(tray.getBounds()) },
      { label: 'Pin on Top', type: 'checkbox', checked: pinned, click: (item) => deps.onTogglePin(item.checked) },
      { label: 'Open T3 Code', click: () => deps.onOpenT3() },
      { type: 'separator' },
      { label: 'Quit', accelerator: 'Command+Q', click: () => deps.onQuit() },
    ]);

  tray.on('click', () => deps.popup.toggle(tray.getBounds()));
  tray.on('right-click', () => tray.popUpContextMenu(buildMenu()));

  return {
    tray,
    setPinned(p) {
      pinned = p;
    },
    destroy: () => tray.destroy(),
  };
}
