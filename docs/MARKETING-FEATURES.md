# ARI - Technology & Features Overview

> A modern, full-stack productivity platform built with cutting-edge technologies.

---

## Core Framework

- **Next.js 15** - The React framework for production, with App Router, Server Components, and edge-ready deployment
- **React 19** - Latest React with concurrent features, automatic batching, and improved performance
- **TypeScript 5.9** - Full type safety across the entire codebase with strict mode enabled

---

## UI & Design System

### Component Library
- **Radix UI** - Unstyled, accessible component primitives (20+ components)
  - Dialog, Dropdown Menu, Accordion, Tabs, Tooltip, and more
  - Full keyboard navigation and screen reader support
- **Shadcn/ui** - Beautiful, customizable component library built on Radix
- **Lucide React** - 1000+ crisp, consistent icons

### Styling & Animation
- **Tailwind CSS** - Utility-first CSS framework with custom design tokens
- **Framer Motion** - Production-ready motion library for fluid animations
- **tailwindcss-animate** - Pre-built animation utilities
- **class-variance-authority** - Type-safe variant management for components
- **tailwind-merge** - Intelligent class merging without conflicts
- **DM Sans** - Modern, geometric sans-serif typography

### Layout & Interaction
- **@dnd-kit** - Modern drag-and-drop toolkit
  - Sortable lists and grids
  - Multi-container support
  - Touch and keyboard accessible
- **react-resizable-panels** - Resizable panel layouts
- **Vaul** - Drawer component for mobile-first interfaces
- **cmdk** - Command palette with fuzzy search
- **Embla Carousel** - Lightweight, extensible carousel

### Data Visualization
- **Recharts** - Composable charting library built on D3
- **Leaflet & React Leaflet** - Interactive maps with custom markers and layers

---

## 3D Graphics & Visualization

- **Three.js** - Powerful 3D library for WebGL rendering
- **React Three Fiber** - React renderer for Three.js
- **React Three Drei** - Useful helpers and abstractions for R3F
  - Pre-built components: OrbitControls, Environment, Text3D
  - Performance optimizations: Instances, LOD, Preload

---

## Database & Backend

### Current Stack
- **Supabase** - Open source Firebase alternative
  - PostgreSQL database with real-time subscriptions
  - Row Level Security (RLS) for data isolation
  - Edge Functions for serverless compute
- **Supabase Auth** - Native authentication with email/password
- **Supabase SSR** - Server-side rendering support for Next.js

### Coming Soon
- **Better Auth** - Modern, framework-agnostic authentication library
- **Prisma** - Next-generation ORM with type-safe database access

---

## AI Integration

- **Vercel AI SDK** - Unified API for AI providers
  - `@ai-sdk/openai` - OpenAI integration
  - `@ai-sdk/react` - React hooks for streaming AI responses
  - `ai` - Core SDK with streaming, tool calling, and structured outputs
- **Deep AI Assistant Integration** - Conversational AI built into the platform
  - Real-time streaming responses
  - Context-aware assistance
  - Clean, minimal chat interface

---

## Forms & Validation

- **React Hook Form** - Performant, flexible form handling
- **Zod** - TypeScript-first schema validation
- **@hookform/resolvers** - Zod integration for form validation
- **input-otp** - One-time password input component
- **React Day Picker** - Flexible date picker component

---

## Developer Experience

- **ESLint** - Linting with Next.js configuration
- **PostCSS** - CSS processing pipeline
- **Autoprefixer** - Automatic vendor prefixes
- **Type Definitions** - Full TypeScript support for all libraries

---

## Utilities

- **date-fns** - Modern JavaScript date utility library
- **clsx** - Conditional className utility
- **Sonner** - Beautiful toast notifications
- **canvas-confetti** - Celebration animations
- **next-themes** - Dark/light mode with system preference detection

---

## Gamification & Engagement

- **React Tetris** - Built-in games for break time
- **Confetti Celebrations** - Visual rewards for achievements
- **Focus Timer System** - Pomodoro-style productivity timers
- **Exercise Reminders** - Hourly wellness prompts
- **Contribution Graphs** - GitHub-style activity tracking

---

## Data Management

### Backup & Restore System
- **3-Tier Table Discovery** - Automatic detection of all database tables
- **Complete SQL Export** - Full database backup with schemas, data, and constraints
- **Checksum Verification** - Data integrity validation
- **One-Click Restore** - Transaction-safe database restoration
- **Preview Before Export** - Verify what will be backed up

### Real-Time Features
- **Supabase Subscriptions** - Live data updates across clients
- **Optimistic Updates** - Instant UI feedback
- **Automatic Sync** - Cross-device data synchronization

---

## Module System

ARI features a powerful, self-contained module architecture:

### Plug-and-Play Architecture
- Drop-in module installation - just add a folder
- Zero-config module discovery
- Automatic sidebar integration
- Independent versioning per module

### Module Capabilities
- **Custom Pages** - Full Next.js page support within modules
- **API Routes** - Dedicated API endpoints per module
- **Database Tables** - Self-contained schemas with RLS policies
- **Dashboard Widgets** - Optional dashboard integration
- **Settings Panels** - Per-module configuration UI
- **Top Bar Icons** - Quick access shortcuts in global navigation

### Developer Features
- **Module Manifest** - JSON-based configuration (`module.json`)
- **TypeScript Types** - Full type safety for module development
- **Migration System** - Database schema versioning
- **Utility Functions** - Server-side helpers (`isModuleEnabled`, `getModules`)
- **React Hooks** - Client-side hooks (`useModuleEnabled`, `useModules`)

### Flexible Layout Options
- Standard layout with sidebar and header
- Fullscreen mode for immersive experiences
- Custom menu positioning (main, bottom, secondary)
- Configurable menu priority/ordering

---

## Security Features

- **Row Level Security** - Database-level user isolation
- **Middleware Protection** - Route-based access control
- **Zod Validation** - Input validation on all API endpoints
- **Defense in Depth** - Multiple security layers
- **Automatic Session Management** - Secure token refresh

---

## Coming Soon

### Better Auth
- Modern, framework-agnostic authentication
- Social login providers
- Magic links and passwordless auth
- Multi-factor authentication (MFA)
- Session management

### Prisma ORM
- Type-safe database queries
- Auto-generated migrations
- Database introspection
- Query optimization
- Multi-database support

---

## Architecture & Performance

- **React Server Components** - Reduced client-side JavaScript
- **Streaming & Suspense** - Progressive page loading
- **Dynamic Imports** - Code splitting for faster initial loads
- **Edge Middleware** - Authentication at the edge
- **Static Generation** - Pre-rendered pages where possible
- **Prefetching** - Instant navigation between pages

---

## Accessibility

- **WCAG Compliant Components** - Radix UI built for accessibility
- **Keyboard Navigation** - Full keyboard support throughout
- **Screen Reader Support** - Proper ARIA labels and roles
- **Focus Management** - Logical focus flow in modals and dialogs
- **Color Contrast** - Accessible color palette in light and dark modes
- **Reduced Motion** - Respects user motion preferences

---

## Deployment Ready

- **Vercel-optimized** - Zero-config deployment
- **Edge Runtime** - Serverless at the edge
- **Image Optimization** - Automatic image processing
- **ISR Support** - Incremental static regeneration
- **Environment Variables** - Secure secrets management

---

## Developer Tools

- **Debug Page** - Built-in diagnostics and system health checks
- **Module Registry** - Auto-generated module discovery
- **Comprehensive Documentation** - Detailed technical guides (CLAUDE.md, MODULES.md)
- **SQL Migration Files** - Version-controlled database schemas
- **Hot Module Replacement** - Instant development feedback

---

*Built with modern web technologies for performance, accessibility, and developer experience.*
