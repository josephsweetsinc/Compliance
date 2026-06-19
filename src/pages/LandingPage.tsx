import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ThemeToggle } from '../components/ThemeToggle';
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
  History
} from 'lucide-react';

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white dark:bg-[#0b0f19] text-slate-900 dark:text-slate-100 font-sans selection:bg-blue-100 selection:text-blue-900 overflow-x-hidden transition-colors duration-200">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-[#0b0f19]/80 backdrop-blur-md border-b border-slate-100 dark:border-slate-800/60 transition-colors duration-200">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/src/assets/images/complyzzz_logo_1781018719318.png"
              alt="ComplyZzz Logo"
              className="w-10 h-10 object-contain rounded-xl shadow-md border border-slate-100 dark:border-slate-800"
              referrerPolicy="no-referrer"
            />
            <span className="font-extrabold text-2xl tracking-tight text-slate-950 dark:text-white">
              Comply<span className="text-blue-600 dark:text-blue-500">Zzz</span>
            </span>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Features</a>
            <a href="#how-it-works" className="text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">How it Works</a>
            <a href="#security" className="text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Security</a>
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <button 
              onClick={() => navigate('/login')}
              className="text-sm font-bold text-slate-700 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 transition-colors px-4 py-2 cursor-pointer"
            >
              Sign In
            </button>
            <button 
              onClick={() => navigate('/login')}
              className="bg-slate-900 dark:bg-blue-600 text-white px-5 py-2.5 rounded-full text-sm font-bold hover:bg-slate-800 dark:hover:bg-blue-700 transition-all shadow-lg shadow-slate-200 dark:shadow-none cursor-pointer"
            >
              Get Started
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6 overflow-hidden">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
          <div className="animate-in fade-in slide-in-from-left-4 duration-700">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 border border-blue-100 rounded-full text-blue-600 text-xs font-bold uppercase tracking-wider mb-6">
              <Zap size={14} />
              <span>Instant CPAP Compliance for Drivers & Pilots</span>
            </div>
            <h1 className="text-5xl lg:text-7xl font-bold leading-[1.1] mb-6 text-slate-900 tracking-tight">
              Instant FMCSA & FAA <br />
              <span className="text-blue-600 italic">CPAP Letters</span>
            </h1>
            <p className="text-lg text-slate-600 mb-8 max-w-xl leading-relaxed">
              Get your certified DOT physical or FAA medical CPAP compliance letters in seconds. Upload your CPAP report and instantly download a beautiful clinical-grade determination report.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <button 
                onClick={() => navigate('/login')}
                className="bg-blue-600 text-white px-8 py-4 rounded-2xl text-lg font-bold hover:bg-blue-700 transition-all shadow-xl shadow-blue-200 flex items-center justify-center gap-2 group"
              >
                <span>Generate Compliance Letter</span>
                <ChevronRight className="group-hover:translate-x-1 transition-transform" size={20} />
              </button>
              <div className="flex items-center gap-3 px-4">
                <div className="flex -space-x-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="w-8 h-8 rounded-full border-2 border-white bg-slate-200" />
                  ))}
                </div>
                <div className="text-xs text-slate-500 font-medium">
                  <span className="text-slate-900 font-bold">1,000+ Pilots & Drivers</span><br/>certified without delays
                </div>
              </div>
            </div>
          </div>
          
          <div className="relative animate-in fade-in zoom-in-95 duration-700 delay-300 fill-mode-both">
            <div className="aspect-[4/3] rounded-3xl bg-slate-100 overflow-hidden shadow-2xl relative z-10 border border-slate-200">
               <img 
                 src="https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&q=80&w=1200" 
                 alt="Healthcare Technology" 
                 className="w-full h-full object-cover"
                 referrerPolicy="no-referrer"
               />
               <div className="absolute inset-0 bg-gradient-to-tr from-blue-600/10 to-transparent pointer-events-none" />
            </div>
            
            {/* Floating UI Elements */}
            <div className="absolute -bottom-6 -left-6 bg-white p-4 rounded-2xl shadow-xl border border-slate-100 z-20 hidden md:block transition-transform hover:scale-110">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center">
                  <CheckCircle2 size={24} />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Status</p>
                  <p className="text-sm font-bold text-slate-800">Compliant (94%)</p>
                </div>
              </div>
            </div>

            <div className="absolute -top-6 -right-6 bg-slate-900 text-white p-4 rounded-2xl shadow-xl z-0 hidden md:block transition-transform hover:scale-110">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                  <Zap size={16} />
                </div>
                <p className="text-xs font-medium">Batch processing complete</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Grid */}
      <section id="features" className="py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-20">
            <p className="text-blue-600 font-bold text-sm uppercase tracking-widest mb-4">Powerful Features</p>
            <h2 className="text-4xl font-bold text-slate-900 mb-6">Engineered for Commercial Operators</h2>
            <p className="text-slate-600 text-lg">Our platform handles the hard work of reading CPAP sleep logs so you have instant verification records ready for your physical exam.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <FeatureCard 
              icon={<Terminal className="text-blue-600" />}
              title="AI Extraction"
              description="Extract total nights used, nights > 4 hours, and pressure settings automatically from any PDF compliance script or report."
            />
            <FeatureCard 
              icon={<Users className="text-blue-600" />}
              title="Owner-Operator Friendly"
              description="Works perfectly for individual drivers, commercial pilots, multi-vehicle fleets, or medical examiners looking to bypass medical delays."
            />
            <FeatureCard 
              icon={<Activity className="text-blue-600" />}
              title="Instant Determination"
              description="Immediate logic check against FMCSA guidelines (70% usage over 30 days) with visual indicators in your dashboard."
            />
            <FeatureCard 
              icon={<MessageSquare className="text-blue-600" />}
              title="SMS Secure Delivery"
              description="Send the verification letter and compliance certificate directly to your phone via an encrypted SMS link."
            />
            <FeatureCard 
              icon={<History className="text-blue-600" />}
              title="Audit Safe"
              description="Get a formal compliance letter with a detailed breakdown that meets all FHWA, FMCSA, and FAA medical evaluator guidelines."
            />
            <FeatureCard 
              icon={<Shield size={24} className="text-blue-600" />}
              title="Privacy First"
              description="We respect your medical privacy. Uploaded reports are automatically scrubbed on a secure 15-minute expiration timer."
            />
          </div>
        </div>
      </section>

      {/* How It Works (Visual Guide) */}
      <section id="how-it-works" className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col lg:flex-row gap-20 items-center">
            <div className="lg:w-1/2">
              <h2 className="text-4xl font-bold text-slate-900 mb-12">From PDF to Compliant <br />in three simple steps</h2>
              <div className="space-y-12">
                <Step 
                  number="01" 
                  title="Upload CPAP Report" 
                  description="Drag and drop your CPAP usage report generated by your machine's software of any major manufacturer (ResMed AirView, myAir, Philips, etc.)."
                />
                <Step 
                  number="02" 
                  title="Review Verification" 
                  description="Our AI extracts critical metrics and tests compliance status instantly based on standard DOT & FAA rubrics."
                />
                <Step 
                  number="03" 
                  title="Download Certificate" 
                  description="Download a clinical-grade verification letter or text it to yourself to present to your DOT medical examiner."
                />
              </div>
            </div>
            <div className="lg:w-1/2 relative">
               <div className="aspect-square bg-blue-50 rounded-[40px] flex items-center justify-center p-8 border border-blue-100 overflow-hidden">
                  <div className="w-full h-full bg-white rounded-3xl shadow-2xl border border-slate-100 p-8 flex flex-col gap-6">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600 font-bold">PDF</div>
                        <div className="font-bold text-sm">ResMed_Report_7282.pdf</div>
                      </div>
                      <CheckCircle2 className="text-emerald-500" size={20} />
                    </div>
                    <div className="space-y-4">
                      <div className="h-4 w-3/4 bg-slate-100 rounded-full" />
                      <div className="h-4 w-1/2 bg-slate-100 rounded-full" />
                      <div className="grid grid-cols-2 gap-4 pt-4">
                        <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                          <p className="text-[10px] text-emerald-600 font-bold uppercase truncate">Usage &gt; 4hrs</p>
                          <p className="text-lg font-bold text-emerald-700">74%</p>
                        </div>
                        <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
                          <p className="text-[10px] text-blue-600 font-bold uppercase truncate">Pressure</p>
                          <p className="text-lg font-bold text-blue-700">12.4</p>
                        </div>
                      </div>
                    </div>
                    <button className="mt-auto w-full bg-slate-900 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2">
                       <FileText size={18} />
                       <span>Download Compliance Letter</span>
                    </button>
                  </div>
               </div>
               
               {/* Decorative dots */}
               <div className="absolute top-0 right-0 -mr-12 -mt-12 grid grid-cols-6 gap-3 opacity-20 hidden lg:grid">
                 {[...Array(36)].map((_, i) => (
                   <div key={i} className="w-2 h-2 rounded-full bg-blue-600" />
                 ))}
               </div>
            </div>
          </div>
        </div>
      </section>

      {/* Security Section (Clean Utility Recipe) */}
      <section id="security" className="py-24 bg-slate-900 text-white overflow-hidden relative">
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <div className="h-full w-full" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '40px 40px' }} />
        </div>
        
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="grid lg:grid-cols-2 gap-20 items-center">
            <div>
              <h2 className="text-4xl font-bold mb-8 leading-tight">Built for Secure <br />Confidentiality</h2>
              <div className="space-y-8">
                <SecurityItem 
                  icon={<ShieldCheck className="text-emerald-400" />}
                  title="Secure Data Protocols"
                  description="All communication is encrypted using state-of-the-art secure transmission protocols."
                />
                <SecurityItem 
                  icon={<Zap className="text-blue-400" />}
                  title="Zero-Retention Processing"
                  description="Our AI extracts strings on-the-fly and stores reports under an ephemeral expiration timer. No training on user data."
                />
                <SecurityItem 
                  icon={<Stethoscope className="text-purple-400" />}
                  title="DOT & FAA Standards Alignment"
                  description="Pre-validated metrics mapping designed to precisely meet DOT physicals and FAA clinical guidelines without extra review work."
                />
              </div>
            </div>
            <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700 p-8 rounded-[32px] shadow-2xl">
              <div className="flex items-center gap-2 mb-8">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-rose-500" />
                  <div className="w-3 h-3 rounded-full bg-amber-500" />
                  <div className="w-3 h-3 rounded-full bg-emerald-500" />
                </div>
                <div className="h-4 w-px bg-slate-700 mx-2" />
                <p className="text-[10px] text-slate-500 font-mono">security_audit_log.sh</p>
              </div>
              <div className="font-mono text-xs space-y-3 text-slate-400">
                <p><span className="text-blue-400">system:</span> checking database integrity...</p>
                <p><span className="text-emerald-400">success:</span> encryption keys verified.</p>
                <p><span className="text-slate-500">notice:</span> firewalled medical export detected.</p>
                <p><span className="text-blue-400">system:</span> 256-bit AES protection active.</p>
                <p><span className="text-blue-400">system:</span> zero-trust authentication engaged.</p>
                <div className="pt-4 border-t border-slate-700">
                  <div className="flex items-center justify-between">
                    <span>SECURITY_SCORE</span>
                    <span className="text-emerald-400 font-bold">100%</span>
                  </div>
                  <div className="mt-2 h-1.5 w-full bg-slate-700 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-emerald-400 w-full animate-in slide-in-from-left duration-1000"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-32 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-5xl font-bold text-slate-900 mb-8 leading-tight tracking-tight">Need a DOT/FAA CPAP Letter?</h2>
          <p className="text-xl text-slate-600 mb-12">Generate your official certified compliance letter instantly. Avoid delays in your medical certification exam.</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button 
              onClick={() => navigate('/login')}
              className="w-full sm:w-auto bg-blue-600 text-white px-10 py-5 rounded-2xl text-xl font-bold hover:bg-blue-700 transition-all shadow-2xl shadow-blue-200"
            >
              Get Started Now
            </button>
            <button 
              onClick={() => window.location.href = 'mailto:contact@dotcpap.com'}
              className="w-full sm:w-auto bg-white text-slate-900 border border-slate-200 px-10 py-5 rounded-2xl text-xl font-bold hover:bg-slate-50 transition-all font-sans"
            >
              Support Help
            </button>
          </div>
          <p className="mt-8 text-sm text-slate-400 font-medium tracking-wide">SECURE TEMPORARY HOUSING • NO WAIT TIMES</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-50 py-20 px-6 border-t border-slate-200">
        <div className="max-w-7xl mx-auto grid md:grid-cols-4 gap-12">
          <div className="col-span-2">
            <div className="flex items-center gap-3 mb-6">
              <img
                src="/src/assets/images/complyzzz_logo_1781018719318.png"
                alt="ComplyZzz Logo"
                className="w-8 h-8 object-contain rounded-lg shadow-sm border border-slate-100"
                referrerPolicy="no-referrer"
              />
              <span className="font-extrabold text-lg tracking-tight text-slate-950">
                Comply<span className="text-blue-600">Zzz</span>
              </span>
            </div>
            <p className="text-slate-500 max-w-sm mb-8 leading-relaxed italic">
              Empowering commercial drivers, pilots, and transportation personnel with automated sleep tools for instant FMCSA/FAA CPAP compliance verification.
            </p>
            <div className="flex gap-4">
              <SocialIcon />
              <SocialIcon />
              <SocialIcon />
            </div>
          </div>
          <div>
            <h4 className="font-bold text-slate-900 mb-6">Product</h4>
            <ul className="space-y-4 text-sm font-medium text-slate-600">
              <li><a href="#" className="hover:text-blue-600 transition-colors">Features</a></li>
              <li><a href="#" className="hover:text-blue-600 transition-colors">How it works</a></li>
              <li><a href="#" className="hover:text-blue-600 transition-colors">Pricing</a></li>
              <li><a href="#" className="hover:text-blue-600 transition-colors">API Docs</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold text-slate-900 mb-6">Privacy</h4>
            <ul className="space-y-4 text-sm font-medium text-slate-600">
              <li><a href="#" className="hover:text-blue-600 transition-colors">HIPAA Compliance</a></li>
              <li><a href="#" className="hover:text-blue-600 transition-colors">Privacy Policy</a></li>
              <li><a href="#" className="hover:text-blue-600 transition-colors">Terms of Service</a></li>
              <li><a href="#" className="hover:text-blue-600 transition-colors">Security Audit</a></li>
            </ul>
          </div>
        </div>
        <div className="max-w-7xl mx-auto mt-20 pt-8 border-t border-slate-200 text-center">
          <p className="text-slate-400 text-sm">© {new Date().getFullYear()} ComplyZzz Sleep Compliance Solutions. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <div className="p-8 bg-white rounded-3xl border border-slate-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all group">
      <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center mb-6 border border-blue-100 group-hover:bg-blue-600 group-hover:text-white transition-colors">
        {React.cloneElement(icon as React.ReactElement, { size: 28, className: "transition-colors" })}
      </div>
      <h3 className="text-xl font-bold text-slate-900 mb-4">{title}</h3>
      <p className="text-slate-600 leading-relaxed text-sm font-medium">{description}</p>
    </div>
  );
}

function Step({ number, title, description }: { number: string, title: string, description: string }) {
  return (
    <div className="flex gap-6 group">
      <div className="text-4xl font-bold text-blue-100 group-hover:text-blue-200 transition-colors font-mono">{number}</div>
      <div>
        <h4 className="text-xl font-bold text-slate-900 mb-2">{title}</h4>
        <p className="text-slate-600 leading-relaxed font-medium">{description}</p>
      </div>
    </div>
  );
}

function SecurityItem({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <div className="flex gap-5">
      <div className="flex-shrink-0 mt-1">{icon}</div>
      <div>
        <h4 className="text-lg font-bold text-white mb-2">{title}</h4>
        <p className="text-slate-400 text-sm leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

function SocialIcon() {
  return (
    <div className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-blue-600 hover:border-blue-600 transition-all cursor-pointer">
      <div className="w-4 h-4 bg-current rounded-sm" />
    </div>
  );
}
