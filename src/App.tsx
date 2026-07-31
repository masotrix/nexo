import React, { useState, useEffect } from "react";
import { GoogleDriveService } from "./services/googleDrive";
import type { NoteMetadata, GraphIndex } from "./services/googleDrive";
import { EmbeddingsService } from "./services/embeddings";
import { Settings } from "./components/Settings";
import { NoteForm } from "./components/NoteForm";
import { KnowledgeGraph } from "./components/KnowledgeGraph";
import { NoteDetails } from "./components/NoteDetails";
import { StatsPanel } from "./components/StatsPanel";
import { 
  BarChart3, 
  Settings as SettingsIcon, 
  Network, 
  AlertCircle,
  Plus
} from "lucide-react";


import styled from "styled-components";

const StyledMobileNavBar = styled.div`
  display: none;

  @media (max-width: 768px) {
    display: flex;
    justify-content: space-between;
    gap: 4px;
    position: fixed;
    bottom: 12px;
    left: 8px;
    right: 8px;
    width: auto;
    max-width: none;
    z-index: 1000;
    box-sizing: border-box;
    background: rgba(13, 20, 38, 0.98);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
    padding: 6px 4px;
  }
`;

const StyledNavButton = styled.button<{ $active?: boolean; $mobileOnly?: boolean }>`
  flex: 1;
  padding: 8px 16px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: ${props => props.$active ? "var(--primary)" : "var(--text-secondary)"};
  background-color: ${props => props.$active ? "rgba(139, 92, 246, 0.15)" : "transparent"};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: all 0.2s ease;
  cursor: pointer;
  box-sizing: border-box;

  &:hover {
    background-color: ${props => props.$active ? "rgba(139, 92, 246, 0.15)" : "rgba(255, 255, 255, 0.03)"};
  }

  display: ${props => props.$mobileOnly ? "none" : "inline-flex"};

  span {
    font-size: 13px;
    font-weight: bold;
  }

  @media (max-width: 768px) {
    display: inline-flex;
    flex-direction: column;
    gap: 3px;
    padding: 6px 2px;
    min-width: 0;
    width: auto;
    max-width: none;
    background-color: ${props => props.$active ? "rgba(139, 92, 246, 0.15)" : "transparent"};

    display: inline-flex;

    span {
      font-size: 10px;
      display: block;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 100%;
      margin-left: 0;
    }

    svg {
      width: 16px;
      height: 16px;
      flex-shrink: 0;
    }
  }
`;

// Instantiate services once outside the component
const driveService = new GoogleDriveService();
const embeddingsService = new EmbeddingsService();

export const App: React.FC = () => {
  // Authentication & Configuration State
  const [isAuthenticated, setIsAuthenticated] = useState(() => driveService.isAuthenticated());
  const [hasConfig, setHasConfig] = useState(() => {
    return !!driveService.getClientId();
  });

  // Data State
  const [index, setIndex] = useState<GraphIndex>({ notes: {}, similarityThreshold: 0.65, clusters: {} });
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  
  // Active Graph State
  const [activeGraphId, setActiveGraphId] = useState<string>(() => {
    return localStorage.getItem("nexo_active_graph_id") || "default";
  });

  const availableGraphs = useMemo(() => {
    const graphsMap = index.graphs || {};
    const defaultGraph = { id: "default", name: "Grafo Principal", date: new Date().toISOString() };
    return { default: defaultGraph, ...graphsMap };
  }, [index.graphs]);

  const filteredNotes = useMemo(() => {
    if (activeGraphId === "all") {
      return index.notes;
    }
    const result: { [id: string]: NoteMetadata } = {};
    Object.values(index.notes).forEach((note) => {
      const noteGraphId = note.graphId || "default";
      if (noteGraphId === activeGraphId) {
        result[note.id] = note;
      }
    });
    return result;
  }, [index.notes, activeGraphId]);

  const filteredIndex = useMemo(() => {
    return {
      ...index,
      notes: filteredNotes
    };
  }, [index, filteredNotes]);

  const handleSelectGraph = (graphId: string) => {
    setActiveGraphId(graphId);
    localStorage.setItem("nexo_active_graph_id", graphId);
  };

  const handleCreateGraph = async (name?: string) => {
    const graphName = name || prompt("Nombre del nuevo grafo:");
    if (!graphName || !graphName.trim()) return;

    const newGraphId = `graph_${Date.now()}`;
    const newGraph = {
      id: newGraphId,
      name: graphName.trim(),
      date: new Date().toISOString()
    };

    const updatedGraphs = {
      ...(index.graphs || { default: { id: "default", name: "Grafo Principal", date: new Date().toISOString() } }),
      [newGraphId]: newGraph
    };

    const updatedIndex: GraphIndex = {
      ...index,
      graphs: updatedGraphs,
      activeGraphId: newGraphId
    };

    setIndex(updatedIndex);
    setActiveGraphId(newGraphId);
    localStorage.setItem("nexo_active_graph_id", newGraphId);

    if (driveService.isAuthenticated()) {
      await driveService.saveIndex(updatedIndex);
    }
  };

  const handleDeleteGraph = async (graphId: string) => {
    if (graphId === "default") {
      alert("El Grafo Principal no se puede eliminar.");
      return;
    }
    if (!confirm("¿Seguro que deseas eliminar este grafo? Las notas asociadas volverán al Grafo Principal.")) {
      return;
    }

    const updatedGraphs = { ...(index.graphs || {}) };
    delete updatedGraphs[graphId];

    const updatedNotes = { ...index.notes };
    for (const id in updatedNotes) {
      if (updatedNotes[id].graphId === graphId) {
        updatedNotes[id] = { ...updatedNotes[id], graphId: "default" };
      }
    }

    const updatedIndex: GraphIndex = {
      ...index,
      notes: updatedNotes,
      graphs: updatedGraphs
    };

    setIndex(updatedIndex);
    setActiveGraphId("default");
    localStorage.setItem("nexo_active_graph_id", "default");

    if (driveService.isAuthenticated()) {
      await driveService.saveIndex(updatedIndex);
    }
  };

  // Navigation State
  const [activeTab, setActiveTab] = useState<"graph" | "capture" | "stats" | "settings">("settings");
  
  // Loading & Processing States
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRebuilding, setIsRebuilding] = useState(false);
  
  // Editing State
  const [selectedNoteToEdit, setSelectedNoteToEdit] = useState<{ id: string; title: string; content: string; date: string } | null>(null);
  
  // Errors
  const [appError, setAppError] = useState<string | null>(null);

  // Service Worker Update State
  const [swRegistration, setSwRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [showUpdateReady, setShowUpdateReady] = useState(false);

  // Sync config from local storage or Settings updates
  const handleConfigChanged = () => {
    const isAuthed = driveService.isAuthenticated();
    setIsAuthenticated(isAuthed);
    setHasConfig(!!driveService.getClientId());
    
    // If we just authenticated, load the index!
    if (isAuthed) {
      loadIndexData();
      setActiveTab("stats");
    } else {
      setIndex({ notes: {}, similarityThreshold: 0.65, clusters: {} });
      setSelectedNoteId(null);
      setActiveTab("settings");
    }
  };

  // Fetch index from Google Drive
  const loadIndexData = async () => {
    if (!driveService.isAuthenticated()) return;
    
    setIsLoading(true);
    setAppError(null);
    try {
      const driveIndex = await driveService.fetchIndex();
      
      // Inject saved similarity threshold into local storage if it's there
      if (driveIndex.similarityThreshold) {
        localStorage.setItem("nexo_similarity_threshold", driveIndex.similarityThreshold.toString());
      }
      
      setIndex(driveIndex);

      // Async background populator for any notes missing embeddings
      setTimeout(async () => {
        const notesList = Object.values(driveIndex.notes);
        const missingEmbeds = notesList.filter(n => !n.embedding || n.embedding.length === 0);
        if (missingEmbeds.length > 0) {
          const updatedNotes = { ...driveIndex.notes };
          let changed = false;
          for (const note of missingEmbeds) {
            try {
              const fileData = await driveService.readNoteFile(note.id);
              const embed = await embeddingsService.getEmbedding(note.title, fileData.content);
              updatedNotes[note.id] = { ...updatedNotes[note.id], embedding: embed };
              changed = true;
            } catch (e) {
              console.warn("Error generando embedding en segundo plano para nota", note.id, e);
            }
          }
          if (changed) {
            setIndex(prev => ({ ...prev, notes: updatedNotes }));
          }
        }
      }, 300);
    } catch (err: any) {
      setAppError(err.message || "Error al cargar la base de datos de Google Drive.");
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-restore / Silent refresh session / Handle OAuth redirect URL token when returning to PWA app
  useEffect(() => {
    driveService.onSessionExpired = () => {
      setIsAuthenticated(false);
    };

    const handleAppFocus = async () => {
      // Check if arriving back from OAuth URL Redirect (#access_token=...)
      const justAuthenticatedFromRedirect = driveService.handleUrlHashToken();
      if (justAuthenticatedFromRedirect) {
        setIsAuthenticated(true);
        loadIndexData();
        setActiveTab("stats");
        return;
      }

      const wasConnected = localStorage.getItem("nexo_was_connected") === "true";
      if (wasConnected && driveService.getClientId()) {
        const storedToken = localStorage.getItem("nexo_google_access_token");
        const storedExpiry = parseInt(localStorage.getItem("nexo_google_token_expiry") || "0", 10);

        // If token is missing or expired
        if (!storedToken || Date.now() >= storedExpiry - 60000) {
          try {
            await driveService.login(true); // Silent token request (no popup)
            setIsAuthenticated(true);
            loadIndexData();
          } catch (e) {
            console.warn("Autenticación silenciosa PWA a la espera de interacción:", e);
          }
        } else {
          setIsAuthenticated(true);
          loadIndexData();
        }
      } else if (isAuthenticated) {
        loadIndexData();
      }
    };

    window.addEventListener("focus", handleAppFocus);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        handleAppFocus();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    handleAppFocus(); // Check immediately on mount

    return () => {
      window.removeEventListener("focus", handleAppFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  // Register Service Worker and check for updates
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./sw.js")
        .then((reg) => {
          setSwRegistration(reg);

          // If there is already a waiting worker, show update banner
          if (reg.waiting) {
            setShowUpdateReady(true);
          }

          // Listen for new installing worker
          reg.addEventListener("updatefound", () => {
            const newWorker = reg.installing;
            if (newWorker) {
              newWorker.addEventListener("statechange", () => {
                if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                  // A new service worker is installed and waiting
                  setShowUpdateReady(true);
                }
              });
            }
          });
        })
        .catch((err) => {
          console.error("Error al registrar el Service Worker:", err);
        });

      // Listen for controllerchange to reload page
      let refreshing = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (!refreshing) {
          refreshing = true;
          window.location.reload();
        }
      });
    }
  }, []);

  // Helper to run K-Means and maintain cluster names mapping using Jaccard Similarity
  const recalculateClusters = (notesMap: { [id: string]: NoteMetadata }): { [id: string]: NoteMetadata } => {
    const notesList = Object.values(notesMap);
    
    if (notesList.length < 3) {
      // Clean up cluster assignments if too few notes
      const cleanedNotes: { [id: string]: NoteMetadata } = {};
      notesList.forEach(n => {
        cleanedNotes[n.id] = { ...n, clusterId: undefined };
      });
      return cleanedNotes;
    }

    // Determine target number of clusters: K = floor(sqrt(N))
    const k = Math.max(2, Math.floor(Math.sqrt(notesList.length)));
    
    // Run K-Means
    const { assignments } = EmbeddingsService.runKMeans(notesList, k);

    // Apply assignments to notes
    const updatedNotesMap: { [id: string]: NoteMetadata } = {};
    for (const id in notesMap) {
      updatedNotesMap[id] = {
        ...notesMap[id],
        clusterId: assignments[id] || undefined
      };
    }

    return updatedNotesMap;
  };

  // Create or Update Note Flow
  const handleSaveNote = async (title: string, content: string, precalcConnections: string[]) => {
    setIsSaving(true);
    setAppError(null);
    try {
      const dateStr = selectedNoteToEdit ? selectedNoteToEdit.date : new Date().toISOString();
      const noteId = selectedNoteToEdit ? selectedNoteToEdit.id : null;
      
      // Generate temporary ID if creating a new note
      const tempId = noteId || `temp_${Date.now()}`;

      // 1. Fetch note embedding vector locally (extremely fast, ~10-40ms)
      const embedding = await embeddingsService.getEmbedding(title, content);

      // 2. Local cosine similarity search against other notes
      const threshold = parseFloat(localStorage.getItem("nexo_similarity_threshold") || "0.65");
      const autoConnections: string[] = [];

      for (const id in index.notes) {
        if (noteId && id === noteId) continue; // Skip self
        const otherNote = index.notes[id];
        const otherEmbed = (otherNote as any).embedding;
        if (otherEmbed && otherEmbed.length > 0) {
          const sim = EmbeddingsService.cosineSimilarity(embedding, otherEmbed);
          if (sim >= threshold) {
            autoConnections.push(id);
          }
        }
      }

      // Merge auto connections and any manual ones
      const finalConnections = Array.from(new Set([...autoConnections, ...precalcConnections]));

      // 3. Cache content in memory immediately so NoteDetails can render it instantly
      driveService.cacheContent(tempId, { title, date: dateStr, content });

      // 4. Update local metadata copy optimistically
      const updatedNotes = { ...index.notes };
      
      // Remove old references to this note ID in other notes' connections lists (if editing)
      if (noteId) {
        for (const id in updatedNotes) {
          updatedNotes[id] = {
            ...updatedNotes[id],
            connections: updatedNotes[id].connections.filter(c => c !== noteId)
          };
        }
      }

      const targetGraphId = selectedNoteToEdit 
        ? (index.notes[selectedNoteToEdit.id]?.graphId || "default")
        : (activeGraphId === "all" ? "default" : activeGraphId);

      // Add the new note metadata entry
      updatedNotes[tempId] = {
        id: tempId,
        title,
        date: dateStr,
        connections: finalConnections,
        clusterId: undefined, // Will be set by recalculateClusters
        embedding, // Store embedding in RAM metadata for immediate client calculations
        graphId: targetGraphId
      } as any;

      // Update back-links (append this note ID to its connected notes' lists)
      finalConnections.forEach(connId => {
        if (updatedNotes[connId]) {
          updatedNotes[connId] = {
            ...updatedNotes[connId],
            connections: Array.from(new Set([...updatedNotes[connId].connections, tempId]))
          };
        }
      });

      // 5. Cluster assignments recalculation
      const updatedNotesWithClusters = recalculateClusters(updatedNotes);

      const updatedIndex: GraphIndex = {
        ...index,
        notes: updatedNotesWithClusters,
        similarityThreshold: threshold,
        clusters: index.clusters || {},
        graphs: availableGraphs,
        activeGraphId: activeGraphId
      };

      // 6. Update local UI State INSTANTLY
      setIndex(updatedIndex);
      setSelectedNoteToEdit(null);
      setSelectedNoteId(tempId); // Focus note immediately
      setActiveTab("stats");
      setIsSaving(false); // Done saving from UI perspective!

      // 7. Perform Google Drive saving calls in the background (non-blocking)
      (async () => {
        try {
          const savedFileId = await driveService.saveNoteFile(
            noteId, 
            title, 
            content, 
            dateStr, 
            finalConnections
          );

          // If creating a new note, swap the temporary ID with the real Google Drive File ID
          if (!noteId && savedFileId !== tempId) {
            // Cache the content under the real ID as well
            driveService.cacheContent(savedFileId, { title, date: dateStr, content });

            setIndex(prevIndex => {
              const notesCopy = { ...prevIndex.notes };
              const tempNote = notesCopy[tempId];
              if (!tempNote) return prevIndex; // already modified/removed by user in UI

              // Remove temp note entry
              delete notesCopy[tempId];

              // Add under real ID
              notesCopy[savedFileId] = {
                ...tempNote,
                id: savedFileId
              };

              // Update connections pointing to tempId in other notes
              for (const id in notesCopy) {
                notesCopy[id] = {
                  ...notesCopy[id],
                  connections: notesCopy[id].connections.map(c => c === tempId ? savedFileId : c)
                };
              }

              const cleanNotesWithClusters = recalculateClusters(notesCopy);
              
              const newIndex: GraphIndex = {
                notes: cleanNotesWithClusters,
                similarityThreshold: prevIndex.similarityThreshold,
                clusters: prevIndex.clusters
              };

              // Save the updated index containing the real ID to Google Drive
              driveService.saveIndex(newIndex).catch(err => {
                console.error("Error saving metadata index in background:", err);
              });

              return newIndex;
            });

            // If user is currently inspecting the temp note, swap selection to real ID
            setSelectedNoteId(currentId => currentId === tempId ? savedFileId : currentId);
          } else {
            // For updates, the ID is already real, so we just save the index
            await driveService.saveIndex(updatedIndex);
          }
        } catch (err: any) {
          console.error("Background sync to Google Drive failed:", err);
          setAppError("Sincronización en la nube fallida. Los cambios están guardados en tu sesión local.");
          setTimeout(() => setAppError(null), 5000);
        }
      })();

    } catch (err: any) {
      setAppError(err.message || "Error al procesar la nota.");
      setIsSaving(false);
      throw err;
    }
  };

  // Delete Note Flow
  const handleDeleteNote = async (noteId: string) => {
    setAppError(null);
    try {
      // 1. Delete Markdown file from Google Drive
      await driveService.deleteNoteFile(noteId);

      // 2. Remove references from local state notes and connections lists
      const updatedNotes = { ...index.notes };
      delete updatedNotes[noteId];

      for (const id in updatedNotes) {
        updatedNotes[id] = {
          ...updatedNotes[id],
          connections: updatedNotes[id].connections.filter(c => c !== noteId)
        };
      }

      // 3. Recalculate clusters without the deleted note
      const updatedNotesWithClusters = recalculateClusters(updatedNotes);

      // 4. Save updated index to Google Drive
      const threshold = parseFloat(localStorage.getItem("nexo_similarity_threshold") || "0.65");
      const updatedIndex: GraphIndex = {
        notes: updatedNotesWithClusters,
        similarityThreshold: threshold,
        clusters: {}
      };

      await driveService.saveIndex(updatedIndex);

      // 5. Update State
      setIndex(updatedIndex);
      setSelectedNoteId(null);
      setActiveTab("stats");
    } catch (err: any) {
      setAppError(err.message || "Error al eliminar la nota.");
      throw err;
    }
  };

  // Manual Trigger: Rebuild the entire graph (re-fetches missing embeddings and recalculates edges)
  const handleRebuildGraph = async () => {
    if (!driveService.isAuthenticated()) return;
    
    setIsRebuilding(true);
    setAppError(null);
    try {
      const threshold = parseFloat(localStorage.getItem("nexo_similarity_threshold") || "0.65");
      const updatedNotes = { ...index.notes };
      const notesList = Object.values(updatedNotes);

      // 1. Generate missing embeddings
      for (const note of notesList) {
        const noteWithEmbed = note as any;
        if (!noteWithEmbed.embedding || noteWithEmbed.embedding.length === 0) {
          // Read full content to generate embedding
          const fileData = await driveService.readNoteFile(note.id);
          const embed = await embeddingsService.getEmbedding(note.title, fileData.content);
          noteWithEmbed.embedding = embed;
        }
      }

      // 2. Recalculate connections for all notes based on current threshold
      // Clear connections
      notesList.forEach(note => {
        note.connections = [];
      });

      // Recalculate all similarity pairs
      for (let i = 0; i < notesList.length; i++) {
        for (let j = i + 1; j < notesList.length; j++) {
          const noteA = notesList[i] as any;
          const noteB = notesList[j] as any;

          const sim = EmbeddingsService.cosineSimilarity(noteA.embedding, noteB.embedding);
          if (sim >= threshold) {
            noteA.connections.push(noteB.id);
            noteB.connections.push(noteA.id);
          }
        }
      }

      // 3. Recalculate clusters
      const updatedNotesWithClusters = recalculateClusters(updatedNotes);

      // 4. Save to Google Drive
      const updatedIndex: GraphIndex = {
        notes: updatedNotesWithClusters,
        similarityThreshold: threshold,
        clusters: {}
      };

      await driveService.saveIndex(updatedIndex);
      
      // Update each markdown file frontmatter in background to match new connections
      for (const note of notesList) {
        const fileData = await driveService.readNoteFile(note.id);
        await driveService.saveNoteFile(
          note.id, 
          note.title, 
          fileData.content, 
          note.date, 
          note.connections
        );
      }

      setIndex(updatedIndex);
      setAppError("El grafo se ha reconstruido con éxito.");
      setTimeout(() => setAppError(null), 3000);
    } catch (err: any) {
      setAppError(err.message || "Error al reconstruir el grafo.");
    } finally {
      setIsRebuilding(false);
    }
  };

  const handleSelectNoteFromGraph = (noteId: string | null) => {
    setSelectedNoteId(noteId);
  };

  const handleEditNoteTrigger = (note: { id: string; title: string; content: string; date: string }) => {
    setSelectedNoteToEdit(note);
    setActiveTab("capture");
  };

  const handleNewNoteClick = () => {
    setSelectedNoteToEdit(null);
    setSelectedNoteId(null);
    setActiveTab("capture");
  };

  const handleApplyUpdate = () => {
    if (swRegistration && swRegistration.waiting) {
      swRegistration.waiting.postMessage({ type: "SKIP_WAITING" });
    }
  };

  const renderNavButtons = () => (
    <>
      <StyledNavButton 
        $active={activeTab === "graph"}
        $mobileOnly={true}
        onClick={() => setActiveTab("graph")}
        title="Ver Grafo"
      >
        <Network size={18} />
        <span>Grafo</span>
      </StyledNavButton>



      <StyledNavButton 
        $active={activeTab === "stats"}
        onClick={() => setActiveTab("stats")}
        title="Progreso y Clústeres"
      >
        <BarChart3 size={18} />
        <span>Progreso</span>
      </StyledNavButton>

      <StyledNavButton 
        $active={activeTab === "settings"}
        onClick={() => setActiveTab("settings")}
        title="Configuración"
      >
        <SettingsIcon size={18} />
        <span>Ajustes</span>
      </StyledNavButton>
    </>
  );

  return (
    <div style={{ display: "flex", width: "100%", height: "100%", position: "relative", overflow: "hidden" }}>
      
      {/* Visual background layout glow elements */}
      <div className="bg-glow-1" />
      <div className="bg-glow-2" />

      {/* Main layout container (Split View) */}
      <div className="main-layout">
        
        {/* Left Side: Graph Visualization */}
        <div className={`graph-section ${activeTab === 'graph' ? 'active-mobile-view' : ''}`}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
              <Network size={28} style={{ color: "var(--primary)" }} />
              <h1 style={{ fontSize: "1.8rem", background: "linear-gradient(135deg, #f8fafc, #94a3b8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                Nexo
              </h1>
              
              {/* Graph Selector Dropdown */}
              <select
                value={activeGraphId}
                onChange={(e) => handleSelectGraph(e.target.value)}
                style={{
                  background: "rgba(15, 23, 42, 0.8)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-color)",
                  borderRadius: "8px",
                  padding: "0.3rem 0.6rem",
                  fontSize: "0.85rem",
                  cursor: "pointer",
                  outline: "none"
                }}
              >
                <option value="all">🌐 Todos ({Object.keys(index.notes).length})</option>
                {Object.values(availableGraphs).map((g) => {
                  const count = Object.values(index.notes).filter(n => (n.graphId || "default") === g.id).length;
                  return (
                    <option key={g.id} value={g.id}>
                      {g.id === "default" ? "📌 " : "❖ "}{g.name} ({count})
                    </option>
                  );
                })}
              </select>
            </div>
            {isAuthenticated && hasConfig && (
              <button 
                className="primary" 
                onClick={handleNewNoteClick}
                style={{ padding: "0.5rem 1rem", fontSize: "0.85rem", borderRadius: "8px" }}
              >
                <Plus size={16} />
                <span>Nuevo Nodo</span>
              </button>
            )}
          </div>

          <div style={{ flex: 1, position: "relative" }}>
            {isLoading ? (
              <div className="glass-panel" style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%", color: "var(--text-secondary)" }}>
                <span className="glowing-element">Sincronizando con Google Drive...</span>
              </div>
            ) : (
              <KnowledgeGraph 
                notes={filteredNotes} 
                selectedNoteId={selectedNoteId}
                onSelectNote={handleSelectNoteFromGraph}
                clusters={index.clusters}
                onRebuildGraph={isAuthenticated && hasConfig ? handleRebuildGraph : undefined}
                isRebuilding={isRebuilding}
              />
            )}
          </div>
        </div>

        {/* Right Side: Sidebar Panels & Navigation Tabs */}
        <div className={`sidebar-section ${activeTab !== 'graph' ? 'active-mobile-view' : ''}`}>
          
          {/* Navigation Bar (Desktop only) */}
          <div className="desktop-nav-bar glass-panel" style={{ padding: "0.5rem", borderRadius: "12px", justifyContent: "space-between", gap: "0.4rem" }}>
            {renderNavButtons()}
          </div>

          {/* Configuration Warnings / Status updates */}
          {!hasConfig && activeTab !== "settings" && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.7rem 1rem", background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.2)", borderRadius: "10px", fontSize: "0.8rem", color: "#ef4444" }}>
              <AlertCircle size={16} />
              <span>Configura tu Google Client ID en la pestaña de Ajustes para sincronizar con Google Drive.</span>
            </div>
          )}

          {appError && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.7rem 1rem", background: "rgba(139, 92, 246, 0.1)", border: "1px solid rgba(139, 92, 246, 0.2)", borderRadius: "10px", fontSize: "0.8rem", color: "var(--primary)" }}>
              <InfoIcon size={16} />
              <span>{appError}</span>
            </div>
          )}

          {/* Active Panel View */}
          <div style={{ flex: 1, minHeight: 0 }}>
            {activeTab === "capture" && (
              <NoteForm 
                index={index} 
                embeddingsService={embeddingsService}
                onSaveNote={handleSaveNote}
                isSaving={isSaving}
                isAuthenticated={isAuthenticated && hasConfig}
                selectedNoteToEdit={selectedNoteToEdit}
                onCancelEdit={() => { setSelectedNoteToEdit(null); setActiveTab("stats"); }}
              />
            )}

            {activeTab === "stats" && (
              <StatsPanel 
                index={filteredIndex} 
                driveService={driveService}
                onSelectNote={handleSelectNoteFromGraph}
              />
            )}

            {activeTab === "settings" && (
              <Settings 
                driveService={driveService}
                onConfigChanged={handleConfigChanged}
                index={index}
                activeGraphId={activeGraphId}
                onSelectGraph={handleSelectGraph}
                onCreateGraph={handleCreateGraph}
                onDeleteGraph={handleDeleteGraph}
              />
            )}
          </div>
        </div>

      </div>

      {/* Navigation Bar (Mobile only) */}
      <StyledMobileNavBar>
        {renderNavButtons()}
      </StyledMobileNavBar>

      {/* Reconnection Overlay */}
      {!isAuthenticated && localStorage.getItem("nexo_was_connected") === "true" && (
        <div style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(6, 9, 19, 0.75)",
          backdropFilter: "var(--glass-blur)",
          WebkitBackdropFilter: "var(--glass-blur)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          zIndex: 2000,
          animation: "fadeIn 0.3s ease"
        }}>
          <div className="glass-panel" style={{
            maxWidth: "420px",
            width: "90%",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            gap: "1.5rem",
            boxShadow: "0 20px 50px rgba(0, 0, 0, 0.4)",
            border: "1px solid rgba(139, 92, 246, 0.2)",
            padding: "2.5rem 2rem",
            transform: "scale(1)",
            animation: "scaleIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)"
          }}>
            <div style={{
              width: "60px",
              height: "60px",
              borderRadius: "50%",
              background: "rgba(139, 92, 246, 0.1)",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              margin: "0 auto",
              color: "var(--primary)",
              boxShadow: "0 0 20px rgba(139, 92, 246, 0.15)"
            }}>
              <AlertCircle size={32} />
            </div>
            
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <h2 style={{ fontSize: "1.5rem", background: "linear-gradient(135deg, #f8fafc, #94a3b8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                Sesión Expirada
              </h2>
              <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", lineHeight: "1.6" }}>
                Tu sesión con Google Drive ha expirado. Reconéctate para seguir visualizando y guardando tus notas.
              </p>
            </div>

            <button 
              className="primary" 
              onClick={async () => {
                try {
                  await driveService.login();
                  handleConfigChanged();
                } catch (err: any) {
                  console.error("Reconnection error:", err);
                }
              }}
              style={{
                width: "100%",
                padding: "0.8rem",
                fontSize: "1rem",
                fontWeight: "600",
                marginTop: "0.5rem"
              }}
            >
              Reconectar Cuenta
            </button>
            
            <button 
              onClick={() => {
                driveService.logout();
                handleConfigChanged();
              }}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-muted)",
                fontSize: "0.8rem",
                cursor: "pointer",
                padding: 0,
                textDecoration: "underline"
              }}
            >
              Cerrar sesión de esta cuenta
            </button>
          </div>
        </div>
      )}

      {/* Note Details Modal Popup */}
      {selectedNoteId && activeTab !== "capture" && (
        <div style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(6, 9, 19, 0.75)",
          backdropFilter: "var(--glass-blur)",
          WebkitBackdropFilter: "var(--glass-blur)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          zIndex: 1500,
          animation: "fadeIn 0.25s ease"
        }}
        onClick={() => setSelectedNoteId(null)}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: "600px",
              width: "90%",
              maxHeight: "85vh",
              display: "flex",
              flexDirection: "column",
              animation: "scaleIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)",
              boxShadow: "0 20px 50px rgba(0, 0, 0, 0.5)",
            }}
          >
            <NoteDetails 
              noteId={selectedNoteId} 
              driveService={driveService}
              notesIndex={index.notes}
              onClose={() => setSelectedNoteId(null)}
              onEditNote={handleEditNoteTrigger}
              onDeleteNote={handleDeleteNote}
              onSelectNoteId={setSelectedNoteId}
              clusters={index.clusters}
            />
          </div>
        </div>
      )}

      {/* Update Ready Banner */}
      {showUpdateReady && (
        <div style={{
          position: "absolute",
          top: "1.5rem",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 3000,
          animation: "scaleIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)"
        }}>
          <div className="glass-panel" style={{
            display: "flex",
            alignItems: "center",
            gap: "1rem",
            padding: "0.8rem 1.2rem",
            border: "1px solid rgba(139, 92, 246, 0.3)",
            boxShadow: "0 10px 30px rgba(0, 0, 0, 0.4)",
            borderRadius: "12px",
            background: "rgba(13, 20, 38, 0.9)"
          }}>
            <span style={{ fontSize: "0.9rem", color: "var(--text-primary)", fontWeight: "500" }}>
              🚀 Hay una nueva versión disponible.
            </span>
            <button 
              className="primary" 
              onClick={handleApplyUpdate}
              style={{
                padding: "0.4rem 0.8rem",
                fontSize: "0.8rem",
                borderRadius: "6px"
              }}
            >
              Actualizar Ahora
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// Small custom inline Info icon helper since Lucide imports are strictly controlled
const InfoIcon: React.FC<{ size?: number; style?: React.CSSProperties }> = ({ size = 16, style }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4" />
    <path d="M12 8h.01" />
  </svg>
);

export default App;
