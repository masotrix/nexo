import React, { useState, useEffect } from "react";
import { GoogleDriveService } from "../services/googleDrive";
import type { NoteMetadata } from "../services/googleDrive";
import { BookOpen, Calendar, Tag, Link2, Trash2, Edit2, ChevronRight, X, AlertTriangle } from "lucide-react";

interface NoteDetailsProps {
  noteId: string;
  driveService: GoogleDriveService;
  notesIndex: { [fileId: string]: NoteMetadata };
  onClose: () => void;
  onEditNote: (note: { id: string; title: string; content: string; date: string }) => void;
  onDeleteNote: (noteId: string) => Promise<void>;
  onSelectNoteId: (noteId: string | null) => void;
  clusters?: { [clusterId: string]: string };
}

export const NoteDetails: React.FC<NoteDetailsProps> = ({
  noteId,
  driveService,
  notesIndex,
  onClose,
  onEditNote,
  onDeleteNote,
  onSelectNoteId,
  clusters = {},
}) => {
  const [content, setContent] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  const noteMeta = notesIndex[noteId];

  // Fetch note file contents on load or noteId change
  useEffect(() => {
    let active = true;
    const fetchContent = async () => {
      setIsLoading(true);
      setError(null);
      setShowDeleteConfirm(false);
      try {
        const fileData = await driveService.readNoteFile(noteId);
        if (active) {
          setContent(fileData.content);
        }
      } catch (err: any) {
        if (active) {
          setError(err.message || "Error al leer el archivo de la nota.");
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    fetchContent();

    return () => {
      active = false;
    };
  }, [noteId, driveService, notesIndex[noteId]]);

  if (!noteMeta) {
    return (
      <div className="glass-panel" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "var(--text-secondary)" }}>La nota ya no existe.</span>
        <button onClick={onClose} style={{ padding: "0.25rem" }}><X size={16} /></button>
      </div>
    );
  }

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await onDeleteNote(noteId);
      setShowDeleteConfirm(false);
    } catch (err: any) {
      setError(err.message || "Error al eliminar la nota.");
      setIsDeleting(false);
    }
  };

  const getClusterName = () => {
    if (!noteMeta.clusterId) return "Sin clasificar";
    return clusters[noteMeta.clusterId] || `Tema ${noteMeta.clusterId.replace("cluster_", "")}`;
  };

  const formattedDate = new Date(noteMeta.date).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="glass-panel" style={{ display: "flex", flexDirection: "column", gap: "1.2rem", height: "100%", overflowY: "auto", position: "relative" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", color: "var(--primary)" }}>
          <BookOpen size={20} />
          <span style={{ fontSize: "0.85rem", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.05em" }}>Ver Nodo</span>
        </div>
        <button onClick={onClose} style={{ padding: "0.25rem", background: "transparent", border: "none" }}>
          <X size={18} style={{ color: "var(--text-secondary)", cursor: "pointer" }} />
        </button>
      </div>

      {isLoading ? (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "150px", color: "var(--text-secondary)" }}>
          <span className="glowing-element">Cargando contenido del nodo...</span>
        </div>
      ) : error ? (
        <div style={{ padding: "0.8rem", background: "rgba(239, 68, 68, 0.1)", borderRadius: "8px", border: "1px solid rgba(239, 68, 68, 0.2)", fontSize: "0.85rem", color: "#ef4444" }}>
          {error}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.2rem" }}>
          {/* Note Title */}
          <h2 style={{ fontSize: "1.25rem", lineHeight: "1.3", color: "var(--text-primary)" }}>
            {noteMeta.title}
          </h2>

          {/* Meta badges */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", background: "rgba(255,255,255,0.03)", padding: "0.3rem 0.6rem", borderRadius: "20px" }}>
              <Calendar size={12} />
              <span>{formattedDate}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", background: "rgba(255,255,255,0.03)", padding: "0.3rem 0.6rem", borderRadius: "20px" }}>
              <Tag size={12} />
              <span style={{ color: noteMeta.clusterId ? "var(--primary)" : "var(--text-muted)" }}>
                {getClusterName()}
              </span>
            </div>
          </div>

          {/* Note Content Box */}
          <div style={{ 
            background: "rgba(0, 0, 0, 0.2)", 
            padding: "1rem", 
            borderRadius: "10px", 
            border: "1px solid rgba(255, 255, 255, 0.03)",
            fontSize: "0.95rem",
            lineHeight: "1.5",
            color: "#e2e8f0",
            whiteSpace: "pre-wrap",
            fontFamily: "Inter, sans-serif"
          }}>
            {content}
          </div>

          {/* Connected Notes Navigation */}
          <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: "1rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            <h4 style={{ fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.4rem", color: "var(--text-primary)" }}>
              <Link2 size={14} style={{ color: "var(--primary)" }} />
              <span>Nodos Conectados ({noteMeta.connections.length})</span>
            </h4>

            {noteMeta.connections.length === 0 ? (
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontStyle: "italic" }}>
                Este nodo no está conectado a ninguna otra nota. Reconstruye el grafo o añade enlaces manuales.
              </span>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {noteMeta.connections.map(connId => {
                  const connNote = notesIndex[connId];
                  if (!connNote) return null;
                  return (
                    <div 
                      key={connId} 
                      onClick={() => onSelectNoteId(connId)}
                      style={{ 
                        display: "flex", 
                        justifyContent: "space-between", 
                        alignItems: "center", 
                        background: "rgba(255,255,255,0.03)", 
                        padding: "0.5rem 0.75rem", 
                        borderRadius: "8px", 
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                        fontSize: "0.8rem"
                      }}
                      className="connected-link-item"
                      onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.07)"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.03)"}
                    >
                      <span style={{ 
                        overflow: "hidden", 
                        textOverflow: "ellipsis", 
                        whiteSpace: "nowrap", 
                        maxWidth: "85%",
                        color: "var(--text-secondary)"
                      }}>
                        {connNote.title}
                      </span>
                      <ChevronRight size={14} style={{ color: "var(--text-muted)" }} />
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Action buttons (Edit / Delete) */}
          <div className="detail-actions" style={{ borderTop: "1px solid var(--border-color)", paddingTop: "1rem", marginTop: "0.5rem" }}>
            <button 
              onClick={() => onEditNote({ id: noteId, title: noteMeta.title, content, date: noteMeta.date })}
              style={{ flex: 1, display: "flex", gap: "0.4rem" }}
            >
              <Edit2 size={14} />
              Editar Nodo
            </button>
            <button 
              onClick={() => setShowDeleteConfirm(true)}
              style={{ border: "1px solid rgba(239, 68, 68, 0.3)", color: "#ef4444", background: "transparent", flex: 1, display: "flex", gap: "0.4rem" }}
            >
              <Trash2 size={14} />
              Eliminar
            </button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal overlay inside panel */}
      {showDeleteConfirm && (
        <div style={{ 
          position: "absolute", 
          top: 0, 
          left: 0, 
          right: 0, 
          bottom: 0, 
          background: "rgba(6, 9, 19, 0.95)", 
          borderRadius: "16px",
          display: "flex", 
          flexDirection: "column", 
          justifyContent: "center", 
          alignItems: "center", 
          padding: "1.5rem", 
          textAlign: "center",
          gap: "1rem",
          zIndex: 10
        }}>
          <AlertTriangle size={40} style={{ color: "#ef4444" }} />
          <h3>¿Eliminar este nodo?</h3>
          <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
            Esto eliminará permanentemente el archivo Markdown de tu Google Drive y desconectará sus enlaces en el grafo.
          </p>
          <div className="detail-actions" style={{ width: "100%", marginTop: "0.5rem" }}>
            <button 
              onClick={() => setShowDeleteConfirm(false)} 
              disabled={isDeleting}
              style={{ flex: 1 }}
            >
              Cancelar
            </button>
            <button 
              onClick={handleDelete} 
              disabled={isDeleting}
              style={{ background: "#ef4444", border: "none", color: "white", flex: 1 }}
            >
              {isDeleting ? "Eliminando..." : "Sí, Eliminar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
