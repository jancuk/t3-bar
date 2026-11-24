# T3 Code Launcher

A Spotlight-style quick launcher for [T3 Code](https://t3.codes). Press a shortcut, type a prompt, and send it to a new or existing thread without opening T3 Code. It works with the T3 Code server on your Mac and with servers on other machines you own.

Stack: Electron, React 19, TypeScript, Vite, Tailwind CSS v4, `@base-ui/react`, `lucide-react`.

## Requirements

- macOS (Apple silicon or Intel)
- Node 22 and npm 10
- T3 Code running locally, with the `t3` CLI at `~/.t3/bin/t3`
- For remote machines: T3 Code reachable over HTTPS or Tailscale, and the `t3` CLI on that machine

## Setup

```sh
npm install
npm run dev     # Vite dev server + esbuild watch + Electron
npm start       # build, then run the packaged-style app
```

The app has no Dock icon. Look for the "T" icon in the menu bar.

## Using it

The launcher opens centered in the upper third of the screen you are on. Type a prompt and press `Enter`.

- **Destination.** The top row is always `New thread`. Below it are recent threads from the current project. Arrow keys move the highlight, and the highlighted row is where `Enter` sends. Highlighting a thread shows its latest messages on the right.
- **Machine.** The left pill in the header picks the machine. Open it with `Cmd+E`.
- **Project.** The pill next to it picks where new threads go. Open it with `Cmd+K`.
  - **No project** is T3 Code's built-in scratch workspace. It is the default and needs no setup.
  - On this Mac, saved folders are grouped by parent folder. **Add folder…** adds one T3 Code project, and **Scan parent folder…** adds every project found one level below a folder you pick.
  - On a remote machine, the list comes from that machine. Use **Refresh projects** after adding one there.
- **After sending.** The launcher shows "Sent to T3 Code" and hides itself. Turn this off in Settings, or pin the launcher.

| Action | Key |
| --- | --- |
| Show or hide | Click the menu-bar icon, or `Ctrl+Option+T` |
| Send | `Enter` or `Cmd+Enter` |
| New line | `Shift+Enter` |
| Choose machine | `Cmd+E` |
| Choose project | `Cmd+K` |
| New thread | `Cmd+N` |
| Open in T3 Code | `Cmd+O` |
| Copy the latest answer of the highlighted thread | `Cmd+Shift+C` |
| Move destination | `Up` / `Down` (hold `Cmd` in multi-line text) |
| Close | `Esc` (closes a popover first), or click outside unless pinned |

Right-click the tray icon for Show Launcher, Pin on Top, Open T3 Code and Quit.

### Copying text

Hover a message in the preview and click the copy icon to copy its raw Markdown. `Cmd+Shift+C` copies the latest assistant reply of the highlighted thread and shows "Copied answer". If the thread has no reply yet, the launcher says so.

### Remote machines

1. On the remote machine, issue an access token:

   ```sh
   t3 auth session issue --scope orchestration:read --scope orchestration:operate --label "T3 Launcher" --token-only
   ```

2. Open the machine menu (`Cmd+E`), choose **Add remote machine…**, enter the address, paste the token, and press **Test & Add**.

The address must be one of:

- `https://` to any host (recommended, for example via `tailscale serve`)
- `http://` to `localhost`, `127.0.0.1` or `[::1]`
- `http://` to a Tailscale MagicDNS name (`host.tailnet.ts.net`, only while Tailscale is connected)

Plain `http://` to any other host is refused, because the token would cross the network unencrypted. The launcher tests the address and token before saving anything. In the machine menu (`Cmd+E`), hover a machine (or press `U` / `Delete` when highlighted) to update its token or remove it. You can save up to 10 machines.

Tokens are encrypted with the macOS Keychain (Electron `safeStorage`). Unsigned local builds may show a one-time macOS Keychain permission prompt the first time you save a token. If the Keychain is unavailable, the form says so and nothing is saved.

## T3 interfaces used

Local machine:

1. `GET http://127.0.0.1:3773/.well-known/t3/environment` for connection status. No auth, 2 second timeout, loopback only.
2. The official `t3` CLI, run with `execFile` (never a shell):
   - `t3 thread list --json --project <path>`
   - `t3 thread show --json --messages <n> <thread>`
   - `t3 thread send --json <thread> -` (message on stdin)
   - `t3 thread start --json [--title <t>] <project> -` (message on stdin)
   - `t3 app <path>`

Flags always come before positional arguments. `--wait` is never used.

Remote machines (T3 Code orchestration protocol v2, with the `x-t3-orchestration-protocol: 2` header):

1. `GET <origin>/.well-known/t3/environment` for discovery and status. No auth.
2. `GET <origin>/api/orchestration/shell` for projects and threads, with `Authorization: Bearer <token>`.
3. `GET <origin>/api/orchestration/threads/<id>` for a thread's messages.
4. `POST <origin>/api/auth/websocket-ticket` to trade the token for a one-use ticket.
5. `<origin>/ws?orchestrationProtocol=2&wsTicket=<ticket>` for the commands `orchestration.dispatchCommand` (reply to a thread) and `orchestration.launchThread` (start a thread).

Remote threads open in `https://app.t3.codes/threads/<environment>/<thread>`.

## Security

- Renderer runs with `contextIsolation`, `sandbox`, no Node integration, and a minimal preload bridge (`window.t3widget`). Listener wrappers never expose IPC events.
- Every IPC handler checks `event.senderFrame.url` against the app's own page, validates its payload, and returns a typed `Result`.
- The renderer sends ids, never paths. Folder pickers run in the main process, which resolves ids to paths.
- Access tokens never reach the renderer. The renderer sends a token once when you add or update a machine, and the main process stores it encrypted in `secrets.json` (mode `0600`) in the app's user data folder. Settings, logs, errors and return values never contain a token.
- Tokens are only sent to `https://`, loopback, and 4-label `.ts.net` MagicDNS addresses (`https://` via `tailscale serve` is recommended so the token stays encrypted even if Tailscale is disconnected). Addresses with embedded credentials are rejected. Redirects are refused. The websocket URL carries a one-use ticket, never the token.
- Messages to the local CLI go through stdin, so they cannot be parsed as flags or shell syntax.
- External links open only if they are `http:`/`https:` and came from a result in this session.
- Navigation, new windows, webviews and permission requests are blocked. Production builds add a strict CSP (`connect-src 'none'`), because all network calls happen in the main process.
- `ELECTRON_RUN_AS_NODE` is removed from the CLI's environment.

## Settings

Gear icon: auto-hide after sending, show settled threads, global shortcut, CLI path, server URL (loopback only, for the local machine) and messages to preview (1 to 50). They are stored in `settings.json` in the app's user data folder. Corrupt files are moved to `settings.json.bak-<timestamp>`. Saved machines are listed there too, without their tokens.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run typecheck` | `tsc` for main, preload and tests, and for the renderer |
| `npm test` | Vitest unit tests (pure Node, no Electron) |
| `npm run build` | esbuild for main and preload, Vite for the renderer |
| `npm run smoke` | Builds, launches Electron with `--smoke-test` on a temp profile, expects `SMOKE_OK` |
| `npm run verify` | typecheck, test, smoke |

## Troubleshooting

- **"T3 CLI not found"**: set the CLI path in Settings. It must be an absolute or `~/` path ending in `t3` and executable.
- **Red status dot**: start T3 Code on that machine. Click the dot to retry.
- **Amber status dot on a remote machine**: the machine is up but rejected the token. Open the machine menu (`Cmd+E`), hover the machine or press `U`, and paste a new token.
- **macOS Keychain prompt on first save**: unsigned development builds (`npm start` / `npm run dev`) ask macOS Keychain permission the first time `safeStorage` encrypts a token. Click Allow to store the token encrypted.
- **"Plain http is only allowed for localhost and Tailscale"**: use `https://`, or a `.ts.net` address on your tailnet.
- **"Secure storage (macOS Keychain) is unavailable"**: the launcher will not store tokens in plain text. Unlock the Keychain or run the app from a signed-in macOS session.
- **"has no model configured yet"**: start one thread on that machine in T3 Code so the launcher can reuse its model, then try again.
- **"Connection lost before T3 Code confirmed"**: the message may or may not have arrived. Check the thread before resending.
- **"Not a T3 Code project"**: open the folder in T3 Code first.
- **"No project isn't set up yet"**: open T3 Code once so it creates its scratch workspace.
- **Shortcut does nothing**: another app may own it. Pick a different one in Settings.
- **No window appears in dev**: check the terminal for errors and that port 5173 is free.
