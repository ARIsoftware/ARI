"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Play, AlertCircle, Sparkles, Instagram, Twitter, GripVertical, Edit, RefreshCw } from "lucide-react";
import { useSupabase } from "@/components/providers";
import { AddMotivationModal } from "@/components/motivation/add-motivation-modal";
import { EditMotivationModal } from "@/components/motivation/edit-motivation-modal";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import Image from "next/image";
import { YouTubeModal } from "@/components/youtube-modal";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface MotivationItem {
  id: string;
  type: "youtube" | "instagram" | "photo" | "twitter";
  title?: string;
  url?: string;
  thumbnail_url?: string;
  image_url?: string;
  position?: number;
  created_at: string;
}

// Sortable Item Component
function SortableItem({ item, onDelete, onPlay, onEdit, onRefresh }: {
  item: MotivationItem;
  onDelete: (id: string) => void;
  onPlay: (item: MotivationItem) => void;
  onEdit: (item: MotivationItem) => void;
  onRefresh: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const getYouTubeThumbnail = (url: string) => {
    const videoId = url.match(
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s]+)/
    )?.[1];
    return videoId ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg` : null;
  };

  const renderContent = () => {
    switch (item.type) {
      case "youtube":
        const thumbnail = item.thumbnail_url || getYouTubeThumbnail(item.url || "");

        return (
          <div className="relative aspect-video bg-gradient-to-br from-red-600 to-red-800 rounded-lg overflow-hidden w-full max-w-full">
            {/* Fallback background with icon - always rendered */}
            <div className="absolute inset-0 flex items-center justify-center">
              <Play className="w-16 h-16 text-white" fill="white" />
            </div>

            {/* Image overlay - only shows if valid */}
            {thumbnail && (
              <img
                src={thumbnail}
                alt={item.title || "YouTube video"}
                className="absolute inset-0 w-full h-full object-cover z-10"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            )}

            {/* Hover overlay */}
            <div className="absolute inset-0 bg-black/0 hover:bg-black/40 transition-all flex items-center justify-center z-20">
              <div className="bg-black/75 rounded-full p-4 opacity-0 hover:opacity-100 transition-opacity">
                <Play className="text-white h-8 w-8 ml-1" fill="white" />
              </div>
            </div>
          </div>
        );

      case "twitter":
        return (
          <div className="relative aspect-square bg-gradient-to-br from-gray-800 to-black rounded-lg overflow-hidden w-full max-w-full">
            {/* Fallback background with icon - always rendered */}
            <div className="absolute inset-0 flex items-center justify-center">
              <Twitter className="w-16 h-16 text-white" fill="white" />
            </div>

            {/* Image overlay - only shows if valid */}
            {item.thumbnail_url && (
              <img
                src={item.thumbnail_url}
                alt={item.title || "Twitter post"}
                className="absolute inset-0 w-full h-full object-cover z-10"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            )}

            {/* Hover overlay */}
            <div className="absolute inset-0 bg-black/0 hover:bg-black/40 transition-all flex items-center justify-center z-20">
              <div className="bg-black/75 rounded-full p-4 opacity-0 hover:opacity-100 transition-opacity">
                <Play className="text-white h-8 w-8 ml-1" fill="white" />
              </div>
            </div>

            {/* Twitter badge icon */}
            <div className="absolute top-2 left-2 bg-black rounded-full p-2 z-30">
              <Twitter className="h-4 w-4 text-white" fill="white" />
            </div>
          </div>
        );

      case "instagram":
        // Check if base64 image is corrupted/truncated (all bad ones end with same pattern)
        const isCorruptedBase64 = item.thumbnail_url?.startsWith('data:image') && item.thumbnail_url.length < 100;

        return (
          <div className="relative aspect-square bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 p-0.5 rounded-lg overflow-hidden w-full max-w-full">
            <div className="bg-white dark:bg-gray-900 rounded-lg h-full overflow-hidden relative">
              {/* Fallback background with icon - always rendered */}
              <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-800">
                <Instagram className="w-16 h-16 text-gray-400" />
              </div>

              {/* Image overlay - only shows if valid and not corrupted */}
              {item.thumbnail_url && !isCorruptedBase64 && (
                <img
                  src={item.thumbnail_url}
                  alt={item.title || "Instagram post"}
                  className="absolute inset-0 w-full h-full object-cover z-10"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              )}
            </div>

            {/* Hover overlay */}
            <div className="absolute inset-0 bg-black/0 hover:bg-black/30 transition-all flex items-center justify-center z-20">
              <div className="bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 rounded-full p-4 opacity-0 hover:opacity-100 transition-opacity">
                <Play className="text-white h-8 w-8 ml-1" fill="white" />
              </div>
            </div>

            {/* Instagram badge icon */}
            <div className="absolute top-2 left-2 bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 rounded-full p-2 z-30">
              <Instagram className="h-4 w-4 text-white" />
            </div>
          </div>
        );

      case "photo":
        return (
          <div className="relative bg-gray-200 rounded-lg overflow-hidden w-full max-w-full min-h-[200px] flex items-center justify-center">
            {/* Fallback background */}
            <div className="absolute inset-0 flex items-center justify-center bg-gray-200">
              <Sparkles className="w-16 h-16 text-gray-400" />
            </div>

            {/* Image overlay */}
            {item.image_url && (
              <img
                src={item.image_url}
                alt={item.title || "Uploaded photo"}
                className="relative w-full h-auto rounded-lg object-cover z-10"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="break-inside-avoid mb-4 relative group"
    >
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="absolute top-2 right-[120px] bg-gray-800 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-move z-10"
      >
        <GripVertical className="h-4 w-4" />
      </div>

      {/* Refresh button - only show for Instagram, Twitter, and YouTube */}
      {(item.type === 'instagram' || item.type === 'twitter' || item.type === 'youtube') && (
        <button
          onClick={() => onRefresh(item.id)}
          className="absolute top-2 right-[86px] bg-green-500 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg z-10"
          title="Refresh thumbnail"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      )}

      {/* Edit button */}
      <button
        onClick={() => onEdit(item)}
        className="absolute top-2 right-[52px] bg-blue-500 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg z-10"
      >
        <Edit className="h-4 w-4" />
      </button>

      {/* Delete button */}
      <button
        onClick={() => onDelete(item.id)}
        className="absolute top-2 right-2 bg-red-500 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg z-10"
      >
        <Trash2 className="h-4 w-4" />
      </button>

      {/* Content */}
      <div
        className="cursor-pointer"
        onClick={() => onPlay(item)}
      >
        {renderContent()}
      </div>

      {item.title && (
        <p className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">
          {item.title}
        </p>
      )}
    </div>
  );
}

export default function MotivationPage() {
  console.log('[MotivationPage] Module version loading - with aspect ratio fixes');

  const [items, setItems] = useState<MotivationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setupComplete, setSetupComplete] = useState(false);
  const [videoModalOpen, setVideoModalOpen] = useState(false);
  const [selectedVideoUrl, setSelectedVideoUrl] = useState("");
  const [selectedVideoTitle, setSelectedVideoTitle] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MotivationItem | null>(null);
  const { supabase } = useSupabase();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    initializeAndLoad();
  }, []);

  const initializeAndLoad = async () => {
    try {
      const setupResponse = await fetch("/api/motivation/setup");
      const setupData = await setupResponse.json();

      if (setupData.success && setupData.tableReady) {
        setSetupComplete(true);
        await loadMotivationItems();
      } else {
        await ensureTableExists();
        setSetupComplete(true);
        await loadMotivationItems();
      }
    } catch (err: any) {
      console.error("Initialization error:", err);
      setError(err.message || "Failed to initialize. Please refresh the page.");
      setSetupComplete(false);
    } finally {
      setLoading(false);
    }
  };

  const ensureTableExists = async () => {
    const { error: checkError } = await supabase
      .from("motivation_content")
      .select("id")
      .limit(1);

    if (checkError && checkError.message.includes("relation") && checkError.message.includes("does not exist")) {
      console.log("Table doesn't exist yet. Needs migration.");
      throw new Error("Please run the database migration in Supabase dashboard to enable the Motivation feature.");
    }
  };

  const loadMotivationItems = async () => {
    try {
      setError(null);
      const { data, error } = await supabase
        .from("motivation_content")
        .select("*")
        .order("position", { ascending: true })
        .order("created_at", { ascending: false });

      if (error) {
        if (error.message.includes("relation") && error.message.includes("does not exist")) {
          console.log("Table doesn't exist yet");
          return;
        }
        throw error;
      }
      setItems(data || []);
    } catch (error: any) {
      console.error("Error loading motivation items:", error);
      setError(error.message || "Failed to load items");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from("motivation_content")
        .delete()
        .eq("id", id);

      if (error) throw error;
      setItems(items.filter((item) => item.id !== id));
    } catch (error) {
      console.error("Error deleting item:", error);
    }
  };

  const handleEdit = (item: MotivationItem) => {
    setEditingItem(item);
    setIsEditModalOpen(true);
  };

  const handleRefresh = async (itemId: string) => {
    try {
      const response = await fetch("/api/motivation/refresh-thumbnail", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ itemId }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // Reload items to show updated thumbnail
        await loadMotivationItems();
      } else {
        alert(data.error || "Failed to refresh thumbnail. Instagram/Twitter may be blocking requests.");
      }
    } catch (error) {
      console.error("Error refreshing thumbnail:", error);
      alert("Failed to refresh thumbnail. Please try again.");
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      const oldIndex = items.findIndex((item) => item.id === active.id);
      const newIndex = items.findIndex((item) => item.id === over?.id);

      const newItems = arrayMove(items, oldIndex, newIndex);
      setItems(newItems);

      // Update positions in database
      try {
        await fetch("/api/motivation/reorder", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ items: newItems }),
        });
      } catch (error) {
        console.error("Error updating positions:", error);
        // Reload items to get correct order
        loadMotivationItems();
      }
    }

    setActiveId(null);
  };

  const handlePlayItem = (item: MotivationItem) => {
    switch (item.type) {
      case "youtube":
        setSelectedVideoUrl(item.url || "");
        setSelectedVideoTitle(item.title || "YouTube Video");
        setVideoModalOpen(true);
        break;
      case "instagram":
        // Open Instagram directly in new tab
        window.open(item.url, '_blank');
        break;
      case "twitter":
        // Open Twitter/X directly in new tab
        window.open(item.url, '_blank');
        break;
    }
  };

  return (
    <>
      <div className="p-6 space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-3xl font-medium">Motivation</h1>
                <p className="text-sm text-[#aa2020] mt-1">
                  Your personal inspiration board
                </p>
              </div>
              <Button
                onClick={() => setIsAddModalOpen(true)}
                disabled={!setupComplete}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Content
              </Button>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-gray-100"></div>
              </div>
            ) : !setupComplete ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Setup Required</AlertTitle>
                <AlertDescription>
                  The Motivation feature needs to be set up. Please run the database migration or contact support.
                </AlertDescription>
              </Alert>
            ) : items.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-lg border">
                <Sparkles className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500 dark:text-gray-400 mb-4">
                  No motivation content yet
                </p>
                <Button onClick={() => setIsAddModalOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Your First Item
                </Button>
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={items.map(item => item.id)}
                  strategy={rectSortingStrategy}
                >
                  <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4">
                    {items.map((item) => (
                      <SortableItem
                        key={item.id}
                        item={item}
                        onDelete={handleDelete}
                        onPlay={handlePlayItem}
                        onEdit={handleEdit}
                        onRefresh={handleRefresh}
                      />
                    ))}
                  </div>
                </SortableContext>
                <DragOverlay>
                  {activeId ? (
                    <div className="opacity-50 cursor-grabbing">
                      {/* Show preview of dragged item */}
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            )}

            <AddMotivationModal
              isOpen={isAddModalOpen}
              onClose={() => setIsAddModalOpen(false)}
              onSuccess={() => {
                loadMotivationItems();
                setIsAddModalOpen(false);
              }}
            />

            <EditMotivationModal
              isOpen={isEditModalOpen}
              onClose={() => {
                setIsEditModalOpen(false);
                setEditingItem(null);
              }}
              onSuccess={() => {
                loadMotivationItems();
                setIsEditModalOpen(false);
                setEditingItem(null);
              }}
              item={editingItem}
            />
      </div>

      {/* YouTube Video Modal */}
      <YouTubeModal
        isOpen={videoModalOpen}
        onClose={() => setVideoModalOpen(false)}
        videoUrl={selectedVideoUrl}
        title={selectedVideoTitle}
      />
    </>
  );
}