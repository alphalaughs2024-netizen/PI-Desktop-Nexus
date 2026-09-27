# UI Phase F Browser interaction polish

Phase F completes Browser-only interaction polish on the Phase B–E renderer
baseline. The Browser owns tab context actions, menu focus, shortcut handling,
and narrow overflow behavior. Shell, Main, IPC, backend, policy, navigation,
session, and native guest ownership remain unchanged.

## Tab context menu

`BrowserTabStrip` owns a renderer-only context menu opened by right-click,
Context Menu, or Shift+F10. It provides New tab, Reload tab, Duplicate tab,
Close tab, and Close other tabs. Actions use existing typed renderer callbacks;
visible labels never expose URLs, session IDs, guest IDs, or backend data.

The menu uses `role="menu"`/`role="menuitem"`, Arrow Up/Down, Home/End,
Enter/Space activation, Escape dismissal, disabled unavailable actions, and
focus restoration to the originating tab.

## Shortcut and focus matrix

| Shortcut/action | Result |
| --- | --- |
| Ctrl/Cmd+T | Create and focus a new tab |
| Ctrl/Cmd+W | Close active tab and focus neighboring tab |
| Ctrl/Cmd+Tab / Shift+Tab | Cycle tabs |
| Ctrl/Cmd+L | Focus/select address |
| Enter | Navigate through existing Browser callback |
| Escape | Restore committed address and blur |
| Menu close / diagnostics close | Restore originating trigger/tab |
| New Tab state | Focus/select address only when no-page/about:blank |

Loading/ready/error transitions do not steal focus from outside Browser and
preserve the nearest surviving Browser control when a focused element disappears.

## Narrow and motion behavior

Menus are fixed to the Browser viewport, clamped inside the visible window, and
scroll when their action list exceeds available height. Tab strips remain
keyboard-scrollable and context actions do not change guest bounds. Reduced
motion removes decorative menu/diagnostics/state animation while preserving final
geometry, focus, and live-region updates.

Browser retains one readiness row, one stable `role="status"` operation region,
and one stable `role="alert"` error region. Header, toolbar, and tab menus remain
separate ownership domains.
