# ARI User Guide

Welcome to **ARI**—a digital workspace that brings your tasks, fitness goals, shipments, motivation board, contacts, and AI assistant into one secure hub. This guide walks you through the everyday experience of using ARI so you can get productive quickly, share the right information with teammates, and feel confident exploring every feature.

---

## 1. Getting Started
### Create or access your account
1. Visit `https://your-ari-domain/sign-up` to create a new account.
2. Enter your email and a password (minimum six characters). ARI sends you a confirmation email from Supabase—click the link inside to finish registration.
3. Already have an account? Go straight to `https://your-ari-domain/sign-in` and sign in with your email and password.

> **Tip:** If you lose access to the confirmation email, check your spam folder or request another link from the sign-up screen.

### Signing out
Open the profile menu in the sidebar footer and choose **Sign out**. ARI clears every Supabase session cookie, so shared computers stay secure.

---

## 2. Layout at a Glance
- **Sidebar:** Your main navigation, grouped by workspace (Dashboard, Assist, Todo, Fitness First, People, Shipments, Settings, and more). Items shown depend on the features enabled for your account.
- **Top bar:** Context-specific actions, breadcrumbs that show where you are, and the hamburger button to collapse the sidebar on smaller screens.
- **Content area:** The primary workspace for whichever module you open.
- **Global tools:** Toast notifications keep you informed, the exercise reminder nudges you periodically, and a floating YouTube music player lives at the top-right so you can listen while working.

---

## 3. Task Management
The **Todo → All Tasks** page is your primary task board.

### View and organize tasks
- Tasks appear in a sortable list ordered by their priority and `order_index` value.
- Use drag-and-drop to reorder items. The system saves the new order immediately.
- Star important tasks to surface them in other views.

### Create a task
1. Click **New Task** on the dashboard or visit **Todo → Add Task**.
2. Fill in the title, optional description, due date, priority, subtasks, and assignees.
3. Submit to see the new task appear instantly.

### Update or complete tasks
- Click a task row to open editing controls. You can change status, priority, due date, or assignees.
- Toggle **Completed** to mark the task done. ARI increments your completion stats automatically.
- Use **Task Radar** to visualize high-priority work. Each node represents a task with color and radius helping you spot urgency at a glance.

### Track progress
- The **Dashboard** shows quick stats: total tasks, items completed today, high-priority workload, and trends over time.
- The **Task Analytics** chart (Dashboard) visualizes tasks created vs. completed for a selected time range.

---

## 4. Fitness & HYROX Training
### Daily fitness tasks
- Visit **Fitness First → Daily Fitness** to see workout cards pulled from `fitness_database`.
- Toggle completion as you finish sets, reorder the day’s plan, or hit **Add Sample Workouts** to preload the template routine.
- If you add YouTube links, ARI renders inline players so you can follow along.

### HYROX performance hub
- Head to **Fitness First → Hyrox** for race-specific tracking.
- Review personal records for every station, log new workouts, and compare current times against goals.
- Admins can seed or reset station data from the same area if the organization uses shared benchmarks.

---

## 5. Motivation Board
Tap into inspiration in **Motivation**:
- Add new cards for YouTube, Instagram, Twitter, or custom photos. Paste a link and ARI will fetch thumbnails and descriptions where possible.
- Drag cards to reorder your board. The layout updates immediately, and positions persist across sessions.
- Upload personal images to the `motivation-photos` storage bucket. Images are public so they can load quickly across devices.

---

## 6. Contacts & Shipments
### Contacts
- Open **People → All Contacts** to maintain your network.
- Create entries for teammates, partners, or clients—add optional phone, company, and notes fields.
- Update or delete contacts with inline actions. All information stays private thanks to Supabase RLS (only you can view your records).

### Shipments
- Navigate to **Shipments → All Shipments** for delivery tracking.
- Attach tracking codes, carrier details, expected delivery dates, and notes.
- Colored badges show shipment status (pending, in transit, delivered, delayed, etc.).
- Use the format hint (“Today”, “In 3 days”) to understand at a glance when packages arrive.

---

## 7. Goals, Notes, and Context
### Northstar Goals
- Visit **Northstar** to manage long-term objectives.
- Each card includes a category, priority, deadline, progress percentage, and `display_priority` for arranging the board.
- Update progress regularly to keep analytics and AI context aligned with reality.

### Personal Notepad
- Head to **Debug → Notepad** (or the dedicated shortcut in your UI) for a simple running document.
- Every save creates a revision stored in Supabase. Use the **Revision History** modal to roll back to earlier notes.

### Recent activity and announcements
- The **Dashboard** and **Task Announcement** component surface recent completions, upcoming reminders, and news from your team.

---

## 8. ARI Assist (AI Copilot)
- Open **Assist** to chat with ARI’s AI assistant.
- The assistant already knows your task counts, overdue items, high-priority work, and shipment status through a real-time context feed.
- Ask questions like “What should I tackle next?”, “Summarize overdue tasks”, or “How many shipments are still in transit?”
- Responses stream in real time, and you can copy results or ask follow-up questions without losing context.

> **Privacy note:** The assistant only reads your data to craft answers; it does not change anything unless you explicitly act on its advice.

---

## 9. Settings & Feature Controls
### Personal preferences
- Visit **Settings** to see a multi-tab panel for notifications, theme, workspace name, and more.
- Toggle beta features such as predictive scheduling or smart priorities (availability depends on your account).

### Feature visibility
- Scroll to **Feature Controls** to enable or disable modules like Motivation, Northstar, or Shipments.
- Disabling a feature removes it from the sidebar and blocks direct URL access. You can re-enable it anytime.

### Backups (admin only)
- If you are listed as an administrator, the Settings page unlocks backup import/export tools.
- Exports bundle your current tables into a downloadable SQL file.
- Imports validate the file, run a dry check, then apply changes with progress feedback. Always confirm you are in the correct environment before running an import.

---

## 10. Troubleshooting & Support
- **Forgot password:** Use the “Forgot password?” option on the sign-in page to request a reset email.
- **Supabase connection issues:** Visit `/api/test-connection` in your browser. A success message confirms the backend is reachable.
- **Feature missing:** Check **Settings → Feature Controls** to ensure the module is enabled for your account.
- **Stuck data or long imports:** Administrators can try again after a minute—the system releases server locks automatically.
- **Need help:** Contact your workspace administrator or support channel with the time of the issue and what feature you were using. Console messages (visible via browser dev tools) often include helpful error codes.

---

## 11. Tips for Teams
- Encourage teammates to enable only the features they use daily—this keeps the sidebar clean and navigation fast.
- Share dashboards during stand-ups: the Task Analytics chart and HYROX progress visuals make excellent collaboration touchpoints.
- Use the Motivation board for shared inspiration—team members who upload to the same Supabase project will see the full collection.
- When performing backups or bulk imports, communicate timing to avoid conflicting edits.

---

With this guide, you should feel comfortable exploring every corner of ARI. Log in, customize your workspace, and let the assistant keep you focused on what matters most. Happy shipping, training, planning, and building!
