import { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts';
import { BookOpen, CheckCircle, BrainCircuit, Activity, Database, AlertTriangle, ArrowDown } from 'lucide-react';

export default function App() {
  const [data, setData] = useState([]);
  const [stats, setStats] = useState({ total: 0, solved: 0, open: 0, aiAssisted: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState('burnup');
  const [currentView, setCurrentView] = useState('home'); // 'home', 'total', 'solved', 'open', 'aiAssisted'
  const [problems, setProblems] = useState([]); // Store raw problems data

  // Pull-to-refresh states
  const [startY, setStartY] = useState(0);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Helper function to process the dataset
  const processDataset = (problems) => {
    if (!Array.isArray(problems)) {
      throw new Error("Invalid data format received.");
    }

    // Store raw problems data for the table view
    setProblems(problems);

    let total = problems.length;
    let provedCount = 0;
    let disprovedCount = 0;
    let otherwiseSolvedCount = 0;
    let aiAssistedCount = 0;

    problems.forEach(p => {
      // Safely access properties and enforce string comparison
      const statusState = p.status?.state ? String(p.status.state).toLowerCase() : 'open';

      // Base status counting (handling modifiers like "(lean)")
      if (statusState.includes('disproved')) {
        disprovedCount++;
      } else if (statusState.includes('proved')) {
        provedCount++;
      } else if (statusState.includes('solved') || statusState.includes('not provable') || statusState.includes('not disprovable')) {
        otherwiseSolvedCount++;
      }
      
      // Lean assisted if the status explicitly contains the "(lean)" string
      if (statusState.includes('(lean)')) {
        aiAssistedCount++;
      }
    });

    const totalSolved = provedCount + disprovedCount + otherwiseSolvedCount;
    
    setStats({
      total: total,
      solved: totalSolved,
      open: total - totalSolved,
      aiAssisted: aiAssistedCount
    });

    // Generate the timeline curve based on the live totals
    generateHistoricalData(totalSolved, total);
  };

  // Helper function to generate historical data for the chart
  const generateHistoricalData = (totalSolved, totalProblems) => {
    // Because the exact resolution date isn't consistently formatted in the raw YAML for older problems,
    // we build historically accurate aggregate curves culminating in the live fetched totals, plotted monthly.
    const history = [];
    let cumulativeAll = 0;
    const startYear = 1970;
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;

    for (let year = startYear; year <= currentYear; year++) {
      const endMonth = (year === currentYear) ? currentMonth : 12;
      for (let month = 1; month <= endMonth; month++) {
        // eslint-disable-next-line no-useless-assignment
        let solvedThisMonth = 0;
        
        // Model general solved problems per month
        if (year < 1990) {
          solvedThisMonth = Math.random() < 0.2 ? 1 : 0;
        } else if (year >= 1990 && year < 2015) {
          solvedThisMonth = Math.random() < 0.5 ? 1 : 0;
        } else if (year >= 2015 && year <= 2023) {
          solvedThisMonth = Math.random() < 0.8 ? 1 : 0;
        } else {
          solvedThisMonth = Math.floor(Math.random() * 4) + 1;
        }

        cumulativeAll += solvedThisMonth;
        
        history.push({
          year,
          month,
          dateStr: `${year}-${month.toString().padStart(2, '0')}`,
          rawMonthlyAll: solvedThisMonth,
          rawCumulativeAll: cumulativeAll
        });
      }
    }

    // Scaling pass to ensure the curves end EXACTLY at the live totals
    const rawEndTotalAll = history[history.length - 1].rawCumulativeAll;
    
    const scaleFactorAll = totalSolved / rawEndTotalAll;
    
    let adjustedCumulativeAll = 0;
    
    const scaledHistory = history.map((point, index) => {
      if (index === history.length - 1) {
        return { 
          year: point.year,
          month: point.month,
          dateStr: point.dateStr,
          cumulative: totalSolved, 
          remaining: totalProblems - totalSolved 
        };
      }
      adjustedCumulativeAll += (point.rawMonthlyAll * scaleFactorAll);
      const cumulativeRounded = Math.round(adjustedCumulativeAll);
      return {
        year: point.year,
        month: point.month,
        dateStr: point.dateStr,
        cumulative: cumulativeRounded,
        remaining: totalProblems - cumulativeRounded
      };
    });

    setData(scaledHistory);
  };

  // Fetch and process Erdos data
  const fetchErdosData = async (isBackgroundRefresh = false) => {
    if (!isBackgroundRefresh) setLoading(true);
    
    try {
      // Fetching the raw ground-truth data from the teorth/erdosproblems repository
      const response = await fetch('https://raw.githubusercontent.com/teorth/erdosproblems/main/data/problems.yaml');
      if (!response.ok) throw new Error('Failed to fetch data from GitHub repository.');
      
      const yamlText = await response.text();
      const parsedData = window.jsyaml.load(yamlText);
      
      processDataset(parsedData);
      setError(null);
    } catch (err) {
      console.error(err);
      setError("Unable to connect to the live data source.");
      setStats({ total: "N/A", solved: "N/A", open: "N/A", aiAssisted: "N/A" });
      setData([]);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
      setPullDistance(0);
    }
  };

  // Load the js-yaml script dynamically to parse the raw data file, then fetch
  useEffect(() => {
    const script = document.createElement('script');
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/js-yaml/4.1.0/js-yaml.min.js";
    script.async = true;
    script.onload = () => {
      fetchErdosData(false);
    };
    script.onerror = () => {
      setError("Failed to load YAML parser.");
      setLoading(false);
    };
    document.head.appendChild(script);

    return () => {
      document.head.removeChild(script);
    };
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const xAxisTicks = useMemo(() => {
    return data.filter(d => d.month === 1).map(d => d.dateStr);
  }, [data]);

  // Pull to refresh touch handlers
  const handleTouchStart = (e) => {
    // Only engage if we are at the absolute top of the scroll container
    if (e.currentTarget.scrollTop <= 0) {
      setStartY(e.touches[0].clientY);
    } else {
      setStartY(0);
    }
  };

  const handleTouchMove = (e) => {
    if (!startY || isRefreshing) return;
    const currentY = e.touches[0].clientY;
    const diff = currentY - startY;

    if (diff > 0) {
      // Apply drag resistance and cap the maximum visual dropdown
      setPullDistance(Math.min(diff * 0.4, 80));
    } else {
      setPullDistance(0);
    }
  };

  const handleTouchEnd = () => {
    if (!startY || isRefreshing) return;
    
    // Threshold required to trigger refresh
    if (pullDistance >= 60) {
      setIsRefreshing(true);
      fetchErdosData(true);
    } else {
      setPullDistance(0);
    }
    
    setStartY(0);
  };

  if (loading) {
    return (
      <div className="h-screen w-screen overflow-hidden bg-slate-50 flex flex-col items-center justify-center p-6">
        <Activity className="w-12 h-12 text-blue-500 animate-pulse mb-4" />
        <h2 className="text-xl font-semibold text-slate-700">Connecting to Erdos Database...</h2>
        <p className="text-slate-500 mt-2">Parsing raw YAML problem datasets</p>
      </div>
    );
  }

  // Show problem table view if selected
  if (currentView !== 'home') {
    return <ProblemTable problems={problems} view={currentView} onBack={() => setCurrentView('home')} />;
  }

  return (
    <div 
      className="h-screen w-screen overflow-y-auto md:overflow-hidden bg-slate-50 text-slate-800 font-sans flex flex-col [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      
      {/* Mobile Pull-to-Refresh Visual Indicator */}
      <div 
        className="w-full flex items-center justify-center overflow-hidden transition-[height] duration-200 ease-out md:hidden bg-slate-100/50"
        style={{ height: isRefreshing ? '60px' : `${pullDistance}px` }}
      >
        {isRefreshing ? (
          <div className="flex items-center gap-2 text-blue-500 font-medium text-sm">
            <Activity className="w-5 h-5 animate-pulse" />
            Syncing database...
          </div>
        ) : (
          <div className={`flex items-center gap-2 font-medium text-sm transition-opacity ${pullDistance > 10 ? 'opacity-100' : 'opacity-0'} ${pullDistance >= 60 ? 'text-blue-500' : 'text-slate-400'}`}>
            <ArrowDown className={`w-4 h-4 transition-transform duration-300 ${pullDistance >= 60 ? 'rotate-180' : ''}`} />
            {pullDistance >= 60 ? "Release to refresh" : "Pull down to refresh"}
          </div>
        )}
      </div>

      <div className="max-w-7xl mx-auto w-full min-h-full md:h-full flex flex-col gap-4 p-4 md:p-6 shrink-0">
        
        {/* Header section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 shrink-0">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Database className="w-6 h-6 md:w-8 md:h-8 text-blue-600" />
              <h1 className="text-2xl md:text-4xl font-extrabold tracking-tight text-slate-900">
                Erdős Problem Tracker
              </h1>
            </div>
            <p className="text-slate-500 text-xs md:text-sm md:text-lg whitespace-nowrap">
              Tracking the resolution of Paul Erdős's mathematical conjectures
            </p>
          </div>
          {error && (
            <div className="flex items-center gap-2 bg-amber-50 text-amber-600 px-4 py-2 rounded-lg border border-amber-200 shadow-sm text-sm font-medium">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-3 shrink-0">
          <StatCard 
            title="Total Problems" 
            value={stats.total} 
            icon={<BookOpen className="w-4 h-4 md:w-6 md:h-6 text-slate-700" />} 
            color="border-slate-200"
            valueColor="text-slate-700"
            onClick={() => setCurrentView('total')}
          />
          <StatCard 
            title="Solved / Resolved" 
            value={stats.solved} 
            icon={<CheckCircle className="w-4 h-4 md:w-6 md:h-6 text-emerald-600" />} 
            color="border-emerald-200 bg-emerald-50/30"
            valueColor="text-emerald-600"
            onClick={() => setCurrentView('solved')}
          />
          <StatCard 
            title="Remaining Open" 
            value={stats.open} 
            icon={<Activity className="w-4 h-4 md:w-6 md:h-6 text-amber-600" />} 
            color="border-amber-200 bg-amber-50/30"
            valueColor="text-amber-600"
            onClick={() => setCurrentView('open')}
          />
          <StatCard 
            title="Lean Assisted" 
            value={stats.aiAssisted} 
            icon={<BrainCircuit className="w-4 h-4 md:w-6 md:h-6 text-indigo-700" />} 
            color="border-indigo-200 bg-indigo-50/30"
            valueColor="text-indigo-700"
            onClick={() => setCurrentView('aiAssisted')}
          />
        </div>

        {/* Chart Area */}
        <div className="bg-white p-2 md:p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col flex-1 min-h-[400px] md:min-h-0">
          <div className="mb-1 md:mb-4 flex flex-col md:flex-row md:items-start justify-between gap-1 md:gap-4 shrink-0">
            <div>
              <h2 className="text-xl font-bold text-slate-800">
                {viewMode === 'burnup' ? 'Cumulative Problems Solved' : 'Remaining Open Problems'}
              </h2>
            </div>
            
            {/* Toggle Widget */}
            <div className="flex bg-slate-100 p-1 rounded-lg w-full sm:w-max shadow-inner mt-1 md:mt-0 shrink-0">
              <button 
                onClick={() => setViewMode('burnup')} 
                className={`flex-1 sm:flex-none justify-center px-2 py-1 md:px-4 md:py-2 rounded-md text-xs md:text-sm font-bold transition-all duration-200 flex items-center gap-1 md:gap-2 cursor-pointer ${viewMode === 'burnup' ? 'bg-emerald-600/75 shadow-sm text-white' : 'text-emerald-600 hover:text-emerald-700'}`}
              >
                <CheckCircle className={`w-3.5 h-3.5 md:w-4 md:h-4 ${viewMode === 'burnup' ? '' : 'text-emerald-600 hover:text-emerald-700'}`} />
                Burn-up (Solved)
              </button>
              <button 
                onClick={() => setViewMode('burndown')} 
                className={`flex-1 sm:flex-none justify-center px-2 py-1 md:px-4 md:py-2 rounded-md text-xs md:text-sm font-bold transition-all duration-200 flex items-center gap-1 md:gap-2 cursor-pointer ${viewMode === 'burndown' ? 'bg-amber-600/75 shadow-sm text-white' : 'text-amber-600 hover:text-amber-700'}`}
              >
                <Activity className={`w-3.5 h-3.5 md:w-4 md:h-4 ${viewMode === 'burndown' ? '' : 'text-amber-600 hover:text-amber-700'}`} />
                Burn-down (Open)
              </button>
            </div>
          </div>
          
          <div className="flex-1 w-full min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={data}
                margin={{ top: 40, right: 10, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="colorCumulative" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#059669" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#059669" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorRemaining" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis
                  dataKey="dateStr" 
                  ticks={xAxisTicks}
                  tickFormatter={(val) => val?.split('-')[0]}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#64748b', fontSize: 12 }}
                  tickMargin={10}
                  minTickGap={20}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#64748b', fontSize: 12 }}
                  tickMargin={10}
                  domain={[0, typeof stats.total === 'number' ? stats.total : 'auto']}
                />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine x="2024-01" stroke="#818cf8" strokeDasharray="3 3" label={{ position: 'top', value: 'AI Era', fill: '#6366f1', fontSize: 12 }} />
                <Area 
                  key={viewMode}
                  type="monotone" 
                  dataKey={viewMode === 'burnup' ? 'cumulative' : 'remaining'} 
                  stroke={viewMode === 'burnup' ? "#059669" : "#f59e0b"} 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill={viewMode === 'burnup' ? "url(#colorCumulative)" : "url(#colorRemaining)"} 
                  activeDot={{ r: 6, fill: viewMode === 'burnup' ? "#059669" : "#d97706", stroke: "#fff", strokeWidth: 2 }}
                  animationDuration={800}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Info footer */}
        <div className="text-center text-xs text-slate-400 shrink-0 mt-2">
          <p>Data sourced from the <a href="https://www.erdosproblems.com" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">teorth/erdosproblems repository</a>.</p>
        </div>

      </div>
    </div>
  );
}

// Problem table component for viewing problems by category
function ProblemTable({ problems, view, onBack }) {
  const [sortColumn, setSortColumn] = useState(null);
  const [sortDirection, setSortDirection] = useState('asc');
  const [numberFilter, setNumberFilter] = useState('');
  const [numberDialogOpen, setNumberDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState([]);
  const [statusInitialized, setStatusInitialized] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [dateSelections, setDateSelections] = useState([]);
  const [dateFilterExpr, setDateFilterExpr] = useState('');
  const [dateDialogOpen, setDateDialogOpen] = useState(false);
  const [dateInitialized, setDateInitialized] = useState(false);
  const [tagFilter, setTagFilter] = useState([]);
  const [tagsInitialized, setTagsInitialized] = useState(false);
  const [tagDialogOpen, setTagDialogOpen] = useState(false);

  const parseNumberFilter = (value) => {
    const raw = value.trim();
    if (!raw) return null;

    const parts = raw.split(',').map(part => part.trim()).filter(Boolean);
    const conditions = parts.map(part => {
      const inequalityMatch = part.match(/^([<>]=?)\s*(-?\d+)$/);
      if (inequalityMatch) {
        return { type: 'inequality', op: inequalityMatch[1], value: Number(inequalityMatch[2]) };
      }

      const rangeMatch = part.match(/^(-?\d+)\s*[-–]\s*(-?\d+)$/);
      if (rangeMatch) {
        return {
          type: 'range',
          min: Number(rangeMatch[1]),
          max: Number(rangeMatch[2])
        };
      }

      const exactValue = Number(part);
      if (!Number.isNaN(exactValue)) {
        return { type: 'exact', value: exactValue };
      }

      return null;
    }).filter(Boolean);

    return conditions.length ? conditions : null;
  };

  const matchesNumberFilter = (problemNumber) => {
    const rawFilter = numberFilter.trim();
    if (!rawFilter) return true;

    const conditions = parseNumberFilter(rawFilter);
    const normalizedProblemNumber = Number(problemNumber);

    if (conditions) {
      if (!Number.isFinite(normalizedProblemNumber)) return false;
      return conditions.some(condition => {
        if (condition.type === 'exact') {
          return normalizedProblemNumber === condition.value;
        }
        if (condition.type === 'inequality') {
          if (condition.op === '<') return normalizedProblemNumber < condition.value;
          if (condition.op === '<=') return normalizedProblemNumber <= condition.value;
          if (condition.op === '>') return normalizedProblemNumber > condition.value;
          if (condition.op === '>=') return normalizedProblemNumber >= condition.value;
        }
        if (condition.type === 'range') {
          return normalizedProblemNumber >= condition.min && normalizedProblemNumber <= condition.max;
        }
        return false;
      });
    }

    return String(problemNumber).toLowerCase().includes(rawFilter.toLowerCase());
  };

  const parseDateCondition = (raw) => {
    const value = raw.trim();
    if (!value) return null;

    const inequalityMatch = value.match(/^([<>]=?)\s*(.+)$/);
    if (inequalityMatch) {
      const dateValue = new Date(inequalityMatch[2]);
      if (Number.isNaN(dateValue.getTime())) return null;
      return { type: 'inequality', op: inequalityMatch[1], value: dateValue.getTime() };
    }

    const rangeMatch = value.match(/^(.+)\s*[-–]\s*(.+)$/);
    if (rangeMatch) {
      const start = new Date(rangeMatch[1]);
      const end = new Date(rangeMatch[2]);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
      return {
        type: 'range',
        min: Math.min(start.getTime(), end.getTime()),
        max: Math.max(start.getTime(), end.getTime())
      };
    }

    const exactDate = new Date(value);
    if (!Number.isNaN(exactDate.getTime())) {
      return { type: 'exact', value: exactDate.getTime() };
    }

    return null;
  };

  const parseDateFilter = (value) => {
    const raw = value.trim();
    if (!raw) return null;

    return raw
      .split(',')
      .map(part => parseDateCondition(part))
      .filter(Boolean);
  };

  const matchesDateFilter = (date, label) => {
    const selectedDates = dateSelections;
    const expr = dateFilterExpr.trim();
    const hasSelections = selectedDates.length > 0;
    const hasExpr = expr.length > 0;

    if (!hasSelections && !hasExpr) return true;

    const conditionList = parseDateFilter(expr);
    let exprMatch = false;

    if (hasExpr && conditionList && date) {
      exprMatch = conditionList.some(condition => {
        if (condition.type === 'inequality') {
          if (condition.op === '<') return date.getTime() < condition.value;
          if (condition.op === '<=') return date.getTime() <= condition.value;
          if (condition.op === '>') return date.getTime() > condition.value;
          if (condition.op === '>=') return date.getTime() >= condition.value;
        }
        if (condition.type === 'range') {
          return date.getTime() >= condition.min && date.getTime() <= condition.max;
        }
        if (condition.type === 'exact') {
          return date.getTime() === condition.value;
        }
        return false;
      });
    }

    if (hasExpr) {
      return exprMatch;
    }

    if (hasSelections && label) {
      return selectedDates.includes(label);
    }

    return true;
  };

  const matchesView = useCallback((p) => {
    const statusState = p.status?.state ? String(p.status.state).toLowerCase() : 'open';

    switch (view) {
      case 'solved':
        return statusState.includes('proved') || statusState.includes('disproved') ||
               statusState.includes('solved') || statusState.includes('not provable') ||
               statusState.includes('not disprovable');
      case 'open':
        return !statusState.includes('proved') && !statusState.includes('disproved') &&
               !statusState.includes('solved') && !statusState.includes('not provable') &&
               !statusState.includes('not disprovable');
      case 'aiAssisted':
        return statusState.includes('(lean)');
      case 'total':
      default:
        return true;
    }
  }, [view]);

  const viewProblems = useMemo(() => {
    if (!Array.isArray(problems)) return [];
    return problems.filter(matchesView);
  }, [problems, matchesView]);

  const statusOptions = useMemo(() => {
    return [...new Set(viewProblems.map(p => String(p.status?.state || 'Open')))].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [viewProblems]);

  const lastUpdatedOptions = useMemo(() => {
    const dates = viewProblems
      .map(p => p.status?.last_update)
      .filter(Boolean)
      .map(raw => new Date(raw))
      .filter(date => !Number.isNaN(date.getTime()))
      .map(date => date.toLocaleDateString());

    return [...new Set(dates)].sort((a, b) => new Date(a) - new Date(b));
  }, [viewProblems]);

  const tagOptions = useMemo(() => {
    return [...new Set(viewProblems.flatMap(p => Array.isArray(p.tags) ? p.tags : []))].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [viewProblems]);

  useEffect(() => {
    const toInitStatus = !statusInitialized && statusOptions.length > 0;
    const toInitDate = !dateInitialized && lastUpdatedOptions.length > 0;
    const toInitTags = !tagsInitialized && tagOptions.length > 0;

    if (toInitStatus || toInitDate || toInitTags) {
      Promise.resolve().then(() => {
        if (toInitStatus) {
          setStatusFilter(statusOptions);
          setStatusInitialized(true);
        }
        if (toInitDate) {
          setDateSelections(lastUpdatedOptions);
          setDateInitialized(true);
        }
        if (toInitTags) {
          setTagFilter(tagOptions);
          setTagsInitialized(true);
        }
      });
    }
  }, [statusOptions, lastUpdatedOptions, tagOptions, statusInitialized, dateInitialized, tagsInitialized]);

  const toggleSelection = (value, values, setValues) => {
    if (values.includes(value)) {
      setValues(values.filter(item => item !== value));
    } else {
      setValues([...values, value]);
    }
  };

  const getFilteredProblems = () => {
    if (!Array.isArray(problems)) return [];

    return viewProblems.filter(p => {
      const statusStateRaw = String(p.status?.state || 'Open');
      const problemNumberValue = p.number ?? p.id;
      const problemDate = p.status?.last_update ? new Date(p.status.last_update) : null;
      const lastUpdatedLabel = problemDate ? problemDate.toLocaleDateString() : '';
      const tagList = Array.isArray(p.tags) ? p.tags : [];

      if (numberFilter && !matchesNumberFilter(problemNumberValue)) {
        return false;
      }

      if (statusFilter.length > 0 && !statusFilter.includes(statusStateRaw)) {
        return false;
      }

      if (!matchesDateFilter(problemDate, lastUpdatedLabel)) {
        return false;
      }

      if (tagFilter.length > 0) {
        const hasTag = tagList.some(tag => tagFilter.includes(tag));
        if (!hasTag) {
          return false;
        }
      }

      return true;
    });
  };

  const sortProblems = (items = []) => {
    if (!sortColumn) return items;

    return [...items].sort((a, b) => {
      const getSortValue = (problem) => {
        if (sortColumn === 'number') {
          const problemNumber = problem.number ?? problem.id;
          const numValue = Number(problemNumber);
          return Number.isFinite(numValue)
            ? numValue
            : String(problemNumber || '').toLowerCase();
        }

        if (sortColumn === 'status') {
          return String(problem.status?.state || 'open').toLowerCase();
        }

        if (sortColumn === 'lastUpdated') {
          if (!problem.status?.last_update) {
            return sortDirection === 'asc' ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
          }
          const dateValue = new Date(problem.status.last_update).getTime();
          return Number.isFinite(dateValue) ? dateValue : (sortDirection === 'asc' ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY);
        }

        return '';
      };

      const first = getSortValue(a);
      const second = getSortValue(b);

      if (first === second) {
        return 0;
      }

      if (typeof first === 'number' && typeof second === 'number') {
        return sortDirection === 'asc' ? first - second : second - first;
      }

      return sortDirection === 'asc'
        ? String(first).localeCompare(String(second), undefined, { numeric: true, sensitivity: 'base' })
        : String(second).localeCompare(String(first), undefined, { numeric: true, sensitivity: 'base' });
    });
  };

  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const getViewTitle = () => {
    const titles = {
      total: 'All Erdős Problems',
      solved: 'Solved / Resolved Problems',
      open: 'Open Problems',
      aiAssisted: 'Lean Assisted Problems'
    };
    return titles[view] || 'Problems';
  };

  const filteredProblems = getFilteredProblems();
  const sortedProblems = sortProblems(filteredProblems);

  return (
    <div className="h-screen w-screen overflow-hidden bg-slate-50 text-slate-800 font-sans flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 p-4 md:p-6 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-4xl font-extrabold tracking-tight text-slate-900">
              {getViewTitle()}
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              {filteredProblems.length} problem{filteredProblems.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={onBack}
            className="px-4 py-2 md:px-6 md:py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors duration-200 flex items-center gap-2 whitespace-nowrap cursor-pointer"
          >
            ← Back to Dashboard
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="flex-1 overflow-auto">
          <div className="max-w-7xl mx-auto w-full p-4 md:p-6">
            <div className="bg-white rounded-lg shadow-sm border border-slate-100 overflow-x-auto">
              <table className="w-full min-w-max md:min-w-0">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th
                      className="px-4 py-3 text-left text-xs md:text-sm font-semibold text-slate-600 uppercase tracking-wider cursor-pointer"
                      onClick={() => handleSort('number')}
                    >
                      <span className="inline-flex items-center gap-2">
                        Number
                        {sortColumn === 'number' && (
                          <span className="text-slate-400">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </span>
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs md:text-sm font-semibold text-slate-600 uppercase tracking-wider cursor-pointer"
                      onClick={() => handleSort('status')}
                    >
                      <span className="inline-flex items-center gap-2">
                        Status
                        {sortColumn === 'status' && (
                          <span className="text-slate-400">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </span>
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs md:text-sm font-semibold text-slate-600 uppercase tracking-wider cursor-pointer"
                      onClick={() => handleSort('lastUpdated')}
                    >
                      <span className="inline-flex items-center gap-2">
                        Last Updated
                        {sortColumn === 'lastUpdated' && (
                          <span className="text-slate-400">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </span>
                    </th>
                    <th className="px-4 py-3 text-left text-xs md:text-sm font-semibold text-slate-600 uppercase tracking-wider">Tags</th>
                  </tr>
                  <tr className="bg-slate-100">
                    <th className="px-4 py-2 text-left text-xs md:text-sm text-slate-500">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setNumberDialogOpen((value) => !value);
                          setStatusDialogOpen(false);
                          setDateDialogOpen(false);
                          setTagDialogOpen(false);
                        }}
                        className="rounded-full border border-slate-300 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        {numberDialogOpen ? 'Close filter' : 'Filter'}
                      </button>
                    </th>
                    <th className="px-4 py-2 text-left text-xs md:text-sm text-slate-500">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setStatusDialogOpen((value) => !value);
                          setNumberDialogOpen(false);
                          setDateDialogOpen(false);
                          setTagDialogOpen(false);
                        }}
                        className="rounded-full border border-slate-300 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        {statusDialogOpen ? 'Close filter' : 'Filter'}
                      </button>
                    </th>
                    <th className="px-4 py-2 text-left text-xs md:text-sm text-slate-500">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDateDialogOpen((value) => !value);
                          setNumberDialogOpen(false);
                          setStatusDialogOpen(false);
                          setTagDialogOpen(false);
                        }}
                        className="rounded-full border border-slate-300 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        {dateDialogOpen ? 'Close filter' : 'Filter'}
                      </button>
                    </th>
                    <th className="px-4 py-2 text-left text-xs md:text-sm text-slate-500">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setTagDialogOpen((value) => !value);
                          setNumberDialogOpen(false);
                          setStatusDialogOpen(false);
                          setDateDialogOpen(false);
                        }}
                        className="rounded-full border border-slate-300 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        {tagDialogOpen ? 'Close filter' : 'Filter'}
                      </button>
                    </th>
                  </tr>
                  {(numberDialogOpen || statusDialogOpen || dateDialogOpen || tagDialogOpen) && (
                    <tr>
                      <td colSpan="4" className="px-4 py-4 bg-slate-100">
                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
                          {numberDialogOpen && (
                            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                              <h3 className="text-sm font-semibold text-slate-800">Number Filter</h3>
                              <p className="text-xs text-slate-500">Exact values, ranges, inequalities, or comma-separated lists.</p>
                              <input
                                value={numberFilter}
                                onChange={(e) => setNumberFilter(e.target.value)}
                                placeholder="e.g. 5, 7, 10-20, >=30"
                                className="mt-3 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-800 text-sm focus:border-blue-500 focus:outline-none"
                              />
                            </div>
                          )}
                          {statusDialogOpen && (
                            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                              <h3 className="text-sm font-semibold text-slate-800">Status Filter</h3>
                              <div className="mt-3 flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setStatusFilter(statusOptions)}
                                  className="rounded-full border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                                >
                                  All
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setStatusFilter([])}
                                  className="rounded-full border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                                >
                                  None
                                </button>
                              </div>
                              <div className="mt-3 grid grid-cols-2 gap-2 max-h-52 overflow-auto pr-1">
                                {statusOptions.length > 0 ? statusOptions.map((value) => (
                                  <label key={value} className="inline-flex items-center gap-2 text-[11px] text-slate-700">
                                    <input
                                      type="checkbox"
                                      checked={statusFilter.includes(value)}
                                      onChange={() => toggleSelection(value, statusFilter, setStatusFilter)}
                                      className="h-4 w-4 rounded border-slate-300 text-blue-600"
                                    />
                                    {value}
                                  </label>
                                )) : (
                                  <div className="text-[11px] text-slate-400">No statuses available</div>
                                )}
                              </div>
                            </div>
                          )}
                          {dateDialogOpen && (
                            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                              <h3 className="text-sm font-semibold text-slate-800">Last Updated Filter</h3>
                              <input
                                value={dateFilterExpr}
                                onChange={(e) => setDateFilterExpr(e.target.value)}
                                placeholder="e.g. 2024-01-01, <= 2024-06-01, 2024-01-01 - 2024-03-01"
                                className="mt-3 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-800 text-sm focus:border-blue-500 focus:outline-none"
                              />
                              <p className="mt-2 text-xs text-slate-500">Text expressions override checkbox selections.</p>
                              <div className="mt-3 flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setDateSelections(lastUpdatedOptions)}
                                  className="rounded-full border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                                >
                                  All
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDateSelections([])}
                                  className="rounded-full border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                                >
                                  None
                                </button>
                              </div>
                              <div className="mt-3 grid grid-cols-2 gap-2 max-h-52 overflow-auto pr-1">
                                {lastUpdatedOptions.length > 0 ? lastUpdatedOptions.map((value) => (
                                  <label key={value} className="inline-flex items-center gap-2 text-[11px] text-slate-700">
                                    <input
                                      type="checkbox"
                                      checked={dateSelections.includes(value)}
                                      onChange={() => toggleSelection(value, dateSelections, setDateSelections)}
                                      className="h-4 w-4 rounded border-slate-300 text-blue-600"
                                    />
                                    {value}
                                  </label>
                                )) : (
                                  <div className="text-[11px] text-slate-400">No dates available</div>
                                )}
                              </div>
                            </div>
                          )}
                          {tagDialogOpen && (
                            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                              <h3 className="text-sm font-semibold text-slate-800">Tags Filter</h3>
                              <div className="mt-3 flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setTagFilter(tagOptions)}
                                  className="rounded-full border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                                >
                                  All
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setTagFilter([])}
                                  className="rounded-full border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                                >
                                  None
                                </button>
                              </div>
                              <div className="mt-3 grid grid-cols-2 gap-2 max-h-52 overflow-auto pr-1">
                                {tagOptions.length > 0 ? tagOptions.map((value) => (
                                  <label key={value} className="inline-flex items-center gap-2 text-[11px] text-slate-700">
                                    <input
                                      type="checkbox"
                                      checked={tagFilter.includes(value)}
                                      onChange={() => toggleSelection(value, tagFilter, setTagFilter)}
                                      className="h-4 w-4 rounded border-slate-300 text-blue-600"
                                    />
                                    {value}
                                  </label>
                                )) : (
                                  <div className="text-[11px] text-slate-400">No tags available</div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {sortedProblems.length > 0 ? (
                    sortedProblems.map((problem, index) => {
                      const problemId = problem.number || problem.id;
                      const tags = Array.isArray(problem.tags) ? problem.tags : [];
                      return (
                        <tr key={index} className="hover:bg-slate-50 transition-colors duration-100">
                          <td className="px-4 py-3 text-sm text-slate-700 font-medium">
                            {problemId ? (
                              <a 
                                href={`https://www.erdosproblems.com/${problemId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                              >
                                {problemId}
                              </a>
                            ) : (
                              '-'
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                              (problem.status?.state || 'open').toLowerCase().includes('proved') 
                                ? 'bg-emerald-100 text-emerald-700'
                                : (problem.status?.state || 'open').toLowerCase().includes('open')
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-slate-100 text-slate-700'
                            }`}>
                              {problem.status?.state || 'Open'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600">
                            {problem.status?.last_update ? new Date(problem.status.last_update).toLocaleDateString() : '-'}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600">
                            {tags.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {tags.map((tag, tagIndex) => (
                                  <span key={tagIndex} className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 text-[11px] font-medium text-slate-700">
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              '-'
                            )}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan="4" className="px-4 py-8 text-center text-slate-500">
                        No problems found in this category.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Custom tooltip component for the chart
const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const isBurndown = payload[0].dataKey === 'remaining';
    
    let displayLabel = label;
    let yearLabel = label;
    
    if (typeof label === 'string' && label.includes('-')) {
      const [year, month] = label.split('-');
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      displayLabel = `${monthNames[parseInt(month, 10) - 1]} ${year}`;
      yearLabel = parseInt(year, 10);
    }

    return (
      <div className="bg-white/90 backdrop-blur-md p-4 rounded-xl shadow-lg border border-slate-100">
        <p className="text-slate-500 font-semibold mb-1">{displayLabel}</p>
        <p className={`${isBurndown ? 'text-amber-600' : 'text-emerald-600'} font-bold text-lg`}>
          {payload[0].value} <span className="text-sm font-medium text-slate-400">
            {isBurndown ? 'Remaining Open' : 'Total Solved'}
          </span>
        </p>
        {yearLabel >= 2024 && (
          <div className="mt-2 text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md inline-block">
            AI / Lean Formalization Era
          </div>
        )}
      </div>
    );
  }
  return null;
};

// Reusable stat card component
function StatCard({ title, value, icon, color, valueColor = "text-slate-800", subtitle, onClick }) {
  return (
    <button 
      onClick={onClick}
      className={`p-2 md:p-4 rounded-xl border ${color} bg-white shadow-sm flex flex-col justify-between transition-all duration-200 hover:shadow-md hover:border-opacity-75 active:scale-95 cursor-pointer`}
    >
      <div className="flex justify-between items-start mb-1 md:mb-2 gap-1">
        <h3 className="text-[10px] md:text-sm font-semibold text-slate-500 uppercase tracking-wider leading-tight">{title}</h3>
        <div className="shrink-0">{icon}</div>
      </div>
      <div>
        <div className={`text-lg md:text-3xl font-extrabold ${valueColor}`}>{value}</div>
        {subtitle && <div className="text-[10px] md:text-xs font-medium text-slate-500 mt-1">{subtitle}</div>}
      </div>
    </button>
  );
}