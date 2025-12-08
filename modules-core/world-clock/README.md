# World Clock Module

A simple module that displays digital clocks for three time zones:
- South Africa (Africa/Johannesburg)
- Toronto (America/Toronto)
- Nashville (America/Chicago - Central Time)

## Features

- Real-time digital clocks updating every second
- Clean 3-column layout
- Displays both time and date for each location
- Responsive design

## Installation

This module is already installed in the `/modules` directory. To use it:

1. **Navigate to** `/world-clock` to see the clocks
2. No database setup required - this module is display-only

## File Structure

```
modules/world-clock/
├── module.json                 # Module manifest
├── README.md                   # This file
└── app/                        # Module pages
    └── page.tsx               # Main clock display page
```

## Customization

To add more time zones or change existing ones, edit the `timeZones` array in `app/page.tsx`:

```typescript
const timeZones: TimeZoneInfo[] = [
  {
    name: 'Your City',
    timezone: 'Your/Timezone',  // Use IANA timezone format
    flag: '🏴'  // Add appropriate flag emoji
  }
]
```

## License

Part of the ARI project.
