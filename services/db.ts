import { supabase } from './supabase';
import { EventData, PhotoData, UserData } from '../types';

// Helper para converter Base64 dataURL para Blob
const base64ToBlob = async (base64: string): Promise<Blob> => {
  const res = await fetch(base64);
  return res.blob();
};

// --- Settings Operations (Global Config) ---

export const getGlobalSetting = async (key: string): Promise<any> => {
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', key)
    .single();

  if (error || !data) return null;
  try {
    return JSON.parse(data.value);
  } catch {
    return data.value;
  }
};

export const saveGlobalSetting = async (key: string, value: any) => {
  const { error } = await supabase
    .from('settings')
    .upsert({ 
      key, 
      value: JSON.stringify(value) 
    });

  if (error) throw error;
};

// --- User Operations (Multi-tenancy) ---

export const createUser = async (user: Omit<UserData, 'createdAt'>) => {
  const { error } = await supabase
    .from('users')
    .insert({
      id: user.id,
      username: user.username,
      password: user.password, // Nota: Em produção real, use hash/bcrypt. Aqui estamos simplificando.
      name: user.name,
      "createdAt": Date.now()
    });

  if (error) throw error;
  return true;
};

export const getUsers = async (): Promise<UserData[]> => {
  const { data, error } = await supabase
    .from('users')
    .select('id, username, name, createdAt') // Não retornar senha
    .order('createdAt', { ascending: false });

  if (error) throw error;
  return data as UserData[];
};

export const loginUser = async (username: string, password: string): Promise<UserData | null> => {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('username', username)
    .eq('password', password) // Comparação direta (simple auth)
    .single();

  if (error || !data) return null;
  
  return {
    id: data.id,
    username: data.username,
    name: data.name,
    createdAt: data.createdAt
  };
};

export const deleteUser = async (id: string) => {
  const { error } = await supabase.from('users').delete().eq('id', id);
  if (error) throw error;
};

// --- Event Operations ---

export const createEvent = async (event: EventData) => {
  // 1. Upload da Capa para o Storage
  let coverUrl = event.coverImage;
  
  if (event.coverImage.startsWith('data:')) {
    const blob = await base64ToBlob(event.coverImage);
    const fileName = `covers/${event.id}_${Date.now()}.jpg`;
    
    const { error: uploadError } = await supabase.storage
      .from('images')
      .upload(fileName, blob);

    if (uploadError) throw uploadError;
    
    // Obter URL pública
    const { data } = supabase.storage.from('images').getPublicUrl(fileName);
    coverUrl = data.publicUrl;
  }

  // 2. Salvar dados no Banco SQL
  const { error } = await supabase
    .from('events')
    .insert({
      id: event.id,
      name: event.name,
      date: event.date,
      password: event.password || null,
      "coverImage": coverUrl,
      "createdAt": event.createdAt,
      "createdBy": event.createdBy // Novo campo: Dono do evento
    });

  if (error) throw error;
  return true;
};

export const getEvents = async (): Promise<EventData[]> => {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .order('createdAt', { ascending: false });

  if (error) throw error;
  
  return data.map(e => ({
    id: e.id,
    name: e.name,
    date: e.date,
    coverImage: e.coverImage,
    password: e.password || undefined,
    createdAt: e.createdAt,
    createdBy: e.createdBy
  }));
};

export const getEventById = async (id: string): Promise<EventData | undefined> => {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) return undefined;

  return {
    id: data.id,
    name: data.name,
    date: data.date,
    coverImage: data.coverImage,
    password: data.password || undefined,
    createdAt: data.createdAt,
    createdBy: data.createdBy
  };
};

export const deleteEvent = async (id: string) => {
  // Cascata no banco deve deletar fotos, mas Storage precisa de trigger ou limpeza manual (não implementado aqui)
  const { error } = await supabase
    .from('events')
    .delete()
    .eq('id', id);

  if (error) throw error;
};

// --- Photo Operations ---

export const addPhotos = async (photos: PhotoData[]) => {
  const uploadPromises = photos.map(async (photo) => {
    let srcUrl = photo.src;
    let originalUrl = '';

    // 1. Upload da Thumbnail (src)
    if (photo.src.startsWith('data:')) {
      const blob = await base64ToBlob(photo.src);
      const fileName = `photos/${photo.eventId}/thumb_${photo.id}.jpg`;
      
      const { error } = await supabase.storage.from('images').upload(fileName, blob);
      if (!error) {
        const { data } = supabase.storage.from('images').getPublicUrl(fileName);
        srcUrl = data.publicUrl;
      }
    }

    // 2. Upload da Original (se for Blob/File)
    if (photo.original && photo.original instanceof Blob) {
      const fileName = `photos/${photo.eventId}/orig_${photo.id}.jpg`;
      const { error } = await supabase.storage.from('images').upload(fileName, photo.original);
      if (!error) {
         const { data } = supabase.storage.from('images').getPublicUrl(fileName);
         originalUrl = data.publicUrl;
      }
    } else if (typeof photo.original === 'string') {
        originalUrl = photo.original;
    } else {
        originalUrl = srcUrl;
    }

    // 3. Salvar no Banco
    return supabase.from('photos').insert({
      id: photo.id,
      "eventId": photo.eventId,
      src: srcUrl,
      original: originalUrl,
      "createdAt": photo.createdAt
    });
  });

  await Promise.all(uploadPromises);
};

export const getEventPhotos = async (eventId: string): Promise<PhotoData[]> => {
  const { data, error } = await supabase
    .from('photos')
    .select('*')
    .eq('eventId', eventId);

  if (error) throw error;

  return data.map(p => ({
    id: p.id,
    eventId: p.eventId,
    src: p.src,
    original: p.original,
    createdAt: p.createdAt
  }));
};