import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowUpRight, ArrowDownRight, AlertCircle, Calendar, Home, Users, PieChart, Settings, Edit2, Check, X, Folder, Bell, ChevronRight, Bug } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { updateProfile } from 'firebase/auth';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { collection, query, where, onSnapshot, doc, updateDoc, Timestamp, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { format, differenceInDays, isBefore, startOfDay, isSameMonth } from 'date-fns';
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
    const [totalIncome, setTotalIncome] = useState(0);
    const [totalExpense, setTotalExpense] = useState(0);
    const [balance, setBalance] = useState(0);
    const [overdueExpenses, setOverdueExpenses] = useState<any[]>([]);
    const [upcomingExpenses, setUpcomingExpenses] = useState<any[]>([]);
    const [recentActivity, setRecentActivity] = useState<any[]>([]);
    const [pendingMembers, setPendingMembers] = useState<any[]>([]);
    const [myRole, setMyRole] = useState<'admin' | 'member'>('member');
    const [familyId, setFamilyId] = useState<string | null>(null);
    const [familyTotalBalance, setFamilyTotalBalance] = useState(0);
    const [familyAssets, setFamilyAssets] = useState<Record<string, Record<string, number>>>({}); // currency -> location -> total
    const [personalAssets, setPersonalAssets] = useState<Record<string, Record<string, number>>>({}); // currency -> location -> amount

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
    }, []);

    useEffect(() => {
        if (!activeUser) return;

        // Fetch ALL Expenses for Dashboard (Balance + Notifications)
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

            snapshot.forEach((doc) => {
                const data = doc.data();
                const item = { id: doc.id, ...data };
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

                if (data.status === 'unpaid' && dueDate && data.type === 'expense') {
                    if (isBefore(dueDate, today)) {
                        overdue.push({ ...item, dueDate });
                    } else if (isSameMonth(dueDate, today)) {
                        upcoming.push({ ...item, dueDate });
                    }
                }
            });

            overdue.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
            upcoming.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
            recent.sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime());

            setOverdueExpenses(overdue);
            setUpcomingExpenses(upcoming.slice(0, 5));
            setRecentActivity(recent.slice(0, 8));
            setTotalIncome(incomeSum);
            setTotalExpense(expenseSum);
            setBalance(incomeSum - expenseSum);

            // Personal assets breakdown
            const pAssets: Record<string, Record<string, number>> = {};
            recent.forEach(item => {
                const curr = item.currency || 'TRY';
                const loc = item.location || 'Kasa';
                const amt = item.amount || 0;
                if (!pAssets[curr]) pAssets[curr] = {};
                if (!pAssets[curr][loc]) pAssets[curr][loc] = 0;
                if (item.type === 'income') pAssets[curr][loc] += amt;
                else pAssets[curr][loc] -= amt;
            });
            setPersonalAssets(pAssets);
        });

        // Fetch User and Family Info
        const unsubscribeUser = onSnapshot(doc(db, "users", activeUser.uid), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                const isOwner = activeUser.email === 'meoncu@gmail.com';
                setMyRole(isOwner ? 'admin' : (data.role || 'member'));
                setFamilyId(data.familyId || null);
            }
        });

        return () => {
            unsubscribe();
            unsubscribeUser();
        };
    }, [activeUser, rates]);

    useEffect(() => {
        if (!familyId) {
            setFamilyAssets({});
            setFamilyTotalBalance(0);
            return;
        }

        const qFamily = query(
            collection(db, "expenses"),
            where("familyId", "==", familyId),
            where("status", "==", "paid")
        );
        const unsubscribeFamily = onSnapshot(qFamily, (snapshot) => {
            const assets: Record<string, Record<string, number>> = {};
            snapshot.forEach((doc) => {
                const data = doc.data();
                const curr = data.currency || 'TRY';
                const loc = data.location || 'Kasa';
                const amount = data.amount || 0;
                if (!assets[curr]) assets[curr] = {};
                if (!assets[curr][loc]) assets[curr][loc] = 0;
                if (data.type === 'income') assets[curr][loc] += amount;
                else assets[curr][loc] -= amount;
            });
            setFamilyAssets(assets);

            let totalTL = 0;
            Object.entries(assets).forEach(([curr, locs]) => {
                const rate = rates[curr] || 1;
                const currencyTotal = Object.values(locs).reduce((a, b) => a + b, 0);
                totalTL += (currencyTotal * rate);
            });
            setFamilyTotalBalance(totalTL);
        });
        return () => unsubscribeFamily();
    }, [familyId, rates]);

    const handlePayExpense = async (expId: string) => {
        try {
            await updateDoc(doc(db, "expenses", expId), {
                status: 'paid',
                paidBy: user?.uid,
                paidByEmail: user?.displayName || user?.email,
                date: Timestamp.now()
            });
        } catch (error) {
            console.error("Payment error:", error);
        }
    };

    // Pending Members Effect
    useEffect(() => {
        if (!user || myRole !== 'admin' || !familyId) {
            setPendingMembers([]);
            return;
        }
        const qPending = query(
            collection(db, "users"),
            where("familyId", "==", familyId),
            where("isApproved", "==", false)
        );
        return onSnapshot(qPending, (snapshot) => {
            const p: any[] = [];
            snapshot.forEach(doc => p.push({ id: doc.id, ...doc.data() }));
            setPendingMembers(p);
        });
    }, [user, myRole, familyId]);

    // Auto-pay Effect
    // Auto-pay & Auto-collection Effect
    useEffect(() => {
        if (!user || myRole !== 'admin') return;
        const checkAutoPayments = async () => {
            const today = startOfDay(new Date());
            const q = query(
                collection(db, "expenses"),
                where("status", "==", "unpaid")
            );
            try {
                const querySnapshot = await getDocs(q);
                querySnapshot.forEach(async (docSnap) => {
                    const data = docSnap.data();
                    const isSalary = data.type === 'income' && data.name?.toLocaleLowerCase('tr-TR').includes('maaş');
                    const shouldAutoProcess = data.isAutoPay === true || isSalary;

                    if (!shouldAutoProcess) return;

                    const dueDate = data.dueDate?.seconds ? new Date(data.dueDate.seconds * 1000) : null;
                    if (dueDate && (isBefore(dueDate, today) || dueDate.getTime() === today.getTime())) {
                        await updateDoc(doc(db, "expenses", docSnap.id), {
                            status: 'paid',
                            paidBy: 'System (Auto)',
                            paidByEmail: data.type === 'income'
                                ? 'Otomatik Maaş/Gelir Tahsilatı'
                                : 'Otomatik Banka Ödemesi',
                            date: Timestamp.now()
                        });
                    }
                });
            } catch (err) {
                console.error("Auto-pay error:", err);
            }
        };
        checkAutoPayments();
    }, [user, myRole]);

    const handleApproveMember = async (targetUid: string) => {
        try { await updateDoc(doc(db, "users", targetUid), { isApproved: true }); } catch (err) { console.error(err); }
    };

    const handleRejectMember = async (targetUid: string) => {
        if (!confirm("Reddetmek istiyor musunuz?")) return;
        try { await updateDoc(doc(db, "users", targetUid), { familyId: null, isApproved: false }); } catch (err) { console.error(err); }
    };

    const handleUpdateName = async () => {
        if (!user || !newName.trim()) return;
        setLoading(true);
        try {
            await updateProfile(user, { displayName: newName });
            setIsEditing(false);
            window.location.reload();
        } catch (err) {
            console.error("Name update error:", err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-background text-foreground pb-24 font-sans transition-colors duration-300">
            <div className="p-6 pt-12">
                {/* Header */}
                <div className="flex justify-between items-center mb-8">
                    <div className="flex-1">
                        <h2 className="text-muted-foreground text-sm font-medium">Hoş geldiniz,</h2>
                        {isEditing ? (
                            <div className="flex items-center gap-2 mt-1 max-w-[250px]">
                                <Input value={newName} onChange={(e) => setNewName(e.target.value)} className="h-8 text-lg font-bold" autoFocus />
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600" onClick={handleUpdateName} disabled={loading}><Check size={18} /></Button>
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500" onClick={() => setIsEditing(false)}><X size={18} /></Button>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 group">
                                <h1 className="text-2xl font-bold tracking-tight truncate max-w-[250px]">{user?.displayName || user?.email || 'İsimsiz'}</h1>
                                <button onClick={() => { setNewName(user?.displayName || ""); setIsEditing(true); }} className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-muted-foreground hover:text-primary"><Edit2 size={16} /></button>
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-3">
                        {myRole === 'admin' && (
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => navigate('/debug')}
                                className="h-10 w-10 rounded-xl bg-orange-500/10 text-orange-600 hover:bg-orange-500/20 shadow-sm border border-orange-500/10"
                            >
                                <Bug size={20} />
                            </Button>
                        )}
                        <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center border border-primary/20 overflow-hidden shadow-sm">
                            {user?.photoURL ? <img src={user.photoURL} className="w-full h-full object-cover" /> : <span className="text-sm font-bold">{(user?.displayName || user?.email)?.[0]?.toUpperCase()}</span>}
                        </div>
                    </div>
                </div>


                {/* Compact Balance Card */}
                <Card
                    className="bg-primary text-primary-foreground border-none shadow-xl mb-6 relative overflow-hidden group hover:shadow-2xl transition-all duration-300 cursor-pointer"
                    onClick={() => navigate('/cashflow')}
                >
                    <div className="absolute -top-12 -right-12 p-4 opacity-5 group-hover:opacity-10 transition-opacity text-white pointer-events-none"><PieChart size={180} /></div>
                    <CardHeader className="p-5 pb-0">
                        <div className="flex justify-between items-start gap-4">
                            <div className="flex-1">
                                <p className="text-[10px] font-bold text-primary-foreground/60 uppercase tracking-widest mb-1">Kişisel Kasa</p>
                                <div className="text-3xl font-black text-white leading-none">₺{balance.toLocaleString('tr-TR')}</div>

                                {/* Quick Mini Stats */}
                                <div className="flex gap-4 mt-4">
                                    <div className="flex items-center gap-1.5 grayscale opacity-80">
                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                        <span className="text-[10px] font-bold">₺{totalIncome.toLocaleString('tr-TR')}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 grayscale opacity-80">
                                        <div className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                                        <span className="text-[10px] font-bold">₺{totalExpense.toLocaleString('tr-TR')}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-col items-end gap-2 max-w-[140px]">
                                {/* Minimalist Assets */}
                                {Object.entries(myRole === 'admin' ? familyAssets : personalAssets).map(([curr, locs]) => {
                                    const currencySymbol = CURRENCIES.find(c => c.code === curr)?.symbol || curr;
                                    const total = Object.values(locs).reduce((a, b) => a + b, 0);
                                    if (total === 0) return null;
                                    return (
                                        <div key={curr} className="flex flex-col items-end leading-tight border-r-2 border-white/10 pr-2 mr-1">
                                            <span className="text-sm font-black text-white">{currencySymbol}{total.toLocaleString('tr-TR')}</span>
                                            <div className="flex flex-wrap justify-end gap-1 opacity-60">
                                                {Object.entries(locs).filter(([_, a]) => a !== 0).map(([l, a]) => (
                                                    <span key={l} className="text-[7px] font-bold uppercase">{l[0]}:{a}</span>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}

                                {/* Integrated Family Link */}
                                {myRole === 'admin' && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); navigate('/family'); }}
                                        className="mt-1 flex items-center gap-1.5 px-2 py-1 bg-white/5 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-all text-[8px] font-black uppercase tracking-widest border border-white/5"
                                    >
                                        <Users size={8} /> Aile: ₺{familyTotalBalance.toLocaleString('tr-TR')}
                                    </button>
                                )}
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-5" />
                </Card>

                {/* Notifications */}
                {myRole === 'admin' && pendingMembers.length > 0 && (
                    <section className="mb-8 animate-in slide-in-from-top-4 duration-500">
                        <div className="flex items-center gap-2 mb-4 text-amber-600">
                            <Bell size={18} className="animate-bounce" /><h3 className="text-xs uppercase font-black tracking-widest">Onay Bekleyenler</h3>
                        </div>
                        <div className="space-y-3">
                            {pendingMembers.map(m => (
                                <Card key={m.id} className="border-amber-200 bg-amber-50/50 p-4 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center font-bold text-amber-700">{m.displayName?.[0] || 'U'}</div>
                                        <div><p className="font-bold text-sm leading-tight">{m.displayName || m.email}</p><p className="text-[10px] text-muted-foreground">Katılım isteği</p></div>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button size="icon" variant="ghost" className="h-8 w-8 text-rose-500" onClick={() => handleRejectMember(m.id)}><X size={18} /></Button>
                                        <Button size="sm" className="h-8 bg-emerald-600 text-[10px] font-black" onClick={() => handleApproveMember(m.id)}>ONAYLA</Button>
                                    </div>
                                </Card>
                            ))}
                        </div>
                    </section>
                )}

                {/* Upcoming */}
                {myRole === 'admin' && upcomingExpenses.length > 0 && (
                    <section className="mb-8">
                        <div className="flex items-center gap-2 mb-4"><Calendar size={18} className="text-primary" /><h3 className="text-xs uppercase font-black tracking-widest text-foreground/70">Yaklaşan Ödemeler</h3></div>
                        <div className="space-y-3">
                            {upcomingExpenses.map(exp => {
                                const diff = differenceInDays(exp.dueDate, startOfDay(new Date()));
                                return (
                                    <div key={exp.id} className="flex items-center justify-between p-4 rounded-xl bg-card border border-border group hover:border-primary/50 transition-all cursor-pointer" onClick={() => navigate(`/categories?id=${exp.categoryId}`)}>
                                        <div className="flex items-center gap-4">
                                            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center font-bold text-[9px] text-center leading-tight px-1 text-primary">{exp.categoryName || 'GRUP'}</div>
                                            <div><p className="font-bold text-sm">{exp.name}</p><p className="text-[10px] text-muted-foreground">{diff === 0 ? "Bugün" : `${diff} gün içinde`}</p></div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="font-black text-sm">{CURRENCIES.find(c => c.code === (exp.currency || 'TRY'))?.symbol || '₺'}{exp.amount?.toLocaleString('tr-TR')}</span>
                                            <Button size="sm" className="h-7 bg-emerald-600 text-[10px] font-black" onClick={(e) => { e.stopPropagation(); handlePayExpense(exp.id); }}>ÖDE</Button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                )}

                {/* Overdue */}
                {myRole === 'admin' && overdueExpenses.length > 0 && (
                    <section className="mb-8">
                        <div className="flex items-center gap-2 mb-4 text-rose-600"><AlertCircle size={18} /><h3 className="text-xs uppercase font-black tracking-widest">Geciken Ödemeler</h3></div>
                        <div className="space-y-3">
                            {overdueExpenses.map(exp => {
                                const diff = differenceInDays(startOfDay(new Date()), exp.dueDate);
                                return (
                                    <div key={exp.id} className="flex items-center justify-between p-4 rounded-xl bg-rose-500/5 border border-rose-500/20 group hover:bg-rose-500/10 transition-all cursor-pointer" onClick={() => navigate(`/categories?id=${exp.categoryId}`)}>
                                        <div className="flex items-center gap-4">
                                            <div className="h-10 w-10 rounded-xl bg-rose-500/10 flex items-center justify-center font-bold text-[9px] text-center leading-tight px-1 text-rose-600">{exp.categoryName || '!'}</div>
                                            <div><p className="font-bold text-sm text-rose-700">{exp.name}</p><p className="text-[10px] text-rose-600/70 font-bold">{diff} GÜN GECİKTİ</p></div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="font-black text-sm text-rose-700">{CURRENCIES.find(c => c.code === (exp.currency || 'TRY'))?.symbol || '₺'}{exp.amount?.toLocaleString('tr-TR')}</span>
                                            <Button size="sm" className="h-7 bg-rose-600 text-[10px] font-black" onClick={(e) => { e.stopPropagation(); handlePayExpense(exp.id); }}>ÖDE</Button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                )}

                {/* Recent Activity */}
                <section>
                    <h3 className="text-xs uppercase font-black tracking-widest text-foreground/50 mb-4">Son Hareketler</h3>
                    <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
                        {recentActivity.length > 0 ? (
                            recentActivity.map(exp => (
                                <div key={exp.id} className="flex justify-between items-center p-4 hover:bg-muted/50 transition-colors border-b border-border/40 last:border-0">
                                    <div className="flex items-center gap-3">
                                        <div className={cn("w-2 h-2 rounded-full", exp.type === 'income' ? "bg-emerald-500" : "bg-rose-500")} />
                                        <div><p className="font-bold text-sm">{exp.name}</p><p className="text-[10px] text-muted-foreground">{exp.date?.seconds ? format(new Date(exp.date.seconds * 1000), "d MMM", { locale: tr }) : '-'}</p></div>
                                    </div>
                                    <span className={cn("font-black text-sm tabular-nums", exp.type === 'income' ? "text-emerald-600" : "text-rose-600")}>
                                        {exp.type === 'income' ? '+' : '-'}{CURRENCIES.find(c => c.code === (exp.currency || 'TRY'))?.symbol || '₺'}{exp.amount?.toLocaleString('tr-TR')}
                                    </span>
                                </div>
                            ))
                        ) : (
                            <p className="text-sm text-muted-foreground text-center py-8 italic font-medium">Henüz bir hareket bulunmuyor.</p>
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
        </div>
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
