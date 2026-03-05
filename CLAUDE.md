# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**知织 (ZhiZhi)** - A WeChat mini-program for knitting/crochet enthusiasts to track stitch counts and manage project references.

## Development Commands

```bash
# Install dependencies
npm install

# Build CSS (converts px to rpx for counter component)
npm run build

# Build and deploy: Use WeChat DevTools to compile and preview
```

## Project Structure

```
fabric-wx/
├── fabric/                      # Mini-program source directory (miniprogramRoot)
│   ├── pages/                   # Page modules
│   │   ├── home/                # Home page - image/PDF file management
│   │   ├── counter/             # Counter page - main counter interface with tabs
│   │   ├── detail/              # Detail page - view imported files
│   │   ├── library/             # Library page
│   │   ├── settings/            # Settings page
│   │   └── memo/                # Memo page - edit notes for counters
│   ├── components/              # Reusable components
│   │   ├── counter/             # Main counter component with timer/history
│   │   ├── simple-counter/      # Simplified counter variant
│   │   ├── animate-numbers/     # Animated number display
│   │   ├── dynamic-svg/         # SVG icon renderer
│   │   └── toast/               # Custom toast component
│   ├── custom-tab-bar/          # Custom bottom tab bar
│   ├── utils/                   # Utility functions
│   │   ├── event_bus.ts         # Type-safe event emitter
│   │   ├── vibrate.ts           # Haptic feedback utilities
│   │   ├── util.ts              # General utilities
│   │   └── base64.ts            # Base64 encoding
│   └── assets/                  # Static assets (SVG icons, audio, images)
├── typings/                     # TypeScript type definitions
├── gulpfile.js                  # Gulp build for CSS processing
├── package.json                 # Dependencies and scripts
└── project.config.json          # WeChat DevTools configuration
```

## Architecture

### UI Component Libraries
- **TDesign Miniprogram** (`tdesign-miniprogram`) - Primary UI component library
- **Vant Weapp** (`@vant/weapp`) - Secondary UI components (dialogs, buttons, tabs)
- **WeUI Miniprogram** - Enabled via `useExtendedLib` in app.json

### Key Patterns

**Event Bus**: A type-safe event emitter (`fabric/utils/event_bus.ts`) for cross-component communication:
```typescript
import { eventBus } from "../../utils/event_bus";
eventBus.emit('refreshCounter', { counterKey: string });
eventBus.on('refreshCounter', ({ counterKey }) => { ... });
```

**Component Communication**: Parent-child communication uses `triggerEvent` and property bindings:
```typescript
// Child component
this.triggerEvent('showTargetInput', { key, currentTarget });

// Parent page template
<counter bind:showTargetInput="handleShowTargetInput" />
```

**Data Persistence**: Counter and file data stored in `wx.Storage`:
- `imageList` / `fileList` - Home page file management
- `counter_keys` - List of counter identifiers
- `counter_*` - Individual counter data (count, history, timer state, memo)
- Settings: `counter_vibration_state`, `counter_voice_state`, `counter_keep_screen_state`

### Component Architecture

**counter component** (`fabric/components/counter/`) - Core business component:
- Tracks current count, target count, elapsed time
- Maintains history (last 20 entries with timestamps)
- Supports voice feedback and haptic feedback
- Memo/notes functionality per counter
- Timer with pause/resume and state persistence

**Page structure**: Each page has standard WeChat mini-program files:
- `*.ts` - Page logic using `Page()` wrapper
- `*.wxml` - Template
- `*.wxss` - Styles (px-to-rpx via gulp)
- `*.json` - Component imports and configuration

## Technical Details

**TypeScript Configuration**:
- Module: CommonJS, Target: ES2020
- Strict mode enabled with full strict checks
- Custom type definitions in `typings/` directory

**Styling**:
- Uses `gulp-postcss` with `postcss-px2units` for px-to-rpx conversion
- Run `npm run build` before preview to process styles

**glass-easel**: Component framework enabled in `app.json` for improved performance.

## Testing

No formal test framework configured. Manual testing via WeChat DevTools simulator.
