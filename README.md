# T3 Widget

A macOS menu-bar popup for a local T3 Code server. List a project's threads, read the latest messages, reply to a thread, or start a new one without leaving what you are doing.

Stack: Electron, React 19, TypeScript, Vite, Tailwind CSS v4, `@base-ui/react`, `lucide-react`.

## Requirements

- macOS (Apple silicon or Intel)
- Node 22 and npm 10
- T3 Code running locally, with the `t3` CLI at `~/.t3/bin/t3`
- At least one folder that is already a T3 Code project

## Setup

```sh
npm install
npm run dev     # Vite dev server + esbuild watch + Electron, restarts on main/preload changes
npm start       # build, then run the packaged-style app
```

The app has no Dock icon. Look for the "T" icon in the menu bar.

## Adding projects

The widget only works with folders T3 Code already knows. Add one in three ways:

- Click the project menu, then **Add project…**, and pick a folder.
- Start the app from a project folder, or set `T3_WIDGET_INITIAL_PROJECT=/path/to/project` (or pass `--initial-project=/path`). On first run with no saved projects the widget tries this silently.
- Run `t3 project add` yourself first if the folder is not a T3 Code project yet.

Adding a project runs a read-only `thread list` probe. A folder that is not a T3 Code project is rejected with a clear message.

## Using it

| Action | How |
| --- | --- |
| Show or hide | Click the menu-bar icon, or press `Ctrl+Option+T` |
| Send | `Cmd+Enter` in the composer |
| Hide | `Esc`, or click outside (unless pinned) |
| Pin on top | Pin button in the header, or right-click the tray icon |
| Open T3 Code | Project menu, or right-click the tray icon |
| Quit | Right-click the tray icon, or Settings |

Settings (gear icon): CLI path, server URL (loopback only), number of messages to preview (1 to 50), global shortcut, and whether settled threads are listed. They are stored in `settings.json` in the app's user data folder. Corrupt files are moved to `settings.json.bak-<timestamp>`.

## T3 interfaces used

Only documented, public interfaces:

1. `GET http://127.0.0.1:3773/.well-known/t3/environment` for connection status. No auth, 2 second timeout, loopback only.
2. The official `t3` CLI, run with `execFile` (never a shell):
   - `t3 thread list --json --project <path>`
   - `t3 thread show --json --messages <n> <thread>`
   - `t3 thread send --json <thread> -` (message on stdin)
   - `t3 thread start --json [--title <t>] <project> -` (message on stdin)
   - `t3 app <path>`

Flags always come before positional arguments. `--wait` is never used. The widget does not read T3 Code's private data or call undocumented endpoints.

## Security

- Renderer runs with `contextIsolation`, `sandbox`, no Node integration, and a minimal preload bridge (`window.t3widget`). Listener wrappers never expose IPC events.
- Every IPC handler checks `event.senderFrame.url` against the app's own page, validates its payload, and returns a typed `Result`.
- The renderer sends project ids, never paths for thread calls. The main process resolves the id to a saved path.
- Message text goes through stdin, so it cannot be parsed as flags or shell syntax.
- External links open only if they are `http:`/`https:` and came from a CLI result in this session.
- Navigation, new windows, webviews and permission requests are blocked. Production builds add a strict CSP (`connect-src 'none'`).
- `ELECTRON_RUN_AS_NODE` is removed from the CLI's environment.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run typecheck` | `tsc` for main/preload/tests and for the renderer |
| `npm test` | Vitest unit tests (pure Node, no Electron) |
| `npm run build` | esbuild for main and preload, Vite for the renderer |
| `npm run smoke` | Builds, launches Electron with `--smoke-test` on a temp profile, expects `SMOKE_OK` |
| `npm run verify` | typecheck, test, smoke |

## Troubleshooting

- **"T3 CLI not found"**: set the CLI path in Settings. It must be an absolute or `~/` path ending in `t3` and executable.
- **Offline badge**: start T3 Code. Click the badge to retry. The Server URL in Settings controls this health check (the `t3` CLI finds the server itself).
- **"Not a T3 Code project"**: open the folder in T3 Code first.
- **Shortcut does nothing**: another app may own it. Pick a different one in Settings.
- **Popup hides while using a dialog**: pin the widget, or file a bug. The folder picker already suspends hide-on-blur.
- **No window appears in dev**: check the terminal for errors and that port 5173 is free.
