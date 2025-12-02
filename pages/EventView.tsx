
import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { getEventById, getEventPhotos } from '../services/db';
import { processSearch, initAI } from '../services/faceService'; // New imports
import { EventData, PhotoData } from '../types';
import Layout from '../components/Layout';
import Button from '../components/Button';
import { Lock, Search, Grid, Camera, Image as ImageIcon, X, AlertTriangle, Download } from 'lucide-react';

const EventView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [event, setEvent] = useState<EventData | null>(null);
  const [photos, setPhotos] = useState<PhotoData[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Access Control
  const [isLocked, setIsLocked] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState(false);

  // View Mode
  const [activeTab, setActiveTab] = useState<'browse' | 'search'>('browse');

  // Search State
  const [selfieImage, setSelfieImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [searchResults, setSearchResults] = useState<PhotoData[]>([]);
  
  // Progress and Status
  const [progressMsg, setProgressMsg] = useState('Aguardando...');
  const [searchStatus, setSearchStatus] = useState<'idle' | 'processing' | 'complete' | 'error' | 'no_face'>('idle');

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (id) {
      loadEventData(id);
    }
  }, [id]);

  const loadEventData = async (eventId: string) => {
    try {
      const eventData = await getEventById(eventId);
      if (!eventData) {
        setLoading(false);
        return; 
      }

      setEvent(eventData);
      
      if (eventData.password) {
        setIsLocked(true);
      } else {
        await loadPhotos(eventId);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const loadPhotos = async (eventId: string) => {
    const photosData = await getEventPhotos(eventId);
    setPhotos(photosData.sort((a, b) => b.createdAt - a.createdAt));
    
    // Initialize AI (Preload models if browser, do nothing if API)
    initAI().catch(console.error);
  };

  const handleUnlock = () => {
    if (event?.password === passwordInput) {
      setIsLocked(false);
      loadPhotos(event.id);
    } else {
      setPasswordError(true);
    }
  };

  const handleDownload = (photo: PhotoData) => {
    const link = document.createElement('a');
    let url = photo.src;
    let isBlob = false;

    if (photo.original) {
      if (typeof photo.original === 'string') {
        url = photo.original;
        link.download = `foto-${photo.id}.jpg`;
      } else {
        url = URL.createObjectURL(photo.original);
        isBlob = true;
        const file = photo.original as File;
        link.download = file.name || `foto-${photo.id}.jpg`;
      }
    } else {
      link.download = `foto-${photo.id}.jpg`;
    }
    
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    if (isBlob) {
      setTimeout(() => URL.revokeObjectURL(url), 100);
    }
  };

  const handleSelfieUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      
      reader.onload = async (event) => {
        const base64 = event.target?.result as string;
        setSelfieImage(base64);
        setSearchStatus('idle');
        setSearchResults([]);
      };
      
      reader.readAsDataURL(file);
    }
  };

  const startSearch = async () => {
    if (!selfieImage) return;

    setIsProcessing(true);
    setSearchStatus('processing');
    setSearchResults([]);

    try {
      const results = await processSearch(
        selfieImage, 
        photos, 
        (current, total, status) => {
           // Update Progress
           setProgressMsg(status || `Processando ${Math.round((current/total)*100)}%`);
        }
      );

      setSearchResults(results);
      setSearchStatus('complete');

    } catch (error: any) {
      console.error("Search failed:", error);
      if (error.message === "NO_FACE_IN_SELFIE") {
         setSearchStatus('no_face');
      } else {
         setSearchStatus('error');
         setProgressMsg(error.message);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // --------------------------------------------------------------------------
  // UI Helpers
  // --------------------------------------------------------------------------

  const renderPhotoGrid = (items: PhotoData[], emptyMessage: string) => (
    <>
      {items.length === 0 ? (
        <div className="col-span-full text-center py-10 text-slate-500">
          {emptyMessage}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {items.map((photo) => (
            <div key={photo.id} className="group relative aspect-square rounded-lg overflow-hidden bg-slate-100 hover:shadow-lg transition-all transform hover:scale-[1.02]">
              <img src={photo.src} alt="Event" className="w-full h-full object-cover" loading="lazy" />
              
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                <button
                  onClick={(e) => { e.stopPropagation(); handleDownload(photo); }}
                  className="bg-white text-slate-900 rounded-full p-3 hover:bg-slate-100 hover:scale-110 transition-all shadow-lg"
                  title="Baixar Foto"
                >
                  <Download className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );

  if (loading) return (
    <Layout>
      <div className="flex flex-col items-center justify-center h-64 text-slate-400">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
        Carregando Evento...
      </div>
    </Layout>
  );

  if (!event) return (
    <Layout>
      <div className="text-center py-20">Evento não encontrado</div>
    </Layout>
  );

  if (isLocked) {
    return (
      <Layout>
        <div className="max-w-md mx-auto mt-10">
          <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-slate-200">
            <div className="h-48 bg-slate-200 relative">
               <img src={event.coverImage} className="w-full h-full object-cover blur-sm" alt="locked" />
               <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                 <Lock className="w-16 h-16 text-white/80" />
               </div>
            </div>
            <div className="p-8">
              <h2 className="text-2xl font-bold text-center text-slate-900 mb-2">{event.name}</h2>
              <p className="text-center text-slate-500 mb-6">Este evento é protegido por senha.</p>
              
              <div className="space-y-4">
                <input
                  type="password"
                  value={passwordInput}
                  onChange={(e) => { setPasswordInput(e.target.value); setPasswordError(false); }}
                  placeholder="Digite a Senha"
                  className={`w-full px-4 py-3 rounded-lg border ${passwordError ? 'border-red-500 ring-1 ring-red-500' : 'border-slate-300 focus:ring-2 focus:ring-indigo-500'} outline-none transition-all`}
                  onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                />
                {passwordError && <p className="text-red-500 text-sm text-center">Senha incorreta</p>}
                <Button onClick={handleUnlock} className="w-full h-12">Entrar na Galeria</Button>
              </div>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      {/* Event Header */}
      <div className="relative rounded-2xl overflow-hidden mb-8 shadow-sm group">
        <div className="aspect-[21/9] md:aspect-[3/1] bg-slate-900">
          <img src={event.coverImage} alt={event.name} className="w-full h-full object-cover opacity-80" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
          <div className="absolute bottom-0 left-0 p-6 md:p-8 text-white">
            <h1 className="text-3xl md:text-4xl font-bold mb-2">{event.name}</h1>
            <p className="opacity-90">{new Date(event.date + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} • {photos.length} Fotos</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 mb-6">
        <button
          onClick={() => setActiveTab('browse')}
          className={`flex items-center gap-2 px-6 py-3 font-medium text-sm transition-all border-b-2 ${activeTab === 'browse' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
        >
          <Grid className="w-4 h-4" /> Galeria
        </button>
        <button
          onClick={() => setActiveTab('search')}
          className={`flex items-center gap-2 px-6 py-3 font-medium text-sm transition-all border-b-2 ${activeTab === 'search' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
        >
          <Search className="w-4 h-4" /> Encontrar meu Rosto
        </button>
      </div>

      {/* Content */}
      <div className="min-h-[400px]">
        {activeTab === 'browse' ? (
           renderPhotoGrid(photos, "Nenhuma foto neste evento ainda.")
        ) : (
          <div className="max-w-3xl mx-auto">
            {!selfieImage ? (
              <div className="text-center py-10 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                 <div className="w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4 text-indigo-600">
                   <Camera className="w-10 h-10" />
                 </div>
                 <h3 className="text-xl font-bold text-slate-900 mb-2">Envie sua Selfie</h3>
                 <p className="text-slate-500 mb-6 max-w-md mx-auto">Usamos Inteligência Artificial para comparar seu rosto com as fotos do evento com segurança.</p>
                 <Button onClick={() => fileInputRef.current?.click()}>
                   Tirar ou Escolher Selfie
                 </Button>
                 <input 
                   ref={fileInputRef} 
                   type="file" 
                   accept="image/*" 
                   className="hidden" 
                   onChange={handleSelfieUpload}
                 />
              </div>
            ) : (
              <div className="animate-in fade-in slide-in-from-bottom-4">
                {/* Search Header */}
                <div className="flex flex-col md:flex-row gap-6 items-start mb-8 bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                  <div className="w-32 h-32 shrink-0 rounded-lg overflow-hidden relative bg-slate-100">
                    <img src={selfieImage} alt="Selfie" className="w-full h-full object-cover" />
                    <button 
                      onClick={() => { setSelfieImage(null); setSearchStatus('idle'); }} 
                      className="absolute top-1 right-1 bg-black/50 hover:bg-black/70 text-white rounded-full p-1"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  
                  <div className="flex-1 w-full">
                    <h3 className="font-bold text-lg mb-2">Pronto para buscar</h3>
                    <p className="text-slate-500 text-sm mb-4">Iremos comparar seu rosto com {photos.length} fotos.</p>
                    
                    {searchStatus === 'idle' && (
                       <Button onClick={startSearch} className="w-full md:w-auto">Iniciar Busca</Button>
                    )}

                    {/* Progress UI */}
                    {(isProcessing || searchStatus === 'complete' || searchStatus === 'no_face') && (
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
                          <span>
                            {searchStatus === 'complete' && 'Busca Completa'}
                            {searchStatus === 'processing' && progressMsg}
                            {searchStatus === 'no_face' && 'Erro'}
                            {searchStatus === 'error' && 'Erro de Conexão'}
                          </span>
                        </div>
                        
                        {searchStatus !== 'no_face' && searchStatus !== 'error' && (
                          <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                            <div 
                              className={`h-full ${searchStatus === 'complete' ? 'bg-green-500' : 'bg-indigo-600'} transition-all duration-300`}
                              style={{ width: isProcessing ? '50%' : searchStatus === 'complete' ? '100%' : '0%' }}
                            ></div>
                          </div>
                        )}

                        {searchStatus === 'no_face' && (
                          <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4" />
                            Nenhum rosto detectado na sua selfie. Tente uma foto mais clara e de frente.
                          </div>
                        )}
                         {searchStatus === 'error' && (
                          <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4" />
                            {progressMsg || 'Erro ao conectar com a API.'}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Results */}
                {searchStatus === 'complete' && (
                  <div>
                    <h3 className="font-bold text-xl mb-4 flex items-center gap-2">
                      <Search className="w-5 h-5 text-indigo-600" />
                      Encontramos {searchResults.length} resultados
                    </h3>
                    
                    {renderPhotoGrid(searchResults, "Nenhuma foto correspondente encontrada neste evento.")}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default EventView;
