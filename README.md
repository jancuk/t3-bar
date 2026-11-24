# T3 Code Launcher

A Spotlight-style quick launcher for a local T3 Code server. Press a shortcut, type a prompt, and send it to a new or existing thread without opening T3 Code.

Stack: Electron, React 19, TypeScript, Vite, Tailwind CSS v4, `@base-ui/react`, `lucide-react`.

## Requirements

- macOS (Apple silicon or Intel)
- Node 22 and npm 10
- T3 Code running locally, with the `t3` CLI at `~/.t3/bin/t3`

## Setup

```sh
npm install
npm run dev     # Vite dev server + esbuild watch + Electron
npm start       # build, then run the packaged-style app
```

The app has no Dock icon. Look for the "T" icon in the menu bar.

## Using it

The launcher opens centered in the upper third of the screen you are on. Type a prompt and press `Enter`.

- **Destination.** The top row is always `New thread`. Below it are recent threads from the current folder. Arrow keys move the highlight, and the highlighted row is where `Enter` sends. Highlighting a thread shows its latest messages on the right.
- **Folder.** The pill at the top left shows where new threads go. Open it with `Cmd+K`.
  - **No project** is T3 Code's built-in scratch workspace (`~/.t3/scratch`, or `$T3CODE_HOME/scratch`). It is the default and needs no setup.
  - Saved folders are grouped by parent folder, for example `~/code/dev`.
  - **Add folder…** adds one folder that is already a T3 Code project.
  - **Scan parent folder…** adds every T3 Code project found one level below a folder you pick (first 40 folders, 4 checked at a time).
- **After sending.** The launcher shows "Sent to T3 Code" and hides itself. Turn this off in Settings ("Auto-hide after sending"), or pin the launcher.

| Action | Key |
| --- | --- |
| Show or hide | Click the menu-bar icon, or `Ctrl+Option+T` |
| Send | `Enter` or `Cmd+Enter` |
| New line | `Shift+Enter` |
| Choose folder | `Cmd+K` |
| New thread | `Cmd+N` |
| Open in T3 Code | `Cmd+O` (highlighted thread, or the folder if none) |
| Move destination | `Up` / `Down` (hold `Cmd` in multi-line text) |
| Close | `Esc` (closes a popover first), or click outside unless pinned |

Right-click the tray icon for Show Launcher, Pin on Top, Open T3 Code and Quit.

Settings (gear icon): auto-hide after sending, show settled threads, global shortcut, CLI path, server URL (loopback only), and messages to preview (1 to 50). They are stored in `settings.json` in the app's user data folder. Corrupt files are moved to `settings.json.bak-<timestamp>`.

## T3 interfaces used

Only documented, public interfaces:

1. `GET http://127.0.0.1:3773/.well-known/t3/environment` for connection status. No auth, 2 second timeout, loopback only.
2. The official `t3` CLI, run with `execFile` (never a shell):
   - `t3 thread list --json --project <path>`
   - `t3 thread show --json --messages <n> <thread>`
   - `t3 thread send --json <thread> -` (message on stdin)
   - `t3 thread start --json [--title <t>] <project> -` (message on stdin)
   - `t3 app <path>`

Flags always come before positional arguments. `--wait` is never used. The launcher does not read T3 Code's private data or call undocumented endpoints.

## Security

- Renderer runs with `contextIsolation`, `sandbox`, no Node integration, and a minimal preload bridge (`window.t3widget`). Listener wrappers never expose IPC events.
- Every IPC handler checks `event.senderFrame.url` against the app's own page, validates its payload, and returns a typed `Result`.
- The renderer sends target ids (`no-project` or a saved project id), never paths. Folder pickers run in the main process. The main process resolves ids to paths.
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
- **Red status dot**: start T3 Code. Click the dot to retry. The Server URL in Settings controls this health check (the `t3` CLI finds the server itself).
- **"Not a T3 Code project"**: open the folder in T3 Code first.
- **"No project isn't set up yet"**: open T3 Code once so it creates its scratch workspace.
- **Shortcut does nothing**: another app may own it. Pick a different one in Settings.
- **Launcher hides while using a dialog**: pin it, or file a bug. The folder pickers already suspend hide-on-blur.
- **No window appears in dev**: check the terminal for errors and that port 5173 is free.
