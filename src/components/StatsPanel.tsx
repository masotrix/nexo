import React, { useState } from "react";
import type { GraphIndex, NoteMetadata, GoogleDriveService } from "../services/googleDrive";
import { BarChart3, Database, CalendarDays, Share2, Award, Download, Loader2 } from "lucide-react";

interface StatsPanelProps {
  index: GraphIndex;
  driveService: GoogleDriveService;
  onSelectNote: (noteId: string | null) => void;
}

export const StatsPanel: React.FC<StatsPanelProps> = ({
  index,
  driveService,
  onSelectNote,
}) => {
  const [downloadingClusterId, setDownloadingClusterId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const notesList = Object.values(index.notes);
  const totalNotes = notesList.length;

  // 1. Calculate unique days of reading
  const uniqueDays = new Set(
    notesList.map(note => {
      try {
        return new Date(note.date).toDateString();
      } catch (e) {
        return null;
      }
    }).filter(Boolean)
  ).size;

  // 2. Count connections and calculate density
  let totalConnections = 0;
  notesList.forEach(note => {
    totalConnections += note.connections.length;
  });
  // Since edges are bidirectional, we divide by 2 for unique links
  const uniqueLinksCount = totalConnections / 2;
  const graphDensity = totalNotes > 0 ? (totalConnections / totalNotes).toFixed(1) : "0.0";

  // 3. Group notes by clusterId
  const notesByCluster: { [clusterId: string]: NoteMetadata[] } = {};
  const unclassifiedNotes: NoteMetadata[] = [];

  notesList.forEach(note => {
    if (note.clusterId) {
      if (!notesByCluster[note.clusterId]) {
        notesByCluster[note.clusterId] = [];
      }
      notesByCluster[note.clusterId].push(note);
    } else {
      unclassifiedNotes.push(note);
    }
  });

  const handleDownloadCluster = async (clusterId: string, clusterName: string, notes: NoteMetadata[]) => {
    if (notes.length === 0) return;
    setDownloadingClusterId(clusterId);
    setDownloadError(null);
    try {
      const fetchedNotes = await Promise.all(
        notes.map(async (note) => {
          const fileData = await driveService.readNoteFile(note.id);
          return {
            title: note.title,
            date: note.date,
            content: fileData.content,
          };
        })
      );

      let markdown = `# Tema: ${clusterName}\n\n`;
      markdown += `Notas agrupadas bajo este tema en Nexo.\n`;
      markdown += `Generado el: ${new Date().toLocaleDateString("es-ES", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })}\n\n`;
      markdown += `Total de notas: ${fetchedNotes.length}\n\n`;
      markdown += `---\n\n`;

      fetchedNotes.forEach((note) => {
        const formattedDate = new Date(note.date).toLocaleDateString("es-ES", {
          day: "numeric",
          month: "long",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });

        markdown += `## ${note.title}\n`;
        markdown += `*Fecha: ${formattedDate}*\n\n`;
        markdown += `${note.content}\n\n`;
        markdown += `---\n\n`;
      });

      const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const safeFileName = clusterName
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_-]/g, "");
      link.setAttribute("download", `nexo_${safeFileName}.md`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error("Error al descargar las notas:", err);
      setDownloadError(`Error al descargar notas: ${err.message || "Fallo en la comunicación con Google Drive."}`);
      setTimeout(() => setDownloadError(null), 7000);
    } finally {
      setDownloadingClusterId(null);
    }
  };

  return (
    <div className="glass-panel" style={{ display: "flex", flexDirection: "column", gap: "1.2rem", height: "100%", overflowY: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <BarChart3 size={22} style={{ color: "var(--primary)" }} />
        <h2>Progreso y Biblioteca</h2>
      </div>

      {downloadError && (
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.7rem 1rem", background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.2)", borderRadius: "10px", fontSize: "0.85rem", color: "#ef4444" }}>
          <span>{downloadError}</span>
        </div>
      )}

      {/* Grid of stats cards */}
      <div className="stats-grid">
        <div style={{ background: "rgba(255, 255, 255, 0.02)", border: "1px solid var(--border-color)", borderRadius: "10px", padding: "0.8rem", display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "0.3rem" }}>
            <Database size={12} /> Total Nodos
          </span>
          <span style={{ fontSize: "1.5rem", fontWeight: "800", color: "var(--text-primary)", fontFamily: "Outfit, sans-serif" }}>
            {totalNotes}
          </span>
        </div>

        <div style={{ background: "rgba(255, 255, 255, 0.02)", border: "1px solid var(--border-color)", borderRadius: "10px", padding: "0.8rem", display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "0.3rem" }}>
            <CalendarDays size={12} /> Días de Lectura
          </span>
          <span style={{ fontSize: "1.5rem", fontWeight: "800", color: "var(--text-primary)", fontFamily: "Outfit, sans-serif" }}>
            {uniqueDays}
          </span>
        </div>

        <div style={{ background: "rgba(255, 255, 255, 0.02)", border: "1px solid var(--border-color)", borderRadius: "10px", padding: "0.8rem", display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "0.3rem" }}>
            <Share2 size={12} /> Enlaces Totales
          </span>
          <span style={{ fontSize: "1.5rem", fontWeight: "800", color: "var(--text-primary)", fontFamily: "Outfit, sans-serif" }}>
            {uniqueLinksCount}
          </span>
        </div>

        <div style={{ background: "rgba(255, 255, 255, 0.02)", border: "1px solid var(--border-color)", borderRadius: "10px", padding: "0.8rem", display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "0.3rem" }}>
            <Award size={12} /> Conexión Promedio
          </span>
          <span style={{ fontSize: "1.5rem", fontWeight: "800", color: "var(--text-primary)", fontFamily: "Outfit, sans-serif" }}>
            {graphDensity}
          </span>
        </div>
      </div>



      {/* Library grouped by emergent topic */}
      <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: "1rem", display: "flex", flexDirection: "column", gap: "0.8rem" }}>
        <h3>Biblioteca Conceptual</h3>

        {totalNotes === 0 ? (
          <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", textAlign: "center", padding: "1rem" }}>
            Aún no has creado ningún nodo de conocimiento. ¡Registra ideas de tu lectura diaria para comenzar!
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {Object.entries(notesByCluster).map(([clusterId, clusterNotes]) => {
              const uniqueClusters = Array.from(
                new Set(notesList.map((n) => n.clusterId).filter(Boolean))
              );
              const CONSTELLATION_NAMES = [
                "Constelación Violeta",
                "Constelación Esmeralda",
                "Constelación Azul",
                "Constelación Rosa",
                "Constelación Ámbar",
                "Constelación Cian",
                "Constelación Naranja",
                "Constelación Fucsia",
                "Constelación Lima",
                "Constelación Lavanda"
              ];
              const CLUSTER_COLORS = [
                "#8b5cf6", // Violeta
                "#10b981", // Esmeralda
                "#3b82f6", // Azul
                "#ec4899", // Rosa
                "#f59e0b", // Ámbar
                "#06b6d4", // Cian
                "#f97316", // Naranja
                "#f43f5e", // Rosa fuerte
                "#84cc16", // Lima
                "#a78bfa", // Lavanda
              ];
              const clusterIdx = uniqueClusters.indexOf(clusterId);
              const clusterName = CONSTELLATION_NAMES[clusterIdx % CONSTELLATION_NAMES.length] || `Constelación ${clusterId}`;
              const clusterColor = CLUSTER_COLORS[clusterIdx % CLUSTER_COLORS.length] || "var(--primary)";

              return (
                <div key={clusterId} style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                  <div style={{ 
                    display: "flex", 
                    justifyContent: "space-between", 
                    alignItems: "center",
                    borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
                    paddingBottom: "0.2rem"
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <h4 style={{ fontSize: "0.85rem", color: clusterColor }}>{clusterName}</h4>
                      <button
                        onClick={() => handleDownloadCluster(clusterId, clusterName, clusterNotes)}
                        disabled={downloadingClusterId !== null}
                        title="Descargar notas de este tema"
                        style={{
                          background: "transparent",
                          border: "none",
                          padding: "2px",
                          cursor: "pointer",
                          color: "var(--text-muted)",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          transition: "color 0.2s",
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.color = "var(--text-primary)"}
                        onMouseLeave={(e) => e.currentTarget.style.color = "var(--text-muted)"}
                      >
                        {downloadingClusterId === clusterId ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Download size={14} />
                        )}
                      </button>
                    </div>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: "bold" }}>
                      {clusterNotes.length} {clusterNotes.length === 1 ? "nodo" : "nodos"}
                    </span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem", paddingLeft: "0.4rem" }}>
                    {clusterNotes.map(note => (
                      <div 
                        key={note.id} 
                        onClick={() => onSelectNote(note.id)}
                        style={{ 
                          fontSize: "0.8rem", 
                          color: "var(--text-secondary)", 
                          cursor: "pointer",
                          padding: "0.25rem",
                          borderRadius: "4px",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap"
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.color = "var(--text-primary)"}
                        onMouseLeave={(e) => e.currentTarget.style.color = "var(--text-secondary)"}
                      >
                        • {note.title}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Unclassified Group */}
            {unclassifiedNotes.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                <div style={{ 
                  display: "flex", 
                  justifyContent: "space-between", 
                  alignItems: "center",
                  borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
                  paddingBottom: "0.2rem"
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <h4 style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Sin clasificar</h4>
                    <button
                      onClick={() => handleDownloadCluster("unclassified", "Sin clasificar", unclassifiedNotes)}
                      disabled={downloadingClusterId !== null}
                      title="Descargar notas sin clasificar"
                      style={{
                        background: "transparent",
                        border: "none",
                        padding: "2px",
                        cursor: "pointer",
                        color: "var(--text-muted)",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        transition: "color 0.2s",
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.color = "var(--text-primary)"}
                      onMouseLeave={(e) => e.currentTarget.style.color = "var(--text-muted)"}
                    >
                      {downloadingClusterId === "unclassified" ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Download size={14} />
                      )}
                    </button>
                  </div>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: "bold" }}>
                    {unclassifiedNotes.length} {unclassifiedNotes.length === 1 ? "nodo" : "nodos"}
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem", paddingLeft: "0.4rem" }}>
                  {unclassifiedNotes.map(note => (
                    <div 
                      key={note.id} 
                      onClick={() => onSelectNote(note.id)}
                      style={{ 
                        fontSize: "0.8rem", 
                        color: "var(--text-secondary)", 
                        cursor: "pointer",
                        padding: "0.25rem",
                        borderRadius: "4px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap"
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.color = "var(--text-primary)"}
                      onMouseLeave={(e) => e.currentTarget.style.color = "var(--text-secondary)"}
                    >
                      • {note.title}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
