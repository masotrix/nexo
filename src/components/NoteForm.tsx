import React, { useState, useEffect } from "react";
import type { GraphIndex, NoteMetadata } from "../services/googleDrive";
import { EmbeddingsService } from "../services/embeddings";
import { PenTool, Link2, AlertCircle, Info, Sparkles, HelpCircle } from "lucide-react";

interface NoteFormProps {
  index: GraphIndex;
  embeddingsService: EmbeddingsService;
  onSaveNote: (title: string, content: string, connections: string[]) => Promise<void>;
  isSaving: boolean;
  isAuthenticated: boolean;
  selectedNoteToEdit?: { id: string; title: string; content: string; date: string } | null;
  onCancelEdit?: () => void;
}

export const NoteForm: React.FC<NoteFormProps> = ({
  index,
  embeddingsService,
  onSaveNote,
  isSaving,
  isAuthenticated,
  selectedNoteToEdit,
  onCancelEdit,
}) => {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  
  // Real-time / Pre-save preview connections
  const [previewConnections, setPreviewConnections] = useState<{ note: NoteMetadata; similarity: number }[]>([]);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Line count estimator
  const [lineCount, setLineCount] = useState(0);

  // Effect to load note if editing
  useEffect(() => {
    if (selectedNoteToEdit) {
      setTitle(selectedNoteToEdit.title);
      setContent(selectedNoteToEdit.content);
      
      // Load current connections as initial preview connections
      const currentNote = index.notes[selectedNoteToEdit.id];
      if (currentNote && currentNote.connections) {
        const currentEmbedding = (currentNote as any).embedding;
        const initialPreviews = currentNote.connections.map(connId => {
          const connNote = index.notes[connId];
          let similarity = 0.8; // fallback
          if (connNote && currentEmbedding && (connNote as any).embedding) {
            similarity = EmbeddingsService.cosineSimilarity(currentEmbedding, (connNote as any).embedding);
          }
          return { note: connNote, similarity };
        }).filter(item => item.note !== undefined);

        // Sort by similarity descending
        initialPreviews.sort((a, b) => b.similarity - a.similarity);
        setPreviewConnections(initialPreviews);
      } else {
        setPreviewConnections([]);
      }
    } else {
      setTitle("");
      setContent("");
      setPreviewConnections([]);
    }
  }, [selectedNoteToEdit, index.notes]);

  // Update line counts on content change
  useEffect(() => {
    if (!content.trim()) {
      setLineCount(0);
      return;
    }
    // Simple line count by split on newlines or length-based wrapping approximation
    const lines = content.split("\n");
    setLineCount(lines.length);
  }, [content]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    try {
      // Connections to save: either the previewed ones or calculated during save
      const finalConnections = previewConnections.map(c => c.note.id);
      await onSaveNote(title.trim(), content.trim(), finalConnections);
      
      // Reset form if not editing (if successful, main app will handle states)
      if (!selectedNoteToEdit) {
        setTitle("");
        setContent("");
        setPreviewConnections([]);
      }
    } catch (err) {
      // Error handled by parent or displayed locally
    }
  };

  // Preview semantic connections locally
  const handlePreviewConnections = async () => {
    if (!title.trim() || !content.trim()) {
      setPreviewError("Escribe un título y contenido para previsualizar conexiones.");
      return;
    }

    setIsPreviewing(true);
    setPreviewError(null);
    try {
      const currentEmbedding = await embeddingsService.getEmbedding(title, content);
      const threshold = parseFloat(localStorage.getItem("nexo_similarity_threshold") || "0.65");
      
      const similarities: { note: NoteMetadata; similarity: number }[] = [];
      
      for (const id in index.notes) {
        // Skip comparing with the note itself if we are editing
        if (selectedNoteToEdit && id === selectedNoteToEdit.id) continue;
        
        const otherNote = index.notes[id];
        // Retrieve embedding from parent indexing if stored (we will inject it or read from index)
        const otherEmbed = (otherNote as any).embedding; 
        
        if (otherEmbed && otherEmbed.length > 0) {
          const sim = EmbeddingsService.cosineSimilarity(currentEmbedding, otherEmbed);
          if (sim >= threshold) {
            similarities.push({ note: otherNote, similarity: sim });
          }
        }
      }

      // Sort by similarity descending
      similarities.sort((a, b) => b.similarity - a.similarity);
      
      // Keep top 5 connections
      setPreviewConnections(similarities.slice(0, 5));
    } catch (err: any) {
      setPreviewError(err.message || "Error al calcular similitud.");
    } finally {
      setIsPreviewing(false);
    }
  };

  const isFormValid = title.trim().length > 0 && content.trim().length > 0;
  const isLineCountOptimal = lineCount >= 3 && lineCount <= 5;

  return (
    <div className="glass-panel" style={{ display: "flex", flexDirection: "column", gap: "1.2rem", height: "100%", overflowY: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifySelf: "flex-start", gap: "0.5rem" }}>
        <PenTool size={22} style={{ color: "var(--primary)" }} />
        <h2>{selectedNoteToEdit ? "Editar Nodo de Conocimiento" : "Capturar Nuevo Nodo"}</h2>
      </div>

      {!isAuthenticated && (
        <div style={{ display: "flex", gap: "0.5rem", padding: "0.8rem", background: "rgba(245, 158, 11, 0.1)", border: "1px solid rgba(245, 158, 11, 0.2)", borderRadius: "8px", fontSize: "0.85rem", color: "#f59e0b" }}>
          <AlertCircle size={18} style={{ flexShrink: 0 }} />
          <span>Inicia sesión con Google y configura tu Client ID en Ajustes para poder crear notas.</span>
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.2rem" }}>
        {/* Title */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <label style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontWeight: "500" }}>
              Título (Afirmación Proposicional)
            </label>
            <div className="tooltip-container" style={{ position: "relative", display: "inline-block" }} title="Ej: 'Las escalas de valor son subjetivas y ordinales' en vez de 'Economía'.">
              <HelpCircle size={14} style={{ color: "var(--text-muted)", cursor: "help" }} />
            </div>
          </div>
          <input
            type="text"
            placeholder="Ej: Las escalas de valor son subjetivas y ordinales..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={!isAuthenticated || isSaving}
            maxLength={100}
            style={{ fontWeight: "500" }}
          />
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
            Fuerza a tu cerebro a resumir la idea en una afirmación completa.
          </span>
        </div>

        {/* Content */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <label style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontWeight: "500" }}>
              Idea Principal (3 a 5 líneas)
            </label>
            <span style={{ 
              fontSize: "0.75rem", 
              fontWeight: "bold",
              color: isLineCountOptimal ? "var(--secondary)" : "var(--text-muted)" 
            }}>
              Líneas: {lineCount} {isLineCountOptimal ? "(Óptimo)" : ""}
            </span>
          </div>
          <textarea
            placeholder="Cierra el libro. Escribe la idea central en tus propias palabras usando máximo de 3 a 5 líneas..."
            rows={5}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={!isAuthenticated || isSaving}
            style={{ resize: "vertical", lineHeight: "1.4" }}
          />
          <span style={{ display: "flex", gap: "0.3rem", alignItems: "center", fontSize: "0.75rem", color: "var(--text-muted)" }}>
            <Info size={12} /> Restricción artificial para asegurar retención a bajo costo de mantenimiento.
          </span>
        </div>

        {/* Action buttons */}
        <div className="form-actions">
          {selectedNoteToEdit && onCancelEdit && (
            <button 
              type="button" 
              onClick={onCancelEdit} 
              disabled={isSaving}
              style={{ flex: 1, border: "1px solid var(--border-color)", background: "transparent" }}
            >
              Cancelar
            </button>
          )}
          <button
            type="button"
            onClick={handlePreviewConnections}
            disabled={!isAuthenticated || isSaving || isPreviewing || !isFormValid}
            style={{ flex: 1, display: "flex", gap: "0.4rem" }}
          >
            <Sparkles size={16} />
            {isPreviewing ? "Calculando..." : "Previsualizar"}
          </button>
          <button
            type="submit"
            className="primary"
            disabled={!isAuthenticated || isSaving || !isFormValid}
            style={{ flex: 2 }}
          >
            {isSaving ? "Guardando..." : selectedNoteToEdit ? "Actualizar Nodo" : "Guardar Nodo"}
          </button>
        </div>
      </form>

      {/* Preview Connections Output */}
      {previewError && (
        <div style={{ fontSize: "0.8rem", color: "#ef4444", padding: "0.5rem", background: "rgba(239, 68, 68, 0.08)", borderRadius: "6px", border: "1px solid rgba(239, 68, 68, 0.15)" }}>
          {previewError}
        </div>
      )}

      {previewConnections.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", borderTop: "1px solid var(--border-color)", paddingTop: "1rem" }}>
          <h4 style={{ fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.4rem", color: "var(--text-primary)" }}>
            <Link2 size={14} style={{ color: "var(--secondary)" }} />
            <span>Conexiones automáticas detectadas:</span>
          </h4>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            {previewConnections.map(({ note, similarity }) => (
              <div 
                key={note.id} 
                style={{ 
                  display: "flex", 
                  justifyContent: "space-between", 
                  alignItems: "center", 
                  background: "rgba(255, 255, 255, 0.03)", 
                  padding: "0.5rem 0.75rem", 
                  borderRadius: "6px",
                  borderLeft: "2px solid var(--secondary)",
                  fontSize: "0.8rem"
                }}
              >
                <span style={{ 
                  overflow: "hidden", 
                  textOverflow: "ellipsis", 
                  whiteSpace: "nowrap", 
                  maxWidth: "80%",
                  color: "var(--text-secondary)"
                }}>
                  {note.title}
                </span>
                <span style={{ fontWeight: "600", color: "var(--secondary)" }}>
                  {(similarity * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
