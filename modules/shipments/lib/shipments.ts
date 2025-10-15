export type Shipment = {
  id: string
  name: string
  tracking_code: string | null
  tracking_link: string | null
  carrier: string | null
  status: 'pending' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'delayed' | 'returned'
  expected_delivery: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export async function getShipments(getToken: () => Promise<string | null>): Promise<Shipment[]> {
  const token = await getToken()

  if (!token) {
    throw new Error('Authentication required')
  }

  const response = await fetch('/api/modules/shipments/items', {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  })
  
  if (!response.ok) {
    const error = await response.json()
    console.error("Error fetching shipments:", error)
    throw new Error(error.error || 'Failed to fetch shipments')
  }

  return await response.json()
}

export async function getShipment(id: string, getToken: () => Promise<string | null>): Promise<Shipment | null> {
  const token = await getToken()
  
  if (!token) {
    throw new Error('Authentication required')
  }

  const response = await fetch(`/api/modules/shipments/items?id=${id}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  })
  
  if (!response.ok) {
    const error = await response.json()
    console.error("Error fetching shipment:", error)
    throw new Error(error.error || 'Failed to fetch shipment')
  }

  return await response.json()
}

export async function createShipment(
  shipment: Omit<Shipment, "id" | "created_at" | "updated_at">,
  getToken: () => Promise<string | null>
): Promise<Shipment> {
  const token = await getToken()
  
  if (!token) {
    throw new Error('Authentication required')
  }

  const response = await fetch('/api/modules/shipments/items', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ shipment }),
  })

  if (!response.ok) {
    const error = await response.json()
    console.error("Error creating shipment:", error)
    throw new Error(error.error || 'Failed to create shipment')
  }

  return await response.json()
}

export async function updateShipment(
  id: string,
  updates: Partial<Omit<Shipment, "id" | "created_at" | "updated_at">>,
  getToken: () => Promise<string | null>
): Promise<Shipment> {
  const token = await getToken()
  
  if (!token) {
    throw new Error('Authentication required')
  }

  const response = await fetch(`/api/modules/shipments/items?id=${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(updates),
  })

  if (!response.ok) {
    const error = await response.json()
    console.error("Error updating shipment:", error)
    throw new Error(error.error || 'Failed to update shipment')
  }

  return await response.json()
}

export async function deleteShipment(id: string, getToken: () => Promise<string | null>): Promise<void> {
  const token = await getToken()
  
  if (!token) {
    throw new Error('Authentication required')
  }

  const response = await fetch(`/api/modules/shipments/items?id=${id}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  })

  if (!response.ok) {
    const error = await response.json()
    console.error("Error deleting shipment:", error)
    throw new Error(error.error || 'Failed to delete shipment')
  }
}

// Helper function to get status color
export function getStatusColor(status: string): string {
  switch (status) {
    case "delivered":
      return "bg-green-500"
    case "in_transit":
      return "bg-blue-500"
    case "out_for_delivery":
      return "bg-yellow-500"
    case "delayed":
      return "bg-orange-500"
    case "returned":
      return "bg-red-500"
    case "pending":
    default:
      return "bg-gray-500"
  }
}

// Helper function to get status badge color
export function getStatusBadgeColor(status: string): string {
  switch (status) {
    case "delivered":
      return "bg-green-100 text-green-800"
    case "in_transit":
      return "bg-blue-100 text-blue-800"
    case "out_for_delivery":
      return "bg-yellow-100 text-yellow-800"
    case "delayed":
      return "bg-orange-100 text-orange-800"
    case "returned":
      return "bg-red-100 text-red-800"
    case "pending":
    default:
      return "bg-gray-100 text-gray-800"
  }
}

// Helper function to format expected delivery date
export function formatExpectedDelivery(dateString: string | null): string {
  if (!dateString) return "Not specified"
  
  const date = new Date(dateString)
  const today = new Date()
  const diffTime = date.getTime() - today.getTime()
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  
  const options: Intl.DateTimeFormatOptions = { 
    month: 'short', 
    day: 'numeric', 
    year: 'numeric' 
  }
  
  const formattedDate = date.toLocaleDateString('en-US', options)
  
  if (diffDays === 0) {
    return `Today - ${formattedDate}`
  } else if (diffDays === 1) {
    return `Tomorrow - ${formattedDate}`
  } else if (diffDays > 1 && diffDays <= 7) {
    return `In ${diffDays} days - ${formattedDate}`
  } else if (diffDays < 0) {
    return `${Math.abs(diffDays)} days ago - ${formattedDate}`
  }
  
  return formattedDate
}