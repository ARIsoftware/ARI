"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Play, AlertCircle, Sparkles, Instagram, Twitter, GripVertical } from "lucide-react";
import { useSupabase } from "@/components/providers";
import { AddMotivationModal } from "@/components/motivation/add-motivation-modal";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import Image from "next/image";
import { AppSidebar } from "@/components/app-sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { TaskAnnouncement } from "@/components/task-announcement";
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
function SortableItem({ item, onDelete, onPlay }: {
  item: MotivationItem;
  onDelete: (id: string) => void;
  onPlay: (item: MotivationItem) => void;
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
          <>
            {thumbnail && (
              <img
                src={thumbnail}
                alt={item.title || "YouTube video"}
                className="w-full h-auto rounded-lg object-cover"
              />
            )}
            <div className="absolute inset-0 bg-black bg-opacity-0 hover:bg-opacity-40 transition-all rounded-lg flex items-center justify-center">
              <div className="bg-black bg-opacity-75 rounded-full p-4 opacity-0 hover:opacity-100 transition-opacity">
                <Play className="text-white h-8 w-8 ml-1" fill="white" />
              </div>
            </div>
          </>
        );

      case "twitter":
        return (
          <>
            {item.thumbnail_url ? (
              <img
                src={item.thumbnail_url}
                alt={item.title || "Twitter post"}
                className="w-full h-auto rounded-lg object-cover"
              />
            ) : (
              <div className="bg-black rounded-lg p-8">
                <div className="flex items-center justify-center h-32">
                  <Twitter className="w-16 h-16 text-white" fill="white" />
                </div>
              </div>
            )}
            <div className="absolute inset-0 bg-black bg-opacity-0 hover:bg-opacity-40 transition-all rounded-lg flex items-center justify-center">
              <div className="bg-black bg-opacity-75 rounded-full p-4 opacity-0 hover:opacity-100 transition-opacity">
                <Play className="text-white h-8 w-8 ml-1" fill="white" />
              </div>
            </div>
            <div className="absolute top-2 left-2 bg-black rounded-full p-2">
              <Twitter className="h-4 w-4 text-white" fill="white" />
            </div>
          </>
        );

      case "instagram":
        return (
          <>
            {item.thumbnail_url ? (
              <div className="relative">
                <img
                  src={item.thumbnail_url}
                  alt={item.title || "Instagram post"}
                  className="w-full h-auto rounded-lg object-cover"
                />
                <div className="absolute inset-0 rounded-lg border-2 border-transparent bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 opacity-20"></div>
              </div>
            ) : (
              <div className="bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 p-0.5 rounded-lg">
                <div className="bg-white dark:bg-gray-900 rounded-lg p-8">
                  <div className="flex items-center justify-center h-32">
                    <Instagram className="w-16 h-16 text-gray-400" />
                  </div>
                </div>
              </div>
            )}
            <div className="absolute inset-0 bg-black bg-opacity-0 hover:bg-opacity-30 transition-all rounded-lg flex items-center justify-center">
              <div className="bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 rounded-full p-4 opacity-0 hover:opacity-100 transition-opacity">
                <Play className="text-white h-8 w-8 ml-1" fill="white" />
              </div>
            </div>
            <div className="absolute top-2 left-2 bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 rounded-full p-2">
              <Instagram className="h-4 w-4 text-white" />
            </div>
          </>
        );

      case "photo":
        return (
          <>
            {item.image_url && (
              <img
                src={item.image_url}
                alt={item.title || "Uploaded photo"}
                className="w-full h-auto rounded-lg object-cover"
              />
            )}
          </>
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
        className="absolute top-2 right-12 bg-gray-800 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-move z-10"
      >
        <GripVertical className="h-4 w-4" />
      </div>

      {/* Delete button */}
      <button
        onClick={() => onDelete(item.id)}
        className="absolute top-2 right-2 bg-red-500 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg z-10"
      >
        <Trash2 className="h-4 w-4" />
      </button>

      {/* Content */}
      <div
        className="cursor-pointer block relative"
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
  const [items, setItems] = useState<MotivationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setupComplete, setSetupComplete] = useState(false);
  const [videoModalOpen, setVideoModalOpen] = useState(false);
  const [selectedVideoUrl, setSelectedVideoUrl] = useState("");
  const [selectedVideoTitle, setSelectedVideoTitle] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
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
    <div className="min-h-screen bg-gray-50/50">
      <TaskAnnouncement />
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <header className="flex h-16 shrink-0 items-center gap-2 border-b bg-white px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbPage>Motivation</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </header>

          <div className="flex flex-1 flex-col gap-4 p-6">
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
                  <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4 space-y-4">
                    {items.map((item) => (
                      <SortableItem
                        key={item.id}
                        item={item}
                        onDelete={handleDelete}
                        onPlay={handlePlayItem}
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
          </div>
        </SidebarInset>
      </SidebarProvider>

      {/* YouTube Video Modal */}
      <YouTubeModal
        isOpen={videoModalOpen}
        onClose={() => setVideoModalOpen(false)}
        videoUrl={selectedVideoUrl}
        title={selectedVideoTitle}
      />

    </div>
  );
}