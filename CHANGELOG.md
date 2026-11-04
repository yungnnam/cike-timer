# Changelog

All notable changes to 此刻 / Cike.

The build stamp shown under *Me → About → Build* (`cike-vNN`) identifies the asset bundle and
changes on every build, independently of the semantic version.

## v1.2.3 — 2026-11-04

- **Fixed**: remaining English-mode gaps in the goals empty state, the haptics description and
  the *recolor subtypes* option of the type editor.
- **Fixed**: fallbacks that bypassed translation — empty search result, the `mostly …`
  summary, and the placeholder displayed when an entry's type has been deleted.
- **Changed**: switching interface language now also renames types that still carry a default
  name (学习 ⇄ Study, 英语 ⇄ English, …). Names entered by the user are never modified; the
  rename is undoable and reported in the confirmation message.
- **Internal**: the source scanner now uses a small lexer instead of a regular expression, so
  literals inside nested template expressions are extracted and verified as well.

## v1.2.2 — 2026-11-04

- **Fixed**: strings that never reach the DOM translator — the notification subtitle, export
  file names, and the Service Worker offline response.
- **Fixed**: attributes set at runtime (`title`, `aria-label`, `placeholder`) are now translated;
  the mutation observer watches attribute changes in addition to text.
- **Changed**: all user-visible text in `MainActivity` and `TimerService` moved into
  `res/values{,-en}/strings.xml`. A static check now fails if a Java string literal contains
  Chinese characters.
- **Added**: English resources, so the launcher label reads *Cike* on English systems.

## v1.2.1 — 2026-11-04

- **Fixed**: sentences composed at render time were not translated — statistics KPI titles,
  card headings, hour and month axis labels, the period chart's subtitle and footnote,
  accessibility labels, and goal summaries.
- **Added**: two generic translation strategies instead of phrase-by-phrase entries —
  recursive translation of ` · `-separated fragments, and of trailing parenthetical clauses.
- **Internal**: three render-level scanners added to the verification pipeline (views, static
  shell, sheet templates).

## v1.2.0 — 2026-11-04

- **Added**: Chinese / English interface with a *follow system* default for new installs.
  Implemented as a runtime DOM translation layer, so no view code carries translation keys.
- **Added**: English duration and date formats (`1h 05m`, `Nov 4`).
- **Added**: English application name resource.

## v1.1.5 — 2026-11-03

- **Fixed**: the entry editor could not be scrolled reliably. The sheet measured its own box
  instead of the scrolling body, so any downward drag was treated as dismissal while native
  scrolling was suppressed.
- **Fixed**: drag-to-dismiss now uses touch events, tolerates 8 px of residual scroll offset,
  and only takes over once the content is already at the top.
- **Added**: configurable undo duration (3 / 5 / 8 / 10 seconds).

## v1.1.4 — 2026-11-03

- **Fixed**: the *follow system* theme never applied inside the APK. WebView reports the
  application theme rather than the system one; the native bridge now reports the real value
  and notifies the page on configuration changes.

## v1.1.3 — 2026-11-03

- **Fixed**: the collapsed notification was clipped. Collapsed and expanded states now use two
  RemoteViews layouts — one row when collapsed, three rows when expanded.

## v1.1.2 — 2026-11-03

- **Added**: custom notification layout, with the type name and elapsed time as primary
  information. The “logged today” line was removed.
- **Changed**: the period chart follows the selected range (24 h / week / month / year) instead
  of always showing a single day.
- **Fixed**: duplicating an entry whose end time lay in the future produced a zero-length copy.

## v1.1.1 — 2026-11-03

- **Added**: lock-screen visibility for the timer notification.
- **Added**: the foreground service is sticky, survives task removal, and restores its last
  state if the process is recreated.
- **Added**: a status row under *Me → Notifications* reporting whether notifications are
  enabled, silenced or blocked, with a shortcut to the system settings.

## v1.1.0 — 2026-11-02

- **Added**: ongoing timer notification backed by a foreground service, using the system
  chronometer so the seconds advance without waking the app. The paused state shows a static
  duration instead, to avoid an implicit resume.
- **Added**: notification permission request on first launch (API 33+).

## v1.0.10 — 2026-11-02

- **Fixed**: dragging a sub-type between groups no longer recolours it; grouping conveys
  position, not colour.
- **Fixed**: tapping a bottom tab no longer plays the 260 ms page transition, which made
  switching feel unresponsive on large data sets.
- **Fixed**: sheet footer buttons no longer leave the viewport when the keyboard opens.
- **Fixed**: the hidden file input used for JSON import is attached to the document.
- **Fixed**: storage writes failed silently after the IndexedDB connection was closed; the
  connection is re-established and the operation retried once.
- **Fixed**: *Undo* now reports success or failure.

## v1.0.8 — 2026-11-02

- **Changed**: the application shell is a full-viewport two-row grid, so the bottom navigation
  is a grid row rather than a positioned element. This eliminates the class of defects where
  the navigation drifted during page transitions.
- **Fixed**: page transitions could flash white; the scrolling container now has an opaque
  background and no longer combines `contain: paint` with a transform.

## v1.0.7 — 2026-11-02

- **Fixed**: bottom navigation jumped to the top of the screen and page switches flickered,
  caused by a flex layout whose height depended on an ancestor chain.

## v1.0.6 — 2026-11-02

- **Fixed**: closing a sheet with the back gesture left the page scroll-locked.
- **Fixed**: taps immediately after a sheet closed were absorbed by the backdrop.
- **Fixed**: a pending page transition could be re-applied by a stale timer; transitions are
  now cancelled on navigation and on re-render.
- **Fixed**: the click-swallow window after a swipe was reduced from 480 ms to 220 ms, and
  navigation and sheet taps are no longer swallowed.

## v1.0.5 — 2026-11-02

- **Fixed**: bottom navigation dropped by half a row during swipes (`position: fixed` inside a
  transformed subtree).
- **Fixed**: the back gesture exited the application after closing an open sheet, instead of
  stepping through history.

## v1.0.4 — 2026-11-02

- **Fixed**: `window.confirm()` returned `false` inside the WebView because no
  `WebChromeClient.onJsConfirm` implementation was registered, silently cancelling the import
  and delete-group confirmations.
- **Fixed**: the back gesture closes sheets first.
- **Fixed**: Android's forced dark mode doubled the application's own dark palette.
- **Fixed**: haptics were inaudible because WebView has no `navigator.vibrate`; a native bridge
  method was added.
- **Fixed**: a missing icon symbol left the new-group button blank.

## v1.0 — 2026-11-02

- First release: four screens, two-level types, goals, statistics, import/export, and an
  offline Android APK with no network permission.
