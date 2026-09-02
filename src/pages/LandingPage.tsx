import React, { useState, useId } from 'react';
import { useNavigate } from 'react-router-dom';
import { ThemeToggle } from '../components/ThemeToggle';
import logoImg from '../assets/images/complyzzz_logo_1781018719318.png';
import { 
  Activity, 
  CheckCircle2, 
  Clock, 
  ShieldCheck, 
  FileText, 
  Zap, 
  Users, 
  ChevronRight,
  Stethoscope,
  Terminal,
  Shield,
  MessageSquare,
  History,
  Truck,
  Plane,
  Building2,
  Download,
  Smartphone,
  Mail,
  FileCheck,
  Check,
  XCircle,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Award,
  Scale,
  Lock,
  ArrowRight,
  Printer,
  Sliders,
  HelpCircle,
  Menu,
  X,
  BadgePercent,
  Play,
  RotateCcw
} from 'lucide-react';

interface Scenario {
  id: string;
  name: string;
  role: string;
  icon: React.ReactNode;
  device: string;
  totalDays: number;
  daysUsed: number;
  daysCompliant: number;
  avgHours: number;
  ahi: number;
  fmcsaStatus: 'COMPLIANT' | 'NON_COMPLIANT' | 'CONDITIONAL';
  faaStatus: 'COMPLIANT' | 'NON_COMPLIANT' | 'CONDITIONAL';
  highlight: string;
}

const SAMPLE_SCENARIOS: Scenario[] = [
  {
    id: 'cdl_driver',
    name: 'Marcus Vance',
    role: 'Class-A CDL Long-Haul Driver',
    icon: <Truck className="text-blue-600 dark:text-blue-400" size={20} />,
    device: 'ResMed AirSense 11 AutoSet',
    totalDays: 30,
    daysUsed: 29,
    daysCompliant: 26,
    avgHours: 6.4,
    ahi: 2.1,
    fmcsaStatus: 'COMPLIANT',
    faaStatus: 'COMPLIANT',
    highlight: '86.7% Compliance (>70% req.) • Passed DOT Recertification',
  },
  {
    id: 'pilot',
    name: 'Capt. Sarah Lindqvist',
    role: 'Commercial Airline Pilot (FAA Class 1)',
    icon: <Plane className="text-indigo-600 dark:text-indigo-400" size={20} />,
    device: 'Philips DreamStation 2 Auto',
    totalDays: 90,
    daysUsed: 88,
    daysCompliant: 84,
    avgHours: 7.2,
    ahi: 1.4,
    fmcsaStatus: 'COMPLIANT',
    faaStatus: 'COMPLIANT',
    highlight: '93.3% Compliance & Avg 7.2 hrs/night • Meets FAA 6-Hour Rule',
  },
  {
    id: 'borderline',
    name: 'David Kowalski',
    role: 'Regional Delivery Operator',
    icon: <AlertTriangle className="text-amber-500" size={20} />,
    device: 'Fisher & Paykel SleepStyle',
    totalDays: 30,
    daysUsed: 22,
    daysCompliant: 19,
    avgHours: 4.8,
    ahi: 4.8,
    fmcsaStatus: 'CONDITIONAL',
    faaStatus: 'NON_COMPLIANT',
    highlight: '63.3% Compliance • Conditional Alert: 2 more compliant nights needed',
  },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeScenario, setActiveScenario] = useState<Scenario>(SAMPLE_SCENARIOS[0]);
  const [isSimulating, setIsSimulating] = useState(false);

  // Audience Tabs
  const [activeAudienceTab, setActiveAudienceTab] = useState<'drivers' | 'pilots' | 'examiners' | 'fleets'>('drivers');

  // ROI Calculator
  const [monthlyVolume, setMonthlyVolume] = useState<number>(35);

  // FAQ Accordion
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  const simulateScenario = (scenario: Scenario) => {
    setIsSimulating(true);
    setTimeout(() => {
      setActiveScenario(scenario);
      setIsSimulating(false);
    }, 400);
  };

  const volumePerReportCost = monthlyVolume * 9;
  const unlimitedCost = 250;
  const recommendedPlan = monthlyVolume >= 28 ? 'unlimited' : 'per_report';
  const estimatedHoursSaved = Math.round(monthlyVolume * 0.35); // ~20 min per manual audit
  const estimatedDollarsSaved = Math.max(0, (monthlyVolume * 45) - (recommendedPlan === 'unlimited' ? unlimitedCost : volumePerReportCost));

  return (
    <div className="min-h-screen bg-white dark:bg-[#0b0f19] text-slate-900 dark:text-slate-100 font-sans selection:bg-blue-100 selection:text-blue-900 overflow-x-hidden transition-colors duration-200">
      
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/90 dark:bg-[#0b0f19]/90 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800/80 transition-colors duration-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          
          {/* Brand Logo */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
            <img
              src={logoImg}
              alt="ComplyZzz Sleep Compliance Logo"
              className="w-10 h-10 object-contain rounded-xl shadow-md border border-slate-100 dark:border-slate-800"
              referrerPolicy="no-referrer"
            />
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-2xl tracking-tight text-slate-950 dark:text-white">
                  Comply<span className="text-blue-600 dark:text-blue-400">Zzz</span>
                </span>
                <span className="hidden sm:inline-flex text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/60">
                  DOT & FAA Standards
                </span>
              </div>
            </div>
          </div>

          {/* Desktop Nav Links */}
          <div className="hidden lg:flex items-center gap-7">
            <a href="#simulator" className="text-sm font-semibold text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
              Live Demo
            </a>
            <a href="#solutions" className="text-sm font-semibold text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
              Solutions
            </a>
            <a href="#how-it-works" className="text-sm font-semibold text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
              How It Works
            </a>
            <a href="#calculator" className="text-sm font-semibold text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
              Pricing & ROI
            </a>
            <a href="#faq" className="text-sm font-semibold text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
              FAQ
            </a>
          </div>

          {/* Right Header Actions */}
          <div className="flex items-center gap-3">
            <ThemeToggle />
            
            <button 
              type="button"
              onClick={() => navigate('/login?mode=signin')}
              className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 transition-colors px-3 py-2 cursor-pointer"
            >
              Sign In
            </button>
            
            <button 
              type="button"
              onClick={() => navigate('/login?mode=signup')}
              className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white px-4 sm:px-5 py-2.5 rounded-full text-xs sm:text-sm font-bold transition-all shadow-md shadow-blue-500/20 flex items-center gap-1.5 cursor-pointer"
            >
              <span>Get Started</span>
              <ChevronRight size={16} />
            </button>

            {/* Mobile Menu Toggle */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden bg-white dark:bg-[#0f172a] border-b border-slate-200 dark:border-slate-800 px-6 py-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
            <a 
              href="#simulator" 
              onClick={() => setMobileMenuOpen(false)}
              className="block py-2 text-sm font-semibold text-slate-700 dark:text-slate-200"
            >
              Live Demo Simulator
            </a>
            <a 
              href="#solutions" 
              onClick={() => setMobileMenuOpen(false)}
              className="block py-2 text-sm font-semibold text-slate-700 dark:text-slate-200"
            >
              Industry Solutions
            </a>
            <a 
              href="#how-it-works" 
              onClick={() => setMobileMenuOpen(false)}
              className="block py-2 text-sm font-semibold text-slate-700 dark:text-slate-200"
            >
              How It Works
            </a>
            <a 
              href="#calculator" 
              onClick={() => setMobileMenuOpen(false)}
              className="block py-2 text-sm font-semibold text-slate-700 dark:text-slate-200"
            >
              Pricing & Savings Calculator
            </a>
            <a 
              href="#faq" 
              onClick={() => setMobileMenuOpen(false)}
              className="block py-2 text-sm font-semibold text-slate-700 dark:text-slate-200"
            >
              Frequently Asked Questions
            </a>
            
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
              <button 
                type="button"
                onClick={() => { setMobileMenuOpen(false); navigate('/login?mode=signin'); }}
                className="w-full text-center py-2.5 text-sm font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-xl cursor-pointer"
              >
                Sign In
              </button>
              <button 
                type="button"
                onClick={() => { setMobileMenuOpen(false); navigate('/login?mode=signup'); }}
                className="w-full text-center py-2.5 text-sm font-bold text-white bg-blue-600 dark:bg-blue-500 rounded-xl shadow-md cursor-pointer"
              >
                Create Free Account
              </button>
            </div>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8 overflow-hidden relative">
        <div className="max-w-7xl mx-auto">
          
          {/* Regulatory Badges */}
          <div className="flex flex-wrap items-center justify-center gap-2.5 mb-8 animate-in fade-in duration-500">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-blue-50 dark:bg-blue-950/60 border border-blue-200/80 dark:border-blue-800/80 rounded-full text-blue-700 dark:text-blue-300 text-xs font-bold uppercase tracking-wider shadow-xs">
              <ShieldCheck size={14} className="text-blue-600 dark:text-blue-400" />
              <span>FMCSA 49 CFR § 391.41 Compliant</span>
            </div>
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/80 dark:border-indigo-800/80 rounded-full text-indigo-700 dark:text-indigo-300 text-xs font-bold uppercase tracking-wider shadow-xs">
              <Plane size={14} className="text-indigo-600 dark:text-indigo-400" />
              <span>FAA 14 CFR Part 67 Sleep Rubrics</span>
            </div>
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200/80 dark:border-emerald-800/80 rounded-full text-emerald-700 dark:text-emerald-300 text-xs font-bold uppercase tracking-wider shadow-xs">
              <Zap size={14} className="text-emerald-600 dark:text-emerald-400" />
              <span>5-Second Instant Determination</span>
            </div>
          </div>

          {/* Main Headline */}
          <div className="text-center max-w-4xl mx-auto space-y-6">
            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-[1.08]">
              Instant FMCSA & FAA <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 dark:from-blue-400 dark:via-indigo-400 dark:to-blue-300">
                CPAP Compliance Letters
              </span>
            </h1>

            <p className="text-base sm:text-xl text-slate-600 dark:text-slate-300 max-w-2xl mx-auto leading-relaxed">
              Never get turned away from your commercial driver medical exam or flight physical. Upload any CPAP sleep report from ResMed, Philips, or Fisher & Paykel and get a certified determination letter in seconds.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              <button
                type="button"
                onClick={() => navigate('/login?mode=signup')}
                className="w-full sm:w-auto px-8 py-4 rounded-2xl font-bold bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white text-base sm:text-lg transition-all flex items-center justify-center gap-2 shadow-xl shadow-blue-500/25 hover:scale-[1.02] cursor-pointer"
              >
                <span>Upload Report ($9 / Free Starter)</span>
                <ChevronRight size={20} />
              </button>

              <a
                href="#simulator"
                className="w-full sm:w-auto px-6 py-4 rounded-2xl font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-base transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Play size={18} className="text-blue-600 dark:text-blue-400" />
                <span>Test Live Demo Simulator</span>
              </a>
            </div>

            {/* Social Trust Metrics */}
            <div className="pt-8 flex flex-wrap items-center justify-center gap-6 sm:gap-12 text-slate-500 dark:text-slate-400 text-xs sm:text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={18} className="text-emerald-600 dark:text-emerald-400" />
                <span><strong className="text-slate-900 dark:text-white">10,000+</strong> Audits Processed</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 size={18} className="text-emerald-600 dark:text-emerald-400" />
                <span><strong className="text-slate-900 dark:text-white">99.8%</strong> NRCME Examiner Acceptance</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 size={18} className="text-emerald-600 dark:text-emerald-400" />
                <span><strong className="text-slate-900 dark:text-white">All CPAP Brands</strong> Compatible</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive CPAP Compliance Simulator (Feature Spotlight) */}
      <section id="simulator" className="py-20 px-4 sm:px-6 lg:px-8 bg-slate-50 dark:bg-[#0f172a]/60 border-y border-slate-200/80 dark:border-slate-800">
        <div className="max-w-7xl mx-auto space-y-12">
          
          <div className="text-center max-w-3xl mx-auto space-y-3">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 rounded-full text-xs font-bold uppercase tracking-wider">
              <Sparkles size={14} />
              <span>Interactive Clinical Extraction Engine</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Test Real-World Compliance Scenarios
            </h2>
            <p className="text-slate-600 dark:text-slate-300 text-sm sm:text-base leading-relaxed">
              Click on any commercial operator profile below to test how ComplyZzz parses machine data and calculates 70% rule compliance in real time.
            </p>
          </div>

          {/* Scenario Selector Pills */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
            {SAMPLE_SCENARIOS.map((scenario) => {
              const isSelected = activeScenario.id === scenario.id;
              return (
                <button
                  key={scenario.id}
                  type="button"
                  onClick={() => simulateScenario(scenario)}
                  className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex items-start gap-3.5 relative ${
                    isSelected
                      ? 'bg-white dark:bg-[#0b0f19] border-blue-600 dark:border-blue-500 shadow-md ring-2 ring-blue-500/20'
                      : 'bg-white/60 dark:bg-[#0b0f19]/40 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 shrink-0 mt-0.5">
                    {scenario.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{scenario.role}</p>
                    <p className="text-sm font-extrabold text-slate-900 dark:text-white mt-0.5">{scenario.name}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-1">{scenario.device}</p>
                  </div>
                  {isSelected && (
                    <span className="w-2 h-2 rounded-full bg-blue-600 dark:bg-blue-400 absolute top-3 right-3 animate-ping" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Simulator Card Display */}
          <div className="bg-white dark:bg-[#0b0f19] rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-xl max-w-4xl mx-auto space-y-6 transition-all">
            
            {/* Top Bar with Status Pill */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-50 dark:bg-blue-950/60 rounded-2xl text-blue-600 dark:text-blue-400">
                  <FileCheck size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span>Clinical Compliance Determination</span>
                    {isSimulating && <RotateCcw size={16} className="animate-spin text-blue-600" />}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Target: {activeScenario.name} • {activeScenario.device}
                  </p>
                </div>
              </div>

              {/* Status Badge */}
              <div>
                {activeScenario.fmcsaStatus === 'COMPLIANT' ? (
                  <span className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/80 text-emerald-700 dark:text-emerald-300 rounded-full text-xs font-extrabold uppercase tracking-wider">
                    <CheckCircle2 size={16} />
                    <span>FMCSA Compliant (Pass)</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800/80 text-amber-700 dark:text-amber-300 rounded-full text-xs font-extrabold uppercase tracking-wider">
                    <AlertTriangle size={16} />
                    <span>Conditional (Review)</span>
                  </span>
                )}
              </div>
            </div>

            {/* Extracted Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-4 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-100 dark:border-slate-800">
                <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Compliance Rate</p>
                <p className={`text-2xl font-extrabold mt-1 ${
                  Math.round((activeScenario.daysCompliant / activeScenario.totalDays) * 100) >= 70
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-amber-600 dark:text-amber-400'
                }`}>
                  {Math.round((activeScenario.daysCompliant / activeScenario.totalDays) * 100)}%
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">FMCSA Req: &ge; 70%</p>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-100 dark:border-slate-800">
                <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Nights &ge; 4.0 Hrs</p>
                <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">
                  {activeScenario.daysCompliant} <span className="text-xs font-normal text-slate-500">/ {activeScenario.totalDays} days</span>
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">Evaluation window</p>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-100 dark:border-slate-800">
                <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Average Daily Usage</p>
                <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">
                  {activeScenario.avgHours} <span className="text-xs font-normal text-slate-500">hrs/day</span>
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">FAA Target: &ge; 6.0 hrs</p>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-100 dark:border-slate-800">
                <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">AHI Event Score</p>
                <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">
                  {activeScenario.ahi} <span className="text-xs font-normal text-slate-500">events/hr</span>
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">Normal: &lt; 5.0</p>
              </div>
            </div>

            {/* Highlight Banner */}
            <div className="p-4 bg-blue-50/70 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/60 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5 text-blue-900 dark:text-blue-200">
                <Check className="text-blue-600 dark:text-blue-400 shrink-0" size={16} />
                <span className="font-semibold">{activeScenario.highlight}</span>
              </div>

              <button
                type="button"
                onClick={() => navigate('/login')}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition-colors shrink-0 cursor-pointer"
              >
                Audit Your PDF
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Target Audience Solutions Section */}
      <section id="solutions" className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto space-y-16">
          
          <div className="text-center max-w-3xl mx-auto space-y-4">
            <p className="text-blue-600 dark:text-blue-400 font-bold text-xs uppercase tracking-widest">
              Tailored Workflows
            </p>
            <h2 className="text-3xl sm:text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Built for Every Transportation Stakeholder
            </h2>
            <p className="text-slate-600 dark:text-slate-300 text-base sm:text-lg">
              Whether you are an independent owner-operator taking a medical exam today or a clinic examining 50 drivers a week.
            </p>
          </div>

          {/* Audience Solution Tabs */}
          <div className="flex flex-wrap items-center justify-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-4">
            {[
              { id: 'drivers', label: 'Commercial Drivers (CDL)', icon: <Truck size={16} /> },
              { id: 'pilots', label: 'Commercial Pilots (FAA)', icon: <Plane size={16} /> },
              { id: 'examiners', label: 'DOT Medical Examiners (NRCME)', icon: <Stethoscope size={16} /> },
              { id: 'fleets', label: 'Fleet Safety Managers', icon: <Building2 size={16} /> },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveAudienceTab(tab.id as any)}
                className={`px-5 py-3 rounded-2xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 cursor-pointer ${
                  activeAudienceTab === tab.id
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-md'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Tab Content Display */}
          <div className="grid lg:grid-cols-2 gap-12 items-center max-w-5xl mx-auto">
            {activeAudienceTab === 'drivers' && (
              <>
                <div className="space-y-6">
                  <span className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 px-3 py-1 rounded-full">
                    For Truck & Bus Drivers
                  </span>
                  <h3 className="text-3xl font-bold text-slate-900 dark:text-white">
                    Pass Your DOT Physical Exam Without 30-Day Delays
                  </h3>
                  <p className="text-slate-600 dark:text-slate-300 leading-relaxed text-sm sm:text-base">
                    Don't get turned away or issued a temporary 30-day card because your CPAP compliance paperwork is missing. Upload your machine's sleep report and download a certified medical examiner determination letter instantly.
                  </p>
                  <ul className="space-y-3 text-sm text-slate-700 dark:text-slate-300">
                    <li className="flex items-center gap-3">
                      <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
                      <span>Instant SMS link delivered straight to your phone at the clinic</span>
                    </li>
                    <li className="flex items-center gap-3">
                      <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
                      <span>Only $9 per certified report (no recurring commitment)</span>
                    </li>
                    <li className="flex items-center gap-3">
                      <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
                      <span>Accepted by certified DOT examiners nationwide</span>
                    </li>
                  </ul>
                  <button
                    type="button"
                    onClick={() => navigate('/login')}
                    className="px-6 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm transition-all shadow-md cursor-pointer"
                  >
                    Audit Driver Report ($9)
                  </button>
                </div>
                <div className="p-6 bg-slate-100 dark:bg-slate-900/80 rounded-3xl border border-slate-200 dark:border-slate-800 space-y-4">
                  <div className="flex items-center gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
                    <Smartphone className="text-blue-600 dark:text-blue-400" size={24} />
                    <div>
                      <p className="font-bold text-slate-900 dark:text-white text-sm">Encrypted SMS Letter Link</p>
                      <p className="text-xs text-slate-500">Delivered directly to driver handset</p>
                    </div>
                  </div>
                  <div className="bg-white dark:bg-[#0b0f19] p-4 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs font-mono space-y-2 text-slate-600 dark:text-slate-300">
                    <p className="text-blue-600 dark:text-blue-400 font-bold">ComplyZzz Alert:</p>
                    <p>CPAP audit for Vance, Marcus: COMPLIANT (86.7% over 30 days). Determination letter certified.</p>
                    <p className="text-slate-400 text-[10px]">https://complyzzz.com/r/cert_892910</p>
                  </div>
                </div>
              </>
            )}

            {activeAudienceTab === 'pilots' && (
              <>
                <div className="space-y-6">
                  <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950 px-3 py-1 rounded-full">
                    For Aviators & Flight Crews
                  </span>
                  <h3 className="text-3xl font-bold text-slate-900 dark:text-white">
                    FAA 6-Hour Sleep Rubrics for Class 1, 2, and 3 AMEs
                  </h3>
                  <p className="text-slate-600 dark:text-slate-300 leading-relaxed text-sm sm:text-base">
                    Federal Aviation Administration medical guidelines require stringent 6.0+ hour daily compliance metrics and low AHI indices. ComplyZzz verifies FAA medical rubric standards automatically.
                  </p>
                  <ul className="space-y-3 text-sm text-slate-700 dark:text-slate-300">
                    <li className="flex items-center gap-3">
                      <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
                      <span>FAA 6-hour daily average rubric validation</span>
                    </li>
                    <li className="flex items-center gap-3">
                      <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
                      <span>Comprehensive 90-day and 180-day longitudinal tracking</span>
                    </li>
                    <li className="flex items-center gap-3">
                      <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
                      <span>Ready for Aviation Medical Examiner (AME) submission</span>
                    </li>
                  </ul>
                  <button
                    type="button"
                    onClick={() => navigate('/login')}
                    className="px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm transition-all shadow-md cursor-pointer"
                  >
                    Audit Pilot Flight Report
                  </button>
                </div>
                <div className="p-6 bg-indigo-50/50 dark:bg-indigo-950/30 rounded-3xl border border-indigo-100 dark:border-indigo-900/60 space-y-4">
                  <div className="flex items-center gap-3 border-b border-indigo-100 dark:border-indigo-900/60 pb-4">
                    <Plane className="text-indigo-600 dark:text-indigo-400" size={24} />
                    <div>
                      <p className="font-bold text-slate-900 dark:text-white text-sm">FAA Sleep Apnea Protocol</p>
                      <p className="text-xs text-slate-500">14 CFR Part 67 Specification</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="p-3 bg-white dark:bg-[#0b0f19] rounded-xl border border-slate-200 dark:border-slate-800">
                      <p className="text-slate-400">FAA Rubric Status</p>
                      <p className="font-bold text-emerald-600 mt-1">COMPLIANT (PASS)</p>
                    </div>
                    <div className="p-3 bg-white dark:bg-[#0b0f19] rounded-xl border border-slate-200 dark:border-slate-800">
                      <p className="text-slate-400">Mean Sleep Time</p>
                      <p className="font-bold text-slate-900 dark:text-white mt-1">7.2 hrs/night</p>
                    </div>
                  </div>
                </div>
              </>
            )}

            {activeAudienceTab === 'examiners' && (
              <>
                <div className="space-y-6">
                  <span className="text-xs font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950 px-3 py-1 rounded-full">
                    For Occupational Clinics & NRCME
                  </span>
                  <h3 className="text-3xl font-bold text-slate-900 dark:text-white">
                    Standardize CPAP Audits in 5 Seconds Instead of 15 Minutes
                  </h3>
                  <p className="text-slate-600 dark:text-slate-300 leading-relaxed text-sm sm:text-base">
                    Eliminate manual date calculations, illegible vendor sleep sheets, and examiner math errors. ComplyZzz ingests any vendor PDF and outputs an audit-proof clinical determination letter.
                  </p>
                  <ul className="space-y-3 text-sm text-slate-700 dark:text-slate-300">
                    <li className="flex items-center gap-3">
                      <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
                      <span>Batch multi-file upload queue (process 10 files simultaneously)</span>
                    </li>
                    <li className="flex items-center gap-3">
                      <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
                      <span>Custom clinic branding, NPI number, and examiner digital signature</span>
                    </li>
                    <li className="flex items-center gap-3">
                      <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
                      <span>Unlimited Clinic plan for $250/mo (fixed cost predictability)</span>
                    </li>
                  </ul>
                  <button
                    type="button"
                    onClick={() => navigate('/login')}
                    className="px-6 py-3 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm transition-all shadow-md cursor-pointer"
                  >
                    Start Clinic Unlimited Tier
                  </button>
                </div>
                <div className="p-6 bg-purple-50/50 dark:bg-purple-950/30 rounded-3xl border border-purple-100 dark:border-purple-900/60 space-y-4">
                  <div className="flex items-center gap-3 border-b border-purple-100 dark:border-purple-900/60 pb-4">
                    <Stethoscope className="text-purple-600 dark:text-purple-400" size={24} />
                    <div>
                      <p className="font-bold text-slate-900 dark:text-white text-sm">Medical Examiner Signature</p>
                      <p className="text-xs text-slate-500">Pre-formatted for NRCME audit trails</p>
                    </div>
                  </div>
                  <div className="p-3 bg-white dark:bg-[#0b0f19] rounded-xl border border-slate-200 dark:border-slate-800 text-xs space-y-1.5">
                    <p className="text-slate-500">Certified Examiner: <strong>Dr. Jonathan Hayes, MD</strong></p>
                    <p className="text-slate-500">NRCME Registry: <strong>#8492019482</strong></p>
                    <p className="text-slate-500">Determination: <strong className="text-emerald-600">FMCSA Qualified (1-Year Certificate)</strong></p>
                  </div>
                </div>
              </>
            )}

            {activeAudienceTab === 'fleets' && (
              <>
                <div className="space-y-6">
                  <span className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 px-3 py-1 rounded-full">
                    For Fleet Safety Directors
                  </span>
                  <h3 className="text-3xl font-bold text-slate-900 dark:text-white">
                    Protect Carrier Safety Scores & Prevent Out-of-Service Holds
                  </h3>
                  <p className="text-slate-600 dark:text-slate-300 leading-relaxed text-sm sm:text-base">
                    Ensure 100% of your fleet drivers diagnosed with Obstructive Sleep Apnea (OSA) remain compliant with FMCSA requirements before their medical certificates expire.
                  </p>
                  <ul className="space-y-3 text-sm text-slate-700 dark:text-slate-300">
                    <li className="flex items-center gap-3">
                      <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
                      <span>Automated email scorecards sent to safety department & driver</span>
                    </li>
                    <li className="flex items-center gap-3">
                      <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
                      <span>Centralized permanent cloud vault with instant search</span>
                    </li>
                    <li className="flex items-center gap-3">
                      <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
                      <span>Early warning alerts when driver usage dips below 70%</span>
                    </li>
                  </ul>
                  <button
                    type="button"
                    onClick={() => navigate('/login')}
                    className="px-6 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm transition-all shadow-md cursor-pointer"
                  >
                    Set Up Fleet Compliance
                  </button>
                </div>
                <div className="p-6 bg-slate-100 dark:bg-slate-900/80 rounded-3xl border border-slate-200 dark:border-slate-800 space-y-4">
                  <div className="flex items-center gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
                    <Building2 className="text-blue-600 dark:text-blue-400" size={24} />
                    <div>
                      <p className="font-bold text-slate-900 dark:text-white text-sm">Fleet Scorecard Dispatch</p>
                      <p className="text-xs text-slate-500">Automated Resend email notifications</p>
                    </div>
                  </div>
                  <div className="p-3 bg-white dark:bg-[#0b0f19] rounded-xl border border-slate-200 dark:border-slate-800 text-xs space-y-1 text-slate-600 dark:text-slate-300">
                    <p className="font-bold text-slate-900 dark:text-white">Apex Logistics Fleet Audit Summary</p>
                    <p>14 Drivers Evaluated • 13 Compliant (92.8%) • 1 Driver in Grace Window</p>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Machine & Brand Compatibility Matrix */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-slate-50 dark:bg-[#0f172a]/40 border-y border-slate-200/80 dark:border-slate-800">
        <div className="max-w-7xl mx-auto text-center space-y-8">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
            Universal CPAP Machine & Data Software Compatibility
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 max-w-4xl mx-auto">
            {[
              'ResMed AirSense 10 & 11',
              'ResMed AirView & myAir',
              'Philips Respironics DreamStation 1 & 2',
              'Philips Care Orchestrator',
              'Fisher & Paykel SleepStyle',
              'DeVilbiss IntelliPAP 1 & 2',
              'Transcend 3 / Micro CPAP',
              'Somnetics Transcend',
              'Breas Medical Z1 / Z2',
              '3B Medical Luna II / G3',
            ].map((brand) => (
              <span
                key={brand}
                className="px-4 py-2 bg-white dark:bg-[#0b0f19] rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 shadow-xs"
              >
                {brand}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works (Visual 3-Step Process) */}
      <section id="how-it-works" className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto space-y-16">
          <div className="text-center max-w-3xl mx-auto space-y-4">
            <p className="text-blue-600 dark:text-blue-400 font-bold text-xs uppercase tracking-widest">
              Simple 3-Step Flow
            </p>
            <h2 className="text-3xl sm:text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              From Raw Sleep PDF to Certified Letter
            </h2>
            <p className="text-slate-600 dark:text-slate-300 text-base sm:text-lg">
              No manual calculations, no software installations. Everything runs securely in your browser.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-white dark:bg-[#0b0f19] p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4 relative">
              <div className="w-12 h-12 rounded-2xl bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-extrabold text-xl flex items-center justify-center">
                1
              </div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">Upload Sleep Report</h3>
              <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed">
                Drag and drop your CPAP compliance PDF from ResMed, Philips, or any other vendor export. Multiple file batch uploads supported.
              </p>
            </div>

            <div className="bg-white dark:bg-[#0b0f19] p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4 relative">
              <div className="w-12 h-12 rounded-2xl bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 font-extrabold text-xl flex items-center justify-center">
                2
              </div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">Instant AI Verification</h3>
              <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed">
                Gemini AI extracts total nights, nights &ge; 4.0 hours, daily averages, and AHI scores, instantly checking against the 70% FMCSA and FAA rubrics.
              </p>
            </div>

            <div className="bg-white dark:bg-[#0b0f19] p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4 relative">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 font-extrabold text-xl flex items-center justify-center">
                3
              </div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">Certified Delivery</h3>
              <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed">
                Download a clean clinical determination letter, print directly for your medical examiner, or send automated SMS and email scorecards.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Pricing & ROI Savings Calculator */}
      <section id="calculator" className="py-24 px-4 sm:px-6 lg:px-8 bg-slate-50 dark:bg-[#0f172a]/60 border-y border-slate-200/80 dark:border-slate-800">
        <div className="max-w-7xl mx-auto space-y-16">
          
          <div className="text-center max-w-3xl mx-auto space-y-4">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 rounded-full text-xs font-bold uppercase tracking-wider">
              <BadgePercent size={14} />
              <span>Transparent Pricing & ROI Calculator</span>
            </div>
            <h2 className="text-3xl sm:text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Simple Flat Pricing. Massive Efficiency.
            </h2>
            <p className="text-slate-600 dark:text-slate-300 text-base sm:text-lg">
              Individual operators pay per report. Clinics and fleets enjoy unlimited processing for $250/month.
            </p>
          </div>

          {/* Interactive Slider */}
          <div className="bg-white dark:bg-[#0b0f19] rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-10 shadow-xl max-w-4xl mx-auto space-y-8">
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <label className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                  <Sliders size={16} className="text-blue-600 dark:text-blue-400" />
                  <span>Estimated Monthly CPAP Audits</span>
                </label>
                <span className="text-2xl font-extrabold text-blue-600 dark:text-blue-400">
                  {monthlyVolume} {monthlyVolume === 1 ? 'Report' : 'Reports'} / month
                </span>
              </div>

              <input
                type="range"
                min="1"
                max="250"
                step="1"
                value={monthlyVolume}
                onChange={(e) => setMonthlyVolume(Number(e.target.value))}
                className="w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />

              <div className="flex justify-between text-xs text-slate-400 font-medium">
                <span>1 Driver (Individual)</span>
                <span>50 Drivers (Clinic)</span>
                <span>150 Drivers (Multi-Location)</span>
                <span>250+ Drivers (Fleet)</span>
              </div>
            </div>

            {/* Comparison Grid */}
            <div className="grid md:grid-cols-2 gap-6 pt-6 border-t border-slate-100 dark:border-slate-800">
              
              {/* Option A: Pay-As-You-Go */}
              <div className={`p-6 rounded-2xl border transition-all ${
                recommendedPlan === 'per_report'
                  ? 'border-blue-600 dark:border-blue-500 bg-blue-50/50 dark:bg-blue-950/20'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40'
              }`}>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Pay-As-You-Go ($9/ea)</p>
                <p className="text-3xl font-extrabold text-slate-900 dark:text-white mt-2">${volumePerReportCost}</p>
                <p className="text-xs text-slate-500 mt-1">Total monthly cost at ${9}/report</p>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-4 leading-relaxed">
                  Best for individual commercial drivers and occasional physical certification exams.
                </p>
              </div>

              {/* Option B: Unlimited Clinic Plan */}
              <div className={`p-6 rounded-2xl border transition-all relative ${
                recommendedPlan === 'unlimited'
                  ? 'border-blue-600 dark:border-blue-500 bg-blue-50/70 dark:bg-blue-950/40 shadow-md'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40'
              }`}>
                {recommendedPlan === 'unlimited' && (
                  <span className="absolute -top-3 right-4 bg-blue-600 text-white text-[10px] font-extrabold uppercase tracking-wider px-3 py-0.5 rounded-full">
                    Recommended Plan
                  </span>
                )}
                <p className="text-xs font-bold text-blue-700 dark:text-blue-300 uppercase tracking-wider">Clinic Unlimited Plan</p>
                <p className="text-3xl font-extrabold text-slate-900 dark:text-white mt-2">$250 <span className="text-sm font-normal text-slate-500">/ month</span></p>
                <p className="text-xs text-slate-500 mt-1">Unlimited reports & batch multi-file queue</p>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-4 leading-relaxed">
                  Save <strong className="text-emerald-600 dark:text-emerald-400">${Math.max(0, volumePerReportCost - 250)}/mo</strong> compared to single reports!
                </p>
              </div>
            </div>

            {/* Savings & Efficiency Callout */}
            <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
              <div className="flex items-center gap-3 text-emerald-800 dark:text-emerald-200">
                <CheckCircle2 size={20} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>
                  Estimated Examiner Time Saved: <strong className="font-extrabold text-sm">{estimatedHoursSaved} Hours/Month</strong>
                </span>
              </div>

              <button
                type="button"
                onClick={() => navigate('/login?mode=signup')}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-colors cursor-pointer shrink-0 shadow-xs"
              >
                Choose This Plan
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Security & Confidentiality Section */}
      <section className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 rounded-full text-xs font-bold uppercase tracking-wider">
              <Lock size={14} />
              <span>Enterprise Privacy Architecture</span>
            </div>
            <h2 className="text-3xl sm:text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Medical Privacy & Security First
            </h2>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed text-base">
              We know healthcare compliance and driver medical privacy are paramount. ComplyZzz processes records in compliance with rigorous healthcare data security standards.
            </p>
            <div className="space-y-4 pt-2">
              <div className="flex items-start gap-3">
                <ShieldCheck size={20} className="text-emerald-600 dark:text-emerald-400 mt-1 shrink-0" />
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-white text-sm">256-Bit TLS Encryption</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">All files are processed through encrypted pipelines with zero public storage exposure.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <ShieldCheck size={20} className="text-emerald-600 dark:text-emerald-400 mt-1 shrink-0" />
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-white text-sm">Zero Model Training on Patient Data</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Your sleep logs and driver records are never used to train public or commercial AI models.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <ShieldCheck size={20} className="text-emerald-600 dark:text-emerald-400 mt-1 shrink-0" />
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-white text-sm">Role-Based Access Controls (RBAC)</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Strict Firestore security rules ensure drivers only see their own audits and clinics see their verified roster.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-slate-900 text-white p-8 rounded-3xl border border-slate-800 shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <span className="font-mono text-xs text-slate-400">SECURITY_COMPLIANCE_PROTOCOL</span>
              <span className="text-xs font-bold text-emerald-400 bg-emerald-950/80 px-2.5 py-1 rounded-full">ACTIVE</span>
            </div>
            <div className="font-mono text-xs space-y-3 text-slate-300 leading-relaxed">
              <p><span className="text-blue-400">✓ FMCSA:</span> 49 CFR § 391.41 standard rubric verified</p>
              <p><span className="text-blue-400">✓ FAA:</span> 14 CFR Part 67 medical documentation ready</p>
              <p><span className="text-blue-400">✓ ENCRYPTION:</span> AES-256 at rest & TLS 1.3 in transit</p>
              <p><span className="text-blue-400">✓ AUDIT TRAILS:</span> Examiner NPI & timestamp logged</p>
            </div>
            <div className="p-4 bg-slate-800/80 rounded-2xl border border-slate-700 text-xs text-slate-400">
              Compliant with National Registry of Certified Medical Examiners (NRCME) audit standards.
            </div>
          </div>
        </div>
      </section>

      {/* Frequently Asked Questions Accordion */}
      <section id="faq" className="py-24 px-4 sm:px-6 lg:px-8 bg-slate-50 dark:bg-[#0f172a]/60 border-t border-slate-200/80 dark:border-slate-800">
        <div className="max-w-4xl mx-auto space-y-12">
          
          <div className="text-center space-y-3">
            <p className="text-blue-600 dark:text-blue-400 font-bold text-xs uppercase tracking-widest">
              Common Questions
            </p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Frequently Asked Questions
            </h2>
            <p className="text-slate-600 dark:text-slate-300 text-sm sm:text-base">
              Everything you need to know about DOT physical CPAP compliance letters.
            </p>
          </div>

          <div className="space-y-4">
            {[
              {
                q: "What is the FMCSA 70% CPAP compliance rule for DOT physicals?",
                a: "Under FMCSA medical guidelines, commercial drivers diagnosed with Obstructive Sleep Apnea (OSA) must demonstrate CPAP machine usage for at least 4.0 hours per night on at least 70% of days across a consecutive 30-day (or 90-day for annual renewals) evaluation period."
              },
              {
                q: "Will this determination letter be accepted by my DOT Medical Examiner?",
                a: "Yes. ComplyZzz formats its clinical determination letters to strictly mirror standard NRCME and FMCSA compliance audit templates. It clearly lists the driver's name, evaluation period, percentage compliance, mean usage hours, AHI score, and includes fields for the medical examiner's NPI and signature."
              },
              {
                q: "What happens if my compliance is below 70% (e.g. 64%)?",
                a: "If your compliance is between 50% and 69%, ComplyZzz flags your report as 'CONDITIONAL'. The system calculates exactly how many additional 4+ hour nights are needed to reach 70% so you can fulfill your requirement before recertification."
              },
              {
                q: "How does the $9 per-report vs $250/month clinic plan work?",
                a: "If you are an individual driver or pilot, you only pay $9 when you generate a certified compliance letter. If you are an occupational health clinic or fleet safety department, the $250/month plan gives you unlimited report audits, multi-file batch uploads, and automated scorecard emails."
              },
              {
                q: "Which CPAP machine manufacturers are supported?",
                a: "ComplyZzz supports all major CPAP vendors, including ResMed (AirView, myAir, AirSense 10/11), Philips Respironics (Care Orchestrator, DreamStation 1/2), Fisher & Paykel (SleepStyle), DeVilbiss, Transcend, and Somnetics."
              },
            ].map((faq, idx) => {
              const isOpen = openFaqIndex === idx;
              return (
                <div
                  key={idx}
                  className="bg-white dark:bg-[#0b0f19] rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden transition-all shadow-xs"
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                    className="w-full p-5 text-left flex items-center justify-between gap-4 font-bold text-slate-900 dark:text-white text-sm sm:text-base cursor-pointer"
                  >
                    <span>{faq.q}</span>
                    {isOpen ? <ChevronUp size={18} className="shrink-0 text-blue-600" /> : <ChevronDown size={18} className="shrink-0 text-slate-400" />}
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-5 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed border-t border-slate-100 dark:border-slate-800 pt-3">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Final Conversion CTA Banner */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-slate-900 via-slate-900 to-blue-950 text-white relative overflow-hidden">
        <div className="max-w-4xl mx-auto text-center space-y-8 relative z-10">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-500/20 border border-blue-400/30 rounded-full text-blue-300 text-xs font-bold uppercase tracking-wider">
            <Zap size={14} />
            <span>Ready in Seconds</span>
          </div>

          <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight">
            Need a DOT or FAA CPAP Letter Today?
          </h2>

          <p className="text-slate-300 text-base sm:text-lg max-w-2xl mx-auto leading-relaxed">
            Upload your sleep PDF now and receive an official certified determination letter in 5 seconds. Avoid costly medical holds and get certified without stress.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <button
              type="button"
              onClick={() => navigate('/login?mode=signup')}
              className="w-full sm:w-auto px-8 py-4 rounded-2xl font-bold bg-blue-600 hover:bg-blue-500 text-white text-base transition-all shadow-xl shadow-blue-500/30 flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Get Started Now ($9 / Free Starter)</span>
              <ArrowRight size={18} />
            </button>

            <button
              type="button"
              onClick={() => navigate('/login?mode=signin')}
              className="w-full sm:w-auto px-6 py-4 rounded-2xl font-bold bg-slate-800 hover:bg-slate-700 text-white text-base border border-slate-700 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Examiner / Clinic Sign In</span>
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-950 text-slate-400 py-16 px-4 sm:px-6 lg:px-8 border-t border-slate-800/80 text-xs">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-10">
          
          <div className="space-y-4 md:col-span-2">
            <div className="flex items-center gap-3">
              <img
                src={logoImg}
                alt="ComplyZzz Logo"
                className="w-8 h-8 object-contain rounded-lg border border-slate-800"
                referrerPolicy="no-referrer"
              />
              <span className="font-extrabold text-xl text-white tracking-tight">
                Comply<span className="text-blue-500">Zzz</span>
              </span>
            </div>
            <p className="text-slate-400 max-w-sm leading-relaxed">
              Standardized CPAP compliance determination platform for commercial drivers, airline pilots, occupational health examiners, and motor carrier safety departments.
            </p>
            <p className="text-[11px] text-slate-500">
              Aligns with Federal Motor Carrier Safety Administration (FMCSA) 49 CFR § 391.41 & Federal Aviation Administration (FAA) 14 CFR Part 67 medical guidelines.
            </p>
          </div>

          <div className="space-y-3">
            <h4 className="font-bold text-white uppercase tracking-wider text-[11px]">Product & Solutions</h4>
            <ul className="space-y-2">
              <li><a href="#simulator" className="hover:text-white transition-colors">Live Demo Simulator</a></li>
              <li><a href="#solutions" className="hover:text-white transition-colors">Commercial Drivers (CDL)</a></li>
              <li><a href="#solutions" className="hover:text-white transition-colors">Aviation Medical Rubrics</a></li>
              <li><a href="#solutions" className="hover:text-white transition-colors">Occupational Clinics</a></li>
              <li><a href="#calculator" className="hover:text-white transition-colors">Pricing & ROI Calculator</a></li>
            </ul>
          </div>

          <div className="space-y-3">
            <h4 className="font-bold text-white uppercase tracking-wider text-[11px]">Compliance & Legal</h4>
            <ul className="space-y-2">
              <li><a href="#security" className="hover:text-white transition-colors">Security & Privacy Protocol</a></li>
              <li><a href="#faq" className="hover:text-white transition-colors">FMCSA 70% Compliance Rule</a></li>
              <li><a href="#faq" className="hover:text-white transition-colors">FAA 6-Hour Sleep Standard</a></li>
              <li><a href="/login" className="hover:text-white transition-colors">Operator Portal Access</a></li>
            </ul>
          </div>
        </div>

        <div className="max-w-7xl mx-auto mt-12 pt-6 border-t border-slate-800/60 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-slate-500">
          <p>© {new Date().getFullYear()} ComplyZzz Sleep Compliance Solutions. All rights reserved.</p>
          <p>Designed for DOT NRCME Medical Examiners, Pilots, and Transportation Personnel.</p>
        </div>
      </footer>
    </div>
  );
}
