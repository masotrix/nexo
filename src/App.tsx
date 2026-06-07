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
  const [activeTab, setActiveTab] = useState<"capture" | "details" | "stats" | "settings">("settings");
  
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

      // 1. Fetch note embedding vector locally
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

      // 3. Save actual Markdown file in Google Drive
      const savedFileId = await driveService.saveNoteFile(
        noteId, 
        title, 
        content, 
        dateStr, 
        finalConnections
      );

      // 4. Update local metadata copy
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
      updatedNotes[savedFileId] = {
        id: savedFileId,
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
            connections: Array.from(new Set([...updatedNotes[connId].connections, savedFileId]))
          };
        }
      });

      // 5. Cluster assignments recalculation
      const updatedNotesWithClusters = recalculateClusters(updatedNotes);

      // 6. Write final metadata.json index back to Google Drive
      const updatedIndex: GraphIndex = {
        notes: updatedNotesWithClusters,
        similarityThreshold: threshold,
        clusters: {}
      };

      await driveService.saveIndex(updatedIndex);

      // 7. Update State
      setIndex(updatedIndex);
      setSelectedNoteToEdit(null);
      setSelectedNoteId(savedFileId); // Focus newly created note
      setActiveTab("details");
    } catch (err: any) {
      setAppError(err.message || "Error al guardar la nota.");
      throw err;
    } finally {
      setIsSaving(false);
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

  return (
    <div style={{ display: "flex", width: "100%", height: "100%", position: "relative" }}>
      
      {/* Visual background layout glow elements */}
      <div style={{ pointerEvents: "none", position: "absolute", top: "10%", left: "20%", width: "400px", height: "400px", borderRadius: "50%", background: "radial-gradient(circle, rgba(139, 92, 246, 0.04) 0%, transparent 70%)" }} />
      <div style={{ pointerEvents: "none", position: "absolute", bottom: "10%", right: "30%", width: "500px", height: "500px", borderRadius: "50%", background: "radial-gradient(circle, rgba(16, 185, 129, 0.03) 0%, transparent 70%)" }} />

      {/* Main layout container (Split View) */}
      <div style={{ display: "flex", width: "100%", height: "100%", padding: "1.5rem", gap: "1.5rem" }}>
        
        {/* Left Side: Graph Visualization */}
        <div style={{ flex: 1.6, display: "flex", flexDirection: "column", gap: "1rem", height: "100%" }}>
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
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "1rem", height: "100%", maxWidth: "520px", minWidth: "380px" }}>
          
          {/* Navigation Bar */}
          <div className="glass-panel" style={{ padding: "0.5rem", borderRadius: "12px", display: "flex", justifyContent: "space-between", gap: "0.4rem" }}>
            <button 
              onClick={() => { setActiveTab("capture"); setSelectedNoteToEdit(null); }}
              style={{ flex: 1, padding: "0.5rem", borderRadius: "8px", border: "none", background: activeTab === "capture" ? "rgba(139, 92, 246, 0.15)" : "transparent", color: activeTab === "capture" ? "var(--primary)" : "var(--text-secondary)" }}
              title="Capturar nota"
            >
              <PenTool size={18} />
              <span style={{ fontSize: "0.75rem", fontWeight: "bold", marginLeft: "0.3rem" }}>Captura</span>
            </button>

            <button 
              onClick={() => setActiveTab("details")}
              style={{ flex: 1, padding: "0.5rem", borderRadius: "8px", border: "none", background: activeTab === "details" ? "rgba(139, 92, 246, 0.15)" : "transparent", color: activeTab === "details" ? "var(--primary)" : "var(--text-secondary)" }}
              title="Detalle de Nota"
            >
              <BookOpen size={18} />
              <span style={{ fontSize: "0.75rem", fontWeight: "bold", marginLeft: "0.3rem" }}>Detalle</span>
            </button>

            <button 
              onClick={() => setActiveTab("stats")}
              style={{ flex: 1, padding: "0.5rem", borderRadius: "8px", border: "none", background: activeTab === "stats" ? "rgba(139, 92, 246, 0.15)" : "transparent", color: activeTab === "stats" ? "var(--primary)" : "var(--text-secondary)" }}
              title="Progreso y Clústeres"
            >
              <BarChart3 size={18} />
              <span style={{ fontSize: "0.75rem", fontWeight: "bold", marginLeft: "0.3rem" }}>Progreso</span>
            </button>

            <button 
              onClick={() => setActiveTab("settings")}
              style={{ flex: 1, padding: "0.5rem", borderRadius: "8px", border: "none", background: activeTab === "settings" ? "rgba(139, 92, 246, 0.15)" : "transparent", color: activeTab === "settings" ? "var(--primary)" : "var(--text-secondary)" }}
              title="Configuración"
            >
              <SettingsIcon size={18} />
              <span style={{ fontSize: "0.75rem", fontWeight: "bold", marginLeft: "0.3rem" }}>Ajustes</span>
            </button>
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
