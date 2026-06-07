import React, { useState } from "react";
import { GoogleDriveService } from "../services/googleDrive";
import { Settings as SettingsIcon, Globe, AlertTriangle, CheckCircle, RefreshCw } from "lucide-react";


interface SettingsProps {
  driveService: GoogleDriveService;
  onConfigChanged: () => void;
  onRebuildGraph: () => Promise<void>;
  isRebuilding: boolean;
}

export const Settings: React.FC<SettingsProps> = ({
  driveService,
  onConfigChanged,
  onRebuildGraph,
  isRebuilding,
}) => {
  const [clientId, setClientId] = useState(driveService.getClientId());
  const [localThreshold, setLocalThreshold] = useState(() => {
    return parseFloat(localStorage.getItem("nexo_similarity_threshold") || "0.65");
  });
  
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    driveService.setClientId(clientId.trim());
    localStorage.setItem("nexo_similarity_threshold", localThreshold.toString());
    
    setSaveStatus("Configuración guardada localmente.");
    onConfigChanged();
    
    setTimeout(() => setSaveStatus(null), 3000);
  };

  const handleGoogleLogin = async () => {
    if (!clientId.trim()) {
      setAuthError("Ingresa primero tu Google Client ID.");
      return;
    }
    
    setAuthError(null);
    setIsLoggingIn(true);
    try {
      driveService.setClientId(clientId.trim());
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

  return (
    <div className="glass-panel" style={{ display: "flex", flexDirection: "column", gap: "1.5rem", height: "100%", overflowY: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <SettingsIcon size={22} className="text-primary" style={{ color: "var(--primary)" }} />
        <h2>Ajustes y Credenciales</h2>
      </div>

      <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: "1.2rem" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
            <Globe size={16} /> Google OAuth Client ID
          </label>
          <input
            type="text"
            placeholder="Introduce tu Client ID..."
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          <label style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
            <span>Umbral de Similitud Automática</span>
            <span style={{ fontWeight: "bold", color: "var(--primary)" }}>{localThreshold.toFixed(2)}</span>
          </label>
          <input
            type="range"
            min="0.4"
            max="0.9"
            step="0.01"
            value={localThreshold}
            onChange={(e) => setLocalThreshold(parseFloat(e.target.value))}
            style={{ width: "100%", accentColor: "var(--primary)", cursor: "pointer" }}
          />
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
            Valores más altos requieren que las notas sean conceptualmente más parecidas para conectarse.
          </span>
        </div>

        <div className="settings-actions">
          <button type="submit" className="primary" style={{ flex: 1 }}>
            Guardar Configuración
          </button>
          {saveStatus && (
            <span style={{ fontSize: "0.85rem", color: "var(--secondary)" }}>
              {saveStatus}
            </span>
          )}
        </div>
      </form>

      <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: "1.2rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
        <h3>Conexión con Google Drive</h3>
        
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
            <button onClick={handleGoogleLogout} style={{ border: "1px solid #ef4444", color: "#ef4444", background: "transparent" }}>
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
            <button onClick={handleGoogleLogin} className="primary" disabled={isLoggingIn}>
              {isLoggingIn ? "Conectando..." : "Iniciar Sesión con Google"}
            </button>
          </div>
        )}
      </div>

      {isGoogleAuthed && (
        <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: "1.2rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          <h3>Mantenimiento del Grafo</h3>
          <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
            Si cambiaste el umbral de similitud o modificaste archivos fuera de la app, puedes reconstruir la base de datos vectorial para recalcular las conexiones del grafo.
          </p>
          <button 
            onClick={onRebuildGraph} 
            disabled={isRebuilding}
            style={{ display: "flex", gap: "0.5rem", width: "100%" }}
          >
            <RefreshCw size={16} className={isRebuilding ? "glowing-element" : ""} style={{ animation: isRebuilding ? "pulse 1.5s infinite" : "none" }} />
            {isRebuilding ? "Reconstruyendo Grafo Vectorial..." : "Reconstruir Grafo Completo"}
          </button>
        </div>
      )}

      <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: "1.2rem", display: "flex", flexDirection: "column", gap: "0.8rem", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
        <h3 style={{ fontSize: "0.9rem" }}>Guía de Configuración</h3>
        
        <details style={{ cursor: "pointer" }}>
          <summary style={{ fontWeight: "500", color: "var(--text-primary)", padding: "0.2rem 0" }}>1. Obtener Google OAuth Client ID</summary>
          <ol style={{ paddingLeft: "1.2rem", display: "flex", flexDirection: "column", gap: "0.4rem", marginTop: "0.4rem" }}>
            <li>Ve a la <a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer" style={{ color: "var(--primary)" }}>Google Cloud Console</a>.</li>
            <li>Crea un proyecto e ingresa a "Pantalla de consentimiento de OAuth". Configúralo como <strong>Externo</strong>.</li>
            <li>En la pestaña "Credenciales", haz clic en <strong>Crear Credenciales &gt; ID de cliente de OAuth</strong>.</li>
            <li>Tipo de aplicación: <strong>Aplicación web</strong>.</li>
            <li>Añade <code>http://localhost:5173</code> (o tu URL de producción) en <strong>Orígenes de JavaScript autorizados</strong>.</li>
            <li>Copia el "ID de cliente" resultante y pégalo arriba.</li>
          </ol>
        </details>
      </div>
    </div>
  );
};
