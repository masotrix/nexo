import React, { useState } from "react";
import { GoogleDriveService, GraphIndex } from "../services/googleDrive";
import { User, AlertTriangle, CheckCircle, Network, Plus, Trash2 } from "lucide-react";

interface SettingsProps {
  driveService: GoogleDriveService;
  onConfigChanged: () => void;
  index?: GraphIndex;
  activeGraphId?: string;
  onSelectGraph?: (id: string) => void;
  onCreateGraph?: (name?: string) => void;
  onDeleteGraph?: (id: string) => void;
}

export const Settings: React.FC<SettingsProps> = ({
  driveService,
  onConfigChanged,
  index,
  activeGraphId = "default",
  onSelectGraph,
  onCreateGraph,
  onDeleteGraph,
}) => {
  const [authError, setAuthError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleGoogleLogin = async () => {
    setAuthError(null);
    setIsLoggingIn(true);
    try {
      await driveService.login();
      onConfigChanged();
    } catch (err: any) {
      setAuthError(err.message || "Error al conectar con Google.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleGoogleLogout = () => {
    driveService.logout();
    onConfigChanged();
  };

  const isGoogleAuthed = driveService.isAuthenticated();

  const graphsList = index?.graphs || { default: { id: "default", name: "Grafo Principal", date: new Date().toISOString() } };

  return (
    <div className="glass-panel" style={{ display: "flex", flexDirection: "column", gap: "1.5rem", height: "100%", overflowY: "auto" }}>
      {/* Account Section */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <User size={22} className="text-primary" style={{ color: "var(--primary)" }} />
        <h2>Cuenta y Conexión</h2>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "1.2rem" }}>
        <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: "1.6" }}>
          Nexo sincroniza tus notas y conexiones de conocimiento directamente en tu cuenta personal de Google Drive.
        </p>

        {isGoogleAuthed ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.8rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--secondary)", fontSize: "0.9rem" }}>
              <CheckCircle size={18} />
              <span>Conectado correctamente con Google Drive</span>
            </div>
            {driveService.getFolderId() && (
              <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", wordBreak: "break-all" }}>
                ID de Carpeta: <code style={{ background: "rgba(0,0,0,0.2)", padding: "2px 4px", borderRadius: "4px" }}>{driveService.getFolderId()}</code>
              </div>
            )}
            <button onClick={handleGoogleLogout} style={{ border: "1px solid #ef4444", color: "#ef4444", background: "transparent", width: "100%" }}>
              Desconectar Cuenta
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.8rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#f59e0b", fontSize: "0.9rem" }}>
              <AlertTriangle size={18} />
              <span>No conectado con Google Drive</span>
            </div>
            {authError && (
              <div style={{ fontSize: "0.85rem", color: "#ef4444", padding: "0.5rem", background: "rgba(239, 68, 68, 0.1)", borderRadius: "6px" }}>
                {authError}
              </div>
            )}
            <button onClick={handleGoogleLogin} className="primary" disabled={isLoggingIn} style={{ width: "100%" }}>
              {isLoggingIn ? "Conectando..." : "Iniciar Sesión con Google"}
            </button>
          </div>
        )}
      </div>

      <hr style={{ border: "none", borderTop: "1px solid var(--border-color)", margin: "0.5rem 0" }} />

      {/* Graph Management Section */}
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Network size={20} style={{ color: "var(--primary)" }} />
            <h3 style={{ fontSize: "1.1rem" }}>Gestión de Grafos</h3>
          </div>
          {onCreateGraph && (
            <button
              onClick={() => onCreateGraph()}
              style={{
                fontSize: "0.8rem",
                padding: "0.3rem 0.7rem",
                borderRadius: "6px",
                background: "rgba(139, 92, 246, 0.15)",
                border: "1px solid var(--primary)",
                color: "var(--primary)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "0.3rem"
              }}
            >
              <Plus size={14} />
              <span>Nuevo Grafo</span>
            </button>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          {Object.values(graphsList).map((graph) => {
            const count = index?.notes
              ? Object.values(index.notes).filter((n) => (n.graphId || "default") === graph.id).length
              : 0;
            const isSelected = activeGraphId === graph.id;

            return (
              <div
                key={graph.id}
                style={{
                  display: "flex",
                  justify: "space-between",
                  alignItems: "center",
                  padding: "0.7rem 0.9rem",
                  borderRadius: "8px",
                  background: isSelected ? "rgba(139, 92, 246, 0.15)" : "rgba(255, 255, 255, 0.03)",
                  border: isSelected ? "1px solid var(--primary)" : "1px solid var(--border-color)",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: "0.1rem" }}>
                  <span style={{ fontWeight: isSelected ? "600" : "normal", fontSize: "0.9rem", color: "var(--text-primary)" }}>
                    {graph.name} {graph.id === "default" && "(Por Defecto)"}
                  </span>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                    {count} {count === 1 ? "nodo" : "nodos"}
                  </span>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  {onSelectGraph && !isSelected && (
                    <button
                      onClick={() => onSelectGraph(graph.id)}
                      style={{ fontSize: "0.75rem", padding: "0.2rem 0.6rem", borderRadius: "6px" }}
                    >
                      Activar
                    </button>
                  )}

                  {onDeleteGraph && graph.id !== "default" && (
                    <button
                      onClick={() => onDeleteGraph(graph.id)}
                      title="Eliminar Grafo"
                      style={{
                        padding: "0.3rem",
                        background: "transparent",
                        border: "none",
                        color: "#ef4444",
                        cursor: "pointer",
                        opacity: 0.8
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
