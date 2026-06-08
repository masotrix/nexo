import React, { useState } from "react";
import { GoogleDriveService } from "../services/googleDrive";
import { User, AlertTriangle, CheckCircle } from "lucide-react";

interface SettingsProps {
  driveService: GoogleDriveService;
  onConfigChanged: () => void;
}

export const Settings: React.FC<SettingsProps> = ({
  driveService,
  onConfigChanged,
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

  return (
    <div className="glass-panel" style={{ display: "flex", flexDirection: "column", gap: "1.5rem", height: "100%", overflowY: "auto" }}>
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
    </div>
  );
};
