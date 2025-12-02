import React, { useEffect, useState, useRef } from 'react';
import { Trash2, Upload, Plus, X, Calendar, Lock, Image as ImageIcon, CheckCircle, User, Key, LogIn, Users, Settings, Database, Download, LogOut, Save, BrainCircuit } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { createEvent, deleteEvent, getEvents, addPhotos, loginUser, getUsers, createUser, deleteUser, saveGlobalSetting, getGlobalSetting } from '../services/db';
import { getCurrentConfig, isUsingCustomConfig } from '../services/supabase';
import { EventData, PhotoData, UserData, AIProvider } from '../types';
import Layout from '../components/Layout';
import Button from '../components/Button';

// Utility: SQL Generation for Export
const generateSQL = () => {
  return `
-- FaceFind Database Schema

-- 1. Tabela de Usuários
create table users (
  id text primary key,
  username text unique not null,
  password text not null,
  name text,
  "createdAt" bigint
);

-- 2. Tabela de Eventos
create table events (
  id text primary key,
  name text not null,
  date text not null,
  "coverImage" text,
  password text,
  "createdAt" bigint,
  "createdBy" text
);

-- 3. Tabela de Fotos
create table photos (
  id text primary key,
  "eventId" text references events(id) on delete cascade,
  src text,
  original text,
  "createdAt" bigint
);

-- 4. Tabela de Configurações
create table settings (
  key text primary key,
  value text
);

-- 5. Bucket de Armazenamento
insert into storage.buckets (id, name, public) values ('images', 'images', true);

-- 6. Políticas de Segurança (Simplificadas para SaaS)
alter table events enable row level security;
create policy "Public Select Events" on events for select using (true);
create policy "Public Insert Events" on events for insert with check (true);
create policy "Public Delete Events" on events for delete using (true);

alter table photos enable row level security;
create policy "Public Select Photos" on photos for select using (true);
create policy "Public Insert Photos" on photos for insert with check (true);
create policy "Public Delete Photos" on photos for delete using (true);

alter table users enable row level security;
create policy "Public Select Users" on users for select using (true);
create policy "Public Insert Users" on users for insert with check (true);
create policy "Public Delete Users" on users for delete using (true);

alter table settings enable row level security;
create policy "Public Access Settings" on settings for all using (true);
create policy "Public Insert Settings" on settings for insert with check (true);
create policy "Public Update Settings" on settings for update using (true);
`;
};

// Utility to compress/resize image
const processImage = (file: File, maxWidth = 800): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const scaleSize = maxWidth / img.width;
        const finalWidth = img.width > maxWidth ? maxWidth : img.width;
        const finalHeight = img.width > maxWidth ? img.height * scaleSize : img.height;
        
        canvas.width = finalWidth;
        canvas.height = finalHeight;
        
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};

const Admin: React.FC = () => {
  // --- Auth State ---
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ id: string, name: string, role: 'master' | 'user' } | null>(null);
  
  const [loginUserField, setLoginUserField] = useState('');
  const [loginPassField, setLoginPassField] = useState('');
  const [loginError, setLoginError] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);

  // --- Dashboard State ---
  const [activeTab, setActiveTab] = useState<'events' | 'users' | 'settings'>('events');
  
  // Events
  const [events, setEvents] = useState<EventData[]>([]);
  const [isCreatingEvent, setIsCreatingEvent] = useState(false);
  
  // Users (for Master)
  const [usersList, setUsersList] = useState<UserData[]>([]);
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  
  // Loading
  const [loading, setLoading] = useState(false);

  // --- Form States ---
  
  // Event Form
  const [eventName, setEventName] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventPassword, setEventPassword] = useState('');
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [eventPhotos, setEventPhotos] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<string>('');
  
  // User Form
  const [newUserName, setNewUserName] = useState('');
  const [newUserLogin, setNewUserLogin] = useState('');
  const [newUserPass, setNewUserPass] = useState('');

  // Settings Form (DB)
  const [dbUrl, setDbUrl] = useState('');
  const [dbKey, setDbKey] = useState('');

  // Settings Form (AI)
  const [aiProvider, setAiProvider] = useState<AIProvider>('browser');
  const [aiApiUrl, setAiApiUrl] = useState('');
  const [aiApiKey, setAiApiKey] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Check Session
    const sessionAuth = sessionStorage.getItem('facefind_auth');
    if (sessionAuth) {
      const user = JSON.parse(sessionAuth);
      setIsAuthenticated(true);
      setCurrentUser(user);
    }
    
    // Load Settings (DB)
    const config = getCurrentConfig();
    setDbUrl(config.url);
    setDbKey(config.key);

    // Load Settings (AI) - Now from Supabase DB
    const loadSettings = async () => {
      try {
        const aiConfig = await getGlobalSetting('facefind_ai_config');
        if (aiConfig) {
          setAiProvider(aiConfig.provider);
          setAiApiUrl(aiConfig.apiUrl || '');
          setAiApiKey(aiConfig.apiKey || '');
        }
      } catch (e) {
        console.error("Erro ao carregar configurações", e);
      }
    };
    loadSettings();

  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      refreshData();
    }
  }, [isAuthenticated, activeTab]);

  const refreshData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'events') {
        const data = await getEvents();
        // Filter: Master sees all, User sees only createdBy them
        if (currentUser?.role === 'master') {
          setEvents(data.sort((a, b) => b.createdAt - a.createdAt));
        } else {
          setEvents(data
            .filter(e => e.createdBy === currentUser?.id)
            .sort((a, b) => b.createdAt - a.createdAt)
          );
        }
      } else if (activeTab === 'users' && currentUser?.role === 'master') {
        const users = await getUsers();
        setUsersList(users);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError(false);

    try {
      // 1. Check Master (Hardcoded)
      if (loginUserField === 'admin' && loginPassField === '123') {
        const user = { id: 'master', name: 'Admin Master', role: 'master' as const };
        finishLogin(user);
        return;
      }

      // 2. Check Database Users
      const dbUser = await loginUser(loginUserField, loginPassField);
      if (dbUser) {
        const user = { id: dbUser.id, name: dbUser.name, role: 'user' as const };
        finishLogin(user);
        return;
      }

      setLoginError(true);
    } catch (err) {
      setLoginError(true);
    } finally {
      setLoginLoading(false);
    }
  };

  const finishLogin = (user: { id: string, name: string, role: 'master' | 'user' }) => {
    setIsAuthenticated(true);
    setCurrentUser(user);
    sessionStorage.setItem('facefind_auth', JSON.stringify(user));
    setActiveTab('events');
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setCurrentUser(null);
    sessionStorage.removeItem('facefind_auth');
    setLoginUserField('');
    setLoginPassField('');
  };

  // --- Settings Actions ---

  const saveSettings = async () => {
    setLoading(true);
    try {
      // Save DB Config (LocalStorage - this one is client specific as it connects TO the DB)
      if (dbUrl && dbKey) {
        const config = { url: dbUrl, key: dbKey };
        localStorage.setItem('facefind_db_config', JSON.stringify(config));
      }
      
      // Save AI Config (Supabase DB - this one is global for all users)
      await saveGlobalSetting('facefind_ai_config', {
        provider: aiProvider,
        apiUrl: aiApiUrl,
        apiKey: aiApiKey
      });

      alert("Todas as configurações foram salvas no Banco de Dados! Todos os usuários agora usarão essas configurações.");
      window.location.reload();
    } catch (error) {
      alert("Erro ao salvar configurações. Verifique se você criou a tabela 'settings' no Supabase.");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const resetSettings = () => {
    if (confirm("Isso irá restaurar as conexões originais. Confirmar?")) {
      localStorage.removeItem('facefind_db_config');
      // Note: We don't delete from DB, just localStorage configs
      window.location.reload();
    }
  };

  const downloadSQL = () => {
    const element = document.createElement("a");
    const file = new Blob([generateSQL()], {type: 'text/plain'});
    element.href = URL.createObjectURL(file);
    element.download = "facefind_database.sql";
    document.body.appendChild(element);
    element.click();
  };

  // --- Event Actions ---

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventName || !eventDate || !coverImage) return;

    setLoading(true);
    setUploadProgress('Criando evento...');

    try {
      const newEvent: EventData = {
        id: uuidv4(),
        name: eventName,
        date: eventDate,
        coverImage,
        password: eventPassword || undefined,
        createdAt: Date.now(),
        createdBy: currentUser?.id
      };

      await createEvent(newEvent);

      if (eventPhotos.length > 0) {
        const photosToSave: PhotoData[] = [];
        const batchSize = 5;
        
        for (let i = 0; i < eventPhotos.length; i += batchSize) {
            const batch = eventPhotos.slice(i, i + batchSize);
            setUploadProgress(`Processando fotos ${i + 1} de ${eventPhotos.length}...`);
            
            const processedBatch = await Promise.all(batch.map(async (file) => {
                const thumbnail = await processImage(file, 800); 
                return {
                    id: uuidv4(),
                    eventId: newEvent.id,
                    src: thumbnail,
                    original: file,
                    createdAt: Date.now()
                } as PhotoData;
            }));
            photosToSave.push(...processedBatch);
        }

        setUploadProgress('Salvando no banco...');
        await addPhotos(photosToSave);
      }

      setLoading(false);
      setIsCreatingEvent(false);
      resetEventForm();
      refreshData();
      alert('Evento criado!');
    } catch (error) {
      console.error(error);
      alert('Erro ao criar evento.');
      setLoading(false);
    }
  };

  const resetEventForm = () => {
    setEventName(''); setEventDate(''); setEventPassword(''); setCoverImage(null); setEventPhotos([]); setUploadProgress('');
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setEventPhotos(prev => [...prev, ...Array.from(e.target.files!)]);
  };

  // --- User Actions ---

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserLogin || !newUserPass || !newUserName) return;

    try {
      setLoading(true);
      await createUser({
        id: uuidv4(),
        username: newUserLogin,
        password: newUserPass,
        name: newUserName
      });
      setIsCreatingUser(false);
      setNewUserLogin(''); setNewUserPass(''); setNewUserName('');
      refreshData();
      alert("Usuário criado com sucesso!");
    } catch (err) {
      alert("Erro ao criar usuário. Talvez o login já exista.");
    } finally {
      setLoading(false);
    }
  };

  // --- Render ---

  if (!isAuthenticated) {
    return (
      <Layout>
        <div className="max-w-md mx-auto mt-16 bg-white p-8 rounded-xl shadow-lg border border-slate-200">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Lock className="w-8 h-8 text-indigo-600" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900">Acesso Restrito</h2>
            <p className="text-slate-500 mt-2">Entre para gerenciar seus eventos.</p>
          </div>
          
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Usuário</label>
              <div className="relative">
                <User className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                <input type="text" value={loginUserField} onChange={e => setLoginUserField(e.target.value)}
                  className="w-full pl-10 px-3 py-2 border border-slate-300 rounded-lg outline-none focus:border-indigo-500" placeholder="Seu usuário" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Senha</label>
              <div className="relative">
                <Key className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                <input type="password" value={loginPassField} onChange={e => setLoginPassField(e.target.value)}
                  className="w-full pl-10 px-3 py-2 border border-slate-300 rounded-lg outline-none focus:border-indigo-500" placeholder="Sua senha" />
              </div>
            </div>
            {loginError && <div className="text-red-600 text-sm text-center">Credenciais inválidas.</div>}
            <Button type="submit" className="w-full" isLoading={loginLoading}><LogIn className="w-4 h-4" /> Entrar</Button>
          </form>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Olá, {currentUser?.name}</h1>
          <p className="text-slate-500 text-sm">{currentUser?.role === 'master' ? 'Painel Master (Acesso Total)' : 'Painel do Cliente'}</p>
        </div>
        <div className="flex gap-2">
           <Button variant="secondary" onClick={handleLogout} className="text-sm"><LogOut className="w-4 h-4" /> Sair</Button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 mb-6 overflow-x-auto">
        <button onClick={() => setActiveTab('events')}
          className={`px-6 py-3 font-medium text-sm border-b-2 flex items-center gap-2 transition-colors ${activeTab === 'events' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
          <Calendar className="w-4 h-4" /> Meus Eventos
        </button>
        {currentUser?.role === 'master' && (
          <button onClick={() => setActiveTab('users')}
            className={`px-6 py-3 font-medium text-sm border-b-2 flex items-center gap-2 transition-colors ${activeTab === 'users' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            <Users className="w-4 h-4" /> Usuários (Clientes)
          </button>
        )}
        {currentUser?.role === 'master' && (
          <button onClick={() => setActiveTab('settings')}
            className={`px-6 py-3 font-medium text-sm border-b-2 flex items-center gap-2 transition-colors ${activeTab === 'settings' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            <Settings className="w-4 h-4" /> Configurações
          </button>
        )}
      </div>

      {/* --- EVENTS TAB --- */}
      {activeTab === 'events' && (
        <div className="animate-in fade-in">
          <div className="flex justify-end mb-4">
            {!isCreatingEvent && <Button onClick={() => setIsCreatingEvent(true)}><Plus className="w-4 h-4" /> Novo Evento</Button>}
          </div>

          {isCreatingEvent ? (
             <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-8">
               <div className="flex justify-between mb-4">
                 <h2 className="font-bold text-lg">Criar Novo Evento</h2>
                 <button onClick={() => setIsCreatingEvent(false)}><X className="w-5 h-5 text-slate-400" /></button>
               </div>
               <form onSubmit={handleCreateEvent} className="space-y-6">
                 {/* ... Simplified Event Form Inputs ... */}
                 <div className="grid md:grid-cols-2 gap-4">
                    <input type="text" placeholder="Nome do Evento" required className="border p-2 rounded" value={eventName} onChange={e => setEventName(e.target.value)} />
                    <input type="date" required className="border p-2 rounded" value={eventDate} onChange={e => setEventDate(e.target.value)} />
                    <input type="text" placeholder="Senha (Opcional)" className="border p-2 rounded" value={eventPassword} onChange={e => setEventPassword(e.target.value)} />
                 </div>
                 
                 <div className="border-2 border-dashed p-4 rounded text-center cursor-pointer hover:bg-slate-50" onClick={() => fileInputRef.current?.click()}>
                    {coverImage ? <img src={coverImage} className="h-32 mx-auto object-cover rounded"/> : <p className="text-slate-500">Clique para capa</p>}
                    <input ref={fileInputRef} type="file" className="hidden" accept="image/*" onChange={async (e) => {
                       if (e.target.files?.[0]) setCoverImage(await processImage(e.target.files[0]));
                    }} />
                 </div>

                 <div className="border-2 border-dashed p-4 rounded text-center cursor-pointer hover:bg-slate-50" onClick={() => photoInputRef.current?.click()}>
                    <p className="text-slate-500 flex items-center justify-center gap-2"><Upload className="w-4 h-4"/> Selecionar Fotos (Lote)</p>
                    <p className="text-xs text-slate-400 mt-1">{eventPhotos.length} fotos selecionadas</p>
                    <input ref={photoInputRef} type="file" multiple className="hidden" accept="image/*" onChange={handlePhotoSelect} />
                 </div>

                 <div className="flex justify-between items-center">
                    <span className="text-sm text-indigo-600">{uploadProgress}</span>
                    <Button type="submit" isLoading={loading}>Salvar Evento</Button>
                 </div>
               </form>
             </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
               <table className="w-full text-left text-sm">
                 <thead className="bg-slate-50 border-b">
                   <tr>
                     <th className="px-6 py-4">Evento</th>
                     <th className="px-6 py-4">Data</th>
                     <th className="px-6 py-4">Criado Por</th>
                     <th className="px-6 py-4 text-right">Ações</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y">
                   {events.map(ev => (
                     <tr key={ev.id}>
                       <td className="px-6 py-4 font-medium">{ev.name}</td>
                       <td className="px-6 py-4">{new Date(ev.date).toLocaleDateString()}</td>
                       <td className="px-6 py-4 text-xs text-slate-500">
                         {ev.createdBy === 'master' ? 'Master' : (ev.createdBy === currentUser?.id ? 'Você' : 'Outro')}
                       </td>
                       <td className="px-6 py-4 text-right">
                         <button onClick={async () => {
                           if(confirm('Excluir evento?')) { await deleteEvent(ev.id); refreshData(); }
                         }} className="text-red-500 hover:text-red-700"><Trash2 className="w-4 h-4" /></button>
                       </td>
                     </tr>
                   ))}
                   {events.length === 0 && <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-500">Nenhum evento.</td></tr>}
                 </tbody>
               </table>
            </div>
          )}
        </div>
      )}

      {/* --- USERS TAB --- */}
      {activeTab === 'users' && currentUser?.role === 'master' && (
        <div className="animate-in fade-in">
           <div className="flex justify-end mb-4">
             {!isCreatingUser && <Button onClick={() => setIsCreatingUser(true)}><Plus className="w-4 h-4" /> Novo Cliente</Button>}
           </div>

           {isCreatingUser ? (
             <div className="bg-white p-6 rounded-xl border mb-6 max-w-lg mx-auto">
               <h3 className="font-bold mb-4">Novo Cliente</h3>
               <form onSubmit={handleCreateUser} className="space-y-4">
                 <input className="w-full border p-2 rounded" placeholder="Nome Completo (Ex: João Silva)" value={newUserName} onChange={e => setNewUserName(e.target.value)} required />
                 <input className="w-full border p-2 rounded" placeholder="Login de Acesso" value={newUserLogin} onChange={e => setNewUserLogin(e.target.value)} required />
                 <input className="w-full border p-2 rounded" type="password" placeholder="Senha" value={newUserPass} onChange={e => setNewUserPass(e.target.value)} required />
                 <div className="flex gap-2 justify-end">
                   <Button variant="secondary" onClick={() => setIsCreatingUser(false)}>Cancelar</Button>
                   <Button type="submit" isLoading={loading}>Criar Usuário</Button>
                 </div>
               </form>
             </div>
           ) : (
             <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
               <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-xl">
                 <div className="flex items-center gap-2 mb-2">
                   <div className="w-8 h-8 bg-indigo-600 text-white rounded-full flex items-center justify-center font-bold">A</div>
                   <div>
                     <p className="font-bold text-indigo-900">Admin Master</p>
                     <p className="text-xs text-indigo-600">Acesso Total</p>
                   </div>
                 </div>
               </div>
               {usersList.map(u => (
                 <div key={u.id} className="bg-white border border-slate-200 p-4 rounded-xl flex justify-between items-center shadow-sm">
                   <div>
                     <p className="font-bold text-slate-800">{u.name}</p>
                     <p className="text-xs text-slate-500">@{u.username}</p>
                   </div>
                   <button onClick={async () => {
                     if(confirm('Excluir este usuário?')) { await deleteUser(u.id); refreshData(); }
                   }} className="text-slate-400 hover:text-red-600"><Trash2 className="w-4 h-4"/></button>
                 </div>
               ))}
             </div>
           )}
        </div>
      )}

      {/* --- SETTINGS TAB (RESTRICTED TO MASTER) --- */}
      {activeTab === 'settings' && currentUser?.role === 'master' && (
        <div className="animate-in fade-in max-w-2xl mx-auto space-y-6">
          
          {/* DB Settings */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><Database className="w-5 h-5 text-indigo-600"/> Conexão com Banco de Dados</h3>
            <p className="text-sm text-slate-500 mb-6">Configure aqui sua conexão com o Supabase. Isso permite trocar de banco sem precisar alterar o código do site.</p>
            
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium mb-1">Project URL</label>
                <input type="text" className="w-full border p-2 rounded text-slate-600" value={dbUrl} onChange={e => setDbUrl(e.target.value)} placeholder="https://xxx.supabase.co" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">API Key (Anon/Public)</label>
                <input type="password" className="w-full border p-2 rounded text-slate-600" value={dbKey} onChange={e => setDbKey(e.target.value)} placeholder="ey..." />
              </div>
            </div>
          </div>

          {/* AI Settings */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><BrainCircuit className="w-5 h-5 text-purple-600"/> Inteligência Artificial</h3>
            <p className="text-sm text-slate-500 mb-6">Escolha qual mecanismo de reconhecimento facial será utilizado.</p>
            
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium mb-1">Provedor de Reconhecimento</label>
                <select 
                  className="w-full border p-2 rounded text-slate-600" 
                  value={aiProvider} 
                  onChange={e => setAiProvider(e.target.value as AIProvider)}
                >
                  <option value="browser">Navegador (Grátis - Face-API.js)</option>
                  <option value="api">API Externa (ArcFace / Server-side)</option>
                </select>
                <p className="text-xs text-slate-400 mt-1">
                  {aiProvider === 'browser' ? 'Roda no dispositivo do usuário. Gratuito, mas depende da potência do celular.' : 'Envia fotos para um servidor externo. Mais rápido e preciso, mas requer backend.'}
                </p>
              </div>

              {aiProvider === 'api' && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-1">API Endpoint URL</label>
                    <input type="text" className="w-full border p-2 rounded text-slate-600" value={aiApiUrl} onChange={e => setAiApiUrl(e.target.value)} placeholder="https://api.meuservidor.com/search-face" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">API Key (Opcional)</label>
                    <input type="password" className="w-full border p-2 rounded text-slate-600" value={aiApiKey} onChange={e => setAiApiKey(e.target.value)} />
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="flex gap-3 justify-end">
            {isUsingCustomConfig && <Button variant="ghost" onClick={resetSettings}>Restaurar Padrão</Button>}
            <Button onClick={saveSettings}><Save className="w-4 h-4"/> Salvar Todas Configurações</Button>
          </div>

          <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 mt-8">
             <h3 className="font-bold text-lg mb-2 flex items-center gap-2"><Download className="w-5 h-5 text-slate-600"/> Exportar Estrutura SQL</h3>
             <p className="text-sm text-slate-500 mb-4">Vai criar um novo banco? Baixe o script SQL pronto para criar todas as tabelas necessárias.</p>
             <Button variant="secondary" onClick={downloadSQL}>Baixar Arquivo .sql</Button>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default Admin;