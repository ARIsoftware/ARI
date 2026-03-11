# Shipments Module

Track packages, deliveries, and shipments with status updates and delivery dates.

## Overview

The Shipments module provides a comprehensive package tracking system for managing deliveries. It includes real-time status updates, carrier tracking integration, and delivery date management.

## Features

- **Package Tracking**: Track multiple shipments with tracking codes and carrier information
- **Status Management**: Monitor shipment status (pending, in transit, out for delivery, delivered, delayed, returned)
- **Real-time Updates**: Automatic updates when shipment status changes
- **Carrier Integration**: Link directly to carrier tracking pages
- **Delivery Dates**: Track expected delivery dates
- **Search & Filter**: Find shipments by name, tracking code, or carrier
- **Stats Dashboard**: View totals for all shipments, in-transit, delivered, and needs attention
- **Notes**: Add custom notes to any shipment

## Database

### Tables

- **shipments** - Main shipments table with RLS policies

### Schema

```sql
CREATE TABLE shipments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  tracking_code TEXT,
  tracking_link TEXT,
  carrier TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  expected_delivery TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS policies ensure users can only see their own shipments
```

## API Endpoints

### Module API Routes

- `GET /api/modules-core/shipments/list` - Get all shipments for current user
- `POST /api/modules-core/shipments/list` - Create a new shipment
- `GET /api/modules-core/shipments/[id]` - Get a single shipment by ID
- `PATCH /api/modules-core/shipments/[id]` - Update a shipment
- `DELETE /api/modules-core/shipments/[id]` - Delete a shipment

### Request/Response Examples

**Create Shipment**
```typescript
POST /api/modules-core/shipments/list
{
  "shipment": {
    "name": "New Laptop",
    "tracking_code": "1Z999AA10123456784",
    "tracking_link": "https://www.ups.com/track?tracknum=1Z999AA10123456784",
    "carrier": "UPS",
    "status": "in_transit",
    "expected_delivery": "2025-10-20",
    "notes": "Signature required"
  }
}
```

**Update Shipment**
```typescript
PATCH /api/modules-core/shipments/[id]
{
  "status": "delivered",
  "notes": "Left at front door"
}
```

## Usage

### Accessing the Module

Navigate to `/shipments` to view the shipment tracker interface.

### Adding a Shipment

1. Click "Add Shipment" button
2. Fill in package details:
   - Package Name (required)
   - Tracking Code (optional)
   - Tracking Link (optional)
   - Carrier (optional)
   - Status (default: pending)
   - Expected Delivery (optional)
   - Notes (optional)
3. Click "Add Shipment"

### Tracking Status

Status options:
- **Pending**: Shipment created but not yet shipped
- **In Transit**: Package is on its way
- **Out for Delivery**: Package is on the delivery vehicle
- **Delivered**: Package has been delivered
- **Delayed**: Shipment is experiencing delays
- **Returned**: Package was returned to sender

### Real-time Updates

The module uses Supabase real-time subscriptions to automatically update the UI when shipments change. No page refresh needed!

## Configuration

### Module Settings

In `module.json`:
- **enabled**: true (enabled by default for all users)
- **menuPriority**: 50 (default priority in sidebar)
- **fullscreen**: false (shows in normal layout with sidebar)
- **icon**: Package (Lucide icon)

### Customization

To customize the module:
1. Edit `module.json` to change display settings
2. Modify `app/page.tsx` to adjust the UI
3. Update `lib/shipments.ts` for custom business logic
4. Add new API endpoints in `api/` directory

## Development

### File Structure

```
/modules-core/shipments/
├── module.json              # Module manifest
├── README.md                # This file
├── app/
│   └── page.tsx            # Main shipment tracker page
├── lib/
│   ├── shipments.ts        # Helper functions and types
│   └── validation.ts       # Zod validation schemas
└── api/
    ├── list/
    │   └── route.ts        # GET/POST list operations
    └── [id]/
        └── route.ts        # GET/PATCH/DELETE by ID
```

### Adding New Features

To add new features:
1. Update the database schema if needed (create migration SQL)
2. Add new API endpoints in `api/` directory
3. Update types in `lib/shipments.ts`
4. Update validation schemas in `lib/validation.ts`
5. Modify UI in `app/page.tsx`

## Version History

- **1.0.0** (October 2025) - Initial release
  - Package tracking with status management
  - Real-time updates
  - Carrier tracking integration
  - Search and filter functionality
  - Stats dashboard

## Support

For issues or feature requests, please contact the ARI Team at ari@ari.software.
