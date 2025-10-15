import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  UploadIcon, CameraIcon, CheckCircleIcon, ExclamationCircleIcon, PhotoIcon, HistoryIcon, SparklesIcon,
  RefreshIcon, TrashIcon, GridIcon, XIcon, DownloadIcon, ExpandIcon, PlusIcon, CheckIcon,
  SyringeIcon, CubeIcon, PencilIcon, LipstickIcon, SettingsIcon, InfoIcon
} from './components/icons';
import { Photo, OperationHistory, AestheticPlan } from './types';
import * as geminiService from './services/geminiService';

type ActiveTab = 'photo' | 'design' | 'history';
type Theme = 'dark' | 'light' | 'theme-pro-blue dark' | 'theme-pink-touch dark';
type FontSize = 'font-sm' | 'font-md' | 'font-lg';


const App: React.FC = () => {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [activeResultUrl, setActiveResultUrl] = useState<string | null>(null);
  const [operationHistory, setOperationHistory] = useState<OperationHistory[]>([]);
  const [isLoading, setIsLoading] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  
  const [styleSuggestions, setStyleSuggestions] = useState<string[]>([]);
  const [quickStyles, setQuickStyles] = useState<string[]>([]);

  // UI State
  const [activeTab, setActiveTab] = useState<ActiveTab>('photo');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [isWorkspaceOpen, setIsWorkspaceOpen] = useState(false);
  const [cameraModalOpen, setCameraModalOpen] = useState(false);
  const [nineGridModalState, setNineGridModalState] = useState<{
    isOpen: boolean,
    isLoading: boolean,
    results: (string | null)[],
    prompts: (string | null)[],
    error: string | null
  }>({ isOpen: false, isLoading: false, results: [], prompts: [], error: null });
  const [zoomModalProps, setZoomModalProps] = useState<{ isOpen: boolean, imageUrl: string | null, prompt?: string, onSelect?: () => void }>({ isOpen: false, imageUrl: null });
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [aboutModalOpen, setAboutModalOpen] = useState(false);
  const [aestheticPlan, setAestheticPlan] = useState<AestheticPlan | null>(null);


  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const compareSliderRef = useRef<HTMLDivElement>(null);

  const selectedPhoto = useMemo(() => photos.find(p => p.id === selectedPhotoId), [photos, selectedPhotoId]);
  const displayUrl = useMemo(() => activeResultUrl || selectedPhoto?.lipCloseup || selectedPhoto?.url, [activeResultUrl, selectedPhoto]);

  // Effects
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (selectedPhotoId) {
      handleNewDesign();
      if (isMobile) setIsWorkspaceOpen(true);
    } else {
      if (isMobile) setIsWorkspaceOpen(false);
    }
  }, [selectedPhotoId, isMobile]);

  useEffect(() => {
    if (selectedPhoto?.compliance?.isCompliant && selectedPhoto.lipCloseup) {
      handleRefreshSuggestions();
    }
    if(quickStyles.length === 0) {
      handleRefreshQuickStyles();
    }
  }, [selectedPhoto]);

  useEffect(() => {
    if (activeResultUrl && selectedPhoto) {
      setAestheticPlan(null); // Clear previous plan
      setIsLoading(prev => ({ ...prev, aestheticPlan: true }));
      geminiService.getAestheticPlan(selectedPhoto.lipCloseup || selectedPhoto.url, activeResultUrl)
        .then(plan => {
          setAestheticPlan(plan);
        })
        .catch(err => console.error("Error fetching aesthetic plan:", err))
        .finally(() => setIsLoading(prev => ({ ...prev, aestheticPlan: false })));
    } else {
        setAestheticPlan(null);
    }
  }, [activeResultUrl, selectedPhoto]);
  

  const setLoading = (key: string, value: boolean) => setIsLoading(prev => ({ ...prev, [key]: value }));

  const processNewPhoto = async (url: string, name: string) => {
    const photoId = `photo_${Date.now()}`;
    const newPhoto: Photo = { id: photoId, name, url, compliance: null };
    
    setPhotos(prev => [newPhoto, ...prev.slice(0, 2)]);
    setSelectedPhotoId(photoId);
    setError(null);
    setLoading(photoId, true);

    try {
      const compliance = await geminiService.checkCompliance(url);
      let updatedPhoto: Photo = { ...newPhoto, compliance };
      setPhotos(p => p.map(ph => ph.id === photoId ? updatedPhoto : ph));

      if (compliance.isCompliant) {
        const closeup = await geminiService.extractLipCloseup(url);
        if (closeup) {
          updatedPhoto = { ...updatedPhoto, lipCloseup: closeup };
          setPhotos(p => p.map(ph => ph.id === photoId ? updatedPhoto : ph));
        } else {
           setError("无法提取唇部特写。");
        }
      }
    } catch (err) {
      console.error(err);
      setError("AI分析失败，请稍后再试。");
      const errorPhoto = { ...newPhoto, compliance: { isCompliant: false, reason: "AI分析失败" } };
      setPhotos(p => p.map(ph => ph.id === photoId ? errorPhoto : ph));
    } finally {
      setLoading(photoId, false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => processNewPhoto(event.target!.result as string, file.name);
    reader.readAsDataURL(file);
    e.target.value = '';
  };
  
  const handleHistorySelect = (historyItem: OperationHistory) => {
    setActiveResultUrl(historyItem.resultUrl);
    if(isMobile) setIsWorkspaceOpen(false);
  };
  
  const handleApplyStyle = useCallback(async (prompt: string, type: OperationHistory['type'] = 'style') => {
    if (!selectedPhoto?.lipCloseup) return;
    setLoading('applyStyle', true);
    if(isMobile) setIsWorkspaceOpen(false);
    
    try {
      const resultUrl = await geminiService.applyStyle(selectedPhoto.lipCloseup, prompt);
      if (resultUrl) {
        setActiveResultUrl(resultUrl);
        const newHistoryItem: OperationHistory = {
          id: `op_${Date.now()}`,
          timestamp: Date.now(),
          type,
          prompt,
          resultUrl,
        };
        setOperationHistory(prev => [newHistoryItem, ...prev]);
      } else {
        setError("风格应用失败。");
      }
    } catch (err) {
      console.error(err);
      setError("风格应用失败，请稍后再试。");
    } finally {
      setLoading('applyStyle', false);
    }
  }, [selectedPhoto, isMobile]);

  const handleRefreshSuggestions = useCallback(async () => {
    if (!selectedPhoto?.lipCloseup) return;
    setLoading('suggestions', true);
    setStyleSuggestions([]);
    try {
      const suggestions = await geminiService.getStyleSuggestions(selectedPhoto.lipCloseup);
      setStyleSuggestions(suggestions);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading('suggestions', false);
    }
  }, [selectedPhoto]);
  
  const handleRefreshQuickStyles = useCallback(async () => {
    setLoading('quickStyles', true);
    try {
      const styles = await geminiService.getQuickStyles();
      setQuickStyles(styles);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading('quickStyles', false);
    }
  }, []);

  const handleNewDesign = () => {
    setActiveResultUrl(null);
    setOperationHistory([]);
    setAestheticPlan(null);
  };
  
  const handleGenerateNineGrid = async () => {
    if (!selectedPhoto?.lipCloseup) return;
    setNineGridModalState({ isOpen: true, isLoading: true, results: Array(9).fill(null), prompts: [], error: null });

    try {
      const prompts = await geminiService.getNineGridSuggestions(selectedPhoto.lipCloseup);
      if (prompts && prompts.length === 9) {
        setNineGridModalState(prev => ({ ...prev, prompts }));
        const results = await Promise.all(
          prompts.map(p => geminiService.applyStyle(selectedPhoto.lipCloseup!, p))
        );
        setNineGridModalState(prev => ({ ...prev, results, isLoading: false }));
      } else {
        throw new Error("未能获取9个建议。");
      }
    } catch (error) {
      console.error("九宫格生成错误:", error);
      setNineGridModalState(prev => ({ ...prev, isLoading: false, error: '九宫格生成失败，请稍后重试。' }));
    }
  };

  const handleSaveNineGrid = async (index: number) => {
    const url = nineGridModalState.results[index];
    if(!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `design-${index + 1}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };
  
  const handleSaveAllNineGrid = async () => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
  
    const images = await Promise.all(
      nineGridModalState.results.map(url => {
        return new Promise<HTMLImageElement>((resolve, reject) => {
          if (!url) {
            resolve(new Image()); // Resolve with a blank image if URL is null
            return;
          }
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = url;
        });
      })
    );
  
    const imgSize = images[0]?.width || 300;
    const gap = 10;
    canvas.width = imgSize * 3 + gap * 2;
    canvas.height = imgSize * 3 + gap * 2;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  
    images.forEach((img, i) => {
      if (img.src) { // Only draw if the image loaded
        const row = Math.floor(i / 3);
        const col = i % 3;
        const x = col * (imgSize + gap);
        const y = row * (imgSize + gap);
        ctx.drawImage(img, x, y, imgSize, imgSize);
      }
    });
  
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = 'nine-grid-designs.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Render Components
  const Header = () => (
    <header className="absolute top-0 left-0 right-0 h-14 flex items-center justify-between px-4 z-20 bg-[var(--theme-bg-base)] bg-opacity-80 backdrop-blur-sm">
      <h1 className="text-lg font-bold flex items-center">
        <SparklesIcon className="h-6 w-6 mr-2 text-[var(--theme-indigo)]" />
        AI 唇部美学设计师
      </h1>
       <div className="flex items-center space-x-2">
        <button onClick={() => setSettingsModalOpen(true)} className="p-2 rounded-full hover:bg-[var(--theme-bg-subtle)] transition-all duration-200 active:scale-90">
          <SettingsIcon />
        </button>
        <button onClick={() => setAboutModalOpen(true)} className="p-2 rounded-full hover:bg-[var(--theme-bg-subtle)] transition-all duration-200 active:scale-90">
          <InfoIcon />
        </button>
      </div>
    </header>
  );

  const UploadPlaceholder = ({ onUploadClick, onCameraClick }: { onUploadClick: () => void, onCameraClick: () => void }) => (
    <div className="flex-1 flex flex-col items-center justify-center text-center text-[var(--theme-text-muted)] p-4">
        <div className="w-full max-w-md p-8 border-2 border-dashed border-[var(--theme-bg-subtle)] rounded-lg">
            <PhotoIcon className="w-16 h-16 mb-4 mx-auto text-[var(--theme-indigo)]" />
            <h2 className="text-2xl font-semibold text-[var(--theme-text-base)] mb-2">开始您的AI设计之旅</h2>
            <p className="mb-6">请上传或拍摄一张符合要求的正面照片。</p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
                 <button onClick={onUploadClick} className="flex items-center justify-center space-x-2 w-full sm:w-auto px-6 py-3 bg-[var(--theme-indigo)] text-white font-semibold rounded-lg hover:bg-[var(--theme-indigo-hover)] transition-all duration-200 active:scale-95">
                    <UploadIcon /><span>从文件上传</span>
                </button>
                <button onClick={onCameraClick} className="flex items-center justify-center space-x-2 w-full sm:w-auto px-6 py-3 bg-[var(--theme-bg-subtle)] text-[var(--theme-text-base)] font-semibold rounded-lg hover:bg-opacity-80 transition-all duration-200 active:scale-95">
                    <CameraIcon /><span>使用相机</span>
                </button>
            </div>
        </div>
    </div>
);

  const EditorCanvas = () => {
    const handleSliderMove = (e: React.MouseEvent | React.TouchEvent) => {
      if (!compareSliderRef.current) return;
      const rect = compareSliderRef.current.getBoundingClientRect();
      const x = ('touches' in e ? e.touches[0].clientX : e.clientX) - rect.left;
      const newPosition = Math.max(0, Math.min(100, (x / rect.width) * 100));
      compareSliderRef.current.style.setProperty('--position', `${newPosition}%`);
    };
  
    const handleMouseDown = () => {
      const onMouseMove = (e: MouseEvent) => handleSliderMove(e as any);
      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    };

    const handleTouchStart = () => {
      const onTouchMove = (e: TouchEvent) => handleSliderMove(e as any);
      const onTouchEnd = () => {
        document.removeEventListener('touchmove', onTouchMove);
        document.removeEventListener('touchend', onTouchEnd);
      };
      document.addEventListener('touchmove', onTouchMove);
      document.addEventListener('touchend', onTouchEnd);
    };
    
    if (!selectedPhoto) {
        return <UploadPlaceholder 
            onUploadClick={() => fileInputRef.current?.click()} 
            onCameraClick={() => setCameraModalOpen(true)} 
        />;
    }
    
    return (
        <div className="flex-1 flex flex-col items-center justify-center p-4 pt-16 md:p-6 relative">
            <div className="w-full h-full max-w-4xl max-h-full flex flex-col">
              <div className="flex-1 relative w-full h-full min-h-0">
                  <div ref={compareSliderRef} className="compare-slider w-full h-full">
                      <img src={displayUrl} alt="设计效果" className="w-full h-full object-contain rounded-lg" />
                      {activeResultUrl && selectedPhoto.lipCloseup && (
                          <>
                              <div className="image-container original-image">
                                  <img src={selectedPhoto.lipCloseup} alt="原始特写" className="w-full h-full object-contain rounded-lg" />
                              </div>
                              <div className="slider" onMouseDown={handleMouseDown} onTouchStart={handleTouchStart}>
                                <div className="slider-handle"></div>
                              </div>
                          </>
                      )}
                  </div>
              </div>
                <div className="flex-shrink-0 flex items-center justify-between p-2 mt-2 bg-[var(--theme-bg-subtle)] rounded-md">
                     <div className="flex items-center space-x-2">
                        {activeResultUrl && (
                            <button onClick={() => setZoomModalProps({ isOpen: true, imageUrl: activeResultUrl })} className="flex items-center space-x-1 px-3 py-1.5 text-sm bg-[var(--theme-bg-panel)] rounded-md hover:bg-opacity-80 shadow-sm transition-transform active:scale-95">
                                <ExpandIcon />
                                <span>放大查看</span>
                            </button>
                        )}
                     </div>
                     <div className="flex items-center space-x-2">
                         {operationHistory.length > 0 && <button onClick={() => setActiveResultUrl(operationHistory[0].resultUrl)} className="px-3 py-1.5 text-sm bg-[var(--theme-bg-panel)] rounded-md hover:bg-opacity-80 shadow-sm transition-transform active:scale-95">最新效果</button>}
                         {selectedPhoto.lipCloseup && <button onClick={() => setActiveResultUrl(null)} className="px-3 py-1.5 text-sm bg-[var(--theme-bg-panel)] rounded-md hover:bg-opacity-80 shadow-sm transition-transform active:scale-95">原始特写</button>}
                     </div>
                </div>
            </div>
        </div>
    );
};

  const PhotoPanel = () => (
    <div className="p-4 space-y-4">
      <div className="space-y-3">
        {photos.length === 0 ? (
          <p className="text-center text-sm text-[var(--theme-text-muted)] pt-8">您上传的照片会显示在这里。</p>
        ) : (
          photos.map(photo => (
            <div key={photo.id} onClick={() => setSelectedPhotoId(photo.id)} className={`p-2 rounded-lg flex items-center space-x-3 cursor-pointer transition-all duration-200 ${selectedPhotoId === photo.id ? 'bg-[var(--theme-indigo)] bg-opacity-20' : 'hover:bg-[var(--theme-bg-subtle)]'} active:scale-[0.98]`}>
              <img src={photo.url} alt={photo.name} className="w-16 h-16 object-cover rounded-md flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate text-sm">{photo.name}</p>
                {isLoading[photo.id] ? <p className="text-xs text-[var(--theme-text-muted)]">AI分析中...</p> : (
                  photo.compliance && (
                    <div className="flex items-center text-xs mt-1">
                      {photo.compliance.isCompliant ? <CheckCircleIcon /> : <ExclamationCircleIcon title={photo.compliance.reason || ''} />}
                      <span className={`ml-1.5 ${photo.compliance.isCompliant ? 'text-green-500' : 'text-red-500'}`}>
                        {photo.compliance.isCompliant ? '合规' : '不合规'}
                      </span>
                    </div>
                  )
                )}
              </div>
              {photo.lipCloseup && (
                <img src={photo.lipCloseup} alt="唇部特写" className="w-10 h-10 object-cover rounded-md flex-shrink-0 border-2 border-[var(--theme-bg-subtle)]" />
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
  
  const DesignPanel = () => {
      const [prompt, setPrompt] = useState('');
      
      if (!selectedPhoto?.compliance?.isCompliant) {
        return (
          <div className="p-4 text-center text-[var(--theme-text-muted)]">
            <ExclamationCircleIcon title="不合规" />
            <p className="mt-2 font-semibold text-[var(--theme-text-base)]">照片不合规</p>
            <p className="text-sm mt-1">{selectedPhoto?.compliance?.reason}</p>
            <p className="text-xs mt-4">请选择或上传一张符合要求的照片以启用设计功能。</p>
          </div>
        );
      }

      return (
        <div className="p-4 space-y-4">
            <div className="flex items-center space-x-2">
                 <button onClick={handleNewDesign} className="flex items-center justify-center space-x-1 w-full px-3 py-2 bg-[var(--theme-bg-subtle)] text-[var(--theme-text-base)] font-semibold rounded-lg hover:bg-opacity-80 transition-all duration-200 active:scale-95">
                    <PlusIcon /><span>新设计</span>
                </button>
                <button onClick={handleGenerateNineGrid} className="flex items-center justify-center space-x-1 w-full px-3 py-2 bg-[var(--theme-bg-subtle)] text-[var(--theme-text-base)] font-semibold rounded-lg hover:bg-opacity-80 transition-all duration-200 active:scale-95">
                    <GridIcon /><span>一键九宫格</span>
                </button>
            </div>

            <div>
                <div className="flex justify-between items-center mb-2">
                    <h3 className="font-semibold text-sm">AI 智能建议</h3>
                    <button onClick={handleRefreshSuggestions} disabled={isLoading['suggestions']} className="p-1 rounded-full hover:bg-[var(--theme-bg-subtle)] text-[var(--theme-text-muted)] disabled:opacity-50 transition-transform duration-200 active:scale-90 active:rotate-45">
                        <RefreshIcon />
                    </button>
                </div>
                <div className="space-y-2">
                    {styleSuggestions.map((s, i) => <button key={i} onClick={() => handleApplyStyle(s, 'suggestion')} className="w-full text-left p-3 bg-[var(--theme-bg-subtle)] rounded-lg text-sm hover:bg-opacity-80 transition-all duration-200 hover:ring-2 hover:ring-[var(--theme-ring)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-ring)] active:scale-[0.98]">{s}</button>)}
                </div>
            </div>

            <div>
                 <div className="flex justify-between items-center mb-2">
                    <h3 className="font-semibold text-sm">快捷风格</h3>
                    <button onClick={handleRefreshQuickStyles} disabled={isLoading['quickStyles']} className="p-1 rounded-full hover:bg-[var(--theme-bg-subtle)] text-[var(--theme-text-muted)] disabled:opacity-50 transition-transform duration-200 active:scale-90 active:rotate-45">
                        <RefreshIcon />
                    </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    {quickStyles.slice(0, 8).map((style, i) => (
                        <button key={i} onClick={() => handleApplyStyle(style)} className="p-3 bg-[var(--theme-bg-subtle)] rounded-lg text-sm text-center hover:bg-opacity-80 transition-all duration-200 hover:ring-2 hover:ring-[var(--theme-ring)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-ring)] active:scale-95">{style}</button>
                    ))}
                </div>
            </div>

            <div className="relative">
                <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={2} placeholder="或输入您的自然语言指令..." className="w-full p-2 pr-10 border border-[var(--theme-bg-subtle)] rounded-md text-sm bg-[var(--theme-bg-panel)] focus:ring-2 focus:ring-[var(--theme-ring)] focus:border-[var(--theme-ring)]"></textarea>
                <button onClick={() => handleApplyStyle(prompt, 'text')} disabled={!prompt || isLoading['applyStyle']} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-[var(--theme-indigo)] text-white disabled:bg-gray-400 transition-transform active:scale-90">
                    <SparklesIcon className="w-4 h-4" />
                </button>
            </div>
             {aestheticPlan && <AestheticPlanDisplay plan={aestheticPlan} isLoading={isLoading['aestheticPlan']} />}
        </div>
      )
  };

  const HistoryPanel = () => (
    <div className="p-4">
      {operationHistory.length === 0 ? (
        <p className="text-center text-[var(--theme-text-muted)] text-sm pt-8">暂无历史记录</p>
      ) : (
        <div className="space-y-2">
          {operationHistory.map(op => (
            <div key={op.id} onClick={() => handleHistorySelect(op)} className="p-2 rounded-lg flex items-center space-x-3 cursor-pointer bg-[var(--theme-bg-subtle)] hover:ring-2 hover:ring-[var(--theme-ring)] transition-transform duration-200 active:scale-[0.98]">
              <img src={op.resultUrl} alt={op.prompt} className="w-12 h-12 object-cover rounded-md flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate text-sm">{op.prompt}</p>
                <p className="text-xs text-[var(--theme-text-muted)]">{new Date(op.timestamp).toLocaleString()}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const AestheticPlanDisplay = ({ plan, isLoading }: { plan: AestheticPlan | null, isLoading: boolean }) => {
    if (isLoading) {
      return <div className="text-center p-4 text-sm text-[var(--theme-text-muted)]">AI方案生成中...</div>;
    }
    if (!plan) return null;
  
    const planItems = [
      { icon: <SyringeIcon />, title: "注射方案", content: plan.injectionPlan },
      { icon: <CubeIcon />, title: "容量与形态", content: plan.volumeAndShapePlan },
      { icon: <PencilIcon />, title: "唇线与纹色", content: plan.lipLinerPlan },
      { icon: <LipstickIcon />, title: "妆容修饰", content: plan.makeupPlan },
    ];
  
    return (
      <div className="mt-4 space-y-4">
        <h3 className="font-semibold text-sm">AI 美学方案</h3>
        {planItems.map(item => (
          <div key={item.title} className="bg-[var(--theme-bg-subtle)] p-4 rounded-lg">
            <h4 className="font-semibold flex items-center text-sm text-[var(--theme-text-base)]">
              <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-[var(--theme-indigo)]">{item.icon}</span>
              <span className="ml-2">{item.title}</span>
            </h4>
            <p className="text-[var(--theme-text-muted)] mt-2 text-sm leading-relaxed">{item.content}</p>
          </div>
        ))}
      </div>
    );
  };
  
  const CameraModal = ({ isOpen, onClose, onCapture }: { isOpen: boolean, onClose: () => void, onCapture: (url: string) => void }) => {
    useEffect(() => {
        if (isOpen) {
            navigator.mediaDevices.getUserMedia({ video: true })
                .then(stream => {
                    if (videoRef.current) videoRef.current.srcObject = stream;
                    streamRef.current = stream;
                })
                .catch(err => {
                    console.error("相机权限错误:", err);
                    alert("无法访问相机。请检查浏览器权限。");
                    onClose();
                });
        } else {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
                streamRef.current = null;
            }
        }
    }, [isOpen, onClose]);

    const handleCapture = () => {
        const video = videoRef.current;
        if (!video) return;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
        onCapture(canvas.toDataURL('image/png'));
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
            <div className="bg-[var(--theme-bg-panel)] rounded-lg p-4 max-w-lg w-full">
                <video ref={videoRef} autoPlay playsInline className="w-full rounded-md"></video>
                <div className="flex justify-center mt-4">
                    <button onClick={handleCapture} className="p-4 bg-[var(--theme-indigo)] rounded-full text-white transition-transform active:scale-95">
                        <CameraIcon />
                    </button>
                </div>
            </div>
            <button onClick={onClose} className="absolute top-4 right-4 text-white transition-transform active:scale-90"><XIcon /></button>
        </div>
    );
  };
  
  const NineGridModal = () => {
    const { isOpen, isLoading, results, prompts, error } = nineGridModalState;
    if (!isOpen) return null;

    const handleSelect = (index: number) => {
        const url = results[index];
        const prompt = prompts[index];
        if(url && prompt) {
            handleApplyStyle(prompt, 'nine-grid');
            setNineGridModalState({ isOpen: false, isLoading: false, results: [], prompts: [], error: null });
        }
    };
  
    return (
      <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4">
        <div className="bg-[var(--theme-bg-panel)] rounded-xl p-4 md:p-6 w-full max-w-4xl max-h-[90vh] flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold">一键九宫格设计</h2>
            <div className="flex items-center space-x-2">
                <button onClick={handleSaveAllNineGrid} disabled={isLoading || results.some(r => r === null)} className="flex items-center space-x-1 px-3 py-1.5 text-sm bg-[var(--theme-bg-subtle)] rounded-md hover:bg-opacity-80 disabled:opacity-50 transition-transform active:scale-95">
                    <DownloadIcon /><span>全部保存</span>
                </button>
                <button onClick={() => setNineGridModalState({ isOpen: false, isLoading: false, results: [], prompts: [], error: null })} className="p-2 rounded-full hover:bg-[var(--theme-bg-subtle)] transition-transform active:scale-90"><XIcon /></button>
            </div>
          </div>
          {isLoading && results.every(r => r === null) && <div className="flex-1 flex items-center justify-center text-[var(--theme-text-muted)]">AI正在全力生成中...</div>}
          {error && <div className="flex-1 flex items-center justify-center text-red-500">{error}</div>}
          {!error && (
            <div className="grid grid-cols-3 gap-2 md:gap-4 flex-1 overflow-y-auto">
              {results.map((url, i) => (
                <div key={i} className="aspect-square bg-[var(--theme-bg-subtle)] rounded-md relative group">
                  {url ? <img src={url} className="w-full h-full object-cover rounded-md" /> : <div className="w-full h-full flex items-center justify-center animate-pulse"></div>}
                  {url && (
                    <div className="absolute inset-0 bg-black bg-opacity-50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity space-x-2">
                      <button onClick={() => setZoomModalProps({ isOpen: true, imageUrl: url, prompt: prompts[i] || '', onSelect: () => handleSelect(i) })} className="p-2 bg-white/20 rounded-full text-white hover:bg-white/40 transition-transform active:scale-90"><ExpandIcon /></button>
                      <button onClick={() => handleSaveNineGrid(i)} className="p-2 bg-white/20 rounded-full text-white hover:bg-white/40 transition-transform active:scale-90"><DownloadIcon /></button>
                      <button onClick={() => handleSelect(i)} className="p-2 bg-white/20 rounded-full text-white hover:bg-white/40 transition-transform active:scale-90"><CheckIcon /></button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };
  
  const ZoomableImageModal = () => {
    const { isOpen, imageUrl, prompt, onSelect } = zoomModalProps;
    const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
    const imgRef = useRef<HTMLImageElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
  
    const handleWheel = (e: React.WheelEvent) => {
      e.preventDefault();
      const scaleAmount = -e.deltaY * 0.001;
      setTransform(prev => ({
        ...prev,
        scale: Math.min(Math.max(0.5, prev.scale + scaleAmount), 5),
      }));
    };
  
    const handleMouseDown = (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX - transform.x;
      const startY = e.clientY - transform.y;
      const onMouseMove = (moveEvent: MouseEvent) => {
        setTransform(prev => ({ ...prev, x: moveEvent.clientX - startX, y: moveEvent.clientY - startY }));
      };
      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    };
  
    const resetTransform = () => setTransform({ x: 0, y: 0, scale: 1 });
  
    useEffect(() => {
        resetTransform();
    }, [imageUrl]);
  
    if (!isOpen || !imageUrl) return null;
  
    return (
      <div className="fixed inset-0 bg-black bg-opacity-90 flex flex-col z-[100] p-4">
        <div className="flex justify-between items-center text-white flex-shrink-0 mb-4">
            <div className="flex-1 min-w-0">
                {prompt && <p className="truncate text-sm font-semibold">{prompt}</p>}
            </div>
            <div className="flex items-center space-x-2">
                {onSelect && <button onClick={onSelect} className="flex items-center space-x-1 px-3 py-1.5 text-sm bg-white/20 rounded-md hover:bg-white/30 transition-transform active:scale-95"><CheckIcon /><span>选择此设计</span></button>}
                <button onClick={resetTransform} className="px-3 py-1.5 text-sm bg-white/20 rounded-md hover:bg-white/30 transition-transform active:scale-95">重置</button>
                <button onClick={() => setZoomModalProps({ isOpen: false, imageUrl: null })} className="p-2 rounded-full hover:bg-white/20 transition-transform active:scale-90"><XIcon /></button>
            </div>
        </div>
        <div ref={containerRef} className="flex-1 overflow-hidden" onWheel={handleWheel}>
          <img
            ref={imgRef}
            src={imageUrl}
            className="cursor-grab active:cursor-grabbing"
            style={{
              transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
              transition: 'transform 0.1s ease-out',
            }}
            onMouseDown={handleMouseDown}
            alt="可缩放预览"
          />
        </div>
      </div>
    );
  };
  
  const SettingsModal = ({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) => {
    if (!isOpen) return null;
    const [currentTheme, setCurrentTheme] = useState<Theme>(document.documentElement.className.split(' ').find(c => c.startsWith('dark') || c.startsWith('light') || c.startsWith('theme-')) as Theme || 'dark');
    const [currentSize, setCurrentSize] = useState<FontSize>(document.documentElement.className.split(' ').find(c => c.startsWith('font-')) as FontSize || 'font-md');
  
    const applyTheme = (theme: Theme) => {
        document.documentElement.className = document.documentElement.className.replace(/dark|light|theme-\S+/g, '').trim();
        document.documentElement.classList.add(...theme.split(' '));
        setCurrentTheme(theme);
    };

    const applyFontSize = (size: FontSize) => {
        document.documentElement.className = document.documentElement.className.replace(/font-\S+/g, '').trim();
        document.documentElement.classList.add(size);
        setCurrentSize(size);
    };
  
    const themes: { name: string; value: Theme }[] = [
      { name: '默认暗色', value: 'dark' },
      { name: '默认亮色', value: 'light' },
      { name: '科技蓝', value: 'theme-pro-blue dark' },
      { name: '时尚粉', value: 'theme-pink-touch dark' },
    ];

    const fontSizes: { name: string, value: FontSize }[] = [
        { name: '小', value: 'font-sm' },
        { name: '中', value: 'font-md' },
        { name: '大', value: 'font-lg' },
    ];
  
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={onClose}>
        <div className="bg-[var(--theme-bg-panel)] rounded-lg p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold">设置</h2>
                <button onClick={onClose} className="transition-transform active:scale-90"><XIcon /></button>
            </div>
            <div className="space-y-4">
                <div>
                    <h3 className="font-semibold mb-2">主题皮肤</h3>
                    <div className="grid grid-cols-2 gap-2">
                        {themes.map(theme => (
                            <button key={theme.value} onClick={() => applyTheme(theme.value)} className={`p-2 rounded-md border-2 transition-transform active:scale-95 ${currentTheme === theme.value ? 'border-[var(--theme-indigo)]' : 'border-transparent'}`}>
                                {theme.name}
                            </button>
                        ))}
                    </div>
                </div>
                <div>
                    <h3 className="font-semibold mb-2">字号大小</h3>
                    <div className="flex items-center bg-[var(--theme-bg-subtle)] rounded-md p-1">
                        {fontSizes.map(size => (
                           <button key={size.value} onClick={() => applyFontSize(size.value)} className={`flex-1 text-center py-1 rounded transition-all duration-200 active:scale-95 ${currentSize === size.value ? 'bg-[var(--theme-bg-panel)] shadow' : ''}`}>
                                {size.name}
                           </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
      </div>
    );
  };
  
  const AboutModal = ({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) => {
    if (!isOpen) return null;
    const aboutContent = {
      "本应用用法": [
        "1. 上传/拍摄照片：点击“从文件上传”或“使用相机”按钮，选择一张清晰、无遮挡的正面人脸照片。AI会自动进行合规性检查并提取唇部特写。",
        "2. AI设计与预览：在“设计”面板中，您可以通过“一键九宫格”获得多种灵感，或使用“AI智能建议”和“快捷风格”快速应用效果，也可以输入自然语言进行微调。",
        "3. 对比与历史：在主预览区，您可以通过滑块直观对比原始特写和设计效果。所有操作都会被记录在“历史”面板，方便您随时回顾和切换。",
        "4. 方案与分享：AI会为您的设计生成一份专业的《AI美学方案报告》。您也可以将满意的对比图下载或分享。",
      ],
      "AI内容免责声明": [
        "本应用生成的唇形模拟效果、美学方案及所有建议均由人工智能模型生成，仅供美学参考和沟通辅助，不构成任何形式的医疗建议、诊断或治疗方案。",
        "AI生成内容可能存在不准确之处，实际注射效果受个体差异、医生技术、产品特性等多种因素影响，请务必咨询专业医师并以其面诊建议为准。"
      ],
      "医疗科普内容免责声明": [
        "本应用中可能包含的任何医疗或健康相关信息，仅作为一般性知识科普，不能替代执业医师的专业意见。在进行任何医疗美容决策前，您必须寻求合格医疗专业人士的建议。"
      ],
      "隐私声明": [
        "我们高度重视您的隐私。您上传的所有照片数据仅在您的设备上进行处理，我们不会将您的个人图像数据上传或存储到我们的服务器。所有AI分析均在保护您隐私的前提下进行。"
      ]
    };

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={onClose}>
        <div className="bg-[var(--theme-bg-panel)] rounded-lg p-6 w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
          <div className="flex justify-between items-center mb-4 flex-shrink-0">
            <h2 className="text-lg font-bold">关于本应用</h2>
            <button onClick={onClose} className="transition-transform active:scale-90"><XIcon /></button>
          </div>
          <div className="overflow-y-auto pr-2">
              <div className="space-y-4">
                  {Object.entries(aboutContent).map(([title, lines]) => (
                      <div key={title}>
                          <h3 className="font-bold text-md mb-2 text-[var(--theme-indigo)]">{title}</h3>
                          <div className="space-y-1 text-sm text-[var(--theme-text-muted)]">
                            {lines.map((line, index) => <p key={index}>{line}</p>)}
                          </div>
                      </div>
                  ))}
              </div>
              <div className="text-center text-xs text-[var(--theme-text-muted)] mt-6">
                <p>版本 0.5.7 | 部署时间 2025年9月11日</p>
              </div>
          </div>
        </div>
      </div>
    );
  };
  
  const mobileTabs = [
    ['photo', '照片', PhotoIcon],
    ['design', '设计', SparklesIcon],
    ['history', '历史', HistoryIcon],
  ] as const;

  const MainPanel = () => {
    switch(activeTab) {
      case 'photo': return <PhotoPanel />;
      case 'design': return <DesignPanel />;
      case 'history': return <HistoryPanel />;
      default: return null;
    }
  };

  const MobileLayout = () => (
    <div className="flex flex-col h-full">
      <Header />
      <EditorCanvas />
      <div className={`fixed bottom-0 left-0 right-0 z-10 bg-[var(--theme-bg-panel)] shadow-[0_-2px_10px_rgba(0,0,0,0.1)] transition-transform duration-300 ease-in-out transform ${isWorkspaceOpen ? 'translate-y-0' : 'translate-y-[calc(100%-4rem)]'}`}>
        <div onClick={() => selectedPhotoId && setIsWorkspaceOpen(!isWorkspaceOpen)} className="h-6 flex justify-center items-center cursor-pointer">
          <div className="w-8 h-1 bg-[var(--theme-bg-subtle)] rounded-full"></div>
        </div>
        <div className="h-[50vh] overflow-y-auto">
          <MainPanel />
        </div>
      </div>
       <nav className="fixed bottom-0 left-0 right-0 h-16 bg-[var(--theme-bg-panel)] border-t border-[var(--theme-bg-subtle)] flex items-center justify-around z-30">
        {mobileTabs.map(([key, name, Icon]) => (
          <button
            key={key}
            onClick={() => {
              if (activeTab === key) {
                setIsWorkspaceOpen(!isWorkspaceOpen);
              } else {
                setActiveTab(key);
                setIsWorkspaceOpen(true);
              }
            }}
            className={`flex flex-col items-center justify-center space-y-1 text-xs transition-all duration-200 active:scale-90 ${(activeTab === key && isWorkspaceOpen) ? 'text-[var(--theme-indigo)]' : 'text-[var(--theme-text-muted)]'}`}
            disabled={!selectedPhotoId}
          >
            <Icon className="w-6 h-6" />
            <span>{name}</span>
          </button>
        ))}
      </nav>
    </div>
  );

  const DesktopLayout = () => (
    <div className="flex h-full">
      <aside className="w-[22rem] h-full flex flex-col border-r border-[var(--theme-bg-subtle)]">
        <header className="h-14 flex items-center justify-between px-4 border-b border-[var(--theme-bg-subtle)] flex-shrink-0">
           <h1 className="text-lg font-bold flex items-center">
            <SparklesIcon className="h-6 w-6 mr-2 text-[var(--theme-indigo)]" />
            AI 设计
          </h1>
           <div className="flex items-center space-x-2">
            <button onClick={() => setSettingsModalOpen(true)} className="p-2 rounded-full hover:bg-[var(--theme-bg-subtle)] transition-all duration-200 active:scale-90">
              <SettingsIcon />
            </button>
            <button onClick={() => setAboutModalOpen(true)} className="p-2 rounded-full hover:bg-[var(--theme-bg-subtle)] transition-all duration-200 active:scale-90">
              <InfoIcon />
            </button>
          </div>
        </header>
        <div className="overflow-y-auto">
          <DesignPanel />
        </div>
      </aside>
      <main className="flex-1 h-full"><EditorCanvas /></main>
      <aside className="w-80 h-full border-l border-[var(--theme-bg-subtle)] flex flex-col">
        <div className="h-14 flex items-center px-4 border-b border-[var(--theme-bg-subtle)] flex-shrink-0">
          <nav className="flex items-center space-x-4">
            {mobileTabs.map(([key, name]) => (
              <button key={key} onClick={() => setActiveTab(key)} className={`text-sm font-semibold transition-all duration-200 pb-3.5 ${activeTab === key ? 'text-[var(--theme-indigo)] border-b-2 border-[var(--theme-indigo)]' : 'text-[var(--theme-text-muted)]'} active:translate-y-px`}>{name}</button>
            ))}
          </nav>
        </div>
        <div className="overflow-y-auto">
          <MainPanel />
        </div>
      </aside>
    </div>
  );


  return (
    <div className="h-screen w-screen bg-[var(--theme-bg-base)] text-[var(--theme-text-base)] font-sans overflow-hidden">
      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
      {isMobile ? <MobileLayout /> : <DesktopLayout />}
      <CameraModal isOpen={cameraModalOpen} onClose={() => setCameraModalOpen(false)} onCapture={(url) => processNewPhoto(url, `capture-${Date.now()}.png`)} />
      <NineGridModal />
      <ZoomableImageModal />
      <SettingsModal isOpen={settingsModalOpen} onClose={() => setSettingsModalOpen(false)} />
      <AboutModal isOpen={aboutModalOpen} onClose={() => setAboutModalOpen(false)} />
    </div>
  );
};

export default App;
