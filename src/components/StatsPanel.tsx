import React from "react";
import type { GraphIndex, NoteMetadata } from "../services/googleDrive";
import { BarChart3, Database, CalendarDays, Share2, Award } from "lucide-react";

interface StatsPanelProps {
  index: GraphIndex;
  onSelectNote: (noteId: string | null) => void;
}

export const StatsPanel: React.FC<StatsPanelProps> = ({
  index,
  onSelectNote,
}) => {
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

  return (
    <div className="glass-panel" style={{ display: "flex", flexDirection: "column", gap: "1.2rem", height: "100%", overflowY: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <BarChart3 size={22} style={{ color: "var(--primary)" }} />
        <h2>Progreso y Biblioteca</h2>
      </div>

      {/* Grid of stats cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.8rem" }}>
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
                    <h4 style={{ fontSize: "0.85rem", color: clusterColor }}>{clusterName}</h4>
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
                  <h4 style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Sin clasificar</h4>
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
