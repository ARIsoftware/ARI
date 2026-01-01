"use client"

import type React from "react"
import { useSupabase } from "@/components/providers"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Search, Plus, Package, Truck, Clock, CheckCircle, AlertCircle, Loader2, ExternalLink, Edit2, Trash2, TruckIcon } from "lucide-react"
import { useState } from "react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { MoreVertical } from "lucide-react"
import {
  createShipment,
  updateShipment,
  deleteShipment,
  getStatusBadgeColor,
  formatExpectedDelivery,
  type Shipment
} from "@/modules/shipments/lib/shipments"
import { useShipments, useInvalidateShipments } from "@/lib/hooks/use-shipments"
import { useToast } from "@/hooks/use-toast"

export default function ShipmentsPage() {
  const { session } = useSupabase()
  const user = session?.user
  const { toast } = useToast()

  // TanStack Query for shipments - replaces local state + realtime subscription
  const { data: shipments = [], isLoading: loading } = useShipments()
  const invalidateShipments = useInvalidateShipments()

  const [searchQuery, setSearchQuery] = useState("")
  const [selectedStatus, setSelectedStatus] = useState("all")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingShipment, setEditingShipment] = useState<Shipment | null>(null)
  const [saving, setSaving] = useState(false)
  const [showDeliveryAnimation, setShowDeliveryAnimation] = useState(false)

  // Form states
  const [formData, setFormData] = useState({
    name: "",
    tracking_code: "",
    tracking_link: "",
    carrier: "",
    status: "pending" as Shipment['status'],
    expected_delivery: "",
    notes: ""
  })

  const statuses = ["all", "pending", "in_transit", "out_for_delivery", "delivered", "delayed", "returned"]

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      toast({
        title: "Error",
        description: "Package name is required",
        variant: "destructive",
      })
      return
    }

    setSaving(true)
    try {
      const tokenFn = async () => session?.access_token || null

      const shipmentData = {
        name: formData.name,
        tracking_code: formData.tracking_code || null,
        tracking_link: formData.tracking_link || null,
        carrier: formData.carrier || null,
        status: formData.status,
        expected_delivery: formData.expected_delivery || null,
        notes: formData.notes || null
      }

      if (editingShipment) {
        await updateShipment(editingShipment.id, shipmentData, tokenFn)
        toast({
          title: "Success",
          description: "Shipment updated successfully",
        })
      } else {
        await createShipment(shipmentData, tokenFn)
        toast({
          title: "Success",
          description: "Shipment added successfully",
        })
      }

      // Reset form
      setFormData({
        name: "",
        tracking_code: "",
        tracking_link: "",
        carrier: "",
        status: "pending",
        expected_delivery: "",
        notes: ""
      })
      setEditingShipment(null)
      setDialogOpen(false)

      // Refresh shipments
      invalidateShipments()
    } catch (error: any) {
      console.error("Failed to save shipment:", error)
      let errorMessage = "Failed to save shipment. Please try again."

      // Provide more specific error messages
      if (error?.message?.includes('relation "public.shipments" does not exist')) {
        errorMessage = "The shipments table hasn't been created yet. Please contact your administrator to set up the database."
      } else if (error?.message?.includes('authentication')) {
        errorMessage = "You need to be logged in to save shipments."
      } else if (error?.message) {
        errorMessage = error.message
      }

      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (shipment: Shipment) => {
    setEditingShipment(shipment)
    setFormData({
      name: shipment.name,
      tracking_code: shipment.tracking_code || "",
      tracking_link: shipment.tracking_link || "",
      carrier: shipment.carrier || "",
      status: shipment.status,
      expected_delivery: shipment.expected_delivery?.split('T')[0] || "",
      notes: shipment.notes || ""
    })
    setDialogOpen(true)
  }

  const handleDelete = async (shipmentId: string) => {
    if (!confirm("Are you sure you want to delete this shipment?")) {
      return
    }

    try {
      const tokenFn = async () => session?.access_token || null
      await deleteShipment(shipmentId, tokenFn)
      toast({
        title: "Success",
        description: "Shipment deleted successfully",
      })
      invalidateShipments()
    } catch (error) {
      console.error("Failed to delete shipment:", error)
      toast({
        title: "Error",
        description: "Failed to delete shipment. Please try again.",
        variant: "destructive",
      })
    }
  }

  const handleMarkDelivered = async (shipment: Shipment) => {
    try {
      // Trigger the animation first
      setShowDeliveryAnimation(true)

      // Update the shipment status to delivered
      const tokenFn = async () => session?.access_token || null
      await updateShipment(shipment.id, { ...shipment, status: 'delivered' }, tokenFn)

      // Refresh shipments from server
      invalidateShipments()

      // Show success message
      toast({
        title: "Success",
        description: "Shipment marked as delivered!",
      })

      // Hide animation after longest truck completes (3.5 seconds)
      setTimeout(() => {
        setShowDeliveryAnimation(false)
      }, 3500)
    } catch (error) {
      console.error("Failed to mark shipment as delivered:", error)
      setShowDeliveryAnimation(false)
      toast({
        title: "Error",
        description: "Failed to update shipment. Please try again.",
        variant: "destructive",
      })
    }
  }

  const filteredShipments = shipments.filter((shipment) => {
    const matchesSearch =
      shipment.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (shipment.tracking_code && shipment.tracking_code.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (shipment.carrier && shipment.carrier.toLowerCase().includes(searchQuery.toLowerCase()))

    const matchesStatus =
      selectedStatus === "all" || shipment.status === selectedStatus

    return matchesSearch && matchesStatus
  })

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "delivered":
        return <CheckCircle className="w-5 h-5 text-green-500" />
      case "in_transit":
        return <Truck className="w-5 h-5 text-blue-500" />
      case "out_for_delivery":
        return <Truck className="w-5 h-5 text-yellow-500" />
      case "delayed":
        return <AlertCircle className="w-5 h-5 text-orange-500" />
      case "returned":
        return <AlertCircle className="w-5 h-5 text-red-500" />
      case "pending":
      default:
        return <Clock className="w-5 h-5 text-gray-500" />
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex items-center gap-2">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>Loading shipments...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-medium">Shipment Tracker</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track all your packages and deliveries in one place
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button
              className="bg-black hover:bg-gray-800 flex items-center gap-2"
              onClick={() => {
                setEditingShipment(null)
                setFormData({
                  name: "",
                  tracking_code: "",
                  tracking_link: "",
                  carrier: "",
                  status: "pending",
                  expected_delivery: "",
                  notes: ""
                })
              }}
            >
              <Plus className="w-4 h-4" />
              Add Shipment
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editingShipment ? "Edit Shipment" : "Add New Shipment"}</DialogTitle>
              <DialogDescription>
                {editingShipment ? "Update the shipment details below" : "Track a new package or delivery"}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Package Name *</Label>
                <Input
                  id="name"
                  placeholder="e.g., Shoes, Electronics, Books"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="tracking_code">Tracking Code</Label>
                <Input
                  id="tracking_code"
                  placeholder="e.g., 1Z999AA10123456784"
                  value={formData.tracking_code}
                  onChange={(e) => setFormData({ ...formData, tracking_code: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="tracking_link">Tracking Link</Label>
                <Input
                  id="tracking_link"
                  type="url"
                  placeholder="https://tracking.example.com/..."
                  value={formData.tracking_link}
                  onChange={(e) => setFormData({ ...formData, tracking_link: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="carrier">Carrier</Label>
                <Input
                  id="carrier"
                  placeholder="e.g., FedEx, UPS, USPS, DHL"
                  value={formData.carrier}
                  onChange={(e) => setFormData({ ...formData, carrier: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="status">Status</Label>
                <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value as Shipment['status'] })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="in_transit">In Transit</SelectItem>
                    <SelectItem value="out_for_delivery">Out for Delivery</SelectItem>
                    <SelectItem value="delivered">Delivered</SelectItem>
                    <SelectItem value="delayed">Delayed</SelectItem>
                    <SelectItem value="returned">Returned</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="expected_delivery">Expected Delivery</Label>
                <Input
                  id="expected_delivery"
                  type="date"
                  value={formData.expected_delivery}
                  onChange={(e) => setFormData({ ...formData, expected_delivery: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  placeholder="Any additional information..."
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={handleSubmit} disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editingShipment ? "Update" : "Add"} Shipment
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-lg border">
          <div className="flex items-center gap-2 mb-2">
            <Package className="w-4 h-4 text-gray-500" />
            <p className="text-sm text-gray-600">Total Shipments</p>
          </div>
          <p className="text-3xl font-medium">{shipments.length}</p>
        </div>
        <div className="bg-white p-6 rounded-lg border">
          <div className="flex items-center gap-2 mb-2">
            <Truck className="w-4 h-4 text-blue-500" />
            <p className="text-sm text-gray-600">In Transit</p>
          </div>
          <p className="text-3xl font-medium">
            {shipments.filter(s => s.status === 'in_transit' || s.status === 'out_for_delivery').length}
          </p>
        </div>
        <div className="bg-white p-6 rounded-lg border">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-4 h-4 text-green-500" />
            <p className="text-sm text-gray-600">Delivered</p>
          </div>
          <p className="text-3xl font-medium">
            {shipments.filter(s => s.status === 'delivered').length}
          </p>
        </div>
        <div className="bg-white p-6 rounded-lg border">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-4 h-4 text-orange-500" />
            <p className="text-sm text-gray-600">Needs Attention</p>
          </div>
          <p className="text-3xl font-medium">
            {shipments.filter(s => s.status === 'delayed' || s.status === 'returned').length}
          </p>
        </div>
      </div>

      {/* Search and Filter Bar */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder="Search by package name, tracking code, or carrier..."
            className="pl-10 bg-white"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select value={selectedStatus} onValueChange={setSelectedStatus}>
          <SelectTrigger className="w-[180px] bg-white">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="in_transit">In Transit</SelectItem>
            <SelectItem value="out_for_delivery">Out for Delivery</SelectItem>
            <SelectItem value="delivered">Delivered</SelectItem>
            <SelectItem value="delayed">Delayed</SelectItem>
            <SelectItem value="returned">Returned</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Shipments Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredShipments.map((shipment) => (
          <div key={shipment.id} className="bg-white p-6 rounded-lg border hover:shadow-lg transition-shadow">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-gray-50">
                  <Package className="w-5 h-5 text-gray-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">{shipment.name}</h3>
                  {shipment.carrier && (
                    <p className="text-sm text-gray-500">{shipment.carrier}</p>
                  )}
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleEdit(shipment)}>
                    <Edit2 className="w-4 h-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleMarkDelivered(shipment)}>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Delivered
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleDelete(shipment.id)}
                    className="text-red-600"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                {getStatusIcon(shipment.status)}
                <Badge className={getStatusBadgeColor(shipment.status)}>
                  {shipment.status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </Badge>
              </div>

              {shipment.tracking_code && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">Tracking Code</p>
                  <p className="text-sm font-mono bg-gray-50 p-2 rounded">
                    {shipment.tracking_code}
                  </p>
                </div>
              )}

              {shipment.expected_delivery && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">Expected Delivery</p>
                  <p className="text-sm font-medium">
                    {formatExpectedDelivery(shipment.expected_delivery)}
                  </p>
                </div>
              )}

              {shipment.notes && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">Notes</p>
                  <p className="text-sm text-gray-600 line-clamp-2">
                    {shipment.notes}
                  </p>
                </div>
              )}

              {shipment.tracking_link && (
                <a
                  href={shipment.tracking_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
                >
                  Track Package
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
        ))}
      </div>

      {filteredShipments.length === 0 && (
        <div className="bg-white p-12 rounded-lg border text-center">
          <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-2">No shipments found</h3>
          <p className="text-sm text-gray-500 mb-4">
            {searchQuery || selectedStatus !== "all"
              ? "Try adjusting your filters or search query"
              : "Start tracking your packages by adding a shipment"}
          </p>
          {(!searchQuery && selectedStatus === "all") && (
            <Button
              size="sm"
              onClick={() => setDialogOpen(true)}
            >
              Add Your First Shipment
            </Button>
          )}
        </div>
      )}

      {/* Delivery Animation */}
      {showDeliveryAnimation && (
        <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 9000 }}>
          {[...Array(8)].map((_, i) => {
            // Different durations for each truck (in seconds)
            const durations = [2.0, 3.0, 2.3, 2.7, 1.8, 2.5, 3.2, 2.2]
            return (
              <div
                key={i}
                className="absolute text-6xl"
                style={{
                  left: `${10 + i * 11}%`,
                  bottom: '-150px',
                  animation: `truck-slide ${durations[i]}s ease-in forwards`,
                  animationDelay: `${i * 0.1}s`,
                }}
              >
                📦
              </div>
            )
          })}
        </div>
      )}

      <style jsx global>{`
        @keyframes truck-slide {
          0% {
            bottom: -150px;
            opacity: 1;
          }
          90% {
            opacity: 1;
          }
          100% {
            bottom: calc(100vh + 150px);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  )
}
