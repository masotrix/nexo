// Service to handle vector embeddings locally in the browser
import { pipeline } from "@huggingface/transformers";

// Keep a singleton of the feature extraction pipeline
let extractorPromise: any = null;

async function getExtractor(onProgress?: (progress: number) => void) {
  if (!extractorPromise) {
    extractorPromise = pipeline("feature-extraction", "Xenova/multilingual-e5-small", {
      progress_callback: (data: any) => {
        if (data.status === "progress" && onProgress) {
          onProgress(data.progress);
        }
      }
    });
  }
  return extractorPromise;
}

export class EmbeddingsService {
  // Get 384-dimension embedding vector for a note locally
  public async getEmbedding(
    title: string, 
    content: string, 
    onProgress?: (progress: number) => void
  ): Promise<number[]> {
    const extractor = await getExtractor(onProgress);
    
    // E5 models are trained to expect a prefix: "passage: " for indexing documents
    const textToEmbed = `passage: Título: ${title}\nContenido: ${content}`;
    
    const output = await extractor(textToEmbed, { pooling: "mean", normalize: true });
    
    // Convert Float32Array to standard number array
    return Array.from(output.data);
  }

  // Cosine Similarity between two normalized vectors is just their dot product
  public static cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  // K-Means clustering in TypeScript
  public static runKMeans(
    notes: { id: string; embedding?: number[] }[],
    k: number,
    maxIterations = 50
  ): { assignments: { [fileId: string]: string }; centroids: { [clusterId: string]: number[] }; WCSS: number } {
    const notesWithEmbeds = notes.filter(n => n.embedding && n.embedding.length > 0);
    
    if (notesWithEmbeds.length === 0) {
      return { assignments: {}, centroids: {}, WCSS: 0 };
    }

    const actualK = Math.max(1, Math.min(k, notesWithEmbeds.length));
    const dim = notesWithEmbeds[0].embedding!.length;

    const centroids: { [clusterId: string]: number[] } = {};
    const shuffledNotes = [...notesWithEmbeds].sort(() => 0.5 - Math.random());
    for (let i = 0; i < actualK; i++) {
      centroids[`cluster_${i}`] = [...shuffledNotes[i].embedding!];
    }

    let assignments: { [fileId: string]: string } = {};
    let iteration = 0;
    let changed = true;
    let WCSS = 0;

    while (changed && iteration < maxIterations) {
      changed = false;
      iteration++;
      const nextAssignments: { [fileId: string]: string } = {};
      
      for (const note of notesWithEmbeds) {
        let minDistance = Infinity;
        let bestCluster = `cluster_0`;
        const embed = note.embedding!;

        for (const clusterId in centroids) {
          const sim = this.cosineSimilarity(embed, centroids[clusterId]);
          const dist = 1 - sim;

          if (dist < minDistance) {
            minDistance = dist;
            bestCluster = clusterId;
          }
        }

        nextAssignments[note.id] = bestCluster;
        if (nextAssignments[note.id] !== assignments[note.id]) {
          changed = true;
        }
      }

      assignments = nextAssignments;

      if (changed) {
        const clusterSums: { [clusterId: string]: number[] } = {};
        const clusterCounts: { [clusterId: string]: number } = {};

        for (const clusterId in centroids) {
          clusterSums[clusterId] = new Array(dim).fill(0);
          clusterCounts[clusterId] = 0;
        }

        for (const note of notesWithEmbeds) {
          const clusterId = assignments[note.id];
          const embed = note.embedding!;
          clusterCounts[clusterId]++;
          for (let d = 0; d < dim; d++) {
            clusterSums[clusterId][d] += embed[d];
          }
        }

        for (const clusterId in centroids) {
          if (clusterCounts[clusterId] > 0) {
            for (let d = 0; d < dim; d++) {
              centroids[clusterId][d] = clusterSums[clusterId][d] / clusterCounts[clusterId];
            }
            let norm = 0;
            for (let d = 0; d < dim; d++) {
              norm += centroids[clusterId][d] * centroids[clusterId][d];
            }
            norm = Math.sqrt(norm);
            if (norm > 0) {
              for (let d = 0; d < dim; d++) {
                centroids[clusterId][d] /= norm;
              }
            }
          }
        }
      }
    }

    WCSS = 0;
    for (const note of notesWithEmbeds) {
      const clusterId = assignments[note.id];
      const centroid = centroids[clusterId];
      if (centroid) {
        const sim = this.cosineSimilarity(note.embedding!, centroid);
        WCSS += (1 - sim) * (1 - sim);
      }
    }

    return { assignments, centroids, WCSS };
  }
}
