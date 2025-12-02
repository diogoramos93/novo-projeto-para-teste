import * as faceapi from 'face-api.js';
import { PhotoData, AIConfig, FaceMatchResult } from '../types';
import { getGlobalSetting } from './db';

// Configuration Defaults
const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';
const MATCH_THRESHOLD = 0.45;

// --- Config Management (Cached from DB) ---

let currentAIConfig: AIConfig = { provider: 'browser' };
let isConfigLoaded = false;

export const ensureConfigLoaded = async () => {
  try {
    const config = await getGlobalSetting('facefind_ai_config');
    if (config) {
      currentAIConfig = config;
    }
    isConfigLoaded = true;
  } catch (e) {
    console.error("Failed to load AI config from DB, using default", e);
  }
};

export const getAIConfig = (): AIConfig => {
  return currentAIConfig;
};

// --- Browser-based Logic (Face-API.js) ---

let modelsLoaded = false;

export const initAI = async () => {
  await ensureConfigLoaded();
  const config = getAIConfig();
  
  if (config.provider === 'browser') {
    await loadFaceModels();
  }
};

const loadFaceModels = async () => {
  if (modelsLoaded) return;

  try {
    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);
    modelsLoaded = true;
    console.log("Face API models loaded successfully");
  } catch (error) {
    console.error("Failed to load Face API models:", error);
    throw new Error("Failed to load facial recognition models.");
  }
};

const getFaceDescriptor = async (imageElement: HTMLImageElement): Promise<Float32Array | undefined> => {
  if (!modelsLoaded) await loadFaceModels();
  const detection = await faceapi.detectSingleFace(imageElement).withFaceLandmarks().withFaceDescriptor();
  return detection?.descriptor;
};

const getAllFacesDescriptors = async (imageElement: HTMLImageElement): Promise<Float32Array[]> => {
    if (!modelsLoaded) await loadFaceModels();
    const detections = await faceapi.detectAllFaces(imageElement).withFaceLandmarks().withFaceDescriptors();
    return detections.map(d => d.descriptor);
}

// Helper to convert Blob/File/URL to HTMLImageElement
export const blobToImage = async (blob: Blob | string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = typeof blob === 'string' ? blob : URL.createObjectURL(blob);
  });
};

// Helper: Convert Blob/URL to Base64 (for API usage)
const toBase64 = (urlOrBlob: string | Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (typeof urlOrBlob === 'string') {
        // Optimization: If it's already a data URL, return it immediately
        if (urlOrBlob.startsWith('data:')) {
            resolve(urlOrBlob);
            return;
        }
        
        fetch(urlOrBlob)
            .then(res => res.blob())
            .then(blob => {
                const reader = new FileReader();
                reader.readAsDataURL(blob);
                reader.onloadend = () => resolve(reader.result as string);
                reader.onerror = reject;
            })
            .catch(reject);
    } else {
        const reader = new FileReader();
        reader.readAsDataURL(urlOrBlob);
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
    }
  });
};

// --- Hybrid Search Logic ---

export const processSearch = async (
  selfieBlob: string, // Base64 or Blob URL of selfie
  photos: PhotoData[],
  onProgress: (current: number, total: number, status: string) => void
): Promise<PhotoData[]> => {
  
  // GARANTIR QUE A CONFIGURAÇÃO FOI BAIXADA DO BANCO
  if (!isConfigLoaded) {
    await ensureConfigLoaded();
  }
  const config = getAIConfig();

  console.log("Using AI Provider:", config.provider);

  // STRATEGY A: External API (ArcFace)
  if (config.provider === 'api' && config.apiUrl) {
    
    // Security Check: Mixed Content
    if (window.location.protocol === 'https:' && config.apiUrl.startsWith('http:')) {
       throw new Error(`BLOQUEIO DE SEGURANÇA: O site está em HTTPS (Seguro) mas sua API está em HTTP (${config.apiUrl}). O navegador bloqueou a conexão. Solução: Instale SSL na sua API (Use https://) ou use Ngrok.`);
    }

    onProgress(0, photos.length, 'Preparando envio para API...');
    
    try {
        const selfieBase64 = await toBase64(selfieBlob);
        
        // Batch processing (send 50 photos at a time to API)
        const BATCH_SIZE = 50;
        const matchedPhotoIds: string[] = [];

        // Filtra fotos inválidas antes de enviar
        const validPhotos = photos.filter(p => p.id && p.src);

        // Timeout controller para detectar API desligada
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

        for (let i = 0; i < validPhotos.length; i += BATCH_SIZE) {
            const batch = validPhotos.slice(i, i + BATCH_SIZE);
            onProgress(i, validPhotos.length, `Analisando lote ${Math.ceil(i/BATCH_SIZE) + 1}...`);
            
            // Prepare payload
            const payload = {
                selfie: selfieBase64,
                gallery: batch.map(p => ({ id: p.id, url: p.src }))
            };

            const response = await fetch(config.apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${config.apiKey || ''}`
                },
                body: JSON.stringify(payload),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorText = await response.text();
                if (response.status === 422) {
                     console.error("API Validation Error:", errorText);
                     throw new Error("Erro de Validação (422): A API rejeitou os dados. Verifique o console.");
                }
                throw new Error(`Erro na API (${response.status}): ${response.statusText}`);
            }
            
            const result = await response.json(); 
            // Expected result format: { matches: [{ id: "photo_id", score: 0.8 }] }
            if (result.matches && Array.isArray(result.matches)) {
                result.matches.forEach((m: any) => matchedPhotoIds.push(m.id));
            }
        }

        onProgress(validPhotos.length, validPhotos.length, 'Finalizando...');
        return validPhotos.filter(p => matchedPhotoIds.includes(p.id));

    } catch (error: any) {
        console.error("API Search failed", error);
        
        if (error.name === 'AbortError') {
             throw new Error("Tempo Esgotado: A API demorou muito para responder. Verifique se o servidor está ligado.");
        }

        if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
            throw new Error("Falha na Conexão: O site não conseguiu falar com a API. Verifique se a API está ligada e se permite CORS (Cross-Origin).");
        }
        
        throw error;
    }
  }

  // STRATEGY B: Browser (Default)
  else {
    onProgress(0, photos.length, 'Carregando modelos...');
    await loadFaceModels();
    
    // 1. Detect Selfie Face
    onProgress(0, photos.length, 'Analisando sua selfie...');
    const selfieImgEl = await blobToImage(selfieBlob);
    const selfieDescriptor = await getFaceDescriptor(selfieImgEl);

    if (!selfieDescriptor) {
      throw new Error("NO_FACE_IN_SELFIE");
    }

    // 2. Compare with Gallery
    onProgress(0, photos.length, 'Comparando fotos...');
    const matches: PhotoData[] = [];
    const batchSize = 5; // Process locally in chunks to not freeze UI

    for (let i = 0; i < photos.length; i += batchSize) {
      const batch = photos.slice(i, i + batchSize);
      
      const batchResults = await Promise.all(batch.map(async (photo) => {
        try {
          const imgEl = await blobToImage(photo.src);
          const descriptors = await getAllFacesDescriptors(imgEl);
          // Euclidean distance: Lower is better
          const isMatchFound = descriptors.some(desc => faceapi.euclideanDistance(selfieDescriptor, desc) < MATCH_THRESHOLD);
          return isMatchFound ? photo : null;
        } catch (err) {
          return null;
        }
      }));

      matches.push(...batchResults.filter((p): p is PhotoData => p !== null));
      onProgress(Math.min(i + batchSize, photos.length), photos.length, 'Comparando fotos...');
      
      // Yield to main thread
      await new Promise(r => setTimeout(r, 10));
    }

    return matches;
  }
};