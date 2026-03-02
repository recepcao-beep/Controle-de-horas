
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  Settings, 
  Play, 
  ArrowLeft, 
  LayoutDashboard, 
  Users, 
  MapPin, 
  ClipboardList, 
  CheckCircle, 
  XCircle, 
  LogOut, 
  ChevronRight, 
  ChevronDown,
  ChevronUp,
  Edit2, 
  Database, 
  RefreshCw, 
  Share2, 
  Lock, 
  Copy,
  Clock,
  AlertCircle,
  TrendingUp,
  DollarSign,
  Calendar,
  Menu
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer,
  PieChart, 
  Pie, 
  Cell,
  Legend,
  CartesianGrid
} from 'recharts';
import { 
  EmployeeType, 
  RequestStatus, 
  Sector, 
  Employee, 
  TimeRequest, 
  AppState,
  TimeRecord 
} from './types';
import { 
  formatCurrency, 
  timeToDecimal,
  formatDecimalHours,
  getWeekDays 
} from './utils';

// Constantes
const STORAGE_KEY = 'controle_horas_db_v3';
const DEFAULT_SHEET_URL = 'https://script.google.com/macros/s/AKfycbygZx_SPJr3h_HzxiLGyXhOcl-t65kc7nUl-Togwo0VwQh8NADsnSS4Yh8cfPfJz9eY/exec';
const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

const App: React.FC = () => {
  // --- Estados do Banco de Dados ---
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [requests, setRequests] = useState<TimeRequest[]>([]);
  const [dbUrl, setDbUrl] = useState(DEFAULT_SHEET_URL);
  const [folderRegId, setFolderRegId] = useState('1OGOxVmi2nEwI47HP9l48VdVBKQeJTVqm');
  const [folderFixoId, setFolderFixoId] = useState('1RzzDCHznw97QxwDLh_qvf8NE8yKPNdWU');
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const hasLoadedRef = useRef(false);

  // --- Estado Global da Navegação ---
  const [state, setState] = useState<AppState>({
    view: 'HOME',
    flowType: null,
    adminSubView: 'DASHBOARD'
  });

  // --- Estados de Formulários ---
  const [adminPassword, setAdminPassword] = useState('');
  const [isAuth, setIsAuth] = useState(false);
  const [selectedSector, setSelectedSector] = useState<string>('');
  const [selectedEmployee, setSelectedEmployee] = useState<string>('');
  const [showFormModal, setShowFormModal] = useState(false);
  const [currentWeek, setCurrentWeek] = useState(new Date().toISOString().split('T')[0]);

  // Estados Admin
  const [newSec, setNewSec] = useState({ name: '', fixedRate: 0 });
  const [newEmpData, setNewEmpData] = useState({ name: '', sectorId: '', salary: 0, monthlyHours: 220, type: EmployeeType.REGISTRADO });
  // Estado para controlar qual funcionário está sendo editado
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  
  const [modalRecords, setModalRecords] = useState<TimeRecord[]>([]);

  // Edição e Controle de Acesso
  const [editingRequestId, setEditingRequestId] = useState<string | null>(null);
  const [editJustification, setEditJustification] = useState('');
  
  const lastSyncedDataRef = useRef<string>('{"sectors":[],"employees":[],"requests":[]}');
  const [generatedLink, setGeneratedLink] = useState('');

  // --- Lógica de Dashboard (useMemo) ---
  const dashboardData = useMemo(() => {
    const approved = requests.filter(r => r.status === RequestStatus.APROVADO);
    
    // Total Geral Gasto
    const totalSpent = approved.reduce((acc, curr) => acc + curr.calculatedValue, 0);
    
    // Dados por Setor
    const expensesBySector = sectors.map(sector => {
      const value = approved
        .filter(r => r.sectorId === sector.id)
        .reduce((acc, curr) => acc + curr.calculatedValue, 0);
      return { name: sector.name, value };
    }).filter(item => item.value > 0).sort((a, b) => b.value - a.value);

    // Dados por Tipo (Registrado vs Fixo)
    const expensesByType = [
      { 
        name: 'Registrado', 
        value: approved.filter(r => r.employeeType === EmployeeType.REGISTRADO).reduce((acc, curr) => acc + curr.calculatedValue, 0),
        color: '#2563eb' // Blue-600
      },
      { 
        name: 'Fixo', 
        value: approved.filter(r => r.employeeType === EmployeeType.FIXO).reduce((acc, curr) => acc + curr.calculatedValue, 0),
        color: '#16a34a' // Green-600
      }
    ].filter(i => i.value > 0);

    return { totalSpent, expensesBySector, expensesByType, approvedCount: approved.length };
  }, [requests, sectors]);

  // --- Lógica de Sincronização de Dados ---

  const loadDatabase = useCallback(async (urlToUse?: string) => {
    const targetUrl = urlToUse || dbUrl;
    if (!targetUrl) return;

    setIsSyncing(true);
    try {
      // ADICIONADO: cache: 'no-store' para forçar o celular a não usar cache antigo
      const response = await fetch(targetUrl, { cache: 'no-store' });
      
      // Se a resposta não for ok (ex: 404, 500) ou se for HTML (página de erro do Google)
      const contentType = response.headers.get("content-type");
      if (!response.ok || (contentType && contentType.includes("text/html"))) {
        throw new Error("O Google Apps Script não está configurado corretamente (função doGet não encontrada ou não atualizada).");
      }

      const data = await response.json();
      
      if (data && !data.error) {
        setSectors(data.sectors || []);
        setEmployees(data.employees || []);
        setRequests(data.requests || []);
        if (urlToUse) setDbUrl(urlToUse);
        
        lastSyncedDataRef.current = JSON.stringify({
          sectors: data.sectors || [],
          employees: data.employees || [],
          requests: data.requests || []
        });

        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          sectors: data.sectors || [],
          employees: data.employees || [],
          requests: data.requests || [],
          dbUrl: targetUrl,
          folderRegId,
          folderFixoId
        }));
      } else if (data && data.error) {
        throw new Error(data.error);
      }
    } catch (error: any) {
      // Fallback para localStorage
      const localData = localStorage.getItem(STORAGE_KEY);
      if (localData) {
        try {
          const parsed = JSON.parse(localData);
          setSectors(parsed.sectors || []);
          setEmployees(parsed.employees || []);
          setRequests(parsed.requests || []);
          if (parsed.dbUrl) setDbUrl(parsed.dbUrl);
          if (parsed.folderRegId) setFolderRegId(parsed.folderRegId);
          if (parsed.folderFixoId) setFolderFixoId(parsed.folderFixoId);
          
          lastSyncedDataRef.current = JSON.stringify({
            sectors: parsed.sectors || [],
            employees: parsed.employees || [],
            requests: parsed.requests || []
          });
        } catch (e) {
          // Ignora erro de parse local
        }
      }
    } finally {
      setIsSyncing(false);
      setIsInitialLoad(false);
    }
  }, [dbUrl, folderRegId, folderFixoId]);
  
  const exportToPDF = async () => {
    if (!dbUrl) {
      alert("Configure a URL do Apps Script primeiro.");
      return;
    }
    
    setIsSyncing(true);
    try {
      const response = await fetch(dbUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        redirect: 'follow',
        body: JSON.stringify({
          action: "EXPORT_PDF",
          data: {
            folderRegId,
            folderFixoId
          }
        }),
      });
      
      const result = await response.json();
      if (result.success) {
        alert("Fichas exportadas com sucesso!");
      } else {
        alert("Erro ao exportar: " + result.error);
      }
    } catch (error) {
      console.error("Erro na exportação:", error);
      alert("Erro ao comunicar com o servidor.");
    } finally {
      setIsSyncing(false);
    }
  };

  const syncDatabase = useCallback(async (currentData: { sectors: Sector[], employees: Employee[], requests: TimeRequest[] }) => {
    if (!dbUrl) return;

    setIsSyncing(true);
    
    const flattenedRequests = currentData.requests.flatMap(req => 
      req.records.map(rec => ({
        id_solicitacao: req.id,
        funcionario: req.employeeName,
        tipo: req.employeeType,
        setor: req.sectorName,
        data_semana: req.weekStarting,
        status: req.status,
        valor_total_pedido: req.calculatedValue,
        data_registro: rec.date,
        entrada_real: rec.realEntry,
        entrada_ponto: rec.punchEntry,
        saida_ponto: rec.punchExit,
        saida_real: rec.realExit,
        folga_vendida: rec.isFolgaVendida ? "SIM" : "NÃO",
        criado_em: req.createdAt,
        justificativa_edicao: req.editJustification || ''
      }))
    );

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...currentData, dbUrl, folderRegId, folderFixoId }));
      await fetch(dbUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        redirect: 'follow',
        body: JSON.stringify({
          action: "SYNC_DATABASE",
          data: {
            sectors: currentData.sectors,
            employees: currentData.employees,
            requests: currentData.requests,
            flattenedRequests,
            folderRegId,
            folderFixoId
          }
        }),
      });
    } catch (error) {
      // Falha silenciosa na sincronização, dados já estão no localStorage
    } finally {
      setIsSyncing(false);
    }
  }, [dbUrl, folderRegId, folderFixoId]);

  useEffect(() => {
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const token = params.get('t');

    if (token) {
      const timestamp = parseInt(token, 10);
      const now = Date.now();
      if (isNaN(timestamp) || (now - timestamp > 24 * 60 * 60 * 1000)) {
        setState(prev => ({ ...prev, view: 'EXPIRED' }));
        return;
      }
    }
    
    const localData = localStorage.getItem(STORAGE_KEY);
    let initialUrl = DEFAULT_SHEET_URL;
    if (localData) {
      try {
        const parsed = JSON.parse(localData);
        if (parsed.dbUrl) {
          initialUrl = parsed.dbUrl;
          setDbUrl(parsed.dbUrl);
        }
        if (parsed.folderRegId) setFolderRegId(parsed.folderRegId);
        if (parsed.folderFixoId) setFolderFixoId(parsed.folderFixoId);
      } catch (e) {}
    }
    
    loadDatabase(initialUrl);
  }, [loadDatabase]);

  useEffect(() => {
    if (!isInitialLoad && state.view !== 'EXPIRED') {
      const currentDataString = JSON.stringify({ sectors, employees, requests });
      if (currentDataString !== lastSyncedDataRef.current) {
        const timer = setTimeout(() => {
          syncDatabase({ sectors, employees, requests });
          lastSyncedDataRef.current = currentDataString;
        }, 1500);
        return () => clearTimeout(timer);
      }
    }
  }, [sectors, employees, requests, isInitialLoad, syncDatabase, state.view]);

  useEffect(() => {
    if (showFormModal && !editingRequestId) {
      const weekDays = getWeekDays(new Date(currentWeek));
      setModalRecords(weekDays.map(date => ({
        date, realEntry: '', punchEntry: '', punchExit: '', realExit: '', isFolgaVendida: false
      })));
    }
  }, [showFormModal, currentWeek, editingRequestId]);

  useEffect(() => {
    if (!isInitialLoad) {
      const currentData = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        ...currentData,
        dbUrl,
        folderRegId,
        folderFixoId
      }));
    }
  }, [dbUrl, folderRegId, folderFixoId, isInitialLoad]);

  // --- Handlers ---
  const handleAdminLogin = () => {
    if (adminPassword === '123') {
      setIsAuth(true);
      setState(prev => ({ ...prev, view: 'ADMIN' }));
      setAdminPassword('');
    } else {
      alert('Senha incorreta!');
    }
  };

  const generateAccessLink = () => {
    const timestamp = Date.now();
    const link = `${window.location.origin}${window.location.pathname}?t=${timestamp}`;
    setGeneratedLink(link);
    navigator.clipboard.writeText(link);
    alert('Link de acesso válido por 24h copiado!');
  };

  const submitRequest = () => {
    let targetEmployeeId = selectedEmployee;
    let targetSectorId = selectedSector;
    let targetFlowType = state.flowType;

    if (editingRequestId) {
      const originalReq = requests.find(r => r.id === editingRequestId);
      if (originalReq) {
        targetEmployeeId = originalReq.employeeId;
        targetSectorId = originalReq.sectorId;
        targetFlowType = originalReq.employeeType;
      }
    }

    const employee = employees.find(e => String(e.id) === String(targetEmployeeId));
    const sector = sectors.find(s => String(s.id) === String(employee?.sectorId || targetSectorId));
    
    if (targetFlowType === EmployeeType.REGISTRADO && !employee) {
      alert("Erro: Dados do funcionário não encontrados para recálculo.");
      return;
    }

    let totalDiffHours = 0;
    let totalPayment = 0;

    if (targetFlowType === EmployeeType.REGISTRADO && employee) {
      const hourlyBase = (employee.salary / employee.monthlyHours);
      const overtimeRate = hourlyBase * 1.25;
      
      modalRecords.forEach(r => {
        let dailyHours = 0;

        if (r.isFolgaVendida) {
          if (r.realEntry && r.realExit) {
             const start = timeToDecimal(r.realEntry);
             const end = timeToDecimal(r.realExit);
             let diff = end - start;
             if (diff < 0) diff += 24;
             dailyHours += diff;
          }
        } else {
          if (r.realEntry && r.punchEntry) {
            const real = timeToDecimal(r.realEntry);
            const punch = timeToDecimal(r.punchEntry);
            if (real < punch) {
              dailyHours += (punch - real);
            }
          }
          if (r.realExit && r.punchExit) {
            const real = timeToDecimal(r.realExit);
            const punch = timeToDecimal(r.punchExit);
            if (real > punch) {
              dailyHours += (real - punch);
            }
          }
        }
        totalDiffHours += dailyHours;
      });
      totalPayment = totalDiffHours * overtimeRate;
    } else {
      const hourlyRate = sector?.fixedRate || 0;
      modalRecords.forEach(r => { 
        if (r.realEntry && r.realExit) {
          const start = timeToDecimal(r.realEntry);
          const end = timeToDecimal(r.realExit);
          let dailyHours = end - start;
          if (dailyHours < 0) dailyHours += 24;
          if (dailyHours > 0) {
            totalPayment += (dailyHours * hourlyRate) + 12;
            totalDiffHours += dailyHours;
          }
        }
      });
    }

    if (editingRequestId) {
      setRequests(requests.map(r => r.id === editingRequestId ? {
        ...r, 
        records: modalRecords, 
        calculatedValue: totalPayment, 
        totalTimeDecimal: totalDiffHours,
        editJustification 
      } : r));
      setEditingRequestId(null);
      setEditJustification('');
    } else {
      const newReq: TimeRequest = {
        id: Math.random().toString(36).substr(2, 9),
        employeeId: employee?.id || 'fixo-' + Date.now(),
        employeeName: employee?.name || selectedEmployee || 'Colaborador Fixo',
        employeeType: targetFlowType!,
        sectorId: sector?.id || '',
        sectorName: sector?.name || '',
        weekStarting: currentWeek,
        records: modalRecords,
        status: RequestStatus.PENDENTE,
        calculatedValue: totalPayment,
        totalTimeDecimal: totalDiffHours,
        createdAt: new Date().toISOString()
      };
      setRequests([newReq, ...requests]);
      setState(prev => ({ ...prev, view: 'SUCCESS' }));
    }
    setShowFormModal(false);
  };

  // --- UI Components ---

  const RequestCard: React.FC<{ req: TimeRequest }> = ({ req }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    const getDailyHours = (r: TimeRecord, type: EmployeeType) => {
        let total = 0;
        if (type === EmployeeType.FIXO) {
            if (r.realEntry && r.realExit) {
                let diff = timeToDecimal(r.realExit) - timeToDecimal(r.realEntry);
                if (diff < 0) diff += 24;
                total = diff;
            }
        } else {
            if (r.isFolgaVendida) {
                 if (r.realEntry && r.realExit) {
                    let diff = timeToDecimal(r.realExit) - timeToDecimal(r.realEntry);
                    if (diff < 0) diff += 24;
                    total = diff;
                 }
            } else {
                 if (r.realEntry && r.punchEntry) {
                    const diff = timeToDecimal(r.punchEntry) - timeToDecimal(r.realEntry);
                    if(diff > 0) total += diff;
                 }
                 if (r.realExit && r.punchExit) {
                    const diff = timeToDecimal(r.realExit) - timeToDecimal(r.punchExit);
                    if(diff > 0) total += diff;
                 }
            }
        }
        return total > 0 ? formatDecimalHours(total) : '-';
    };

    return (
      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition mb-3 group">
        <div className="flex justify-between items-start mb-2">
          <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${req.employeeType === EmployeeType.REGISTRADO ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
            {req.employeeType}
          </span>
          <div className="text-right">
            <p className="text-[10px] text-gray-500 font-bold mb-0.5">{formatDecimalHours(req.totalTimeDecimal)}</p>
            <p className="text-sm font-black text-gray-900">{formatCurrency(req.calculatedValue)}</p>
          </div>
        </div>
        <h4 className="text-sm font-bold text-gray-800 line-clamp-1">{req.employeeName}</h4>
        <p className="text-[10px] text-gray-400 mb-3">{req.sectorName} • Sem: {new Date(req.weekStarting).toLocaleDateString('pt-BR')}</p>
        
        {isExpanded && (
            <div className="mt-2 mb-4 bg-gray-50 rounded-xl p-2 overflow-x-auto">
                <table className="w-full text-[10px] text-left">
                    <thead>
                        <tr className="text-gray-400 border-b border-gray-200">
                            <th className="pb-1 font-semibold">Dia</th>
                            <th className="pb-1 font-semibold">Ent.</th>
                            <th className="pb-1 font-semibold text-gray-300">P.Ent</th>
                            <th className="pb-1 font-semibold text-gray-300">P.Sai</th>
                            <th className="pb-1 font-semibold">Sai.</th>
                            <th className="pb-1 font-semibold text-right">H.</th>
                        </tr>
                    </thead>
                    <tbody>
                        {req.records.map((r, idx) => (
                            <tr key={idx} className={`border-b border-gray-100 last:border-0 ${r.isFolgaVendida ? 'bg-blue-50/50' : ''}`}>
                                <td className="py-1.5 font-bold text-gray-600">
                                    {new Date(r.date + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'short' }).slice(0,3)}
                                    {r.isFolgaVendida && <span className="block text-[8px] text-blue-600 font-black">FOLGA</span>}
                                </td>
                                <td className="py-1.5 text-gray-700">{r.realEntry || '-'}</td>
                                <td className="py-1.5 text-gray-400">{r.punchEntry || '-'}</td>
                                <td className="py-1.5 text-gray-400">{r.punchExit || '-'}</td>
                                <td className="py-1.5 text-gray-700">{r.realExit || '-'}</td>
                                <td className="py-1.5 text-right font-bold text-gray-800">{getDailyHours(r, req.employeeType)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )}

        <div className="flex gap-1 items-center">
            <button 
                onClick={() => setIsExpanded(!isExpanded)} 
                className="bg-gray-50 text-gray-400 p-2 rounded-lg hover:bg-gray-100 transition mr-1"
                title="Ver Detalhes"
            >
                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

          {req.status === RequestStatus.PENDENTE && (
            <>
              <button onClick={() => setRequests(requests.map(r => r.id === req.id ? {...r, status: RequestStatus.APROVADO} : r))} className="flex-1 bg-green-50 text-green-600 p-2 rounded-lg hover:bg-green-600 hover:text-white transition flex justify-center"><CheckCircle className="w-4 h-4" /></button>
              <button onClick={() => setRequests(requests.map(r => r.id === req.id ? {...r, status: RequestStatus.REJEITADO} : r))} className="flex-1 bg-red-50 text-red-600 p-2 rounded-lg hover:bg-red-600 hover:text-white transition flex justify-center"><XCircle className="w-4 h-4" /></button>
            </>
          )}
          <button onClick={() => {
            setEditingRequestId(req.id);
            setModalRecords(JSON.parse(JSON.stringify(req.records)));
            setCurrentWeek(req.weekStarting);
            setEditJustification(req.editJustification || '');
            setShowFormModal(true);
          }} className="flex-1 bg-gray-50 text-gray-400 p-2 rounded-lg hover:bg-gray-200 transition flex justify-center"><Edit2 className="w-4 h-4" /></button>
          <button onClick={() => setRequests(requests.filter(r => r.id !== req.id))} className="bg-gray-50 text-gray-300 p-2 rounded-lg hover:bg-red-50 hover:text-red-400 transition flex justify-center"><XCircle className="w-4 h-4" /></button>
        </div>
      </div>
    );
  };

  const renderAdminRequestsSubView = () => (
    <div className="h-full flex flex-col gap-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-6 rounded-3xl shadow-sm border border-gray-100 gap-4">
        <h2 className="text-xl md:text-2xl font-black text-gray-800">Fluxo de Solicitações</h2>
        <button onClick={() => syncDatabase({ sectors, employees, requests })} className="w-full md:w-auto flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-3 rounded-xl text-sm font-bold shadow-lg shadow-blue-100 active:scale-95 transition-transform"><RefreshCw className="w-4 h-4" /> Forçar Sincronização</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0 pb-20 md:pb-0">
        {[
            { title: 'Pendentes', status: RequestStatus.PENDENTE, icon: Clock, color: 'blue' },
            { title: 'Aprovados', status: RequestStatus.APROVADO, icon: CheckCircle, color: 'green' },
            { title: 'Rejeitados', status: RequestStatus.REJEITADO, icon: XCircle, color: 'red' }
        ].map((col) => (
            <div key={col.status} className={`flex flex-col rounded-3xl p-4 border ${col.color === 'blue' ? 'bg-gray-100/50 border-gray-200/50' : col.color === 'green' ? 'bg-green-50/30 border-green-100/50' : 'bg-red-50/30 border-red-100/50'}`}>
                <div className="flex items-center justify-between mb-4 px-2">
                    <h3 className={`text-sm font-black uppercase flex items-center gap-2 text-${col.color}-600`}>
                        <col.icon className="w-4 h-4" /> {col.title}
                    </h3>
                    <span className={`bg-${col.color}-100 text-${col.color}-700 text-[10px] px-2 py-0.5 rounded-full font-bold`}>
                        {requests.filter(r => r.status === col.status).length}
                    </span>
                </div>
                <div className="flex-1 overflow-y-auto pr-1">
                    {requests.filter(r => r.status === col.status).map(req => <RequestCard key={req.id} req={req} />)}
                </div>
            </div>
        ))}
      </div>
    </div>
  );

  // --- Renderização Principal ---

  if (state.view === 'EXPIRED') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen text-center px-4 bg-gray-100">
        <div className="bg-white p-12 rounded-3xl shadow-2xl max-w-lg w-full">
          <div className="bg-red-100 w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-8 text-red-600"><Lock className="w-10 h-10" /></div>
          <h1 className="text-3xl font-bold mb-4">Acesso Expirado</h1>
          <p className="text-gray-500 mb-8">Este link expirou. Peça um novo acesso.</p>
          <button onClick={() => window.location.href = window.location.origin + window.location.pathname} className="bg-gray-800 text-white px-8 py-3 rounded-xl font-bold">Início</button>
        </div>
      </div>
    );
  }

  // Admin Navigation Items
  const navItems = [
    { id: 'DASHBOARD', label: 'Dash', icon: LayoutDashboard },
    { id: 'SECTORS', label: 'Setores', icon: MapPin },
    { id: 'EMPLOYEES', label: 'Func.', icon: Users },
    { id: 'REQUESTS', label: 'Solicit.', icon: ClipboardList },
    { id: 'INTEGRATIONS', label: 'Sync', icon: Database },
  ];

const appsScriptCode = `/**
 * SISTEMA INTEGRADO DE GESTÃO DE HE (PLANILHA + APP REACT)
 * Versão Definitiva (Com leitura bidirecional, NoSQL e Datas Dinâmicas)
 */

const CONFIG = {
  PASTA_REGISTRADO_ID: "${folderRegId}",
  PASTA_FIXO_ID: "${folderFixoId}"
};

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('⚙️ Sistema HE')
    .addItem('Ativar Automação (Ao Editar)', 'configuringGatilhoEdicao')
    .addSeparator()
    .addItem('🚀 Exportar Fichas Agora (Manual)', 'exportarFolhasSextaFeira')
    .addItem('🛑 FECHAMENTO SEMANAL', 'executarFechamentoSemanal')
    .addToUi();
}

function getSegundaFeiraAtual() {
  const hoje = new Date();
  const diaSemana = hoje.getDay();
  const diff = diaSemana === 0 ? -6 : 1 - diaSemana;
  const segunda = new Date(hoje.setDate(hoje.getDate() + diff));
  return Utilities.formatDate(segunda, Session.getScriptTimeZone(), "yyyy-MM-dd");
}

function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const db = {
    sectors: lerAbaDB(ss, "Setores_DB"),
    employees: lerAbaDB(ss, "Funcionarios_DB"),
    requests: lerSolicitacoes(ss)
  };
  return ContentService.createTextOutput(JSON.stringify(db)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const contents = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    if (contents.action === "SYNC_DATABASE") {
      const incomingData = contents.data;
      salvarAbaDB(ss, "Setores_DB", incomingData.sectors);
      salvarAbaDB(ss, "Funcionarios_DB", incomingData.employees);
      
      let solicitacoesAtuais = lerSolicitacoes(ss);
      let mapAtuais = new Map(solicitacoesAtuais.map(r => [r.id, r]));
      
      if (incomingData.requests && incomingData.requests.length > 0) {
        incomingData.requests.forEach(novaReq => { mapAtuais.set(novaReq.id, novaReq); });
      }
      
      let solicitacoesMescladas = Array.from(mapAtuais.values());
      salvarSolicitacoes(ss, solicitacoesMescladas);
      processarHEsAprovadas(ss, solicitacoesMescladas);
      
      return ContentService.createTextOutput(JSON.stringify({"status": "success"})).setMimeType(ContentService.MimeType.JSON);
    }
    return ContentService.createTextOutput(JSON.stringify({"status": "ignored"})).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({"status": "error", "message": err.toString()})).setMimeType(ContentService.MimeType.JSON);
  }
}

// Para manter o App enxuto, o restante do código foi abstraído desta view,
// mas a cópia completa está na documentação do projeto.
`;

  return (
    <div className="min-h-screen">
      {state.view === 'HOME' && (
        <div className="flex flex-col items-center justify-center min-h-[80vh] text-center px-4">
          <div className="bg-white p-8 md:p-12 rounded-3xl shadow-2xl max-w-lg w-full transform transition hover:scale-105 duration-300">
            <div className="bg-blue-600 w-16 h-16 md:w-20 md:h-20 rounded-2xl flex items-center justify-center mx-auto mb-8 shadow-lg shadow-blue-200"><ClipboardList className="text-white w-8 h-8 md:w-10 md:h-10" /></div>
            <h1 className="text-3xl md:text-4xl font-extrabold text-gray-800 mb-4">Controle de Horas</h1>
            <p className="text-gray-500 mb-10 text-base md:text-lg">Gerenciamento eficiente de jornadas semanais.</p>
            <button onClick={() => setState(prev => ({ ...prev, view: 'SELECTION' }))} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-8 rounded-xl transition shadow-xl shadow-blue-100 flex items-center justify-center gap-3 group text-lg">
              Começar <Play className="w-5 h-5 group-hover:translate-x-1 transition" />
            </button>
            <div className="mt-8 pt-8 border-t border-gray-100 relative">
              <input type="password" placeholder="Acesso Admin" className="w-full pl-12 pr-4 py-4 bg-gray-50 border border-gray-200 rounded-xl outline-none text-black focus:bg-white focus:border-blue-500 transition text-base" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleAdminLogin()} />
              <Settings className="absolute left-4 top-[70%] -translate-y-1/2 text-gray-400 w-5 h-5" />
            </div>
          </div>
        </div>
      )}

      {state.view === 'SELECTION' && (
        <div className="flex flex-col items-center justify-center min-h-[80vh] px-4">
          <button onClick={() => setState(prev => ({ ...prev, view: 'HOME' }))} className="mb-8 flex items-center gap-2 text-gray-500 hover:text-blue-600 transition font-medium p-2"><ArrowLeft className="w-5 h-5" /> Voltar</button>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 max-w-4xl w-full">
            <button onClick={() => setState(prev => ({ ...prev, view: 'FLOW', flowType: EmployeeType.REGISTRADO }))} className="bg-white p-8 md:p-10 rounded-3xl shadow-xl hover:border-blue-500 border-2 border-transparent transition-all group text-left flex flex-row md:flex-col items-center md:items-start gap-6 md:gap-0">
              <div className="bg-blue-50 w-14 h-14 md:w-16 md:h-16 rounded-2xl flex items-center justify-center md:mb-6 group-hover:bg-blue-600 transition shrink-0"><Users className="text-blue-600 w-7 h-7 md:w-8 md:h-8 group-hover:text-white transition" /></div>
              <h2 className="text-xl md:text-2xl font-bold">Registrado</h2>
            </button>
            <button onClick={() => setState(prev => ({ ...prev, view: 'FLOW', flowType: EmployeeType.FIXO }))} className="bg-white p-8 md:p-10 rounded-3xl shadow-xl hover:border-green-500 border-2 border-transparent transition-all group text-left flex flex-row md:flex-col items-center md:items-start gap-6 md:gap-0">
              <div className="bg-green-50 w-14 h-14 md:w-16 md:h-16 rounded-2xl flex items-center justify-center md:mb-6 group-hover:bg-green-600 transition shrink-0"><MapPin className="text-green-600 w-7 h-7 md:w-8 md:h-8 group-hover:text-white transition" /></div>
              <h2 className="text-xl md:text-2xl font-bold">Fixo</h2>
            </button>
          </div>
        </div>
      )}

      {state.view === 'FLOW' && (
        <div className="max-w-xl mx-auto py-8 px-4">
          <button onClick={() => setState(prev => ({ ...prev, view: 'SELECTION' }))} className="mb-6 flex items-center gap-2 text-gray-500 font-medium p-2"><ArrowLeft className="w-5 h-5" /> Voltar</button>
          <div className="bg-white rounded-3xl shadow-xl p-6 md:p-8 space-y-6 md:space-y-8">
            <h2 className="text-2xl font-bold text-gray-800 border-b pb-4">{state.flowType}</h2>
            <div>
              <label className="block text-sm font-semibold mb-2">Setor</label>
              <select className="w-full p-4 border rounded-xl bg-gray-50 text-black text-base focus:bg-white focus:border-blue-500 outline-none transition" value={selectedSector} onChange={(e) => setSelectedSector(e.target.value)}>
                <option value="">Selecione...</option>
                {sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            {selectedSector && (
              <div>
                <label className="block text-sm font-semibold mb-2">Funcionário</label>
                {state.flowType === EmployeeType.REGISTRADO ? (
                  <select className="w-full p-4 border rounded-xl bg-gray-50 text-black text-base focus:bg-white focus:border-blue-500 outline-none transition" value={selectedEmployee} onChange={(e) => setSelectedEmployee(e.target.value)}>
                    <option value="">Selecione...</option>
                    {employees.filter(e => String(e.sectorId) === String(selectedSector) && e.type === state.flowType).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                ) : (
                  <input type="text" placeholder="Nome" className="w-full p-4 border rounded-xl bg-gray-50 text-black text-base focus:bg-white focus:border-blue-500 outline-none transition" value={selectedEmployee} onChange={(e) => setSelectedEmployee(e.target.value)} />
                )}
              </div>
            )}
            <button disabled={!selectedSector || !selectedEmployee} onClick={() => setShowFormModal(true)} className="w-full bg-blue-600 disabled:bg-gray-300 text-white font-bold py-4 rounded-xl shadow-lg active:scale-95 transition text-lg">Lançar Horários</button>
          </div>
        </div>
      )}

      {state.view === 'SUCCESS' && (
        <div className="flex flex-col items-center justify-center min-h-[80vh] text-center px-4">
          <div className="bg-white p-8 md:p-12 rounded-3xl shadow-2xl max-w-lg w-full transform transition hover:scale-105 duration-300">
            <div className="bg-green-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-8 shadow-lg shadow-green-100">
              <CheckCircle className="text-green-600 w-10 h-10" />
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold text-gray-800 mb-4">Ok, registrado!</h1>
            <p className="text-gray-500 mb-10 text-base md:text-lg">Muito obrigado pelo preenchimento.</p>
            <button 
              onClick={() => setState(prev => ({ ...prev, view: 'HOME' }))} 
              className="w-full bg-gray-800 hover:bg-gray-900 text-white font-bold py-4 px-8 rounded-xl transition shadow-xl flex items-center justify-center gap-3 text-lg"
            >
              Sair
            </button>
          </div>
        </div>
      )}

      {state.view === 'ADMIN' && (
        <div className="flex flex-col md:flex-row h-screen bg-gray-50 overflow-hidden">
          {/* Desktop Sidebar */}
          <div className="hidden md:flex w-72 bg-white border-r border-gray-100 flex-col p-6 shadow-sm z-20">
            <div className="flex items-center gap-3 mb-12"><div className="bg-blue-600 p-2 rounded-lg text-white"><Settings className="w-5 h-5" /></div><h2 className="text-xl font-black">Admin</h2></div>
            <nav className="flex-1 space-y-2">
              {navItems.map(item => (
                <button key={item.id} onClick={() => setState(prev => ({ ...prev, adminSubView: item.id as any }))} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all ${state.adminSubView === item.id ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-500 hover:bg-gray-50'}`}>
                  <item.icon className="w-5 h-5" />{item.label}
                </button>
              ))}
            </nav>
            <button onClick={() => { setIsAuth(false); setState(prev => ({ ...prev, view: 'HOME' })) }} className="flex items-center gap-3 px-4 py-3 text-red-500 font-bold hover:bg-red-50 rounded-xl transition mt-auto"><LogOut className="w-5 h-5" /> Sair</button>
          </div>

          {/* Mobile Bottom Nav */}
          <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex justify-around p-2 z-50 safe-area-bottom">
            {navItems.map(item => (
                <button key={item.id} onClick={() => setState(prev => ({ ...prev, adminSubView: item.id as any }))} className={`flex flex-col items-center justify-center p-2 rounded-xl transition-all ${state.adminSubView === item.id ? 'text-blue-600' : 'text-gray-400'}`}>
                    <item.icon className={`w-6 h-6 mb-1 ${state.adminSubView === item.id ? 'fill-current' : ''}`} />
                    <span className="text-[10px] font-bold">{item.label}</span>
                </button>
            ))}
            <button onClick={() => { setIsAuth(false); setState(prev => ({ ...prev, view: 'HOME' })) }} className="flex flex-col items-center justify-center p-2 text-red-400">
                <LogOut className="w-6 h-6 mb-1" />
                <span className="text-[10px] font-bold">Sair</span>
            </button>
          </div>

          {/* Main Content */}
          <div className="flex-1 overflow-y-auto p-4 md:p-10 relative pb-24 md:pb-10">
            {isSyncing && <div className="absolute top-4 right-4 md:top-10 md:right-10 flex items-center gap-2 text-blue-600 font-bold text-xs md:text-sm bg-blue-50 px-3 py-1 md:px-4 md:py-2 rounded-full border border-blue-100 z-10"><RefreshCw className="w-3 h-3 md:w-4 md:h-4 animate-spin" /> Atualizando...</div>}
            
            {state.adminSubView === 'DASHBOARD' && (
              <div className="space-y-6 md:space-y-8">
                {/* Cards de Resumo */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                  {[
                      { label: 'Total Gasto', val: formatCurrency(dashboardData.totalSpent), icon: DollarSign, color: 'text-gray-800' },
                      { label: 'Aprovadas', val: dashboardData.approvedCount, icon: CheckCircle, color: 'text-green-600' },
                      { label: 'Pendentes', val: requests.filter(r => r.status === RequestStatus.PENDENTE).length, icon: Clock, color: 'text-blue-600' },
                      { label: 'Ticket Médio', val: dashboardData.approvedCount > 0 ? formatCurrency(dashboardData.totalSpent / dashboardData.approvedCount) : 'R$ 0,00', icon: TrendingUp, color: 'text-purple-600' }
                  ].map((stat, i) => (
                      <div key={i} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                        <div className="flex items-center gap-2 text-gray-400 mb-2">
                            <stat.icon className="w-4 h-4" />
                            <span className="text-xs font-bold uppercase">{stat.label}</span>
                        </div>
                        <h3 className={`text-2xl font-black ${stat.color}`}>{stat.val}</h3>
                      </div>
                  ))}
                </div>

                {/* Gráficos */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white p-6 md:p-8 rounded-3xl border border-gray-100 shadow-sm flex flex-col min-h-[400px]">
                        <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
                            <MapPin className="w-5 h-5 text-blue-600" />
                            Gastos por Setor
                        </h3>
                        <div className="flex-1">
                            {dashboardData.expensesBySector.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={dashboardData.expensesBySector} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
                                        <XAxis type="number" hide />
                                        <YAxis dataKey="name" type="category" width={80} tick={{fontSize: 10, fill: '#6b7280'}} />
                                        <Tooltip cursor={{fill: '#f3f4f6'}} />
                                        <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={24}>
                                            {dashboardData.expensesBySector.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-gray-300"><AlertCircle className="w-10 h-10 mb-2" /><p className="text-sm">Sem dados</p></div>
                            )}
                        </div>
                    </div>

                    <div className="bg-white p-6 md:p-8 rounded-3xl border border-gray-100 shadow-sm flex flex-col min-h-[400px]">
                        <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
                            <Users className="w-5 h-5 text-green-600" />
                            Registrado vs Fixo
                        </h3>
                        <div className="flex-1">
                            {dashboardData.expensesByType.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={dashboardData.expensesByType} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value">
                                            {dashboardData.expensesByType.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                                        </Pie>
                                        <Tooltip />
                                        <Legend verticalAlign="bottom" height={36} iconType="circle" />
                                    </PieChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-gray-300"><AlertCircle className="w-10 h-10 mb-2" /><p className="text-sm">Sem dados</p></div>
                            )}
                        </div>
                    </div>
                </div>
              </div>
            )}

            {state.adminSubView === 'REQUESTS' && renderAdminRequestsSubView()}

            {state.adminSubView === 'SECTORS' && (
              <div className="bg-white p-6 md:p-8 rounded-3xl border border-gray-100 space-y-8">
                <h2 className="text-2xl font-bold">Setores</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-gray-50 p-6 rounded-2xl">
                  <input type="text" placeholder="Nome" className="p-4 border rounded-xl bg-white text-black text-base" value={newSec.name} onChange={(e) => setNewSec({ ...newSec, name: e.target.value })} />
                  <input type="number" placeholder="Valor Hora" className="p-4 border rounded-xl bg-white text-black text-base" value={newSec.fixedRate || ''} onChange={(e) => setNewSec({ ...newSec, fixedRate: parseFloat(e.target.value) })} />
                  <button onClick={() => { if(newSec.name) { setSectors([...sectors, {...newSec, id: Date.now().toString()}]); setNewSec({name: '', fixedRate: 0}); } }} className="bg-blue-600 text-white font-bold rounded-xl py-3 active:scale-95 transition">Adicionar</button>
                </div>
                {/* Responsive List: Card on Mobile, Table on Desktop */}
                <div className="hidden md:block">
                    <table className="w-full text-left"><thead><tr className="text-gray-400 text-xs border-b"><th className="py-4">Setor</th><th className="py-4">Valor Hora</th><th className="py-4 text-right">Ação</th></tr></thead><tbody>{sectors.map(s => (<tr key={s.id} className="border-b"><td className="py-4 font-semibold">{s.name}</td><td className="py-4">{formatCurrency(s.fixedRate)}</td><td className="py-4 text-right"><button onClick={() => setSectors(sectors.filter(sec => sec.id !== s.id))} className="text-red-500"><XCircle className="w-5 h-4" /></button></td></tr>))}</tbody></table>
                </div>
                <div className="md:hidden space-y-3">
                    {sectors.map(s => (
                        <div key={s.id} className="bg-gray-50 p-4 rounded-xl flex justify-between items-center border border-gray-100">
                            <div>
                                <h4 className="font-bold text-gray-800">{s.name}</h4>
                                <p className="text-sm text-gray-500">{formatCurrency(s.fixedRate)} / hora</p>
                            </div>
                            <button onClick={() => setSectors(sectors.filter(sec => sec.id !== s.id))} className="text-red-500 p-2"><XCircle className="w-6 h-6" /></button>
                        </div>
                    ))}
                </div>
              </div>
            )}

            {state.adminSubView === 'EMPLOYEES' && (
              <div className="bg-white p-6 md:p-8 rounded-3xl border border-gray-100 space-y-8">
                <h2 className="text-2xl font-bold">Funcionários</h2>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4 bg-gray-50 p-6 rounded-2xl">
                  <input type="text" placeholder="Nome" className="p-4 border rounded-xl bg-white text-black text-base" value={newEmpData.name} onChange={(e) => setNewEmpData({ ...newEmpData, name: e.target.value })} />
                  <select className="p-4 border rounded-xl bg-white text-black text-base" value={newEmpData.sectorId} onChange={(e) => setNewEmpData({ ...newEmpData, sectorId: e.target.value })}><option value="">Setor...</option>{sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
                  <input type="number" placeholder="Salário" className="p-4 border rounded-xl bg-white text-black text-base" value={newEmpData.salary || ''} onChange={(e) => setNewEmpData({ ...newEmpData, salary: parseFloat(e.target.value) })} />
                  <input type="number" placeholder="Horas" className="p-4 border rounded-xl bg-white text-black text-base" value={newEmpData.monthlyHours || ''} onChange={(e) => setNewEmpData({ ...newEmpData, monthlyHours: parseFloat(e.target.value) })} />
                  <div className="flex gap-2">
                    <button 
                      onClick={() => { 
                        if(newEmpData.name) { 
                          if (editingEmployeeId) {
                            setEmployees(employees.map(e => e.id === editingEmployeeId ? { ...e, ...newEmpData } : e));
                            setEditingEmployeeId(null);
                          } else {
                            setEmployees([...employees, {...newEmpData, id: Date.now().toString()}]); 
                          }
                          setNewEmpData({name: '', sectorId: '', salary: 0, monthlyHours: 220, type: EmployeeType.REGISTRADO}); 
                        } 
                      }} 
                      className={`${editingEmployeeId ? 'bg-green-600' : 'bg-blue-600'} text-white font-bold rounded-xl flex-1 py-3 active:scale-95 transition`}
                    >
                      {editingEmployeeId ? 'Salvar' : 'Add'}
                    </button>
                    {editingEmployeeId && (
                      <button onClick={() => { setEditingEmployeeId(null); setNewEmpData({name: '', sectorId: '', salary: 0, monthlyHours: 220, type: EmployeeType.REGISTRADO}); }} className="bg-gray-200 text-gray-600 font-bold rounded-xl px-3"><XCircle className="w-5 h-5" /></button>
                    )}
                  </div>
                </div>
                
                {/* Desktop View */}
                <div className="hidden md:block">
                    <table className="w-full text-left"><thead><tr className="border-b text-xs text-gray-400"><th className="py-4">Nome</th><th className="py-4">Setor</th><th className="py-4">Valor Hora (+25%)</th><th className="py-4 text-right">Ação</th></tr></thead><tbody>{employees.map(e => (<tr key={e.id} className="border-b"><td className="py-4">{e.name}</td><td className="py-4">{sectors.find(s => s.id === e.sectorId)?.name}</td><td className="py-4">{formatCurrency((e.salary / (e.monthlyHours || 1)) * 1.25)}</td><td className="py-4 text-right flex justify-end gap-2"><button onClick={() => { setEditingEmployeeId(e.id); setNewEmpData({ name: e.name, sectorId: e.sectorId, salary: e.salary, monthlyHours: e.monthlyHours, type: e.type }); }} className="text-blue-500"><Edit2 className="w-4 h-4" /></button><button onClick={() => setEmployees(employees.filter(emp => emp.id !== e.id))} className="text-red-400"><XCircle className="w-4 h-4" /></button></td></tr>))}</tbody></table>
                </div>

                {/* Mobile View */}
                <div className="md:hidden space-y-4">
                    {employees.map(e => (
                        <div key={e.id} className="bg-gray-50 p-4 rounded-xl border border-gray-100 flex flex-col gap-2">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h4 className="font-bold text-gray-800 text-lg">{e.name}</h4>
                                    <p className="text-xs text-gray-500 uppercase font-bold">{sectors.find(s => s.id === e.sectorId)?.name}</p>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => { setEditingEmployeeId(e.id); setNewEmpData({ name: e.name, sectorId: e.sectorId, salary: e.salary, monthlyHours: e.monthlyHours, type: e.type }); }} className="bg-white p-2 rounded-lg text-blue-600 border border-gray-200"><Edit2 className="w-5 h-5" /></button>
                                    <button onClick={() => setEmployees(employees.filter(emp => emp.id !== e.id))} className="bg-white p-2 rounded-lg text-red-500 border border-gray-200"><XCircle className="w-5 h-5" /></button>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="text-sm text-gray-600 bg-white px-2 py-1 rounded border">R$ {e.salary}</span>
                                <span className="text-sm text-gray-600 bg-white px-2 py-1 rounded border">{e.monthlyHours}h</span>
                                <span className="text-sm font-bold text-green-600 ml-auto">{formatCurrency((e.salary / (e.monthlyHours || 1)) * 1.25)}/h</span>
                            </div>
                        </div>
                    ))}
                </div>
              </div>
            )}

            {state.adminSubView === 'INTEGRATIONS' && (
              <div className="bg-white p-6 md:p-8 rounded-3xl border border-gray-100 space-y-8">
                <h2 className="text-2xl font-bold flex items-center gap-2"><Database className="text-blue-600" /> Sincronização</h2>
                <div className="p-6 md:p-8 border-2 border-dashed border-blue-200 rounded-3xl bg-blue-50/10 space-y-4">
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div><h3 className="text-xl font-bold text-gray-800">Link de Acesso (24h)</h3><p className="text-sm text-gray-500">Cria um link temporário para preenchimento externo.</p></div>
                    <button onClick={generateAccessLink} className="w-full md:w-auto bg-blue-600 text-white px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg hover:bg-blue-700 transition active:scale-95"><Share2 className="w-5 h-5" /> Gerar Link</button>
                  </div>
                  {generatedLink && <div className="flex items-center gap-2 bg-white p-4 rounded-xl border border-blue-100"><input readOnly value={generatedLink} className="flex-1 text-xs text-gray-400 bg-transparent outline-none font-mono" /><button onClick={() => { navigator.clipboard.writeText(generatedLink); alert('Copiado!'); }} className="text-blue-600 p-2"><Copy className="w-4 h-4" /></button></div>}
                </div>
                <div className="p-6 md:p-8 border border-gray-100 rounded-3xl bg-gray-50/50 space-y-4">
                  <h3 className="text-xl font-bold text-gray-800">Endpoint da Planilha</h3>
                  <p className="text-xs text-gray-400 flex items-center gap-2"><AlertCircle className="w-3 h-3" /> URL do Web App do Google Apps Script.</p>
                  <input type="text" className="w-full p-4 border rounded-xl bg-white text-black outline-none text-base" value={dbUrl} onChange={(e) => setDbUrl(e.target.value)} />
                  <div className="flex flex-col md:flex-row gap-3">
                    <button onClick={() => loadDatabase()} className="flex-1 bg-white border border-blue-600 text-blue-600 px-6 py-4 rounded-xl font-bold active:bg-blue-50 transition">Importar</button>
                    <button onClick={exportToPDF} className="flex-1 bg-blue-600 text-white px-8 py-4 rounded-xl font-bold shadow-lg active:scale-95 transition">Exportar</button>
                  </div>
                </div>

                <div className="p-6 md:p-8 border border-gray-100 rounded-3xl bg-gray-50/50 space-y-4">
                  <h3 className="text-xl font-bold text-gray-800">Configuração do Apps Script</h3>
                  <p className="text-xs text-gray-400">Insira os IDs das pastas do Google Drive onde as fichas serão salvas.</p>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-1">ID da Pasta (HE Registrado)</label>
                      <input type="text" className="w-full p-3 border rounded-xl bg-white text-black outline-none text-sm font-mono" value={folderRegId} onChange={(e) => { setFolderRegId(e.target.value); }} />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-1">ID da Pasta (HE Fixo)</label>
                      <input type="text" className="w-full p-3 border rounded-xl bg-white text-black outline-none text-sm font-mono" value={folderFixoId} onChange={(e) => { setFolderFixoId(e.target.value); }} />
                    </div>
                  </div>

                  <div className="mt-8">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-bold text-gray-800">Código do Apps Script</h4>
                      <button onClick={() => { navigator.clipboard.writeText(appsScriptCode); alert('Código copiado!'); }} className="text-blue-600 text-sm font-bold flex items-center gap-1 hover:text-blue-800"><Copy className="w-4 h-4" /> Copiar Código</button>
                    </div>
                    <div className="bg-gray-900 rounded-xl p-4 overflow-x-auto">
                      <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap">{appsScriptCode}</pre>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showFormModal && (
        <div className="fixed inset-0 bg-white md:bg-black/60 md:backdrop-blur-sm z-[60] flex items-center justify-center md:p-4 overflow-hidden">
          <div className="bg-white md:rounded-3xl shadow-2xl w-full max-w-4xl h-full md:max-h-[90vh] overflow-y-auto p-4 md:p-8 relative flex flex-col">
            <button onClick={() => { setShowFormModal(false); setEditingRequestId(null); }} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 bg-gray-100 rounded-full p-1"><XCircle className="w-8 h-8" /></button>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 mt-2 md:mt-0">
              <h2 className="text-2xl font-bold">Fechamento Semanal</h2>
              <div className="flex items-center gap-4 bg-gray-50 p-2 rounded-xl border border-gray-100"><span className="text-sm font-medium text-gray-500">Semana:</span><input type="date" className="bg-transparent text-black outline-none text-sm font-bold" value={currentWeek} onChange={(e) => !editingRequestId && setCurrentWeek(e.target.value)} disabled={!!editingRequestId} /></div>
            </div>
            
            <div className="space-y-4 flex-1 overflow-y-auto pb-20">
              {modalRecords.map((r, idx) => {
                const activeRequestType = editingRequestId 
                  ? requests.find(r => r.id === editingRequestId)?.employeeType 
                  : state.flowType;
                  
                const isRegistradoFlow = activeRequestType === EmployeeType.REGISTRADO;

                return (
                  <div key={idx} className="bg-gray-50 p-4 md:p-6 rounded-2xl border border-gray-100 shadow-sm space-y-3">
                    <div className="flex justify-between items-center border-b pb-2 border-gray-200">
                      <span className="font-bold text-gray-800 capitalize text-lg">{new Date(r.date + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' })}</span>
                      {isRegistradoFlow && (
                        <button onClick={() => { const n = [...modalRecords]; n[idx].isFolgaVendida = !n[idx].isFolgaVendida; setModalRecords(n); }} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${r.isFolgaVendida ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-300 text-gray-500'}`}>Folga Vendida</button>
                      )}
                    </div>
                    <div className={`grid gap-3 ${isRegistradoFlow && !r.isFolgaVendida ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-2'}`}>
                      <div className="flex flex-col"><label className="text-[10px] uppercase font-bold text-gray-400 mb-1">Entrada</label><input type="time" className="w-full p-3 border rounded-xl bg-white text-black text-lg text-center font-bold outline-none focus:border-blue-500" value={r.realEntry} onChange={(e) => { const n = [...modalRecords]; n[idx].realEntry = e.target.value; setModalRecords(n); }} /></div>
                      {isRegistradoFlow && !r.isFolgaVendida && (
                        <>
                          <div className="flex flex-col"><label className="text-[10px] uppercase font-bold text-gray-400 mb-1 text-center">P. Ent</label><input type="time" className="w-full p-3 border rounded-xl bg-white text-gray-500 text-lg text-center outline-none focus:border-blue-500" value={r.punchEntry} onChange={(e) => { const n = [...modalRecords]; n[idx].punchEntry = e.target.value; setModalRecords(n); }} /></div>
                          <div className="flex flex-col"><label className="text-[10px] uppercase font-bold text-gray-400 mb-1 text-center">P. Sai</label><input type="time" className="w-full p-3 border rounded-xl bg-white text-gray-500 text-lg text-center outline-none focus:border-blue-500" value={r.punchExit} onChange={(e) => { const n = [...modalRecords]; n[idx].punchExit = e.target.value; setModalRecords(n); }} /></div>
                        </>
                      )}
                      <div className="flex flex-col"><label className="text-[10px] uppercase font-bold text-gray-400 mb-1 text-right">Saída</label><input type="time" className="w-full p-3 border rounded-xl bg-white text-black text-lg text-center font-bold outline-none focus:border-blue-500" value={r.realExit} onChange={(e) => { const n = [...modalRecords]; n[idx].realExit = e.target.value; setModalRecords(n); }} /></div>
                    </div>
                  </div>
                );
              })}
            
                {editingRequestId && <div className="mt-4"><label className="block text-sm font-semibold mb-2">Justificativa da Edição</label><textarea className="w-full p-4 border rounded-xl bg-white text-black text-base" rows={3} value={editJustification} onChange={(e) => setEditJustification(e.target.value)} placeholder="Por que você está alterando este registro?" /></div>}
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100 flex gap-3 bg-white sticky bottom-0 z-10 pb-6 md:pb-0">
                <button onClick={() => { setShowFormModal(false); setEditingRequestId(null); }} className="flex-1 py-4 bg-gray-100 text-gray-700 font-bold rounded-xl active:scale-95 transition">Cancelar</button>
                <button onClick={submitRequest} className="flex-[2] py-4 bg-blue-600 text-white font-bold rounded-xl shadow-lg active:scale-95 transition">Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
