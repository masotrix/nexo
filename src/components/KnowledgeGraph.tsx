import React, { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import type { NoteMetadata } from "../services/googleDrive";
import { EmbeddingsService } from "../services/embeddings";
import { Maximize2, ZoomIn, ZoomOut, Compass, RefreshCw } from "lucide-react";

// D3 internal node and link types
interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  title: string;
  clusterId?: string;
  color: string;
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  source: string | GraphNode;
  target: string | GraphNode;
}

interface KnowledgeGraphProps {
  notes: { [fileId: string]: NoteMetadata };
  selectedNoteId: string | null;
  onSelectNote: (noteId: string | null) => void;
  clusters?: { [clusterId: string]: string };
  onRebuildGraph?: () => Promise<void>;
  isRebuilding?: boolean;
}

// A beautiful palette of 10 bright neon colors suitable for dark mode
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

export const KnowledgeGraph: React.FC<KnowledgeGraphProps> = ({
  notes,
  selectedNoteId,
  onSelectNote,
  clusters = {},
  onRebuildGraph,
  isRebuilding = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 500 });
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  // Resize listener
  useEffect(() => {
    if (!containerRef.current) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setDimensions({ 
          width: Math.max(width, 200), 
          height: Math.max(height, 200) 
        });
      }
    });
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Main graph render and simulation logic
  useEffect(() => {
    if (!svgRef.current || Object.keys(notes).length === 0) return;

    const { width, height } = dimensions;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove(); // Clear previous render

    // 1. Process data for nodes and links
    // Map cluster IDs to color indexes
    const uniqueClusters = Array.from(
      new Set(Object.values(notes).map((n) => n.clusterId).filter(Boolean))
    );
    const getClusterColor = (clusterId?: string) => {
      if (!clusterId) return "#64748b"; // default slate gray for unclustered
      const idx = uniqueClusters.indexOf(clusterId);
      return CLUSTER_COLORS[idx % CLUSTER_COLORS.length];
    };

    const d3Nodes: GraphNode[] = Object.values(notes).map((note) => ({
      id: note.id,
      title: note.title,
      clusterId: note.clusterId,
      color: getClusterColor(note.clusterId),
    }));

    const d3Links: GraphLink[] = [];
    const seenLinks = new Set<string>();

    Object.values(notes).forEach((note) => {
      note.connections.forEach((targetId) => {
        // Ensure bidirectional link is added only once
        const linkKey = [note.id, targetId].sort().join("-");
        if (!seenLinks.has(linkKey) && notes[targetId]) {
          seenLinks.add(linkKey);
          d3Links.push({
            source: note.id,
            target: targetId,
          });
        }
      });
    });

    // 2. Define Glow Filter in SVG
    const defs = svg.append("defs");
    const filter = defs.append("filter")
      .attr("id", "glow")
      .attr("x", "-50%")
      .attr("y", "-50%")
      .attr("width", "200%")
      .attr("height", "200%");
    
    filter.append("feGaussianBlur")
      .attr("stdDeviation", "4")
      .attr("result", "blur");
    
    const feMerge = filter.append("feMerge");
    feMerge.append("feMergeNode").attr("in", "blur");
    feMerge.append("feMergeNode").attr("in", "SourceGraphic");

    // 3. Create top-level container for zoom/pan
    const mainGroup = svg.append("g").attr("class", "graph-content");

    // Initialize zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => {
        mainGroup.attr("transform", event.transform);
      });
    
    svg.call(zoom);
    zoomBehaviorRef.current = zoom;

    // 4. Create visual elements (links first, then nodes on top)
    const linkGroup = mainGroup.append("g").attr("class", "links");
    const nodeGroup = mainGroup.append("g").attr("class", "nodes");

    const links = linkGroup.selectAll("line")
      .data(d3Links)
      .enter()
      .append("line")
      .attr("class", "link")
      .attr("stroke", "#ffffff")
      .attr("stroke-opacity", 0.15)
      .attr("stroke-width", 1.5);

    const nodes = nodeGroup.selectAll("g")
      .data(d3Nodes)
      .enter()
      .append("g")
      .attr("class", "node-group")
      .call(
        d3.drag<SVGGElement, GraphNode>()
          .on("start", dragstarted)
          .on("drag", dragged)
          .on("end", dragended)
      );

    // Render node circles
    nodes.append("circle")
      .attr("class", "node")
      .attr("r", 8)
      .attr("fill", d => d.color);

    // Render text labels
    nodes.append("text")
      .text(d => d.title)
      .attr("x", 12)
      .attr("y", 4)
      .attr("font-size", "10px")
      .attr("fill", "var(--text-secondary)")
      .attr("pointer-events", "none")
      .style("opacity", 0) // Hide labels by default, show on zoom or hover
      .style("font-family", "Inter, sans-serif")
      .style("transition", "opacity 0.2s ease");

     // 5. Force Simulation Setup
    const simulation = d3.forceSimulation<GraphNode>(d3Nodes)
      .velocityDecay(0.6) // High physical friction to absorb kinetic energy and stop oscillation chaos
      .alphaDecay(0.035)  // Cool down simulation smoothly and rapidly
      .alphaMin(0.005)    // Freeze physics once converged
      .force("link", d3.forceLink<GraphNode, GraphLink>(d3Links)
        .id(d => d.id)
        .distance((link) => {
          const sourceId = typeof link.source === "object" ? link.source.id : link.source;
          const targetId = typeof link.target === "object" ? link.target.id : link.target;
          
          const noteA = notes[sourceId];
          const noteB = notes[targetId];
          
          if (noteA && noteB) {
            const embedA = noteA.embedding;
            const embedB = noteB.embedding;

            // 1. Non-linear Vector Cosine Similarity
            if (embedA && embedA.length > 0 && embedB && embedB.length > 0) {
              const sim = EmbeddingsService.cosineSimilarity(embedA, embedB);
              const s = Math.max(0, Math.min(1, (sim - 0.60) / 0.30));
              // Min link distance 38px (strictly > 28px collision diameter), max distance 210px
              return 38 + Math.pow(1 - s, 2) * 172;
            }

            // 2. Fallback to topic cluster matching
            if (noteA.clusterId && noteB.clusterId) {
              return noteA.clusterId === noteB.clusterId ? 45 : 180;
            }
          }
          return 90;
        })
        .strength((link) => {
          const sourceId = typeof link.source === "object" ? link.source.id : link.source;
          const targetId = typeof link.target === "object" ? link.target.id : link.target;
          const noteA = notes[sourceId];
          const noteB = notes[targetId];

          if (noteA && noteB) {
            if (noteA.embedding && noteB.embedding) {
              const sim = EmbeddingsService.cosineSimilarity(noteA.embedding, noteB.embedding);
              return Math.max(0.1, Math.min(0.6, sim)); // Moderate link tension
            }
            if (noteA.clusterId && noteB.clusterId && noteA.clusterId === noteB.clusterId) {
              return 0.5;
            }
          }
          return 0.15;
        })
      )
      .force("charge", d3.forceManyBody().strength(-50).distanceMax(250)) // Distance-capped local repulsion
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide().radius(14).iterations(2)) // Harmonized with 38px min link distance to avoid force fighting
      .force("x", d3.forceX<GraphNode>()
        .x((d) => {
          if (!d.clusterId) return width / 2;
          const idx = uniqueClusters.indexOf(d.clusterId);
          if (idx === -1) return width / 2;
          const angle = (2 * Math.PI * idx) / uniqueClusters.length;
          const radius = Math.min(width, height) * 0.32;
          return width / 2 + radius * Math.cos(angle);
        })
        .strength(0.18)
      )
      .force("y", d3.forceY<GraphNode>()
        .y((d) => {
          if (!d.clusterId) return height / 2;
          const idx = uniqueClusters.indexOf(d.clusterId);
          if (idx === -1) return height / 2;
          const angle = (2 * Math.PI * idx) / uniqueClusters.length;
          const radius = Math.min(width, height) * 0.32;
          return height / 2 + radius * Math.sin(angle);
        })
        .strength(0.18)
      );

    // Freeze physics after simulation converges (performance optimization)
    simulation.alphaMin(0.02); // converge faster
    simulation.on("tick", () => {
      links
        .attr("x1", d => (d.source as GraphNode).x!)
        .attr("y1", d => (d.source as GraphNode).y!)
        .attr("x2", d => (d.target as GraphNode).x!)
        .attr("y2", d => (d.target as GraphNode).y!);

      nodes
        .attr("transform", d => `translate(${d.x}, ${d.y})`);
    });

    simulation.on("end", () => {
      // Simulation finished, nodes settled.
    });

    // Node click and hover interactions
    nodes.on("click", (event, d) => {
      event.stopPropagation();
      onSelectNote(d.id);
    });

    nodes.on("mouseenter", (_, d) => {
      setHoveredNodeId(d.id);
    });

    nodes.on("mouseleave", () => {
      setHoveredNodeId(null);
    });

    // SVG Background click resets selection
    svg.on("click", () => {
      onSelectNote(null);
    });

    // Drag handlers
    function dragstarted(event: d3.D3DragEvent<SVGGElement, GraphNode, GraphNode>, d: GraphNode) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event: d3.D3DragEvent<SVGGElement, GraphNode, GraphNode>, d: GraphNode) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event: d3.D3DragEvent<SVGGElement, GraphNode, GraphNode>, d: GraphNode) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    // Cleanup simulation
    return () => {
      simulation.stop();
    };
  }, [notes, dimensions]);

  // Highlight and styling updates on select/hover
  useEffect(() => {
    if (!svgRef.current || Object.keys(notes).length === 0) return;

    const svg = d3.select(svgRef.current);
    const activeId = selectedNoteId || hoveredNodeId;

    const nodes = svg.selectAll<SVGGElement, GraphNode>(".node-group");
    const links = svg.selectAll<SVGLineElement, GraphLink>(".link");

    // Map cluster IDs to color indexes
    const uniqueClusters = Array.from(
      new Set(Object.values(notes).map((n) => n.clusterId).filter(Boolean))
    );
    const getClusterColor = (clusterId?: string) => {
      if (!clusterId) return "#64748b"; // default slate gray for unclustered
      const idx = uniqueClusters.indexOf(clusterId);
      return CLUSTER_COLORS[idx % CLUSTER_COLORS.length];
    };

    if (!activeId) {
      // Reset all
      nodes.selectAll("circle")
        .attr("r", 8)
        .style("filter", "none")
        .style("opacity", 1);
      nodes.selectAll("text")
        .style("opacity", 0);
      links
        .attr("stroke", "#ffffff")
        .attr("stroke-opacity", 0.15)
        .attr("stroke-width", 1.5);
      return;
    }

    // Find connected nodes
    const connectedNodeIds = new Set<string>();
    connectedNodeIds.add(activeId);
    
    // Find links connected to activeId
    links.each((d) => {
      const sourceId = typeof d.source === "object" ? (d.source as GraphNode).id : (d.source as string);
      const targetId = typeof d.target === "object" ? (d.target as GraphNode).id : (d.target as string);
      
      if (sourceId === activeId) connectedNodeIds.add(targetId);
      if (targetId === activeId) connectedNodeIds.add(sourceId);
    });

    // Update Node highlights
    nodes.selectAll("circle")
      .attr("r", (d: any) => d.id === activeId ? 11 : connectedNodeIds.has(d.id) ? 9 : 6)
      .style("opacity", (d: any) => connectedNodeIds.has(d.id) ? 1 : 0.2)
      .style("filter", (d: any) => d.id === activeId ? "url(#glow)" : "none");

    // Show labels for connected nodes
    nodes.selectAll("text")
      .style("opacity", (d: any) => connectedNodeIds.has(d.id) ? 1 : 0)
      .attr("fill", (d: any) => d.id === activeId ? "var(--text-primary)" : "var(--text-secondary)");

    // Update Link highlights
    links
      .attr("stroke", (d: any) => {
        const sId = typeof d.source === "object" ? (d.source as GraphNode).id : (d.source as string);
        const tId = typeof d.target === "object" ? (d.target as GraphNode).id : (d.target as string);
        if (sId === activeId || tId === activeId) {
          // Color edge by active node cluster color
          return notes[activeId]?.clusterId ? getClusterColor(notes[activeId].clusterId) : "var(--primary)";
        }
        return "#ffffff";
      })
      .attr("stroke-opacity", (d: any) => {
        const sId = typeof d.source === "object" ? (d.source as GraphNode).id : (d.source as string);
        const tId = typeof d.target === "object" ? (d.target as GraphNode).id : (d.target as string);
        return (sId === activeId || tId === activeId) ? 0.8 : 0.03;
      })
      .attr("stroke-width", (d: any) => {
        const sId = typeof d.source === "object" ? (d.source as GraphNode).id : (d.source as string);
        const tId = typeof d.target === "object" ? (d.target as GraphNode).id : (d.target as string);
        return (sId === activeId || tId === activeId) ? 2.5 : 1.2;
      });
  }, [notes, selectedNoteId, hoveredNodeId]);

  // Center Graph view so all nodes are visible
  const handleCenter = () => {
    if (!svgRef.current || !zoomBehaviorRef.current || Object.keys(notes).length === 0) return;
    
    const svg = d3.select(svgRef.current);
    const mainGroup = svg.select(".graph-content");
    if (mainGroup.empty()) return;

    const nodesData = mainGroup.selectAll<SVGGElement, GraphNode>(".node-group").data();
    if (nodesData.length === 0) return;

    // Calculate bounding box of coordinates
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    nodesData.forEach(d => {
      if (d.x !== undefined && d.y !== undefined) {
        if (d.x < minX) minX = d.x;
        if (d.x > maxX) maxX = d.x;
        if (d.y < minY) minY = d.y;
        if (d.y > maxY) maxY = d.y;
      }
    });

    // Bounding box padding
    const dx = maxX - minX || 10;
    const dy = maxY - minY || 10;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    const { width, height } = dimensions;
    const scale = Math.max(0.2, Math.min(1.5, 0.8 / Math.max(dx / width, dy / height)));
    const translate = [width / 2 - scale * cx, height / 2 - scale * cy];

    svg.transition()
      .duration(750)
      .call(
        zoomBehaviorRef.current.transform, 
        d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale)
      );
  };

  const handleZoom = (factor: number) => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.transition().duration(250).call(zoomBehaviorRef.current.scaleBy, factor);
  };

  return (
    <div 
      ref={containerRef} 
      style={{ 
        position: "relative", 
        width: "100%", 
        height: "100%", 
        background: "rgba(3, 5, 12, 0.4)", 
        borderRadius: "16px",
        border: "1px solid var(--border-color)",
        overflow: "hidden"
      }}
    >
      {Object.keys(notes).length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", height: "100%", gap: "1rem", color: "var(--text-secondary)" }}>
          <Compass size={48} style={{ color: "var(--text-muted)", strokeWidth: 1.5 }} />
          <p style={{ fontSize: "0.95rem" }}>Cargando o no hay notas en tu biblioteca.</p>
          <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Agrega tu primera nota para inicializar el grafo.</span>
        </div>
      ) : (
        <>
          <svg 
            ref={svgRef} 
            width={dimensions.width} 
            height={dimensions.height}
            style={{ display: "block", cursor: "grab" }}
          />

          {/* Graph visual controls floating in bottom right */}
          <div style={{ position: "absolute", bottom: "1rem", right: "1rem", display: "flex", gap: "0.5rem" }}>
            {onRebuildGraph && (
              <button 
                onClick={onRebuildGraph} 
                disabled={isRebuilding}
                title="Reconstruir grafo completo"
                style={{ padding: "0.5rem", borderRadius: "8px", background: "rgba(13, 20, 38, 0.8)", display: "flex", alignItems: "center", gap: "0.3rem" }}
              >
                <RefreshCw size={16} className={isRebuilding ? "animate-spin" : ""} />
                <span style={{ fontSize: "0.75rem", fontWeight: "bold" }}>
                  {isRebuilding ? "Reconstruyendo..." : "Reconstruir"}
                </span>
              </button>
            )}
            <button 
              onClick={() => handleZoom(1.3)} 
              title="Acercar"
              style={{ padding: "0.5rem", borderRadius: "8px", background: "rgba(13, 20, 38, 0.8)" }}
            >
              <ZoomIn size={16} />
            </button>
            <button 
              onClick={() => handleZoom(0.7)} 
              title="Alejar"
              style={{ padding: "0.5rem", borderRadius: "8px", background: "rgba(13, 20, 38, 0.8)" }}
            >
              <ZoomOut size={16} />
            </button>
            <button 
              onClick={handleCenter} 
              title="Ajustar pantalla"
              style={{ padding: "0.5rem", borderRadius: "8px", background: "rgba(13, 20, 38, 0.8)", display: "flex", alignItems: "center", gap: "0.3rem" }}
            >
              <Maximize2 size={16} />
              <span style={{ fontSize: "0.75rem", fontWeight: "bold" }}>Centrar</span>
            </button>
          </div>

          {/* Top floating panel showing cluster legends if active */}
          {Object.keys(clusters).length > 0 && (
            <div style={{ 
              position: "absolute", 
              top: "1rem", 
              left: "1rem", 
              maxHeight: "35%", 
              overflowY: "auto", 
              background: "rgba(13, 20, 38, 0.8)", 
              padding: "0.6rem 0.8rem", 
              borderRadius: "10px",
              border: "1px solid var(--border-color)",
              display: "flex", 
              flexDirection: "column", 
              gap: "0.4rem",
              maxWidth: "280px"
            }}>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.05em" }}>Temas Emergentes</span>
              {Object.entries(clusters).map(([clusterId, clusterName]) => {
                const uniqueClustIds = Array.from(new Set(Object.values(notes).map((n) => n.clusterId).filter(Boolean)));
                const colorIdx = uniqueClustIds.indexOf(clusterId);
                const color = colorIdx >= 0 ? CLUSTER_COLORS[colorIdx % CLUSTER_COLORS.length] : "#64748b";
                return (
                  <div key={clusterId} style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.75rem" }}>
                    <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: color, flexShrink: 0 }} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-secondary)" }} title={clusterName}>
                      {clusterName}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
};
