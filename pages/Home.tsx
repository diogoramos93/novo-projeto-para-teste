import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Lock, Unlock, Image as ImageIcon } from 'lucide-react';
import { getEvents } from '../services/db';
import { EventData } from '../types';
import Layout from '../components/Layout';

const Home: React.FC = () => {
  const [events, setEvents] = useState<EventData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadEvents();
  }, []);

  const loadEvents = async () => {
    try {
      const data = await getEvents();
      // Sort by newest first
      setEvents(data.sort((a, b) => b.createdAt - a.createdAt));
    } catch (error) {
      console.error("Error loading events:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Eventos Públicos</h1>
        <p className="text-slate-500">Veja fotos ou encontre-se usando Inteligência Artificial.</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
          {[1, 2, 3].map((n) => (
            <div key={n} className="bg-slate-200 h-64 rounded-xl"></div>
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl border border-dashed border-slate-300">
          <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <ImageIcon className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-medium text-slate-900">Nenhum evento encontrado</h3>
          <p className="text-slate-500 mt-1">Volte mais tarde ou peça a um admin para criar um evento.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {events.map((event) => (
            <Link 
              key={event.id} 
              to={`/event/${event.id}`}
              className="group bg-white rounded-xl overflow-hidden border border-slate-200 hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1"
            >
              <div className="aspect-[3/2] overflow-hidden relative bg-slate-100">
                <img 
                  src={event.coverImage} 
                  alt={event.name}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  loading="lazy"
                />
                <div className="absolute top-3 right-3">
                  {event.password ? (
                    <span className="bg-black/50 backdrop-blur-md text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
                      <Lock className="w-3 h-3" /> Privado
                    </span>
                  ) : (
                    <span className="bg-green-500/80 backdrop-blur-md text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
                      <Unlock className="w-3 h-3" /> Público
                    </span>
                  )}
                </div>
              </div>
              <div className="p-5">
                <h3 className="font-bold text-lg text-slate-900 mb-2 line-clamp-1">{event.name}</h3>
                <div className="flex items-center text-slate-500 text-sm">
                  <Calendar className="w-4 h-4 mr-2" />
                  {new Date(event.date).toLocaleDateString('pt-BR', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </Layout>
  );
};

export default Home;