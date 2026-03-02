import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader } from '@/components/ui/card';
import { AlertCircle, PieChart, Edit2, Check, X, Bug, ShieldCheck, Search, Bell, Calendar, Home, Folder, Users, Settings, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { updateProfile } from 'firebase/auth';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { collection, query, where, onSnapshot, doc, updateDoc, Timestamp, deleteDoc, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { format, differenceInDays, isBefore, startOfDay, isSameMonth, addMonths, subMonths } from 'date-fns';
import { tr } from 'date-fns/locale';

const CURRENCIES = [
    { code: 'TRY', symbol: '₺', label: 'TL' },
    { code: 'USD', symbol: '$', label: 'Dolar' },
    { code: 'EUR', symbol: '€', label: 'Euro' }
];

export default function Dashboard() {
    const navigate = useNavigate();
    const { user, impersonatedUser, rates, setRates } = useAuthStore();
    const activeUser = impersonatedUser || user;
    const [isEditing, setIsEditing] = useState(false);
    const [newName, setNewName] = useState("");
    const [loading, setLoading] = useState(false);

    // Main States
    const [overdueExpenses, setOverdueExpenses] = useState<any[]>([]);
    const [upcomingExpenses, setUpcomingExpenses] = useState<any[]>([]);
    const [pendingMembers, setPendingMembers] = useState<any[]>([]);
    const [myRole, setMyRole] = useState<'admin' | 'member'>(activeUser?.email === 'meoncu@gmail.com' ? 'admin' : 'member');
    const [familyId, setFamilyId] = useState<string | null>(null);
    const [currentMonthExpenses, setCurrentMonthExpenses] = useState<any[]>([]);
    const [selectedMonth, setSelectedMonth] = useState(new Date());

    // Fetch live rates
    useEffect(() => {
        const fetchRates = async () => {
            try {
                const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
                if (response.ok) {
                    const data = await response.json();
                    if (data && data.rates && data.rates.TRY) {
                        const tryBase = data.rates.TRY;
                        setRates({
                            'TRY': 1,
                            'USD': tryBase,
                            'EUR': tryBase / data.rates.EUR
                        }, new Date().toISOString());
                    }
                }
            } catch (err) {
                console.error("Rate fetch error:", err);
            }
        };
        fetchRates();
        const interval = setInterval(fetchRates, 30 * 60 * 1000);
        return () => clearInterval(interval);
    }, [setRates]);

    // Main Data Fetch
    useEffect(() => {
        if (!activeUser) return;

        // Fetch Categories first to filter orphaned expenses
        const qCats = query(collection(db, "categories"), where("userId", "==", activeUser.uid));
        const unsubCats = onSnapshot(qCats, (catSnap) => {
            const validCatIds = new Set();
            catSnap.forEach(d => validCatIds.add(d.id));

            // Fetch ALL Expenses for Dashboard
            const qAll = query(
                collection(db, "expenses"),
                where("userId", "==", activeUser.uid)
            );

            const unsubscribe = onSnapshot(qAll, (snapshot) => {
                const today = startOfDay(new Date());
                const overdue: any[] = [];
                const upcoming: any[] = [];
                const recent: any[] = [];
                let incomeSum = 0;
                let expenseSum = 0;

                // Personal assets breakdown and Monthly Summary Items
                const pAssets: Record<string, Record<string, number>> = {};
                const catMap: Record<string, { total: number, items: any[] }> = {};

                snapshot.forEach((doc) => {
                    const data = doc.data();
                    const item = { id: doc.id, ...data };

                    // SKIP if the category no longer exists
                    if (!validCatIds.has(data.categoryId)) return;

                    const dueDate = data.dueDate?.seconds ? new Date(data.dueDate.seconds * 1000) : null;
                    const date = data.date?.seconds ? new Date(data.date.seconds * 1000) : null;
                    const isIncome = data.type === 'income';
                    const currency = data.currency || 'TRY';
                    const amount = data.amount || 0;

                    const rate = rates[currency] || 1;
                    const amountInTry = amount * rate;

                    if (data.status === 'paid') {
                        if (isIncome) incomeSum += amountInTry;
                        else expenseSum += amountInTry;
                        recent.push({ ...item, dateObj: date || new Date(0) });
                    }

                    if (data.status === 'unpaid' && dueDate && data.type === 'expense' && !data.isAutoPay) {
                        if (isBefore(dueDate, today)) {
                            overdue.push({ ...item, dueDate });
                        } else if (isSameMonth(dueDate, today)) {
                            upcoming.push({ ...item, dueDate });
                        }
                    }

                    // Status: Both paid and unpaid for summary - Filter by ENTRY DATE (date) as requested
                    if (data.type === 'expense') {
                        const baseDate = data.date?.seconds ? new Date(data.date.seconds * 1000) :
                            (data.dueDate?.seconds ? new Date(data.dueDate.seconds * 1000) : null);

                        if (baseDate && isSameMonth(baseDate, selectedMonth)) {
                            const cat = data.categoryName || 'Diğer';
                            if (!catMap[cat]) catMap[cat] = { total: 0, items: [] };
                            catMap[cat].total += amountInTry;
                            catMap[cat].items.push({
                                name: data.name,
                                amount: data.amount,
                                currency: currency,
                                status: data.status
                            });
                        }
                    }

                    // Assets calculation
                    if (data.status === 'paid') {
                        const loc = data.location || 'Kasa';
                        if (!pAssets[currency]) pAssets[currency] = {};
                        if (!pAssets[currency][loc]) pAssets[currency][loc] = 0;
                        if (data.type === 'income') pAssets[currency][loc] += amount;
                        else pAssets[currency][loc] -= amount;
                    }
                });

                overdue.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
                upcoming.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

                setOverdueExpenses(overdue);
                setUpcomingExpenses(upcoming.slice(0, 5));

                const sortedSummary = Object.entries(catMap).map(([name, data]) => ({
                    name,
                    total: data.total,
                    items: data.items.sort((a, b) => b.amount - a.amount)
                })).sort((a, b) => b.total - a.total);
                setCurrentMonthExpenses(sortedSummary);
            });

            return () => unsubscribe();
        });

        // Fetch User Info
        const isOwner = activeUser.email === 'meoncu@gmail.com';
        const unsubscribeUser = onSnapshot(doc(db, "users", activeUser.uid), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setMyRole(isOwner ? 'admin' : (data.role || 'member'));
                setFamilyId(data.familyId || null);
            }
        });

        return () => {
            unsubCats();
            unsubscribeUser();
        };
    }, [activeUser, rates, selectedMonth]);

    // Pending Members Effect
    useEffect(() => {
        if (!activeUser || myRole !== 'admin') {
            setPendingMembers([]);
            return;
        }

        const q = familyId
            ? query(collection(db, "users"), where("familyId", "==", familyId), where("status", "==", "pending"))
            : query(collection(db, "users"), where("status", "==", "pending"));

        return onSnapshot(q, (snap) => {
            const members: any[] = [];
            snap.forEach(d => {
                if (d.id !== activeUser.uid) {
                    members.push({ id: d.id, ...d.data() });
                }
            });
            setPendingMembers(members);
        });
    }, [activeUser, myRole, familyId]);

    const handlePayExpense = async (id: string) => {
        if (!activeUser) return;
        try {
            await updateDoc(doc(db, "expenses", id), {
                status: 'paid',
                paidBy: activeUser.uid,
                paidByEmail: activeUser.displayName || activeUser.email,
                date: Timestamp.now()
            });
        } catch (err) {
            console.error(err);
        }
    };

    const handleApproveMember = async (id: string) => {
        await updateDoc(doc(db, "users", id), { status: 'active' });
    };

    const handleRejectMember = async (id: string) => {
        await deleteDoc(doc(db, "users", id));
    };

    const handleUpdateName = async () => {
        if (!user || !newName) return;
        setLoading(true);
        try {
            await updateProfile(user, { displayName: newName });
            setIsEditing(false);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 font-sans pb-24 animate-fade-in">
            {/* Header */}
            <header className="p-6 pt-10 pb-4 flex items-center justify-between">
                <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Merhaba,</p>
                    {isEditing ? (
                        <div className="flex items-center gap-2">
                            <Input value={newName} onChange={e => setNewName(e.target.value)} className="h-8 w-40 font-bold" autoFocus />
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-emerald-500" onClick={handleUpdateName} disabled={loading}><Check size={18} /></Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-rose-500" onClick={() => setIsEditing(false)}><X size={18} /></Button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 group">
                            <h1 className="text-3xl font-black tracking-tighter text-slate-900 lowercase">{activeUser.displayName || 'Kullanıcı'}</h1>
                            <button onClick={() => { setIsEditing(true); setNewName(activeUser.displayName || ''); }} className="opacity-0 group-hover:opacity-100 transition-opacity"><Edit2 size={14} className="text-muted-foreground" /></button>
                        </div>
                    )}
                </div>
                <div className="flex gap-2">
                    {myRole === 'admin' && (
                        <Button variant="ghost" size="icon" onClick={() => navigate('/admin')} className="bg-emerald-50 text-emerald-600 rounded-xl"><ShieldCheck size={20} /></Button>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => navigate('/debug')} className="bg-amber-50 text-orange-600 rounded-xl"><Bug size={20} /></Button>
                    <Button variant="ghost" size="icon" onClick={() => navigate('/search')} className="bg-blue-50 text-blue-600 rounded-xl"><Search size={20} /></Button>
                    <div className="w-10 h-10 rounded-2xl overflow-hidden border-2 border-white shadow-sm cursor-pointer" onClick={() => navigate('/profile')}>
                        {activeUser?.photoURL ? <img src={activeUser.photoURL} alt="profile" className="w-full h-full object-cover" /> : <div className="w-full h-full bg-slate-200 flex items-center justify-center font-bold text-slate-500">{activeUser?.displayName?.[0] || 'U'}</div>}
                    </div>
                </div>
            </header>

            <div className="px-6 space-y-6">
                {/* Monthly Summary High-End Card */}
                <Card className="border-none shadow-2xl bg-[#0f172a] overflow-hidden rounded-[2.5rem]">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full -mr-32 -mt-32 blur-3xl opacity-50" />
                    <CardHeader className="p-4">
                        <div className="flex justify-between items-center mb-4 text-white">
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-white hover:bg-white/10"
                                    onClick={() => setSelectedMonth(subMonths(selectedMonth, 1))}
                                >
                                    <ChevronLeft size={20} />
                                </Button>
                                <div className="bg-white/10 px-2.5 py-1 rounded-lg border border-white/10">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-primary-foreground/80">
                                        {format(selectedMonth, 'MMMM yyyy', { locale: tr })}
                                    </p>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-white hover:bg-white/10"
                                    onClick={() => setSelectedMonth(addMonths(selectedMonth, 1))}
                                >
                                    <ChevronRight size={20} />
                                </Button>
                            </div>
                            <div className="text-right">
                                <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest leading-none mb-1">Aylık Toplam Gider</p>
                                <p className="text-xl font-black text-rose-400 leading-none tabular-nums">
                                    ₺{currentMonthExpenses.reduce((sum, item) => sum + item.total, 0).toLocaleString('tr-TR')}
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                            {currentMonthExpenses.length > 0 ? (
                                currentMonthExpenses.map((group, idx) => (
                                    <div key={idx} className="flex flex-col gap-1.5 border-l border-white/10 pl-3">
                                        <div className="flex justify-between items-center mb-0.5">
                                            <span className="text-[10px] font-black text-white uppercase tracking-wider">
                                                {group.name}
                                            </span>
                                            <span className="text-[10px] font-black tabular-nums text-white/40">
                                                ₺{Math.round(group.total).toLocaleString('tr-TR')}
                                            </span>
                                        </div>
                                        <div className="space-y-1">
                                            {group.items.map((item, iIdx) => (
                                                <div key={iIdx} className="flex justify-between items-center opacity-70 group/item">
                                                    <span className="text-[9px] font-medium text-white/70 truncate pr-4">
                                                        {item.name}
                                                    </span>
                                                    <span className="text-[9px] font-bold tabular-nums text-white/90">
                                                        {CURRENCIES.find(c => c.code === item.currency)?.symbol || '₺'}{item.amount.toLocaleString('tr-TR')}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <p className="text-[10px] text-white/40 italic py-2">Bu ay henüz bir gider kaydı bulunmuyor.</p>
                            )}
                        </div>
                    </CardHeader>
                </Card>

                {/* Notifications / Pending Approval Panel */}
                {myRole === 'admin' && pendingMembers.length > 0 && (
                    <section className="mb-8 animate-in slide-in-from-top-4 duration-500">
                        <div className="flex items-center gap-2 mb-4 text-amber-600">
                            <Bell size={18} className="animate-bounce" /><h3 className="text-xs uppercase font-black tracking-widest">Giris Onayı Bekleyenler</h3>
                        </div>
                        <div className="space-y-3">
                            {pendingMembers.map(m => (
                                <Card key={m.id} className="border-amber-200 bg-amber-50/50 p-4 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center font-bold text-amber-700">{m.displayName?.[0] || 'U'}</div>
                                        <div><p className="font-bold text-sm leading-tight">{m.displayName || m.email}</p><p className="text-[10px] text-muted-foreground">Sisteme giriş isteği</p></div>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button size="sm" variant="outline" className="h-8 text-[10px] font-black uppercase text-rose-500" onClick={() => handleRejectMember(m.id)}>Reddet</Button>
                                        <Button size="sm" className="h-8 bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-black uppercase" onClick={() => handleApproveMember(m.id)}>Onayla</Button>
                                    </div>
                                </Card>
                            ))}
                        </div>
                    </section>
                )}

                {/* Overdue Expenses Section */}
                <section>
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2 text-rose-600">
                            <AlertCircle size={18} />
                            <h3 className="text-xs uppercase font-black tracking-widest">Geciken Ödemeler</h3>
                        </div>
                        {overdueExpenses.length > 0 && (
                            <span className="bg-rose-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full animate-pulse">
                                {overdueExpenses.length} ADET
                            </span>
                        )}
                    </div>

                    <div className="space-y-3">
                        {overdueExpenses.length > 0 ? (
                            overdueExpenses.map(exp => {
                                const dueDate = exp.dueDate?.seconds ? new Date(exp.dueDate.seconds * 1000) : new Date();
                                const diff = differenceInDays(startOfDay(new Date()), startOfDay(dueDate));
                                return (
                                    <div key={exp.id} className="flex items-center justify-between p-4 rounded-2xl bg-rose-500/[0.03] border border-rose-500/10 group hover:bg-rose-500/[0.06] transition-all cursor-pointer" onClick={() => navigate(`/categories?id=${exp.categoryId}`)}>
                                        <div className="flex items-center gap-4">
                                            <div className="h-10 w-10 rounded-xl bg-rose-500/10 flex items-center justify-center font-bold text-[9px] text-center leading-tight px-1 text-rose-600 shadow-sm">
                                                {exp.categoryName?.substring(0, 4) || '!'}
                                            </div>
                                            <div>
                                                <p className="font-bold text-sm text-rose-900 dark:text-rose-100">{exp.name}</p>
                                                <p className="text-[10px] text-rose-600 font-bold uppercase tracking-tight">{diff} GÜN GECİKTİ</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="font-black text-sm text-rose-700 tabular-nums">{CURRENCIES.find(c => c.code === (exp.currency || 'TRY'))?.symbol || '₺'}{exp.amount?.toLocaleString('tr-TR')}</span>
                                            <Button size="sm" className="h-8 bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-black rounded-lg px-3" onClick={(e) => { e.stopPropagation(); handlePayExpense(exp.id); }}>ÖDE</Button>
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            <div className="bg-emerald-500/5 border border-dashed border-emerald-500/20 rounded-3xl py-12 text-center group transition-all hover:bg-emerald-500/10">
                                <Check className="w-12 h-12 mx-auto mb-3 text-emerald-500 opacity-20 group-hover:opacity-40 transition-opacity" />
                                <p className="text-sm text-emerald-600 font-bold uppercase tracking-widest px-4">Harika! Gecikmiş ödemeniz bulunmuyor.</p>
                            </div>
                        )}
                    </div>
                </section>
            </div>

            {/* Bottom Nav */}
            <div className="fixed bottom-0 left-0 right-0 bg-background/80 backdrop-blur-xl border-t border-border p-3 px-6 flex justify-between items-center z-50 shadow-lg-up">
                <NavItem icon={<Home size={22} />} label="Özet" active onClick={() => navigate('/')} />
                <NavItem icon={<Folder size={22} />} label="Gruplar" onClick={() => navigate('/categories')} />
                <NavItem icon={<Users size={22} />} label="Aile" onClick={() => navigate('/family')} />
                <NavItem icon={<PieChart size={22} />} label="Analiz" onClick={() => navigate('/reports')} />
                <NavItem icon={<Settings size={22} />} label="Profil" onClick={() => navigate('/profile')} />
            </div>
        </div >
    );
}

function NavItem({ icon, label, active = false, onClick }: { icon: React.ReactNode, label: string, active?: boolean, onClick?: () => void }) {
    return (
        <button onClick={onClick} className={cn("flex flex-col items-center gap-1 p-2 rounded-xl transition-all min-w-[50px]", active ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground")}>
            {icon}
            <span className="text-[9px] font-bold uppercase tracking-tighter">{label}</span>
        </button>
    );
}
