// Service to handle Google Drive API v3 integrations client-side

export interface NoteMetadata {
  id: string;           // Google Drive file ID
  title: string;        // Proposition title
  date: string;         // ISO Date string
  connections: string[]; // List of connected note file IDs
  clusterId?: string;   // Assigned topic cluster ID
  embedding?: number[]; // Vector embedding for client distance/cluster calculations
  graphId?: string;     // Assigned graph ID (defaults to "default")
}

export interface GraphDefinition {
  id: string;
  name: string;
  date: string;
}

export interface GraphIndex {
  notes: { [fileId: string]: NoteMetadata };
  similarityThreshold: number;
  clusters?: { [clusterId: string]: string }; // Map of clusterId -> clusterName (from Gemini)
  graphs?: { [graphId: string]: GraphDefinition }; // Map of graphId -> GraphDefinition
  activeGraphId?: string;
}

const ROOT_FOLDER_NAME = "Nodos de Conocimiento";
const INDEX_FILE_NAME = "metadata.json";

export class GoogleDriveService {
  private accessToken: string | null = null;
  private tokenExpiry: number = 0; // Timestamp in ms
  private clientId: string = "";
  private folderId: string | null = null;
  private contentCache = new Map<string, { title: string; date: string; content: string }>();
  public onSessionExpired?: () => void;

  public cacheContent(fileId: string, data: { title: string; date: string; content: string }) {
    this.contentCache.set(fileId, data);
  }

  constructor() {
    this.clientId = '804370913602-0usktvrnitnpd9jf9a1pd6hj6bhdt5oo.apps.googleusercontent.com';
    
    // 1. Process token if arriving back from OAuth redirect URL (#access_token=...)
    this.handleUrlHashToken();

    // 2. Load stored token from localStorage if not set by redirect
    if (!this.accessToken) {
      this.accessToken = localStorage.getItem("nexo_google_access_token");
      this.tokenExpiry = parseInt(localStorage.getItem("nexo_google_token_expiry") || "0", 10);
    }
    this.folderId = localStorage.getItem("nexo_google_folder_id");
  }

  // Extract access token from URL fragment after OAuth redirect
  public handleUrlHashToken(): boolean {
    const hash = window.location.hash;
    if (hash && hash.includes("access_token=")) {
      const params = new URLSearchParams(hash.substring(1));
      const token = params.get("access_token");
      const expiresIn = params.get("expires_in");

      if (token) {
        this.accessToken = token;
        this.tokenExpiry = Date.now() + (parseInt(expiresIn || "3600", 10) - 300) * 1000;

        localStorage.setItem("nexo_google_access_token", this.accessToken);
        localStorage.setItem("nexo_google_token_expiry", this.tokenExpiry.toString());
        localStorage.setItem("nexo_was_connected", "true");

        // Clean up URL hash without reloading page
        try {
          history.replaceState(null, "", window.location.pathname + window.location.search);
        } catch (e) {}

        return true;
      }
    }
    return false;
  }

  // Detect mobile or standalone PWA environment
  public isMobileOrPWA(): boolean {
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches || (window.navigator as any).standalone === true;
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    return isStandalone || isMobile;
  }

  // Perform full-window OAuth redirect for mobile / standalone PWA to avoid stuck popup tabs
  public loginWithRedirect() {
    if (!this.clientId) {
      throw new Error("Por favor, ingresa tu Google Client ID en Ajustes.");
    }

    const redirectUri = window.location.origin + window.location.pathname;
    const scope = encodeURIComponent("https://www.googleapis.com/auth/drive.file");
    const oauthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(
      this.clientId
    )}&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&response_type=token&scope=${scope}&include_granted_scopes=true&prompt=select_account`;

    window.location.href = oauthUrl;
  }

  // Update client config
  public setClientId(clientId: string) {
    this.clientId = clientId;
    localStorage.setItem("nexo_google_client_id", clientId);
  }

  public getClientId(): string {
    return this.clientId;
  }

  public getFolderId(): string | null {
    return this.folderId;
  }

  // Check if authenticated and token is valid
  public isAuthenticated(): boolean {
    return !!this.accessToken && Date.now() < this.tokenExpiry;
  }

  // Initialize and request Google login (interactive or silent)
  public login(silent = false): Promise<string> {
    // On mobile or standalone PWAs, interactive popups get stuck on postmessageRelay. Use direct window redirect!
    if (!silent && this.isMobileOrPWA()) {
      this.loginWithRedirect();
      return new Promise(() => {}); // Window will navigate immediately
    }

    return new Promise((resolve, reject) => {
      if (!this.clientId) {
        return reject(new Error("Por favor, ingresa tu Google Client ID en Ajustes."));
      }

      // Check if GIS client is loaded in window
      if (!(window as any).google || !(window as any).google.accounts) {
        if (!silent) {
          this.loginWithRedirect();
          return;
        }
        return reject(new Error("El SDK de Google no se ha cargado. Verifica tu conexión."));
      }

      const client = (window as any).google.accounts.oauth2.initTokenClient({
        client_id: this.clientId,
        scope: "https://www.googleapis.com/auth/drive.file",
        callback: (response: any) => {
          if (response.error) {
            return reject(new Error(`Error de autenticación: ${response.error}`));
          }
          
          this.accessToken = response.access_token;
          // Expiry buffer of 5 minutes (expires_in is in seconds)
          this.tokenExpiry = Date.now() + (parseInt(response.expires_in, 10) - 300) * 1000;
          
          localStorage.setItem("nexo_google_access_token", this.accessToken!);
          localStorage.setItem("nexo_google_token_expiry", this.tokenExpiry.toString());
          localStorage.setItem("nexo_was_connected", "true");
          
          resolve(this.accessToken!);
        },
      });

      if (silent) {
        client.requestAccessToken({ prompt: "" });
      } else {
        client.requestAccessToken({ prompt: "select_account" });
      }
    });
  }

  // Logout/Disconnect
  public logout() {
    this.accessToken = null;
    this.tokenExpiry = 0;
    this.folderId = null;
    localStorage.removeItem("nexo_google_access_token");
    localStorage.removeItem("nexo_google_token_expiry");
    localStorage.removeItem("nexo_google_folder_id");
    localStorage.removeItem("nexo_was_connected");
  }

  // Generic helper for authenticated fetches
  private async driveFetch(
    url: string, 
    options: RequestInit = {}
  ): Promise<any> {
    if (!this.isAuthenticated()) {
      if (this.onSessionExpired) {
        this.onSessionExpired();
      }
      throw new Error("Sesión de Google Drive expirada o no iniciada.");
    }

    const headers = new Headers(options.headers || {});
    headers.set("Authorization", `Bearer ${this.accessToken}`);

    const response = await fetch(url, { ...options, headers });
    
    if (response.status === 401) {
      this.accessToken = null;
      this.tokenExpiry = 0;
      localStorage.removeItem("nexo_google_access_token");
      localStorage.removeItem("nexo_google_token_expiry");
      if (this.onSessionExpired) {
        this.onSessionExpired();
      }
      throw new Error("Sesión de Google Drive invalidada. Por favor ingresa de nuevo.");
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google Drive API error (${response.status}): ${errorText}`);
    }

    // Some endpoints return empty body on success (like DELETE or media updates)
    if (response.status === 204 || response.headers.get("content-length") === "0") {
      return null;
    }

    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      return response.json();
    }
    return response.text();
  }

  // Search or create the root folder "Nodos de Conocimiento"
  public async getOrCreateRootFolder(): Promise<string> {
    if (this.folderId) {
      try {
        // Double check it exists on Drive and is not trashed
        const details = await this.driveFetch(
          `https://www.googleapis.com/drive/v3/files/${this.folderId}?fields=id,name,trashed`
        );
        if (details && !details.trashed && details.name === ROOT_FOLDER_NAME) {
          return this.folderId;
        }
      } catch (e) {
        // Folder doesn't exist, we will search/create it below
        this.folderId = null;
      }
    }

    // Search for existing folder
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
      `name = '${ROOT_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
    )}&fields=files(id)`;
    
    const result = await this.driveFetch(searchUrl);
    if (result.files && result.files.length > 0) {
      this.folderId = result.files[0].id;
      localStorage.setItem("nexo_google_folder_id", this.folderId!);
      return this.folderId!;
    }

    // Create the folder
    const createUrl = "https://www.googleapis.com/drive/v3/files";
    const newFolder = await this.driveFetch(createUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: ROOT_FOLDER_NAME,
        mimeType: "application/vnd.google-apps.folder",
      }),
    });

    this.folderId = newFolder.id;
    localStorage.setItem("nexo_google_folder_id", this.folderId!);
    return this.folderId!;
  }

  // Fetch index metadata.json or create it if missing
  public async fetchIndex(): Promise<GraphIndex> {
    const parentId = await this.getOrCreateRootFolder();
    
    // Search for metadata.json in this folder
    const query = encodeURIComponent(
      `name = '${INDEX_FILE_NAME}' and '${parentId}' in parents and trashed = false`
    );
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)`;
    const result = await this.driveFetch(searchUrl);

    if (result.files && result.files.length > 0) {
      const fileId = result.files[0].id;
      // Fetch contents
      const data = await this.driveFetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`
      );
      // Validate we parsed it correctly
      if (typeof data === "object") {
        return data as GraphIndex;
      }
      try {
        return JSON.parse(data);
      } catch (e) {
        // Corrupted index, return a fresh one
        return { notes: {}, similarityThreshold: 0.65 };
      }
    }

    // Not found, create a blank index
    const initialIndex: GraphIndex = { notes: {}, similarityThreshold: 0.65 };
    await this.saveIndex(initialIndex);
    return initialIndex;
  }

  // Save index metadata.json
  public async saveIndex(index: GraphIndex): Promise<void> {
    const parentId = await this.getOrCreateRootFolder();
    
    // Find metadata.json ID if it exists
    const query = encodeURIComponent(
      `name = '${INDEX_FILE_NAME}' and '${parentId}' in parents and trashed = false`
    );
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)`;
    const result = await this.driveFetch(searchUrl);

    const boundary = "nexo_multipart_boundary";
    const metadata = {
      name: INDEX_FILE_NAME,
      mimeType: "application/json",
      parents: [parentId],
    };
    const indexStr = JSON.stringify(index, null, 2);

    if (result.files && result.files.length > 0) {
      // Update existing
      const fileId = result.files[0].id;
      await this.driveFetch(
        `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: indexStr,
        }
      );
    } else {
      // Create new multipart
      const requestBody = 
        `\r\n--${boundary}\r\n` +
        `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
        `${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\n` +
        `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
        `${indexStr}\r\n` +
        `--${boundary}--`;

      await this.driveFetch(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
        {
          method: "POST",
          headers: {
            "Content-Type": `multipart/related; boundary=${boundary}`,
          },
          body: requestBody,
        }
      );
    }
  }

  // Create or update a note Markdown file in Google Drive
  // Returns the Google Drive File ID of the Markdown file
  public async saveNoteFile(
    fileId: string | null, 
    title: string, 
    content: string, 
    date: string, 
    connections: string[]
  ): Promise<string> {
    const parentId = await this.getOrCreateRootFolder();
    
    // Build YAML Frontmatter markdown body
    const yamlFrontmatter = 
      `---\n` +
      `title: "${title.replace(/"/g, '\\"')}"\n` +
      `date: "${date}"\n` +
      `connections:\n` +
      connections.map(id => `  - "${id}"`).join("\n") + (connections.length > 0 ? "\n" : "") +
      `---\n\n` +
      `${content}\n`;

    const cleanTitle = title.replace(/[/\\?%*:|"<>\s]/g, "_").substring(0, 50);
    const fileName = `${cleanTitle}.md`;

    if (fileId) {
      // Update content of existing note
      // First update name metadata to match any new title
      await this.driveFetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name: fileName }),
        }
      );

      // Now update the body media
      await this.driveFetch(
        `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "text/markdown; charset=UTF-8",
          },
          body: yamlFrontmatter,
        }
      );
      this.contentCache.set(fileId, { title, date, content });
      return fileId;
    } else {
      // Create new multipart file
      const boundary = "nexo_multipart_boundary";
      const metadata = {
        name: fileName,
        mimeType: "text/markdown",
        parents: [parentId],
      };

      const requestBody = 
        `\r\n--${boundary}\r\n` +
        `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
        `${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\n` +
        `Content-Type: text/markdown; charset=UTF-8\r\n\r\n` +
        `${yamlFrontmatter}\r\n` +
        `--${boundary}--`;

      const response = await this.driveFetch(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
        {
          method: "POST",
          headers: {
            "Content-Type": `multipart/related; boundary=${boundary}`,
          },
          body: requestBody,
        }
      );
      this.contentCache.set(response.id, { title, date, content });
      return response.id;
    }
  }

  // Delete a note Markdown file from Google Drive
  public async deleteNoteFile(fileId: string): Promise<void> {
    await this.driveFetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}`,
      {
        method: "DELETE",
      }
    );
  }

  // Load note content (extract markdown body from YAML frontmatter)
  public async readNoteFile(fileId: string): Promise<{ title: string; date: string; content: string }> {
    if (this.contentCache.has(fileId)) {
      return this.contentCache.get(fileId)!;
    }

    const rawContent: string = await this.driveFetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`
    );

    // Extract frontmatter
    const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
    const match = rawContent.match(frontmatterRegex);

    if (match) {
      const frontmatter = match[1];
      const content = match[2].trim();
      
      // Basic parse of title/date
      let title = "";
      let date = "";
      
      const titleMatch = frontmatter.match(/title:\s*"(.*?)"/);
      if (titleMatch) title = titleMatch[1];
      
      const dateMatch = frontmatter.match(/date:\s*"(.*?)"/);
      if (dateMatch) date = dateMatch[1];

      const result = { title, date, content };
      this.contentCache.set(fileId, result);
      return result;
    }

    const result = { title: "", date: "", content: rawContent.trim() };
    this.contentCache.set(fileId, result);
    return result;
  }
}
