import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  MarkerType,
  Handle,
  Position
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';

import FamilyMemberNode from './components/CustomNode';
import { familyData as initialData } from './data/familyData';
import { supabase } from './lib/supabase';
import {
  Plus, Users, User, Table as TableIcon, Share2,
  Trash2, Edit2, Save, X, Camera, Heart, Baby, Sun, Moon,
  Divide, Settings, Download, Upload
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import * as XLSX from 'xlsx';
import Cropper from 'react-easy-crop';

// Error Boundary sederhana untuk menangkap crash
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '40px', textAlign: 'center', color: '#ef4444', background: '#fef2f2', height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <h2>Waduh, ada kesalahan sistem! 😭</h2>
          <p>{this.state.error?.toString()}</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()} style={{ width: 'fit-content', margin: '20px auto' }}>Muat Ulang Halaman</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Union Node: Titik temu Bapak & Ibu atau Titik Rujukan Orang Tua Tunggal
const UnionNode = () => (
  <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#94a3b8', border: '2px solid white', boxShadow: '0 0 5px rgba(0,0,0,0.2)' }}>
    <Handle type="target" position={Position.Left} id="left" style={{ visibility: 'hidden' }} />
    <Handle type="target" position={Position.Right} id="right" style={{ visibility: 'hidden' }} />
    <Handle type="target" position={Position.Top} id="top" style={{ visibility: 'hidden' }} />
    <Handle type="source" position={Position.Bottom} id="bottom" style={{ visibility: 'hidden' }} />
  </div>
);

// Helper Potong Gambar
const getCroppedImg = async (imageSrc, pixelCrop) => {
  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener('load', () => resolve(img));
    img.addEventListener('error', (error) => reject(error));
    img.src = imageSrc;
  });
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;
  ctx.drawImage(
    image,
    pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height,
    0, 0, pixelCrop.width, pixelCrop.height
  );
  return canvas.toDataURL('image/jpeg', 0.8);
};

const nodeTypes = {
  familyMember: FamilyMemberNode,
  union: UnionNode
};

const App = () => {
  const [familyMembers, setFamilyMembers] = useState(() => {
    const saved = localStorage.getItem('familyData');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch(e) { console.error('Error parsing localStorage', e); }
    }
    
    // Normalisasi data inisial
    let normalized = initialData.map(m => ({
      ...m,
      spouses: m.spouses || [],
      fatherId: m.parents?.find(p => p.type === 'blood' && initialData.find(f => f.id === p.id)?.gender === 'male')?.id || '',
      motherId: m.parents?.find(p => p.type === 'blood' && initialData.find(f => f.id === p.id)?.gender === 'female')?.id || '',
    }));

    // Sinkronkan data pasangan 2 arah pada pertama kali load
    normalized.forEach(m => {
        m.spouses.forEach(s => {
            const spouseRecord = normalized.find(n => n.id === s.id);
            if (spouseRecord) {
                if (!spouseRecord.spouses) spouseRecord.spouses = [];
                if (!spouseRecord.spouses.find(x => x.id === m.id)) {
                    spouseRecord.spouses.push({ id: m.id, type: s.type });
                }
            }
        });
    });

    return normalized;
  });

  const [view, setView] = useState('tree');
  const [tableTab, setTableTab] = useState('members'); // 'members', 'birthdays', 'anniversaries'
  const [editingId, setEditingId] = useState(null);
  const [editBuffer, setEditBuffer] = useState({});
  const [theme, setTheme] = useState('light');
  
  // State untuk Delete Modal
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteInput, setDeleteInput] = useState('');
  
  // State untuk Reset Total Modal
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  
  // State untuk Import Modal
  const [importPendingData, setImportPendingData] = useState([]);
  const [showImportConfirm, setShowImportConfirm] = useState(false);

  // State untuk Foto Cropper
  const [showCropModal, setShowCropModal] = useState(false);
  const [imageToCrop, setImageToCrop] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

  // State untuk Pencarian & Hubungan
  const [searchTerm, setSearchTerm] = useState('');
  const [kinshipSource, setKinshipSource] = useState('');
  const [kinshipTarget, setKinshipTarget] = useState('');
  const [showKinshipModal, setShowKinshipModal] = useState(false);

  // State untuk App Config
  const [appConfig, setAppConfig] = useState(() => {
    const saved = localStorage.getItem('familyAppConfig');
    if (saved) {
      try { return JSON.parse(saved); } catch(e){}
    }
    return {
      appName: 'Silsilah Keluarga',
      tagline: 'Manajemen Nasab Dinamis',
      logoMode: 'icon',
      logoUrl: ''
    };
  });
  
  const fileInputRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const isInitialLoad = useRef(true);

  // Fungsi Fetch Data dari Supabase
  const fetchData = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('family_members')
        .select('*');

      if (error) throw error;

      if (data && data.length > 0) {
        // Map snake_case to camelCase
        const mappedData = data.map(m => ({
          ...m,
          fatherId: m.father_id,
          motherId: m.mother_id
        }));
        setFamilyMembers(mappedData);
      } else {
        // Jika DB kosong, migrasikan data awal (localStorage atau initialData)
        const currentData = JSON.parse(localStorage.getItem('familyData') || '[]');
        const toUpload = currentData;
        
        if (toUpload.length > 0) {
          const { error: insertError } = await supabase
            .from('family_members')
            .upsert(toUpload.map(m => ({
              id: m.id,
              name: m.name,
              gender: m.gender,
              birth: m.birth,
              death: m.death,
              photo: m.photo,
              father_id: m.fatherId || '',
              mother_id: m.motherId || '',
              spouses: m.spouses || []
            })));
          
          if (insertError) console.error('Gagal migrasi data:', insertError);
          setFamilyMembers(toUpload);
        } else {
          // Jika DB kosong dan localStorage kosong, pastikan state kosong (bukan dummy)
          setFamilyMembers([]);
        }
      }
    } catch (err) {
      console.error('Error fetching from Supabase:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    localStorage.setItem('familyData', JSON.stringify(familyMembers));
    
    // Auto-sync ke Supabase: Ambil pendekatan Source-of-Truth dari state familyMembers
    if (!loading) {
        if (isInitialLoad.current) {
            isInitialLoad.current = false;
            return;
        }

        const syncToSupabase = async () => {
            try {
                const { error } = await supabase
                    .from('family_members')
                    .upsert(familyMembers.map(m => ({
                        id: m.id,
                        name: m.name,
                        gender: m.gender,
                        birth: m.birth,
                        death: m.death,
                        photo: m.photo,
                        father_id: m.fatherId || '',
                        mother_id: m.motherId || '',
                        spouses: m.spouses || []
                    })));
                
                if (error) console.error('Gagal auto-sync ke Supabase:', error);
            } catch (err) {
                console.error('Error in sync logic:', err);
            }
        };

        syncToSupabase();
    }
  }, [familyMembers, loading]);

  useEffect(() => {
    localStorage.setItem('familyAppConfig', JSON.stringify(appConfig));
  }, [appConfig]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');

  const getLayoutedElementsLocal = (nodesParam, edgesParam) => {
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));
    
    // Sesuaikan parameter tinggi Box dengan render asli untuk mencegah jarak yang terlalu ngangkang
    const nodeWidth = 220;
    const nodeHeight = 85;

    const spacingX = nodeWidth + 60; // Standard Dagre nodesep: 60px
    
    // Kalkulasi Jarak Darah (Bloodline Distance) dengan BFS untuk menentukan Tuan Rumah vs Pendatang (In-laws) sejati
    const bloodlineDist = {};
    const queue = [];
    nodesParam.forEach(n => {
        const m = n.data;
        if (!m || m.type === 'union') return;
        
        let isBloodline = false;
        if (m.fatherId || m.motherId) {
            isBloodline = true; // Punya ortu di sistem, otomatis darah murni
        } else {
            // Tidak punya ortu = Kandidat Leluhur (Root) ATAU Pendatang (In-Law Murni)
            // Syarat menjadi Leluhur Root Absolut: Harus Punya Anak, DAN SEMUA PASANGANNYA JUGA YATIM PIATU di sistem.
            const isParent = nodesParam.some(child => {
                const cData = child.data;
                return cData && (cData.fatherId === m.id || cData.motherId === m.id);
            });
            
            if (isParent) {
                // Cek mendalam apakah ada pasangannya (secara berantai) yang PUNYA ortu 
                const checkBloodlineSpouseR = (id, visited = new Set()) => {
                    if (visited.has(id)) return false;
                    visited.add(id);
                    const spNode = nodesParam.find(x => x.id === id)?.data;
                    if (spNode && (spNode.fatherId || spNode.motherId)) return true;
                    // Lacak pasangan dari pasangannya secara rekursif mengantisipasi rantai panjang
                    for (let sp of (spNode?.spouses || [])) {
                        if (checkBloodlineSpouseR(sp.id, visited)) return true;
                    }
                    return false;
                };
                
                if (!checkBloodlineSpouseR(m.id)) {
                    isBloodline = true; // Fix Leluhur Murni!
                }
            }
        }

        if (isBloodline) {
            bloodlineDist[m.id] = 0;
            queue.push(m.id);
        }
    });

    while (queue.length > 0) {
        const currId = queue.shift();
        const currDist = bloodlineDist[currId];
        const node = nodesParam.find(n => n.id === currId)?.data;
        if (node && node.spouses) {
            node.spouses.forEach(s => {
                if (bloodlineDist[s.id] === undefined) {
                    bloodlineDist[s.id] = currDist + 1;
                    queue.push(s.id);
                }
            });
        }
    }

    nodesParam.forEach(n => {
        if (n.type === 'union') {
            bloodlineDist[n.id] = 0; // Union Nodes selalu dihitung kalkulasi Utama
        } else if (bloodlineDist[n.id] === undefined) {
            bloodlineDist[n.id] = 999;
        }
    });

    // Inlaw murni adalah SIAPAPUN yang tidak memilki darah orisinil (Distance > 0)
    const pureInLawsSet = new Set(Object.keys(bloodlineDist).filter(id => bloodlineDist[id] > 0));

    // Temukan Map Pasangan Utama -> [Pasangan1, Pasangan2, ...] ditarik dari relasi BFS hirarkis absolut
    const marriages = {}; 
    const pureInLawCounts = {};

    edgesParam.forEach(e => {
        if (e.id.startsWith('e-spouse-')) {
            const nodeA = nodesParam.find(n => n.id === e.source)?.data;
            const nodeB = nodesParam.find(n => n.id === e.target)?.data;
            if (nodeA && nodeB) {
                // Yang jarak darahnya lebih kecil adalah Tuan Rumah (Main), sisanya menumpang
                let mainId, spouseId;
                if (bloodlineDist[nodeA.id] < bloodlineDist[nodeB.id]) {
                    mainId = nodeA.id; spouseId = nodeB.id;
                } else if (bloodlineDist[nodeB.id] < bloodlineDist[nodeA.id]) {
                    mainId = nodeB.id; spouseId = nodeA.id;
                } else {
                    mainId = nodeA.id < nodeB.id ? nodeA.id : nodeB.id; 
                    spouseId = mainId === nodeA.id ? nodeB.id : nodeA.id;
                }

                if (!marriages[mainId]) marriages[mainId] = [];
                if (!marriages[mainId].includes(spouseId)) {
                    marriages[mainId].push(spouseId);
                }
            }
        }
    });

    dagreGraph.setGraph({ rankdir: 'TB', ranksep: 50, nodesep: 60 });

    const getTotalSpouseCount = (id, visited = new Set()) => {
        if (visited.has(id)) return 0;
        visited.add(id);
        const sIds = marriages[id] || [];
        let total = sIds.length;
        sIds.forEach(s => total += getTotalSpouseCount(s, visited));
        return total;
    };

    nodesParam.forEach((node) => {
      // JANGAN masukkan Pure In-Law ke perhitungan Dagre awal agar grid saudara tidak koyak
      if (pureInLawsSet.has(node.id)) return;

      let extraWidth = 0;
      const totalSpouses = getTotalSpouseCount(node.id);
      if (totalSpouses > 0) {
          extraWidth = spacingX; // Minimal 1 pasangan mutlak membutuhkan clearance 1 kolom di Dagre
      }

      dagreGraph.setNode(node.id, {
        width: node.type === 'union' ? 20 : (nodeWidth + extraWidth),
        height: node.type === 'union' ? 20 : nodeHeight // Biarkan height normal
      });
    });

    const unionParents = {};
    edgesParam.forEach((edge) => {
        if (edge.target.startsWith('union-')) {
            if (!pureInLawsSet.has(edge.source)) {
                if (!unionParents[edge.target]) unionParents[edge.target] = [];
                unionParents[edge.target].push(edge.source);
            }
        }
    });

    edgesParam.forEach((edge) => {
      if (pureInLawsSet.has(edge.source) || pureInLawsSet.has(edge.target)) {
          // Cegah Union Node atau Anak Tiri (bawaan pendatang) kehilangan akar parent karena pasangannya disembunyikan
          if (edge.target.startsWith('union-') || edge.id.startsWith('e-single-')) {
              if (edge.target.startsWith('union-') && (!unionParents[edge.target] || unionParents[edge.target].length === 0)) {
                  // Cari Tuan Rumah (Anchor yg Dist=0) paling dekat
                  const findAnchor = (id) => {
                      if (bloodlineDist[id] === 0) return id;
                      const mNodeData = nodesParam.find(n => n.id === id)?.data;
                      for (let sp of (mNodeData?.spouses || [])) {
                          if (bloodlineDist[sp.id] < bloodlineDist[id]) return findAnchor(sp.id);
                      }
                      return null;
                  };
                  const anchorId = findAnchor(edge.source);
                  if (anchorId) {
                      dagreGraph.setEdge(anchorId, edge.target, { weight: 0 }); // Ikat Union ini ke Ortu Asli!
                      unionParents[edge.target] = [anchorId];
                  }
              } else if (edge.id.startsWith('e-single-')) {
                  const findAnchor = (id) => {
                      if (bloodlineDist[id] === 0) return id;
                      const mNodeData = nodesParam.find(n => n.id === id)?.data;
                      for (let sp of (mNodeData?.spouses || [])) {
                          if (bloodlineDist[sp.id] < bloodlineDist[id]) return findAnchor(sp.id);
                      }
                      return null;
                  };
                  const anchorId = findAnchor(edge.source);
                  if (anchorId) {
                      dagreGraph.setEdge(anchorId, edge.target, { weight: 0 }); // Ikat Anak Tiri ke Tuan Rumah Murni (Natively Routing)
                  }
              }
          }
          return;
      }
      if (!edge.id.includes('e-spouse-')) {
        dagreGraph.setEdge(edge.source, edge.target);
      }
    });

    dagre.layout(dagreGraph);

    // KOREKSI VERTIKAL NATIVE: Evaluasi tumpukan poligami dan sobek grafik Dagre ke bawah 
    // untuk menyediakan jalur vertikal kosong yang aman diisi jatuh oleh istri-istri tambahan.
    const rankTears = {};
    nodesParam.forEach(node => {
         const totalSpouses = getTotalSpouseCount(node.id);
         if (totalSpouses > 1) {
             const dNode = dagreGraph.node(node.id);
             if (dNode) {
                 const rankY = Math.round(dNode.y); 
                 const requiredTear = (totalSpouses - 1) * (nodeHeight + 25);
                 if (!rankTears[rankY] || requiredTear > rankTears[rankY]) {
                     rankTears[rankY] = requiredTear;
                 }
             }
         }
    });

    const sortedTears = Object.keys(rankTears).map(Number).sort((a,b) => a - b);
    const originalYs = {};
    nodesParam.forEach(n => {
        const dN = dagreGraph.node(n.id);
        if (dN) originalYs[n.id] = dN.y; 
    });

    nodesParam.forEach(node => {
         const dNode = dagreGraph.node(node.id);
         if (dNode) {
              let shift = 0;
              sortedTears.forEach(tearY => {
                   // Sobek / turunkan semua generasi yang secara vertikal berada di bawah anchor ini!
                   if (originalYs[node.id] > tearY + 10) { 
                        shift += rankTears[tearY];
                   }
              });
              dNode.y += shift;
         }
    });

    // URUTKAN eksekusi berdasarkan Distance mulai dari darah murni -> InLaw ke-1 -> InLaw ke-2
    // Tracker absolute per kolom untuk memastikan jaminan poligami berbaris rapi di kolom ordonya
    const establishedHusbandX = {};
    const establishedWifeX = {};
    const nextWifeY = {};

    const sortedMainIds = Object.keys(marriages).sort((a, b) => bloodlineDist[a] - bloodlineDist[b]);

    sortedMainIds.forEach(mainId => {
        const spouseIds = marriages[mainId];
        const mNode = dagreGraph.node(mainId);
        if (!mNode) return;

        // Offset maksimum untuk menggaransi semua anak disejajarkan poligami
        // Jarak seragam sempurna 60px dengan natif algoritma margin nodesep Dagre agar garis kuning merata global
        const spacingX = nodeWidth + 60;

        for (let i = 0; i < spouseIds.length; i++) {
            let spouseId = spouseIds[i];
            let sNode = dagreGraph.node(spouseId);
            
            let unionId = `union-${mainId}-${spouseId}`;
            let uNode = dagreGraph.node(unionId);
            if (!uNode) {
                unionId = `union-${spouseId}-${mainId}`;
                uNode = dagreGraph.node(unionId);
            }

            if (!sNode && pureInLawsSet.has(spouseId)) {
                // Node In-Law tidak dihitung Dagre, inisiasi node palsu
                sNode = { x: 0, y: 0, width: nodeWidth, height: nodeHeight };
                dagreGraph.setNode(spouseId, sNode); 
            }

            if (!sNode) continue;

            const currentOffsetY = i * (nodeHeight + 25);

            const mData = nodesParam.find(n => n.id === mainId)?.data;
            const mainIsMale = mData?.gender === 'male';

            if (establishedHusbandX[mainId] === undefined) {
                if (pureInLawsSet.has(spouseId)) {
                    const centerX = mNode.x;
                    const targetY = mNode.y;

                    const husbandX = centerX - spacingX / 2;
                    const wifeX = centerX + spacingX / 2;
                    
                    if (mainIsMale) {
                        mNode.x = husbandX;
                        sNode.x = wifeX; // Istri pertama di kanan
                    } else {
                        mNode.x = wifeX; // Istri pertama di kanan
                        sNode.x = husbandX; // Suami di kiri
                    }
                    
                    sNode.y = targetY;
                    
                    // Simpan koordinat Istri/Suami untuk diwariskan ke rantai Poligami di iterasi/mainId berikutnya
                    establishedHusbandX[mainId] = husbandX;
                    establishedHusbandX[spouseId] = husbandX;
                    establishedWifeX[mainId] = wifeX;
                    establishedWifeX[spouseId] = wifeX;
                    nextWifeY[mainId] = targetY + nodeHeight + 25;
                    nextWifeY[spouseId] = targetY + nodeHeight + 25;
                    
                    if (uNode) {
                        uNode.x = centerX;
                        uNode.y = targetY + 35;
                    }
                } else {
                    // Cross-Marriage (Sepupu - keduanya punya ortu)
                    const targetY = Math.max(mNode.y, sNode.y); 
                    sNode.y = targetY;
                    mNode.y = targetY;

                    const husbandX = mainIsMale ? mNode.x : sNode.x;
                    const wifeX = mainIsMale ? sNode.x : mNode.x;

                    // Harus dipaksa sesuai posisi Suami Kiri, Istri Kanan karena Dagre mungkin menata kebalik
                    if (mainIsMale) {
                        mNode.x = husbandX;
                        sNode.x = wifeX;
                    } else {
                        mNode.x = wifeX;
                        sNode.x = husbandX;
                    }

                    establishedHusbandX[mainId] = husbandX;
                    establishedHusbandX[spouseId] = husbandX;
                    establishedWifeX[mainId] = wifeX;
                    establishedWifeX[spouseId] = wifeX;
                    nextWifeY[mainId] = targetY + nodeHeight + 25;
                    nextWifeY[spouseId] = targetY + nodeHeight + 25;
                    
                    if (uNode) {
                        uNode.x = (husbandX + wifeX) / 2;
                        uNode.y = targetY + 35; 
                    }
                }
            } else {
                // Eksekusi untuk Istri Ke-2/Ke-3 atau Poligami lainnya
                const spouseData = nodesParam.find(n => n.id === spouseId)?.data;
                const isHusband = spouseData?.gender === 'male';

                if (isHusband) {
                    sNode.x = establishedHusbandX[mainId];
                } else {
                    sNode.x = establishedWifeX[mainId];
                }
                
                // Gunakan Tracker Y untuk penumpukan
                sNode.y = nextWifeY[mainId];
                nextWifeY[mainId] += nodeHeight + 25; // Lanjutkan tumpukan untuk berjaga-jaga jikada istri ke-3
                nextWifeY[spouseId] = nextWifeY[mainId]; // Pewarisan

                if (uNode) {
                     uNode.x = (establishedHusbandX[mainId] + establishedWifeX[mainId]) / 2;
                     uNode.y = sNode.y + 35; 
                }
            }
        }
    });

    // KOREKSI ARAH GARIS (EDGE HANDLES): Mengatasi Yellow Line terpelintir muter-muter
    // Karena letak Pria/Wanita bisa saja Terbalik antara Kiri/Kanan, tentukan colokannya dinamis
    edgesParam.forEach(edge => {
        if (edge.id.startsWith('e-spouse-') || edge.id.startsWith('e-union-f-') || edge.id.startsWith('e-union-m-')) {
            const sourceNode = dagreGraph.node(edge.source);
            const targetNode = dagreGraph.node(edge.target);
            if (sourceNode && targetNode) {
                // Check mana yang ada di sisi lebih kiri layout
                const isSourceOnLeft = sourceNode.x < targetNode.x;
                if (edge.id.startsWith('e-spouse-')) {
                     edge.sourceHandle = isSourceOnLeft ? 'right-source' : 'left-source';
                     edge.targetHandle = isSourceOnLeft ? 'left-target' : 'right-target';
                } else if (edge.id.startsWith('e-union-f-') || edge.id.startsWith('e-union-m-')) {
                     edge.sourceHandle = isSourceOnLeft ? 'right-source' : 'left-source';
                     edge.targetHandle = isSourceOnLeft ? 'left' : 'right';
                }
            }
        }
    });

    return nodesParam.map((node) => {
      const nodeWithPosition = dagreGraph.node(node.id);
      const width = node.type === 'union' ? 20 : nodeWidth;
      const height = node.type === 'union' ? 20 : nodeHeight;
      
      const x = nodeWithPosition?.x ?? Math.random() * 500;
      const y = nodeWithPosition?.y ?? Math.random() * 500;

      return {
        ...node,
        position: { x: x - width / 2, y: y - height / 2 },
      };
    });
  };

  // Logic Silsilah: Menghitung Node dan Edge
  const { layoutedNodes, layoutedEdges } = useMemo(() => {
    const nodes = familyMembers.map((m) => ({
      id: m.id,
      type: 'familyMember',
      data: { ...m },
      position: { x: 0, y: 0 },
    }));

    const edges = [];
    const unionNodes = [];
    const processedUnions = new Set();

    familyMembers.forEach((m) => {
      // Validasi: Apakah member ini ada di daftar nodes?
      const memberNode = nodes.find(n => n.id === m.id);
      if (!memberNode) return;

      // Garis Keturunan: Bapak + Ibu -> Union -> Anak
      if (m.fatherId && m.motherId) {
        const fatherNode = nodes.find(n => n.id === m.fatherId);
        const motherNode = nodes.find(n => n.id === m.motherId);

        // HANYA buat union jika kedua orang tua ada di sistem
        if (fatherNode && motherNode) {
          const unionId = `union-${m.fatherId}-${m.motherId}`;
          const reverseUnionId = `union-${m.motherId}-${m.fatherId}`;
          const actualUnionId = processedUnions.has(reverseUnionId) ? reverseUnionId : unionId;

          if (!processedUnions.has(unionId) && !processedUnions.has(reverseUnionId)) {
            unionNodes.push({
              id: unionId,
              type: 'union',
              position: { x: 0, y: 0 },
              data: {}
            });
            processedUnions.add(unionId);

            // Bapak -> Union (Dari kanan)
            edges.push({
              id: `e-union-f-${unionId}`,
              source: m.fatherId,
              target: unionId,
              sourceHandle: 'right-source',
              targetHandle: 'left',
              style: { stroke: '#94a3b8', strokeWidth: 2 }
            });
            // Ibu -> Union (Dari kiri)
            edges.push({
              id: `e-union-m-${unionId}`,
              source: m.motherId,
              target: unionId,
              sourceHandle: 'left-source',
              targetHandle: 'right',
              style: { stroke: '#94a3b8', strokeWidth: 2 }
            });
          }

          // Union -> Anak
          edges.push({
            id: `e-child-${m.id}`,
            source: actualUnionId,
            target: m.id,
            sourceHandle: 'bottom',
            targetHandle: 'top',
            animated: true,
            style: { stroke: '#6366f1', strokeWidth: 2.5 },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#6366f1' }
          });
        }
      } else if (m.fatherId || m.motherId) {
        // Fallback jika cuma ada 1 orang tua (misal orang tua tunggal / bawaan anak tiri)
        const parentId = m.fatherId || m.motherId;
        const parentNode = nodes.find(n => n.id === parentId);
        if (parentNode) {
          edges.push({
            id: `e-single-${parentId}-${m.id}`,
            source: parentId,
            target: m.id,
            sourceHandle: 'bottom',
            targetHandle: 'top',
            animated: true,
            style: { stroke: '#94a3b8', strokeWidth: 2.5, strokeDasharray: '4,4' },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' }
          });
        }
      }

      // Garis Pasangan (Horizontal Dash) dan Paksa Buat Union
      m.spouses?.forEach(s => {
        if (!s.id) return;
        const spouseNode = nodes.find(n => n.id === s.id);
        if (!spouseNode) return; // SKIP jika pasangan tidak ada di sistem

        const isMMale = m.gender !== 'female';
        const maleId = isMMale ? m.id : s.id;
        const femaleId = isMMale ? s.id : m.id;

        // 1. Buat Node Pasangan Garis Horizontal
        const edgeId = `e-spouse-${maleId}-${femaleId}`;
        const revEdgeId = `e-spouse-${femaleId}-${maleId}`;
        
        if (!edges.find(e => e.id === edgeId || e.id === revEdgeId)) {
          edges.push({
            id: edgeId,
            source: maleId,
            target: femaleId,
            sourceHandle: 'right-source',
            targetHandle: 'left-target',
            style: {
              stroke: s.type === 'divorced' ? '#94a3b8' : '#facc15',
              strokeWidth: 3,
              strokeDasharray: s.type === 'divorced' ? '4,4' : '0'
            },
            label: s.type === 'divorced' ? 'Bercerai' : 'Menikah',
            labelStyle: { fill: '#94a3b8', fontSize: 10 }
          });
        }

        // 2. JAMINKAN EXISTENSI UNION NODE UNTUK SEMUA PASUTRI, WALAUPUN TANPA ANAK
        // Supaya mesin Dagre menarik magnet suami-istri sebisa mungkin menyatu/berdekatan
        const unionId = `union-${m.id}-${s.id}`;
        const reverseUnionId = `union-${s.id}-${m.id}`;
        const unionExist = processedUnions.has(unionId) || processedUnions.has(reverseUnionId);
        
        // Cek juga union yang mungkin terdaftar dari data anak (fatherId-motherId)
        let foundExistingUnion = false;
        if (!unionExist) {
            const hId = isMMale ? m.id : s.id;
            const wId = isMMale ? s.id : m.id;
            const testUnionId = `union-${hId}-${wId}`;
            if (processedUnions.has(testUnionId)) foundExistingUnion = true;
        }

        if (!unionExist && !foundExistingUnion) {
            const finalUnionId = `union-${maleId}-${femaleId}`;
            processedUnions.add(finalUnionId);
            
            // Periksa jika murni tanpa anak
            const hasKids = familyMembers.some(k => 
                (k.fatherId === maleId && k.motherId === femaleId) || 
                (k.fatherId === femaleId && k.motherId === maleId)
            );

            unionNodes.push({
               id: finalUnionId,
               type: 'union',
               position: { x: 0, y: 0 },
               data: {},
               hidden: !hasKids
            });

            edges.push({
               id: `e-union-f-${finalUnionId}`,
               source: maleId,
               target: finalUnionId,
               sourceHandle: 'right-source', targetHandle: 'left',
               style: { stroke: '#94a3b8', strokeWidth: 2 },
               hidden: !hasKids
            });
            edges.push({
               id: `e-union-m-${finalUnionId}`,
               source: femaleId,
               target: finalUnionId,
               sourceHandle: 'left-source', targetHandle: 'right',
               style: { stroke: '#94a3b8', strokeWidth: 2 },
               hidden: !hasKids
            });
        }

      });
    });

    const finalNodes = [...nodes, ...unionNodes];
    const computedNodes = getLayoutedElementsLocal(finalNodes, edges);
    return { layoutedNodes: computedNodes, layoutedEdges: edges };
  }, [familyMembers]);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Inisialisasi awal dan update saat data keluarga berubah
  useEffect(() => {
    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
  }, [layoutedNodes, layoutedEdges, setNodes, setEdges]);

  const handleEdit = useCallback((member) => {
    setEditingId(member.id);
    setEditBuffer({
      ...member,
      name: member.name || '',
      gender: member.gender || 'male',
      birth: member.birth || '',
      death: member.death || '',
      isDeceased: !!member.death,
      fatherId: member.fatherId || '',
      motherId: member.motherId || '',
      spouses: member.spouses || [],
      photo: member.photo || ''
    });
  }, []);
  const handleSave = () => {
    // 1. Ambil ID pasangan untuk keperluan sync
    const oldMember = familyMembers.find(m => m.id === editingId);
    const oldSpouseIds = oldMember?.spouses?.map(s => s.id) || [];
    const newSpouseIds = editBuffer.spouses?.map(s => s.id) || [];

    // 2. Update state lokal (Complex logic untuk sinkronisasi 2 arah spouse)
    setFamilyMembers(prev => {
      return prev.map(m => {
        if (m.id === editingId) return { ...editBuffer };

        let mSpouses = [...(m.spouses || [])];
        let hasChanged = false;

        const spouseInfoInEditBuffer = editBuffer.spouses.find(s => s.id === m.id);

        if (spouseInfoInEditBuffer) {
            const existingEntry = mSpouses.find(s => s.id === editingId);
            if (!existingEntry) {
                mSpouses.push({ 
                    id: editingId, 
                    type: spouseInfoInEditBuffer.type || 'married', 
                    marriageDate: spouseInfoInEditBuffer.marriageDate || '' 
                });
                hasChanged = true;
            } else {
                if (existingEntry.type !== spouseInfoInEditBuffer.type || existingEntry.marriageDate !== spouseInfoInEditBuffer.marriageDate) {
                    mSpouses = mSpouses.map(s => s.id === editingId ? {
                        ...s,
                        type: spouseInfoInEditBuffer.type || 'married',
                        marriageDate: spouseInfoInEditBuffer.marriageDate || ''
                    } : s);
                    hasChanged = true;
                }
            }
        } else {
            if (oldSpouseIds.includes(m.id)) {
                if (mSpouses.some(s => s.id === editingId)) {
                    mSpouses = mSpouses.filter(s => s.id !== editingId);
                    hasChanged = true;
                }
            }
        }

        if (hasChanged) return { ...m, spouses: mSpouses };
        return m;
      });
    });

    setEditingId(null);
  };

  const handleAdd = () => {
    const id = `m${Date.now()}`;
    const newMember = {
      id,
      name: 'Anggota Baru',
      gender: 'male',
      birth: '1990-01-01',
      death: null,
      fatherId: '',
      motherId: '',
      spouses: [],
      photo: ''
    };

    // Gunakan state update teratur
    setFamilyMembers(prev => [...prev, newMember]);
    handleEdit(newMember);
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setImageToCrop(reader.result);
        setShowCropModal(true);
      };
      reader.readAsDataURL(file);
    }
  };

  const onCropComplete = useCallback((_croppedArea, croppedAreaPixels) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const saveCroppedImage = async () => {
    try {
      const cropped = await getCroppedImg(imageToCrop, croppedAreaPixels);
      setEditBuffer({ ...editBuffer, photo: cropped });
      setShowCropModal(false);
      setImageToCrop(null);
    } catch (e) { console.error(e); }
  };

  const handleDeleteData = (member) => {
    setDeleteTarget(member);
    setDeleteInput('');
  };

  const confirmDelete = async () => {
    if (deleteTarget && deleteInput === deleteTarget.name) {
      setFamilyMembers(prev => prev.filter(p => p.id !== deleteTarget.id));
      
      // Sync ke Supabase
      const { error } = await supabase
        .from('family_members')
        .delete()
        .eq('id', deleteTarget.id);
      
      if (error) console.error('Gagal hapus di Supabase:', error);
      
      setDeleteTarget(null);
    } else {
      alert('Nama tidak persis sama. Penghapusan dibatalkan.');
    }
  };

  const getNextOccurence = (dateStr) => {
    if (!dateStr) return null;
    let d = new Date(dateStr);
    
    // Auto-fix format lokal seperti DD/MM/YYYY
    if (isNaN(d.getTime()) && dateStr.includes('/')) {
        const parts = dateStr.split('/');
        if (parts.length === 3) d = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
    }
    
    // Fallback jika format murni hanya tahun (misal "1990")
    if (isNaN(d.getTime()) && dateStr.toString().trim().length === 4) {
        d = new Date(`${dateStr.trim()}-01-01`);
    }

    if (isNaN(d.getTime())) return null; // Gagal total, abaikan agar tak merusak sort loop

    const today = new Date();
    today.setHours(0,0,0,0);
    
    let next = new Date(today.getFullYear(), d.getMonth(), d.getDate());
    if (today > next) next.setFullYear(today.getFullYear() + 1);
    
    const diff = Math.ceil((next - today) / (1000 * 60 * 60 * 24));
    return { date: next, daysLeft: diff, years: next.getFullYear() - d.getFullYear() };
  };

  const getUpcomingBirthdays = () => {
    return familyMembers
      .filter(m => m.birth) // Menampilkan Milad bagi yang sudah wafat (Haul/Mengenang)
      .map(m => ({ member: m, info: getNextOccurence(m.birth) }))
      .filter(x => x.info !== null)
      .sort((a,b) => a.info.daysLeft - b.info.daysLeft);
  };

  const getUpcomingAnniversaries = () => {
    const records = [];
    const seen = new Set();
    familyMembers.forEach(m => {
        // Hapus m.death check agar tetap bisa mengenang anniversary leluhur yang sudah wafat
        m.spouses?.forEach(s => {
            if (s.type === 'divorced' || !s.marriageDate) return;
            const spouseRecord = familyMembers.find(f => f.id === s.id);
            if (!spouseRecord) return;
            
            const pairKey = [m.id, s.id].sort().join('-');
            if (!seen.has(pairKey)) {
                seen.add(pairKey);
                // Kita ambil info dari p1 (m) karena s.marriageDate sudah dipastikan ada di filter atas
                records.push({ p1: m, p2: spouseRecord, info: getNextOccurence(s.marriageDate) });
            }
        });
    });
    return records.filter(r => r.info !== null).sort((a,b) => a.info.daysLeft - b.info.daysLeft);
  };

  const getAnniversaryRank = (years) => {
    if (years >= 70) return 'Platinum';
    if (years >= 60) return 'Berlian';
    if (years >= 50) return 'Emas';
    if (years >= 45) return 'Safir';
    if (years >= 40) return 'Ruby';
    if (years >= 35) return 'Giok';
    if (years >= 30) return 'Mutiara';
    if (years >= 25) return 'Perak';
    if (years >= 20) return 'Tiongkok';
    if (years >= 15) return 'Kristal';
    if (years >= 10) return 'Timah';
    if (years >= 5) return 'Kayu';
    return '';
  };

  const handleExportExcel = () => {
    const data = familyMembers.map(m => ({
        ID: m.id,
        Nama: m.name,
        'JenisKelamin(male/female)': m.gender,
        'Lahir(YYYY-MM-DD)': m.birth || '',
        'Wafat(YYYY-MM-DD)': m.death || '',
        ID_Ayah: m.fatherId || '',
        ID_Ibu: m.motherId || '',
        'Pasangan(ID|Status|Tanggal)': m.spouses?.map(s => `${s.id}|${s.type}|${s.marriageDate || ''}`).join(', ') || ''
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Daftar_Keluarga");
    XLSX.writeFile(wb, `Ekspor_Keluarga_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const calculateRelationship = (idMe, idTarget) => {
    if (!idMe || !idTarget) return '';
    if (idMe === idTarget) return 'Diri Sendiri';
    const me = familyMembers.find(f => f.id === idMe);
    const target = familyMembers.find(f => f.id === idTarget);
    if (!me || !target) return '';

    const getAncestors = (id, depth = 0, path = []) => {
        const m = familyMembers.find(f => f.id === id);
        if (!m || depth > 8) return [path];
        let res = [[...path, { id, depth }]];
        if (m.fatherId) res = res.concat(getAncestors(m.fatherId, depth + 1, [...path, { id, depth }]));
        if (m.motherId) res = res.concat(getAncestors(m.motherId, depth + 1, [...path, { id, depth }]));
        return res;
    };

    const getBloodRelationship = (idA, idB) => {
        if (idA === idB) return 'Diri Sendiri';
        const pathsA = getAncestors(idA).flat();
        const pathsB = getAncestors(idB).flat();
        let common = null;
        let minSum = 999;
        pathsA.forEach(p1 => {
            const p2 = pathsB.find(x => x.id === p1.id);
            if (p2) {
                const sum = p1.depth + p2.depth;
                if (sum < minSum) {
                    minSum = sum;
                    common = { d1: p1.depth, d2: p2.depth };
                }
            }
        });
        if (!common) return null;
        const { d1, d2 } = common;
        if (d1 === 0) {
            if (d2 === 1) return 'Anak';
            if (d2 === 2) return 'Cucu';
            if (d2 === 3) return 'Cicit';
            return `Keturunan (Gen-${d2})`;
        }
        if (d2 === 0) {
            if (d1 === 1) return 'Orang Tua';
            if (d1 === 2) return 'Kakek/Nenek';
            if (d1 === 3) return 'Buyut';
            return `Leluhur (Gen-${d1})`;
        }
        if (d1 === 1 && d2 === 1) return 'Saudara Kandung';
        if (d1 === 1 && d2 === 2) return 'Keponakan';
        if (d1 === 1 && d2 === 3) return 'Cucu Keponakan';
        if (d1 === 2 && d2 === 1) return 'Paman/Bibi';
        if (d1 === 2 && d2 === 2) return 'Sepupu';
        if (d1 === 2 && d2 === 3) return 'Keponakan Jauh';
        if (d1 === 3 && d2 === 1) return 'Kakek/Nenek Tante';
        return `Kerabat (Jarak ${d1}:${d2})`;
    };

    // 1. Cek Hubungan Darah Langsung
    const blood = getBloodRelationship(idMe, idTarget);
    if (blood) return blood;

    // 2. Cek Hubungan lewat Pernikahan (Pasangan dari Kerabat)
    // Strategi: Cek apakah Target adalah pasangan dari seseorang yang punya hubungan darah dengan Me
    for (const s of (target.spouses || [])) {
        const bloodToPartner = getBloodRelationship(idMe, s.id);
        if (bloodToPartner && bloodToPartner !== 'Diri Sendiri') {
            return `Pasangan ${bloodToPartner}`;
        }
    }

    // 3. Cek apakah Me adalah pasangan dari seseorang yang punya hubungan darah dengan Target
    for (const s of (me.spouses || [])) {
        const bloodToPartner = getBloodRelationship(idTarget, s.id);
        if (bloodToPartner && bloodToPartner !== 'Diri Sendiri') {
            // Jika partner saya adalah Anak-nya Target, maka saya adalah Menantu Target
            if (bloodToPartner === 'Anak') return 'Menantu';
            if (bloodToPartner === 'Cucu') return 'Menantu Cucu';
            if (bloodToPartner === 'Orang Tua') return 'Mertua';
            if (bloodToPartner === 'Saudara Kandung') return 'Ipar';
            return `Pasangan ${bloodToPartner} (dari sisi Target)`;
        }
    }

    // 4. Default if Spouse
    if (me.spouses?.some(s => s.id === idTarget)) return 'Suami/Istri';

    return 'Hubungan Menjauh / Belum Terdefinisi';
  };

  const handleDownloadTemplate = () => {
    const data = [
        {
            ID: 'M1',
            Nama: 'Budi Santoso',
            'JenisKelamin(male/female)': 'male',
            'Lahir(YYYY-MM-DD)': '1980-01-01',
            'Wafat(YYYY-MM-DD)': '',
            ID_Ayah: '',
            ID_Ibu: '',
            'Pasangan(ID|Status|Tanggal)': 'M2|married|1998-05-20'
        },
        {
            ID: 'M2',
            Nama: 'Siti Aminah',
            'JenisKelamin(male/female)': 'female',
            'Lahir(YYYY-MM-DD)': '1982-05-15',
            'Wafat(YYYY-MM-DD)': '',
            ID_Ayah: '',
            ID_Ibu: '',
            'Pasangan(ID|Status|Tanggal)': 'M1|married|1998-05-20'
        },
        {
            ID: 'M3',
            Nama: 'Andi Santoso',
            'JenisKelamin(male/female)': 'male',
            'Lahir(YYYY-MM-DD)': '2005-10-10',
            'Wafat(YYYY-MM-DD)': '',
            ID_Ayah: 'M1',
            ID_Ibu: 'M2',
            'Pasangan(ID|Status|Tanggal)': ''
        }
    ];
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "Template_Keluarga.xlsx");
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Helper untuk menormalkan tanggal dari Excel (string atau serial number)
    const normalizeDate = (val) => {
        if (!val || val === 'null' || val === 'undefined') return '';
        if (typeof val === 'number') {
            const d = new Date(Math.round((val - 25569) * 86400 * 1000));
            return d.toISOString().split('T')[0];
        }
        let str = val.toString().trim();
        if (!str) return '';
        
        // Handle DD/MM/YY atau DD/MM/YYYY
        if (str.includes('/')) {
            const parts = str.split('/');
            if (parts.length === 3) {
                let d = parts[0].padStart(2, '0');
                let m = parts[1].padStart(2, '0');
                let y = parts[2];
                if (y.length === 2) y = (parseInt(y) > 40 ? '19' : '20') + y;
                return `${y}-${m}-${d}`;
            }
        }
        const d = new Date(str);
        if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
        
        // Jika bukan tanggal valid dan bukan pola angka tahun murni, buang (return '')
        if (str.length !== 4 || isNaN(parseInt(str))) return '';
        
        return str;
    };
    
    const reader = new FileReader();
    reader.onload = (evt) => {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, {type: 'binary'});
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const rawData = XLSX.utils.sheet_to_json(ws);
        
        const newData = rawData.map(row => {
            const keys = Object.keys(row);
            const spouseStr = (row['Pasangan(ID|Status|Tanggal)'] || row.Pasangan || '').toString();
            const spousesArray = spouseStr ? spouseStr.split(',').map(s => {
                const parts = s.trim().split('|');
                return {
                    id: parts[0] || '',
                    type: parts[1] || 'married',
                    marriageDate: normalizeDate(parts[2] || '')
                };
            }).filter(s => s.id) : [];

            return {
                id: row.ID?.toString() || row[keys[0]]?.toString() || `m${Date.now()}${Math.random()}`,
                name: row.Nama || row[keys[1]] || 'Unknown',
                gender: (row['JenisKelamin(male/female)'] || row.Gender || row[keys[2]] || 'male').toString().toLowerCase(),
                birth: normalizeDate(row['Lahir(YYYY-MM-DD)'] || row.Lahir || row[keys[3]] || null),
                death: normalizeDate(row['Wafat(YYYY-MM-DD)'] || row.Wafat || row[keys[4]] || null),
                fatherId: row.ID_Ayah?.toString() || row.Ayah?.toString() || row[keys[5]]?.toString() || '',
                motherId: row.ID_Ibu?.toString() || row.Ibu?.toString() || row[keys[6]]?.toString() || '',
                spouses: spousesArray,
                photo: ''
            };
        });
        
        if (newData.length > 0) {
            setImportPendingData(newData);
            setShowImportConfirm(true);
        }
    };
    reader.readAsBinaryString(file);
    e.target.value = null; // reset
  };

  const handleImportMerge = () => {
    setFamilyMembers(prev => [...prev, ...importPendingData]);
    setShowImportConfirm(false);
    setImportPendingData([]);
  };

  const handleImportOverwrite = () => {
    setFamilyMembers(importPendingData);
    setShowImportConfirm(false);
    setImportPendingData([]);
  };

  const handleAppLogoUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const r = new FileReader();
      r.onloadend = () => setAppConfig({ ...appConfig, logoMode: 'url', logoUrl: r.result });
      r.readAsDataURL(file);
    }
  };

  const handleResetApp = () => {
      setShowResetConfirm(true);
  };

  const confirmResetApp = async () => {
      localStorage.setItem('familyData', '[]');
      localStorage.removeItem('familyAppConfig');
      
      // Hapus data di Supabase (Semua data di tabel)
      const { error } = await supabase
        .from('family_members')
        .delete()
        .neq('id', '0'); // Di Postgres Supabase, delete harus pakai filter. neq '0' akan menghapus semua ID teks.

      if (error) console.error('Gagal reset di Supabase:', error);

      setFamilyMembers([]);
      setAppConfig({
        appName: 'Silsilah Keluarga',
        tagline: 'Manajemen Nasab Dinamis',
        logoMode: 'icon',
        logoUrl: ''
      });
      setView('tree');
      setShowResetConfirm(false);
      
      // Paksa sinkronisasi browser ke memori kosong 100%
      window.location.reload();
  };

  return (
    <div className="app-container" style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw' }}>
      <header className="glass" style={{ margin: '20px', padding: '15px 30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          {appConfig.logoMode === 'url' && appConfig.logoUrl ? (
            <img src={appConfig.logoUrl} style={{ width: '40px', height: '40px', borderRadius: '8px', objectFit: 'cover' }} alt="Logo" />
          ) : (
            <div className="logo glass" style={{ padding: '10px', borderRadius: '12px', background: 'var(--primary)', color: 'white' }}>
              <Users size={24} />
            </div>
          )}
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 700 }}>{appConfig.appName}</h1>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{appConfig.tagline}</p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px' }} className="nav-container">
          <button className="btn glass" onClick={toggleTheme}>
            {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
          </button>
          <button className={`btn ${view === 'tree' ? 'btn-primary' : ''}`} onClick={() => setView('tree')}>
            <Share2 size={16} /> <span className="btn-text">Pohon</span>
          </button>
          <button className={`btn ${view === 'table' ? 'btn-primary' : ''}`} onClick={() => setView('table')}>
            <TableIcon size={16} /> <span className="btn-text">Tabel</span>
          </button>
          <button className="btn glass" onClick={() => setShowKinshipModal(true)} style={{ color: 'var(--primary)' }}>
            <Users size={16} /> <span className="btn-text">Kalkulator Nasab</span>
          </button>
          {view === 'tree' && (
            <button className="btn btn-primary" onClick={handleAdd}>
              <Plus size={16} /> <span className="btn-text">Tambah Anggota</span>
            </button>
          )}
        </div>
      </header>

      <main style={{ flex: 1, position: 'relative', overflowY: view !== 'tree' ? 'auto' : 'hidden' }}>
        
        {/* Tombol Pengaturan Mengambang di Pojok */}
        <button 
           className={`btn ${view === 'settings' ? 'btn-primary' : 'glass'}`} 
           style={{ position: 'fixed', bottom: '20px', right: '20px', padding: '12px', zIndex: 9999, borderRadius: '50%', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} 
           onClick={() => setView(view === 'settings' ? 'tree' : 'settings')} 
           title="Pengaturan"
        >
          <Settings size={24} />
        </button>

        <AnimatePresence mode="wait">
          {view === 'tree' ? (
            <motion.div key="tree" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ width: '100%', height: '100%' }}>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                nodeTypes={nodeTypes}
                onNodeClick={(_, node) => {
                  if (node.type === 'familyMember') {
                    handleEdit(node.data);
                  }
                }}
                fitView
              >
                <Background color={theme === 'light' ? '#f1f5f9' : '#1e293b'} gap={25} />
                <Controls />
              </ReactFlow>
            </motion.div>
          ) : view === 'settings' ? (
            <motion.div key="settings" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} style={{ padding: '20px', maxWidth: '800px', margin: '0 auto', width: '100%' }}>
               <div className="glass" style={{ padding: '30px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <h2 style={{ marginBottom: '10px' }}>Pengaturan Aplikasi</h2>
                  
                  <div>
                    <label style={{ fontSize: '0.85rem', opacity: 0.7, marginBottom: '8px', display: 'block' }}>Nama Aplikasi</label>
                    <input type="text" value={appConfig.appName} onChange={e => setAppConfig({...appConfig, appName: e.target.value})} className="glass" style={{ width: '100%', padding: '12px' }} />
                  </div>
                  
                  <div>
                    <label style={{ fontSize: '0.85rem', opacity: 0.7, marginBottom: '8px', display: 'block' }}>Tagline Slogan</label>
                    <input type="text" value={appConfig.tagline} onChange={e => setAppConfig({...appConfig, tagline: e.target.value})} className="glass" style={{ width: '100%', padding: '12px' }} />
                  </div>

                  <div>
                    <label style={{ fontSize: '0.85rem', opacity: 0.7, marginBottom: '8px', display: 'block' }}>Tampilan Logo Kiri Atas</label>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button className={`btn ${appConfig.logoMode === 'icon' ? 'btn-primary' : 'glass'}`} onClick={() => setAppConfig({...appConfig, logoMode: 'icon'})}>Ikon Bawaan</button>
                        <button className="btn glass" onClick={() => document.getElementById('logo-upload').click()}>
                           <Upload size={14} style={{ marginRight: '5px' }} /> Upload Gambar
                        </button>
                        <input id="logo-upload" type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAppLogoUpload} />
                    </div>
                    {appConfig.logoMode === 'url' && appConfig.logoUrl && (
                        <div style={{ marginTop: '10px' }}>
                           <img src={appConfig.logoUrl} style={{ width: '40px', height: '40px', borderRadius: '8px', objectFit: 'cover', border: '1px solid var(--border-card)' }} />
                        </div>
                    )}
                  </div>

                  <hr style={{ borderColor: 'var(--border-card)', margin: '20px 0' }} />
                  
                  <div style={{ background: 'rgba(56, 189, 248, 0.1)', padding: '20px', borderRadius: '12px' }}>
                      <h3 style={{ marginBottom: '10px', fontSize: '1.1rem', color: '#0ea5e9' }}>Import Data Keluarga (Excel .xlsx)</h3>
                      <p style={{ fontSize: '0.85rem', opacity: 0.8, marginBottom: '15px' }}>
                        Unggah file berektensi .xlsx untuk memasukkan banyak data sekaligus. Edit pasangan menggunakan format Pasangan(ID|Status|Tanggal).
                      </p>
                   <div style={{ display: 'flex', gap: '15px' }}>
                     <button className="btn glass" onClick={handleDownloadTemplate} style={{ color: '#0ea5e9' }}>
                       <Download size={16} /> Template Excel
                     </button>
                     <button className="btn glass" onClick={handleExportExcel} style={{ color: '#10b981' }}>
                       <Share2 size={16} /> Export ke Excel
                     </button>
                     <button className="btn btn-primary" onClick={() => fileInputRef.current.click()}>
                       <Upload size={16} /> Upload Data Excel
                     </button>
                     <input type="file" accept=".xlsx, .xls" ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} />
                </div>
            </div>

            <hr style={{ borderColor: 'var(--border-card)', margin: '20px 0' }} />

            <hr style={{ borderColor: 'var(--border-card)', margin: '20px 0' }} />

                  <div style={{ background: 'rgba(239, 68, 68, 0.05)', padding: '20px', borderRadius: '12px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                      <h3 style={{ marginBottom: '10px', fontSize: '1.1rem', color: '#ef4444' }}>Zona Bahaya (Clear All)</h3>
                      <p style={{ fontSize: '0.85rem', opacity: 0.8, marginBottom: '15px' }}>
                        Hapus bersih SEPENUHNYA semua data anggota, wajah, dan kembalikan pengaturan logo ke awal. Aplikasi akan menjadi kertas putih berstatus kosong (0 Anggota). Aksi ini musnah tanpa jejak.
                      </p>
                      <button className="btn" style={{ background: '#ef4444', color: 'white' }} onClick={handleResetApp}>
                        Kosongkan Total Aplikasi (Hapus Semua)
                      </button>
                  </div>

                  <div style={{ textAlign: 'right', marginTop: '10px' }}>
                     <p style={{ fontSize: '0.75rem', opacity: 0.5 }}>Perubahan pengaturan otomatis disimpan seketika ke Database Lokal.</p>
                  </div>
               </div>
            </motion.div>
          ) : (
            <motion.div key="table" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} style={{ padding: '20px', maxWidth: '1100px', margin: '0 auto', width: '100%' }}>
              
              <div style={{ display: 'flex', gap: '15px', marginBottom: '20px', alignItems: 'center' }}>
                <button className="btn btn-primary" onClick={handleAdd} style={{ marginRight: 'auto' }}>
                  <Plus size={16} /> <span className="btn-text">Tambah Anggota</span>
                </button>
                <div style={{ position: 'relative', width: '250px' }}>
                    <input 
                      placeholder="Cari nama..." 
                      className="glass" 
                      style={{ width: '100%', padding: '8px 12px 8px 35px', outline: 'none' }} 
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                    />
                    <User size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
                </div>
                <button className={`btn ${tableTab === 'members' ? 'btn-primary' : 'glass'}`} onClick={() => setTableTab('members')}>Data Anggota</button>
                <button className={`btn ${tableTab === 'birthdays' ? 'btn-primary' : 'glass'}`} onClick={() => setTableTab('birthdays')}>🎂 Ulang Tahun</button>
                <button className={`btn ${tableTab === 'anniversaries' ? 'btn-primary' : 'glass'}`} onClick={() => setTableTab('anniversaries')}>💍 Anniversary</button>
              </div>

              <div className="glass" style={{ padding: '24px', overflowX: 'auto', marginBottom: '40px' }}>
                {tableTab === 'members' && (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-card)', color: 'var(--text-muted)' }}>
                        <th style={{ padding: '12px', textAlign: 'left' }}>Anggota</th>
                        <th style={{ padding: '12px', textAlign: 'left' }}>Orang Tua</th>
                        <th style={{ padding: '12px', textAlign: 'left' }}>Status</th>
                        <th style={{ padding: '12px', textAlign: 'right' }}>Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {familyMembers
                        .filter(m => m.name.toLowerCase().includes(searchTerm.toLowerCase()))
                        .map(m => (
                        <tr key={m.id} style={{ borderBottom: '1px solid var(--border-card)' }}>
                          <td style={{ padding: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            {m.photo ? (
                              <img src={m.photo} alt="" style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover' }} />
                            ) : (
                              <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: m.gender === 'male' ? '#0ea5e9' : '#db2777', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px' }}>
                                <User size={18} />
                              </div>
                            )}
                            <div>
                              <div style={{ fontWeight: 600 }}>{m.name}</div>
                              <div style={{ fontSize: '0.7rem', color: m.gender === 'male' ? 'var(--male-border)' : 'var(--female-border)' }}>{m.gender === 'male' ? 'LAKI-LAKI' : 'PEREMPUAN'}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '12px', fontSize: '0.8rem' }}>
                          <div>A: {familyMembers.find(f => f.id === m.fatherId)?.name || '-'}</div>
                          <div>I: {familyMembers.find(f => f.id === m.motherId)?.name || '-'}</div>
                        </td>
                        <td style={{ padding: '12px' }}>
                          <span style={{ fontSize: '0.75rem', padding: '4px 8px', borderRadius: '4px', background: m.death ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)', color: m.death ? '#ef4444' : '#22c55e' }}>
                            {m.death ? 'Wafat' : 'Hidup'}
                          </span>
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button className="btn glass" style={{ padding: '6px' }} onClick={() => handleEdit(m)}><Edit2 size={14} /></button>
                            <button className="btn glass" style={{ padding: '6px', color: '#ef4444' }} onClick={() => handleDeleteData(m)}><Trash2 size={14} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                )}

                {tableTab === 'birthdays' && (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-card)', color: 'var(--text-muted)' }}>
                        <th style={{ padding: '12px', textAlign: 'left' }}>Anggota</th>
                        <th style={{ padding: '12px', textAlign: 'left' }}>Tgl Lahir</th>
                        <th style={{ padding: '12px', textAlign: 'left' }}>Ulang Tahun Ke-</th>
                        <th style={{ padding: '12px', textAlign: 'right' }}>Hitung Mundur</th>
                      </tr>
                    </thead>
                    <tbody>
                      {getUpcomingBirthdays().map(row => (
                        <tr key={row.member.id} style={{ borderBottom: '1px solid var(--border-card)' }}>
                          <td style={{ padding: '12px', fontWeight: 600 }}>{row.member.name}</td>
                          <td style={{ padding: '12px' }}>{new Date(row.member.birth).toLocaleDateString('id-ID', {day: 'numeric', month: 'long'})}</td>
                          <td style={{ padding: '12px' }}>{row.info.years} Tahun</td>
                          <td style={{ padding: '12px', textAlign: 'right', color: row.info.daysLeft === 0 ? '#10b981' : 'inherit', fontWeight: row.info.daysLeft === 0 ? 700 : 400 }}>
                            {row.info.daysLeft === 0 ? 'HARI INI! 🎉' : `${row.info.daysLeft} hari lagi`}
                          </td>
                        </tr>
                      ))}
                      {getUpcomingBirthdays().length === 0 && (
                        <tr><td colSpan="4" style={{ padding: '20px', textAlign: 'center', opacity: 0.6 }}>Tidak ada data ulang tahun</td></tr>
                      )}
                    </tbody>
                  </table>
                )}

                {tableTab === 'anniversaries' && (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-card)', color: 'var(--text-muted)' }}>
                        <th style={{ padding: '12px', textAlign: 'left' }}>Pasangan</th>
                        <th style={{ padding: '12px', textAlign: 'left' }}>Tgl Menikah</th>
                        <th style={{ padding: '12px', textAlign: 'left' }}>Anniversary Ke-</th>
                        <th style={{ padding: '12px', textAlign: 'right' }}>Hitung Mundur</th>
                      </tr>
                    </thead>
                    <tbody>
                      {getUpcomingAnniversaries().map((row, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border-card)' }}>
                          <td style={{ padding: '12px', fontWeight: 600 }}>{row.p1.name} & {row.p2.name}</td>
                          <td style={{ padding: '12px' }}>
                            {/* Cari tanggal nikah dari sisi manapun yang menyediakan data (fallback) */}
                            {(() => {
                              const date = row.p1.spouses?.find(s => s.id === row.p2.id)?.marriageDate || 
                                           row.p2.spouses?.find(s => s.id === row.p1.id)?.marriageDate;
                              return date ? new Date(date).toLocaleDateString('id-ID', {day: 'numeric', month: 'long'}) : '-';
                            })()}
                          </td>
                          <td style={{ padding: '12px' }}>
                            <div style={{ fontWeight: 600 }}>{row.info.years} Tahun</div>
                            {getAnniversaryRank(row.info.years) && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--primary)' }}>
                                Pernikahan {getAnniversaryRank(row.info.years)}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '12px', textAlign: 'right', color: row.info.daysLeft === 0 ? '#10b981' : 'inherit', fontWeight: row.info.daysLeft === 0 ? 700 : 400 }}>
                            {row.info.daysLeft === 0 ? 'HARI INI! 💍' : `${row.info.daysLeft} hari lagi`}
                          </td>
                        </tr>
                      ))}
                      {getUpcomingAnniversaries().length === 0 && (
                        <tr><td colSpan="4" style={{ padding: '20px', textAlign: 'center', opacity: 0.6 }}>Tidak ada data anniversary pernikahan (Isi tanggal menikah terlebih dahulu)</td></tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Edit Overlay */}
      {editingId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)', padding: '20px' }}>
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="glass" style={{ width: '100%', maxWidth: '600px', padding: '25px', color: 'var(--text-main)', maxHeight: '95vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '1.25rem' }}>Edit Data Keluarga</h2>
              <button className="btn glass" style={{ padding: '8px' }} onClick={() => setEditingId(null)}><X size={20} /></button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                <div style={{ position: 'relative' }}>
                  {editBuffer.photo ? (
                    <img src={editBuffer.photo} style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--primary)' }} />
                  ) : (
                    <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: editBuffer.gender === 'male' ? '#0ea5e9' : '#db2777', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                      <User size={40} />
                    </div>
                  )}
                  <label htmlFor="image-upload" style={{ position: 'absolute', bottom: 0, right: 0, background: 'var(--primary)', padding: '5px', borderRadius: '50%', cursor: 'pointer', color: 'white' }}>
                    <Camera size={14} />
                    <input id="image-upload" type="file" accept="image/*" hidden onChange={handleImageUpload} />
                  </label>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.75rem', opacity: 0.6 }}>Nama Lengkap</label>
                  <input value={editBuffer.name} onChange={e => setEditBuffer({ ...editBuffer, name: e.target.value })} className="glass" style={{ width: '100%', padding: '10px', background: 'transparent', color: 'inherit' }} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', opacity: 0.6 }}>Jenis Kelamin</label>
                  <select value={editBuffer.gender} onChange={e => setEditBuffer({ ...editBuffer, gender: e.target.value })} className="glass" style={{ width: '100%', padding: '10px', background: 'transparent', color: 'inherit' }}>
                    <option value="male">Laki-laki</option>
                    <option value="female">Perempuan</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', opacity: 0.6 }}>Tanggal Lahir</label>
                  <input type="date" value={editBuffer.birth} onChange={e => setEditBuffer({ ...editBuffer, birth: e.target.value })} className="glass" style={{ width: '100%', padding: '10px', background: 'transparent', color: 'inherit' }} />
                </div>
              </div>

              <div style={{ background: 'rgba(0,0,0,0.03)', padding: '15px', borderRadius: '10px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: editBuffer.isDeceased ? '10px' : 0 }}>
                  <input 
                    type="checkbox" 
                    checked={editBuffer.isDeceased} 
                    onChange={e => setEditBuffer({ ...editBuffer, isDeceased: e.target.checked, death: e.target.checked ? (editBuffer.death || '') : '' })}
                    style={{ width: '18px', height: '18px', accentColor: '#ef4444' }}
                  />
                  <span style={{ fontWeight: 600, color: editBuffer.isDeceased ? '#ef4444' : 'inherit' }}>Sudah Wafat (Almarhum/ah)</span>
                </label>
                {editBuffer.isDeceased && (
                  <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
                    <label style={{ fontSize: '0.75rem', opacity: 0.6 }}>Tanggal Wafat</label>
                    <input type="date" value={editBuffer.death} onChange={e => setEditBuffer({ ...editBuffer, death: e.target.value })} className="glass" style={{ width: '100%', padding: '10px', background: 'transparent', color: 'inherit' }} />
                  </motion.div>
                )}
              </div>

              {/* Hubungan Keluarga */}
              <div className="glass" style={{ padding: '15px', background: 'rgba(0,0,0,0.03)' }}>
                <h3 style={{ fontSize: '0.9rem', marginBottom: '15px', opacity: 0.8, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Users size={16} /> Hubungan Nasab
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {/* Pasangan (Multi-Spouse & Divorce) */}
                  <div>
                    <label style={{ fontSize: '0.75rem', opacity: 0.6 }}>List Pasangan</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '5px' }}>
                      {editBuffer.spouses?.map((s, idx) => (
                        <div key={idx} style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                          <select
                            value={s.id}
                            onChange={e => {
                              const newSpouses = [...editBuffer.spouses];
                              newSpouses[idx].id = e.target.value;
                              setEditBuffer({ ...editBuffer, spouses: newSpouses });
                            }}
                            className="glass" style={{ flex: 2, padding: '8px', background: 'transparent', fontSize: '0.85rem' }}
                          >
                            <option value="">Pilih Pasangan</option>
                            {familyMembers.filter(f => f.id !== editBuffer.id && f.gender !== editBuffer.gender).map(f => (
                              <option key={f.id} value={f.id}>{f.name}</option>
                            ))}
                          </select>
                          <input 
                            type="date"
                            value={s.marriageDate || ''}
                            onChange={e => {
                              const newSpouses = [...editBuffer.spouses];
                              newSpouses[idx].marriageDate = e.target.value;
                              setEditBuffer({ ...editBuffer, spouses: newSpouses });
                            }}
                            className="glass" style={{ flex: 1, padding: '8px', background: 'transparent', fontSize: '0.85rem' }}
                            title="Tanggal Menikah"
                          />
                          <select
                            value={s.type}
                            onChange={e => {
                              const newSpouses = [...editBuffer.spouses];
                              newSpouses[idx].type = e.target.value;
                              setEditBuffer({ ...editBuffer, spouses: newSpouses });
                            }}
                            className="glass" style={{ flex: 1, padding: '8px', background: 'transparent', fontSize: '0.85rem' }}
                          >
                            <option value="married">Menikah</option>
                            <option value="divorced">Bercerai</option>
                          </select>
                          <button onClick={() => {
                            const newSpouses = editBuffer.spouses.filter((_, i) => i !== idx);
                            setEditBuffer({ ...editBuffer, spouses: newSpouses });
                          }} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}><Trash2 size={16} /></button>
                        </div>
                      ))}
                      <button
                        onClick={() => setEditBuffer({ ...editBuffer, spouses: [...(editBuffer.spouses || []), { id: '', type: 'married' }] })}
                        className="btn glass" style={{ fontSize: '0.75rem', padding: '5px 10px', width: 'fit-content' }}
                      >
                        <Plus size={12} /> Tambah Pasangan
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '10px' }}>
                    <div>
                      <label style={{ fontSize: '0.75rem', opacity: 0.6 }}>Ayah Kandung</label>
                      <select value={editBuffer.fatherId || ''} onChange={e => setEditBuffer({ ...editBuffer, fatherId: e.target.value })} className="glass" style={{ width: '100%', padding: '10px', background: 'transparent', color: 'inherit' }}>
                        <option value="">Tidak Diketahui</option>
                        {familyMembers.filter(f => f.id !== editBuffer.id && f.gender === 'male').map(f => (
                          <option key={f.id} value={f.id}>{f.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '0.75rem', opacity: 0.6 }}>Ibu Kandung</label>
                      <select value={editBuffer.motherId || ''} onChange={e => setEditBuffer({ ...editBuffer, motherId: e.target.value })} className="glass" style={{ width: '100%', padding: '10px', background: 'transparent', color: 'inherit' }}>
                        <option value="">Tidak Diketahui</option>
                        {familyMembers.filter(f => f.id !== editBuffer.id && f.gender === 'female').map(f => (
                          <option key={f.id} value={f.id}>{f.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
                <button className="btn btn-primary" style={{ flex: 1, padding: '12px' }} onClick={handleSave}>
                  <Save size={18} /> Simpan Data
                </button>
                <button className="btn glass" style={{ padding: '12px' }} onClick={() => setEditingId(null)}>Batal</button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
      
      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="glass" style={{ width: '100%', maxWidth: '400px', padding: '25px', color: 'var(--text-main)', textAlign: 'center' }}>
            <h3 style={{ marginBottom: '15px' }}>Konfirmasi Hapus</h3>
            <p style={{ fontSize: '0.85rem', marginBottom: '20px', opacity: 0.8 }}>
              Ketik <strong>{deleteTarget.name}</strong> untuk mengonfirmasi penghapusan data ini secara permanen.
            </p>
            <input 
              value={deleteInput}
              onChange={e => setDeleteInput(e.target.value)}
              placeholder="Ketik nama di sini..."
              className="glass"
              style={{ width: '100%', padding: '10px', marginBottom: '20px', background: 'transparent', color: 'inherit', textAlign: 'center' }}
            />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                className="btn glass" 
                style={{ flex: 1, color: '#ef4444', opacity: deleteInput === deleteTarget.name ? 1 : 0.5 }} 
                onClick={confirmDelete}
                disabled={deleteInput !== deleteTarget.name}
              >
                Hapus Permanen
              </button>
              <button className="btn glass" style={{ flex: 1 }} onClick={() => setDeleteTarget(null)}>
                Batal
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Reset Total Confirmation Modal */}
      {showResetConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="glass" style={{ width: '100%', maxWidth: '450px', padding: '30px', color: 'var(--text-main)', textAlign: 'center', border: '1px solid rgba(239, 68, 68, 0.4)' }}>
            <h3 style={{ marginBottom: '15px', color: '#ef4444', fontSize: '1.4rem' }}>⚠️ APOCALYPSE WARNING</h3>
            <p style={{ fontSize: '0.9rem', marginBottom: '25px', opacity: 0.9, lineHeight: '1.5' }}>
              Anda akan memusnahkan <strong>SELURUH</strong> data Silsilah Keluarga secara permanen tanpa tersisa. Layar akan dikembalikan ke kondisi seputih kertas baru!
            </p>
            <div style={{ display: 'flex', gap: '15px' }}>
              <button 
                className="btn" 
                style={{ flex: 1, background: '#ef4444', color: 'white', fontWeight: 'bold' }} 
                onClick={confirmResetApp}
              >
                YAKIN HAPUS TOTAL
              </button>
              <button className="btn glass" style={{ flex: 1 }} onClick={() => setShowResetConfirm(false)}>
                Batalkan
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Import Confirmation Modal */}
      {showImportConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1300, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="glass" style={{ width: '100%', maxWidth: '500px', padding: '30px', color: 'var(--text-main)', textAlign: 'center' }}>
            <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <Upload size={30} />
            </div>
            <h3 style={{ marginBottom: '10px', fontSize: '1.25rem' }}>Konfirmasi Impor Data</h3>
            <p style={{ fontSize: '0.9rem', marginBottom: '25px', opacity: 0.8, lineHeight: '1.5' }}>
              Berhasil memproses <strong>{importPendingData.length}</strong> anggota keluarga dari file Excel. Pilih bagaimana Anda ingin memasukkan data ini:
            </p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button 
                className="btn btn-primary" 
                style={{ width: '100%', padding: '12px', justifyContent: 'center' }} 
                onClick={handleImportMerge}
              >
                Gabungkan dengan Data Lama
              </button>
              <button 
                className="btn glass" 
                style={{ width: '100%', padding: '12px', justifyContent: 'center', color: '#ef4444' }} 
                onClick={handleImportOverwrite}
              >
                Ganti Total (Hapus Data Lama)
              </button>
              <button 
                className="btn glass" 
                style={{ width: '100%', padding: '12px', justifyContent: 'center', marginTop: '5px' }} 
                onClick={() => { setShowImportConfirm(false); setImportPendingData([]); }}
              >
                Batalkan Impor
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Photo Crop Modal */}
      {showCropModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)' }}>
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="glass" style={{ width: '90%', maxWidth: '500px', height: '600px', display: 'flex', flexDirection: 'column', p: 0, overflow: 'hidden' }}>
            <div style={{ padding: '20px', borderBottom: '1px solid var(--border-card)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Sesuaikan Foto</h3>
              <button onClick={() => setShowCropModal(false)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            
            <div style={{ position: 'relative', flex: 1, background: '#000' }}>
               <Cropper
                image={imageToCrop}
                crop={crop}
                zoom={zoom}
                aspect={1}
                onCropChange={setCrop}
                onCropComplete={onCropComplete}
                onZoomChange={setZoom}
                cropShape="round"
                showGrid={false}
              />
            </div>

            <div style={{ padding: '25px' }}>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ fontSize: '0.75rem', opacity: 0.6, display: 'block', marginBottom: '10px' }}>Zoom: {zoom.toFixed(1)}x</label>
                <input 
                  type="range" 
                  min={1} max={3} step={0.1} 
                  value={zoom} 
                  onChange={(e) => setZoom(Number(e.target.value))} 
                  style={{ width: '100%', accentColor: 'var(--primary)' }}
                />
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button className="btn btn-primary" style={{ flex: 1, padding: '12px', justifyContent: 'center' }} onClick={saveCroppedImage}>
                  Pasang Foto
                </button>
                <button className="btn glass" style={{ flex: 1, padding: '12px', justifyContent: 'center' }} onClick={() => setShowCropModal(false)}>
                  Batal
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Kinship Calculator Modal */}
      {showKinshipModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1500, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)', padding: '20px' }}>
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="glass" style={{ width: '100%', maxWidth: '500px', padding: '30px', color: 'var(--text-main)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
               <h3 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                 <Users size={24} /> Kalkulator Hubungan Nasab
               </h3>
               <button className="btn glass" style={{ padding: '8px' }} onClick={() => setShowKinshipModal(false)}><X size={20} /></button>
            </div>
            
            <p style={{ fontSize: '0.85rem', opacity: 0.7, marginBottom: '20px', lineHeight: '1.5' }}>
              Pilih dua anggota keluarga untuk mengetahui hubungan kekerabatan di antara mereka secara otomatis.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '25px' }}>
                <div>
                    <label style={{ fontSize: '0.75rem', opacity: 0.6, display: 'block', marginBottom: '8px' }}>Pilih &quot;Saya&quot;</label>
                    <select className="glass" value={kinshipSource} onChange={e => setKinshipSource(e.target.value)} style={{ width: '100%', padding: '12px', background: 'transparent', color: 'inherit' }}>
                        <option value="">-- Anggota 1 --</option>
                        {familyMembers.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                </div>
                <div>
                    <label style={{ fontSize: '0.75rem', opacity: 0.6, display: 'block', marginBottom: '8px' }}>Pilih &quot;Target&quot;</label>
                    <select className="glass" value={kinshipTarget} onChange={e => setKinshipTarget(e.target.value)} style={{ width: '100%', padding: '12px', background: 'transparent', color: 'inherit' }}>
                        <option value="">-- Anggota 2 --</option>
                        {familyMembers.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                </div>
            </div>

            {kinshipSource && kinshipTarget ? (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ padding: '25px', background: 'var(--primary)', color: 'white', borderRadius: '15px', textAlign: 'center', boxShadow: '0 8px 16px rgba(99, 102, 241, 0.2)' }}>
                  <div style={{ fontSize: '0.85rem', opacity: 0.9, marginBottom: '5px' }}>Identifikasi Hubungan:</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' }}>
                    {calculateRelationship(kinshipSource, kinshipTarget)}
                  </div>
              </motion.div>
            ) : (
                <div style={{ padding: '30px', border: '2px dashed var(--border-card)', borderRadius: '15px', textAlign: 'center', opacity: 0.5 }}>
                   Pilih kedua nama di atas untuk melihat hasilnya
                </div>
            )}

            <button className="btn btn-primary" style={{ width: '100%', marginTop: '25px', padding: '14px', justifyContent: 'center' }} onClick={() => setShowKinshipModal(false)}>
              Tutup Kalkulator
            </button>
          </motion.div>
        </div>
      )}
    </div>
  );
};

const AppWithProvider = () => (
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);

export default AppWithProvider;
