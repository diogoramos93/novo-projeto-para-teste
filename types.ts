
export interface EventData {
  id: string;
  name: string;
  date: string;
  coverImage: string; // URL do Supabase ou Base64
  password?: string;
  createdAt: number;
  createdBy?: string; // ID do usuário que criou o evento ('master' ou uuid do cliente)
}

export interface PhotoData {
  id: string;
  eventId: string;
  src: string; // URL da imagem otimizada (thumbnail)
  original?: Blob | string; // Blob (upload) ou URL (download)
  createdAt: number;
}

export interface UserData {
  id: string;
  username: string;
  password?: string; // Opcional ao listar para segurança
  name: string;
  createdAt: number;
}

export interface FaceMatchResult {
  photoId: string;
  distance: number;
}

export type ViewMode = 'browse' | 'search';

export type AIProvider = 'browser' | 'api';

export interface AIConfig {
  provider: AIProvider;
  apiUrl?: string;
  apiKey?: string;
}
