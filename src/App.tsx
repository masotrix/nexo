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
  PenTool, 
  BookOpen, 
  BarChart3, 
  Settings as SettingsIcon, 
  Network, 
  AlertCircle
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
  
  // Navigation State
  const [activeTab, setActiveTab] = useState<"graph" | "capture" | "details" | "stats" | "settings">("settings");
  
  // Loading & Processing States
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRebuilding, setIsRebuilding] = useState(false);
  
  // Editing State
  const [selectedNoteToEdit, setSelectedNoteToEdit] = useState<{ id: string; title: string; content: string; date: string } | null>(null);
  
  // Errors
  const [appError, setAppError] = useState<string | null>(null);

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
    } catch (err: any) {
      setAppError(err.message || "Error al cargar la base de datos de Google Drive.");
    } finally {
      setIsLoading(false);
    }
  };

  // Load index data on startup if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      loadIndexData();
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

      // Add the new note metadata entry
      updatedNotes[tempId] = {
        id: tempId,
        title,
        date: dateStr,
        connections: finalConnections,
        clusterId: undefined, // Will be set by recalculateClusters
        embedding // Store embedding in RAM metadata for immediate client calculations
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
        notes: updatedNotesWithClusters,
        similarityThreshold: threshold,
        clusters: {}
      };

      // 6. Update local UI State INSTANTLY
      setIndex(updatedIndex);
      setSelectedNoteToEdit(null);
      setSelectedNoteId(tempId); // Focus note immediately
      setActiveTab("details");
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
    if (noteId) {
      setActiveTab("details");
    }
  };

  const handleEditNoteTrigger = (note: { id: string; title: string; content: string; date: string }) => {
    setSelectedNoteToEdit(note);
    setActiveTab("capture");
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
        $active={activeTab === "capture"}
        onClick={() => { setActiveTab("capture"); setSelectedNoteToEdit(null); }}
        title="Capturar nota"
      >
        <PenTool size={18} />
        <span>Captura</span>
      </StyledNavButton>

      <StyledNavButton 
        $active={activeTab === "details"}
        onClick={() => setActiveTab("details")}
        title="Detalle de Nota"
      >
        <BookOpen size={18} />
        <span>Detalle</span>
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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Network size={28} style={{ color: "var(--primary)" }} />
              <h1 style={{ fontSize: "1.8rem", background: "linear-gradient(135deg, #f8fafc, #94a3b8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                Nexo
              </h1>
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", background: "rgba(255,255,255,0.03)", padding: "0.2rem 0.6rem", borderRadius: "20px", border: "1px solid var(--border-color)" }}>
                Nodos de Lectura Atómica
              </span>
            </div>
          </div>

          <div style={{ flex: 1, position: "relative" }}>
            {isLoading ? (
              <div className="glass-panel" style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%", color: "var(--text-secondary)" }}>
                <span className="glowing-element">Sincronizando con Google Drive...</span>
              </div>
            ) : (
              <KnowledgeGraph 
                notes={index.notes} 
                selectedNoteId={selectedNoteId}
                onSelectNote={handleSelectNoteFromGraph}
                clusters={index.clusters}
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

            {activeTab === "details" && (
              selectedNoteId ? (
                <NoteDetails 
                  noteId={selectedNoteId} 
                  driveService={driveService}
                  notesIndex={index.notes}
                  onClose={() => { setSelectedNoteId(null); setActiveTab("stats"); }}
                  onEditNote={handleEditNoteTrigger}
                  onDeleteNote={handleDeleteNote}
                  onSelectNoteId={setSelectedNoteId}
                  clusters={index.clusters}
                />
              ) : (
                <div className="glass-panel" style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", height: "100%", gap: "1rem", color: "var(--text-secondary)", textAlign: "center" }}>
                  <BookOpen size={36} style={{ color: "var(--text-muted)" }} />
                  <p style={{ fontSize: "0.9rem" }}>No se ha seleccionado ningún nodo.</p>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Haz click en un círculo del grafo de conocimiento a la izquierda para inspeccionar sus contenidos.</span>
                </div>
              )
            )}

            {activeTab === "stats" && (
              <StatsPanel 
                index={index} 
                driveService={driveService}
                onSelectNote={handleSelectNoteFromGraph}
              />
            )}

            {activeTab === "settings" && (
              <Settings 
                driveService={driveService}
                onConfigChanged={handleConfigChanged}
                onRebuildGraph={handleRebuildGraph}
                isRebuilding={isRebuilding}
              />
            )}
          </div>
        </div>

      </div>

      {/* Navigation Bar (Mobile only) */}
      <StyledMobileNavBar>
        {renderNavButtons()}
      </StyledMobileNavBar>
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
